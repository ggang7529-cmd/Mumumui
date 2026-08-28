function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// 카카오 도서검색 썸네일(120x174짜리 kakaocdn 썸네일 프록시 URL)은 작아서 카톡 공유
// 미리보기에도 그대로 쓰면 흐릿하다. js/render.js의 upscaleCover()와 같은 방식으로,
// 프록시 URL의 fname 파라미터에 들어있는 원본 이미지 URL을 꺼내서 그대로 쓴다(프록시는
// 확대 요청을 403으로 거부하므로 원본을 직접 쓰는 것만 유효하다). 패턴이 안 맞으면
// 원본 그대로 둔다.
function upscaleCover(url) {
  if (!url) return url;
  var match = url.match(/^https?:\/\/[^/]*kakaocdn\.net\/thumb\/[^/]+\/\?fname=(.+)$/);
  if (!match) return url;
  try {
    return decodeURIComponent(match[1]).replace(/^http:\/\//, "https://");
  } catch (e) {
    return url;
  }
}

function jsonLdScript(obj) {
  return '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, "\\u003c") + "</script>\n";
}

export async function onRequestGet(context) {
  var env = context.env;
  var id = context.params.id;
  var reqUrl = new URL(context.request.url);

  var indexRes = await env.ASSETS.fetch(new URL("/", reqUrl));
  var html = await indexRes.text();

  var book = await env.DB.prepare(
    "SELECT id, title, author, cover, text, rating_sum, rating_count, owner_name FROM books WHERE id = ?1"
  )
    .bind(id)
    .first();
  if (!book) return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=UTF-8" } });

  var title = escapeHtml(book.title) + " - 리뷰 및 별점 | 책갈피";
  var desc = escapeHtml(book.title) + "(" + escapeHtml(book.author) + ") 리뷰 - 책갈피에서 확인해보세요";
  var pageUrl = escapeHtml(reqUrl.toString());

  // 홈(index.html)에는 사이트 기본 og 태그가 정적으로 박혀 있다. 여기서 metaTags를
  // <title> 뒤에 그냥 덧붙이면 og:title/description/image/type/url이 중복돼서 크롤러가
  // 어느 쪽을 쓸지 보장할 수 없다. 그래서 아래 staticOgBlock을 통째로 책 전용 태그로
  // 치환한다 (og:image는 책 표지가 있을 때만 정적 기본 이미지를 대체).
  var staticOgBlock =
    '<meta property="og:title" content="책갈피 - 읽은 책마다 별점과 한 줄 감상을 남겨보세요">\n' +
    '<meta property="og:description" content="닉네임만 입력하면 누구나 참여할 수 있는 책 리뷰 커뮤니티. 읽은 책을 등록하고 별점과 한 줄 감상을 남겨보세요.">\n' +
    '<meta property="og:image" content="https://galpi.pages.dev/og-image.png">\n' +
    '<meta property="og:image:width" content="1200">\n' +
    '<meta property="og:image:height" content="630">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:url" content="https://galpi.pages.dev">\n' +
    '<meta name="twitter:card" content="summary_large_image">';

  var metaTags =
    '<meta property="og:type" content="article">\n' +
    '<meta property="og:title" content="' + title + '">\n' +
    '<meta property="og:description" content="' + desc + '">\n' +
    (book.cover ? '<meta property="og:image" content="' + escapeHtml(upscaleCover(book.cover)) + '">\n' : "") +
    '<meta property="og:url" content="' + pageUrl + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n';

  var jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    author: { "@type": "Person", name: book.author },
  };
  if (book.cover) jsonLd.image = upscaleCover(book.cover);
  if (book.rating_count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.round((book.rating_sum / book.rating_count) * 10) / 10,
      reviewCount: book.rating_count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  if (book.text) {
    jsonLd.review = {
      "@type": "Review",
      reviewBody: book.text,
      author: { "@type": "Person", name: book.owner_name || "책갈피 사용자" },
      reviewRating:
        book.rating_count > 0
          ? {
              "@type": "Rating",
              ratingValue: Math.round((book.rating_sum / book.rating_count) * 10) / 10,
              bestRating: 5,
              worstRating: 1,
            }
          : undefined,
    };
  }
  metaTags += jsonLdScript(jsonLd);

  html = html
    .replace("<title>책갈피</title>", "<title>" + title + "</title>")
    .replace(
      '<meta name="description" content="읽은 책마다 별점과 한 줄 감상을 남겨두는 개인 서재">',
      '<meta name="description" content="' + desc + '">'
    )
    .replace(staticOgBlock, metaTags);

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}
