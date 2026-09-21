import { json } from "../../_lib/db.js";
import { MIN_RATINGS_FOR_RECOMMEND } from "../../../js/recommendRules.js";

// /api/recommend/:닉네임 — 그 사람이 별점을 남긴 책들을 바탕으로 아직 안 본 책을 고른다.
//
// "누구"를 가리키는 값이 두 개인 사이트인데(브라우저의 익명 uid, 닉네임) 여기서는 프로필
// (functions/api/nickname/[name]/reviews.js)과 같은 이유로 닉네임을 쓴다 — 익명 uid는
// 브라우저를 지우거나 기기를 바꾸면 끊어져서 정작 "내 취향"을 다시 못 찾는다.
//
// 추천 근거로 쓰는 값은 세 가지고, 전부 books 테이블에 이미 들어 있다.
//   author    카카오 책 검색이 주는 저자 문자열
//   class_no  국립중앙도서관 KDC 상세 분류번호("813.7", "911.06")
//   category  같은 분류의 대분류 이름("문학", "역사")
// class_no가 가장 촘촘하고 category가 가장 성기다. 그래서 같은 저자 > 같은 세부분류 >
// 같은 중분류 > 같은 대분류 순으로 점수를 크게 준다.
//
// 읽는 데이터가 적어(책 한 권당 5개 컬럼) 전부 가져와 서버에서 점수를 매긴다. 책이 수천
// 권으로 늘면 후보를 SQL에서 1차로 걸러야 하지만(같은 저자/같은 class_no 앞자리), 지금
// 규모에서는 한 번의 조회가 더 단순하고 빠르다.

// 파라미터는 URL 인코딩된 상태 그대로 들어온다. 디코딩보다 먼저 자르면 퍼센트 인코딩이
// 중간에서 끊겨 다른 문자열이 되므로 반드시 디코딩을 먼저 한다(저장 때와 같은 10자).
function nicknameParam(raw) {
  var value = String(raw || "");
  try {
    value = decodeURIComponent(value);
  } catch (e) {
    // 잘못된 인코딩이면 원문 그대로 두고 자른다 — 어차피 일치하는 기록이 없다.
  }
  return value.trim().slice(0, 10);
}

// 한 번에 3권만 보여준다. 8권까지 내보내 봤더니 화면이 그냥 또 하나의 책 목록처럼 읽혀서,
// "고른 것"이라는 느낌이 나도록 줄였다.
var MAX_RESULTS = 3;

// 내가 준 별점이 그 책을 취향의 근거로 얼마나 믿을지를 정한다. 1~2점을 준 책은 "이런 건
// 싫었다"는 신호라 근거에서 거의 빼고, 5점은 그대로 다 쓴다.
var RATING_WEIGHT = { 5: 1, 4: 0.8, 3: 0.4, 2: 0.15, 1: 0.05 };

// 같은 짝(내 책 하나 ↔ 후보 하나)에서 분류 점수는 가장 가까운 단계 하나만 준다.
var SCORE_AUTHOR = 5;
var SCORE_SECTION = 3;    // class_no 앞 3자리("813") — 같은 나라 같은 갈래
var SCORE_DIVISION = 1.5; // class_no 앞 2자리("81")  — 같은 갈래
var SCORE_CATEGORY = 1;   // category 이름           — 같은 대분류

// class_no에서 숫자만 뽑는다. "911.06" → "91106", "한813.6" → "8136".
// 도서관 기록에 청구기호 접두사가 붙어 오는 경우가 있어 맨 앞 숫자 덩어리만 본다.
function classDigits(value) {
  var m = String(value || "").match(/\d[\d.]*/);
  return m ? m[0].replace(/\./g, "") : "";
}

function normalizeAuthor(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

// 저자 표기는 "레프 톨스토이"와 "레프 니콜라예비치 톨스토이"처럼 길이가 다를 수 있어
// 한쪽이 다른 쪽을 품고 있으면 같은 사람으로 본다. 두 글자 미만은 우연히 겹칠 수 있어 뺀다.
function sameAuthor(a, b) {
  if (!a || !b || a.length < 2 || b.length < 2) return false;
  return a === b || a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
}

export async function onRequestGet(context) {
  var env = context.env;
  var name = nicknameParam(context.params.name);
  if (!name) return json({ error: "닉네임이 없어요." }, { status: 400 });

  var results = await env.DB.batch([
    // 취향의 근거 = 이 사람이 별점을 남긴 책. 책을 등록하면 같은 사람 이름으로 첫 한줄평이
    // 함께 만들어지므로(functions/api/books/index.js) 등록한 책도 여기 포함된다.
    env.DB.prepare(
      "SELECT b.id, b.title, b.author, b.category, b.class_no, c.rating " +
      "FROM comments c JOIN books b ON b.id = c.book_id " +
      "WHERE c.author_name = ?1 AND c.parent_id IS NULL"
    ).bind(name),
    // 후보. 카드에 필요한 값만 가져온다(소개 본문은 카드에 안 쓰므로 뺀다).
    env.DB.prepare(
      "SELECT id, title, author, cover, isbn, category, class_no, text, mood, " +
      "rating_sum, rating_count, comment_count, owner_name, created_at, updated_at FROM books"
    ),
    // 별점 없이 등록만 된 책이 있을 수 있어(옛 데이터) 등록자 기준으로도 제외 목록을 만든다.
    env.DB.prepare("SELECT id FROM books WHERE owner_name = ?1").bind(name)
  ]);

  var seeds = results[0].results || [];
  var all = results[1].results || [];
  var owned = results[2].results || [];

  var seen = {};
  seeds.forEach(function (s) { seen[s.id] = true; });
  owned.forEach(function (b) { seen[b.id] = true; });

  // 근거가 모자라면 계산하지 않고 개수만 돌려준다. 화면이 "아직 몇 개 더 필요하다"와
  // "골랐는데 후보가 없다"를 다르게 안내해야 하므로 seedCount를 함께 내려준다.
  if (seeds.length < MIN_RATINGS_FOR_RECOMMEND) {
    return json({ nickname: name, seedCount: seeds.length, minRatings: MIN_RATINGS_FOR_RECOMMEND, books: [] });
  }

  // 근거 책들을 미리 다듬어 둔다(후보마다 다시 계산하지 않도록).
  var refs = seeds.map(function (s) {
    var digits = classDigits(s.class_no);
    return {
      weight: RATING_WEIGHT[s.rating] || 0.4,
      author: normalizeAuthor(s.author),
      authorLabel: s.author,
      section: digits.slice(0, 3),
      division: digits.slice(0, 2),
      category: (s.category || "").trim()
    };
  });

  var scored = [];
  for (var i = 0; i < all.length; i++) {
    var book = all[i];
    if (seen[book.id]) continue;

    var digits = classDigits(book.class_no);
    var section = digits.slice(0, 3);
    var division = digits.slice(0, 2);
    var category = (book.category || "").trim();
    var author = normalizeAuthor(book.author);

    var score = 0;
    var reason = null;
    var reasonRank = 0;
    var reasonDetail = "";

    for (var j = 0; j < refs.length; j++) {
      var ref = refs[j];
      var pair = 0;
      var rank = 0;
      var detail = "";

      if (sameAuthor(author, ref.author)) {
        pair += SCORE_AUTHOR;
        rank = 3;
        detail = book.author;
      }

      // 분류는 가장 가까운 단계 하나만 — 세부·중·대분류를 겹쳐 더하면 같은 사실을 세 번
      // 세는 셈이 된다.
      if (section && ref.section && section === ref.section) {
        pair += SCORE_SECTION;
        if (rank < 2) { rank = 2; detail = category || "비슷한 분류"; }
      } else if (division && ref.division && division === ref.division) {
        pair += SCORE_DIVISION;
        if (rank < 1) { rank = 1; detail = category || "비슷한 분류"; }
      } else if (category && ref.category && category === ref.category) {
        pair += SCORE_CATEGORY;
        if (rank < 1) { rank = 1; detail = category; }
      }

      if (pair <= 0) continue;
      score += pair * ref.weight;
      if (rank > reasonRank) {
        reasonRank = rank;
        reason = rank === 3 ? "같은 작가" : "비슷한 분류";
        reasonDetail = detail;
      }
    }

    // 근거가 하나도 안 걸린 책은 넣지 않는다 — 자리를 채우려고 아무 책이나 넣으면 추천이
    // 아니라 그냥 목록이 된다.
    if (score <= 0) continue;

    // 점수가 같을 때만 갈리는 아주 작은 가산점. 이미 여러 사람이 별점을 준 책을 앞에 둔다.
    var avg = book.rating_count ? book.rating_sum / book.rating_count : 0;
    score += avg * 0.05 + Math.min(book.comment_count || 0, 5) * 0.02;

    book.reason = reason;
    book.reasonDetail = reasonDetail;
    scored.push({ book: book, score: score });
  }

  scored.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return (b.book.updated_at || 0) - (a.book.updated_at || 0);
  });

  return json({
    nickname: name,
    seedCount: seeds.length,
    minRatings: MIN_RATINGS_FOR_RECOMMEND,
    books: scored.slice(0, MAX_RESULTS).map(function (row) { return row.book; })
  });
}
