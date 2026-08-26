// 고정 윈도우 방식의 간단한 요청 횟수 제한. Workers/Pages Functions는 요청마다 다른
// isolate에서 실행될 수 있어 메모리에 카운트를 못 두므로, 이미 바인딩돼 있는 D1에
// (열쇠, 횟수, 윈도우 시작 시각)만 저장해 별도 바인딩(KV 등) 없이 구현한다.
export async function checkRateLimit(env, request, key, limit, windowMs) {
  var ip = request.headers.get("CF-Connecting-IP") || "unknown";
  var id = key + ":" + ip;
  var now = Date.now();

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
