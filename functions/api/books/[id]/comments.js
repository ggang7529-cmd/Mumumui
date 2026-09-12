import { getAnonUid } from "../../../_lib/identity.js";
import { json, newId } from "../../../_lib/db.js";
import { checkRateLimit } from "../../../_lib/rateLimit.js";
import { fetchScoreMap } from "../../../_lib/scores.js";

export async function onRequestGet(context) {
  var env = context.env;
  var bookId = context.params.id;
  var myUid = getAnonUid(context.request) || "";

  var rows = await env.DB.prepare(
    "SELECT c.id, c.text, c.rating, c.author_uid, c.author_name, c.author_photo, c.created_at, c.parent_id, " +
    "(SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS likes, " +
    "(SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id AND user_id = ?2) AS liked_by_me " +
    "FROM comments c WHERE c.book_id = ?1 ORDER BY c.created_at ASC"
  ).bind(bookId, myUid).all();

  // 활동 점수/등급 표시(js/render.js buildAuthorChip)용으로 작성자 닉네임마다 현재 점수를
  // 함께 내려준다.
  var scoreMap = await fetchScoreMap(env);

  // author_uid는 절대 응답에 싣지 않는다.
  //
  // 댓글 삭제 권한은 X-Anon-Id 헤더 하나만 보고 판단한다(로그인이 없는 사이트라
  // functions/_lib/identity.js가 그 값을 그대로 신뢰한다). 그래서 남의 uid를 알면
  // 그 값을 헤더에 넣는 것만으로 남의 댓글을 지울 수 있다. uid 자체는 랜덤 UUID라
  // 원래는 알아낼 방법이 없는데, 예전에는 이 목록 API가 모든 작성자의 author_uid를
  // 그대로 내려주고 있어서 누구나 읽어갈 수 있었다.
  //
  // 클라이언트는 삭제 버튼을 그릴지 정하려고 "내 댓글인가"만 알면 되므로, 비교는
  // 서버에서 하고 결과를 boolean(mine)으로만 내려준다.
  //
  // 스프레드(Object.assign) 대신 필요한 필드를 하나씩 적는다 — 나중에 comments 테이블에
  // 컬럼이 추가돼도 모르는 사이에 응답으로 새어나가지 않게 하려는 것이다.
  var comments = (rows.results || []).map(function (c) {
    return {
      id: c.id,
      text: c.text,
      rating: c.rating,
      author_name: c.author_name,
      author_photo: c.author_photo,
      created_at: c.created_at,
      parent_id: c.parent_id,
      likes: c.likes,
      liked_by_me: c.liked_by_me,
      mine: !!myUid && c.author_uid === myUid,
      score: scoreMap[c.author_name] || 0
    };
  });

  return json({ comments: comments });
}

export async function onRequestPost(context) {
  var env = context.env;
  var bookId = context.params.id;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "닉네임을 입력해주세요." }, { status: 401 });

  var rateOk = await checkRateLimit(env, context.request, "comment-create", 10, 60000);
  if (!rateOk) return json({ error: "너무 많이 작성했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  var text = String(body.text || "").replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  var name = String(body.name || "").trim().slice(0, 10);
  var parentId = body.parentId ? String(body.parentId).trim() : null;
  if (!name) return json({ error: "닉네임을 입력해주세요." }, { status: 400 });
  if (!text) return json({ error: "내용을 입력해주세요." }, { status: 400 });

  var book = await env.DB.prepare("SELECT id FROM books WHERE id = ?1").bind(bookId).first();
  if (!book) return json({ error: "존재하지 않는 책이에요." }, { status: 404 });

  // 답글(parentId 있음)은 별점이 없고 books.rating_sum/comment_count에도 반영하지 않는다 —
  // "리뷰순" 정렬은 한줄평(리뷰) 개수 기준이지 전체 댓글 활동량이 아니라서 그대로 둔다.
  var rating = 0;
  if (parentId) {
    var parent = await env.DB.prepare("SELECT id, book_id, parent_id FROM comments WHERE id = ?1").bind(parentId).first();
    if (!parent || parent.book_id !== bookId) return json({ error: "존재하지 않는 댓글이에요." }, { status: 404 });
    if (parent.parent_id) return json({ error: "답글에는 답글을 달 수 없어요." }, { status: 400 });
  } else {
    rating = Number(body.rating);
    if (!(rating >= 1 && rating <= 5)) return json({ error: "별점을 선택해주세요." }, { status: 400 });
  }

  var id = newId();
  var now = Date.now();
  var statements = [
    env.DB.prepare(
      "INSERT INTO comments (id, book_id, text, rating, author_uid, author_name, author_photo, created_at, parent_id) " +
      "VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8)"
    ).bind(id, bookId, text, rating, uid, name, now, parentId)
  ];
  if (!parentId) {
    statements.push(
      env.DB.prepare(
        "UPDATE books SET rating_sum = rating_sum + ?1, rating_count = rating_count + 1, comment_count = comment_count + 1, updated_at = ?3 WHERE id = ?2"
      ).bind(rating, bookId, now)
    );
  } else {
    // 답글은 rating_sum/comment_count(리뷰순 정렬 기준)에는 반영하지 않지만, 홈 화면 NEW
    // 배지와 기본 정렬(최신순)은 updated_at 하나만 보므로 답글이 달려도 갱신해줘야
    // 책 등록 때와 마찬가지로 새 활동으로 보인다.
    statements.push(
      env.DB.prepare("UPDATE books SET updated_at = ?2 WHERE id = ?1").bind(bookId, now)
    );
  }
  await env.DB.batch(statements);

  return json({ id: id }, { status: 201 });
}
