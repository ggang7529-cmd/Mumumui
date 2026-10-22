import { genreOfBook } from "./kdc.js";

// 책 상세 아래 "같은 갈래의 책" 고르기와 표지 없는 책의 책등 색. 브라우저(js/render.js)와
// 서버(functions/book/[id].js)가 같이 써서, 첫 HTML에 실린 링크와 js가 다시 그린 링크가 같다.
//
// 책 페이지끼리 서로 잇는 링크가 첫 HTML에 하나도 없어서, 구글 서치 콘솔에서 책 페이지의 참조
// 페이지가 홈 하나뿐이었다(2026-10-22). 이 칸과 "함께 꽂은 책"이 그 링크다.

export var COVER_COLORS = ["#1F3D33", "#7A2E2E", "#23264A", "#3D3A35", "#5A4632"];

export function coverFor(title) {
  var hash = 0;
  title = String(title || "");
  for (var i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return COVER_COLORS[hash % COVER_COLORS.length];
}

export var GENRE_BOOKS_LIMIT = 6;

// books: { id, title, classNo, category, commentCount, updatedAt } 목록.
// 같은 갈래(서점식, js/kdc.js genreOfBook)이면서 책갈피(한 줄)가 있는 책만 — 색인에 들어가는
// 책끼리 잇는다(한 줄이 없는 책 페이지는 noindex). 책갈피 많은 순, 같으면 최근 순.
// 갈래가 "기타"면 묶는 의미가 없어서 빈 목록. excludeIds는 "함께 꽂은 책"과 겹치지 않게.
export function pickGenreBooks(books, current, excludeIds, limit) {
  if (!current) return { genre: "", books: [] };
  var genre = genreOfBook(current.classNo, current.category);
  if (genre === "기타") return { genre: genre, books: [] };
  var skip = {};
  skip[current.id] = true;
  (excludeIds || []).forEach(function (id) { skip[id] = true; });
  var list = (books || []).filter(function (b) {
    return b && !skip[b.id] && (b.commentCount || 0) > 0 && genreOfBook(b.classNo, b.category) === genre;
  });
  list.sort(function (a, b) {
    return (b.commentCount || 0) - (a.commentCount || 0) || (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return { genre: genre, books: list.slice(0, limit || GENRE_BOOKS_LIMIT) };
}
