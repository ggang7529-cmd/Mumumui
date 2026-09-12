import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { extractIsbn13, lookupLibraryCategory } from "../../_lib/libraryCategory.js";

// LIBRARY_API_KEY가 아직 설정되지 않았던 시절에 등록됐거나, 그때 도서관 정보나루
// 조회가 실패한 책들은 category가 빈 채로 남아 있다. 이 라우트는 그런 책을 찾아
// 소급으로 다시 조회한다. 관리자만 실행할 수 있다.
//
// 호출 한 번에 BATCH_SIZE개만 처리한다 — data4library를 순차로(직렬로) 호출하는
// 동안 Pages Functions 요청이 오래 걸려 타임아웃되지 않도록 배치를 작게 유지한다.
// 여러 책이 밀려 있으면 remaining이 0보다 크게 오니, 0이 될 때까지 같은 요청을
// 반복하면 된다 — 이미 채워진 책은 대상에서 빠지므로 몇 번을 다시 불러도 안전하다.
//
// 정렬을 RANDOM()으로 둔 이유: ISBN이 13자리 형태가 아니어서 영영 성공할 수 없는
// 책이 섞여 있으면(예: 예전에 수동으로 채워둔 표지 전용 행), created_at 순으로 고정해
// 매번 같은 앞쪽 25개만 집으면 그 책들이 뒤에 있는 진짜 조회 가능한 책들을 영원히
// 가리게 된다. 매 호출마다 다른 25개를 뽑으면 해결 가능한 책들은 결국 다 처리되고,
// 해결 불가능한 책만 remaining에 남아 관리자가 "더 안 줄어드네" 하고 멈출 수 있다.
var BATCH_SIZE = 25;
// 실패 이유를 몇 건이라도 눈으로 보여줘야 "도서관에 진짜 없어서"인지 "키/네트워크
// 문제로 아예 조회 자체가 안 되고 있는지"를 구분할 수 있다. 전부 다 담으면 응답이
// 커지니 앞쪽 몇 건만.
var SAMPLE_LIMIT = 5;

export async function onRequestPost(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  if (!env.LIBRARY_API_KEY) {
    return json({ error: "LIBRARY_API_KEY가 설정되지 않아서 조회할 수 없어요." }, { status: 400 });
  }

  var candidates = await env.DB.prepare(
    "SELECT id, isbn FROM books WHERE isbn IS NOT NULL AND isbn != '' AND (category IS NULL OR category = '') " +
    "ORDER BY RANDOM() LIMIT ?1"
  ).bind(BATCH_SIZE).all();

  var rows = candidates.results || [];
  var updated = 0;
  var noResult = 0;
  var samples = [];

  for (var i = 0; i < rows.length; i++) {
    var isbn13 = extractIsbn13(rows[i].isbn);
    var result = await lookupLibraryCategory(env, isbn13);
    var category = result.ok && result.classNm ? result.classNm.slice(0, 200) : "";

    if (category) {
      await env.DB.prepare("UPDATE books SET category = ?1 WHERE id = ?2").bind(category, rows[i].id).run();
      updated++;
    } else {
      noResult++;
      if (samples.length < SAMPLE_LIMIT) {
        samples.push({
          id: rows[i].id,
          isbn: rows[i].isbn,
          isbn13: isbn13,
          // 도서관에 없어서 못 찾은 것과, 애초에 API 호출 자체가 실패한 것을 구분한다.
          // ok:true인데 classNm이 없으면 정말 그 책이 소장 목록에 없는 것이고,
          // ok:false면 lookupLibraryCategory의 reason(no-isbn13/http-4xx/api-error/
          // network-error)이 원인이다.
          reason: result.ok ? "not-in-catalog" : result.reason,
          detail: result.detail
        });
      }
    }
  }

  var remainingRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM books WHERE isbn IS NOT NULL AND isbn != '' AND (category IS NULL OR category = '')"
  ).first();

  return json({
    processedThisBatch: rows.length,
    updated: updated,
    noResult: noResult,
    remaining: remainingRow ? remainingRow.n : 0,
    sampleFailures: samples
  });
}
