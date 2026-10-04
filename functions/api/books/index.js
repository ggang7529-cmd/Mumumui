import { getAnonUid } from "../../_lib/identity.js";
import { json, newId } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
// 책 분류 조회 로직은 functions/_lib/bookClass.js에 있다 — functions/api/admin/
// backfill-categories.js가 기존 책들에 소급으로 같은 조회를 돌려야 해서 양쪽이 같이
// 쓸 수 있는 곳에 둔다.
import { fetchBookClass } from "../../_lib/bookClass.js";
import { normalizeMoodId } from "../../../js/moodTags.js";
import { bookKey } from "../../../js/bookIdentity.js";

export async function onRequestGet(context) {
  var env = context.env;
  // owner_uid는 내려주지 않는다. 책을 등록하면 같은 uid로 첫 한줄평이 함께 만들어지므로
  // (아래 onRequestPost), 이 값이 공개되면 그대로 X-Anon-Id에 넣어 그 사람의 한줄평을
  // 지울 수 있다. 클라이언트도 쓰지 않는 값이라 아예 select에서 뺀다.
  // top_text: 카드 아래에 미리 보여줄 "대표 한 줄". 그 책의 한줄평(답글 제외, 본문 있는 것)
  // 중 좋아요가 가장 많은 것, 같으면 최신 것. 책 수가 수백 권 단위라 책마다 하위 질의를
  // 돌려도 가볍다. 본문 있는 한줄평이 없으면 NULL이고, 화면은 첫 한줄평의 태그로 대신한다.
  var rows = await env.DB.prepare(
    "SELECT id, title, author, cover, isbn, contents, category, class_no, text, mood, rating_sum, rating_count, comment_count, " +
    "owner_name, owner_photo, created_at, updated_at, " +
    "(SELECT c.text FROM comments c WHERE c.book_id = books.id AND c.parent_id IS NULL AND trim(coalesce(c.text, '')) != '' " +
    "ORDER BY (SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id) DESC, c.created_at DESC LIMIT 1) AS top_text " +
    "FROM books ORDER BY updated_at DESC"
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
  // 감정 태그는 선택 항목이다. 목록에 없는 값은 normalizeMoodId가 null로 떨어뜨린다.
  var mood = normalizeMoodId(body.mood);

  if (!name) return json({ error: "닉네임을 입력해주세요." }, { status: 400 });
  if (!title || !author) return json({ error: "필수 항목이 비어있어요." }, { status: 400 });
  // 한 줄 리뷰는 감정 태그를 골랐다면 비워둘 수 있다. 둘 다 없으면 남길 내용이 없는
  // 셈이라 막는다. 별점은 예전과 똑같이 무조건 필수다.
  if (!text && !mood) return json({ error: "한 줄 리뷰를 쓰거나 감정 태그를 골라주세요." }, { status: 400 });
  if (!(rating >= 1 && rating <= 5)) return json({ error: "별점을 선택해주세요." }, { status: 400 });

  if (isbn) {
    var dupIsbn = await env.DB.prepare("SELECT id FROM books WHERE isbn = ?1").bind(isbn).first();
    // bookId를 같이 준다 — 화면은 이걸 받아 쓴 한줄평을 그 책에 붙인다(새 책은 안 만든다).
    if (dupIsbn) return json({ error: "이미 등록된 책이에요.", bookId: dupIsbn.id }, { status: 409 });
  }

  var dupTitle = await env.DB.prepare("SELECT id FROM books WHERE lower(title) = lower(?1)").bind(title).first();
  if (dupTitle) return json({ error: "이미 등록된 책 제목이에요.", bookId: dupTitle.id }, { status: 409 });

  // 판본만 다른 같은 책(정규화 제목 + 첫 번째 저자, js/bookIdentity.js). 검색 화면이 이미
  // 이 기준으로 묶어서 등록된 판본을 대표로 내밀지만, 화면을 거치지 않은 요청이나 책
  // 목록을 아직 못 받은 화면에서도 같은 책이 두 권 되지 않게 여기서 한 번 더 막는다.
  // 책 수가 수백 권 단위라 전부 읽어 비교한다(제목 정규화는 SQL로 옮기기 어렵다).
  var key = bookKey(title, author);
  var all = await env.DB.prepare("SELECT id, title, author FROM books").all();
  var sameBook = (all.results || []).find(function (r) { return bookKey(r.title, r.author) === key; });
  if (sameBook) return json({ error: "이미 등록된 책이에요. (다른 판본으로 등록돼 있어요)", bookId: sameBook.id }, { status: 409 });

  // 분류는 두 가지를 같이 저장한다. category는 드롭다운에 그대로 띄우는 대분류 이름
  // ("문학"), class_no는 나중에 "비슷한 책"을 고를 때 쓸 상세 분류번호("813.7")다.
  // 제목·저자도 넘긴다. ISBN으로 못 찾는 세트 상품일 때 앞 제목으로 한 번 더 찾는다.
  var bookClass = await fetchBookClass(env, isbn, title, author);
  var category = bookClass.categoryName.slice(0, 200);
  var classNo = bookClass.classNo.slice(0, 40);

  var id = newId();
  var commentId = newId();
  var now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO books (id, title, author, cover, isbn, contents, category, class_no, text, mood, rating_sum, rating_count, " +
      "comment_count, owner_uid, owner_name, owner_photo, created_at, updated_at) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, 1, ?12, ?13, NULL, ?14, ?14)"
    ).bind(id, title, author, cover, isbn || null, contents || null, category || null, classNo || null, text, mood, rating, uid, name, now),
    env.DB.prepare(
      "INSERT INTO comments (id, book_id, text, rating, author_uid, author_name, author_photo, created_at, mood) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8)"
    ).bind(commentId, id, text, rating, uid, name, now, mood)
  ]);

  return json({
    book: {
      id: id, title: title, author: author, cover: cover, isbn: isbn || null, contents: contents || null,
      category: category || null, class_no: classNo || null, text: text, mood: mood,
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
