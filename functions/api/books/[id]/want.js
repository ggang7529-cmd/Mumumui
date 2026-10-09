import { getAnonUid } from "../../../_lib/identity.js";
import { json } from "../../../_lib/db.js";
import { checkRateLimit } from "../../../_lib/rateLimit.js";
import { ensureWants, wantStatus } from "../../../_lib/wants.js";

// 읽고 싶어요 담기/빼기. { want: true|false } — 토글이 아니라 원하는 상태를 보낸다(두 번
// 빨리 눌러 요청 순서가 엇갈려도 마지막으로 누른 상태가 남게).
export async function onRequestPut(context) {
  var env = context.env;
  var bookId = context.params.id;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "잘못된 요청이에요." }, { status: 401 });

  var rateOk = await checkRateLimit(env, context.request, "want", 30, 60000);
  if (!rateOk) return json({ error: "너무 많이 눌렀어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  var book = await env.DB.prepare("SELECT id FROM books WHERE id = ?1").bind(bookId).first();
  if (!book) return json({ error: "존재하지 않는 책이에요." }, { status: 404 });

  await ensureWants(env);
  var name = String(body.name || "").trim().slice(0, 10);
  if (body.want) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO wants (book_id, device_id, nickname, created_at) VALUES (?1, ?2, ?3, ?4)"
    ).bind(bookId, uid, name || null, Date.now()).run();
  } else {
    // 빼기는 같은 닉네임으로 다른 기기에서 담은 것까지 — 내 책장은 닉네임으로 합쳐 보이므로,
    // 이 기기 것만 지우면 화면에서 안 빠진다.
    await env.DB.prepare(
      "DELETE FROM wants WHERE book_id = ?1 AND (device_id = ?2 OR (?3 != '' AND nickname = ?3))"
    ).bind(bookId, uid, name).run();
  }
  return json(await wantStatus(env, bookId, uid, name));
}
