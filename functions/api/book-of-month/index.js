import { json } from "../../_lib/db.js";
import { currentBookOfMonth, pastBooksOfMonth, latestLines } from "../../_lib/bookOfMonth.js";

// 홈 카드·책 상세가 쓰는 지금의 이달의 책. { current: {...,lines} | null, hasPast }
export async function onRequestGet(context) {
  var env = context.env;
  var now = Date.now();
  var current = await currentBookOfMonth(env, now);
  if (current) current.lines = await latestLines(env, current.bookId, 2);
  var past = await pastBooksOfMonth(env, now);
  return json({ current: current, hasPast: past.length > 0 });
}
