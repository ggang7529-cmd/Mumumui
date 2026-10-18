-- 이달의 책 (2026-10-18, B-1). 관리자가 책·기간·질문을 정한다(functions/_lib/bookOfMonth.js).
-- 기간은 [starts_at, ends_at) 밀리초. functions/api/admin/book-of-month.js가 처음 쓸 때 같은
-- 문장으로 스스로 만들기도 하므로, 이 파일을 먼저 돌리지 않아도 배포는 깨지지 않는다.
--
-- D1 Console은 붙여넣은 글을 한 줄로 다루므로 이 주석 줄들은 빼고 CREATE 문만 붙여넣으세요.

CREATE TABLE IF NOT EXISTS book_of_month (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, question TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_book_of_month_period ON book_of_month (starts_at, ends_at);
