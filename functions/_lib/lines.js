// "한 줄"과 "별점만"을 가르는 기준.
//
// 별점만 남긴 기록(책 상세의 별을 누르기만 한 것)도 comments에 한 행으로 들어간다 — 나중에
// 한 줄을 남기면 새 행을 만들지 않고 그 행에 본문·태그·닉네임을 채운다. 그래서 "한 줄"은
// 답글이 아닌 행 중 본문이나 태그가 있는 것이고, 둘 다 비어 있으면 별점만이다.
//
//   books.rating_count / rating_sum : 별점만 포함 (평균 별점, "평가 N")
//   books.comment_count             : 한 줄만 ("한 줄 N", 한 줄 많은 순)
//   점수                            : 한 줄 3점, 별점만 1점 (functions/_lib/scores.js)
//
// 한줄평 목록·오늘의 한 줄·프로필의 남긴 한줄평처럼 "문장"을 보여주는 곳은 별점만을 뺀다.
export function hasLineSql(alias) {
  var p = alias ? alias + "." : "";
  return "(trim(coalesce(" + p + "text, '')) != '' OR coalesce(" + p + "mood, '') != '')";
}

export function rowHasLine(row) {
  return !!(row && (String(row.text || "").trim() || row.mood));
}

// 점수 규칙과 같은 값. 별점·한 줄을 저장한 뒤 "+N점" 토스트에 쓸 차이를 서버가 계산한다.
export function rowPoints(row) {
  if (!row || !row.author_name) return 0;
  return rowHasLine(row) ? 3 : 1;
}
