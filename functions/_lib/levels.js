// 활동 점수 → 등급(레벨 번호 + 이모지 + 등급명) 매핑. js/levels.js와 내용이 완전히 동일한
// 의도적 중복이다 — 자세한 이유는 그쪽 파일 상단 주석 참고. 표를 바꿀 땐 반드시 두 파일을
// 함께 수정할 것.
// 구간(min)은 전부 최초 기획안의 2배로 잡혀 있다 — 등급명/레벨 번호/이모지는 그대로 두고
// 점수만 두 배로 늘려 달라는 요청(2026-09-06)에 따른 것.
var LEVELS = [
  { level: 1, min: 0, emoji: "🔖", name: "책갈피 입문자" },
  { level: 2, min: 20, emoji: "🔖", name: "표지만 구경" },
  { level: 3, min: 40, emoji: "🔖", name: "첫 장을 넘긴 사람" },
  { level: 4, min: 70, emoji: "🔖", name: "한 줄 감상가" },
  { level: 5, min: 100, emoji: "📚", name: "다독가 지망생" },
  { level: 6, min: 140, emoji: "📚", name: "책벌레" },
  { level: 7, min: 200, emoji: "📚", name: "책장 지킴이" },
  { level: 8, min: 280, emoji: "📚", name: "서재의 단골" },
  { level: 9, min: 380, emoji: "📚", name: "밤샘 독서러" },
  { level: 10, min: 500, emoji: "👻", name: "도서관 유령" },
  { level: 11, min: 640, emoji: "👻", name: "책갈피 헌터" },
  { level: 12, min: 800, emoji: "👻", name: "활자 중독자" },
  { level: 13, min: 1000, emoji: "👻", name: "이동식 서재" },
  { level: 14, min: 1240, emoji: "👻", name: "책갈피 큐레이터" },
  { level: 15, min: 1520, emoji: "🦉", name: "서재의 현자" },
  { level: 16, min: 1840, emoji: "🦉", name: "책갈피 장인" },
  { level: 17, min: 2200, emoji: "🦉", name: "살아있는 도서관" },
  { level: 18, min: 2600, emoji: "👑", name: "책갈피 마스터" },
  { level: 19, min: 3200, emoji: "👑", name: "전설의 다독가" },
  { level: 20, min: 4000, emoji: "👑", name: "책갈피 전설" }
];

export function getLevel(score) {
  var s = score || 0;
  for (var i = LEVELS.length - 1; i >= 0; i--) {
    if (s >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

// 한줄평/답글처럼 한 줄에 별점·좋아요·날짜까지 같이 붙는 곳에서 쓰는 축약형:
// "이모지 레벨 닉네임" (예: "👻 14 이과생"). 등급명까지 넣으면 줄이 너무 길어져서 뺐다.
export function formatNicknameShort(nickname, score) {
  var lvl = getLevel(score);
  return lvl.emoji + " " + lvl.level + " " + (nickname || "익명");
}

// 헤더처럼 한 줄을 통째로 쓸 수 있는 곳에서 쓰는 전체형:
// "이모지 레벨 [등급명] 닉네임" (예: "👻 14 [책갈피 큐레이터] 이과생").
export function formatNicknameFull(nickname, score) {
  var lvl = getLevel(score);
  return lvl.emoji + " " + lvl.level + " [" + lvl.name + "] " + (nickname || "익명");
}
