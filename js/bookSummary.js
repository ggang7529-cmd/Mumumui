// 책 상세의 "이 책의 기록" 요약 — 남긴 태그(많은 순 3개)와 별점 분포.
//
// 브라우저(js/render.js renderDetailSummary)와 서버(functions/book/[id].js의 SSR)가 같은 파일을
// 쓴다. 검색엔진이 보는 첫 HTML과 사람이 보는 화면이 같은 문장이어야 하고, 무엇보다 이 줄은
// 페이지마다 다른(이 사이트에만 있는) 글이라 책 페이지가 색인되는 데 도움이 된다(2026-10-16).
import { findMoodTag } from "./moodTags.js";

// moodCounts: { moodId: 개수 } → [{ label, count }] 많은 순(같으면 이름순) 최대 3개.
export function topTags(moodCounts) {
  var list = [];
  Object.keys(moodCounts || {}).forEach(function (id) {
    var tag = findMoodTag(id);
    if (tag && moodCounts[id] > 0) list.push({ label: tag.label, count: moodCounts[id] });
  });
  // 같은 수면 이름순 — 서버와 화면이 같은 순서로 그리게.
  list.sort(function (a, b) { return b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0); });
  return list.slice(0, 3);
}

// "위로받았어요 3 · 눈물 났어요 2"
export function tagsText(tags) {
  return (tags || []).map(function (t) { return t.label + " " + t.count; }).join(" · ");
}

// dist: [1점 수, 2점 수, …, 5점 수] → "★5 2명 · ★4 1명"(높은 별점부터, 0명은 뺌).
// 평가가 둘 이상일 때만 — 한 명뿐이면 위의 평균과 같은 말을 반복할 뿐이다.
export function distText(dist) {
  var total = 0;
  (dist || []).forEach(function (n) { total += n || 0; });
  if (total < 2) return "";
  var parts = [];
  for (var star = 5; star >= 1; star--) {
    var n = dist[star - 1] || 0;
    if (n) parts.push("★" + star + " " + n + "명");
  }
  return parts.join(" · ");
}
