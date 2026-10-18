import { json } from "../../_lib/db.js";
import { sha256Hex } from "../../_lib/nickname.js";

// 이 기기의 닉네임 세션을 끝낸다(닉네임 "변경"). 다른 기기의 세션은 그대로다.
export async function onRequestPost(context) {
  var token = String(context.request.headers.get("X-Nick-Token") || "").trim();
  if (token && token.length <= 200) {
    try {
      await context.env.DB.prepare("DELETE FROM nickname_sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
    } catch (e) {}
  }
  return json({ ok: true });
}
