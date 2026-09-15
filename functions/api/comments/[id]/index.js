import { getAnonUid } from "../../../_lib/identity.js";
import { json } from "../../../_lib/db.js";
import { checkRateLimit } from "../../../_lib/rateLimit.js";

// 한줄평/답글 수정. 본문은 작성 때와 같은 규칙으로 다듬고(줄바꿈 제거, 60자), 한줄평은
// 별점도 함께 바꿀 수 있다.
export async function onRequestPatch(context) {
  var env = context.env;
  var id = context.params.id;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "닉네임을 입력해주세요." }, { status: 401 });

  var rateOk = await checkRateLimit(env, context.request, "comment-edit", 10, 60000);
  if (!rateOk) return json({ error: "너무 많이 수정했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  var comment = await env.DB.prepare(
    "SELECT id, book_id, text, rating, author_uid, parent_id, mood FROM comments WHERE id = ?1"
  ).bind(id).first();
  if (!comment) return json({ error: "존재하지 않는 댓글이에요." }, { status: 404 });

  // 수정은 본인만 할 수 있다 — 삭제와 달리 관리자에게도 열지 않는다. 스팸을 지우는 것과
  // 남이 쓴 문장을 관리자가 다른 내용으로 바꿔놓는 것은 성격이 다른 권한이다.
  if (comment.author_uid !== uid) return json({ error: "수정 권한이 없어요." }, { status: 403 });

  var text = String(body.text || "").replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  // 감정 태그만 고르고 본문 없이 남긴 한줄평이 있으므로, 원래 태그가 있으면 본문을
  // 비운 채로도 저장할 수 있게 둔다. 태그 자체는 이 API가 건드리지 않고 그대로 남는다.
  if (!text && !comment.mood) return json({ error: "내용을 입력해주세요." }, { status: 400 });

  var statements = [];

  if (comment.parent_id) {
    // 답글은 별점이 없다(작성 때 rating 0으로 넣고 books 집계에도 반영하지 않는다).
    statements.push(env.DB.prepare("UPDATE comments SET text = ?1 WHERE id = ?2").bind(text, id));
  } else {
    var rating = Number(body.rating);
    if (!(rating >= 1 && rating <= 5)) return json({ error: "별점을 선택해주세요." }, { status: 400 });

    statements.push(
      env.DB.prepare("UPDATE comments SET text = ?1, rating = ?2 WHERE id = ?3").bind(text, rating, id)
    );

    // 별점이 바뀌면 책의 평균에도 반영해야 한다. 리뷰 개수는 그대로이므로 rating_count는
    // 건드리지 않고 합계만 차이만큼 옮긴다.
    var delta = rating - comment.rating;
    if (delta !== 0) {
      statements.push(
        env.DB.prepare("UPDATE books SET rating_sum = rating_sum + ?1 WHERE id = ?2").bind(delta, comment.book_id)
      );
    }

    // 책을 등록하면 그때 쓴 한줄평이 books.text에도 같은 값으로 복사된다. 그 값은 링크
    // 미리보기용 구조화 데이터(functions/book/[id].js)와 RSS 설명(functions/rss.xml.js)이
    // 쓰므로, 바로 그 첫 한줄평을 고쳤다면 책 쪽도 같이 맞춰줘야 옛 문장이 남지 않는다.
    // 책의 첫 번째 최상위 댓글이 곧 등록 시 함께 만들어진 그 한줄평이다.
    var firstComment = await env.DB.prepare(
      "SELECT id FROM comments WHERE book_id = ?1 AND parent_id IS NULL ORDER BY created_at ASC LIMIT 1"
    ).bind(comment.book_id).first();
    if (firstComment && firstComment.id === id) {
      statements.push(env.DB.prepare("UPDATE books SET text = ?1 WHERE id = ?2").bind(text, comment.book_id));
    }
  }

  // books.updated_at은 일부러 갱신하지 않는다. 그건 홈의 최신순 정렬과 NEW 배지를
  // 움직이는 값인데, 남이 보기에 수정은 새 활동이 아니다.
  await env.DB.batch(statements);

  return json({ ok: true });
}

export async function onRequestDelete(context) {
  var env = context.env;
  var id = context.params.id;
  var uid = getAnonUid(context.request);

  var comment = await env.DB.prepare("SELECT book_id, rating, author_uid, parent_id FROM comments WHERE id = ?1").bind(id).first();
  if (!comment) return json({ error: "존재하지 않는 댓글이에요." }, { status: 404 });

  var isOwner = !!uid && comment.author_uid === uid;
  var isAdmin = false;
  if (!isOwner) {
    var adminKey = context.request.headers.get("X-Admin-Key") || "";
    if (env.ADMIN_KEY && adminKey) {
      var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
      if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });
      isAdmin = adminKey === env.ADMIN_KEY;
    }
  }
  if (!isOwner && !isAdmin) return json({ error: "삭제 권한이 없어요." }, { status: uid ? 403 : 401 });

  var statements;
  if (comment.parent_id) {
    // 답글은 books 집계에 반영된 적이 없으니 자기 자신만 지우면 된다.
    statements = [
      env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ?1").bind(id),
      env.DB.prepare("DELETE FROM comments WHERE id = ?1").bind(id)
    ];
  } else {
    statements = [
      env.DB.prepare("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE id = ?1 OR parent_id = ?1)").bind(id),
      env.DB.prepare("DELETE FROM comments WHERE parent_id = ?1").bind(id),
      env.DB.prepare("DELETE FROM comments WHERE id = ?1").bind(id),
      env.DB.prepare(
        "UPDATE books SET rating_sum = rating_sum - ?1, rating_count = rating_count - 1, comment_count = comment_count - 1 WHERE id = ?2"
      ).bind(comment.rating, comment.book_id)
    ];
  }

  await env.DB.batch(statements);

  return json({ ok: true });
}
