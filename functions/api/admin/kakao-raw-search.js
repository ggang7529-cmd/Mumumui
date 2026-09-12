import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";

// 관리자 전용 진단 라우트. functions/api/search-books.js는 클라이언트가 쓰는 필드
// (title/author/publisher/cover/isbn/contents)만 추려서 돌려주는데, 카카오 책 검색
// API가 실제로 어떤 필드를 더 주는지 — 특히 장르/분류에 쓸 만한 필드가 있는지 —
// 확인하려면 가공하지 않은 원본 응답을 봐야 한다. 이 라우트는 그 원본을 그대로
// 보여준다. data4library 대신 카카오 검색 결과에서 직접 장르를 뽑을 수 있는지
// 조사하는 동안만 쓰고, 결론이 나면 지워도 되는 일회성 조사 도구다.
export async function onRequestGet(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  if (!env.KAKAO_REST_API_KEY) {
    return json({ error: "KAKAO_REST_API_KEY가 설정되지 않았어요." }, { status: 500 });
  }

  var q = (new URL(context.request.url).searchParams.get("q") || "사피엔스").trim().slice(0, 80);
  var kakaoUrl = "https://dapi.kakao.com/v3/search/book?size=3&query=" + encodeURIComponent(q);

  var res;
  try {
    res = await fetch(kakaoUrl, { headers: { Authorization: "KakaoAK " + env.KAKAO_REST_API_KEY } });
  } catch (e) {
    return json({ error: "카카오 호출 네트워크 오류: " + String(e && e.message) }, { status: 502 });
  }
  if (!res.ok) return json({ error: "카카오 호출 실패 (" + res.status + ")" }, { status: 502 });

  var data = await res.json();
  return json(data); // 가공 없이 그대로 — 어떤 필드가 실제로 오는지 보는 게 목적
}
