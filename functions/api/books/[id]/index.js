import { getSessionUser } from "../../../_lib/session.js";
import { json } from "../../../_lib/db.js";

export async function onRequestDelete(context) {
  var env = context.env;
  var id = context.params.id;
  var user = await getSessionUser(context.request, env.SESSION_SECRET);
  if (!user) return json({ error: "로그인이 필요해요." }, { status: 401 });

  var book = await env.DB.prepare("SELECT owner_uid FROM books WHERE id = ?1").bind(id).first();
  if (!book) return json({ error: "존재하지 않는 책이에요." }, { status: 404 });
  if (book.owner_uid !== user.uid) return json({ error: "삭제 권한이 없어요." }, { status: 403 });

  await env.DB.batch([
    env.DB.prepare("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE book_id = ?1)").bind(id),
    env.DB.prepare("DELETE FROM comments WHERE book_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM books WHERE id = ?1").bind(id)
  ]);

  return json({ ok: true });
}
