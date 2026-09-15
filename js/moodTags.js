// 감정 태그 정의 — 한줄평에 하나만 고를 수 있는 선택 항목.
//
// 브라우저(js/main.js, js/render.js)와 서버(functions/…)가 같은 파일을 import한다.
// Pages Functions는 빌드 때 번들되므로 functions/ 바깥 경로도 그대로 가져다 쓸 수 있다.
// 한쪽에만 고쳐 넣어 목록이 어긋나는 일을 없애려고 일부러 한 곳에 모아뒀다.
//
// DB(comments.mood, books.mood)에는 label이 아니라 id를 저장한다. 문구나 이모지는
// 나중에 바꿀 수 있어야 하는데, label을 저장해두면 그때마다 기존 행을 손봐야 한다.
export var MOOD_TAGS = [
  { id: "fun", label: "재밌었어요", emoji: "📖" },
  { id: "moved", label: "감동적이었어요", emoji: "🥹" },
  { id: "meh", label: "아쉬웠어요", emoji: "😐" },
  { id: "reread", label: "다시 읽고 싶어요", emoji: "🔁" },
  { id: "thoughtful", label: "생각이 많아지는 책", emoji: "🤔" }
];

// 알 수 없는 값(옛 id, 손으로 만든 요청)은 조용히 없는 것으로 친다 — 태그는 선택
// 항목이라 여기서 막아 세울 이유가 없다.
export function findMoodTag(id) {
  if (!id) return null;
  for (var i = 0; i < MOOD_TAGS.length; i++) {
    if (MOOD_TAGS[i].id === id) return MOOD_TAGS[i];
  }
  return null;
}

// 저장 직전에 부르는 검증용. 목록에 있는 id면 그대로, 아니면 null을 준다.
export function normalizeMoodId(value) {
  var tag = findMoodTag(typeof value === "string" ? value.trim() : "");
  return tag ? tag.id : null;
}
