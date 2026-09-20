import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { extractIsbn13, lookupBookClass, lookupClassByTitle } from "../../_lib/bookClass.js";

// 이미 등록된 책들에 소급으로 분류를 채운다. 관리자만 실행할 수 있다.
//
// 원래는 도서관 정보나루(data4library)로 채우려던 라우트였는데 그쪽은 25권 중 0권만
// 나와서, 국립중앙도서관 "소장자료 검색"(functions/_lib/bookClass.js)으로 갈아끼웠다.
// 대상은 class_no가 아직 비어 있는 책 전부다 — 정보나루 시절에 category가 채워진 행은
// 사실상 없고, 있더라도 대분류 이름으로 다시 덮어쓰는 편이 드롭다운 표기가 통일된다.
//
// 호출 한 번에 BATCH_SIZE개만 처리한다 — 외부 API를 순차로(직렬로) 부르는 동안 Pages
// Functions 요청이 타임아웃되지 않도록 배치를 작게 유지한다. 여러 책이 밀려 있으면
// remaining이 0보다 크게 오니, 더 줄지 않을 때까지 같은 요청을 반복하면 된다 — 이미
// 채워진 책은 대상에서 빠지므로 몇 번을 다시 불러도 안전하다.
//
// 정렬을 RANDOM()으로 둔 이유: 도서관 목록에 없어서 영영 성공할 수 없는 책(세트 상품
// 등)이 섞여 있으면, created_at 순으로 고정해 매번 같은 앞쪽 25개만 집을 경우 그 책들이
// 뒤에 있는 진짜 조회 가능한 책들을 영원히 가린다. 매 호출마다 다른 25개를 뽑으면
// 해결 가능한 책은 결국 다 처리되고, 해결 불가능한 책만 remaining에 남는다.
var BATCH_SIZE = 25;
// 실패 이유를 몇 건이라도 눈으로 보여줘야 "도서관에 진짜 없어서"인지 "키/네트워크
// 문제로 조회 자체가 안 되고 있는지"를 구분할 수 있다. 전부 담으면 응답이 커지니 앞쪽만.
var SAMPLE_LIMIT = 5;

// 아직 분류가 하나도 없는 책이 대상이다. 처음엔 class_no만 봤는데, 도서관 기록에
// 대분류 숫자(kdcCode1s)는 있고 상세 분류번호(classNo)는 비어 있는 경우가 있어서
// ("신곡 세트"가 그랬다) 쓸 수 있는 분류 이름을 받고도 실패로 버렸다. 둘 중 하나라도
// 채워졌으면 더 볼 것이 없으므로 대상에서 뺀다 — 안 그러면 그 책이 영원히 후보로
// 남아 매번 같은 조회를 반복한다.
var PENDING =
  "isbn IS NOT NULL AND isbn != '' " +
  "AND (class_no IS NULL OR class_no = '') AND (category IS NULL OR category = '')";

export async function onRequestPost(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  if (!env.SEOJI_API_KEY) {
    return json({ error: "SEOJI_API_KEY가 설정되지 않아서 조회할 수 없어요." }, { status: 400 });
  }

  var candidates = await env.DB.prepare(
    "SELECT id, title, author, isbn FROM books WHERE " + PENDING + " ORDER BY RANDOM() LIMIT ?1"
  ).bind(BATCH_SIZE).all();

  var rows = candidates.results || [];
  var updated = 0;
  var updatedByTitle = 0;
  var noResult = 0;
  var samples = [];

  for (var i = 0; i < rows.length; i++) {
    var isbn13 = extractIsbn13(rows[i].isbn);
    var result = await lookupBookClass(env, isbn13);

    // ISBN으로 분류가 안 나오면 앞 제목으로 한 번 더 찾는다. "안나 카레니나 세트"처럼
    // 판매용으로 묶은 세트는 그 ISBN이 도서관 장서로 등록되는 일이 드물지만, 낱권은
    // 거의 반드시 등록돼 있다(functions/_lib/bookClass.js 주석 참고).
    if (!result.ok || (!result.categoryName && !result.classNo)) {
      result = await lookupClassByTitle(env, rows[i].title, rows[i].author);
    }

    var classNo = result.ok ? String(result.classNo || "").slice(0, 40) : "";
    var category = result.ok ? String(result.categoryName || "").slice(0, 200) : "";

    // 둘 중 하나라도 잡혔으면 기록한다. 드롭다운은 category만 쓰므로 분류번호가 없어도
    // 화면에서는 아쉬울 것이 없고, class_no는 나중에 "비슷한 책"을 고를 때 쓸 값이라
    // 비어 있으면 그 책만 추천 후보에서 빠질 뿐이다.
    if (classNo || category) {
      await env.DB.prepare("UPDATE books SET class_no = ?1, category = ?2 WHERE id = ?3")
        .bind(classNo, category || null, rows[i].id).run();
      updated++;
      if (result.byTitle) updatedByTitle++;
    } else {
      noResult++;
      if (samples.length < SAMPLE_LIMIT) {
        samples.push({
          id: rows[i].id,
          title: rows[i].title,
          isbn13: isbn13,
          // 도서관 목록에 그 책이 없는 것과, 찾았는데 분류가 통째로 비어 있는 것을 구분한다.
          reason: result.ok ? "no-class-value" : result.reason,
          detail: result.detail,
          // 제목 조회까지 갔을 때만 채워진다. 어떤 제목으로 찾았는지, 그리고 응답 필드
          // 이름이 예상과 달라 제목 검증이 헛돈 것은 아닌지 눈으로 확인하려는 값이다.
          searched: result.searched,
          docKeys: result.docKeys
        });
      }
    }
  }

  var remainingRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM books WHERE " + PENDING
  ).first();

  return json({
    processedThisBatch: rows.length,
    updated: updated,
    updatedByTitle: updatedByTitle,
    noResult: noResult,
    remaining: remainingRow ? remainingRow.n : 0,
    sampleFailures: samples
  });
}
