// 활동 점수: 책 등록 10점, 리뷰(최상위 댓글) 작성 3점, 답글(대댓글) 작성 1점, 좋아요
// 받기 1점. 별도 집계 테이블 없이 매번 books/comments/comment_likes에서 실시간으로
// 계산한다 — 이 사이트 규모(책 수십 권)에서는 매번 계산해도 비용이 미미하고, 삭제나
// 좋아요 취소가 일어나도 항상 현재 데이터와 정확히 일치하며, 기존 book/comment/like
// 쓰기 경로(functions/api/books, functions/api/books/[id]/comments,
// functions/api/comments/[id]/like)를 하나도 건드리지 않아도 된다.
export async function fetchScoreMap(env) {
  var rows = await env.DB.prepare(
    "SELECT nickname, SUM(pts) AS score FROM (" +
    "SELECT owner_name AS nickname, COUNT(*) * 10 AS pts FROM books WHERE owner_name IS NOT NULL AND owner_name != '' GROUP BY owner_name " +
    "UNION ALL " +
    "SELECT author_name AS nickname, COUNT(*) * 3 AS pts FROM comments WHERE parent_id IS NULL AND author_name IS NOT NULL AND author_name != '' GROUP BY author_name " +
    "UNION ALL " +
    "SELECT author_name AS nickname, COUNT(*) * 1 AS pts FROM comments WHERE parent_id IS NOT NULL AND author_name IS NOT NULL AND author_name != '' GROUP BY author_name " +
    "UNION ALL " +
    "SELECT c.author_name AS nickname, COUNT(*) * 1 AS pts FROM comment_likes cl JOIN comments c ON c.id = cl.comment_id " +
    "WHERE c.author_name IS NOT NULL AND c.author_name != '' GROUP BY c.author_name" +
    ") GROUP BY nickname"
  ).all();

  var map = {};
  (rows.results || []).forEach(function (r) { map[r.nickname] = r.score; });
  return map;
}
