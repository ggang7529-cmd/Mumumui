import { json } from "../../_lib/db.js";
import { hasLineSql } from "../../_lib/lines.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { bookKey, editionlessTitle } from "../../../js/bookIdentity.js";

// 판본만 다르게 따로 등록된 책을 찾아 목록과, 합칠 때 쓸 SQL을 함께 돌려준다.
// 관리자만 부를 수 있고 **읽기만** 한다 — SQL은 글자로 만들어 줄 뿐 여기서 실행하지 않는다.
// 사람이 목록을 확인하고 D1을 백업한 뒤 D1 Console에 직접 붙여넣어 돌리는 용도다.
//
// "같은 책" 기준은 책 등록 때 중복을 막는 것과 같은 js/bookIdentity.js의 bookKey다.
//
// 사이트를 연 브라우저(관리자 비밀번호를 저장해 둔 곳)의 개발자 콘솔에서:
//   fetch('/api/admin/edition-duplicates', { headers: { 'X-Admin-Key':
//     localStorage.getItem('chaekgalpi_admin_key') } }).then(r => r.json()).then(d => console.log(d.report))
//
// 합칠 때 남길 책: 한줄평이 가장 많은 책, 같으면 먼저 등록된 책. 나머지 책의 한줄평·답글을
// 남길 책으로 옮기고, 별점 합계·개수는 옮긴 뒤의 한줄평으로 다시 센다. 지워지는 책의
// 주소(/book/<id>)는 더는 열리지 않는다.

function q(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function kst(ms) {
  if (!ms) return "-";
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export async function onRequestGet(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  var rows = (await env.DB.prepare(
    "SELECT b.id, b.title, b.author, b.isbn, b.cover, b.category, b.class_no, b.created_at, b.updated_at, " +
    "(SELECT count(*) FROM comments c WHERE c.book_id = b.id AND c.parent_id IS NULL AND " + hasLineSql("c") + ") AS reviews, " +
    "(SELECT count(*) FROM comments c WHERE c.book_id = b.id AND c.parent_id IS NOT NULL) AS replies " +
    "FROM books b ORDER BY b.created_at"
  ).all()).results || [];

  var byKey = {};
  var order = [];
  rows.forEach(function (r) {
    var k = bookKey(r.title, r.author);
    if (!byKey[k]) { byKey[k] = []; order.push(k); }
    byKey[k].push(r);
  });

  var groups = order.filter(function (k) { return byKey[k].length > 1; }).map(function (k) {
    var books = byKey[k].slice().sort(function (a, b) {
      if (b.reviews !== a.reviews) return b.reviews - a.reviews;
      return a.created_at - b.created_at;
    });
    return { key: k, keep: books[0], merge: books.slice(1) };
  });

  var lines = [];
  var sql = [];
  if (groups.length === 0) {
    lines.push("판본만 다르게 따로 등록된 책이 없어요. (전체 " + rows.length + "권)");
  } else {
    lines.push("판본만 다른 같은 책 " + groups.length + "묶음 (전체 " + rows.length + "권)");
  }

  groups.forEach(function (g, i) {
    var all = [g.keep].concat(g.merge);
    lines.push("");
    lines.push((i + 1) + ". " + editionlessTitle(g.keep.title) + " / " + g.keep.author.split(",")[0].trim());
    all.forEach(function (b, j) {
      lines.push(
        "   " + (j === 0 ? "[남김] " : "[합침] ") + b.title + " · 리뷰 " + b.reviews + " · 답글 " + b.replies +
        " · 등록 " + kst(b.created_at) + " · isbn " + (b.isbn || "-") + " · id " + b.id
      );
    });

    var keepId = g.keep.id;
    var ids = g.merge.map(function (b) { return q(b.id); }).join(", ");
    var latest = Math.max.apply(null, all.map(function (b) { return b.updated_at || 0; }));
    // 남길 책에 비어 있는 값은 합쳐질 책에서 채운다(표지·분류). isbn은 유일 인덱스가 걸려
    // 있으므로 합쳐질 책을 지운 다음에 옮긴다.
    function firstOf(field) {
      var hit = g.merge.find(function (b) { return b[field]; });
      return hit ? hit[field] : null;
    }

    sql.push("-- " + (i + 1) + ". " + editionlessTitle(g.keep.title) + " : " + g.merge.length + "권을 " + keepId + "(으)로 합침");
    sql.push("UPDATE comments SET book_id = " + q(keepId) + " WHERE book_id IN (" + ids + ");");
    // 읽고 싶어요도 남길 책으로 옮긴다. 같은 기기가 두 판본 모두 담았으면 하나만 남는다.
    sql.push("UPDATE OR IGNORE wants SET book_id = " + q(keepId) + " WHERE book_id IN (" + ids + ");");
    sql.push("DELETE FROM wants WHERE book_id IN (" + ids + ");");
    sql.push("DELETE FROM books WHERE id IN (" + ids + ");");
    sql.push(
      "UPDATE books SET " +
      "rating_sum = (SELECT coalesce(sum(rating), 0) FROM comments WHERE book_id = " + q(keepId) + " AND parent_id IS NULL), " +
      "rating_count = (SELECT count(*) FROM comments WHERE book_id = " + q(keepId) + " AND parent_id IS NULL), " +
      "comment_count = (SELECT count(*) FROM comments WHERE book_id = " + q(keepId) + " AND parent_id IS NULL AND " + hasLineSql() + "), " +
      "updated_at = " + latest + ", " +
      "cover = coalesce(cover, " + q(firstOf("cover")) + "), " +
      "isbn = coalesce(isbn, " + q(firstOf("isbn")) + "), " +
      "category = coalesce(category, " + q(firstOf("category")) + "), " +
      "class_no = coalesce(class_no, " + q(firstOf("class_no")) + ") " +
      "WHERE id = " + q(keepId) + ";"
    );
    sql.push("");
  });

  return json({
    groupCount: groups.length,
    totalBooks: rows.length,
    report: lines.join("\n"),
    sql: sql.join("\n"),
    groups: groups.map(function (g) {
      return {
        title: editionlessTitle(g.keep.title),
        keep: g.keep,
        merge: g.merge
      };
    })
  });
}
