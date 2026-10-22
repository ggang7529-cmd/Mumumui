import { json } from "../../../_lib/db.js";
import { findAlsoBooks } from "../../../_lib/alsoBooks.js";

// "이 책을 꽂은 사람이 함께 꽂은 책" — 고르는 기준은 functions/_lib/alsoBooks.js.
export async function onRequestGet(context) {
  return json({ books: await findAlsoBooks(context.env, context.params.id, 3) });
}
