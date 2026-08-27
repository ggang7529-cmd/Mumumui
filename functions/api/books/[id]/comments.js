import { getAnonUid } from "../../../_lib/identity.js";
import { json, newId } from "../../../_lib/db.js";
import { checkRateLimit } from "../../../_lib/rateLimit.js";

export async function onRequestGet(context) {
  var env = context.env;
  var bookId = context.params.id;
  var myUid = getAnonUid(context.request) || "";

  var rows = await env.DB.prepare(
    "SELECT c.id, c.text, c.rating, c.author_uid, c.author_name, c.author_photo, c.created_at, c.parent_id, " +
    "(SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS likes, " +
    "(SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?2) AS liked_by_me " +
    "FROM comments c WHERE c.book_id = ?1 ORDER BY c.created_at ASC"
  ).bind(bookId, myUid).all();

  return json({ comments: rows.results });
}

export async function onRequestPost(context) {
  var env = context.env;
  var bookId = context.params.id;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "닉네임을 입력해주세요." }, { status: 401 });

  var rateOk = await checkRateLimit(env, context.request, "comment-create", 10, 60000);
  if (!rateOk) return json({ error: "너무 많이 작성했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  var text = String(body.text || "").replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  var name = String(body.name || "").trim().slice(0, 20);
  var parentId = body.parentId ? String(body.parentId).trim() : null;
  if (!name) return json({ error: "닉네임을 입력해주세요." }, { status: 400 });
  if (!text) return json({ error: "내용을 입력해주세요." }, { status: 400 });

  var book = await env.DB.prepare("SELECT id FROM books WHERE id = ?1").bind(bookId).first();
  if (!book) return json({ error: "존재하지 않는 책이에요." }, { status: 404 });

  // 답글(parentId 있음)은 별점이 없고 books.rating_sum/comment_count에도 반영하지 않는다 —
  // "리뷰순" 정렬은 한줄평(리뷰) 개수 기준이지 전체 댓글 활동량이 아니라서 그대로 둔다.
  var rating = 0;
  if (parentId) {
    var parent = await env.DB.prepare("SELECT id, book_id, parent_id FROM comments WHERE id = ?1").bind(parentId).first();
    if (!parent || parent.book_id !== bookId) return json({ error: "존재하지 않는 댓글이에요." }, { status: 404 });
    if (parent.parent_id) return json({ error: "답글에는 답글을 달 수 없어요." }, { status: 400 });
  } else {
    rating = Number(body.rating);
    if (!(rating >= 1 && rating <= 5)) return json({ error: "별점을 선택해주세요." }, { status: 400 });
  }

  var id = newId();
  var now = Date.now();
  var statements = [
    env.DB.prepare(
      "INSERT INTO comments (id, book_id, text, rating, author_uid, author_name, author_photo, created_at, parent_id) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8)"
    ).bind(id, bookId, text, rating, uid, name, now, parentId)
  ];
  if (!parentId) {
    statements.push(
      env.DB.prepare(
        "UPDATE books SET rating_sum = rating_sum + ?1, rating_count = rating_count + 1, comment_count = comment_count + 1, updated_at = ?3 WHERE id = ?2"
      ).bind(rating, bookId, now)
    );
  }
  await env.DB.batch(statements);

  return json({ id: id }, { status: 201 });
}
