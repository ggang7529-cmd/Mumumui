// /recommend — "나를 위한 추천" 화면의 고유 주소.
//
// 화면 자체는 js/render.js renderRecommend가 그린다. 여기서 하는 일은 index.html을 그대로
// 내보내는 것뿐이다(Pages는 "/" 외의 경로에 index.html을 자동으로 물려주지 않는다).
//
// 검색엔진에는 올리지 않는다. 추천 목록은 방문자의 브라우저에 저장된 닉네임으로 그리는
// 개인 화면이라 크롤러가 받아가면 내용 없는 빈 껍데기뿐이고, 그런 페이지가 색인에 쌓이면
// 사이트 전체의 품질 평가에 도움이 되지 않는다. robots.txt는 건드리지 않고(모든 크롤러
// 허용 유지) 이 경로 하나만 헤더로 색인에서 뺀다.
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
