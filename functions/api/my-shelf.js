import { getAnonUid } from "../_lib/identity.js";
import { json } from "../_lib/db.js";
import { checkRateLimit } from "../_lib/rateLimit.js";

// 내 책장 — 이 기기(X-Anon-Id)가 평가한 책과 읽고 싶은 책. 닉네임이 없어도 보인다.
//
// 평가한 책: 이 기기가 남긴 최상위 행(별점만 포함)의 책. 같은 책에 둘 남긴 옛 기록은 가장
// 최근 것의 별점을 쓴다(SQLite는 max()와 함께 고른 다른 열을 그 최댓값 행에서 가져온다).
// 읽고 싶은 책: wants 표. 표가 아직 없으면 빈 목록.
export async function onRequestGet(context) {
  var env = context.env;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ rated: [], wants: [] });

  var rated = (await env.DB.prepare(
    "SELECT b.id, b.title, b.author, b.cover, c.rating, max(c.created_at) AS at " +
    "FROM comments c JOIN books b ON b.id = c.book_id " +
    "WHERE c.author_uid = ?1 AND c.parent_id IS NULL GROUP BY c.book_id ORDER BY at DESC"
  ).bind(uid).all()).results || [];

  var wants = [];
  try {
    wants = (await env.DB.prepare(
      "SELECT b.id, b.title, b.author, b.cover, w.created_at AS at " +
      "FROM wants w JOIN books b ON b.id = w.book_id WHERE w.device_id = ?1 ORDER BY w.created_at DESC"
    ).bind(uid).all()).results || [];
  } catch (e) {}

  return json({ rated: rated, wants: wants });
}

// 닉네임을 정했을 때(또는 바꿨을 때) 이 기기가 닉네임 없이 남긴 별점·읽고 싶어요를 그
// 닉네임으로 잇는다. 점수는 닉네임으로 매번 다시 세므로(functions/_lib/scores.js) 잇는
// 순간 별점만 남긴 책마다 1점씩 붙는다. 이미 다른 닉네임이 붙은 기록은 건드리지 않는다 —
// 그건 그 이름으로 남긴 것이다.
export async function onRequestPost(context) {
  var env = context.env;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "잘못된 요청이에요." }, { status: 401 });

  var rateOk = await checkRateLimit(env, context.request, "link-nickname", 10, 60000);
  if (!rateOk) return json({ error: "잠시 후 다시 시도해주세요." }, { status: 429 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  var name = String(body.name || "").trim().slice(0, 10);
  if (!name) return json({ error: "닉네임을 입력해주세요." }, { status: 400 });

  var res = await env.DB.prepare(
    "UPDATE comments SET author_name = ?1 WHERE author_uid = ?2 AND parent_id IS NULL AND (author_name IS NULL OR author_name = '')"
  ).bind(name, uid).run();
  var linked = (res && res.meta && res.meta.changes) || 0;

  try {
    var w = await env.DB.prepare(
      "UPDATE wants SET nickname = ?1 WHERE device_id = ?2 AND (nickname IS NULL OR nickname = '')"
    ).bind(name, uid).run();
    linked += (w && w.meta && w.meta.changes) || 0;
  } catch (e) {}

  return json({ linked: linked });
}
