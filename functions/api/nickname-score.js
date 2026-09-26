import { json } from "../_lib/db.js";
import { fetchScoreMap } from "../_lib/scores.js";

// 헤더의 "내 닉네임" 표시가 이모지+레벨+등급명까지 보여주려면 내 현재 점수를 알아야 한다.
// 로그인이 없는 사이트라 "나"는 그냥 이 닉네임 문자열이므로, 쿼리로 받은 닉네임 하나의
// 점수만 돌려준다.
// 등급 안내 팝업이 "9명 중 3위"까지 보여주므로 순위와 참여자 수도 같이 돌려준다.
// fetchScoreMap이 어차피 전원의 점수를 한 번에 가져오므로, 질의를 더 하지 않고
// 그 자리에서 세기만 하면 된다.
//
// 동점자는 같은 순위를 갖는다(1, 2, 2, 4식). 점수가 책 한 권 = 10점처럼 큼직하게
// 떨어져서 동점이 흔한데, 먼저 기록했다는 이유로 위에 세우면 화면에서 설명할 수 없는
// 차이가 된다.
export async function onRequestGet(context) {
  var env = context.env;
  var url = new URL(context.request.url);
  var name = (url.searchParams.get("name") || "").trim();
  if (!name) return json({ score: 0, rank: null, total: 0 });

  var scoreMap = await fetchScoreMap(env);
  var names = Object.keys(scoreMap);
  var score = scoreMap[name] || 0;

  // 점수표에 없는 닉네임(아직 아무 기록도 없거나 오타)은 순위를 매기지 않는다.
  // 0점을 꼴찌로 끼워 넣으면 "9명 중 10위" 같은 값이 나온다.
  var rank = null;
  if (scoreMap[name] !== undefined) {
    var above = 0;
    for (var i = 0; i < names.length; i++) {
      if (scoreMap[names[i]] > score) above++;
    }
    rank = above + 1;
  }

  return json({ score: score, rank: rank, total: names.length });
}
