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

// ── 책 페이지 제목(2026-10-22) ──────────────────────────────────────────────────
// 사람들이 책을 찾을 때 치는 말("아몬드 후기", "손원평 아몬드 한줄평")에 맞춰 제목에 저자와
// "한줄평·후기"를 넣는다. (한때 책마다 숫자만 바뀌는 소개 문장도 화면에 뒀는데, 읽기 어색하다는
// 사용자 판단으로 2026-10-23에 뺐다.)

// "아몬드 - 손원평 | 한줄평·후기 4개, 별점 4.6 | 책갈피"
// b: { title, author, lineCount, avg(평균 별점, 없으면 null) }
export function bookPageTitle(b) {
  var tail = "한줄평·후기" + (b.lineCount > 0 ? " " + b.lineCount + "개" : "") +
    (b.avg !== null && b.avg !== undefined ? ", 별점 " + Number(b.avg).toFixed(1) : "");
  return b.title + (b.author ? " - " + b.author : "") + " | " + tail + " | 책갈피";
}
