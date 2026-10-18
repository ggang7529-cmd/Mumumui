// /book-of-month — "지난 이달의 책"의 고유 주소. 화면은 js/render.js renderBomPast가 그린다.
// 누가 열어도 같은 목록이지만 내용을 js가 받아 그리므로 첫 HTML은 홈과 같다(sitemap에는 안 넣음).
export async function onRequestGet(context) {
  var reqUrl = new URL(context.request.url);
  var indexRes = await context.env.ASSETS.fetch(new URL("/", reqUrl));
  var html = await indexRes.text();
  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}
