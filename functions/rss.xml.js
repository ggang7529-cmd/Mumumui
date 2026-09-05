function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c];
  });
}

// 최근 등록된 책은 네이버가 sitemap.xml 전체 크롤 주기를 기다리지 않고 RSS로 더 빨리
// 발견하도록, 신간 20권만 담는다 (전체 목록은 sitemap.xml이 이미 담당).
var ITEM_LIMIT = 20;

export async function onRequestGet(context) {
  var env = context.env;
  var origin = new URL(context.request.url).origin;

  var rows = await env.DB.prepare(
    "SELECT id, title, author, contents, text, rating_sum, rating_count, owner_name, created_at " +
    "FROM books ORDER BY created_at DESC LIMIT ?1"
  )
    .bind(ITEM_LIMIT)
    .all();
  var books = rows.results || [];

  var items = books.map(function (b) {
    var link = origin + "/book/" + encodeURIComponent(b.id);
    var avgRating = b.rating_count > 0 ? Math.round((b.rating_sum / b.rating_count) * 10) / 10 : null;
    // 상세 페이지 메타 설명과 같은 우선순위: 책 소개가 있으면 그걸, 없으면 등록자의
    // 한 줄 감상을 보여준다 — 둘 다 RSS 리더에서 클릭 전에 내용을 가늠하는 용도.
    var descSource = b.contents ? b.contents.trim() : b.text ? b.text.trim() : "";
    var desc = descSource.length > 200 ? descSource.slice(0, 200).trim() + "…" : descSource;
    if (avgRating !== null) desc = "★" + avgRating.toFixed(1) + " · " + desc;

    return (
      "<item>" +
      "<title>" + escapeXml(b.title + " - " + b.author) + "</title>" +
      "<link>" + escapeXml(link) + "</link>" +
      '<guid isPermaLink="true">' + escapeXml(link) + "</guid>" +
      "<pubDate>" + new Date(b.created_at).toUTCString() + "</pubDate>" +
      "<description>" + escapeXml(desc) + "</description>" +
      "</item>"
    );
  });

  var xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
    "<channel>\n" +
    "<title>책갈피 - 최근 등록된 책 리뷰</title>\n" +
    "<link>" + origin + "/</link>\n" +
    "<description>읽은 책마다 별점과 한 줄 감상을 남겨두는 개인 서재</description>\n" +
    "<language>ko-kr</language>\n" +
    '<atom:link href="' + origin + '/rss.xml" rel="self" type="application/rss+xml" />\n' +
    "<lastBuildDate>" + new Date().toUTCString() + "</lastBuildDate>\n" +
    items.join("\n") +
    "\n</channel>\n</rss>";

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=UTF-8" } });
}
