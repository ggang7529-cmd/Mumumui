import { newId } from "./db.js";
import { rowHasLine, rowPoints } from "./lines.js";

// 이 기기(X-Anon-Id)가 이 책에 남긴 평가 하나. 같은 기기는 책당 하나만 갖는다 — 다시 누르면
// 고치고, 한 줄을 더 남겨도 새 행 대신 이 행을 채운다. 2026-10-09 이전에는 같은 책에 둘을
// 남길 수 있어서 그런 옛 기록(6건)은 가장 최근 것을 "내 평가"로 본다.
export async function findMyReview(env, bookId, uid) {
  if (!uid) return null;
  return await env.DB.prepare(
    "SELECT id, text, rating, mood, author_name, created_at FROM comments " +
    "WHERE book_id = ?1 AND author_uid = ?2 AND parent_id IS NULL ORDER BY created_at DESC LIMIT 1"
  ).bind(bookId, uid).first();
}

export async function countMyRatedBooks(env, uid) {
  if (!uid) return 0;
  var row = await env.DB.prepare(
    "SELECT count(DISTINCT book_id) AS n FROM comments WHERE author_uid = ?1 AND parent_id IS NULL"
  ).bind(uid).first();
  return (row && row.n) || 0;
}

// 평가를 만들거나 고친다. input의 각 값은 undefined면 "그대로 둠"이다 — 별을 다시 누르는
// 것만으로 예전에 쓴 한 줄이 지워지면 안 된다.
//   rating: 1~5, text: 문자열(60자로 다듬어 옴), mood: 태그 id 또는 null, name: 닉네임
// 실패하면 { error, status }를 돌려준다.
export async function upsertMyReview(env, bookId, uid, input) {
  var existing = await findMyReview(env, bookId, uid);

  var rating = input.rating !== undefined ? Number(input.rating) : (existing ? existing.rating : NaN);
  if (!(rating >= 1 && rating <= 5)) return { error: "별점을 선택해주세요.", status: 400 };

  var next = {
    rating: rating,
    text: input.text !== undefined ? input.text : (existing ? existing.text || "" : ""),
    mood: input.mood !== undefined ? input.mood : (existing ? existing.mood || null : null),
    author_name: input.name ? input.name : (existing ? existing.author_name || null : null)
  };
  // 태그나 한 줄은 남들에게 보이는 기록이라 닉네임이 있어야 한다. 별점만은 닉네임 없이도 된다.
  if (rowHasLine(next) && !next.author_name) return { error: "닉네임을 정해주세요.", status: 400 };

  var now = Date.now();
  var lineNow = rowHasLine(next) ? 1 : 0;
  var statements = [];
  var id;

  if (existing) {
    id = existing.id;
    var lineBefore = rowHasLine(existing) ? 1 : 0;
    statements.push(
      env.DB.prepare("UPDATE comments SET rating = ?1, text = ?2, mood = ?3, author_name = ?4 WHERE id = ?5")
        .bind(rating, next.text, next.mood, next.author_name, id)
    );
    // 한 줄이 새로 생겼으면 남들에게는 새 활동이다(홈 최신순·NEW). 별점만 고친 건 아니다.
    statements.push(
      env.DB.prepare(
        "UPDATE books SET rating_sum = rating_sum + ?1, comment_count = comment_count + ?2, " +
        "updated_at = CASE WHEN ?5 THEN ?4 ELSE updated_at END WHERE id = ?3"
      ).bind(rating - existing.rating, lineNow - lineBefore, bookId, now, lineNow > lineBefore ? 1 : 0)
    );
    // 책 등록 때 쓴 첫 한줄평은 books.text·mood에 복사돼 있다(링크 미리보기·RSS용). 그 행을
    // 고쳤으면 책 쪽도 맞춘다 — functions/api/comments/[id]/index.js의 수정과 같은 이유.
    var first = await env.DB.prepare(
      "SELECT id FROM comments WHERE book_id = ?1 AND parent_id IS NULL ORDER BY created_at ASC LIMIT 1"
    ).bind(bookId).first();
    if (first && first.id === id) {
      statements.push(env.DB.prepare("UPDATE books SET text = ?1, mood = ?2 WHERE id = ?3").bind(next.text, next.mood, bookId));
    }
  } else {
    id = newId();
    statements.push(
      env.DB.prepare(
        "INSERT INTO comments (id, book_id, text, rating, author_uid, author_name, author_photo, created_at, parent_id, mood) " +
        "VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, NULL, ?8)"
      ).bind(id, bookId, next.text, rating, uid, next.author_name, now, next.mood)
    );
    statements.push(
      env.DB.prepare(
        "UPDATE books SET rating_sum = rating_sum + ?1, rating_count = rating_count + 1, comment_count = comment_count + ?2, " +
        "updated_at = CASE WHEN ?2 THEN ?4 ELSE updated_at END WHERE id = ?3"
      ).bind(rating, lineNow, bookId, now)
    );
  }
  await env.DB.batch(statements);

  return {
    id: id,
    created: !existing,
    review: { id: id, rating: rating, text: next.text, mood: next.mood, name: next.author_name },
    points: rowPoints(next) - rowPoints(existing)
  };
}
