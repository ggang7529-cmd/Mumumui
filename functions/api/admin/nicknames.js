import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { isPinFormat, isWeakPin, nicknameKey } from "../../../js/pinRules.js";
import {
  ensureNicknameTables, syncReservedNicknames, pinEnabled, hashPin, randomHex, cleanNickname, PIN_ITERATIONS
} from "../../_lib/nickname.js";

// 관리자: 닉네임 목록과 PIN 관리(화면은 js/main.js openAdminNicknames). X-Admin-Key 필요.
//
// GET  → { nicknames: [{ name, status, posts, lastAt, locked, lockedUntil, failed, devices }] }
//        예전 기록의 닉네임을 먼저 reserved로 모두 넣고(syncReservedNicknames) 보여준다.
// POST { action, name, pin? }
//   set_pin  PIN을 정해 owned로(주인이 의견 보내기로 알려왔을 때). 이미 들어와 있던 기기는 내보낸다.
//   reset_pin PIN을 지우고 reserved로 되돌린다. 그 이름으로 기록을 남긴 기기가 다시 정할 수 있다.
//   unlock   잠금과 틀린 횟수를 지운다.
//   release  보호 해제 — 표에서 지우고 누구나 새로 쓸 수 있게 한다.
// PIN 원문은 hashPin에만 넘기고 어디에도 남기지 않는다.
async function guard(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });
  var ok = await checkRateLimit(env, context.request, "admin-nicknames", 30, 60000);
  if (!ok) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });
  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "권한이 없어요." }, { status: 403 });
  return null;
}

export async function onRequestGet(context) {
  var denied = await guard(context);
  if (denied) return denied;
  var env = context.env;
  await syncReservedNicknames(env);

  var rows = (await env.DB.prepare(
    "SELECT n.nickname_key AS k, n.nickname AS name, n.status, n.failed_count AS failed, n.locked_until AS lockedUntil, " +
    "(SELECT count(*) FROM nickname_sessions s WHERE s.nickname_key = n.nickname_key) AS devices " +
    "FROM nicknames n"
  ).all()).results || [];

  // 글 수 = 그 이름으로 남긴 comments 행(한줄평·답글·별점만 포함), 마지막 = 가장 최근 것.
  var posts = {};
  ((await env.DB.prepare(
    "SELECT lower(trim(author_name)) AS k, count(*) AS n, max(created_at) AS last FROM comments " +
    "WHERE trim(coalesce(author_name, '')) != '' GROUP BY lower(trim(author_name))"
  ).all()).results || []).forEach(function (r) { posts[r.k] = r; });

  var now = Date.now();
  var list = rows.map(function (r) {
    var p = posts[r.k] || {};
    return {
      name: r.name,
      status: r.status,
      posts: p.n || 0,
      lastAt: p.last || null,
      locked: !!(r.lockedUntil && r.lockedUntil > now),
      lockedUntil: r.lockedUntil || null,
      failed: r.failed || 0,
      devices: r.devices || 0
    };
  });
  list.sort(function (a, b) { return (b.lastAt || 0) - (a.lastAt || 0) || a.name.localeCompare(b.name); });
  return json({ nicknames: list, pinEnabled: pinEnabled(env) });
}

export async function onRequestPost(context) {
  var denied = await guard(context);
  if (denied) return denied;
  var env = context.env;

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  var name = cleanNickname(body.name);
  var key = nicknameKey(name);
  if (!key) return json({ error: "닉네임을 입력해주세요." }, { status: 400 });
  await ensureNicknameTables(env);
  var now = Date.now();
  var row = await env.DB.prepare("SELECT nickname FROM nicknames WHERE nickname_key = ?1").bind(key).first();
  var dropSessions = env.DB.prepare("DELETE FROM nickname_sessions WHERE nickname_key = ?1").bind(key);

  if (body.action === "set_pin") {
    if (!pinEnabled(env)) return json({ error: "PIN_PEPPER가 등록되지 않았어요." }, { status: 503 });
    var pin = String(body.pin || "");
    if (!isPinFormat(pin)) return json({ error: "숫자 4자리를 입력해 주세요" }, { status: 400 });
    if (isWeakPin(pin)) return json({ error: "조금 더 어려운 번호로 정해주세요" }, { status: 400 });
    var salt = randomHex(16);
    var hash = await hashPin(env, key, pin, salt, PIN_ITERATIONS);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO nicknames (nickname_key, nickname, status, pin_hash, pin_salt, pin_iter, failed_count, lock_level, " +
        "locked_until, created_at, updated_at) VALUES (?1, ?2, 'owned', ?3, ?4, ?5, 0, 0, NULL, ?6, ?6) " +
        "ON CONFLICT(nickname_key) DO UPDATE SET status = 'owned', pin_hash = ?3, pin_salt = ?4, pin_iter = ?5, " +
        "failed_count = 0, lock_level = 0, locked_until = NULL, updated_at = ?6"
      ).bind(key, row ? row.nickname : name, hash, salt, PIN_ITERATIONS, now),
      env.DB.prepare("DELETE FROM nickname_released WHERE nickname_key = ?1").bind(key),
      dropSessions
    ]);
    return json({ ok: true });
  }

  if (!row) return json({ error: "등록되지 않은 닉네임이에요." }, { status: 404 });

  if (body.action === "reset_pin") {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE nicknames SET status = 'reserved', pin_hash = NULL, pin_salt = NULL, pin_iter = NULL, " +
        "failed_count = 0, lock_level = 0, locked_until = NULL, updated_at = ?2 WHERE nickname_key = ?1"
      ).bind(key, now),
      dropSessions
    ]);
    return json({ ok: true });
  }
  if (body.action === "unlock") {
    await env.DB.prepare(
      "UPDATE nicknames SET failed_count = 0, lock_level = 0, locked_until = NULL, updated_at = ?2 WHERE nickname_key = ?1"
    ).bind(key, now).run();
    return json({ ok: true });
  }
  if (body.action === "release") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM nicknames WHERE nickname_key = ?1").bind(key),
      env.DB.prepare(
        "INSERT INTO nickname_released (nickname_key, released_at) VALUES (?1, ?2) " +
        "ON CONFLICT(nickname_key) DO UPDATE SET released_at = ?2"
      ).bind(key, now),
      dropSessions
    ]);
    return json({ ok: true });
  }
  return json({ error: "알 수 없는 작업이에요." }, { status: 400 });
}
