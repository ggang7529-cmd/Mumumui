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

// 값이 긴 문자열 필드만 골라 길이와 앞머리를 돌려준다. 소개글·목차처럼 실제로 쓸 만한
// 필드가 어느 이름으로 오는지 응답을 보고 판단하기 위한 것이다.
function longTextFields(doc) {
  return Object.keys(doc)
    .filter(function (k) { return typeof doc[k] === "string" && doc[k].trim().length > 40; })
    .map(function (k) {
      var v = doc[k].trim();
      return { field: k, length: v.length, head: v.slice(0, 70) };
    })
    .sort(function (a, b) { return b.length - a.length; });
}

// 국립중앙도서관 계열 OpenAPI. 어느 주소·파라미터 조합이 맞는지 문서가 아니라 실제
// 응답으로 가린다 — 발급받은 키가 어느 서비스 것인지(서지정보인지 소장자료 검색인지)
// 확실하지 않고, 이 샌드박스에서는 nl.go.kr에 접근이 막혀 미리 확인할 수도 없어서다.
// 응답이 오는 조합이 확인되면 그것만 남기고 나머지는 지운다.
var NL_ENDPOINTS = [
  {
    name: "서지정보(seoji.nl.go.kr)",
    build: function (key, isbn13) {
      return "https://seoji.nl.go.kr/landingPage/SearchApi.do" +
        "?cert_key=" + encodeURIComponent(key) +
        "&result_style=json&page_no=1&page_size=1&isbn=" + encodeURIComponent(isbn13);
    }
  },
  {
    name: "서지정보(www.nl.go.kr 구주소)",
    build: function (key, isbn13) {
      return "https://www.nl.go.kr/seoji/SearchApi.do" +
        "?cert_key=" + encodeURIComponent(key) +
        "&result_style=json&page_no=1&page_size=1&isbn=" + encodeURIComponent(isbn13);
    }
  },
  {
    name: "소장자료 검색(NL/search)",
    build: function (key, isbn13) {
      return "https://www.nl.go.kr/NL/search/openApi/search.do" +
        "?key=" + encodeURIComponent(key) +
        "&apiType=json&srchTarget=total&kwd=" + encodeURIComponent(isbn13);
    }
  }
];

// 응답에서 책 한 권에 해당하는 객체를 찾아낸다. 서비스마다 감싸는 모양이 달라서
// 알려진 경로를 차례로 훑고, 못 찾으면 null을 준다(그때는 bodyHead로 눈으로 본다).
function firstDoc(data) {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.docs) && data.docs[0]) return data.docs[0];
  if (data.result && Array.isArray(data.result) && data.result[0]) return data.result[0];
  if (data.response && data.response.docs && data.response.docs[0]) return data.response.docs[0];
  return null;
}

async function probeNlApis(env, isbn13) {
  if (!env.SEOJI_API_KEY) return { configured: false };

  var attempts = [];
  for (var i = 0; i < NL_ENDPOINTS.length; i++) {
    var ep = NL_ENDPOINTS[i];
    var entry = { endpoint: ep.name };
    try {
      var res = await fetch(ep.build(env.SEOJI_API_KEY, isbn13));
      entry.status = res.status;
      entry.contentType = res.headers.get("content-type") || null;
      var text = await res.text();
      entry.bytes = text.length;
      var data = null;
      try {
        data = JSON.parse(text);
      } catch (e) {
        // 키가 틀리거나 주소가 다르면 JSON 대신 에러 HTML/XML이 온다. 눈으로 확인할 수
        // 있게 앞부분만 남긴다.
        entry.parsed = false;
        entry.bodyHead = text.slice(0, 220);
      }
      if (data) {
        entry.parsed = true;
        var doc = firstDoc(data);
        entry.found = !!doc;
        entry.longFields = doc ? longTextFields(doc) : null;
        entry.fieldNames = doc ? Object.keys(doc) : null;
        if (!doc) entry.bodyHead = text.slice(0, 220);
      }
    } catch (e) {
      entry.error = String(e && e.message);
    }
    attempts.push(entry);
  }
  return { configured: true, attempts: attempts };
}

// 도서관 정보나루(data4library). 운영 경로(functions/_lib/libraryCategory.js)는 분류
// (class_nm)만 뽑아 쓰고 나머지를 버리므로, 여기서는 같은 주소를 직접 불러 책 항목의
// 긴 글 필드를 전부 드러낸다 — 소개글을 주는지 보려는 것이다.
async function probeLibrary(env, isbn13) {
  if (!env.LIBRARY_API_KEY) return { configured: false };
  var url = "https://data4library.kr/api/srchDtlList" +
    "?authKey=" + encodeURIComponent(env.LIBRARY_API_KEY) +
    "&isbn13=" + encodeURIComponent(isbn13) + "&format=json";
  try {
    var res = await fetch(url);
    if (!res.ok) return { configured: true, ok: false, reason: "http-" + res.status };
    var data = await res.json();
    // 키가 틀려도 HTTP 200으로 오면서 본문에 에러를 담는 경우가 있다.
    if (data.response && data.response.error) {
      return { configured: true, ok: false, reason: "api-error", detail: data.response.error };
    }
    var book = data.response && data.response.detail && data.response.detail.book;
    return {
      configured: true,
      ok: true,
      found: !!book,
      classNm: book ? book.class_nm || null : null,
      longFields: book ? longTextFields(book) : null,
      fieldNames: book ? Object.keys(book) : null
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
      // 전문을 그대로 실으면 응답만 커지므로 길이와 앞머리만 남긴다. 카카오 발췌(약 260자)
      // 보다 긴 소개를 주는 출처를 찾는 게 목적이라 길이가 곧 답이다.
      descriptionLength: info && info.description ? info.description.length : 0,
      descriptionHead: info && info.description ? info.description.slice(0, 80) : null,
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

  // 어떤 이름의 환경변수가 실제로 이 배포본에 들어와 있는지 확인용. 값은 절대 싣지 않고
  // 있음/없음만 돌려준다. Pages는 변수를 추가해도 기존 배포본에는 적용되지 않아서(새로
  // 배포해야 반영된다) "넣었는데 안 잡힌다"가 자주 생기고, 이름을 잘못 적은 경우와
  // 구분이 안 돼서 둘 다 여기서 가려낸다.
  var envPresent = {};
  ["SEOJI_API_KEY", "NL_API_KEY", "SEOJI_KEY", "NL_OPENAPI_KEY",
   "LIBRARY_API_KEY", "KAKAO_REST_API_KEY", "ADMIN_KEY"].forEach(function (n) {
    envPresent[n] = !!env[n];
  });

  var results = [];
  for (var i = 0; i < targets.length; i++) {
    var seoji = await probeNlApis(env, targets[i].isbn13);
    var library = await probeLibrary(env, targets[i].isbn13);
    var google = await probeGoogleBooks(targets[i].isbn13);
    // raw는 필드명 확인이 목적이라 첫 번째 책 것만 남긴다. 5권 전부 담으면 응답이
    // 쓸데없이 커지고, 필드 구조는 어차피 다 같다.
    if (i > 0 && google.fieldNames) google.fieldNames = undefined;
    if (i > 0 && library.fieldNames) library.fieldNames = undefined;
    results.push({
      title: targets[i].title,
      isbn13: targets[i].isbn13,
      seoji: seoji,
      library: library,
      googleBooks: google
    });
  }

  return json({ probed: results.length, envPresent: envPresent, results: results });
}
