import { canonicalOrigin } from "./_lib/origin.js";

// /collage — "내 책장 한 컷"(예전 이름 "나의 독서 기록 만들기") 화면의 고유 주소.
//
// 주소를 주는 이유는 /u/:닉네임과 같다. (1) 뒤로가기가 자연스럽고, (2) 이 화면 링크만
// 따로 공유할 수 있다. 화면 자체는 js/collage.js가 그리므로 여기서는 index.html을
// 그대로 내보내되 제목·설명·og 태그만 이 화면 것으로 바꾼다.
//
// /recommend와 달리 색인에서 빼지 않는다. 추천 화면은 방문자 브라우저에 저장된 닉네임으로
// 그리는 개인 화면이라 크롤러에게는 빈 껍데기였지만, 이 화면은 누가 열어도 같은 도구다.
export async function onRequestGet(context) {
  var reqUrl = new URL(context.request.url);
  var indexRes = await context.env.ASSETS.fetch(new URL("/", reqUrl));
  var html = await indexRes.text();

  var title = "내 책장 한 컷 | 책갈피";
  var desc = "읽은 책 표지를 골라 한 장의 이미지로 모아보세요. 저장해서 SNS에 바로 올릴 수 있어요.";
  var pageUrl = canonicalOrigin(context.request) + "/collage";

  // 홈에 정적으로 박혀 있는 og 블록을 통째로 갈아끼운다. 뒤에 덧붙이면 태그가 중복돼
  // 크롤러가 어느 쪽을 쓸지 보장할 수 없다 (functions/u/[name].js와 같은 이유).
  // 아래 문자열이 index.html과 한 글자라도 어긋나면 치환이 조용히 실패해서 링크
  // 미리보기가 홈 것으로 나간다 — og:title이 1개인지로 확인할 것.
  var staticOgBlock =
    '<meta property="og:title" content="책갈피 - 읽은 책마다 별점과 한 줄 감상을 남겨보세요">\n' +
    '<meta property="og:description" content="닉네임만 입력하면 누구나 참여할 수 있는 책 리뷰 커뮤니티. 읽은 책을 등록하고 별점과 한 줄 감상을 남겨보세요.">\n' +
    '<meta property="og:image" content="https://book-galpi.com/og-image.png">\n' +
    '<meta property="og:image:width" content="1200">\n' +
    '<meta property="og:image:height" content="630">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:url" content="https://book-galpi.com">\n' +
    '<meta name="twitter:card" content="summary_large_image">';

  var metaTags =
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + title + '">\n' +
    '<meta property="og:description" content="' + desc + '">\n' +
    '<meta property="og:image" content="https://book-galpi.com/og-image.png">\n' +
    '<meta property="og:image:width" content="1200">\n' +
    '<meta property="og:image:height" content="630">\n' +
    '<meta property="og:url" content="' + pageUrl + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">';

  html = html
    .replace("<title>책갈피 - 한 줄 독서 기록과 책 리뷰 커뮤니티</title>", "<title>" + title + "</title>")
    .replace(
      '<meta name="description" content="가입 없이 닉네임만으로 참여하는 책 리뷰 커뮤니티. 읽은 책에 별점과 한 줄 감상을 남기고, 다른 사람들이 남긴 한줄평을 구경하며 다음에 읽을 책을 골라보세요.">',
      '<meta name="description" content="' + desc + '">'
    )
    .replace(
      '<link rel="canonical" href="https://book-galpi.com/">',
      '<link rel="canonical" href="' + pageUrl + '">'
    )
    .replace(staticOgBlock, metaTags)
    // js가 뜨기 전 한순간 홈 목록이 번쩍이지 않도록, 처음부터 이 화면만 열어둔다.
    .replace('<h1 class="brand-name">책갈피</h1>', '<p class="brand-name">책갈피</p>')
    .replace('<section id="libraryView">', '<section id="libraryView" hidden>')
    .replace('<div class="library-toolbar" id="libraryToolbar">', '<div class="library-toolbar" id="libraryToolbar" hidden>')
    .replace('<div class="header-intro" id="headerIntro">', '<div class="header-intro" id="headerIntro" hidden>')
    .replace('<section id="collageView" hidden>', '<section id="collageView">')
    .replace('<h2>내 책장 한 컷</h2>', '<h1 class="collage-title">내 책장 한 컷</h1>');

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}
