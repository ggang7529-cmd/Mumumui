-- 감정 태그(한줄평에 하나만 고르는 선택 항목) 저장용 컬럼 추가.
-- comments.mood에는 js/moodTags.js의 MOOD_TAGS[].id를 넣는다(예: "moved"). 문구나
-- 이모지가 바뀌어도 기존 행을 손대지 않아도 되도록 label이 아니라 id를 저장한다.
-- books.mood는 책 등록 때 함께 저장되는 첫 한줄평의 태그를 그대로 복사해둔 값이다
-- (books.text가 첫 한줄평 본문을 복사해두는 것과 같은 이유 — 링크 미리보기/RSS용).
--
-- Cloudflare 대시보드의 D1 데이터베이스 > Console 탭에 붙여넣어 실행하세요.
-- 반드시 이 마이그레이션을 운영 D1에 먼저 실행한 뒤에 관련 코드를 배포해야 합니다.
-- (둘 다 ADD COLUMN이라 기존 데이터를 지우거나 바꾸지 않습니다. 기존 행의 mood는 NULL,
--  즉 "태그 없음"이 되고 화면에는 지금까지와 똑같이 보입니다.)

ALTER TABLE comments ADD COLUMN mood TEXT;
ALTER TABLE books ADD COLUMN mood TEXT;
