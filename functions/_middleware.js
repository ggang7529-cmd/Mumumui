// 옛 주소(galpi.pages.dev)로 들어온 요청을 새 도메인으로 영구 이동시킨다.
//
// 이미 공유된 링크와 검색엔진에 남아 있는 옛 주소가 죽지 않게 하고, 301로 보내야
// 구글/네이버가 두 주소를 "같은 페이지"로 합쳐서 새 도메인 쪽에 평가를 몰아준다.
// (그냥 두면 같은 내용이 두 주소에 있는 중복 콘텐츠로 취급된다.)
//
// 옮길 호스트를 목록으로 못박아 둔 이유:
// - 미리보기 배포는 <해시>.galpi.pages.dev 형태로 뜨는데, 그건 새 코드를 확인하는
//   용도라 절대 운영 도메인으로 튕기면 안 된다. 그래서 정확히 일치하는 것만 옮긴다.
// - 로컬 개발(127.0.0.1)과 새 도메인 자신은 당연히 그대로 통과시킨다.
var REDIRECT_HOSTS = ["galpi.pages.dev", "www.book-galpi.com"];
var CANONICAL_HOST = "book-galpi.com";

export async function onRequest(context) {
  var url = new URL(context.request.url);

  if (REDIRECT_HOSTS.indexOf(url.hostname) !== -1) {
    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    url.port = "";
    // 경로와 쿼리는 그대로 살린다 — /book/:id 링크가 그대로 새 도메인의 같은 책으로 가야 한다.
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
