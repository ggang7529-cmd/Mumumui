import { normalizeBookmarkColor } from "../../js/bookmarkColor.js";

// comments.color(책갈피 색, .internal/migrations/0011)가 DB에 있는지. 마이그레이션을 아직 안
// 돌린 DB에서도 사이트가 깨지지 않게, 없으면 읽을 때 NULL로 두고 저장은 건너뛴다. 스키마를
// 코드가 몰래 바꾸지는 않는다(ALTER는 사람이 Console에서). 있다는 답은 isolate가 사는 동안
// 기억하고, 없다는 답은 1분마다 다시 본다 — 마이그레이션을 돌리면 곧 따라온다.
var known = null;
var checkedAt = 0;

export async function hasColorColumn(env) {
  if (known === true) return true;
  if (known === false && Date.now() - checkedAt < 60000) return false;
  checkedAt = Date.now();
  try {
    await env.DB.prepare("SELECT color FROM comments LIMIT 1").all();
    known = true;
  } catch (e) {
    known = false;
  }
  return known;
}

// SELECT 목록에 넣을 조각: "c.color" 또는 "NULL".
export async function colorSql(env, alias) {
  return (await hasColorColumn(env)) ? (alias ? alias + "." : "") + "color" : "NULL";
}

// 고른 색을 그 한 줄에 적는다. 값이 없거나 틀리면 그대로 둔다(예전 색 유지).
export async function saveCommentColor(env, commentId, color) {
  var c = normalizeBookmarkColor(color);
  if (!c || !commentId || !(await hasColorColumn(env))) return;
  await env.DB.prepare("UPDATE comments SET color = ?1 WHERE id = ?2").bind(c, commentId).run();
}
