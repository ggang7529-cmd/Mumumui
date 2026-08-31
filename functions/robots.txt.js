export async function onRequestGet(context) {
  var origin = new URL(context.request.url).origin;
  var body =
    "User-agent: *\nAllow: /\n" +
    "Disallow: /api/\n" +
    "Disallow: /CLAUDE.md\n\n" +
    "Sitemap: " + origin + "/sitemap.xml\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=UTF-8" } });
}
