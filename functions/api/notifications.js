import { getAnonUid } from "../_lib/identity.js";
import { json } from "../_lib/db.js";

// 로그인 없이 X-Anon-Id(익명 uid)만으로 "내가 등록한 책"/"내가 남긴 리뷰"를 구분하는
// 기존 방식을 그대로 써서, 계정 시스템 없이 세 가지 알림 후보를 돌려준다:
// 1) 내 책에 남이 새로 남긴 리뷰/답글, 2) 내 리뷰(또는 답글)에 남이 새로 남긴 답글,
// 3) 내 리뷰(또는 답글)에 새로 달린 좋아요. comment_likes에는 시각 컬럼이 없어 좋아요는
// 개수로만 새 활동 여부를 판단한다(연속 취소/재클릭이 겹치면 놓칠 수 있지만, 이 정도
// 정밀도면 충분하다고 보고 마이그레이션 없이 간다). 각 항목이 실제로 "안 읽음"인지는
// 클라이언트가 localStorage에 저장해둔 항목별 마지막 확인 값과 비교해서 최종 판단한다
// (js/api.js의 refreshNotifications 참고).
export async function onRequestGet(context) {
  var env = context.env;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ notifications: [] });

  var bookRows = await env.DB.prepare(
    "SELECT b.id AS book_id, b.title, " +
    "(SELECT c.author_uid FROM comments c WHERE c.book_id = b.id ORDER BY c.created_at DESC LIMIT 1) AS last_author_uid, " +
    "(SELECT MAX(c.created_at) FROM comments c WHERE c.book_id = b.id) AS last_activity_at " +
    "FROM books b WHERE b.owner_uid = ?1"
  ).bind(uid).all();

  var commentRows = await env.DB.prepare(
    "SELECT c.id AS comment_id, c.book_id, b.title AS book_title, " +
    "(SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS like_count, " +
    "(SELECT MAX(r.created_at) FROM comments r WHERE r.parent_id = c.id AND r.author_uid != ?1) AS last_reply_at " +
    "FROM comments c JOIN books b ON b.id = c.book_id WHERE c.author_uid = ?1"
  ).bind(uid).all();

  var notifications = [];

  (bookRows.results || []).forEach(function (r) {
    if (r.last_author_uid && r.last_author_uid !== uid) {
      notifications.push({
        key: "book:" + r.book_id,
        bookId: r.book_id,
        text: r.title + "에 새 리뷰가 달렸어요",
        metric: r.last_activity_at
      });
    }
  });

  (commentRows.results || []).forEach(function (r) {
    if (r.last_reply_at) {
      notifications.push({
        key: "reply:" + r.comment_id,
        bookId: r.book_id,
        text: r.book_title + "에 남긴 리뷰에 답글이 달렸어요",
        metric: r.last_reply_at
      });
    }
    if (r.like_count > 0) {
      notifications.push({
        key: "like:" + r.comment_id,
        bookId: r.book_id,
        text: r.book_title + "에 남긴 리뷰에 좋아요가 달렸어요",
        metric: r.like_count
      });
    }
  });

  return json({ notifications: notifications });
}
