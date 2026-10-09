-- 별점만 남기기 + 읽고 싶어요 (2026-10-09).
--
-- 별점만 남긴 기록은 새 표가 아니라 comments에 들어간다(본문 '' + 태그 NULL, 닉네임이 없으면
-- author_name NULL). 그래서 표 구조는 그대로이고, (1)은 "이 기기가 이 책에 남긴 평가"를 빨리
-- 찾기 위한 색인일 뿐 데이터를 바꾸지 않는다. 같은 기기가 같은 책에 한줄평을 둘 남긴 옛
-- 기록이 있어서(2026-10-09 기준 6건) "책당 1개"는 UNIQUE가 아니라 코드가 지킨다 — UNIQUE로
-- 걸면 이 파일이 실패한다.
--
-- (2) wants는 functions/_lib/wants.js가 처음 쓸 때 같은 문장으로 스스로 만들기도 하므로,
-- 이 파일을 먼저 돌리지 않아도 배포는 깨지지 않는다(0007과 같은 방식).
--
-- Cloudflare 대시보드의 D1 데이터베이스 > Console 탭에 붙여넣어 실행하세요.

CREATE INDEX IF NOT EXISTS idx_comments_book_author ON comments (book_id, author_uid) WHERE parent_id IS NULL;

CREATE TABLE IF NOT EXISTS wants (
  book_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  nickname TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_wants_device ON wants (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wants_nickname ON wants (nickname);
