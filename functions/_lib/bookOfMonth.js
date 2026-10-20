import { hasLineSql } from "./lines.js";
import { colorSql } from "./commentColor.js";

// 이달의 책(.internal/migrations/0010). 관리자가 책·기간·질문을 정한다(functions/api/admin/
// book-of-month.js). 기간은 [starts_at, ends_at) 밀리초이고, 지금이 그 안이면 홈 카드에 뜬다 —
// 기간이 끝나면 따로 내릴 필요 없이 저절로 사라지고 "지난 이달의 책"으로 간다. 기간이 겹치면
// 더 늦게 시작한 쪽이 이번 달 책이다.
var CREATE = [
  "CREATE TABLE IF NOT EXISTS book_of_month (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, question TEXT NOT NULL, " +
    "starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_book_of_month_period ON book_of_month (starts_at, ends_at)"
];

export async function ensureBookOfMonth(env) {
  await env.DB.batch(CREATE.map(function (s) { return env.DB.prepare(s); }));
}

var KST_MS = 9 * 60 * 60 * 1000;

// "11월의 책" — 시작일(한국 시간)의 달.
export function bomLabel(startsAt) {
  return (new Date(startsAt + KST_MS).getUTCMonth() + 1) + "월의 책";
}

// "2026-11-01"(한국 시간 그날 0시) → 밀리초. 형식이 틀리면 NaN.
export function kstDayStart(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return NaN;
  return Date.parse(ymd + "T00:00:00+09:00");
}

var SELECT =
  "SELECT m.id, m.book_id, m.question, m.starts_at, m.ends_at, b.title, b.author, b.cover, " +
  // 이야기한 사람 = 기간 안에 이 책에 한 줄(본문이나 태그)을 남긴 사람. 닉네임, 없으면 기기 단위.
  "(SELECT count(DISTINCT coalesce(nullif(c.author_name, ''), c.author_uid)) FROM comments c " +
  "WHERE c.book_id = m.book_id AND c.parent_id IS NULL AND " + hasLineSql("c") + " " +
  "AND c.created_at >= m.starts_at AND c.created_at < m.ends_at) AS talkers " +
  "FROM book_of_month m JOIN books b ON b.id = m.book_id ";

function shape(r) {
  return {
    id: r.id, bookId: r.book_id, question: r.question, startsAt: r.starts_at, endsAt: r.ends_at,
    label: bomLabel(r.starts_at), title: r.title, author: r.author, cover: r.cover, talkers: r.talkers || 0
  };
}

// 지금 걸려 있는 이달의 책(없으면 null). 표가 아직 없어도 null.
export async function currentBookOfMonth(env, now) {
  try {
    var r = await env.DB.prepare(SELECT + "WHERE m.starts_at <= ?1 AND m.ends_at > ?1 ORDER BY m.starts_at DESC LIMIT 1")
      .bind(now).first();
    return r ? shape(r) : null;
  } catch (e) {
    return null;
  }
}

export async function pastBooksOfMonth(env, now) {
  try {
    var rows = (await env.DB.prepare(SELECT + "WHERE m.ends_at <= ?1 ORDER BY m.starts_at DESC LIMIT 60").bind(now).all()).results || [];
    return rows.map(shape);
  } catch (e) {
    return [];
  }
}

export async function allBooksOfMonth(env) {
  await ensureBookOfMonth(env);
  var rows = (await env.DB.prepare(SELECT + "ORDER BY m.starts_at DESC").all()).results || [];
  return rows.map(shape);
}

// 카드에 띄울 최근 한 줄 둘(답글 제외, 본문이나 태그가 있는 것). 기간과 상관없이 최근 것 —
// 이번 달에 아직 아무도 안 남겼어도 이 책이 어떤 책인지는 보여야 한다.
export async function latestLines(env, bookId, limit) {
  var rows = (await env.DB.prepare(
    "SELECT c.id, c.text, c.mood, c.rating, c.author_name, " + (await colorSql(env, "c")) + " AS color FROM comments c " +
    "WHERE c.book_id = ?1 AND c.parent_id IS NULL AND " + hasLineSql("c") + " ORDER BY c.created_at DESC LIMIT ?2"
  ).bind(bookId, limit).all()).results || [];
  return rows.map(function (c) {
    return { id: c.id, text: c.text || "", mood: c.mood || null, rating: c.rating, name: c.author_name || "", color: c.color || null };
  });
}
