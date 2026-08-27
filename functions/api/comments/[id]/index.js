import { getAnonUid } from "../../../_lib/identity.js";
import { json } from "../../../_lib/db.js";

export async function onRequestDelete(context) {
  var env = context.env;
  var id = context.params.id;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "권한이 없어요." }, { status: 401 });

  var comment = await env.DB.prepare("SELECT book_id, rating, author_uid, parent_id FROM comments WHERE id = ?1").bind(id).first();
  if (!comment) return json({ error: "존재하지 않는 댓글이에요." }, { status: 404 });
  if (comment.author_uid !== uid) return json({ error: "삭제 권한이 없어요." }, { status: 403 });

  var statements;
  if (comment.parent_id) {
    // 답글은 books 집계에 반영된 적이 없으니 자기 자신만 지우면 된다.
    statements = [
      env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ?1").bind(id),
      env.DB.prepare("DELETE FROM comments WHERE id = ?1").bind(id)
    ];
  } else {
    statements = [
      env.DB.prepare("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE id = ?1 OR parent_id = ?1)").bind(id),
      env.DB.prepare("DELETE FROM comments WHERE parent_id = ?1").bind(id),
      env.DB.prepare("DELETE FROM comments WHERE id = ?1").bind(id),
      env.DB.prepare(
        "UPDATE books SET rating_sum = rating_sum - ?1, rating_count = rating_count - 1, comment_count = comment_count - 1 WHERE id = ?2"
      ).bind(comment.rating, comment.book_id)
    ];
  }

  await env.DB.batch(statements);

  return json({ ok: true });
}
