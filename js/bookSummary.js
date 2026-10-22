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

// ── 책 페이지 제목·소개 문장(2026-10-22) ─────────────────────────────────────────
// 사람들이 책을 찾을 때 치는 말("아몬드 후기", "손원평 아몬드 한줄평")에 맞춰 제목에 저자와
// "한줄평·후기"를 넣고, 화면에도 책마다 다른 소개 문장을 한 줄 둔다. 서버(첫 HTML)와 화면이 같은
// 문장이어야 해서 여기 둔다.

// "아몬드 - 손원평 | 한줄평·후기 4개, 별점 4.6 | 책갈피"
// b: { title, author, lineCount, avg(평균 별점, 없으면 null) }
export function bookPageTitle(b) {
  var tail = "한줄평·후기" + (b.lineCount > 0 ? " " + b.lineCount + "개" : "") +
    (b.avg !== null && b.avg !== undefined ? ", 별점 " + Number(b.avg).toFixed(1) : "");
  return b.title + (b.author ? " - " + b.author : "") + " | " + tail + " | 책갈피";
}

// 받침 있는 글자로 끝나면 true. 한글이 아니면 숫자만 읽는 소리로 본다(1·3·6·7·8·0은 받침).
function endsWithBatchim(text) {
  var ch = String(text || "").trim().slice(-1);
  var code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return "136780".indexOf(ch) >= 0;
}

// "손원평의 『아몬드』를 읽은 7명이 남긴 별점은 평균 4.6점, 한줄평은 4개예요. 가장 많이 남긴 감정은
// '감동적이었어요'예요."
// b: { title, author, ratingCount, avg, lineCount, topTag(가장 많은 태그 이름, 없으면 "") }
export function bookIntroText(b) {
  var who = b.author ? b.author + "의 " : "";
  var book = "『" + b.title + "』";
  if (!(b.ratingCount > 0)) return who + book + "에는 아직 별점이 없어요. 첫 책갈피를 꽂아 보세요.";
  var text = who + book + (endsWithBatchim(b.title) ? "을" : "를") + " 읽은 " + b.ratingCount +
    "명이 남긴 별점은 평균 " + Number(b.avg).toFixed(1) + "점";
  text += b.lineCount > 0 ? ", 한줄평은 " + b.lineCount + "개예요." : "이에요. 아직 한줄평은 없어요.";
  if (b.topTag) text += " 가장 많이 남긴 감정은 '" + b.topTag + "'예요.";
  return text;
}
