// 닉네임 PIN(4자리 숫자) 규칙. 브라우저(js/main.js의 PIN 시트)와 Functions
// (functions/api/nickname/pin.js)가 같은 파일을 쓴다 — 화면에서 미리 막고, 서버가 다시 막는다.

// 닉네임 비교 열쇠. 앞뒤 공백을 떼고 대소문자를 무시한다("Yosang" = " yosang").
export function nicknameKey(name) {
  return String(name || "").trim().toLowerCase();
}

export function isPinFormat(pin) {
  return /^[0-9]{4}$/.test(String(pin || ""));
}

// 쉬운 번호: 같은 숫자 넷(0000, 1111…)과 하나씩 오르거나 내리는 숫자(0123, 1234, 4321,
// 7890, 9876…). 7890·0987처럼 9와 0을 잇는 것도 키패드에서 한 줄이라 같이 막는다.
export function isWeakPin(pin) {
  var s = String(pin || "");
  if (!isPinFormat(s)) return true;
  var d = s.split("").map(Number);
  if (d[0] === d[1] && d[1] === d[2] && d[2] === d[3]) return true;
  var up = true, down = true;
  for (var i = 1; i < 4; i++) {
    if ((d[i - 1] + 1) % 10 !== d[i]) up = false;
    if ((d[i - 1] + 9) % 10 !== d[i]) down = false;
  }
  return up || down;
}
