import { json } from "../../_lib/db.js";
import { nicknameStatus, sessionKey, pinEnabled, deviceUsedName } from "../../_lib/nickname.js";
import { getAnonUid } from "../../_lib/identity.js";

// 이 닉네임으로 쓰려면 무엇이 필요한지. 화면은 글을 남기기 전에 이걸 보고 PIN 시트를 연다.
//   { enabled, status: 'free'|'reserved'|'owned', name, authed, claimable }
// authed: 이 기기(X-Nick-Token)가 이미 이 닉네임의 PIN을 맞췄는지.
// claimable: 예전 닉네임(reserved)을 이 기기가 쓴 적 있어서 PIN을 정할 수 있는지.
export async function onRequestGet(context) {
  var env = context.env;
  var raw = new URL(context.request.url).searchParams.get("name") || "";
  if (!pinEnabled(env)) return json({ enabled: false, status: "free", name: String(raw).trim().slice(0, 10), authed: true });

  var info = await nicknameStatus(env, raw);
  if (info.status === "none") return json({ error: "닉네임을 입력해주세요." }, { status: 400 });
  var authed = info.status === "owned" && (await sessionKey(env, context.request)) === info.key;
  var claimable = info.status === "reserved" && (await deviceUsedName(env, info.key, getAnonUid(context.request)));
  return json({ enabled: true, status: info.status, name: info.name, authed: authed, claimable: claimable });
}
