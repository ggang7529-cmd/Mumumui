-- 홈 "이번 주의 한 줄"에 관리자가 고정한 한줄평. functions/api/featured.js가 처음 고정할 때
-- 같은 문장으로 스스로 만들기도 하므로, 이 파일을 먼저 돌리지 않아도 배포는 깨지지 않는다.
CREATE TABLE IF NOT EXISTS featured_comments (
  comment_id TEXT PRIMARY KEY,
  pinned_at INTEGER NOT NULL
);
