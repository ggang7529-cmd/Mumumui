function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// SSR로 미리 채워 넣는 카드 개수. 검색봇용 최소 콘텐츠가 목적이라 전체 목록을 다
// 가져올 필요는 없고, JS가 로드되면 곧바로 dom.shelf.innerHTML = "" 후 전체
// 목록으로 다시 그려지므로 화면에는 순간적으로만 존재한다.
var SSR_BOOK_LIMIT = 100;

var EMPTY_SHELF = '<div class="shelf" id="shelfGrid"></div>';

function renderShelfHtml(books) {
  var cards = books.map(function (b) {
    var rating = b.rating_count > 0 ? b.rating_sum / b.rating_count : null;
    var ratingText = rating !== null ? rating.toFixed(1) + " (" + b.rating_count + ")" : "평점 없음";
    var title = escapeHtml(b.title);
    return (
      '<a class="book-card" style="text-decoration:none" href="/book/' + encodeURIComponent(b.id) + '">' +
      '<div class="b-overlay">' +
      '<div class="b-title">' + title + "</div>" +
      '<div class="b-stars">' + escapeHtml(ratingText) + "</div>" +
      "</div>" +
      "</a>"
    );
  }).join("");
  return '<div class="shelf" id="shelfGrid">' + cards + "</div>";
}

export async function onRequestGet(context) {
  var env = context.env;
  var reqUrl = new URL(context.request.url);

  var indexRes = await env.ASSETS.fetch(new URL("/", reqUrl));
  var html = await indexRes.text();

  // 홈은 사이트에서 가장 많이 요청되는 경로라, D1 조회가 실패하거나 느려져도 절대
  // 페이지 자체가 깨지면 안 된다 — 실패 시 그냥 정적 index.html을 그대로 내려주면
  // 클라이언트 JS(refreshBooks → renderLibrary)가 평소처럼 전체 목록을 불러와 채운다.
  try {
    var rows = await env.DB.prepare(
      "SELECT id, title, author, rating_sum, rating_count FROM books ORDER BY updated_at DESC LIMIT ?1"
    )
      .bind(SSR_BOOK_LIMIT)
      .all();
    var books = rows.results || [];
    if (books.length > 0) {
      html = html.replace(EMPTY_SHELF, renderShelfHtml(books));
    }
  } catch (e) {
    // 아래에서 원본 html(정적 셸)을 그대로 반환한다.
  }

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}
