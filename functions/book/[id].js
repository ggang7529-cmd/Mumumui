function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// 카카오 도서검색 썸네일은 작아서(보통 130x200) 카톡 공유 미리보기에도 그대로 쓰면 흐릿하다.
// js/render.js의 upscaleCover()와 같은 방식으로 카카오 argon 리사이징 프록시 URL의 크기
// 구간만 더 크게 바꿔서 요청한다. 패턴이 안 맞으면 원본 그대로 둔다.
function upscaleCover(url) {
  if (!url) return url;
  return url.replace(/\/\d{2,4}x\d{2,4}_\d+_[a-z]+\//, "/400x600_95_c/");
}

export async function onRequestGet(context) {
  var env = context.env;
  var id = context.params.id;
  var reqUrl = new URL(context.request.url);

  var indexRes = await env.ASSETS.fetch(new URL("/", reqUrl));
  var html = await indexRes.text();

  var book = await env.DB.prepare("SELECT id, title, author, cover FROM books WHERE id = ?1").bind(id).first();
  if (!book) return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=UTF-8" } });

  var title = escapeHtml(book.title) + " - 책갈피";
  var desc = escapeHtml(book.title) + "(" + escapeHtml(book.author) + ") 리뷰 - 책갈피에서 확인해보세요";
  var pageUrl = escapeHtml(reqUrl.toString());

  var metaTags = "\n" +
    '<meta property="og:type" content="article">\n' +
    '<meta property="og:title" content="' + title + '">\n' +
    '<meta property="og:description" content="' + desc + '">\n' +
    (book.cover ? '<meta property="og:image" content="' + escapeHtml(upscaleCover(book.cover)) + '">\n' : "") +
    '<meta property="og:url" content="' + pageUrl + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n';

  html = html
    .replace("<title>책갈피</title>", "<title>" + title + "</title>" + metaTags)
    .replace(
      '<meta name="description" content="읽은 책마다 별점과 한 줄 감상을 남겨두는 개인 서재">',
      '<meta name="description" content="' + desc + '">'
    );

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}
