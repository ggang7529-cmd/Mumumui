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
    "SELECT id, title, author, cover, contents, text, rating_sum, rating_count, owner_name, created_at FROM books WHERE id = ?1"
  )
    .bind(id)
    .first();
  if (!book) return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=UTF-8" } });

  var title = escapeHtml(book.title) + " - 리뷰 및 별점 | 책갈피";
  // 책 소개(contents)가 있으면 그걸 메타 설명으로 쓰는 게 제목+저자 조합보다 검색결과에서
  // 더 유용하다. 검색엔진 스니펫 길이 관례에 맞춰 155자 근처에서 자른다.
  var descSource = book.contents ? book.contents.trim() : "";
  var desc = descSource
    ? escapeHtml(descSource.length > 155 ? descSource.slice(0, 155).trim() + "…" : descSource)
    : escapeHtml(book.title) + "(" + escapeHtml(book.author) + ") 리뷰 - 책갈피에서 확인해보세요";
  // 쿼리 파라미터가 붙어도 같은 콘텐츠이므로, og:url/canonical은 쿼리 없는 정규 URL로 고정한다.
  var canonicalUrl = reqUrl.origin + "/book/" + encodeURIComponent(id);
  var pageUrl = escapeHtml(canonicalUrl);
  var avgRating = book.rating_count > 0 ? Math.round((book.rating_sum / book.rating_count) * 10) / 10 : null;

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
  if (book.contents) jsonLd.description = book.contents;
  if (avgRating !== null) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: avgRating,
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
        avgRating !== null
          ? {
              "@type": "Rating",
              ratingValue: avgRating,
              bestRating: 5,
              worstRating: 1,
            }
          : undefined,
    };
  }
  metaTags += jsonLdScript(jsonLd);

  // 이 아래는 검색봇(특히 JS를 실행하지 않는 네이버 Yeti 등)이 자바스크립트 없이도 책
  // 상세 콘텐츠를 읽을 수 있도록, 클라이언트가 fetch 후 채우는 것과 같은 내용을 서버에서
  // 미리 채워 넣는 것이다. 화면에 그대로 남아도 무방한 이유: js/render.js의 renderDetail()이
  // 페이지 로드 직후 같은 엘리먼트에 동일한 값을 textContent로 다시 써서 자연스럽게
  // 이어받는다 (state.books가 아직 없을 때만 잠깐 비어있다가 채워짐).
  var ratingMetaText = avgRating !== null ? avgRating.toFixed(1) + " (" + book.rating_count + ")" : "아직 평점 없음";
  var createdDate = new Date(book.created_at || Date.now());
  var dateText =
    createdDate.getFullYear() + "." + String(createdDate.getMonth() + 1).padStart(2, "0") + "." +
    String(createdDate.getDate()).padStart(2, "0") + " 기록";
  var ownerName = escapeHtml(book.owner_name || "알 수 없음");

  // 댓글(한줄평)은 페이지의 핵심 콘텐츠지만 부가 조회이므로, 실패해도 상세 페이지
  // 자체(제목/평점/설명)는 그대로 나가야 한다 — 실패 시 빈 목록으로 두면
  // js/render.js의 renderDetail()이 /api/books/:id/comments로 정상적으로 채운다.
  var commentCountText = "";
  var commentListHtml = "";
  try {
    var commentRows = await env.DB.prepare(
      "SELECT text, rating, author_name FROM comments WHERE book_id = ?1 AND parent_id IS NULL " +
      "ORDER BY created_at DESC LIMIT 20"
    )
      .bind(id)
      .all();
    var topLevelComments = commentRows.results || [];
    if (topLevelComments.length > 0) {
      commentCountText = "(" + topLevelComments.length + ")";
      commentListHtml = topLevelComments.map(function (c) {
        var stars = "";
        for (var i = 1; i <= 5; i++) stars += i <= c.rating ? "★" : "☆";
        return (
          "<li><strong>" + escapeHtml(c.author_name || "책갈피 사용자") + "</strong> " +
          escapeHtml(stars) + " " + escapeHtml(c.text) + "</li>"
        );
      }).join("");
    }
  } catch (e) {
    // 위에서 선언한 빈 값 그대로 둔다.
  }

  html = html
    .replace("<title>책갈피</title>", "<title>" + title + "</title>")
    .replace(
      '<meta name="description" content="읽은 책마다 별점과 한 줄 감상을 남겨두는 개인 서재">',
      '<meta name="description" content="' + desc + '">'
    )
    .replace(
      '<link rel="canonical" href="https://galpi.pages.dev/">',
      '<link rel="canonical" href="' + pageUrl + '">'
    )
    .replace(staticOgBlock, metaTags)
    .replace('<h1 class="brand-name">책갈피</h1>', '<p class="brand-name">책갈피</p>')
    .replace('<h2 id="detailTitle"></h2>', '<h1 id="detailTitle">' + escapeHtml(book.title) + "</h1>")
    .replace(
      '<p class="detail-author" id="detailAuthor"></p>',
      '<p class="detail-author" id="detailAuthor">' + escapeHtml(book.author) + "</p>"
    )
    .replace(
      '<span class="rating-meta" id="detailRatingMeta"></span>',
      '<span class="rating-meta" id="detailRatingMeta">' + escapeHtml(ratingMetaText) + "</span>"
    )
    .replace(
      '<p class="meta-date" id="detailDate"></p>',
      '<p class="meta-date" id="detailDate">' + escapeHtml(dateText) + "</p>"
    )
    .replace(
      '<p class="meta-owner" id="detailOwner"></p>',
      '<p class="meta-owner" id="detailOwner">등록: <span class="meta-owner-name">' + ownerName + "</span></p>"
    )
    .replace('<span class="count" id="commentCount"></span>', '<span class="count" id="commentCount">' + commentCountText + "</span>")
    .replace('<ul id="commentList"></ul>', '<ul id="commentList">' + commentListHtml + "</ul>")
    .replace(
      '<p class="book-contents-text" id="bookContentsText"></p>',
      '<p class="book-contents-text" id="bookContentsText">' + escapeHtml(book.contents || "") + "</p>"
    )
    .replace(
      '<section class="book-contents" id="bookContentsSection" hidden>',
      book.contents ? '<section class="book-contents" id="bookContentsSection">' : '<section class="book-contents" id="bookContentsSection" hidden>'
    )
    .replace('<section id="libraryView">', '<section id="libraryView" hidden>')
    .replace('<div class="library-toolbar" id="libraryToolbar">', '<div class="library-toolbar" id="libraryToolbar" hidden>')
    .replace('<section id="detailView" hidden>', '<section id="detailView">');

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}
