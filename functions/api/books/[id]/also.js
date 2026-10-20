import { json } from "../../../_lib/db.js";

// "이 책을 꽂은 사람이 함께 꽂은 책"(리디자인 B안 제안 ②). 이 책에 평가(별점만 포함)를 남긴
// 사람들이 다른 어떤 책에 평가를 남겼는지 세어, 겹치는 사람이 많은 책부터 셋. 사람은 닉네임,
// 없으면 기기(author_uid) 단위 — "N명이 읽고 싶어해요"와 같은 기준이다. author_uid는 비교에만
// 쓰고 응답에는 싣지 않는다.
//
// 책 수·기록 수가 수백 단위라 식으로 묶는 자기 조인도 가볍다. 겹치는 사람이 없으면 빈 목록이고,
// 화면은 그때 칸째 숨긴다(아무 책이나 채우면 "함께 꽂은"이 거짓말이 된다).
var PERSON = "coalesce(nullif(trim(%.author_name), ''), %.author_uid)";
function person(alias) { return PERSON.replace(/%/g, alias); }

export async function onRequestGet(context) {
  var env = context.env;
  var bookId = context.params.id;
  var rows = (await env.DB.prepare(
    "SELECT b.id, b.title, b.author, b.cover, b.comment_count, count(DISTINCT " + person("c2") + ") AS shared " +
    "FROM comments c1 JOIN comments c2 ON " + person("c1") + " = " + person("c2") + " " +
    "JOIN books b ON b.id = c2.book_id " +
    "WHERE c1.book_id = ?1 AND c1.parent_id IS NULL AND c2.parent_id IS NULL AND c2.book_id != ?1 " +
    "GROUP BY b.id ORDER BY shared DESC, max(c2.created_at) DESC LIMIT 3"
  ).bind(bookId).all()).results || [];
  return json({
    books: rows.map(function (r) {
      return { id: r.id, title: r.title, author: r.author, cover: r.cover, commentCount: r.comment_count || 0, shared: r.shared };
    })
  });
}
