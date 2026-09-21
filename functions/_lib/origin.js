// 응답에 적어 내보내는 주소(사이트맵 <loc>, robots의 Sitemap 줄, RSS link, canonical,
// og:url)를 만들 때 쓴다.
//
// 예전에는 요청이 들어온 주소를 그대로(new URL(request.url).origin) 썼다. 그러면 크롤러가
// 한 번이라도 http://로 들어오는 순간 우리가 http:// 주소를 적어 내보내고, 그게 다시
// 크롤링돼서 http 주소가 계속 퍼진다. 실제로 구글 서치 콘솔이 http://book-galpi.com/
// sitemap.xml을 "리디렉션 오류"로 잡았다(2026-09-18 크롤링).
//
// 호스트는 요청에 들어온 것을 그대로 둔다 — 미리보기 배포(<해시>.galpi.pages.dev)는
// 자기 주소를 써야 하고, 운영 도메인이 아닌 곳에서 운영 주소를 뱉으면 미리보기 확인이
// 엉킨다. 프로토콜만 https로 못박는다.
//
// 로컬 개발만 예외다. 127.0.0.1은 https를 서빙하지 않아서, 여기까지 https로 바꾸면
// wrangler로 띄운 화면에서 링크가 전부 죽는다.
var LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

export function canonicalOrigin(request) {
  var url = new URL(request.url);
  if (LOCAL_HOSTS.indexOf(url.hostname) !== -1) return url.origin;
  url.protocol = "https:";
  url.port = "";
  return url.origin;
}
