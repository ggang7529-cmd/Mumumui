// /my — "내 책장"(이 기기가 평가한 책 · 읽고 싶은 책)의 고유 주소. 화면은 js/render.js
// renderMyShelf가 그린다. /recommend와 같은 이유로 색인에서 뺀다 — 방문자 브라우저의 기기
// id로 그리는 개인 화면이라 크롤러에게는 빈 껍데기다.
export async function onRequestGet(context) {
  var reqUrl = new URL(context.request.url);
  var indexRes = await context.env.ASSETS.fetch(new URL("/", reqUrl));
  var html = await indexRes.text();

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "X-Robots-Tag": "noindex"
    }
  });
}
