-- 대댓글(답글) 지원을 위한 마이그레이션. Cloudflare 대시보드의 D1 데이터베이스 > 콘솔 탭에 붙여넣어 실행하세요.
-- (신규로 D1을 만드는 경우엔 필요 없음 — schema.sql에 이미 반영되어 있음)

ALTER TABLE comments ADD COLUMN parent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments (parent_id);
