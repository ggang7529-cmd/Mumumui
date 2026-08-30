import { json } from "../../_lib/db.js";

// 홈 상단 "방금 등록됐어요" 하이라이트용. 책 등록 시에도 comments 테이블에 첫 리뷰가
// 함께 들어가므로(functions/api/books/index.js), 별점 있는 최상위 댓글만 최신순으로
// 뽑으면 "새로 등록된 책"과 "기존 책에 새로 달린 리뷰"가 자연히 한 목록에 섞여 나온다.
export async function onRequestGet(context) {
  var env = context.env;
  var rows = await env.DB.prepare(
    "SELECT c.id, c.book_id, c.text, c.rating, c.created_at, b.title, b.author " +
    "FROM comments c JOIN books b ON b.id = c.book_id " +
    "WHERE c.parent_id IS NULL ORDER BY c.created_at DESC LIMIT 5"
  ).all();
  return json({ comments: rows.results });
}
