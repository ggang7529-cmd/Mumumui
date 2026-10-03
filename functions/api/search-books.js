import { json } from "../_lib/db.js";
import { checkRateLimit } from "../_lib/rateLimit.js";

export async function onRequestGet(context) {
  var env = context.env;
  var url = new URL(context.request.url);
  var q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  if (!q) return json({ books: [] });

  var rateOk = await checkRateLimit(env, context.request, "search-books", 20, 60000);
  if (!rateOk) return json({ error: "검색을 너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  if (!env.KAKAO_REST_API_KEY) {
    return json({ error: "카카오 API 키가 설정되지 않았어요." }, { status: 500 });
  }

  // 20건을 받는다. 책장에 추가하기 검색은 판본만 다른 책을 한 줄로 묶어 보여주므로
  // (js/bookIdentity.js), 10건이면 한 책의 판본 몇 개로 목록이 다 차버린다.
  var kakaoUrl = "https://dapi.kakao.com/v3/search/book?size=20&query=" + encodeURIComponent(q);
  var res = await fetch(kakaoUrl, {
    headers: { Authorization: "KakaoAK " + env.KAKAO_REST_API_KEY }
  });

  if (!res.ok) {
    return json({ error: "책 검색에 실패했어요 (" + res.status + ")" }, { status: 502 });
  }

  var data = await res.json();
  var books = (data.documents || []).map(function (d) {
    return {
      title: d.title || "",
      author: (d.authors || []).join(", "),
      publisher: d.publisher || "",
      cover: d.thumbnail || null,
      isbn: d.isbn || "",
      contents: d.contents || "",
      // 출간일. 판본을 묶을 때 "표지 있는 최신판"을 대표로 고르는 데 쓴다.
      datetime: d.datetime || ""
    };
  });

  return json({ books: books });
}
