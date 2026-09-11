// 잘못된 값에는 예외 대신 null을 준다. new Date(x).toISOString()은 x가 undefined거나
// NaN이거나 Date가 표현할 수 있는 범위를 벗어나면 RangeError를 던진다. 예전에는 이
// 함수를 try/catch 바깥에서 부르고 있어서, 책 한 권의 타임스탬프만 이상해도 사이트맵
// 전체가 500으로 죽었다.
function toIsoDate(ms) {
  var d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  var year = d.getUTCFullYear();
  // 1995년(사이트맵 표준이 생기기 한참 전)보다 이르거나 먼 미래의 날짜는 데이터가
  // 깨졌다는 신호다. 그런 lastmod를 넣느니 아예 빼는 편이 낫다 — lastmod는 선택 항목이라
  // 없어도 유효한 사이트맵이다.
  if (year < 1995 || year > new Date().getUTCFullYear() + 1) return null;
  return d.toISOString().slice(0, 10);
}

// <loc>에 들어가는 값을 XML로 안전하게 만든다. 지금은 id가 UUID라 위험한 문자가 없지만,
// 여기서 막아두면 나중에 id 규칙이 바뀌어도 사이트맵이 깨지지 않는다.
function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c];
  });
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

  // 한 권이 잘못돼도 그 한 줄만 빠지고 나머지는 살아남게 한 권씩 처리한다. 사이트맵은
  // 전부 아니면 전무가 아니라서, 60권 중 1권이 이상하다고 60권을 다 잃을 이유가 없다.
  var urls = ["<url><loc>" + escapeXml(origin) + "/</loc></url>"];
  for (var i = 0; i < books.length; i++) {
    try {
      var b = books[i];
      if (!b || !b.id) continue;
      var lastmodMs = b.updated_at && b.updated_at > 0 ? b.updated_at : b.created_at;
      var lastmod = toIsoDate(lastmodMs);
      urls.push(
        "<url><loc>" + escapeXml(origin + "/book/" + encodeURIComponent(b.id)) + "</loc>" +
        (lastmod ? "<lastmod>" + lastmod + "</lastmod>" : "") +
        "</url>"
      );
    } catch (rowErr) {
      // 이 책만 건너뛴다.
    }
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
