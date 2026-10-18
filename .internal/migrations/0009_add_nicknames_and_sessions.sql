-- 닉네임 소유(4자리 PIN) (2026-10-18, A-1).
--
-- nicknames: 닉네임 하나에 한 행. nickname_key는 lower(trim(닉네임))이라 "Yosang"과 " yosang"이
-- 같은 닉네임이 된다. status는 reserved(예전부터 쓰던 이름, 아직 PIN 없음)/owned(PIN 있음).
-- PIN 원문은 어디에도 남지 않는다 — pin_hash는 PIN_PEPPER(Pages 비밀 환경변수)로 HMAC한 값을
-- 랜덤 pin_salt로 PBKDF2-SHA256(pin_iter회) 돌린 결과다(functions/_lib/nickname.js).
-- 5번 틀리면 잠그고, 잠길 때마다 lock_level이 올라 15분 → 1시간 → 24시간으로 길어진다.
--
-- nickname_sessions: PIN을 맞춘 기기에 준 토큰. 토큰 원문은 그 기기의 localStorage에만 있고
-- 여기에는 SHA-256 값만 둔다. PIN을 초기화하면 그 닉네임의 행을 모두 지워 다른 기기를 내보낸다.
--
-- 두 표는 functions/_lib/nickname.js가 처음 쓸 때 같은 문장으로 스스로 만들기도 하므로, 이
-- 파일을 먼저 돌리지 않아도 배포는 깨지지 않는다(0007·0008과 같은 방식).
--
-- Cloudflare 대시보드의 D1 데이터베이스 > Console 탭에 붙여넣어 실행하세요. (콘솔은 붙여넣은
-- 글을 한 줄로 다루므로 이 주석 줄들은 빼고 CREATE 문만 붙여넣으세요.)

CREATE TABLE IF NOT EXISTS nicknames (nickname_key TEXT PRIMARY KEY, nickname TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('reserved', 'owned')), pin_hash TEXT, pin_salt TEXT, pin_iter INTEGER, failed_count INTEGER NOT NULL DEFAULT 0, lock_level INTEGER NOT NULL DEFAULT 0, locked_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS nickname_sessions (token_hash TEXT PRIMARY KEY, nickname_key TEXT NOT NULL, device_id TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_nickname_sessions_key ON nickname_sessions (nickname_key);
