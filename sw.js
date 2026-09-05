// 책갈피 서비스워커
//
// 캐시 무효화 전략:
// - HTML(내비게이션 요청)은 절대 캐싱하지 않고 항상 네트워크에서 받아온다.
//   네트워크가 끊겼을 때만 offline.html로 대체한다.
// - CSS/JS/이미지 등 정적 자산은 "먼저 캐시로 응답하고 백그라운드에서 갱신"
//   (stale-while-revalidate) 방식을 쓴다. 그래서 CACHE_VERSION을 깜빡 잊고
//   올리지 않아도, 방문할 때마다 최신 파일로 캐시가 조용히 갱신된다.
// - 그래도 정적 자산 목록 자체가 바뀌는(파일 추가/삭제) 배포에서는 아래
//   CACHE_VERSION을 올려야 한다 — 배포마다 새 캐시 이름이 만들어지고,
//   activate 시점에 이전 버전 캐시가 전부 삭제된다.
const CACHE_VERSION = "v1";
const STATIC_CACHE = `galpi-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  "/css/style.css",
  "/js/main.js",
  "/js/api.js",
  "/js/render.js",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/img/icons/icon-192.png",
  "/img/icons/icon-512.png",
  "/manifest.json",
  OFFLINE_URL,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("galpi-static-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// index.html이 새 버전을 감지했을 때 "새로고침 해주세요" 안내를 띄우고,
// 사용자가 그 안내에서 새로고침을 누르면 대기 중인 워커를 즉시 활성화한다.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const STATIC_ASSET_RE = /\.(css|js|png|jpe?g|svg|webp|gif|ico|woff2?|json)$/;

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (STATIC_ASSET_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
