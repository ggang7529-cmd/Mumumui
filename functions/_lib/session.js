// 세션 쿠키 서명/검증 + Google ID 토큰 검증. Pages Functions 라우팅에서 제외되도록 `_lib` 폴더에 둠.

var COOKIE_NAME = "session";
var THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
var enc = new TextEncoder();
var dec = new TextDecoder();

function toBase64Url(bytes) {
  var bin = "";
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  var bin = atob(str);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSign(secret, message) {
  var key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  var sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toBase64Url(new Uint8Array(sig));
}

export async function createSessionCookie(secret, user) {
  var payload = {
    uid: user.uid, name: user.name, picture: user.picture || null,
    exp: Date.now() + THIRTY_DAYS_MS
  };
  var body = toBase64Url(enc.encode(JSON.stringify(payload)));
  var sig = await hmacSign(secret, body);
  var value = body + "." + sig;
  return COOKIE_NAME + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + (THIRTY_DAYS_MS / 1000);
}

export function clearSessionCookie() {
  return COOKIE_NAME + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export async function getSessionUser(request, secret) {
  var cookieHeader = request.headers.get("Cookie") || "";
  var m = cookieHeader.match(new RegExp("(?:^|;\\s*)" + COOKIE_NAME + "=([^;]+)"));
  if (!m) return null;

  var value = m[1];
  var dot = value.lastIndexOf(".");
  if (dot === -1) return null;

  var body = value.slice(0, dot);
  var sig = value.slice(dot + 1);
  var expected = await hmacSign(secret, body);
  if (expected !== sig) return null;

  var payload;
  try {
    payload = JSON.parse(dec.decode(fromBase64Url(body)));
  } catch (e) {
    return null;
  }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

var GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
var GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export async function verifyGoogleIdToken(idToken, clientId) {
  var parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("잘못된 토큰 형식이에요.");

  var header = JSON.parse(dec.decode(fromBase64Url(parts[0])));
  var payload = JSON.parse(dec.decode(fromBase64Url(parts[1])));

  if (GOOGLE_ISSUERS.indexOf(payload.iss) === -1) throw new Error("발급자가 올바르지 않아요.");
  if (payload.aud !== clientId) throw new Error("클라이언트 ID가 일치하지 않아요.");
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("토큰이 만료됐어요.");

  var jwksRes = await fetch(GOOGLE_JWKS_URL);
  var jwks = await jwksRes.json();
  var jwk = jwks.keys.find(function (k) { return k.kid === header.kid; });
  if (!jwk) throw new Error("서명 키를 찾을 수 없어요.");

  var key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
  );

  var signedData = enc.encode(parts[0] + "." + parts[1]);
  var signature = fromBase64Url(parts[2]);
  var valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedData);
  if (!valid) throw new Error("서명이 유효하지 않아요.");

  return {
    uid: payload.sub,
    name: payload.name || payload.email || "사용자",
    picture: payload.picture || null,
    email: payload.email || null
  };
}
