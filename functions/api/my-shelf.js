import { getAnonUid } from "../_lib/identity.js";
import { json } from "../_lib/db.js";
import { checkRateLimit } from "../_lib/rateLimit.js";
import { resolveNickname, nicknameForRead, linkDeviceRecords } from "../_lib/nickname.js";

// 내 책장 — 이 기기(X-Anon-Id)가 평가한 책과 읽고 싶은 책. 닉네임이 없어도 보인다.
// ?name=닉네임을 주면 그 닉네임으로 남긴 것(다른 폰·PC에서 남긴 것)까지 합친다 — 책마다
// 하나로, 평가는 가장 최근 별점으로.
//
// 평가한 책: 이 기기가 남긴 최상위 행(별점만 포함)의 책. 같은 책에 둘 남긴 옛 기록은 가장
// 최근 것의 별점을 쓴다(SQLite는 max()와 함께 고른 다른 열을 그 최댓값 행에서 가져온다).
// 읽고 싶은 책: wants 표. 표가 아직 없으면 빈 목록.
export async function onRequestGet(context) {
  var env = context.env;
  var uid = getAnonUid(context.request) || "";
  // 닉네임으로 합쳐 보는 건 그 닉네임의 PIN을 맞춘 기기만(아니면 이 기기 것만).
  var name = await nicknameForRead(env, context.request, new URL(context.request.url).searchParams.get("name"));
  if (!uid && !name) return json({ rated: [], wants: [] });

  var rated = (await env.DB.prepare(
    "SELECT b.id, b.title, b.author, b.cover, c.rating, max(c.created_at) AS at " +
    "FROM comments c JOIN books b ON b.id = c.book_id " +
    "WHERE c.parent_id IS NULL AND (c.author_uid = ?1 OR (?2 != '' AND c.author_name = ?2)) " +
    "GROUP BY c.book_id ORDER BY at DESC"
  ).bind(uid, name).all()).results || [];

  var wants = [];
  try {
    wants = (await env.DB.prepare(
      "SELECT b.id, b.title, b.author, b.cover, max(w.created_at) AS at " +
      "FROM wants w JOIN books b ON b.id = w.book_id " +
      "WHERE (w.device_id = ?1 OR (?2 != '' AND w.nickname = ?2)) " +
      // 이미 평가한 책은 읽은 책이라 뺀다(평가할 때 지우지만, 그 전에 남은 기록·다른 기기 몫까지).
      "AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.book_id = w.book_id AND c.parent_id IS NULL " +
      "AND (c.author_uid = ?1 OR (?2 != '' AND c.author_name = ?2))) " +
      "GROUP BY w.book_id ORDER BY at DESC"
    ).bind(uid, name).all()).results || [];
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
  var nick = await resolveNickname(env, context.request, body.name);
  if (nick.error) return json({ error: nick.error, code: nick.code, name: nick.name }, { status: nick.status });
  if (!nick.name) return json({ error: "닉네임을 입력해주세요." }, { status: 400 });

  return json({ linked: await linkDeviceRecords(env, uid, nick.name) });
}
