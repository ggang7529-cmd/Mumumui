import { json } from "../_lib/db.js";
import { fetchScoreMap } from "../_lib/scores.js";

// 등급 안내 팝업의 "전체 순위" 화면. 점수 계산은 여기서 하지 않고
// functions/_lib/scores.js가 만든 표를 정렬해서 내보내기만 한다.
//
// 닉네임은 이미 모든 한줄평에 그대로 노출되는 공개 정보라 누구나 볼 수 있게 둔다.
// 점수도 헤더 칩에 등급으로 이미 드러나 있다.
//
// 사람이 아주 많아졌을 때 응답이 무한정 커지지 않게 상한을 둔다. 지금 규모에서는
// 걸릴 일이 없고, 걸리게 되면 "내 순위는 팝업 위쪽에 따로 적혀 있다"가 이미 답이다.
var MAX_ROWS = 100;

export async function onRequestGet(context) {
  var scoreMap = await fetchScoreMap(context.env);

  var rows = Object.keys(scoreMap).map(function (name) {
    return { name: name, score: scoreMap[name] };
  });

  // 점수 내림차순. 동점이면 닉네임 순으로 고정한다 — 순서를 정하지 않으면 새로고침할
  // 때마다 동점자끼리 자리가 바뀌어서, 보는 사람은 순위가 흔들린다고 느낀다.
  rows.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // 동점자는 같은 순위(1, 2, 2, 4식). nickname-score.js와 같은 규칙이라 내 순위가
  // 두 화면에서 다르게 보이는 일이 없다.
  var rank = 0;
  var prevScore = null;
  rows.forEach(function (r, i) {
    if (r.score !== prevScore) {
      rank = i + 1;
      prevScore = r.score;
    }
    r.rank = rank;
  });

  return json({ total: rows.length, ranking: rows.slice(0, MAX_ROWS) });
}
