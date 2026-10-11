// 표지 이미지를 우리 쪽을 거쳐 내보낸다.
//
// 왜 필요한가: 표지 모음 이미지(js/collage.js)는 표지를 캔버스에 그린 뒤 PNG로 뽑는다.
// 그런데 남의 서버에서 온 이미지를 캔버스에 그리는 순간 그 캔버스는 "오염"되고,
// 그때부터 toDataURL()/toBlob()이 보안 오류를 낸다 — 화면에 그려지기는 하는데 저장만
// 안 되는, 제일 알아채기 어려운 실패다. 같은 출처에서 받아오면 그 일이 없다.
//
// 이런 경로는 자칫 "아무 주소나 대신 받아다 주는 서버"가 되기 쉽다. 그래서 카카오 CDN
// 호스트만 통과시킨다. 썸네일 주소 안의 fname(원본 주소)도 따라가되 **카카오 소유 호스트
// (daumcdn.net·kakaocdn.net)일 때만** 따라간다 — 카카오 책 검색의 원본은 거의 다
// t1.daumcdn.net/lbook/ 이고, 그 밖의 호스트를 허용하는 순간 누구나 우리 서버로 임의의
// 주소를 받아갈 수 있다.

function onKakaoHost(host, domain) {
  // "evilkakaocdn.net" 같은 이름이 끼어들지 못하도록 점까지 포함해서 본다.
  return host === domain || host.endsWith("." + domain);
}

function kakaoCdnUrl(raw) {
  var u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (!onKakaoHost(u.hostname.toLowerCase(), "kakaocdn.net")) return null;
  return u;
}

// 썸네일 주소의 fname에 든 원본 주소. 카카오 소유 호스트일 때만, https로 바꿔서.
function kakaoOriginal(u) {
  var raw = u.searchParams.get("fname");
  if (!raw) return null;
  var o;
  try {
    o = new URL(raw);
  } catch (e) {
    return null;
  }
  if (o.protocol !== "http:" && o.protocol !== "https:") return null;
  var host = o.hostname.toLowerCase();
  if (!onKakaoHost(host, "daumcdn.net") && !onKakaoHost(host, "kakaocdn.net")) return null;
  o.protocol = "https:";
  return o.href;
}

// 저장된 표지는 120x174짜리 썸네일이라 1080px 이미지에 넣으면 깨진다. 원본(fname)을
// 먼저, 그다음 경로의 크기(/thumb/R120x174.q85/)만 키운 주소, 마지막으로 받은 주소 그대로.
// 셋 다 카카오 호스트 안이다.
function candidates(u) {
  var list = [];
  var original = kakaoOriginal(u);
  if (original) list.push(original);
  var bigger = u.href.replace(/\/thumb\/R\d+x\d+(\.[a-z0-9]+)?\//i, "/thumb/R480x696$1/");
  if (bigger !== u.href) list.push(bigger);
  list.push(u.href);
  return list;
}

export async function onRequestGet(context) {
  var url = new URL(context.request.url);
  var target = kakaoCdnUrl(url.searchParams.get("u") || "");
  if (!target) return new Response("Not allowed", { status: 400 });

  var tries = candidates(target);
  for (var i = 0; i < tries.length; i++) {
    var res;
    try {
      res = await fetch(tries[i], { cf: { cacheEverything: true, cacheTtl: 86400 } });
    } catch (e) {
      continue;
    }
    var type = res.headers.get("Content-Type") || "";
    if (!res.ok || type.indexOf("image/") !== 0) continue;

    return new Response(res.body, {
      headers: {
        "Content-Type": type,
        // 표지는 한 번 받으면 바뀌지 않는다. 같은 이미지를 고를 때마다 다시 받아오지
        // 않도록 길게 캐시한다.
        "Cache-Control": "public, max-age=86400, immutable"
      }
    });
  }

  return new Response("Not found", { status: 404 });
}
