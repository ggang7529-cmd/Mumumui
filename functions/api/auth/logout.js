import { clearSessionCookie } from "../../_lib/session.js";
import { json } from "../../_lib/db.js";

export async function onRequestPost() {
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
