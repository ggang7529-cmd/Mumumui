import { getSessionUser } from "../_lib/session.js";
import { json } from "../_lib/db.js";

export async function onRequestGet(context) {
  var user = await getSessionUser(context.request, context.env.SESSION_SECRET);
  if (!user) return json({ user: null });
  return json({ user: { uid: user.uid, name: user.name, picture: user.picture } });
}
