function toIsoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// GET과 HEAD를 같은 핸들러로 처리한다.
//
// Pages Functions는 onRequestGet만 내보내면 GET만 이 함수가 받고, HEAD는 함수를 타지
// 않고 정적 자산 핸들러로 떨어진다. 그러면 /sitemap.xml이 SPA 셸(index.html)로 응답해서
// "200 OK + Content-Type: text/html"이 나간다 — 사이트맵 주소인데 HTML이라고 답하는 꼴이라,
// HEAD로 먼저 찔러보는 크롤러·검증기 입장에서는 사이트맵이 아닌 것으로 읽힌다.
// 브라우저는 주소창에서 GET으로 열기 때문에 사람 눈에는 멀쩡해 보이는 게 이 문제의 특징이다.
// 본문은 런타임이 HEAD일 때 알아서 떼어낸다.
async function handle(context) {
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

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      // 크롤러가 짧은 간격으로 여러 번 가져가도 매번 D1을 때리지 않게 한다. D1이 잠깐
      // 흔들리는 순간에 걸리면 홈 URL만 담긴 축소판 사이트맵이 나가는데, 캐시가 있으면
      // 그 창이 좁아진다. 새 책이 한 시간 안에 반영되는 정도면 사이트맵으로는 충분하다.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const onRequestGet = handle;
export const onRequestHead = handle;
