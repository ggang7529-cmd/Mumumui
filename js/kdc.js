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

// 홈 "모두의 책장"의 분류 칩. 대분류 10개("문학"·"사회과학")는 너무 굵어서, 서점에서
// 흔히 쓰는 갈래(소설·에세이·시·인문·사회 …)로 다시 나눈다. 근거는 국립중앙도서관이 준
// 상세 분류번호(class_no, "813.7")이고, 그게 없으면 대분류 이름(category)으로 대신한다.
//
// - 문학(8xx)은 셋째 자리가 형식이다: 1 시, 3 소설, 4 수필, 5 연설·웅변, 6 일기·서간·기행.
//   4·5·6을 "에세이"로 묶고, 그 밖의 문학(희곡·평론·문학 일반 등)은 "문학".
// - 자기계발은 KDC에 따로 칸이 없고 실제로는 199(처세·성공법)나 325.2(경영 > 자기관리)에
//   들어간다. 그래서 그 두 번호만 먼저 떼어 낸다.
// - 32x(경제·경영)는 사회에서 따로 뺀다. 59x(가정·생활: 요리·육아)도 기술과학에서 뺀다.
export var GENRE_ORDER = ["소설", "에세이", "시", "문학", "인문", "사회", "경제·경영", "자기계발", "과학", "생활", "예술", "역사", "기타"];

var GENRE_BY_MAIN_CLASS = {
  "0": "인문", "1": "인문", "2": "인문", "3": "사회", "4": "과학",
  "5": "과학", "6": "예술", "7": "인문", "8": "문학", "9": "역사"
};

export function genreOfBook(classNo, category) {
  var m = String(classNo || "").match(/\d+(\.\d+)?/);
  if (m) {
    var num = m[0];
    var digits = num.replace(".", "");
    if (digits[0] === "8") {
      var form = digits[2];
      if (form === "3") return "소설";
      if (form === "1") return "시";
      if (form === "4" || form === "5" || form === "6") return "에세이";
      return "문학";
    }
    if (num.indexOf("199") === 0 || num.indexOf("325.2") === 0) return "자기계발";
    if (digits[0] === "3" && digits[1] === "2") return "경제·경영";
    if (digits[0] === "5" && digits[1] === "9") return "생활";
    if (GENRE_BY_MAIN_CLASS[digits[0]]) return GENRE_BY_MAIN_CLASS[digits[0]];
  }
  // 상세 번호가 없으면 대분류 이름으로. 정보나루 시절의 "문학 > 소설" 같은 경로 값도 앞 칸만 본다.
  var name = String(category || "").split(">")[0].trim();
  for (var i = 0; i < KDC_MAIN_CLASSES.length; i++) {
    if (KDC_MAIN_CLASSES[i].name === name) return GENRE_BY_MAIN_CLASS[KDC_MAIN_CLASSES[i].code];
  }
  return "기타";
}
