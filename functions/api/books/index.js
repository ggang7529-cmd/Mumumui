import { getAnonUid } from "../../_lib/identity.js";
import { json, newId } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";

export async function onRequestGet(context) {
  var env = context.env;
  var rows = await env.DB.prepare(
    "SELECT id, title, author, cover, isbn, text, rating_sum, rating_count, comment_count, " +
    "owner_uid, owner_name, owner_photo, created_at, updated_at FROM books ORDER BY updated_at DESC"
  ).all();
  return json({ books: rows.results });
}

export async function onRequestPost(context) {
  var env = context.env;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "닉네임을 입력해주세요." }, { status: 401 });

  var rateOk = await checkRateLimit(env, context.request, "book-create", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 등록했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  var title = String(body.title || "").trim().slice(0, 80);
  var author = String(body.author || "").trim().slice(0, 60);
  var text = String(body.text || "").trim().slice(0, 80);
  var name = String(body.name || "").trim().slice(0, 20);
  var rating = Number(body.rating);
  var cover = typeof body.cover === "string" ? body.cover : null;
  var isbn = String(body.isbn || "").trim().slice(0, 40);

  if (!name) return json({ error: "닉네임을 입력해주세요." }, { status: 400 });
  if (!title || !author || !text) return json({ error: "필수 항목이 비어있어요." }, { status: 400 });
  if (!(rating >= 1 && rating <= 5)) return json({ error: "별점을 선택해주세요." }, { status: 400 });

  if (isbn) {
    var dupIsbn = await env.DB.prepare("SELECT id FROM books WHERE isbn = ?1").bind(isbn).first();
    if (dupIsbn) return json({ error: "이미 등록된 책이에요." }, { status: 409 });
  }

  var dupTitle = await env.DB.prepare("SELECT id FROM books WHERE lower(title) = lower(?1)").bind(title).first();
  if (dupTitle) return json({ error: "이미 등록된 책 제목이에요." }, { status: 409 });

  var id = newId();
  var commentId = newId();
  var now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO books (id, title, author, cover, isbn, text, rating_sum, rating_count, comment_count, " +
      "owner_uid, owner_name, owner_photo, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 1, ?8, ?9, NULL, ?10, ?10)"
    ).bind(id, title, author, cover, isbn || null, text, rating, uid, name, now),
    env.DB.prepare(
      "INSERT INTO comments (id, book_id, text, rating, author_uid, author_name, author_photo, created_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)"
    ).bind(commentId, id, text, rating, uid, name, now)
  ]);

  return json({
    book: {
      id: id, title: title, author: author, cover: cover, isbn: isbn || null, text: text,
      rating_sum: rating, rating_count: 1, comment_count: 1,
      owner_uid: uid, owner_name: name, owner_photo: null, created_at: now, updated_at: now
    }
  }, { status: 201 });
}
