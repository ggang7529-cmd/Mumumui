import { verifyGoogleIdToken, createSessionCookie } from "../../_lib/session.js";
import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";

export async function onRequestPost(context) {
  var env = context.env;

  var rateOk = await checkRateLimit(env, context.request, "auth-google", 10, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  if (!body || !body.credential) return json({ error: "credential이 없어요." }, { status: 400 });

  var user;
  try {
    user = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID);
  } catch (e) {
    return json({ error: "로그인 검증에 실패했어요: " + e.message }, { status: 401 });
  }

  await env.DB.prepare(
    "INSERT INTO users (id, name, picture) VALUES (?1, ?2, ?3) " +
    "ON CONFLICT(id) DO UPDATE SET name = excluded.name, picture = excluded.picture"
  ).bind(user.uid, user.name, user.picture).run();

  var cookie = await createSessionCookie(env.SESSION_SECRET, user);
  return json(
    { user: { uid: user.uid, name: user.name, picture: user.picture } },
    { status: 200, headers: { "Set-Cookie": cookie } }
  );
}
