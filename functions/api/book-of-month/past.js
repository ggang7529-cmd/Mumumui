import { json } from "../../_lib/db.js";
import { pastBooksOfMonth } from "../../_lib/bookOfMonth.js";

// "지난 이달의 책" — 기간이 끝난 것, 최근 순.
export async function onRequestGet(context) {
  return json({ past: await pastBooksOfMonth(context.env, Date.now()) });
}
