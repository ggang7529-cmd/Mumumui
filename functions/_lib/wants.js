// 읽고 싶어요. 표는 .internal/migrations/0008이 만들지만, 그 파일보다 코드가 먼저 배포돼도
// 깨지지 않게 쓰기 전에 같은 문장으로 만든다(featured_comments와 같은 방식). 읽을 때 표가
// 없으면 "아무도 안 담음"으로 본다.
var CREATE = [
  "CREATE TABLE IF NOT EXISTS wants (book_id TEXT NOT NULL, device_id TEXT NOT NULL, nickname TEXT, " +
    "created_at INTEGER NOT NULL, PRIMARY KEY (book_id, device_id))",
  "CREATE INDEX IF NOT EXISTS idx_wants_device ON wants (device_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_wants_nickname ON wants (nickname)"
];

export async function ensureWants(env) {
  await env.DB.batch(CREATE.map(function (s) { return env.DB.prepare(s); }));
}

// 담은 사람 수는 사람 단위로 센다 — 같은 닉네임이 폰과 PC에서 각각 담았으면 한 명이다
// (닉네임이 없는 기록은 기기 하나를 한 사람으로). "내가 담았나"도 이 기기 또는 같은 닉네임.
export async function wantStatus(env, bookId, deviceId, nickname) {
  try {
    var row = await env.DB.prepare(
      "SELECT count(DISTINCT coalesce(nullif(nickname, ''), device_id)) AS n, " +
      "sum(CASE WHEN device_id = ?2 OR (?3 != '' AND nickname = ?3) THEN 1 ELSE 0 END) AS mine " +
      "FROM wants WHERE book_id = ?1"
    ).bind(bookId, deviceId || "", nickname || "").first();
    return { count: (row && row.n) || 0, wanted: !!(row && row.mine) };
  } catch (e) {
    return { count: 0, wanted: false };
  }
}

// 책을 지우거나 판본을 합칠 때. 표가 없으면 지울 것도 없다.
export async function deleteWantsForBook(env, bookId) {
  try {
    await env.DB.prepare("DELETE FROM wants WHERE book_id = ?1").bind(bookId).run();
  } catch (e) {}
}
