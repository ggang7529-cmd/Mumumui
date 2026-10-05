import { json } from "../_lib/db.js";
import { checkRateLimit } from "../_lib/rateLimit.js";

// 홈 "오늘의 한 줄" — 화면에는 한 문장만 보이지만, 여기서는 후보 5개를 준다. 화면이 접속할
// 때마다 그중 하나를 골라 보여준다(js/render.js renderFeatured).
//
// 후보 5개 = 관리자가 고정(pin)한 한줄평(최근 고정 순, 최대 5) + 모자란 자리를 자동 선택으로.
// 자동 선택은 최근 7일 한줄평을 좋아요 많은 순(같으면 최신)으로 — 본문 없이 태그만 고른
// 한줄평은 보여줄 "한 줄"이 없어서 뺀다. 7일 안에서 다 못 채우면 기간 없이 같은 기준으로
// 채운다(조용한 주에 같은 문장만 돌거나 칸이 비지 않게).
//
// 고정 목록은 featured_comments 표에 있다. 이 표는 POST가 처음 불릴 때 스스로 만든다 —
// 배포 전에 D1 Console에서 마이그레이션을 돌리는 순서를 지키지 않아도 깨지지 않게
// (.internal/migrations/0007_add_featured_comments.sql에도 같은 문장이 있다). 표가 아직
// 없으면 GET은 "고정 없음"으로 본다.
var MAX = 5;
var WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
var CREATE_TABLE =
  "CREATE TABLE IF NOT EXISTS featured_comments (comment_id TEXT PRIMARY KEY, pinned_at INTEGER NOT NULL)";

var SELECT =
  "SELECT c.id, c.text, c.rating, c.mood, c.author_name, c.created_at, " +
  "b.id AS book_id, b.title, b.author, b.cover, " +
  "(SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id) AS likes " +
  "FROM comments c JOIN books b ON b.id = c.book_id ";

async function readPinned(env) {
  try {
    var rows = await env.DB.prepare(
      SELECT + "JOIN featured_comments f ON f.comment_id = c.id WHERE c.parent_id IS NULL ORDER BY f.pinned_at DESC LIMIT ?1"
    ).bind(MAX).all();
    var ids = await env.DB.prepare("SELECT comment_id FROM featured_comments").all();
    return {
      reviews: rows.results || [],
      ids: (ids.results || []).map(function (r) { return r.comment_id; })
    };
  } catch (e) {
    // 표가 아직 없다(아무도 고정한 적 없음).
    return { reviews: [], ids: [] };
  }
}

export async function onRequestGet(context) {
  var env = context.env;
  var pinned = await readPinned(env);
  var reviews = pinned.reviews.map(function (r) { r.pinned = true; return r; });
  var seen = {};
  reviews.forEach(function (r) { seen[r.id] = true; });

  var auto = SELECT +
    "WHERE c.parent_id IS NULL AND trim(coalesce(c.text, '')) != '' AND c.created_at >= ?1 " +
    "ORDER BY likes DESC, c.created_at DESC LIMIT ?2";
  // 7일 안 → 기간 없이, 순서대로 빈자리를 채운다. 이미 고른 것(고정 포함)은 건너뛴다.
  var windows = [Date.now() - WINDOW_MS, 0];
  for (var i = 0; i < windows.length && reviews.length < MAX; i++) {
    var rows = (await env.DB.prepare(auto).bind(windows[i], MAX * 2).all()).results || [];
    for (var j = 0; j < rows.length && reviews.length < MAX; j++) {
      if (seen[rows[j].id]) continue;
      seen[rows[j].id] = true;
      rows[j].pinned = false;
      reviews.push(rows[j]);
    }
  }
  return json({ reviews: reviews, pinnedIds: pinned.ids });
}

// 관리자: { commentId, pinned: true|false }
export async function onRequestPost(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "featured-pin", 20, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  var commentId = String(body.commentId || "").trim();
  if (!commentId) return json({ error: "잘못된 요청이에요." }, { status: 400 });

  await env.DB.prepare(CREATE_TABLE).run();

  if (!body.pinned) {
    await env.DB.prepare("DELETE FROM featured_comments WHERE comment_id = ?1").bind(commentId).run();
    return json({ ok: true });
  }

  var comment = await env.DB.prepare("SELECT id, parent_id FROM comments WHERE id = ?1").bind(commentId).first();
  if (!comment) return json({ error: "존재하지 않는 한줄평이에요." }, { status: 404 });
  if (comment.parent_id) return json({ error: "답글은 고정할 수 없어요." }, { status: 400 });

  // 지워진 한줄평의 고정 기록은 세지 않는다(카드에도 안 나오므로).
  var count = await env.DB.prepare(
    "SELECT count(*) AS n FROM featured_comments f JOIN comments c ON c.id = f.comment_id"
  ).first();
  var already = await env.DB.prepare("SELECT 1 FROM featured_comments WHERE comment_id = ?1").bind(commentId).first();
  if (!already && count && count.n >= MAX) {
    return json({ error: "이미 " + MAX + "개가 고정돼 있어요. 하나를 풀고 다시 시도해주세요." }, { status: 409 });
  }

  await env.DB.prepare("INSERT OR REPLACE INTO featured_comments (comment_id, pinned_at) VALUES (?1, ?2)")
    .bind(commentId, Date.now()).run();
  return json({ ok: true });
}
