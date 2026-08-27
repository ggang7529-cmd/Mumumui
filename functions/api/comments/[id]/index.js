import { getAnonUid } from "../../../_lib/identity.js";
import { json } from "../../../_lib/db.js";

export async function onRequestDelete(context) {
  var env = context.env;
  var id = context.params.id;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "권한이 없어요." }, { status: 401 });

  var comment = await env.DB.prepare("SELECT book_id, rating, author_uid FROM comments WHERE id = ?1").bind(id).first();
  if (!comment) return json({ error: "존재하지 않는 댓글이에요." }, { status: 404 });
  if (comment.author_uid !== uid) return json({ error: "삭제 권한이 없어요." }, { status: 403 });

  await env.DB.batch([
    env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM comments WHERE id = ?1").bind(id),
    env.DB.prepare(
      "UPDATE books SET rating_sum = rating_sum - ?1, rating_count = rating_count - 1, comment_count = comment_count - 1 WHERE id = ?2"
    ).bind(comment.rating, comment.book_id)
  ]);

  return json({ ok: true });
}
