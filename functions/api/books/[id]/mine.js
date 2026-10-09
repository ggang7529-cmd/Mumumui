import { getAnonUid } from "../../../_lib/identity.js";
import { json } from "../../../_lib/db.js";
import { checkRateLimit } from "../../../_lib/rateLimit.js";
import { upsertMyReview, countMyRatedBooks } from "../../../_lib/myReview.js";
import { normalizeMoodId } from "../../../../js/moodTags.js";

// 책 상세의 별점 카드와 "한 줄도 남겨볼래요?" 시트가 쓰는 저장 경로. 이 기기의 평가 하나를
// 만들거나 고친다(functions/_lib/myReview.js). 보낸 값만 바뀐다 — 별만 다시 누르면 별점만,
// 시트에서 남기면 태그·한 줄·닉네임이 같은 행에 합쳐진다.
//   { rating }                       별 누름
//   { rating, text, mood, name }     시트에서 남기기
export async function onRequestPut(context) {
  var env = context.env;
  var bookId = context.params.id;
  var uid = getAnonUid(context.request);
  if (!uid) return json({ error: "잘못된 요청이에요." }, { status: 401 });

  var rateOk = await checkRateLimit(env, context.request, "my-rating", 30, 60000);
  if (!rateOk) return json({ error: "너무 많이 눌렀어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  var book = await env.DB.prepare("SELECT id FROM books WHERE id = ?1").bind(bookId).first();
  if (!book) return json({ error: "존재하지 않는 책이에요." }, { status: 404 });

  var input = { rating: body.rating };
  if (body.text !== undefined) input.text = String(body.text || "").replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  if (body.mood !== undefined) input.mood = normalizeMoodId(body.mood);
  if (body.name !== undefined) input.name = String(body.name || "").trim().slice(0, 10) || undefined;

  var result = await upsertMyReview(env, bookId, uid, input);
  if (result.error) return json({ error: result.error }, { status: result.status });

  return json({
    review: result.review,
    created: result.created,
    points: result.points,
    ratedCount: await countMyRatedBooks(env, uid)
  });
}
