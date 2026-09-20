import { kdcMainName } from "../../js/kdc.js";

// 카카오 책 검색에는 장르/분류 정보가 없어서, 책을 등록할 때 국립중앙도서관 "소장자료
// 검색" 오픈API로 분류를 받아온다.
//
// 여기까지 오기 전에 두 곳을 재보고 버렸다:
// - 도서관 정보나루(data4library.kr, srchDtlList): 25권 중 0권. 전국 도서관 "대출 기록"
//   기반이라 대출 이력이 없는 책은 아예 응답에 없었다.
// - 서지정보(SEOJI, 출간 전 CIP): 25권 중 7권(28%). 출판사가 납본 전에 신청하는 자료라
//   최근작·재출간본이 통째로 비어 있었다.
// - 소장자료 검색(여기): 25권 중 23권(92%). 도서관이 실제로 장서로 등록하면서 매기는
//   분류라 가장 잘 채워져 있었다.
//
// 조회는 두 단계다. 먼저 ISBN으로 찾고, 분류가 안 나오면 제목으로 한 번 더 찾는다.
// 92% 측정에서 못 찾은 2권이 "안나 카레니나 세트", "신곡 세트"처럼 낱권이 아닌 세트
// 상품이었기 때문이다. 세트는 판매용으로 묶은 상품이라 그 ISBN이 도서관 장서로 등록되는
// 일이 드물지만, 세트를 이루는 낱권("안나 카레니나")은 거의 반드시 등록돼 있다. 그래서
// 제목에서 "세트"·권차·판촉 문구를 걷어낸 앞 제목으로 다시 찾는다.
//
// 인증키는 서지정보와 같은 nl.go.kr 계정 키라서 기존 SEOJI_API_KEY를 그대로 쓴다.
// 분류는 없어도 되는 정보라, 키가 없거나 조회가 실패하면 조용히 분류 없이 진행한다.
var NL_SEARCH = "https://www.nl.go.kr/NL/search/openApi/search.do";
var TIMEOUT_MS = 6000;
// 제목 검색은 ISBN처럼 딱 떨어지지 않으므로 앞쪽 몇 건을 보고 제목이 맞는 것만 고른다.
var TITLE_CANDIDATES = 5;

// 카카오 책 검색이 주는 isbn은 "8936434594 9788936434595"처럼 isbn10과 isbn13이 공백으로
// 함께 온다. 조회에는 13자리만 쓰므로 그 부분만 뽑는다.
export function extractIsbn13(isbn) {
  var m = (isbn || "").match(/\b(\d{13})\b/);
  return m ? m[1] : null;
}

// 세트/권차/판촉 문구를 걷어내고 "앞 제목"만 남긴다.
//
//   "안나 카레니나 세트"                     → "안나 카레니나"
//   "미움받을 용기 1,2 세트"                 → "미움받을 용기"
//   "토지 (전 20권)"                         → "토지"
//   "…김 부장 이야기 합본호(30만부 기념…)"   → "…김 부장 이야기"
//
// 숫자만 남거나 너무 짧아지면(예: "1984") 손대지 않은 원래 제목을 그대로 돌려준다 —
// 제목 자체가 숫자인 책을 빈 문자열로 만들어 엉뚱한 검색을 하는 것보다 낫다.
export function baseTitle(title) {
  var t = String(title || "").trim();
  if (!t) return "";
  var original = t;

  // 괄호 안 문구는 대부분 판촉/판형 표시다: "(30만부 기념 한정판)", "[리커버]"
  t = t.replace(/[(\[（【][^)\]）】]*[)\]）】]/g, " ");
  // "세트"부터 뒤는 전부 버린다. "합본호"도 같은 성격이다.
  t = t.replace(/\s*(세트|합본호|박스\s*세트)\s*.*$/, " ");
  // 뒤에 붙은 권차를 걷어낸다: "전 20권", "3권", "1,2,3", "1~3", "1-3"
  //   여러 번 붙어 있을 수 있어(예: "토지 1,2 전 20권") 더 안 깎일 때까지 반복한다.
  for (var i = 0; i < 4; i++) {
    var before = t;
    t = t.replace(/\s*(전\s*)?\d+\s*(권|편|부)?\s*$/, " ");
    t = t.replace(/\s*\d+\s*([,·~\-–]\s*\d+\s*)+$/, " ");
    t = t.replace(/[\s,·~:;\-–—]+$/, "");
    if (t === before) break;
  }

  t = t.replace(/\s+/g, " ").trim();
  // 다 깎여 없어졌거나 한 글자만 남았으면 원래 제목을 쓴다.
  return t.length >= 2 ? t : original;
}

// 소장자료 검색의 titleInfo/authorInfo는 값만 오지 않는다. 검색어를 강조하는 태그가
// 섞여 오고("<span class=...>오리지널스</span>"), 앞머리에 자료 형태 표시가 붙기도
// 한다("[전자책] …"). 처음엔 이걸 모르고 글자만 비교해서, 세트가 아닌 평범한 제목까지
// 전부 불일치로 떨어졌다. 비교 전에 태그·엔티티·앞머리 대괄호를 걷어낸다.
function cleanField(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/^\s*(?:[\[【(（][^\]】)）]*[\]】)）]\s*)+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 비교용으로 공백·문장부호를 없앤다. 도서관 기록의 제목은 "안나 카레니나 = Anna Karenina"
// 처럼 원제나 부제가 붙어 오는 일이 많아서, 글자만 남겨놓고 겹치는지를 본다.
function squash(s) {
  return cleanField(s).toLowerCase().replace(/[\s·,~\-–—=:;.!?"'’“”()\[\]【】（）]/g, "");
}

// 응답 필드 이름이 문서마다 조금씩 다르게 적혀 있어서 후보를 순서대로 훑는다.
// 하나도 없으면 빈 문자열이고, 그 경우 제목 검증에 실패해 분류를 받아들이지 않는다
// (엉뚱한 책의 분류를 붙이느니 분류 없이 두는 편이 낫다).
function pick(doc, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = doc[keys[i]];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function docTitle(doc) { return cleanField(pick(doc, ["titleInfo", "title", "TITLE_INFO", "title_info"])); }
function docAuthor(doc) { return cleanField(pick(doc, ["authorInfo", "author", "AUTHOR_INFO", "author_info"])); }

// 분류값 뽑기. 드롭다운에 쓸 이름은 kdcCode1s(대분류 숫자)를 js/kdc.js의 표로 옮겨
// 만든다. 숫자가 없으면 classNo(상세 분류번호)의 첫 자리로 대신한다. kdcName1s를 그대로
// 쓰지 않는 이유는 js/kdc.js의 주석 참고.
function classOf(doc) {
  var classNo = String(doc.classNo || "").trim().slice(0, 40);
  return {
    categoryName: kdcMainName(doc.kdcCode1s) || kdcMainName(classNo),
    classNo: classNo
  };
}

async function searchNl(env, kwd) {
  var url = NL_SEARCH +
    "?key=" + encodeURIComponent(env.SEOJI_API_KEY) +
    "&apiType=json&srchTarget=total&kwd=" + encodeURIComponent(kwd);

  var res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    return { ok: false, reason: "network-error", detail: String(e && e.message).slice(0, 80) };
  }
  if (!res.ok) return { ok: false, reason: "http-" + res.status };

  var data;
  try {
    data = await res.json();
  } catch (e) {
    return { ok: false, reason: "invalid-json" };
  }
  return { ok: true, docs: (data && data.result) || [] };
}

// ISBN으로 찾는다. 성공/실패 사유를 함께 돌려줘서 소급 처리 라우트가 "키가 없다" /
// "ISBN이 13자리가 아니다" / "도서관 목록에 없다" / "찾았는데 분류가 비어 있다"를
// 구분해 보여줄 수 있게 한다.
export async function lookupBookClass(env, isbn13) {
  if (!env.SEOJI_API_KEY) return { ok: false, reason: "no-key" };
  if (!isbn13) return { ok: false, reason: "no-isbn13" };

  var found = await searchNl(env, isbn13);
  if (!found.ok) return found;

  var doc = found.docs[0];
  if (!doc) return { ok: false, reason: "not-found" };

  var cls = classOf(doc);
  return { ok: true, categoryName: cls.categoryName, classNo: cls.classNo };
}

// 앞 제목으로 찾는다. ISBN과 달리 아무 책이나 걸릴 수 있으므로, 찾은 기록의 제목이 우리
// 제목과 앞부분이 겹치는 것만 받아들인다. 저자까지 겹치면 그 건을 우선한다.
export async function lookupClassByTitle(env, title, author) {
  if (!env.SEOJI_API_KEY) return { ok: false, reason: "no-key" };

  var base = baseTitle(title);
  if (base.length < 2) return { ok: false, reason: "no-title" };

  var found = await searchNl(env, base);
  if (!found.ok) return found;

  var wantTitle = squash(base);
  var wantAuthor = squash(author);
  var best = null;
  var bestScore = 0;
  var sampleTitle = "";
  var keys = null;

  for (var i = 0; i < found.docs.length && i < TITLE_CANDIDATES; i++) {
    var doc = found.docs[i];
    if (!keys) keys = Object.keys(doc).slice(0, 14);
    var theirTitle = docTitle(doc);
    if (!sampleTitle) sampleTitle = theirTitle.slice(0, 60);

    var got = squash(theirTitle);
    if (!got) continue;

    // 우리 제목으로 "시작"하는 기록이 가장 믿을 만하다(부제·원제가 뒤에 붙는 형태).
    // 그게 없을 때만 제목이 어딘가 "포함"된 기록을 쓴다 — 도서관 기록이 "대활자본
    // 오리지널스"처럼 앞에 수식을 달고 있는 경우가 있어서다.
    var score = 0;
    if (got.indexOf(wantTitle) === 0) score = 2;
    else if (got.indexOf(wantTitle) !== -1) score = 1;
    if (!score) continue;

    var cls = classOf(doc);
    if (!cls.categoryName && !cls.classNo) continue;

    // 저자가 겹치면 같은 등급 안에서 우선한다. 도서관 기록의 저자는 "지은이: 레프
    // 톨스토이 ; 옮긴이: …"처럼 역할 표기가 섞여 있어 완전 일치를 기대할 수 없으니
    // 포함 여부만 본다. 번역서는 저자 표기가 크게 달라 저자가 안 겹쳐도 버리지 않는다.
    var theirAuthor = squash(docAuthor(doc));
    if (wantAuthor && theirAuthor && (theirAuthor.indexOf(wantAuthor) !== -1 || wantAuthor.indexOf(theirAuthor) !== -1)) {
      score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      best = { ok: true, matchedTitle: theirTitle, byTitle: true, categoryName: cls.categoryName, classNo: cls.classNo };
    }
  }

  if (best) return best;

  // 맞는 게 하나도 없을 때, 응답에 어떤 필드가 오는지와 실제 제목이 어떻게 생겼는지를
  // 남긴다 — 필드 이름이나 값 모양이 예상과 다르면 검증이 통째로 헛도는데, 그걸 눈으로
  // 확인할 방법이 필요하다.
  return {
    ok: false,
    reason: found.docs.length ? "title-mismatch" : "not-found",
    searched: base,
    docKeys: keys,
    // 불일치로 떨어졌을 때 도서관 기록의 제목이 실제로 어떻게 생겼는지 한 건 보여준다.
    // 필드 이름만 봐서는 "값이 왜 안 맞는지"를 알 수 없었다(태그가 섞여 오던 건이 그랬다).
    sampleTitle: sampleTitle
  };
}

// 책 등록 경로에서 쓰는 조용한 버전. ISBN으로 먼저 찾고, 분류가 안 나오면 앞 제목으로
// 한 번 더 찾는다. 실패하면 빈 값들만 돌려준다 — 분류는 필수가 아니라서 등록을 막지 않는다.
export async function fetchBookClass(env, isbn, title, author) {
  var byIsbn = await lookupBookClass(env, extractIsbn13(isbn));
  if (byIsbn.ok && (byIsbn.categoryName || byIsbn.classNo)) {
    return { categoryName: byIsbn.categoryName || "", classNo: byIsbn.classNo || "" };
  }

  var byTitle = await lookupClassByTitle(env, title, author);
  if (byTitle.ok) return { categoryName: byTitle.categoryName || "", classNo: byTitle.classNo || "" };

  return { categoryName: "", classNo: "" };
}
