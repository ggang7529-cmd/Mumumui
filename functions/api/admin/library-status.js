import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { lookupLibraryCategory } from "../../_lib/libraryCategory.js";

// 관리자 전용 진단 라우트. LIBRARY_API_KEY는 Cloudflare Pages 환경변수라 코드에서 값
// 자체를 읽어 보여줄 방법이 없고, 값을 그대로 응답에 실어 보내도 안 되므로 — 키가
// 설정돼 있는지(boolean)와, 설정돼 있다면 실제로 잘 알려진 책 한 권으로 살아있는 호출을
// 해 본 결과만 돌려준다. "설정은 했는데 키가 틀렸다"와 "아예 설정을 안 했다"를 구분하는
// 게 목적이라, 두 경우 다 최종적으로는 책 등록 시 분류가 조용히 비게 되지만 원인은 다르다.
var TEST_ISBN13 = "9788934972464"; // 사피엔스 — 국내 도서관 소장이 흔해 조회가 거의 항상 성공하는 책

export async function onRequestGet(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  var keyConfigured = !!env.LIBRARY_API_KEY;
  var testResult = keyConfigured
    ? await lookupLibraryCategory(env, TEST_ISBN13)
    : { ok: false, reason: "no-key" };

  return json({
    keyConfigured: keyConfigured,
    testIsbn13: TEST_ISBN13,
    testResult: testResult
  });
}
