import { json } from "../../_lib/db.js";
import { checkRateLimit } from "../../_lib/rateLimit.js";
import { lookupBookIntro } from "../../_lib/bookIntro.js";

// 관리자 전용. 등록된 책 중 몇 권이나 SEOJI에서 소개 전문을 받아올 수 있는지 센다.
// 연동을 실제로 붙일 값어치가 있는지는 커버리지가 정하므로, 코드를 더 쓰기 전에 이걸로
// 먼저 재본다. 책마다 요청이 두 번(SEOJI + 텍스트 파일)이라 한 번에 많이 돌리지 않는다.
var DEFAULT_LIMIT = 12;

export async function onRequestGet(context) {
  var env = context.env;
  if (!env.ADMIN_KEY) return json({ error: "관리자 비밀번호가 설정되지 않았어요." }, { status: 500 });

  var rateOk = await checkRateLimit(env, context.request, "admin-key", 5, 60000);
  if (!rateOk) return json({ error: "너무 많이 시도했어요. 잠시 후 다시 시도해주세요." }, { status: 429 });

  var adminKey = context.request.headers.get("X-Admin-Key") || "";
  if (adminKey !== env.ADMIN_KEY) return json({ error: "비밀번호가 틀렸어요." }, { status: 403 });

  var url = new URL(context.request.url);
  var limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT, 1), 25);

  var picked = await env.DB.prepare(
    "SELECT id, title, isbn, contents FROM books WHERE isbn IS NOT NULL AND isbn != '' ORDER BY RANDOM() LIMIT ?1"
  ).bind(limit).all();
  var rows = picked.results || [];

  var items = [];
  var gained = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var kakaoLen = (r.contents || "").length;
    var got = await lookupBookIntro(env, r.isbn);
    if (got.ok) gained++;
    items.push({
      title: r.title,
      kakaoLength: kakaoLen,
      seojiLength: got.ok ? got.intro.length : 0,
      reason: got.ok ? null : got.reason,
      source: got.ok ? got.source : null,
      hasToc: got.ok ? true : !!got.hasToc,
      // 길이만으로는 같은 글인지 알 수 없어, 실제로 더 나은지 눈으로 볼 수 있게 끝부분만 남긴다.
      seojiTail: got.ok ? got.intro.slice(-60) : null
    });
  }

  var tocOnly = items.filter(function (it) { return !it.seojiLength && it.hasToc; }).length;
  var total = await env.DB.prepare("SELECT COUNT(*) AS n FROM books").first();
  return json({
    checked: items.length,
    withIntro: gained,
    tocOnly: tocOnly,
    booksTotal: (total && total.n) || 0,
    items: items
  });
}
