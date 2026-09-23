import { json } from "../../../_lib/db.js";
import { fetchScoreMap } from "../../../_lib/scores.js";

// 닉네임 한 명분의 기록을 한 번에 돌려준다 — 그 사람이 등록한 책, 남긴 한줄평, 요약 숫자.
//
// 로그인이 없는 사이트라 "누구"를 가리키는 값이 두 개인데(브라우저의 익명 uid, 닉네임),
// 여기서는 닉네임을 쓴다. 익명 uid는 브라우저를 지우거나 기기를 바꾸면 끊어져서 정작
// "내 기록"을 다시 못 찾고, 레벨 점수도 이미 닉네임 기준으로 묶여 있기 때문이다
// (functions/_lib/scores.js). 대신 같은 닉네임을 쓰는 사람이 둘이면 기록이 합쳐지는데,
// 그건 레벨 점수가 지금도 그렇게 동작하고 있어서 새로 생기는 문제는 아니다.
//
// 닉네임은 이미 모든 한줄평에 그대로 노출되는 공개 정보라 누구나 조회할 수 있게 둔다.
// author_uid/owner_uid는 다른 목록 API와 마찬가지로 절대 응답에 싣지 않는다.
// Pages Functions의 경로 파라미터는 URL 인코딩된 상태 그대로 들어온다(예: "둘다" →
// "%EB%91%98%EB%8B%A4"). 디코딩하기 전에 길이를 자르면 퍼센트 인코딩이 중간에서 잘려
// 아예 다른 문자열이 되므로, 반드시 디코딩을 먼저 하고 그다음에 자른다.
// 저장 때 10자로 자르므로(functions/api/books/index.js 등) 여기서도 같은 길이로 맞춘다.
function nicknameParam(raw) {
  var value = String(raw || "");
  try {
    value = decodeURIComponent(value);
  } catch (e) {
    // 잘못된 인코딩이면 원문 그대로 두고 아래에서 잘라낸다 — 어차피 일치하는 기록이 없다.
  }
  return value.trim().slice(0, 10);
}

export async function onRequestGet(context) {
  var env = context.env;
  var name = nicknameParam(context.params.name);
  if (!name) return json({ error: "닉네임이 없어요." }, { status: 400 });

  var results = await env.DB.batch([
    // 이 사람이 "처음 등록한" 책 = 서재
    env.DB.prepare(
      "SELECT id, title, author, cover, isbn, category, text, mood, rating_sum, rating_count, comment_count, created_at, updated_at " +
      "FROM books WHERE owner_name = ?1 ORDER BY created_at DESC"
    ).bind(name),
    // 이 사람이 남긴 한줄평(최상위 댓글). 어느 책에 남긴 건지 같이 보여줘야 의미가 있다.
    env.DB.prepare(
      "SELECT c.id, c.book_id, c.text, c.rating, c.mood, c.created_at, b.title AS book_title, b.author AS book_author, b.cover AS book_cover, " +
      "(SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS likes " +
      "FROM comments c JOIN books b ON b.id = c.book_id " +
      "WHERE c.author_name = ?1 AND c.parent_id IS NULL ORDER BY c.created_at DESC"
    ).bind(name),
    // 답글 수와 받은 좋아요는 요약 숫자에만 쓰므로 개수만 센다.
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM comments WHERE author_name = ?1 AND parent_id IS NOT NULL"
    ).bind(name),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM comment_likes cl JOIN comments c ON c.id = cl.comment_id WHERE c.author_name = ?1"
    ).bind(name)
  ]);

  var books = results[0].results || [];
  var reviews = results[1].results || [];
  var replyCount = (results[2].results && results[2].results[0] ? results[2].results[0].n : 0) || 0;
  var likesReceived = (results[3].results && results[3].results[0] ? results[3].results[0].n : 0) || 0;

  // 평균 별점은 "이 사람이 준 별점"의 평균이다. 책의 평균(rating_sum/rating_count)과는
  // 다른 값이라 한줄평 쪽에서 직접 계산한다.
  var ratingSum = 0;
  reviews.forEach(function (r) { ratingSum += r.rating || 0; });
  var avgRating = reviews.length ? Math.round((ratingSum / reviews.length) * 10) / 10 : null;

  var scoreMap = await fetchScoreMap(env);

  return json({
    nickname: name,
    score: scoreMap[name] || 0,
    // 기록이 하나도 없는 닉네임도 200으로 돌려준다 — 오타로 들어온 주소와 "아직 안 쓴
    // 사람"을 화면에서 굳이 구분할 필요가 없고, 빈 화면 안내 한 줄이면 충분하다.
    summary: {
      bookCount: books.length,
      reviewCount: reviews.length,
      replyCount: replyCount,
      likesReceived: likesReceived,
      avgRating: avgRating
    },
    books: books,
    reviews: reviews
  });
}
