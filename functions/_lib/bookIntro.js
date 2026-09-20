import { extractIsbn13 } from "./libraryCategory.js";

// 국립중앙도서관 서지정보(SEOJI)에서 책 소개 전문을 가져온다.
//
// 카카오 책 검색이 주는 contents는 약 260자짜리 발췌라 문장 중간에서 끊긴다("…고대
// 수메르"처럼 마침표도 없이). SEOJI는 같은 책의 소개 전문을 주는데(실측 1803자, 문장이
// 온전히 끝남), 본문을 응답에 바로 싣지 않고 텍스트 파일 주소만 알려주는 구조다.
// 그래서 요청이 두 번이다.
//
//   1) SearchApi.do?isbn=...  →  BOOK_INTRODUCTION_URL
//   2) 그 주소의 .txt         →  소개 전문
//
// 그 .txt는 EUC-KR로 인코딩돼 있다(UTF-8로 읽으면 깨진다). Cloudflare 런타임의
// TextDecoder가 "euc-kr" 라벨을 지원하는 것은 확인했다. 다만 앞으로 UTF-8로 올라오는
// 파일이 섞일 수 있어, UTF-8로 먼저 엄격하게 시도하고 실패할 때만 EUC-KR로 읽는다.
var SEOJI_URL = "https://www.nl.go.kr/seoji/SearchApi.do";

// 등록 흐름 안에서 부르는 값이라 오래 매달려 있으면 안 된다. 소개글은 없어도 그만인
// 정보라, 느리면 포기하는 쪽이 등록을 붙잡아두는 것보다 낫다.
var TIMEOUT_MS = 6000;

function fetchWithTimeout(url) {
  return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function decodeText(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (e) {
    return new TextDecoder("euc-kr").decode(buffer);
  }
}

// 실패 사유를 남겨서 관리자 진단 라우트가 "키 없음 / ISBN 형식 아님 / 이 책이 SEOJI에
// 없음 / 소개글 파일이 없음 / 받다가 실패"를 구분해 보여줄 수 있게 한다.
export async function lookupBookIntro(env, isbn) {
  if (!env.SEOJI_API_KEY) return { ok: false, reason: "no-key" };
  var isbn13 = extractIsbn13(isbn);
  if (!isbn13) return { ok: false, reason: "no-isbn13" };

  var url = SEOJI_URL +
    "?cert_key=" + encodeURIComponent(env.SEOJI_API_KEY) +
    "&result_style=json&page_no=1&page_size=1&isbn=" + encodeURIComponent(isbn13);

  var doc;
  try {
    var res = await fetchWithTimeout(url);
    if (!res.ok) return { ok: false, reason: "http-" + res.status };
    var text = await res.text();
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 인증키가 틀리면 JSON 대신 에러 문서가 온다.
      return { ok: false, reason: "invalid-json", detail: text.slice(0, 120) };
    }
    doc = data.docs && data.docs[0];
  } catch (e) {
    return { ok: false, reason: "network-error", detail: String(e && e.message) };
  }

  if (!doc) return { ok: false, reason: "not-in-seoji" };

  // SEOJI는 어느 책이든 39개 필드를 전부 돌려주고 값이 있는 것만 채운다. 소개가 담길 수
  // 있는 자리가 네 군데라(본문이 바로 오는 필드 둘, 파일 주소로 오는 필드 둘) 순서대로
  // 훑는다. 실측으로 확인한 것: 세 종교 이야기는 BOOK_INTRODUCTION_URL에만,
  // 사피엔스는 어디에도 없고 목차(BOOK_TB_CNT_URL)만 있었다.
  var inlineFields = ["BOOK_INTRODUCTION", "BOOK_SUMMARY"];
  for (var a = 0; a < inlineFields.length; a++) {
    var inline = String(doc[inlineFields[a]] || "").trim();
    if (inline.length > 40) {
      return { ok: true, intro: inline, source: inlineFields[a] };
    }
  }

  var urlFields = ["BOOK_INTRODUCTION_URL", "BOOK_SUMMARY_URL"];
  var introUrl = "";
  var usedField = null;
  for (var b = 0; b < urlFields.length; b++) {
    var cand = String(doc[urlFields[b]] || "").trim();
    if (cand) { introUrl = cand; usedField = urlFields[b]; break; }
  }
  // 목차만 있는 책이 흔한지 세어두면, 소개 대신 목차를 쓸지 판단할 근거가 된다.
  var hasToc = !!String(doc.BOOK_TB_CNT_URL || doc.BOOK_TB_CNT || "").trim();

  if (!introUrl) return { ok: false, reason: "no-intro-url", hasToc: hasToc };
  // 응답에 담긴 주소를 그대로 따라가는 것이라, 국립중앙도서관 도메인인지 확인하고 간다.
  if (!/^https?:\/\/([a-z0-9-]+\.)*nl\.go\.kr\//i.test(introUrl)) {
    return { ok: false, reason: "unexpected-host", detail: introUrl.slice(0, 80) };
  }

  try {
    var fileRes = await fetchWithTimeout(introUrl);
    if (!fileRes.ok) return { ok: false, reason: "intro-http-" + fileRes.status };
    var intro = decodeText(await fileRes.arrayBuffer()).trim();
    if (!intro) return { ok: false, reason: "empty-intro" };
    return { ok: true, intro: intro, introUrl: introUrl, source: usedField };
  } catch (e) {
    return { ok: false, reason: "intro-network-error", detail: String(e && e.message) };
  }
}
