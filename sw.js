// 책갈피 서비스워커
//
// 캐시 무효화 전략:
// - HTML(내비게이션 요청)은 절대 캐싱하지 않고 항상 네트워크에서 받아온다.
//   네트워크가 끊겼을 때만 offline.html로 대체한다.
// - CSS/JS/이미지 등 정적 자산은 "먼저 캐시로 응답하고 백그라운드에서 갱신"
//   (stale-while-revalidate) 방식을 쓴다.
// - 그래서 css/js를 고친 배포에서는 반드시 아래 CACHE_VERSION을 같이 올려야 한다.
//   올리지 않으면 이번 방문에는 캐시에 있던 옛 파일이 그대로 나가고 새 파일은 뒤에서
//   받아두기만 해서, 바뀐 화면이 다음 방문에야 보인다. 게다가 sw.js 자체가 그대로면
//   브라우저가 업데이트를 감지하지 못해 main.js의 "새로고침" 안내 배너도 안 뜬다.
//   (실제로 v4에서 이 문제가 났다 — 배포는 됐는데 휴대폰에는 옛 화면이 남아 있었다.)
//   버전을 올리면 새 캐시 이름이 만들어지고 activate 때 옛 캐시가 전부 삭제된다.
const CACHE_VERSION = "v20";
const STATIC_CACHE = `galpi-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_ASSETS = [
  "/css/style.css",
  "/js/main.js",
  "/js/api.js",
  "/js/render.js",
  "/js/moodTags.js",
  "/js/bookContents.js",
  "/js/kdc.js",
  "/js/recommendRules.js",
  "/js/levels.js",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/img/icons/icon-192.png",
  "/img/icons/icon-512.png",
  "/manifest.json",
  OFFLINE_URL,
];

// 프리캐시는 cache.addAll 대신 파일을 하나씩 받아 넣는다. 이유가 둘이다.
//
// 1) addAll은 목록 중 하나라도 실패하면 install 전체가 실패한다. install이 실패하면
//    새 워커가 영영 활성화되지 못하고, 이미 방문한 적 있는 사람은 옛 캐시에 갇힌 채
//    아무리 새로고침해도 옛 파일을 계속 받는다. 파일 하나가 404인 대가로 사이트
//    전체가 옛 버전에 묶이는 건 너무 크다 — 실패한 파일은 그냥 건너뛰고, 그 파일은
//    나중에 fetch 핸들러가 네트워크에서 받아 캐시에 넣는다.
// 2) 그냥 fetch하면 브라우저 HTTP 캐시를 거치므로, 배포로 내용이 바뀌었어도 옛 사본이
//    그대로 새 캐시에 복사될 수 있다. 버전을 올린 의미가 없어지므로 cache: "reload"로
//    네트워크에서 다시 받는다.
async function precache() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    PRECACHE_ASSETS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (res.ok) await cache.put(url, res);
      } catch (e) {
        // 네트워크가 불안정한 첫 방문 등. 위 1)의 이유로 install을 실패시키지 않는다.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
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

// robots.txt / sitemap.xml / rss.xml 등 검색엔진이 직접 가져가는 파일.
const CRAWLER_FILE_RE = /^\/(robots\.txt|sitemap\.xml|rss\.xml)$/;

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

  // 크롤러용 파일은 서비스워커를 태우지 않고 네트워크로 그대로 내보낸다.
  //
  // 검색엔진 크롤러 자체는 서비스워커를 실행하지 않으므로 이게 크롤링 실패의 원인은
  // 아니다. 다만 사람이 주소창에 /sitemap.xml을 치면 그건 navigate 요청이라 아래
  // isNavigationRequest 분기에 걸리고, 네트워크가 잠깐 끊기면 offline.html(HTML)이
  // 사이트맵 자리에 응답으로 나간다 — 사이트맵 주소에서 HTML을 받는 건 어느 쪽에도
  // 도움이 안 된다. 그래서 아예 워커가 손대지 않게 먼저 빼둔다.
  if (CRAWLER_FILE_RE.test(url.pathname)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  if (STATIC_ASSET_RE.test(url.pathname)) {
    event.respondWith(
      // 캐시 이름을 지정하지 않으면 caches.match는 "모든" 캐시를 뒤진다. 옛 버전 캐시가
      // 어떤 이유로든 지워지지 않고 남아 있으면 거기 있는 옛 파일이 그대로 나갈 수 있어,
      // 지금 버전의 캐시에서만 찾도록 못박는다.
      caches.match(request, { cacheName: STATIC_CACHE }).then((cached) => {
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
