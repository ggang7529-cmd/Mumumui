// 나의 독서 기록 만들기 — 고른 책들의 표지를 한 장짜리 이미지로 그려준다.
//
// 아래쪽에 책갈피 마크와 주소가 늘 함께 들어간다. 이미지가 어디로 퍼지든 주소가 같이
// 따라다니게 하려는 것이고, 이 화면이 존재하는 이유이기도 하다.
//
// 표지는 /api/cover-image를 거쳐 받는다. 남의 서버 이미지를 그대로 캔버스에 그리면
// 캔버스가 오염돼서 toBlob()이 보안 오류를 낸다 — 자세한 이유는 그쪽 파일 주석 참고.
import { state, dom, showView } from "./main.js";
import { api } from "./api.js";

var canvas = document.createElement("canvas");
var ctx = canvas.getContext("2d");

// 같은 표지를 두 번 받아오지 않도록 주소별로 들고 있는다. 옵션을 바꿀 때마다 다시
// 그리는데, 그때마다 이미지를 새로 받으면 미리보기가 번쩍인다.
var imgCache = {};

function proxied(url) {
  return "/api/cover-image?u=" + encodeURIComponent(url);
}

function loadCover(url) {
  if (imgCache[url]) return imgCache[url];
  var p = new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = proxied(url);
  });
  imgCache[url] = p;
  return p;
}

// ── 책갈피 서명 ─────────────────────────────────────────────────────────────
// 마크 좌표는 favicon.svg(viewBox 16×16)를 그대로 옮긴 것이다. 리본 두 장이 위는
// 가지런하고 아래만 V로 파여 있으며, 앞장이 길고 진하다. 마크를 바꾸면 favicon.svg와
// css/style.css의 .logo-bar도 같이 고쳐야 한다.
var MARK_W = 8.2, MARK_H = 12;

function ribbon(x, y, w, h, notch, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w / 2, y + h - notch);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawMark(x, y, h, front, back) {
  var s = h / MARK_H;
  ribbon(x, y, 3.4 * s, 12 * s, 1.5 * s, front);
  ribbon(x + 4.8 * s, y, 3.4 * s, 9.5 * s, 1.3 * s, back);
}

function drawBrand(W, cy, dark) {
  // 색은 css/style.css의 --logo-front/--logo-back을 그대로 쓴다(어두운 배경용이 따로 있다).
  var front = dark ? "#d9848b" : "#7c2b36";
  var back = dark ? "#8c4e56" : "#c4837f";
  var nameColor = dark ? "#f1e8dc" : "#231b17";
  var urlColor = dark ? "#b9a897" : "#6f6155";

  var name = "책갈피", tail = "book-galpi.com";
  var nameFont = '700 32px "Gowun Batang", serif';
  var tailFont = '400 26px "Noto Sans KR", sans-serif';
  // 사이트 헤더에서 심볼 높이는 글자 크기의 1.5배다. 그 비율을 그대로 가져왔다.
  var markH = 48, markW = MARK_W * (markH / MARK_H);
  var gapMark = 14, gapName = 16;

  ctx.font = nameFont; var wName = ctx.measureText(name).width;
  ctx.font = tailFont; var wTail = ctx.measureText(tail).width;

  var x = (W - (markW + gapMark + wName + gapName + wTail)) / 2;

  ctx.shadowColor = "transparent";   // 표지에 걸어둔 그림자가 글자까지 따라오지 않게
  drawMark(x, cy - markH / 2, markH, front, back);
  x += markW + gapMark;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = nameColor; ctx.font = nameFont;
  ctx.fillText(name, x, cy);
  x += wName + gapName;

  ctx.fillStyle = urlColor; ctx.font = tailFont;
  ctx.fillText(tail, x, cy);

  ctx.textAlign = "center";
}

// 흩어놓기용 난수. Math.random을 쓰면 다시 그릴 때마다 배치가 달라져서, 옵션 하나만
// 바꿔도 전혀 다른 그림이 된다. 책 순서에만 의존하는 값을 쓴다.
function seeded(i) {
  var s = Math.sin(i * 9301 + 49297) * 233280;
  return s - Math.floor(s);
}

// ── 캔버스 그리기 ───────────────────────────────────────────────────────────

export function drawCollage() {
  var c = state.collage;
  var W = 1080, H = c.ratio === "square" ? 1080 : 1350;
  canvas.width = W; canvas.height = H;

  var dark = c.bg === "#1f1b19";
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  var ink = dark ? "#f1e8dc" : "#231b17";
  var sub = dark ? "#c7b6a4" : "#6f6155";

  var pad = 70;
  // 서명 자리를 먼저 떼어 둔다. 표지와 아래 문구는 그 위에서만 자리를 잡는다.
  var brandY = H - 72;
  var y0 = pad, y1 = brandY - 50;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  var top = (c.top || "").trim(), bottom = (c.bottom || "").trim();
  if (top) {
    ctx.fillStyle = sub;
    ctx.font = '600 44px "Noto Sans KR", sans-serif';
    ctx.fillText(top, W / 2, pad + 30);
    y0 = pad + 90;
  }
  if (bottom) {
    ctx.fillStyle = ink;
    ctx.font = '700 76px "Gowun Batang", serif';
    ctx.fillText(bottom, W / 2, brandY - 96);
    y1 = brandY - 166;
  }

  var items = c.picked;
  var n = items.length;

  if (n === 0) {
    ctx.fillStyle = sub;
    ctx.font = '400 40px "Noto Sans KR", sans-serif';
    ctx.fillText("책을 고르면 여기에 모여요", W / 2, (y0 + y1) / 2);
    drawBrand(W, brandY, dark);
    return canvas.toDataURL("image/png");
  }

  var cols = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
  var rows = Math.ceil(n / cols);
  var gap = 28;
  var areaW = W - pad * 2, areaH = y1 - y0;
  var cellW = (areaW - gap * (cols - 1)) / cols;
  var cellH = (areaH - gap * (rows - 1)) / rows;
  // 책 비율(대략 1:1.45)에 맞춰 칸 안에서 크기를 정한다.
  var bw = Math.min(cellW, cellH / 1.45), bh = bw * 1.45;
  var gridW = cols * bw + gap * (cols - 1), gridH = rows * bh + gap * (rows - 1);
  var gx = (W - gridW) / 2, gy = y0 + (areaH - gridH) / 2;

  for (var i = 0; i < n; i++) {
    var r = Math.floor(i / cols), col = i % cols;
    var inRow = Math.min(cols, n - r * cols);
    // 마지막 줄이 덜 찼으면 그 줄만 가운데로 모은다. 왼쪽에 몰아두면 한쪽이 비어 보인다.
    var rowOffset = (cols - inRow) * (bw + gap) / 2;
    var x = gx + rowOffset + col * (bw + gap), y = gy + r * (bh + gap);

    ctx.save();
    ctx.translate(x + bw / 2, y + bh / 2);
    if (c.style === "messy") {
      ctx.rotate((seeded(i + 1) - 0.5) * 0.22);
      ctx.translate((seeded(i + 7) - 0.5) * 20, (seeded(i + 3) - 0.5) * 20);
    }

    var book = items[i];
    var img = book.loaded;
    var w = bw, h = bh;
    if (img) {
      var ar = img.naturalWidth / img.naturalHeight;
      if (ar > bw / bh) { w = bw; h = bw / ar; } else { h = bh; w = bh * ar; }
    }

    ctx.shadowColor = "rgba(0,0,0,.28)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;

    if (img) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = "transparent";
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      // 표지가 없거나 못 받아온 책 — 서가 카드처럼 책등 색 바탕에 제목을 쓴다.
      ctx.fillStyle = book.spine;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#f3eee4";
      var fs = Math.round(w * 0.11);
      ctx.font = '700 ' + fs + 'px "Gowun Batang", serif';
      wrapTitle(book.title, w * 0.82, fs).forEach(function (line, k, arr) {
        ctx.fillText(line, 0, (k - (arr.length - 1) / 2) * fs * 1.35);
      });
    }
    ctx.restore();
  }

  drawBrand(W, brandY, dark);
  return canvas.toDataURL("image/png");
}

// 표지 없는 책의 제목을 칸 너비에 맞춰 잘라 준다. 네 줄을 넘으면 말줄임표로 끊는다.
function wrapTitle(title, maxWidth, fontSize) {
  var words = String(title || "").split(/\s+/);
  var lines = [], line = "";
  for (var i = 0; i < words.length; i++) {
    var next = line ? line + " " + words[i] : words[i];
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = words[i];
    } else {
      line = next;
    }
    if (lines.length === 4) break;
  }
  if (line && lines.length < 4) lines.push(line);
  if (lines.length === 4 && words.length > lines.join(" ").split(/\s+/).length) {
    lines[3] = lines[3].slice(0, Math.max(1, lines[3].length - 1)) + "…";
  }
  return lines;
}

// ── 화면 ────────────────────────────────────────────────────────────────────

var MAX_PICK = 12;

// 표지를 못 받아온 책의 배경색. js/render.js의 COVERS와 같은 책등 색이다.
var SPINES = ["#6E2733", "#8C3A38", "#A85C46", "#7A4A52", "#6B5240"];

function spineFor(title) {
  var hash = 0;
  var t = String(title || "");
  for (var i = 0; i < t.length; i++) hash = (hash * 31 + t.charCodeAt(i)) >>> 0;
  return SPINES[hash % SPINES.length];
}

// 등록된 책과 카카오 검색 결과를 같은 모양으로 맞춘다. 고른 목록에서는 둘을 구분하지
// 않으므로, 어느 쪽에서 왔든 같은 키(key)로 중복을 가린다.
function toPick(row) {
  return {
    key: row.isbn || row.id || row.title,
    title: row.title || "",
    cover: row.cover || "",
    spine: spineFor(row.title),
    loaded: null
  };
}

function isPicked(key) {
  return state.collage.picked.some(function (p) { return p.key === key; });
}

function togglePick(row) {
  var c = state.collage;
  var item = toPick(row);
  if (isPicked(item.key)) {
    c.picked = c.picked.filter(function (p) { return p.key !== item.key; });
    renderCollage();
    return;
  }
  if (c.picked.length >= MAX_PICK) {
    c.note = "한 번에 " + MAX_PICK + "권까지 담을 수 있어요.";
    renderCollage();
    return;
  }
  c.picked.push(item);
  c.note = "";
  renderCollage();

  // 표지를 받아온 뒤 다시 그린다. 받아오는 동안에도 책등 색으로 자리는 잡혀 있어서,
  // 고르자마자 미리보기에 바로 한 칸이 늘어난다.
  if (item.cover) {
    loadCover(item.cover).then(function (img) {
      item.loaded = img;
      if (state.view === "collage") updatePreview();
    });
  }
}

function buildPickTile(row, picked) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "collage-tile" + (picked ? " is-picked" : "");
  btn.setAttribute("aria-pressed", picked ? "true" : "false");
  btn.setAttribute("aria-label", row.title + (picked ? " 빼기" : " 담기"));
  btn.style.setProperty("--spine", spineFor(row.title));

  // 표지가 없거나 주소가 죽은 책은 제목 타일로 보여준다. 그냥 두면 깨진 이미지
  // 아이콘이 떠서, 고를 수 있는 책인지조차 알아보기 어렵다.
  var title = document.createElement("span");
  title.className = "collage-tile-title";
  title.textContent = row.title;

  if (row.cover) {
    var img = document.createElement("img");
    img.src = row.cover;          // 화면에 보여주기만 하는 자리라 캔버스 경로를 안 거친다
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", function () {
      img.remove();
      btn.insertBefore(title, btn.firstChild);
    });
    btn.appendChild(img);
  } else {
    btn.appendChild(title);
  }

  var mark = document.createElement("span");
  mark.className = "collage-tile-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = picked ? "✓" : "+";
  btn.appendChild(mark);

  btn.addEventListener("click", function () { togglePick(row); });
  return btn;
}

function renderShelf() {
  var box = dom.collageShelf;
  // 책을 담을 때마다 목록을 다시 그리는데, 그냥 두면 스크롤이 맨 위로 튄다 — 아래쪽
  // 책을 고르려던 사람은 매번 다시 내려와야 한다.
  var scrolled = box.scrollTop;
  box.innerHTML = "";
  var books = state.books || [];
  if (books.length === 0) {
    var none = document.createElement("p");
    none.className = "empty-note";
    none.textContent = "아직 등록된 책이 없어요.";
    box.appendChild(none);
    return;
  }
  books.forEach(function (b) {
    box.appendChild(buildPickTile(b, isPicked(b.isbn || b.id || b.title)));
  });
  box.scrollTop = scrolled;
}

function renderSearchResults() {
  var box = dom.collageResults;
  var rows = state.collage.results;
  box.innerHTML = "";
  box.hidden = rows.length === 0;
  rows.forEach(function (b) {
    box.appendChild(buildPickTile(b, isPicked(b.isbn || b.id || b.title)));
  });
}

function renderPicked() {
  var c = state.collage;
  dom.collagePicked.hidden = c.picked.length === 0;
  dom.collagePickedCount.textContent = c.picked.length ? "(" + c.picked.length + ")" : "";
  var strip = dom.collagePickedStrip;
  strip.innerHTML = "";
  c.picked.forEach(function (p) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "collage-chip";
    chip.setAttribute("aria-label", p.title + " 빼기");
    var name = document.createElement("span");
    name.textContent = p.title;
    chip.appendChild(name);
    var x = document.createElement("span");
    x.className = "collage-chip-x";
    x.setAttribute("aria-hidden", "true");
    x.textContent = "×";
    chip.appendChild(x);
    chip.addEventListener("click", function () {
      c.picked = c.picked.filter(function (k) { return k.key !== p.key; });
      renderCollage();
    });
    strip.appendChild(chip);
  });
}

function updatePreview() {
  dom.collageOut.src = drawCollage();
  var empty = state.collage.picked.length === 0;
  dom.collageSaveBtn.disabled = empty;
  // 모바일에서는 이 버튼이 화면 아래에 늘 떠 있다. 아무것도 안 담았을 때 "이미지로
  // 저장"이라고만 쓰여 있으면 왜 안 눌리는지 알 수 없어서, 글자로 다음 할 일을 말해준다.
  dom.collageSaveBtn.textContent = empty ? "책을 먼저 골라주세요" : "이미지로 저장";
}

export function renderCollage() {
  var c = state.collage;

  dom.collageTop.value = c.top;
  dom.collageBottom.value = c.bottom;
  syncSeg(dom.collageRatio, c.ratio);
  syncSeg(dom.collageStyle, c.style);
  syncSeg(dom.collageBg, c.bg);

  renderPicked();
  renderShelf();
  renderSearchResults();
  dom.collageNote.textContent = c.note || "";
  updatePreview();
}

function syncSeg(group, value) {
  Array.prototype.forEach.call(group.querySelectorAll("button"), function (b) {
    b.setAttribute("aria-pressed", b.dataset.v === value ? "true" : "false");
  });
}

function bindSeg(group, key) {
  group.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    state.collage[key] = b.dataset.v;
    syncSeg(group, b.dataset.v);
    updatePreview();
  });
}

export function openCollage() {
  showView("collage");
  renderCollage();
  gtag("event", "open_collage");
}

export function initCollage() {
  bindSeg(dom.collageRatio, "ratio");
  bindSeg(dom.collageStyle, "style");
  bindSeg(dom.collageBg, "bg");

  dom.collageTop.addEventListener("input", function () {
    state.collage.top = this.value;
    updatePreview();
  });
  dom.collageBottom.addEventListener("input", function () {
    state.collage.bottom = this.value;
    updatePreview();
  });

  function search() {
    var q = dom.collageSearch.value.trim();
    if (!q) return;
    state.collage.note = "찾는 중...";
    dom.collageNote.textContent = state.collage.note;
    api("/api/search-books?q=" + encodeURIComponent(q)).then(function (data) {
      state.collage.results = data.books || [];
      state.collage.note = state.collage.results.length ? "" : "검색 결과가 없어요.";
      renderCollage();
    }).catch(function (e) {
      state.collage.results = [];
      state.collage.note = e.message;
      renderCollage();
    });
  }
  dom.collageSearchBtn.addEventListener("click", search);
  dom.collageSearch.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); search(); }
  });

  dom.collageSaveBtn.addEventListener("click", function () {
    if (state.collage.picked.length === 0) return;
    canvas.toBlob(function (blob) {
      if (!blob) {
        dom.collageNote.textContent = "이미지를 만들지 못했어요. 미리보기를 길게 눌러 저장해주세요.";
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "책갈피-독서기록.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 바로 해제하면 브라우저가 내려받기를 시작하기 전에 사라질 수 있다.
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      gtag("event", "save_collage", { count: state.collage.picked.length });
    }, "image/png");
  });

  // 글꼴이 늦게 와도 미리보기가 기본 글꼴로 굳어 있지 않게 한 번 더 그린다.
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('700 76px "Gowun Batang"'),
      document.fonts.load('600 44px "Noto Sans KR"')
    ]).then(function () {
      if (state.view === "collage") updatePreview();
    }).catch(function () {});
  }
}
