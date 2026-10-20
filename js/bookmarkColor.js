// 책갈피 색(리디자인 B안). 한 줄 하나 = 실물 책갈피 하나라서 색이 있다. 브라우저와 Functions가
// 같이 쓴다.
//
// 사람이 고른 색(comments.color — .internal/migrations/0011)이 있으면 그 색, 없으면 한 줄의
// id로 넷 중 하나를 정한다. 목록 순서로 돌리면 새 한 줄이 올라올 때마다 아래 것들 색이 다
// 바뀌어서, 같은 한 줄은 어디서 봐도 같은 색이 되게 id에 묶었다.
export var BOOKMARK_COLORS = ["tomato", "cobalt", "mint", "butter"];

export var BOOKMARK_COLOR_LABELS = { tomato: "토마토", cobalt: "코발트", mint: "민트", butter: "버터" };

export function normalizeBookmarkColor(value) {
  return BOOKMARK_COLORS.indexOf(value) >= 0 ? value : null;
}

export function bookmarkColorOf(id, color) {
  var picked = normalizeBookmarkColor(color);
  if (picked) return picked;
  var s = String(id || ""), h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return BOOKMARK_COLORS[h % BOOKMARK_COLORS.length];
}
