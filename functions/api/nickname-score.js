import { json } from "../_lib/db.js";
import { fetchScoreMap } from "../_lib/scores.js";

// 헤더의 "내 닉네임" 표시가 이모지+레벨+등급명까지 보여주려면 내 현재 점수를 알아야 한다.
// 로그인이 없는 사이트라 "나"는 그냥 이 닉네임 문자열이므로, 쿼리로 받은 닉네임 하나의
// 점수만 돌려준다.
export async function onRequestGet(context) {
  var env = context.env;
  var url = new URL(context.request.url);
  var name = (url.searchParams.get("name") || "").trim();
  if (!name) return json({ score: 0 });

  var scoreMap = await fetchScoreMap(env);
  return json({ score: scoreMap[name] || 0 });
}
