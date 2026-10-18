import { nicknameKey } from "../../js/pinRules.js";

// 닉네임 소유(4자리 PIN). 표 설명은 .internal/migrations/0009.
//
// 상태는 셋이다.
//   owned    PIN이 걸린 닉네임. 그 PIN을 맞춘 기기(토큰)만 이 이름으로 쓸 수 있다.
//   reserved 예전부터 쓰던 닉네임(기록이 있음). 아직 PIN이 없다 — A-2에서 주인이 PIN을 정한다.
//            지금(A-1)은 예전처럼 누구나 쓸 수 있게 둔다(RESERVED_OPEN).
//   free     처음 보는 닉네임. 쓰기 전에 PIN을 정해야 한다.
//
// PIN 원문은 저장하지도, 로그에 남기지도 않는다. PIN_PEPPER(Pages 비밀 환경변수, 코드·git에
// 없음)로 HMAC한 뒤 닉네임마다 다른 랜덤 salt로 PBKDF2를 돌린 값만 둔다. 4자리는 1만 가지뿐이라
// DB만 새어 나가면 반복 횟수와 상관없이 금방 풀린다 — 그래서 DB 밖에 둔 pepper가 실제 자물쇠다.
// 반복 횟수는 무료 요금제의 요청당 CPU 10ms 안에 들도록 잡았고, 행마다 pin_iter로 남겨 나중에
// 올려도 옛 해시를 그대로 확인할 수 있다.

export var PIN_ITERATIONS = 20000;
export var MAX_FAILS = 5;
// 잠길 때마다 길어진다: 15분 → 1시간 → 24시간(그 뒤로도 24시간).
var LOCK_STEPS_MS = [15 * 60 * 1000, 60 * 60 * 1000, 24 * 60 * 60 * 1000];
export var RESERVED_OPEN = true;

var CREATE = [
  "CREATE TABLE IF NOT EXISTS nicknames (nickname_key TEXT PRIMARY KEY, nickname TEXT NOT NULL, " +
    "status TEXT NOT NULL CHECK (status IN ('reserved', 'owned')), pin_hash TEXT, pin_salt TEXT, pin_iter INTEGER, " +
    "failed_count INTEGER NOT NULL DEFAULT 0, lock_level INTEGER NOT NULL DEFAULT 0, locked_until INTEGER, " +
    "created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS nickname_sessions (token_hash TEXT PRIMARY KEY, nickname_key TEXT NOT NULL, " +
    "device_id TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_nickname_sessions_key ON nickname_sessions (nickname_key)"
];

export async function ensureNicknameTables(env) {
  await env.DB.batch(CREATE.map(function (s) { return env.DB.prepare(s); }));
}

// pepper가 아직 등록되지 않았으면 기능 전체를 끈다(예전처럼 누구나 아무 닉네임). pepper 없이
// 해시를 만들면 나중에 pepper를 넣는 순간 그 PIN들이 전부 안 맞게 된다.
export function pinEnabled(env) {
  return !!(env && env.PIN_PEPPER);
}

export function cleanNickname(raw) {
  return String(raw || "").trim().slice(0, 10);
}

export function lockMsFor(level) {
  return LOCK_STEPS_MS[Math.min(Math.max(level, 1), LOCK_STEPS_MS.length) - 1];
}

function toHex(buf) {
  return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join("");
}

function fromHex(hex) {
  var out = new Uint8Array(hex.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function randomHex(bytes) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function hashPin(env, key, pin, saltHex, iterations) {
  var enc = new TextEncoder();
  var pepperKey = await crypto.subtle.importKey("raw", enc.encode(env.PIN_PEPPER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  var peppered = await crypto.subtle.sign("HMAC", pepperKey, enc.encode(key + "\n" + pin));
  var base = await crypto.subtle.importKey("raw", peppered, "PBKDF2", false, ["deriveBits"]);
  var bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: iterations },
    base,
    256
  );
  return toHex(bits);
}

// 길이가 같은 두 hex 문자열을 끝까지 다 비교한다(어디서 틀렸는지 시간으로 새지 않게).
export function sameHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function getNicknameRow(env, key) {
  try {
    return await env.DB.prepare("SELECT * FROM nicknames WHERE nickname_key = ?1").bind(key).first();
  } catch (e) {
    return null; // 표가 아직 없으면 아무 닉네임도 등록되지 않은 것
  }
}

// 표에 없어도 예전 기록(한줄평·책 등록·읽고 싶어요)에 쓰인 이름이면 reserved다. 그 기록에 적힌
// 표기를 같이 돌려줘서 "yosang"으로 쳐도 "Yosang"으로 저장되게 한다.
export async function findHistoryName(env, key) {
  var row = await env.DB.prepare(
    "SELECT author_name AS n FROM comments WHERE lower(trim(author_name)) = ?1 " +
    "UNION ALL SELECT owner_name FROM books WHERE lower(trim(owner_name)) = ?1 LIMIT 1"
  ).bind(key).first();
  if (row && row.n) return String(row.n).trim();
  try {
    var w = await env.DB.prepare("SELECT nickname AS n FROM wants WHERE lower(trim(nickname)) = ?1 LIMIT 1").bind(key).first();
    if (w && w.n) return String(w.n).trim();
  } catch (e) {}
  return "";
}

// 요청의 X-Nick-Token이 가리키는 닉네임 열쇠(없거나 틀리면 "").
export async function sessionKey(env, request) {
  var token = String(request.headers.get("X-Nick-Token") || "").trim();
  if (!token || token.length > 200) return "";
  try {
    var row = await env.DB.prepare("SELECT nickname_key FROM nickname_sessions WHERE token_hash = ?1")
      .bind(await sha256Hex(token)).first();
    return row ? row.nickname_key : "";
  } catch (e) {
    return "";
  }
}

export async function createSession(env, key, deviceId) {
  var token = randomHex(32);
  var now = Date.now();
  await env.DB.prepare(
    "INSERT INTO nickname_sessions (token_hash, nickname_key, device_id, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?4)"
  ).bind(await sha256Hex(token), key, deviceId || null, now).run();
  return token;
}

// 닉네임 하나의 상태. { status: 'free'|'reserved'|'owned', name: 저장될 표기, row }
export async function nicknameStatus(env, raw) {
  var name = cleanNickname(raw);
  var key = nicknameKey(name);
  if (!key) return { status: "none", name: "", key: "" };
  var row = await getNicknameRow(env, key);
  if (row) return { status: row.status, name: row.nickname, key: key, row: row };
  var history = await findHistoryName(env, key);
  if (history) return { status: "reserved", name: history, key: key };
  return { status: "free", name: name, key: key };
}

// 쓰기 요청에 실려 온 닉네임을 이 요청이 써도 되는지. 써도 되면 { name }(저장할 표기, 닉네임이
// 없으면 ""), 안 되면 { error, code, status }. code는 화면이 PIN 시트를 어떤 모드로 열지 고른다.
export async function resolveNickname(env, request, raw) {
  var name = cleanNickname(raw);
  if (!name) return { name: "" };
  if (!pinEnabled(env)) return { name: name };

  var info = await nicknameStatus(env, name);
  if (info.status === "owned") {
    if ((await sessionKey(env, request)) === info.key) return { name: info.name, key: info.key };
    return { error: "이미 있는 닉네임이에요. 비밀번호를 입력해 주세요", code: "pin_required", status: 401, name: info.name };
  }
  if (info.status === "reserved") {
    if (RESERVED_OPEN) return { name: info.name, key: info.key };
    return { error: "보호된 닉네임이에요. 내 닉네임이 맞다면 의견 보내기로 알려주세요", code: "reserved", status: 403, name: info.name };
  }
  return { error: "이 닉네임을 지킬 4자리 비밀번호를 정해주세요", code: "pin_setup", status: 401, name: info.name };
}

// 이 기기가 닉네임 없이 남긴 별점(최상위 행)과 읽고 싶어요에 이 닉네임을 붙인다. 이미 다른
// 닉네임이 붙은 기록은 건드리지 않는다 — 그건 그 이름으로 남긴 것이다.
export async function linkDeviceRecords(env, uid, name) {
  if (!uid || !name) return 0;
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
  return linked;
}

// 읽기(내 책장 합치기, 읽고 싶어요 "담김")에 쓰는 닉네임. 이 요청이 그 닉네임으로 쓸 수 있을
// 때만 돌려주고, 아니면 ""(이 기기 것만). 쓰기처럼 막지 않는 건 읽기는 기기 몫만으로도 되기
// 때문이다.
export async function nicknameForRead(env, request, raw) {
  var nick = await resolveNickname(env, request, raw);
  return nick.error ? "" : nick.name;
}
