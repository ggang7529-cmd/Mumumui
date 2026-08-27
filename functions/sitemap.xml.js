function toIsoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  var env = context.env;
  var origin = new URL(context.request.url).origin;

  var rows = await env.DB.prepare("SELECT id, created_at, updated_at FROM books ORDER BY created_at DESC").all();
  var books = rows.results || [];

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
