// 활동 점수 → 등급(이모지 + 등급명) 매핑. js/levels.js와 내용이 완전히 동일한 의도적
// 중복이다 — 자세한 이유는 그쪽 파일 상단 주석 참고. 표를 바꿀 땐 반드시 두 파일을
// 함께 수정할 것.
var LEVELS = [
  { min: 0, emoji: "🔖", name: "책갈피 입문자" },
  { min: 10, emoji: "🔖", name: "표지만 구경" },
  { min: 20, emoji: "🔖", name: "첫 장을 넘긴 사람" },
  { min: 35, emoji: "🔖", name: "한 줄 감상가" },
  { min: 50, emoji: "📚", name: "다독가 지망생" },
  { min: 70, emoji: "📚", name: "책벌레" },
  { min: 100, emoji: "📚", name: "책장 지킴이" },
  { min: 140, emoji: "📚", name: "서재의 단골" },
  { min: 190, emoji: "📚", name: "밤샘 독서러" },
  { min: 250, emoji: "👻", name: "도서관 유령" },
  { min: 320, emoji: "👻", name: "책갈피 헌터" },
  { min: 400, emoji: "👻", name: "활자 중독자" },
  { min: 500, emoji: "👻", name: "이동식 서재" },
  { min: 620, emoji: "👻", name: "책갈피 큐레이터" },
  { min: 760, emoji: "🦉", name: "서재의 현자" },
  { min: 920, emoji: "🦉", name: "책갈피 장인" },
  { min: 1100, emoji: "🦉", name: "살아있는 도서관" },
  { min: 1300, emoji: "👑", name: "책갈피 마스터" },
  { min: 1600, emoji: "👑", name: "전설의 다독가" },
  { min: 2000, emoji: "👑", name: "책갈피 전설" }
];

export function getLevel(score) {
  var s = score || 0;
  for (var i = LEVELS.length - 1; i >= 0; i--) {
    if (s >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

// "이모지 [등급명] 닉네임" 형식으로 합쳐준다 (예: "📚 [책벌레] 이과생").
export function formatNicknameWithLevel(nickname, score) {
  var lvl = getLevel(score);
  return lvl.emoji + " [" + lvl.name + "] " + (nickname || "익명");
}
