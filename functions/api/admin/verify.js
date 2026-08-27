import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";

export async function onRequestPost(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var ok = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!ok) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });
  return json({ ok: true });
}
