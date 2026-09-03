-- 책 소개(카카오 책 검색 API의 contents 필드) 저장용 컬럼 추가.
-- Cloudflare 대시보드의 D1 데이터베이스 > Console 탭에 붙여넣어 실행하세요.
-- 반드시 이 마이그레이션을 운영 D1에 먼저 실행한 뒤에 관련 코드를 배포해야 합니다.

ALTER TABLE books ADD COLUMN contents TEXT;
