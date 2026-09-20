// KDC(한국십진분류법) 대분류 정의 — 홈 화면 분류 드롭다운이 쓰는 이름 목록.
//
// js/moodTags.js와 같은 이유로 브라우저(js/render.js)와 서버(functions/_lib/bookClass.js)가
// 같은 파일을 import한다. Pages Functions는 빌드 때 번들되므로 functions/ 바깥 경로도
// 그대로 가져다 쓸 수 있다.
//
// 국립중앙도서관 "소장자료 검색"은 책마다 kdcCode1s(대분류 숫자 한 자리)와
// kdcName1s(그 이름)를 같이 준다. 이름을 그대로 믿지 않고 숫자를 여기 표에 넣어
// 이름을 만들어 쓰는 이유는, 같은 대분류인데 표기가 미묘하게 다른 값("사회과학" /
// "사회 과학")이 섞이면 드롭다운에 같은 분류가 두 줄로 나오기 때문이다. 숫자를 거치면
// 화면에 뜨는 이름은 항상 아래 10개 중 하나다.
export var KDC_MAIN_CLASSES = [
  { code: "0", name: "총류" },
  { code: "1", name: "철학" },
  { code: "2", name: "종교" },
  { code: "3", name: "사회과학" },
  { code: "4", name: "자연과학" },
  { code: "5", name: "기술과학" },
  { code: "6", name: "예술" },
  { code: "7", name: "언어" },
  { code: "8", name: "문학" },
  { code: "9", name: "역사" }
];

// 분류번호("813.7", "한813.7", "8", "813.7 1")에서 맨 앞 숫자 한 자리를 뽑아 대분류
// 이름으로 바꾼다. 국립중앙도서관 응답은 청구기호 접두사나 뒤따르는 저자기호가 붙어
// 오는 경우가 있어서, 숫자를 정규식으로 찾아낸 뒤 첫 자리만 본다.
export function kdcMainName(value) {
  var m = String(value || "").match(/\d/);
  if (!m) return "";
  for (var i = 0; i < KDC_MAIN_CLASSES.length; i++) {
    if (KDC_MAIN_CLASSES[i].code === m[0]) return KDC_MAIN_CLASSES[i].name;
  }
  return "";
}

// 드롭다운 정렬용. 가나다순이 아니라 KDC 번호 순(총류 → 철학 → … → 역사)으로 놓는다.
// 표에 없는 이름(예전에 정보나루로 채워둔 옛 값)은 뒤로 민다.
export function kdcOrder(name) {
  for (var i = 0; i < KDC_MAIN_CLASSES.length; i++) {
    if (KDC_MAIN_CLASSES[i].name === name) return i;
  }
  return KDC_MAIN_CLASSES.length;
}
