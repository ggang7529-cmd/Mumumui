// 일회성 백필 스크립트: category(분류)가 비어있는 기존 책들을 국립중앙도서관
// "도서관 정보나루"(data4library.kr) API로 ISBN 조회해서 채워 넣는다. 스키마
// 마이그레이션(.internal/migrations/0004_add_book_category.sql)이 운영 D1에 이미
// 적용되어 있어야 한다. 나중에 다시 실행해도 안전하다 — category가 이미 채워진 책은
// WHERE 조건에서 애초에 제외되므로 매번 "아직 비어있는 책"만 대상으로 한다. isbn이
// 없거나 도서관 소장 목록에 없는 책은 그냥 건너뛴다(필수 정보가 아님).
//
// 실행 방법:
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... D1_DATABASE_ID=... LIBRARY_API_KEY=... \
//     node .internal/scripts/backfill-book-category.mjs
//
// - CLOUDFLARE_ACCOUNT_ID: Cloudflare 대시보드 오른쪽 하단 계정 ID
// - D1_DATABASE_ID: D1 데이터베이스 상세 페이지에 표시되는 데이터베이스 ID (UUID)
// - CLOUDFLARE_API_TOKEN: "D1 편집" 권한을 가진 API 토큰 (내 프로필 > API 토큰 > 토큰 생성)
// - LIBRARY_API_KEY: Pages 환경 변수와 동일한 도서관 정보나루 authKey

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID = process.env.D1_DATABASE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const LIBRARY_KEY = process.env.LIBRARY_API_KEY;
const DELAY_MS = 700; // data4library API 호출 제한을 피하기 위한 요청 간 딜레이

if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN || !LIBRARY_KEY) {
  console.error(
    "필수 환경변수가 빠졌어요: CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CLOUDFLARE_API_TOKEN, LIBRARY_API_KEY"
  );
  process.exit(1);
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function runD1Query(sql, params) {
  var res = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT_ID + "/d1/database/" + DATABASE_ID + "/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + API_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sql: sql, params: params || [] })
    }
  );
  var data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error("D1 쿼리 실패: " + JSON.stringify(data.errors || data));
  }
  return data.result[0].results;
}

// DB의 isbn 컬럼은 카카오 검색 결과를 그대로 저장한 "ISBN10 ISBN13" 공백 구분 문자열이라,
// data4library가 요구하는 13자리 isbn만 뽑아 쓴다.
function cleanIsbn13(isbn) {
  if (!isbn) return "";
  var match = isbn.match(/\b(\d{13})\b/);
  return match ? match[1] : "";
}

async function fetchLibraryCategory(isbn13) {
  var url = "https://data4library.kr/api/srchDtlList" +
    "?authKey=" + encodeURIComponent(LIBRARY_KEY) +
    "&isbn13=" + encodeURIComponent(isbn13) + "&format=json";
  var res = await fetch(url);
  if (!res.ok) throw new Error("도서관 정보나루 API 응답 오류 (" + res.status + ")");
  var data = await res.json();
  var book = data.response && data.response.detail && data.response.detail.book;
  return (book && book.class_nm) ? book.class_nm.trim() : "";
}

async function main() {
  var books = await runD1Query("SELECT id, isbn, title FROM books WHERE category IS NULL OR category = ''");
  console.log("대상 책 " + books.length + "권 발견");

  var updated = 0;
  var skipped = 0;
  var failed = 0;

  for (var i = 0; i < books.length; i++) {
    var book = books[i];
    var isbn13 = cleanIsbn13(book.isbn);

    if (!isbn13) {
      skipped++;
      console.log("[" + (i + 1) + "/" + books.length + "] ISBN 없음, 건너뜀: " + book.title);
      continue;
    }

    try {
      var category = await fetchLibraryCategory(isbn13);
      if (category) {
        await runD1Query("UPDATE books SET category = ?1 WHERE id = ?2", [category.slice(0, 200), book.id]);
        updated++;
        console.log("[" + (i + 1) + "/" + books.length + "] 채움: " + book.title + " -> " + category);
      } else {
        skipped++;
        console.log("[" + (i + 1) + "/" + books.length + "] 도서관 소장 목록에 없음, 건너뜀: " + book.title);
      }
    } catch (e) {
      failed++;
      console.error("[" + (i + 1) + "/" + books.length + "] 실패: " + book.title + " - " + e.message);
    }
    await sleep(DELAY_MS);
  }

  console.log("완료. 채움 " + updated + "건 / 건너뜀 " + skipped + "건 / 실패 " + failed + "건");
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
