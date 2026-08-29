import { getAnonUid } from "../_lib/identity.js";
import { json } from "../_lib/db.js";

// 로그인 없이 X-Anon-Id(익명 uid)만으로 "내가 등록한 책"을 구분하는 기존 방식을 그대로
// 써서, 계정 시스템 없이 "내 책에 남이 새로 남긴 리뷰/답글" 후보를 돌려준다. 실제로
// "안 읽음"인지는 클라이언트가 localStorage에 저장해둔 책별 마지막 확인 시각과 비교해서
// 최종 판단한다 (js/api.js의 refreshNotifications 참고).
export async function onRequestGet(context) {
  var env = context.env;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ notifications: [] });

  var rows = await env.DB.prepare(
    "SELECT b.id AS book_id, b.title, b.updated_at, " +
    "(SELECT c.author_uid FROM comments c WHERE c.book_id = b.id ORDER BY c.created_at DESC LIMIT 1) AS last_author_uid " +
    "FROM books b WHERE b.owner_uid = ?1"
  ).bind(uid).all();

  var notifications = (rows.results || [])
    .filter(function (r) { return r.last_author_uid && r.last_author_uid !== uid; })
    .map(function (r) { return { bookId: r.book_id, title: r.title, updatedAt: r.updated_at }; })
    .sort(function (a, b) { return b.updatedAt - a.updatedAt; });

  return json({ notifications: notifications });
}
