// 저장소 루트의 CLAUDE.md는 Claude Code가 로컬에서 읽기 위한 내부 문서일 뿐, 공개
// 웹에 노출할 의도가 없다. 하지만 배포 디렉터리가 저장소 루트와 같아서 정적 자산으로
// 그대로 서빙되어 왔다. Pages Functions는 정적 자산보다 먼저 매칭되므로, 이 라우트를
// 가로채 404로 응답해 실제 파일 내용이 나가지 않게 막는다.
export async function onRequest() {
  return new Response("Not Found", { status: 404 });
}
