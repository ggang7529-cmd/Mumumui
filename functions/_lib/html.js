// index.html을 읽어 치환하는 SSR 라우트들(functions/book/[id].js, functions/u/[name].js)이
// 함께 쓰는 이스케이프. 원래 book/[id].js 안에만 있던 것을 두 번째 사용처가 생기면서
// 옮겨왔고, 내용은 그대로다.
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
