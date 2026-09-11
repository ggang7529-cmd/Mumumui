// GET/HEAD 둘 다 이 함수가 받는다 — 이유는 functions/sitemap.xml.js 주석 참고.
async function handle(context) {
  var origin = new URL(context.request.url).origin;
  var body =
    "User-agent: *\nAllow: /\n" +
    "Disallow: /api/\n" +
    "Disallow: /CLAUDE.md\n\n" +
    "Sitemap: " + origin + "/sitemap.xml\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
