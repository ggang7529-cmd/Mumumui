import { getAnonUid } from "../../../_lib/identity.js";
import { json } from "../../../_lib/db.js";

export async function onRequestPost(context) {
  var env = context.env;
  var id = context.params.id;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "권한이 없어요." }, { status: 401 });

  var comment = await env.DB.prepare("SELECT id FROM comments WHERE id = ?1").bind(id).first();
  if (!comment) return json({ error: "존재하지 않는 댓글이에요." }, { status: 404 });

  var existing = await env.DB.prepare(
    "SELECT 1 FROM comment_likes WHERE comment_id = ?1 AND user_id = ?2"
  ).bind(id, uid).first();

  if (existing) {
    await env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ?1 AND user_id = ?2").bind(id, uid).run();
  } else {
    await env.DB.prepare("INSERT INTO comment_likes (comment_id, user_id) VALUES (?1, ?2)").bind(id, uid).run();
  }

  var count = await env.DB.prepare("SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id = ?1").bind(id).first();
  return json({ likes: count.n, likedByMe: !existing });
}
