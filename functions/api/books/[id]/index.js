import { json } from "../../../_lib/db.js";
import { checkRateLimit } from "../../../_lib/rateLimit.js";

export async function onRequestDelete(context) {
  var env = context.env;
  var id = context.params.id;

  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "삭제 권한이 없어요." }, { status: 403 });

  var book = await env.DB.prepare("SELECT id FROM books WHERE id = ?1").bind(id).first();
  if (!book) return json({ error: "존재하지 않는 책이에요." }, { status: 404 });

  await env.DB.batch([
    env.DB.prepare("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE book_id = ?1)").bind(id),
    env.DB.prepare("DELETE FROM comments WHERE book_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM books WHERE id = ?1").bind(id)
  ]);

  return json({ ok: true });
}
