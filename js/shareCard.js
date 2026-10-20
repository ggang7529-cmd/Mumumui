// 공유 카드(리디자인 B안 제안 ③) — 스토리 비율(1080×1920) 이미지 두 가지.
//   한 장: 한 줄 하나를 큰 책갈피 한 장으로(책 상세의 공유 버튼, 한 줄을 꽂은 직후 알림 띠).
//   모음: 이번 달(없으면 지금까지) 꽂은 책갈피를 세로 띠로 모아서(공개 기록의 "모음 카드 저장").
// 저장은 내 책장 한 컷(js/collage.js)과 같은 방식이다 — 아이폰·아이패드는 공유 창(앨범으로 가는
// 유일한 길), 그 밖은 내려받기. 사파리는 공유 창을 "누른 바로 그 순간"에만 열어 주므로, 그림과
// 파일을 누른 자리에서 기다림 없이(동기로) 만든다 — toBlob은 비동기라 쓰지 않는다.
//
// 표지 이미지는 그리지 않는다(다른 서버 그림을 캔버스에 그리면 저장이 막힌다 — js/collage.js
// 머리 주석). 책갈피 색 띠와 글자만으로 그린다.

var W = 1080, H = 1920;
var PAPER = "#ECECE6", INK = "#151515";
var COLORS = { tomato: "#F2643F", cobalt: "#2E46D8", mint: "#9ED9BC", butter: "#F6D24A" };
var SET_COLORS = ["#F2643F", "#2E46D8", "#9ED9BC", "#F6D24A", "#ECECE6"];
var DISPLAY = '"Black Han Sans", "IBM Plex Sans KR", sans-serif';
var BODY = '"IBM Plex Sans KR", "Apple SD Gothic Neo", sans-serif';

function inkOn(hex) { return hex === COLORS.cobalt ? "#FFFFFF" : INK; }

// 한국어는 띄어쓰기 단위로 자르되, 한 단어가 칸보다 길면 글자 단위로 자른다. maxLines를 넘으면 …
function wrap(ctx, text, maxWidth, maxLines) {
  var words = String(text || "").split(/\s+/).filter(Boolean);
  var lines = [], line = "";
  function push(l) { lines.push(l); }
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    var next = line ? line + " " + w : w;
    if (ctx.measureText(next).width <= maxWidth) { line = next; continue; }
    if (line) { push(line); line = ""; }
    // 단어 하나가 칸보다 길면 글자 단위로.
    while (ctx.measureText(w).width > maxWidth) {
      var cut = w.length;
      while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxWidth) cut--;
      push(w.slice(0, cut));
      w = w.slice(cut);
    }
    line = w;
  }
  if (line) push(line);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    var last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLogo(ctx, y, dark) {
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = "400 66px " + DISPLAY;
  ctx.fillStyle = dark ? PAPER : INK;
  ctx.fillText("책갈피", 84, y);
  var w = ctx.measureText("책갈피").width;
  ctx.fillStyle = COLORS.tomato;
  ctx.fillText(".", 84 + w, y);
  ctx.textAlign = "right";
  ctx.font = "700 36px " + BODY;
  ctx.fillStyle = dark ? PAPER : INK;
  ctx.fillText("book-galpi.com", W - 84, y);
}

function stars(n) {
  var s = "";
  for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "☆";
  return s;
}

// 한 장: { name, text, title, rating, color }
export function drawShareOne(c) {
  var canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = INK;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = "700 39px " + BODY;
  ctx.fillText((c.name ? c.name + "님이 " : "") + "꽂은 책갈피", 84, 102);
  // 책갈피를 매단 끈
  ctx.fillRect(W / 2 - 3, 0, 6, 360);

  var bm = COLORS[c.color] || COLORS.tomato;
  var bw = 600, bh = 1320, bx = (W - bw) / 2, by = 288;
  ctx.save();
  ctx.translate(W / 2, by + bh / 2);
  ctx.rotate(-3 * Math.PI / 180);
  ctx.translate(-W / 2, -(by + bh / 2));
  ctx.shadowColor = "rgba(21,21,21,0.2)";
  ctx.shadowBlur = 108;
  ctx.shadowOffsetY = 54;
  ctx.fillStyle = bm;
  roundRect(ctx, bx, by, bw, bh, 18);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(W / 2, by + 90, 30, 0, Math.PI * 2);
  ctx.fill();

  var ink = inkOn(bm);
  ctx.fillStyle = ink;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "700 66px " + BODY;
  var lines = wrap(ctx, "“" + c.text + "”", bw - 132, 11);
  lines.forEach(function (l, i) { ctx.fillText(l, bx + 66, by + 192 + i * 102); });

  ctx.textBaseline = "alphabetic";
  ctx.font = "700 36px " + BODY;
  var titleLines = wrap(ctx, c.title || "", bw - 132, 2);
  var ty = by + bh - 72 - 54 - (titleLines.length - 1) * 50;
  titleLines.forEach(function (l, i) { ctx.fillText(l, bx + 66, ty + i * 50); });
  ctx.font = "400 36px " + BODY;
  if (c.rating) ctx.fillText(stars(c.rating), bx + 66, by + bh - 72);
  ctx.restore();

  drawLogo(ctx, 1830, false);
  return canvas;
}

// 모음: { name, label, count, items: [{ title, color }], best }
export function drawShareSet(c) {
  var canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#B9B9B2";
  ctx.font = "700 36px " + BODY;
  ctx.fillText(c.label, 78, 102);
  ctx.fillStyle = PAPER;
  ctx.font = "400 102px " + DISPLAY;
  ctx.fillText("책갈피 " + c.count + "장을", 78, 168);
  ctx.fillText("꽂았어요", 78, 288);

  var heights = [900, 780, 858, 720, 816];
  var bottom = 1330;
  (c.items || []).slice(0, 5).forEach(function (item, i) {
    var x = 78 + i * 186, h = heights[i], y = bottom - h;
    var color = COLORS[item.color] || SET_COLORS[i];
    ctx.fillStyle = color;
    roundRect(ctx, x, y, 156, h, 9);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + 78, y + 48, 18, 0, Math.PI * 2);
    ctx.fill();
    // 세로 글씨(책 제목) — 한국어 세로쓰기처럼 글자를 세운 채 위에서 아래로 쌓는다.
    ctx.fillStyle = inkOn(color);
    ctx.font = "700 42px " + BODY;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    var chars = Array.from(String(item.title || "").replace(/\s+/g, " "));
    var step = 50, maxChars = Math.floor((h - 132) / step);
    if (chars.length > maxChars) chars = chars.slice(0, maxChars - 1).concat(["…"]);
    chars.forEach(function (ch, k) {
      if (ch === " ") return;
      ctx.fillText(ch, x + 78, y + 102 + k * step);
    });
  });

  ctx.fillStyle = "#3A3A38";
  ctx.fillRect(78, 1440, W - 156, 3);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = PAPER;
  if (c.best) {
    ctx.font = "400 45px " + BODY;
    ctx.fillText("가장 오래 남은 한 줄", 78, 1482);
    ctx.font = "700 45px " + BODY;
    wrap(ctx, "“" + c.best + "”", W - 156, 2).forEach(function (l, i) { ctx.fillText(l, 78, 1554 + i * 70); });
  }
  drawLogo(ctx, 1830, true);
  return canvas;
}

// ── 저장 ────────────────────────────────────────────────────────────────────

function prefersShareSheet() {
  var ua = navigator.userAgent || "";
  var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && typeof navigator.share === "function" && typeof navigator.canShare === "function";
}

// 캔버스 → PNG Blob(동기). 공유 창 허락이 끊기지 않게 toBlob(비동기) 대신 쓴다.
function canvasBlob(canvas) {
  var data = canvas.toDataURL("image/png");
  var bin = atob(data.split(",")[1]);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

function download(blob, fileName) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

// 그린 캔버스를 저장한다. 반환값은 저장 방식("share" | "download").
export function saveShareCard(canvas, fileName) {
  var blob = canvasBlob(canvas);
  if (prefersShareSheet()) {
    var file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(function (e) {
        if (e && e.name === "AbortError") return;
        download(blob, fileName);
      });
      return "share";
    }
  }
  download(blob, fileName);
  return "download";
}

// 구글 폰트는 글자 범위별 조각으로 받아서, 화면에 아직 안 나온 글자("꽂" 등)는 캔버스에 그리는
// 순간 준비돼 있지 않다 — 그러면 그 글자만 다른 글꼴로 그려진다. 누르는 순간 기다릴 수는 없으니
// (사파리 공유 창 허락) 카드를 만들 수 있는 화면을 그릴 때 미리 받아 둔다.
var warmed = {};
export function warmShareFonts(extraText) {
  if (!document.fonts || !document.fonts.load) return;
  var sample = "책갈피 꽂았어요 꽂은 님이 의 월 장을 가장 오래 남은 한 줄 0123456789 ★☆ book-galpi.com" + (extraText || "");
  var key = sample;
  if (warmed[key]) return;
  warmed[key] = true;
  document.fonts.load('400 102px "Black Han Sans"', sample).catch(function () {});
  document.fonts.load('700 66px "IBM Plex Sans KR"', sample).catch(function () {});
  document.fonts.load('400 45px "IBM Plex Sans KR"', sample).catch(function () {});
}
