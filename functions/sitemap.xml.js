function toIsoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  var env = context.env;
  var origin = new URL(context.request.url).origin;

  var books = [];
  try {
    var rows = await env.DB.prepare("SELECT id, created_at, updated_at FROM books ORDER BY created_at DESC").all();
    books = rows.results || [];
  } catch (err) {
    // D1 조회가 실패해도 구글/네이버 크롤러에는 최소한 홈 URL만 담은 유효한 XML을
    // 돌려준다 — 에러 스택트레이스를 그대로 내려보내면 크롤러가 "가져올 수 없음"으로
    // 처리해버린다.
  }

  var urls = ["<url><loc>" + origin + "/</loc></url>"];
  for (var i = 0; i < books.length; i++) {
    var b = books[i];
    var lastmodMs = b.updated_at && b.updated_at > 0 ? b.updated_at : b.created_at;
    urls.push(
      "<url><loc>" + origin + "/book/" + encodeURIComponent(b.id) + "</loc><lastmod>" + toIsoDate(lastmodMs) + "</lastmod></url>"
    );
  }

  var xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") +
    "\n</urlset>";

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=UTF-8" } });
}
