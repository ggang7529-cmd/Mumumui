-- Rate limit(요청 횟수 제한) 지원을 위한 마이그레이션. Cloudflare 대시보드의 D1 데이터베이스 > 콘솔 탭에 붙여넣어 실행하세요.
-- (신규로 D1을 만드는 경우엔 필요 없음 — schema.sql에 이미 반영되어 있음)

CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
