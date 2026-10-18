import { json } from "../../_lib/db.js";
import { getAnonUid } from "../../_lib/identity.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { isPinFormat, isWeakPin } from "../../../js/pinRules.js";
import {
  ensureNicknameTables, pinEnabled, nicknameStatus, hashPin, sameHex, randomHex, createSession,
  linkDeviceRecords, lockMsFor, PIN_ITERATIONS, MAX_FAILS
} from "../../_lib/nickname.js";

// 닉네임 PIN 정하기/확인. { name, pin, intent: 'setup'|'enter' }
//   setup: 처음 보는 닉네임에 PIN을 걸고 내 것으로 만든다.
//   enter: PIN이 걸린 닉네임에 이 기기를 들인다.
// 성공하면 { token, name } — token은 이 기기의 localStorage에만 두고 다음부터 X-Nick-Token으로
// 보낸다. 들어오는 순간 이 기기가 닉네임 없이 남긴 별점·읽고 싶어요를 그 닉네임에 붙인다.
//
// intent가 실제 상태와 다르면(새 닉네임인 줄 알았는데 방금 누가 가져갔다 등) 틀린 횟수에
// 넣지 않고 code로 알려서 화면이 모드를 바꾸게 한다.
//
// PIN 원문은 hashPin에 넘기는 것 말고는 어디에도 쓰지 않는다(로그 금지).
export async function onRequestPost(context) {
  var env = context.env;
  var request = context.request;
  if (!pinEnabled(env)) return json({ error: "닉네임 보호 기능을 준비 중이에요." }, { status: 503 });

  var uid = getAnonUid(request);
  if (!uid) return json({ error: "잘못된 요청이에요." }, { status: 401 });

  // 4자리는 1만 가지라 닉네임별 잠금만으로는 닉네임을 바꿔가며 두드리는 걸 못 막는다. IP마다
  // 시간당 20번까지(맞춘 것 포함).
  var rateOk = await checkRateLimit(env, request, "nickname-pin", 20, 60 * 60 * 1000);
  if (!rateOk) return json({ error: "잠시 후 다시 시도해 주세요", code: "locked" }, { status: 429 });

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  var pin = String(body.pin || "");
  var intent = body.intent === "setup" ? "setup" : "enter";
  if (!isPinFormat(pin)) return json({ error: "숫자 4자리를 입력해 주세요", code: "format" }, { status: 400 });

  await ensureNicknameTables(env);
  var info = await nicknameStatus(env, body.name);
  if (info.status === "none") return json({ error: "닉네임을 입력해주세요." }, { status: 400 });
  var now = Date.now();

  if (info.status === "reserved") {
    // 예전부터 쓰던 닉네임 — 주인 확인(A-2) 전에는 PIN을 걸 수 없다.
    return json({ error: "예전부터 쓰던 닉네임이에요.", code: "reserved", name: info.name }, { status: 409 });
  }

  if (info.status === "free") {
    if (intent !== "setup") return json({ error: "처음 쓰는 닉네임이에요. 비밀번호를 정해주세요", code: "free", name: info.name }, { status: 409 });
    if (isWeakPin(pin)) return json({ error: "조금 더 어려운 번호로 정해주세요", code: "weak" }, { status: 400 });
    var salt = randomHex(16);
    var hash = await hashPin(env, info.key, pin, salt, PIN_ITERATIONS);
    var ins = await env.DB.prepare(
      "INSERT INTO nicknames (nickname_key, nickname, status, pin_hash, pin_salt, pin_iter, failed_count, lock_level, " +
      "locked_until, created_at, updated_at) VALUES (?1, ?2, 'owned', ?3, ?4, ?5, 0, 0, NULL, ?6, ?6) " +
      "ON CONFLICT(nickname_key) DO NOTHING"
    ).bind(info.key, info.name, hash, salt, PIN_ITERATIONS, now).run();
    if (!(ins && ins.meta && ins.meta.changes)) {
      // 그 사이 누가 먼저 가져갔다.
      return json({ error: "이미 있는 닉네임이에요. 비밀번호를 입력해 주세요", code: "taken", name: info.name }, { status: 409 });
    }
    return await welcome(env, info, uid);
  }

  // owned
  var row = info.row;
  if (intent === "setup") {
    return json({ error: "이미 있는 닉네임이에요. 비밀번호를 입력해 주세요", code: "taken", name: info.name }, { status: 409 });
  }
  if (row.locked_until && row.locked_until > now) {
    return json({ error: "잠시 후 다시 시도해 주세요", code: "locked", until: row.locked_until }, { status: 429 });
  }

  var tried = await hashPin(env, info.key, pin, row.pin_salt, row.pin_iter || PIN_ITERATIONS);
  if (sameHex(tried, row.pin_hash)) {
    await env.DB.prepare(
      "UPDATE nicknames SET failed_count = 0, lock_level = 0, locked_until = NULL, updated_at = ?2 WHERE nickname_key = ?1"
    ).bind(info.key, now).run();
    return await welcome(env, info, uid);
  }

  // 잠금이 풀린 뒤라면 새로 센다(lock_level은 남아서 다음 잠금이 길어진다).
  var fails = (row.locked_until && row.locked_until <= now ? 0 : row.failed_count || 0) + 1;
  if (fails >= MAX_FAILS) {
    var level = (row.lock_level || 0) + 1;
    var until = now + lockMsFor(level);
    await env.DB.prepare(
      "UPDATE nicknames SET failed_count = 0, lock_level = ?2, locked_until = ?3, updated_at = ?4 WHERE nickname_key = ?1"
    ).bind(info.key, level, until, now).run();
    return json({ error: "잠시 후 다시 시도해 주세요", code: "locked", until: until }, { status: 429 });
  }
  await env.DB.prepare(
    "UPDATE nicknames SET failed_count = ?2, locked_until = NULL, updated_at = ?3 WHERE nickname_key = ?1"
  ).bind(info.key, fails, now).run();
  return json({ error: "비밀번호가 맞지 않아요", code: "wrong", left: MAX_FAILS - fails }, { status: 401 });
}

async function welcome(env, info, uid) {
  var token = await createSession(env, info.key, uid);
  var linked = await linkDeviceRecords(env, uid, info.name);
  return json({ token: token, name: info.name, linked: linked });
}
