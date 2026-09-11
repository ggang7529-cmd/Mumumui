// GET/HEAD 둘 다 이 함수가 받는다 — 이유는 functions/sitemap.xml.js 주석 참고.
async function handle(context) {
  var origin = new URL(context.request.url).origin;
  // 네이버 웹마스터 가이드가 짚는 항목들을 의도적으로 이 형태로 둔다.
  //
  // - 파비콘, /js/, /css/는 일부러 막지 않는다. 검색 로봇은 이들을 문서의 일부로 보고
  //   설정과 무관하게 가져가려 하며, 막아두면 문서를 엉뚱하게 해석할 수 있다.
  // - /api/만 막는다. 색인할 콘텐츠가 아니라 데이터 엔드포인트다. 홈과 책 상세는 서버에서
  //   미리 그려 보내고(functions/index.js, functions/book/[id].js), 클라이언트 JS는
  //   booksLoaded 가드 때문에 API 응답 전에는 그 내용을 지우지 않는다. 그래서 JS를
  //   실행하는 크롤러가 /api/를 못 가져가도 책 목록은 페이지에 그대로 남는다.
  // - Yeti 전용 그룹은 두지 않는다. 로봇 배제 표준에서 자기 이름의 그룹이 있으면 크롤러는
  //   그 그룹만 읽고 "*"를 무시하므로, 그룹을 따로 두면 Disallow를 양쪽에 똑같이 적어야
  //   하는 함정이 생긴다. 규칙이 모든 크롤러에 동일한 지금은 "*" 하나가 맞다.
  // Disallow를 Allow보다 먼저 쓴다. RFC 9309는 "가장 긴 규칙이 이긴다"라서 순서가
  // 상관없지만, 규칙을 위에서부터 읽어 처음 맞는 것으로 결정하는 단순한 파서도 흔하다.
  // "Allow: /"를 먼저 두면 그런 파서에서 /api/가 허용으로 뒤집힌다(실제로 파이썬
  // RobotFileParser로 재현했다). 구체적인 규칙을 앞에 두면 양쪽 해석이 같아진다.
  var body =
    "User-agent: *\nDisallow: /api/\n" +
    "Allow: /\n\n" +
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
