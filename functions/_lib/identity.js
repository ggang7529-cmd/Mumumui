// 닉네임 전용 모드에서 쓰는 익명 식별자 처리. 클라이언트가 X-Anon-Id 헤더로 보내는 값을
// (로그인 없이) 그대로 신뢰한다 — Google 로그인/세션 검증(session.js)은 손대지 않고 남겨둠.

export function getAnonUid(request) {
  var uid = request.headers.get("X-Anon-Id");
  if (!uid) return null;
  uid = String(uid).trim().slice(0, 100);
  return uid || null;
}
