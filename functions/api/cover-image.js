// 표지 이미지를 우리 쪽을 거쳐 내보낸다.
//
// 왜 필요한가: 표지 모음 이미지(js/collage.js)는 표지를 캔버스에 그린 뒤 PNG로 뽑는다.
// 그런데 남의 서버에서 온 이미지를 캔버스에 그리는 순간 그 캔버스는 "오염"되고,
// 그때부터 toDataURL()/toBlob()이 보안 오류를 낸다 — 화면에 그려지기는 하는데 저장만
// 안 되는, 제일 알아채기 어려운 실패다. 같은 출처에서 받아오면 그 일이 없다.
//
// 이런 경로는 자칫 "아무 주소나 대신 받아다 주는 서버"가 되기 쉽다. 그래서 카카오 CDN
// 호스트만 통과시킨다. js/render.js의 upscaleCover()처럼 썸네일 주소 안의 fname(출판사
// 원본 주소)을 따라가지 않는 것도 같은 이유다 — 그쪽은 호스트가 제각각이라 자물쇠를
// 걸 수가 없고, 그걸 허용하는 순간 누구나 우리 서버로 임의의 주소를 받아갈 수 있다.

function kakaoCdnUrl(raw) {
  var u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.protocol !== "https:") return null;
  var host = u.hostname.toLowerCase();
  // "evilkakaocdn.net" 같은 이름이 끼어들지 못하도록 점까지 포함해서 본다.
  if (host !== "kakaocdn.net" && !host.endsWith(".kakaocdn.net")) return null;
  return u;
}

// 저장된 표지는 120x174짜리 썸네일이라 1080px 이미지에 넣으면 흐릿하다. 카카오 썸네일은
// 크기가 주소 경로에 박혀 있어서(/thumb/R120x174.q85/) 그 숫자만 키운 주소를 먼저
// 시도하고, 그게 안 되면 받은 주소를 그대로 쓴다. 두 후보 모두 카카오 CDN 안이다.
function candidates(u) {
  var list = [];
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
