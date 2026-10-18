import { fetchScoreMap } from "../_lib/scores.js";
import { hasLineSql } from "../_lib/lines.js";
import { getLevel, formatNicknameShort } from "../_lib/levels.js";
import { findMoodTag } from "../../js/moodTags.js";
import { topTags, tagsText, distText } from "../../js/bookSummary.js";
import { escapeHtml } from "../_lib/html.js";
import { canonicalOrigin } from "../_lib/origin.js";
import { extractIsbn13 } from "../_lib/bookClass.js";

// index.html 상단 스프라이트(<symbol id="i-…">)를 가리키는 <use> 한 벌. 이 라우트는
// index.html을 읽어 치환하는 방식이라 스프라이트가 이미 페이지 안에 들어 있다.
// name/className은 코드가 직접 넘기는 고정 값이라 이스케이프할 사용자 입력이 없다.
function iconSvg(name, className) {
  return '<svg class="icon' + (className ? " " + className : "") +
    '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
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

// PNG/JPEG 헤더 바이트만 보고 실제 가로/세로 픽셀을 읽어낸다. og:image:width/height를
// 안 채우면 카카오톡/아이메시지 같은 링크 미리보기가 세로로 긴 책 표지를 기본
// 가로형 박스에 억지로 맞추면서 옆을 잘라버린다 — 실제 비율을 알려주면 대부분
// 그 비율에 맞는 박스로 렌더링해서 크롭을 피한다.
function readImageDimensions(buf) {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    var view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    var i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      var marker = buf[i + 1];
      var isSofMarker = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSofMarker) {
        var d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        return { height: d.getUint16(i + 5), width: d.getUint16(i + 7) };
      }
      var segLen = (buf[i + 2] << 8) | buf[i + 3];
      i += 2 + segLen;
    }
  }
  return null;
}

// 표지 앞부분 32KB만 Range로 받아온다 — 대부분의 JPEG/PNG는 이 안에 크기 정보가
// 있고, 실패하거나 못 읽어도(WEBP 등) og:image:width/height 없이 기존처럼 동작한다.
async function fetchImageDimensions(url) {
  try {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 2500);
    var res = await fetch(url, { headers: { Range: "bytes=0-32767" }, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    var buf = new Uint8Array(await res.arrayBuffer());
    return readImageDimensions(buf);
  } catch (e) {
    return null;
  }
}

export async function onRequestGet(context) {
  var env = context.env;
  var id = context.params.id;
  var reqUrl = new URL(context.request.url);

  var indexRes = await env.ASSETS.fetch(new URL("/", reqUrl));
  var html = await indexRes.text();

  var book = await env.DB.prepare(
    "SELECT id, title, author, cover, isbn, contents, text, mood, rating_sum, rating_count, comment_count, owner_name, created_at FROM books WHERE id = ?1"
  )
    .bind(id)
    .first();
  if (!book) return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=UTF-8" } });

  // 평균 별점은 메타 설명·JSON-LD·화면 세 곳이 함께 쓰므로 여기서 한 번만 구한다.
  var avgRating = book.rating_count > 0 ? Math.round((book.rating_sum / book.rating_count) * 10) / 10 : null;

  var title = escapeHtml(book.title) + " - 리뷰 및 별점 | 책갈피";

  // 메타 설명(검색 결과에 뜨는 문구)은 이 책에 남은 한줄평으로 만든다.
  //
  // 예전에는 카카오가 주는 책 소개(contents)를 썼는데, 그건 출판사 홍보 문구라 교보·예스24·
  // 알라딘에도 똑같이 있다. 검색엔진 입장에서는 여러 사이트에 중복된 문장이라 스니펫으로 잘
  // 쓰이지도 않고, 쓰인들 우리를 고를 이유가 되지 못한다. 반면 한줄평은 이 사이트에만 있는
  // 문장이다. contents 자체는 DB와 아래 JSON-LD에 그대로 남는다 — 거기서는 "책"을 설명하는
  // 자리라 출판사 소개가 맞다.
  var moodTagForDesc = findMoodTag(book.mood);
  var reviewLine = (book.text || "").trim() || (moodTagForDesc ? moodTagForDesc.label : "");
  var desc;
  if (reviewLine) {
    var head = '"' + (reviewLine.length > 90 ? reviewLine.slice(0, 90).trim() + "…" : reviewLine) + '"';
    var tail = avgRating !== null
      ? " · 별점 " + avgRating.toFixed(1) + (book.rating_count > 1 ? " (" + book.rating_count + "명)" : "")
      : "";
    desc = escapeHtml(head + tail + " — " + book.title + " 한줄평, 책갈피");
  } else {
    desc = escapeHtml(book.title) + "(" + escapeHtml(book.author) + ") 리뷰 - 책갈피에서 확인해보세요";
  }
  // 쿼리 파라미터가 붙어도 같은 콘텐츠이므로, og:url/canonical은 쿼리 없는 정규 URL로 고정한다.
  var canonicalUrl = canonicalOrigin(context.request) + "/book/" + encodeURIComponent(id);
  var pageUrl = escapeHtml(canonicalUrl);

  // 홈(index.html)에는 사이트 기본 og 태그가 정적으로 박혀 있다. 여기서 metaTags를
  // <title> 뒤에 그냥 덧붙이면 og:title/description/image/type/url이 중복돼서 크롤러가
  // 어느 쪽을 쓸지 보장할 수 없다. 그래서 아래 staticOgBlock을 통째로 책 전용 태그로
  // 치환한다 (og:image는 책 표지가 있을 때만 정적 기본 이미지를 대체).
  var staticOgBlock =
    '<meta property="og:title" content="책갈피 - 책을 덮고 나면, 이야기하고 싶어지잖아요">\n' +
    '<meta property="og:description" content="같은 책을 읽은 사람들과 한 줄로 생각을 나눠요. 가입 없이 바로 남길 수 있어요.">\n' +
    '<meta property="og:image" content="https://book-galpi.com/og-image.png">\n' +
    '<meta property="og:image:width" content="1200">\n' +
    '<meta property="og:image:height" content="630">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:url" content="https://book-galpi.com">\n' +
    '<meta name="twitter:card" content="summary_large_image">';

  var coverUrl = book.cover ? upscaleCover(book.cover) : null;
  var coverDims = coverUrl ? await fetchImageDimensions(coverUrl) : null;

  var metaTags =
    '<meta property="og:type" content="article">\n' +
    '<meta property="og:title" content="' + title + '">\n' +
    '<meta property="og:description" content="' + desc + '">\n' +
    (coverUrl ? '<meta property="og:image" content="' + escapeHtml(coverUrl) + '">\n' : "") +
    (coverDims ? '<meta property="og:image:width" content="' + coverDims.width + '">\n' : "") +
    (coverDims ? '<meta property="og:image:height" content="' + coverDims.height + '">\n' : "") +
    '<meta property="og:url" content="' + pageUrl + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n';

  var jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    author: { "@type": "Person", name: book.author },
  };
  jsonLd.url = canonicalUrl;
  if (coverUrl) jsonLd.image = coverUrl;
  if (book.contents) jsonLd.description = book.contents;
  // isbn은 이 책이 어떤 책인지 검색엔진이 다른 출처와 대조할 수 있게 해주는 값이라,
  // 있으면 같이 싣는다. 카카오가 isbn10과 isbn13을 공백으로 붙여 주므로 13자리만 쓴다.
  var isbn13 = extractIsbn13(book.isbn);
  if (isbn13) jsonLd.isbn = isbn13;
  if (avgRating !== null) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: avgRating,
      // reviewCount가 아니라 ratingCount를 쓴다. 구글 기준으로 reviewCount는 "글이 달린
      // 리뷰 수", ratingCount는 "별점을 매긴 수"인데, 우리는 감정 태그만 고르고 글 없이
      // 별점만 남길 수 있어서(books.mood) rating_count는 후자에 해당한다. 예전에는 이걸
      // reviewCount로 내보내 실제보다 부풀려진 숫자를 말하고 있었다.
      ratingCount: book.rating_count,
      bestRating: 5,
      worstRating: 1,
    };
  }
  // 감정 태그만 고르고 본문 없이 남긴 첫 한줄평이면 태그 문구를 대신 싣는다 — 안 그러면
  // 링크 미리보기의 리뷰 항목이 통째로 빠진다.
  var bookMoodTag = findMoodTag(book.mood);
  var bookReviewBody = book.text || (bookMoodTag ? bookMoodTag.label : "");
  if (bookReviewBody) {
    jsonLd.review = {
      "@type": "Review",
      reviewBody: bookReviewBody,
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
  // 화면의 "★ 4.8 · 평가 5 · 한 줄 3"과 같은 문구(js/render.js detailStatsText).
  var ratingMetaText =
    (avgRating !== null ? "★ " + avgRating.toFixed(1) + " · 평가 " + book.rating_count : "아직 평가가 없어요") +
    " · 한 줄 " + (book.comment_count || 0);

  // 댓글(한줄평)은 페이지의 핵심 콘텐츠지만 부가 조회이므로, 실패해도 상세 페이지
  // 자체(제목/평점/설명)는 그대로 나가야 한다 — 실패 시 빈 목록으로 두면
  // js/render.js의 renderDetail()이 /api/books/:id/comments로 정상적으로 채운다.
  var commentCountText = "";
  var commentListHtml = "";
  var summaryHtml = "";
  try {
    var commentRows = await env.DB.prepare(
      "SELECT id, text, rating, mood, author_name FROM comments WHERE book_id = ?1 AND parent_id IS NULL AND " + hasLineSql() + " " +
      "ORDER BY created_at DESC LIMIT 20"
    )
      .bind(id)
      .all();
    var topLevelComments = commentRows.results || [];

    // 이 책의 기록 요약 — 남긴 태그(한 줄 전체 기준)와 별점 분포(별점만 남긴 것까지).
    // 이 사이트에만 있는, 책마다 다른 글이라 검색엔진이 보는 첫 HTML에 같이 싣는다.
    var aggRows = await env.DB.batch([
      env.DB.prepare("SELECT mood, count(*) AS n FROM comments WHERE book_id = ?1 AND parent_id IS NULL AND mood IS NOT NULL AND mood != '' GROUP BY mood").bind(id),
      env.DB.prepare("SELECT rating, count(*) AS n FROM comments WHERE book_id = ?1 AND parent_id IS NULL GROUP BY rating").bind(id)
    ]);
    var moodCounts = {};
    (aggRows[0].results || []).forEach(function (r) { moodCounts[r.mood] = r.n; });
    var dist = [0, 0, 0, 0, 0];
    (aggRows[1].results || []).forEach(function (r) { if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1] = r.n; });
    summaryHtml = buildSummaryHtml(tagsText(topTags(moodCounts)), distText(dist));

    // 답글도 한줄평 밑에 같이 싣는다(대화가 붙은 책은 그만큼 고유한 글이 늘어난다).
    var repliesByParent = {};
    if (topLevelComments.length) {
      var replyRows = await env.DB.prepare(
        "SELECT text, author_name, parent_id FROM comments WHERE book_id = ?1 AND parent_id IS NOT NULL ORDER BY created_at ASC LIMIT 100"
      ).bind(id).all();
      (replyRows.results || []).forEach(function (r) {
        (repliesByParent[r.parent_id] = repliesByParent[r.parent_id] || []).push(r);
      });
    }
    if (topLevelComments.length > 0) {
      commentCountText = String(book.comment_count || topLevelComments.length);
      var scoreMap = await fetchScoreMap(env);
      commentListHtml = topLevelComments.map(function (c) {
        var starsHtml = "";
        for (var i = 1; i <= 5; i++) {
          starsHtml += iconSvg("star", "star-icon" + (i <= c.rating ? " is-filled" : ""));
        }
        var authorName = c.author_name || "책갈피 사용자";
        var score = scoreMap[c.author_name] || 0;
        var lvl = getLevel(score);
        var moodTag = findMoodTag(c.mood);
        var moodHtml = moodTag
          ? '<span class="c-mood">' + escapeHtml(moodTag.emoji + " " + moodTag.label) + "</span> "
          : "";
        var replies = repliesByParent[c.id] || [];
        var repliesHtml = replies.length
          ? '<ul class="c-replies">' + replies.map(function (r) {
              return "<li><strong>" + escapeHtml(r.author_name || "책갈피 사용자") + "</strong> " + escapeHtml(r.text) + "</li>";
            }).join("") + "</ul>"
          : "";
        return (
          "<li><strong>" + iconSvg(lvl.icon, "lv-icon lv-icon--" + lvl.icon) +
          escapeHtml(formatNicknameShort(authorName, score)) + "</strong> " +
          starsHtml + " " + moodHtml + escapeHtml(c.text) + repliesHtml + "</li>"
        );
      }).join("");
    }
  } catch (e) {
    // 위에서 선언한 빈 값 그대로 둔다.
  }

  html = html
    .replace("<title>책갈피 - 한 줄 독서 기록과 책 리뷰 커뮤니티</title>", "<title>" + title + "</title>")
    .replace(
      '<meta name="description" content="책을 덮고 나면, 이야기하고 싶어지잖아요. 같은 책을 읽은 사람들과 한 줄로 생각을 나눠요. 가입 없이 바로 남길 수 있어요.">',
      '<meta name="description" content="' + desc + '">'
    )
    .replace(
      '<link rel="canonical" href="https://book-galpi.com/">',
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
      '<p class="rating-meta" id="detailRatingMeta"></p>',
      '<p class="rating-meta" id="detailRatingMeta">' + escapeHtml(ratingMetaText) + "</p>"
    )
    .replace('<span class="count" id="commentCount"></span>', '<span class="count" id="commentCount">' + commentCountText + "</span>")
    .replace('<ul id="commentList"></ul>', '<ul id="commentList">' + commentListHtml + "</ul>")
    .replace(
      '<div class="detail-summary" id="detailSummary" hidden></div>',
      summaryHtml
        ? '<div class="detail-summary" id="detailSummary">' + summaryHtml + "</div>"
        : '<div class="detail-summary" id="detailSummary" hidden></div>'
    )
    // 홈 첫 화면(헤드라인·버튼·오늘의 한 줄)은 책 페이지에선 처음부터 감춘다. 예전엔 js가 뜬 뒤에야
    // 숨겨서, 검색엔진이 보는 첫 HTML에는 모든 책 페이지 맨 위에 같은 문구가 들어 있었다 —
    // 책마다 다른 글보다 똑같은 글이 많아 "크롤링됨 - 색인 미생성"으로 밀렸다(2026-10-13).
    .replace('<div class="header-intro" id="headerIntro">', '<div class="header-intro" id="headerIntro" hidden>')
    .replace('<section id="libraryView">', '<section id="libraryView" hidden>')
    .replace('<div class="library-toolbar" id="libraryToolbar">', '<div class="library-toolbar" id="libraryToolbar" hidden>')
    .replace('<section id="detailView" hidden>', '<section id="detailView">');

  return new Response(html, { headers: { "Content-Type": "text/html; charset=UTF-8" } });
}

// 요약 두 줄의 HTML. js/render.js renderDetailSummary와 같은 모양이다.
function buildSummaryHtml(tags, dist) {
  var html = "";
  if (tags) html += '<p class="ds-row"><span class="ds-label">남긴 태그</span><span class="ds-value">' + escapeHtml(tags) + "</span></p>";
  if (dist) html += '<p class="ds-row"><span class="ds-label">별점 분포</span><span class="ds-value">' + escapeHtml(dist) + "</span></p>";
  return html;
}
