import { kdcMainName } from "../../js/kdc.js";

// 카카오 책 검색에는 장르/분류 정보가 없어서, 책을 등록할 때 국립중앙도서관 "소장자료
// 검색" 오픈API로 ISBN을 조회해 분류를 받아온다.
//
// 여기까지 오기 전에 두 곳을 재보고 버렸다:
// - 도서관 정보나루(data4library.kr, srchDtlList): 25권 중 0권. 전국 도서관 "대출 기록"
//   기반이라 대출 이력이 없는 책은 아예 응답에 없었다.
// - 서지정보(SEOJI, 출간 전 CIP): 25권 중 7권(28%). 출판사가 납본 전에 신청하는 자료라
//   최근작·재출간본이 통째로 비어 있었다.
// - 소장자료 검색(여기): 25권 중 23권(92%). 도서관이 실제로 장서로 등록하면서 매기는
//   분류라 가장 잘 채워져 있었다. 못 찾은 2권은 "안나 카레니나 세트", "신곡 세트"처럼
//   낱권이 아닌 세트 상품이었다.
//
// 인증키는 서지정보와 같은 nl.go.kr 계정 키라서 기존 SEOJI_API_KEY를 그대로 쓴다.
// 분류는 없어도 되는 정보라, 키가 없거나 조회가 실패하면 조용히 분류 없이 진행한다.
var NL_SEARCH = "https://www.nl.go.kr/NL/search/openApi/search.do";
var TIMEOUT_MS = 6000;

// 카카오 책 검색이 주는 isbn은 "8936434594 9788936434595"처럼 isbn10과 isbn13이 공백으로
// 함께 온다. 조회에는 13자리만 쓰므로 그 부분만 뽑는다.
export function extractIsbn13(isbn) {
  var m = (isbn || "").match(/\b(\d{13})\b/);
  return m ? m[1] : null;
}

// 실제 호출 결과를 성공/실패 사유와 함께 돌려준다. 소급 처리(backfill) 라우트가 "키가
// 없다" / "ISBN이 13자리가 아니다" / "도서관 목록에 그 책이 없다" / "분류만 비어 있다"를
// 구분해 보여줄 수 있도록 reason을 남긴다.
export async function lookupBookClass(env, isbn13) {
  if (!env.SEOJI_API_KEY) return { ok: false, reason: "no-key" };
  if (!isbn13) return { ok: false, reason: "no-isbn13" };

  var url = NL_SEARCH +
    "?key=" + encodeURIComponent(env.SEOJI_API_KEY) +
    "&apiType=json&srchTarget=total&kwd=" + encodeURIComponent(isbn13);

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

  var doc = data && data.result && data.result[0];
  if (!doc) return { ok: false, reason: "not-found" };

  // 드롭다운에 쓸 이름은 kdcCode1s(대분류 숫자)를 표로 옮겨 만든다. 숫자가 없으면
  // classNo(상세 분류번호)의 첫 자리로 대신하고, 그것마저 없으면 분류 없이 둔다.
  // kdcName1s를 그대로 쓰지 않는 이유는 js/kdc.js의 주석 참고.
  var classNo = String(doc.classNo || "").trim().slice(0, 40);
  var categoryName = kdcMainName(doc.kdcCode1s) || kdcMainName(classNo);

  return { ok: true, categoryName: categoryName, classNo: classNo || "" };
}

// 책 등록 경로에서 쓰는 조용한 버전. 실패하면 빈 값들만 돌려준다 — 분류는 필수가
// 아니라서 등록 자체를 막지 않는다.
export async function fetchBookClass(env, isbn) {
  var result = await lookupBookClass(env, extractIsbn13(isbn));
  if (!result.ok) return { categoryName: "", classNo: "" };
  return { categoryName: result.categoryName || "", classNo: result.classNo || "" };
}
