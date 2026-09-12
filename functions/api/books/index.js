import { getAnonUid } from "../../_lib/identity.js";
import { json, newId } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
// 도서관 정보나루(data4library.kr) 조회 로직은 functions/_lib/libraryCategory.js로
// 옮겼다 — functions/api/admin/backfill-categories.js가 기존 책들에 소급으로 같은
// 조회를 돌려야 해서, 여기 갇혀 있던 함수를 양쪽이 같이 쓸 수 있는 곳으로 뺐다.
import { fetchLibraryCategory } from "../../_lib/libraryCategory.js";

export async function onRequestGet(context) {
  var env = context.env;
  // owner_uid는 내려주지 않는다. 책을 등록하면 같은 uid로 첫 한줄평이 함께 만들어지므로
  // (아래 onRequestPost), 이 값이 공개되면 그대로 X-Anon-Id에 넣어 그 사람의 한줄평을
  // 지울 수 있다. 클라이언트도 쓰지 않는 값이라 아예 select에서 뺀다.
  var rows = await env.DB.prepare(
    "SELECT id, title, author, cover, isbn, contents, category, text, rating_sum, rating_count, comment_count, " +
    "owner_name, owner_photo, created_at, updated_at FROM books ORDER BY updated_at DESC"
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
  var name = String(body.name || "").trim().slice(0, 10);
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
      // owner_uid는 목록 API와 마찬가지로 돌려주지 않는다 — 클라이언트가 쓰지 않고,
      // 응답 모양을 목록과 맞춰두는 편이 나중에 실수로 다시 새어나갈 여지를 줄인다.
      owner_name: name, owner_photo: null, created_at: now, updated_at: now
    },
    // 위에서 isbn/제목 중복 체크를 이미 통과했으므로, 여기까지 오는 모든 생성은 정의상
    // "이 책의 첫 등록"이다. 클라이언트가 첫 등록자 축하 메시지를 띄우는 데 쓴다.
    firstRegistration: true
  }, { status: 201 });
}
