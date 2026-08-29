import { getAnonUid } from "../../../_lib/identity.js";
import { json } from "../../../_lib/db.js";
import { checkRateLimit } from "../../../_lib/rateLimit.js";

export async function onRequestDelete(context) {
  var env = context.env;
  var id = context.params.id;
  var uid = getAnonUid(context.request);

  var comment = await env.DB.prepare("SELECT book_id, rating, author_uid, parent_id FROM comments WHERE id = ?1").bind(id).first();
  if (!comment) return json({ error: "존재하지 않는 댓글이에요." }, { status: 404 });

  var isOwner = !!uid && comment.author_uid === uid;
  var isAdmin = false;
  if (!isOwner) {
    var adminKey = context.request.headers.get("X-Admin-Key") || "";
    if (env.ADMIN_KEY && adminKey) {
      var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
      if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });
      isAdmin = adminKey === env.ADMIN_KEY;
    }
  }
  if (!isOwner && !isAdmin) return json({ error: "삭제 권한이 없어요." }, { status: uid ? 403 : 401 });

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
