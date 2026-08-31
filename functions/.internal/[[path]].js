// .internal/에는 D1 스키마·마이그레이션 SQL처럼 대시보드에 붙여넣기용으로만 쓰는
// 파일을 둔다. 배포 디렉터리가 저장소 루트와 같아 정적 자산으로 그대로 서빙되므로,
// 이 캐치올 라우트로 /.internal/* 전체를 가로채 404로 응답한다.
export async function onRequest() {
  return new Response("Not Found", { status: 404 });
}
