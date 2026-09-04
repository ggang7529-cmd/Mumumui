-- 책 분류(국립중앙도서관 "도서관 정보나루" API의 class_nm, 예: "문학 > 한국문학 > 소설") 저장용 컬럼 추가.
-- Cloudflare 대시보드의 D1 데이터베이스 > Console 탭에 붙여넣어 실행하세요.
-- 반드시 이 마이그레이션을 운영 D1에 먼저 실행한 뒤에 관련 코드를 배포해야 합니다.

ALTER TABLE books ADD COLUMN category TEXT;
