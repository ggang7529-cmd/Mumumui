-- 책갈피 색 (2026-10-20, 리디자인 B안). 한 줄마다 사람이 고른 책갈피 색(tomato/cobalt/mint/butter).
-- 없으면(NULL) 화면이 한 줄의 id로 넷 중 하나를 정한다(js/bookmarkColor.js). 코드는 이 칸이 없어도
-- 깨지지 않는다(functions/_lib/commentColor.js) — 돌리면 그때부터 고른 색이 저장된다.
-- D1 Console에는 아래 한 줄만 붙여넣으세요(주석 줄은 빼고).

ALTER TABLE comments ADD COLUMN color TEXT;
