import { json, newId } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { ensureBookOfMonth, allBooksOfMonth, kstDayStart } from "../../_lib/bookOfMonth.js";

// 관리자: 이달의 책 지정·목록·삭제. X-Admin-Key 필요.
//   GET                                   전체(지난 것·지금·앞으로) 목록
//   POST { bookId, question, start, end } start/end는 "YYYY-MM-DD"(한국 시간), end 날짜까지 포함
//   DELETE ?id=
async function guard(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });
  var ok = await checkRateLimit(env, context.request, "admin-bom", 30, 60000);
  if (!ok) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });
  if ((context.request.headers.get("X-Admin-Key") || "") !== env.ADMIN_KEY) return json({ error: "권한이 없어요." }, { status: 403 });
  return null;
}

export async function onRequestGet(context) {
  var denied = await guard(context);
  if (denied) return denied;
  return json({ items: await allBooksOfMonth(context.env) });
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
  var bookId = String(body.bookId || "").trim();
  var question = String(body.question || "").replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  var startsAt = kstDayStart(body.start);
  var endDay = kstDayStart(body.end);
  if (!question) return json({ error: "질문을 입력해주세요." }, { status: 400 });
  if (!(startsAt > 0) || !(endDay > 0)) return json({ error: "날짜는 2026-11-01 같은 모양으로 적어주세요." }, { status: 400 });
  var endsAt = endDay + 24 * 60 * 60 * 1000; // 끝 날짜의 하루 끝까지
  if (endsAt <= startsAt) return json({ error: "끝나는 날이 시작하는 날보다 앞이에요." }, { status: 400 });

  var book = await env.DB.prepare("SELECT id FROM books WHERE id = ?1").bind(bookId).first();
  if (!book) return json({ error: "존재하지 않는 책이에요." }, { status: 404 });

  await ensureBookOfMonth(env);
  var id = newId();
  await env.DB.prepare(
    "INSERT INTO book_of_month (id, book_id, question, starts_at, ends_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
  ).bind(id, bookId, question, startsAt, endsAt, Date.now()).run();
  return json({ id: id }, { status: 201 });
}

export async function onRequestDelete(context) {
  var denied = await guard(context);
  if (denied) return denied;
  var id = new URL(context.request.url).searchParams.get("id") || "";
  await ensureBookOfMonth(context.env);
  await context.env.DB.prepare("DELETE FROM book_of_month WHERE id = ?1").bind(id).run();
  return json({ ok: true });
}
