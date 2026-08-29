// 고정 윈도우 방식의 간단한 요청 횟수 제한. Workers/Pages Functions는 요청마다 다른
// isolate에서 실행될 수 있어 메모리에 카운트를 못 두므로, 이미 바인딩돼 있는 D1에
// (열쇠, 횟수, 윈도우 시작 시각)만 저장해 별도 바인딩(KV 등) 없이 구현한다.
//
// Pages Functions에는 Cron Trigger가 없어 별도 정리 배치를 둘 수 없으므로, 만료된
// 행은 매 호출마다 확률적으로(1/20) 함께 지운다. 현재 모든 호출부의 windowMs는
// 60초이지만, 혹시 미래에 더 긴 윈도우가 추가돼도 안전하도록 넉넉한 1시간을
// 기준으로 삼는다 — 그보다 오래된 행은 어떤 윈도우에서도 이미 만료된 것이 확실하다.
var STALE_ROW_MAX_AGE_MS = 60 * 60 * 1000;

export async function checkRateLimit(env, request, key, limit, windowMs) {
  var ip = request.headers.get("CF-Connecting-IP") || "unknown";
  var id = key + ":" + ip;
  var now = Date.now();

  if (Math.random() < 0.05) {
    await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(now - STALE_ROW_MAX_AGE_MS).run();
  }

  var row = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE id = ?1").bind(id).first();

  if (!row || now - row.window_start > windowMs) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (id, count, window_start) VALUES (?1, 1, ?2) " +
      "ON CONFLICT(id) DO UPDATE SET count = 1, window_start = ?2"
    ).bind(id, now).run();
    return true;
  }

  if (row.count >= limit) return false;

  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE id = ?1").bind(id).run();
  return true;
}
