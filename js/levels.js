// 활동 점수 → 등급(레벨 번호 + 이모지 + 등급명) 매핑. 점수 배점은 functions/_lib/scores.js가 계산한다.
//
// 이 파일과 functions/_lib/levels.js는 내용이 완전히 동일한 의도적 중복이다 — 브라우저(js/)와
// Cloudflare Pages Functions(functions/)는 서로 다른 실행 환경이라 정적 자산을 공유 import할
// 수 없고, 표는 자주 안 바뀌는 고정 데이터라 두 곳에 두는 편이 빌드 설정을 얹는 것보다 낫다.
// 표를 바꿀 땐 반드시 두 파일을 함께 수정할 것.
var LEVELS = [
  { level: 1, min: 0, emoji: "🔖", name: "책갈피 입문자" },
  { level: 2, min: 10, emoji: "🔖", name: "표지만 구경" },
  { level: 3, min: 20, emoji: "🔖", name: "첫 장을 넘긴 사람" },
  { level: 4, min: 35, emoji: "🔖", name: "한 줄 감상가" },
  { level: 5, min: 50, emoji: "📚", name: "다독가 지망생" },
  { level: 6, min: 70, emoji: "📚", name: "책벌레" },
  { level: 7, min: 100, emoji: "📚", name: "책장 지킴이" },
  { level: 8, min: 140, emoji: "📚", name: "서재의 단골" },
  { level: 9, min: 190, emoji: "📚", name: "밤샘 독서러" },
  { level: 10, min: 250, emoji: "👻", name: "도서관 유령" },
  { level: 11, min: 320, emoji: "👻", name: "책갈피 헌터" },
  { level: 12, min: 400, emoji: "👻", name: "활자 중독자" },
  { level: 13, min: 500, emoji: "👻", name: "이동식 서재" },
  { level: 14, min: 620, emoji: "👻", name: "책갈피 큐레이터" },
  { level: 15, min: 760, emoji: "🦉", name: "서재의 현자" },
  { level: 16, min: 920, emoji: "🦉", name: "책갈피 장인" },
  { level: 17, min: 1100, emoji: "🦉", name: "살아있는 도서관" },
  { level: 18, min: 1300, emoji: "👑", name: "책갈피 마스터" },
  { level: 19, min: 1600, emoji: "👑", name: "전설의 다독가" },
  { level: 20, min: 2000, emoji: "👑", name: "책갈피 전설" }
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
