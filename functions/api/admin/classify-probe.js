import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { extractIsbn13 } from "../../_lib/libraryCategory.js";

// 관리자 전용 조사 라우트. 도서관 정보나루(data4library)가 실제 등록된 책 대부분에서
// "소장 목록에 없음"으로 나와서(대출 기록 기반이라 신간·한정판·번역 경영서가 많이 빠진다),
// 분류 정보를 가져올 다른 출처를 찾는 중이다. 후보 둘을 같은 ISBN으로 동시에 찔러서
// 어느 쪽이 실제로 답을 주는지 비교한다.
//
//  - 국립중앙도서관 서지정보(SEOJI): ISBN 납본 등록 기반이라 국내 발행 도서는 거의 전부
//    등록돼 있을 것으로 기대. KDC(한국십진분류) 번호를 준다. SEOJI_API_KEY 필요.
//  - Google Books: 키 없이 호출 가능. categories 필드가 있지만 한국 책 커버리지가
//    들쭉날쭉하고 분류명이 영어로 온다.
//
// 응답에 raw(첫 번째 책의 원본 필드)를 포함하는 게 핵심이다 — 필드명을 문서가 아니라
// 실제 응답으로 확인하려는 게 이 라우트의 목적이라서, 추측으로 파서를 먼저 쓰지 않는다.
// 결론이 나면 이 라우트는 지운다.
var PROBE_LIMIT = 5;

function pickIsbns(url, dbRows) {
  var q = url.searchParams.get("isbn13");
  if (q) {
    return q.split(",").map(function (s) { return s.trim(); })
      .filter(function (s) { return /^\d{13}$/.test(s); })
      .slice(0, PROBE_LIMIT)
      .map(function (s) { return { isbn13: s, title: null }; });
  }
  return dbRows.map(function (r) {
    return { isbn13: extractIsbn13(r.isbn), title: r.title };
  }).filter(function (r) { return r.isbn13; });
}

async function probeSeoji(env, isbn13) {
  if (!env.SEOJI_API_KEY) return { configured: false };
  var url = "https://www.nl.go.kr/seoji/SearchApi.do" +
    "?cert_key=" + encodeURIComponent(env.SEOJI_API_KEY) +
    "&result_style=json&page_no=1&page_size=1&isbn=" + encodeURIComponent(isbn13);
  try {
    var res = await fetch(url);
    if (!res.ok) return { configured: true, ok: false, reason: "http-" + res.status };
    var text = await res.text();
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 인증키가 틀리면 JSON 대신 에러 HTML/XML을 돌려주는 경우가 있어, 그때 뭐가
      // 왔는지 알 수 있게 앞부분만 잘라 그대로 넘긴다.
      return { configured: true, ok: false, reason: "invalid-json", bodyHead: text.slice(0, 200) };
    }
    var doc = data.docs && data.docs[0];
    return {
      configured: true,
      ok: true,
      found: !!doc,
      kdc: doc ? doc.KDC : null,
      eaAddCode: doc ? doc.EA_ADD_CODE : null,
      subject: doc ? doc.SUBJECT : null,
      raw: doc || null
    };
  } catch (e) {
    return { configured: true, ok: false, reason: "network-error", detail: String(e && e.message) };
  }
}

async function probeGoogleBooks(isbn13) {
  var url = "https://www.googleapis.com/books/v1/volumes?q=isbn:" + encodeURIComponent(isbn13);
  try {
    var res = await fetch(url);
    if (!res.ok) return { ok: false, reason: "http-" + res.status };
    var data = await res.json();
    var info = data.items && data.items[0] && data.items[0].volumeInfo;
    return {
      ok: true,
      found: !!info,
      categories: info ? info.categories || null : null,
      title: info ? info.title : null,
      // description은 길어서 응답만 키우고 분류 판단에는 쓸모가 없어 뺀다. 대신 어떤
      // 필드들이 오는지는 이름만 남겨서 확인할 수 있게 한다.
      fieldNames: info ? Object.keys(info) : null
    };
  } catch (e) {
    return { ok: false, reason: "network-error", detail: String(e && e.message) };
  }
}

export async function onRequestGet(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  var url = new URL(context.request.url);

  // isbn13을 안 주면 "지금 실제로 분류가 비어 있는 책"을 대상으로 삼는다 — 임의의
  // 유명한 책이 아니라 우리가 실제로 못 채우고 있는 책으로 확인해야 의미가 있다.
  var rows = [];
  if (!url.searchParams.get("isbn13")) {
    var picked = await env.DB.prepare(
      "SELECT title, isbn FROM books WHERE isbn IS NOT NULL AND isbn != '' AND (category IS NULL OR category = '') " +
      "ORDER BY RANDOM() LIMIT ?1"
    ).bind(PROBE_LIMIT).all();
    rows = picked.results || [];
  }

  var targets = pickIsbns(url, rows);
  if (targets.length === 0) return json({ error: "조회할 ISBN이 없어요." }, { status: 400 });

  var results = [];
  for (var i = 0; i < targets.length; i++) {
    var seoji = await probeSeoji(env, targets[i].isbn13);
    var google = await probeGoogleBooks(targets[i].isbn13);
    // raw는 필드명 확인이 목적이라 첫 번째 책 것만 남긴다. 5권 전부 담으면 응답이
    // 쓸데없이 커지고, 필드 구조는 어차피 다 같다.
    if (i > 0 && seoji.raw) seoji.raw = undefined;
    if (i > 0 && google.fieldNames) google.fieldNames = undefined;
    results.push({
      title: targets[i].title,
      isbn13: targets[i].isbn13,
      seoji: seoji,
      googleBooks: google
    });
  }

  return json({ probed: results.length, results: results });
}
