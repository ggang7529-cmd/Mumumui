// 활동 점수 → 등급(레벨 번호 + 아이콘 + 등급명) 매핑. js/levels.js와 내용이 완전히 동일한
// 의도적 중복이다 — 자세한 이유는 그쪽 파일 상단 주석 참고. 표를 바꿀 땐 반드시 두 파일을
// 함께 수정할 것.
// 구간(min)은 전부 최초 기획안의 2배로 잡혀 있다 — 등급명/레벨 번호/아이콘은 그대로 두고
// 점수만 두 배로 늘려 달라는 요청(2026-09-06)에 따른 것.
export var LEVELS = [
  { level: 1, min: 0, icon: "bookmark", name: "책갈피 입문자" },
  { level: 2, min: 20, icon: "bookmark", name: "표지만 구경" },
  { level: 3, min: 40, icon: "bookmark", name: "첫 장을 넘긴 사람" },
  { level: 4, min: 70, icon: "bookmark", name: "한 줄 감상가" },
  { level: 5, min: 100, icon: "books", name: "다독가 지망생" },
  { level: 6, min: 140, icon: "books", name: "책벌레" },
  { level: 7, min: 200, icon: "books", name: "책장 지킴이" },
  { level: 8, min: 280, icon: "books", name: "서재의 단골" },
  { level: 9, min: 380, icon: "books", name: "밤샘 독서러" },
  { level: 10, min: 500, icon: "ghost", name: "도서관 유령" },
  { level: 11, min: 640, icon: "ghost", name: "책갈피 헌터" },
  { level: 12, min: 800, icon: "ghost", name: "활자 중독자" },
  { level: 13, min: 1000, icon: "ghost", name: "이동식 서재" },
  { level: 14, min: 1240, icon: "ghost", name: "책갈피 큐레이터" },
  { level: 15, min: 1520, icon: "owl", name: "서재의 현자" },
  { level: 16, min: 1840, icon: "owl", name: "책갈피 장인" },
  { level: 17, min: 2200, icon: "owl", name: "살아있는 도서관" },
  { level: 18, min: 2600, icon: "crown", name: "책갈피 마스터" },
  { level: 19, min: 3200, icon: "crown", name: "전설의 다독가" },
  { level: 20, min: 4000, icon: "crown", name: "책갈피 전설" }
];

export function getLevel(score) {
  var s = score || 0;
  for (var i = LEVELS.length - 1; i >= 0; i--) {
    if (s >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

// 한줄평/답글처럼 한 줄에 별점·좋아요·날짜까지 같이 붙는 곳에서 쓰는 축약형:
// "레벨 닉네임" (예: "14 이과생"). 등급명까지 넣으면 줄이 너무 길어져서 뺐다.
//
// 등급 아이콘은 여기 넣지 않는다 — 이 함수는 축하 모달처럼 순수 텍스트로만 쓰이는 자리가
// 있어서 문자열을 반환해야 한다. 아이콘까지 붙은 형태가 필요한 화면은 getLevel(score).icon으로
// 아이콘 이름을 받아 직접 조립한다(js/render.js의 buildAuthorChip 참고).
export function formatNicknameShort(nickname, score) {
  var lvl = getLevel(score);
  return lvl.level + " " + (nickname || "익명");
}

// 헤더처럼 한 줄을 통째로 쓸 수 있는 곳에서 쓰는 전체형:
// "레벨 [등급명] 닉네임" (예: "14 [책갈피 큐레이터] 이과생").
export function formatNicknameFull(nickname, score) {
  var lvl = getLevel(score);
  return lvl.level + " [" + lvl.name + "] " + (nickname || "익명");
}

// 아래는 "등급 안내" 팝업(js/render.js renderLevelGuide)이 쓰는 표시용 도우미다. 점수를
// 매기는 로직은 여전히 functions/_lib/scores.js 한 곳에만 있고, 여기 있는 건 그 결과를
// 사람에게 보여주기 위한 계산뿐이다.

// 점수 배점표. 실제 계산은 functions/_lib/scores.js가 하며, 이 표는 팝업에 그대로 적어
// 보여주기 위한 사본이다 — 배점을 바꾸면 scores.js와 이 표를 함께 고쳐야 한다.
export var SCORE_RULES = [
  { label: "책 등록하기", points: 10 },
  { label: "한줄평 남기기", points: 3 },
  { label: "좋아요 받기", points: 1 },
  { label: "답글 남기기", points: 1 }
];

// 다음 등급. 최고 등급(20)이면 null.
export function nextLevel(score) {
  var cur = getLevel(score);
  for (var i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].level === cur.level + 1) return LEVELS[i];
  }
  return null;
}

// 진행 바에 필요한 값 한 벌: 지금 등급, 다음 등급, 다음까지 남은 점수, 구간 내 진행률.
// 최고 등급이면 next는 null, ratio는 1로 채워 막대가 가득 찬 채로 그려지게 한다.
export function levelProgress(score) {
  var s = score || 0;
  var cur = getLevel(s);
  var next = nextLevel(s);
  if (!next) return { current: cur, next: null, remain: 0, ratio: 1 };
  var span = next.min - cur.min;
  var done = s - cur.min;
  return {
    current: cur,
    next: next,
    remain: next.min - s,
    ratio: span > 0 ? Math.max(0, Math.min(1, done / span)) : 0
  };
}

// 등급명 뒤에 붙는 조사를 받침에 맞춰 고른다 — "[표지만 구경]으로", "[책벌레]로".
// 승급 토스트 한 곳에서만 쓰지만, 등급명과 같이 있어야 표를 고칠 때 같이 눈에 띈다.
// 이름이 대괄호에 싸여 나가는 자리라 이름을 붙여 돌려주지 않고 조사만 돌려준다.
export function levelParticle(name) {
  var text = name || "";
  var last = text.charCodeAt(text.length - 1);
  if (last >= 0xAC00 && last <= 0xD7A3) {
    var jong = (last - 0xAC00) % 28;
    // 받침이 없거나(0) ㄹ 받침(8)이면 "로", 나머지는 "으로".
    return jong === 0 || jong === 8 ? "로" : "으로";
  }
  return "으로";
}
