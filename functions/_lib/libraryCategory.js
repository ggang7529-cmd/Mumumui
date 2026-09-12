// 카카오 책 검색에는 장르/분류 정보가 없어서, 책 등록 시점에 국립중앙도서관이 운영하는
// "도서관 정보나루"(data4library.kr) 오픈API로 ISBN 기준 도서 상세를 조회해 KDC 분류명
// (class_nm, 예: "문학 > 한국문학 > 소설")을 받아온다.
//
// 이 파일은 functions/api/books/index.js(신규 등록 시 조회)와 functions/api/admin/
// library-status.js(키 진단) · functions/api/admin/backfill-categories.js(기존 책
// 소급 처리) 세 곳에서 함께 쓴다. fetchLibraryCategory()가 원래 유일한 진입점이었는데,
// 실패해도 빈 문자열만 돌려주는 "조용한" 버전이라 진단 화면에서는 왜 실패했는지(키가
// 없는지, ISBN 형식이 안 맞는지, API가 에러를 줬는지) 구분할 수 없었다. 그래서 실패
// 사유가 담긴 lookupLibraryCategory()를 아래에 두고, fetchLibraryCategory()는 그 위에
// 얇게 얹은 래퍼로 바꿨다.

// 카카오 책 검색이 주는 isbn은 "8936434594 9788936434595"처럼 isbn10과 isbn13이
// 공백으로 함께 온다. data4library는 13자리 isbn만 받으므로 그 부분만 뽑아 쓴다.
export function extractIsbn13(isbn) {
  var m = (isbn || "").match(/\b(\d{13})\b/);
  return m ? m[1] : null;
}

// 실제 API 호출 결과를 성공/실패 사유와 함께 돌려준다. 관리자 진단 라우트가 "키가
// 아예 없다" / "ISBN이 13자리 형태가 아니다" / "API가 200을 줬지만 키가 틀렸다는
// 에러 본문을 담고 있었다" / "그 책이 도서관 소장 목록에 없다"를 구분해 보여줄 수
// 있도록 reason을 남긴다.
export async function lookupLibraryCategory(env, isbn13) {
  if (!env.LIBRARY_API_KEY) return { ok: false, reason: "no-key" };
  if (!isbn13) return { ok: false, reason: "no-isbn13" };

  var url =
    "https://data4library.kr/api/srchDtlList" +
    "?authKey=" + encodeURIComponent(env.LIBRARY_API_KEY) +
    "&isbn13=" + encodeURIComponent(isbn13) + "&format=json";

  var res;
  try {
    res = await fetch(url);
  } catch (e) {
    return { ok: false, reason: "network-error", detail: String(e && e.message) };
  }
  if (!res.ok) return { ok: false, reason: "http-" + res.status };

  var data;
  try {
    data = await res.json();
  } catch (e) {
    return { ok: false, reason: "invalid-json" };
  }

  // 인증키가 틀렸거나 만료됐을 때 data4library는 HTTP 상태는 200으로 주면서 본문에
  // 에러 코드/메시지를 담는 경우가 있다. HTTP 상태만 보면 "성공"으로 착각하므로
  // 본문의 에러 필드도 따로 확인한다.
  if (data.response && data.response.error) {
    return { ok: false, reason: "api-error", detail: data.response.error };
  }

  var book = data.response && data.response.detail && data.response.detail.book;
  var classNm = book && book.class_nm ? String(book.class_nm).trim() : "";
  return { ok: true, found: !!book, classNm: classNm };
}

// 책 등록 경로에서 쓰는 조용한 버전. 분류는 필수 정보가 아니라서 실패 사유를 몰라도
// 되고, 실패하거나 결과가 없으면 그냥 빈 문자열로 분류 없이 진행한다.
export async function fetchLibraryCategory(env, isbn) {
  var result = await lookupLibraryCategory(env, extractIsbn13(isbn));
  return result.ok && result.classNm ? result.classNm : "";
}
