import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { lookupLibraryCategory } from "../../_lib/libraryCategory.js";

// 관리자 전용 진단 라우트. LIBRARY_API_KEY는 Cloudflare Pages 환경변수라 코드에서 값
// 자체를 읽어 보여줄 방법이 없고, 값을 그대로 응답에 실어 보내도 안 되므로 — 키가
// 설정돼 있는지(boolean)와, 설정돼 있다면 실제로 살아있는 호출을 해 본 결과만 돌려준다.
// "설정은 했는데 키가 틀렸다"와 "아예 설정을 안 했다"를 구분하는 게 목적이라, 두 경우
// 다 최종적으로는 책 등록 시 분류가 조용히 비게 되지만 원인은 다르다.
//
// ?isbn13= 쿼리로 특정 ISBN을 지정할 수 있다. 기본값(사피엔스)조차 실제로 도서관
// 소장 목록에 없을 수 있다는 게 실사용 중 확인됐다 — data4library는 회원 도서관이
// "지금 그 판본을 실제로 갖고 있는" 책만 색인하므로, 잘 알려진 책도 못 찾는 게 드문
// 일이 아니다. 그래서 이 라우트의 found는 "그 책이 존재하는지"가 아니라 어디까지나
// "API 왕복 자체가 되는지"의 참고용이고, 실제로 등록된 책의 ISBN을 넣어 개별로
// 확인하고 싶을 때 이 쿼리 파라미터를 쓴다.
var DEFAULT_TEST_ISBN13 = "9788934972464"; // 사피엔스

export async function onRequestGet(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  var queryIsbn13 = new URL(context.request.url).searchParams.get("isbn13");
  var testIsbn13 = queryIsbn13 && /^\d{13}$/.test(queryIsbn13) ? queryIsbn13 : DEFAULT_TEST_ISBN13;

  var keyConfigured = !!env.LIBRARY_API_KEY;
  var testResult = keyConfigured
    ? await lookupLibraryCategory(env, testIsbn13)
    : { ok: false, reason: "no-key" };

  return json({
    keyConfigured: keyConfigured,
    testIsbn13: testIsbn13,
    testResult: testResult
  });
}
