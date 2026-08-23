import { json } from "../_lib/db.js";

export async function onRequestGet(context) {
  var env = context.env;
  var url = new URL(context.request.url);
  var q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  if (!q) return json({ books: [] });

  if (!env.KAKAO_REST_API_KEY) {
    return json({ error: "카카오 API 키가 설정되지 않았어요." }, { status: 500 });
  }

  var kakaoUrl = "https://dapi.kakao.com/v3/search/book?size=10&query=" + encodeURIComponent(q);
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
      isbn: d.isbn || ""
    };
  });

  return json({ books: books });
}
