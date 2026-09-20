import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { extractIsbn13 } from "../../_lib/libraryCategory.js";

// 관리자 전용. 국립중앙도서관 서지정보(SEOJI)가 책 분류(KDC)를 몇 %나 주는지 잰다.
//
// 지금 분류는 도서관 정보나루에서 가져오는데 대출 기록 기반이라 대부분의 책이 "소장
// 목록에 없음"으로 빠졌고, 그래서 분류 기능이 사실상 죽어 있다. 소개글을 찾느라 SEOJI를
// 찔러보다가 20권 중 19권을 찾아내는 걸 봤다(ISBN 납본 등록 기반이라 국내 유통 도서는
// 거의 다 있다). 소개글은 출판사가 CIP로 따로 넣어야 해서 15%였지만, KDC는 납본 때
// 도서관이 직접 부여하므로 훨씬 높을 것으로 보고 실제로 센다.
//
// 요청이 책당 한 번뿐이라(소개글과 달리 파일을 또 받을 필요가 없다) 소개글 측정보다 빠르다.
var SEOJI_URL = "https://www.nl.go.kr/seoji/SearchApi.do";

// KDC 첫 자리 = 대분류. 필터 드롭다운에는 이 열 가지면 충분하고, 정보나루가 주던
// "문학 > 한국문학 > 소설" 같은 전체 경로보다 오히려 훑어보기 좋다.
var KDC_TOP = {
  "0": "총류", "1": "철학", "2": "종교", "3": "사회과학", "4": "자연과학",
  "5": "기술과학", "6": "예술", "7": "언어", "8": "문학", "9": "역사"
};

function kdcTopName(kdc) {
  var v = String(kdc || "").trim();
  if (!v) return null;
  return KDC_TOP[v.charAt(0)] || null;
}

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
    "SELECT title, isbn, category FROM books WHERE isbn IS NOT NULL AND isbn != '' ORDER BY RANDOM() LIMIT ?1"
  ).bind(limit).all();
  var rows = picked.results || [];

  var items = [];
  var withKdc = 0;
  var notFound = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var isbn13 = extractIsbn13(r.isbn);
    var entry = { title: r.title, current: r.category || null, kdc: null, top: null, reason: null };
    if (!isbn13) {
      entry.reason = "no-isbn13";
      items.push(entry);
      continue;
    }
    try {
      var res = await fetch(SEOJI_URL +
        "?cert_key=" + encodeURIComponent(env.SEOJI_API_KEY) +
        "&result_style=json&page_no=1&page_size=1&isbn=" + encodeURIComponent(isbn13),
        { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        entry.reason = "http-" + res.status;
      } else {
        var data = await res.json();
        var doc = data.docs && data.docs[0];
        if (!doc) {
          entry.reason = "not-in-seoji";
          notFound++;
        } else {
          entry.kdc = String(doc.KDC || "").trim() || null;
          entry.ddc = String(doc.DDC || "").trim() || null;
          entry.subject = String(doc.SUBJECT || "").trim() || null;
          entry.top = kdcTopName(entry.kdc);
          if (entry.kdc) withKdc++;
          else entry.reason = "no-kdc";
        }
      }
    } catch (e) {
      entry.reason = "error:" + String(e && e.message).slice(0, 40);
    }
    items.push(entry);
  }

  var haveCategoryNow = items.filter(function (it) { return it.current; }).length;
  return json({
    checked: items.length,
    withKdc: withKdc,
    notInSeoji: notFound,
    haveCategoryNow: haveCategoryNow,
    items: items
  });
}
