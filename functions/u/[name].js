import { escapeHtml } from "../_lib/html.js";

// /u/:닉네임 — 프로필 화면의 고유 주소.
//
// 주소를 주는 이유는 두 가지다. (1) 뒤로가기가 자연스럽게 동작하고, (2) "내 서재" 링크를
// 그대로 복사해 SNS에 올릴 수 있다. 화면 자체는 js/render.js renderProfile이 그리므로
// 여기서는 index.html을 그대로 내보내되 제목/설명/og 태그만 그 사람 것으로 바꾼다.
//
// 본문(책 목록·한줄평)까지 서버에서 미리 그리지는 않는다. 링크 미리보기가 쓰는 건 아래
// 메타 태그뿐이고, 사람에게는 어차피 js가 곧바로 채워주기 때문이다.
// Pages Functions의 경로 파라미터는 URL 인코딩된 상태 그대로 들어온다(예: "둘다" →
// "%EB%91%98%EB%8B%A4"). 디코딩하기 전에 길이를 자르면 퍼센트 인코딩이 중간에서 잘려
// 아예 다른 문자열이 되므로, 반드시 디코딩을 먼저 하고 그다음에 자른다.
// 저장 때 10자로 자르므로(functions/api/books/index.js 등) 여기서도 같은 길이로 맞춘다.
function nicknameParam(raw) {
  var value = String(raw || "");
  try {
    value = decodeURIComponent(value);
  } catch (e) {
    // 잘못된 인코딩이면 원문 그대로 두고 아래에서 잘라낸다 — 어차피 일치하는 기록이 없다.
  }
  return value.trim().slice(0, 10);
}

export async function onRequestGet(context) {
  var env = context.env;
  var reqUrl = new URL(context.request.url);
  var name = nicknameParam(context.params.name);

  var indexRes = await env.ASSETS.fetch(new URL("/", reqUrl));
  var html = await indexRes.text();
  if (!name) return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=UTF-8" } });

  // 요약 숫자만 가볍게 세서 미리보기 문구에 넣는다. 실패해도 페이지는 그대로 나가야 하므로
  // 통째로 감싼다 — 링크 미리보기 문구는 있으면 좋은 것이지 없으면 안 되는 게 아니다.
  var bookCount = 0;
  var reviewCount = 0;
  try {
    var counts = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS n FROM books WHERE owner_name = ?1").bind(name),
      env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE author_name = ?1 AND parent_id IS NULL").bind(name)
    ]);
    bookCount = (counts[0].results[0] || {}).n || 0;
    reviewCount = (counts[1].results[0] || {}).n || 0;
  } catch (e) {
    // 세지 못했으면 아래에서 숫자 없는 문구를 쓴다.
  }

  var safeName = escapeHtml(name);
  var title = safeName + "님의 책갈피 | 읽은 책과 한줄평";
  var desc = bookCount || reviewCount
    ? safeName + "님이 등록한 책 " + bookCount + "권과 남긴 한줄평 " + reviewCount + "개를 구경해보세요."
    : safeName + "님의 책갈피 기록을 구경해보세요.";
  var pageUrl = escapeHtml(reqUrl.origin + "/u/" + encodeURIComponent(name));

  // 홈에 정적으로 박혀 있는 og 블록을 통째로 갈아끼운다. 뒤에 덧붙이면 태그가 중복돼
  // 크롤러가 어느 쪽을 쓸지 보장할 수 없다 (functions/book/[id].js와 같은 이유).
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
    '<meta property="og:type" content="profile">\n' +
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
    // js가 뜨기 전 한순간 홈 목록이 번쩍이지 않도록, 처음부터 프로필 화면만 열어둔다.
    .replace('<h1 class="brand-name">책갈피</h1>', '<p class="brand-name">책갈피</p>')
    .replace('<section id="libraryView">', '<section id="libraryView" hidden>')
    .replace('<div class="library-toolbar" id="libraryToolbar">', '<div class="library-toolbar" id="libraryToolbar" hidden>')
    .replace('<section id="profileView" hidden>', '<section id="profileView">')
    .replace('<h2 class="profile-name" id="profileName"></h2>', '<h1 class="profile-name" id="profileName">' + safeName + "</h1>");

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}
