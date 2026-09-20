import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { extractIsbn13 } from "../../_lib/libraryCategory.js";

// 관리자 전용. 국립중앙도서관 "소장자료 검색"이 책 분류를 몇 %나 실제로 채워주는지 잰다.
//
// 앞서 두 번 같은 함정에 빠졌다 — 필드 이름이 응답에 있다고 값이 차 있는 건 아니다.
// SEOJI는 39개 필드를 항상 돌려주지만 KDC가 실제로 담긴 건 28%뿐이었고, 정보나루는 0%였다.
// 그래서 여기서는 필드 존재가 아니라 값을 직접 센다.
//
// 이 API는 CIP(출간 전 등록)가 아니라 실제 소장 목록이라, SEOJI에 KDC가 없던 최근작
// 세 권도 모두 찾아냈다. 분류는 도서관이 장서로 등록하면서 부여하므로 여기가 더 채워져
// 있을 것으로 보고 확인한다.
var NL_SEARCH = "https://www.nl.go.kr/NL/search/openApi/search.do";

export async function onRequestGet(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });
  if (!env.SEOJI_API_KEY) return json({ error: "SEOJI_API_KEY가 설정되지 않았어요." }, { status: 400 });

  var url = new URL(context.request.url);
  var limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "25", 10) || 25, 1), 40);

  var picked = await env.DB.prepare(
    "SELECT title, isbn FROM books WHERE isbn IS NOT NULL AND isbn != '' ORDER BY RANDOM() LIMIT ?1"
  ).bind(limit).all();
  var rows = picked.results || [];

  var items = [];
  var withName = 0;
  var withClassNo = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var isbn13 = extractIsbn13(r.isbn);
    var entry = { title: r.title, kdcName: null, kdcCode: null, classNo: null, reason: null };
    if (!isbn13) { entry.reason = "no-isbn13"; items.push(entry); continue; }
    try {
      var res = await fetch(NL_SEARCH +
        "?key=" + encodeURIComponent(env.SEOJI_API_KEY) +
        "&apiType=json&srchTarget=total&kwd=" + encodeURIComponent(isbn13),
        { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        entry.reason = "http-" + res.status;
      } else {
        var data = await res.json();
        var doc = data.result && data.result[0];
        if (!doc) {
          entry.reason = "not-found";
        } else {
          entry.kdcName = String(doc.kdcName1s || "").trim() || null;
          entry.kdcCode = String(doc.kdcCode1s || "").trim() || null;
          entry.classNo = String(doc.classNo || "").trim() || null;
          entry.callNo = String(doc.callNo || "").trim() || null;
          if (entry.kdcName) withName++;
          if (entry.classNo) withClassNo++;
          if (!entry.kdcName && !entry.classNo) entry.reason = "no-class-value";
        }
      }
    } catch (e) {
      entry.reason = "error:" + String(e && e.message).slice(0, 40);
    }
    items.push(entry);
  }

  return json({
    checked: items.length,
    withKdcName: withName,
    withClassNo: withClassNo,
    items: items
  });
}
