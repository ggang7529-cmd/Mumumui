import { getAnonUid } from "../../_lib/identity.js";
import { json, newId } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";

export async function onRequestGet(context) {
  var env = context.env;
  var rows = await env.DB.prepare(
    "SELECT id, title, author, cover, isbn, contents, category, text, rating_sum, rating_count, comment_count, " +
    "owner_uid, owner_name, owner_photo, created_at, updated_at FROM books ORDER BY updated_at DESC"
  ).all();
  return json({ books: rows.results });
}

// 책 검색(카카오)에는 분류 정보가 없어서, 등록 시점에 국립중앙도서관이 운영하는
// "도서관 정보나루"(data4library.kr) 오픈API로 ISBN 기준 도서 상세를 한 번 더 조회해
// KDC 분류명(class_nm, 예: "문학 > 한국문학 > 소설")을 받아온다. 실패하거나 그 책이
// 도서관 소장 목록에 없어 결과가 없으면 분류 없이 조용히 진행한다(필수 정보가 아님).
async function fetchLibraryCategory(env, isbn) {
  // 카카오 책 검색이 주는 isbn은 "8936434594 9788936434595"처럼 isbn10과 isbn13이
  // 공백으로 함께 온다. data4library는 13자리 isbn만 받으므로 그 부분만 뽑아 쓴다.
  var isbn13Match = (isbn || "").match(/\b(\d{13})\b/);
  if (!env.LIBRARY_API_KEY || !isbn13Match) return "";
  var url = "https://data4library.kr/api/srchDtlList" +
    "?authKey=" + encodeURIComponent(env.LIBRARY_API_KEY) +
    "&isbn13=" + encodeURIComponent(isbn13Match[1]) + "&format=json";
  try {
    var res = await fetch(url);
    if (!res.ok) return "";
    var data = await res.json();
    var book = data.response && data.response.detail && data.response.detail.book;
    return (book && book.class_nm) ? book.class_nm.trim() : "";
  } catch (e) {
    return "";
  }
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
  var contents = String(body.contents || "").trim().slice(0, 2000);

  if (!name) return json({ error: "닉네임을 입력해주세요." }, { status: 400 });
  if (!title || !author || !text) return json({ error: "필수 항목이 비어있어요." }, { status: 400 });
  if (!(rating >= 1 && rating <= 5)) return json({ error: "별점을 선택해주세요." }, { status: 400 });

  if (isbn) {
    var dupIsbn = await env.DB.prepare("SELECT id FROM books WHERE isbn = ?1").bind(isbn).first();
    if (dupIsbn) return json({ error: "이미 등록된 책이에요." }, { status: 409 });
  }

  var dupTitle = await env.DB.prepare("SELECT id FROM books WHERE lower(title) = lower(?1)").bind(title).first();
  if (dupTitle) return json({ error: "이미 등록된 책 제목이에요." }, { status: 409 });

  var category = (await fetchLibraryCategory(env, isbn)).slice(0, 200);

  var id = newId();
  var commentId = newId();
  var now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO books (id, title, author, cover, isbn, contents, category, text, rating_sum, rating_count, comment_count, " +
      "owner_uid, owner_name, owner_photo, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, 1, ?10, ?11, NULL, ?12, ?12)"
    ).bind(id, title, author, cover, isbn || null, contents || null, category || null, text, rating, uid, name, now),
    env.DB.prepare(
      "INSERT INTO comments (id, book_id, text, rating, author_uid, author_name, author_photo, created_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)"
    ).bind(commentId, id, text, rating, uid, name, now)
  ]);

  return json({
    book: {
      id: id, title: title, author: author, cover: cover, isbn: isbn || null, contents: contents || null,
      category: category || null, text: text,
      rating_sum: rating, rating_count: 1, comment_count: 1,
      owner_uid: uid, owner_name: name, owner_photo: null, created_at: now, updated_at: now
    }
  }, { status: 201 });
}
