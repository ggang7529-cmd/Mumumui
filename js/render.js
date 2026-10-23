import { state, dom, AUTH_MODE, openDetail, showView, rateBook, openMyShelf, startBookRegistration, closeSearchSheet, openProfile, openLevelGuide, openLevelRanking, closeLevelGuide, NICK_PROMPT_KEY, isBomBook, deleteBookOfMonth, shareSetCard, shareLineFor } from "./main.js";
import { withNickname } from "./nickAuth.js";
import { PICKABLE_MOOD_TAGS, findMoodTag } from "./moodTags.js";
import { bookmarkColorOf, BOOKMARK_COLORS, BOOKMARK_COLOR_LABELS } from "./bookmarkColor.js";
import { warmShareFonts } from "./shareCard.js";
import { topTags, tagsText, distText } from "./bookSummary.js";
import { GENRE_ORDER, genreOfBook } from "./kdc.js";
import { coverFor, pickGenreBooks } from "./relatedBooks.js";
import { groupEditions } from "./bookIdentity.js";
import { MIN_RATINGS_FOR_RECOMMEND } from "./recommendRules.js";
import {
  googleConfigured, myUid, api, refreshBooks, refreshComments, refreshFeatured, refreshMyScore, getSavedNickname, saveNickname,
  renderGoogleButtons, isAdminMode, getAdminKey, getNotifSeenMap, saveNotifSeenMap, normalizeBook
} from "./api.js";
import { LEVELS, SCORE_RULES, getLevel, levelProgress, formatNicknameShort, formatNicknameFull } from "./levels.js";

// 표지 없는 책의 "책등" 배경색. 예전엔 녹색·청색·남색까지 섞인 6색이라 브랜드 색과
// 무관한 무지개가 됐다 — 버건디에서 클레이/탠으로 이어지는 같은 계열 5색으로 좁혀,
// 서로 구분은 되면서 서가 전체가 한 톤으로 읽히게 한다. 전부 크림색 활자를 얹어도
// 대비가 충분한 중간~어두운 명도로 골랐다.
// 표지 이미지가 없는 책의 책등 색. 리디자인 B안의 표지 예시처럼 깊고 차분한 색 — 위에 얹는
// 원색 책갈피 탭과 흰 제목 글자가 잘 보이게 어둡게 잡았다.

// index.html 상단 스프라이트에 정의된 선형 아이콘을 <svg><use></svg> 한 벌로 만들어 준다.
// 크기·색은 CSS(.icon)가 정하고, stroke는 currentColor라 놓이는 자리의 글자색을 따라간다.
// SVG는 HTML과 네임스페이스가 달라서 document.createElement로는 못 만든다 — createElementNS 필수.
var SVG_NS = "http://www.w3.org/2000/svg";
var XLINK_NS = "http://www.w3.org/1999/xlink";

export function buildIcon(name, className) {
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon" + (className ? " " + className : ""));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  var use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "#i-" + name);
  // 사파리 12 이전은 SVG2의 href를 모르고 xlink:href만 읽는다. 둘 다 적어두면 양쪽에서 뜬다.
  use.setAttributeNS(XLINK_NS, "xlink:href", "#i-" + name);
  svg.appendChild(use);
  return svg;
}

// 표지 없는 책의 책등 색(서버 첫 HTML과 같은 색이라 js/relatedBooks.js에 있다).
export { coverFor };

// 댓글/답글 작성자 닉네임 span을 공통으로 만든다. 별점·좋아요·날짜까지 같이 붙는 줄이라
// "등급아이콘 레벨 닉네임" 축약형으로 표시한다 (예: 책아이콘 + "6 이과생").
// 닉네임은 사용자 입력이므로 textContent로만 넣는다 — innerHTML로 조립하지 않는다.
// color를 주면(책갈피 카드 안) 등급 아이콘 대신 그 책갈피 색의 작은 책갈피에 등급 숫자를
// 넣고 옆에 닉네임만 적는다(리디자인 B안).
function buildAuthorChip(name, score, className, color) {
  var clean = (name || "").trim();
  // 닉네임을 누르면 그 사람의 기록으로 간다. 처음 온 사람이 "여기 사람이 있구나"를 느끼는
  // 거의 유일한 통로라서, 목록의 모든 닉네임을 통째로 눌리게 해뒀다.
  //
  // 닉네임이 빈 값이면(옛 기록 중 일부) 누를 곳이 없으므로 예전처럼 그냥 span으로 둔다.
  var span = document.createElement(clean ? "button" : "span");
  span.className = className + (clean ? " is-linked" : "");
  if (clean) {
    span.type = "button";
    span.setAttribute("aria-label", clean + "님의 기록 보기");
    span.addEventListener("click", function (e) {
      // 한줄평 줄 전체가 클릭 대상인 곳이 있어 상위로 번지지 않게 막는다.
      e.stopPropagation();
      openProfile(clean);
    });
  }
  if (color) {
    var badge = document.createElement("span");
    badge.className = "bm-badge bm-" + color;
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = String(getLevel(score).level);
    span.appendChild(badge);
    span.appendChild(document.createTextNode(clean || "익명"));
    return span;
  }
  span.appendChild(buildIcon(getLevel(score).icon, "lv-icon lv-icon--" + getLevel(score).icon));
  span.appendChild(document.createTextNode(formatNicknameShort(clean, score)));
  return span;
}

// 카카오 도서 검색이 주는 썸네일은 실제로
// https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=<원본 이미지 URL>
// 형태로, 120x174짜리로 축소된 썸네일 프록시 URL이다(더 큰 사이즈를 요청해도 403으로
// 거부돼서 프록시 쪽에서 확대는 불가능). 그런데 fname 파라미터 안에 원본 이미지(보통
// 400px대 폭)가 그대로 들어있으므로, 그 원본 URL을 꺼내서 프록시를 건너뛰고 직접 쓰면
// 훨씬 선명하다. 패턴이 안 맞는 URL(다른 출처 등)은 그대로 둔다.
export function upscaleCover(url) {
  if (!url) return url;
  var match = url.match(/^https?:\/\/[^/]*kakaocdn\.net\/thumb\/[^/]+\/\?fname=(.+)$/);
  if (!match) return url;
  try {
    return decodeURIComponent(match[1]).replace(/^http:\/\//, "https://");
  } catch (e) {
    return url;
  }
}

export function formatDate(ms) {
  if (!ms) return "방금 등록";
  var d = new Date(ms);
  return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
}

var NEW_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isNewBook(b) {
  return Date.now() - b.updatedAt < NEW_BADGE_WINDOW_MS;
}

export function bookRating(b) {
  if (!b.ratingCount) return null;
  return { avg: b.ratingSum / b.ratingCount, count: b.ratingCount };
}

export function findBook(id) {
  for (var i = 0; i < state.books.length; i++) if (state.books[i].id === id) return state.books[i];
  return null;
}

// 별점 하나를 그린다. 채운 별과 빈 별은 같은 선형 아이콘을 쓰고 CSS에서 안쪽을 칠할지만
// 다르게 한다(.star-icon.is-filled) — 모양이 어긋나지 않아 5칸이 나란히 맞는다.
function buildStarIcon(filled) {
  return buildIcon("star", "star-icon" + (filled ? " is-filled" : ""));
}

// 감정 태그 고르기 줄. 별점(renderStars)과 같은 자리에서 같은 방식으로 쓰라고 모양을
// 맞춰뒀다 — 선택된 것 하나만 표시하고, 같은 걸 다시 누르면 선택이 풀린다(선택 항목이라
// 실수로 누른 걸 되돌릴 방법이 있어야 한다).
export function renderMoodPicker(container, selectedId, onSelect) {
  if (!container) return;
  container.innerHTML = "";
  // 고르는 칸은 글자만(이모지는 목록의 배지에만 붙는다 — 칩마다 이모지가 달리면 줄이 시끄럽다).
  PICKABLE_MOOD_TAGS.forEach(function (tag) {
    var btn = document.createElement("button");
    btn.type = "button";
    var isOn = tag.id === selectedId;
    btn.className = "mood-chip" + (isOn ? " is-on" : "");
    btn.textContent = tag.label;
    // 하나만 고를 수 있으므로 라디오로 읽히게 한다.
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", isOn ? "true" : "false");
    btn.addEventListener("click", function () {
      onSelect(isOn ? null : tag.id);
    });
    container.appendChild(btn);
  });
}

// 목록에 붙는 작은 태그 배지. 태그가 없으면 null을 돌려주니 호출부에서 그대로 건너뛰면 된다.
//
// 앞에 이모지를 붙이는 게 이 줄이 "고른 태그"라는 유일한 표시다. 예전엔 테두리를 둘러
// 구분했는데, 상자를 두르니 바로 위아래의 직접 쓴 한줄평과 따로 노는 게 더 커 보였다.
export function buildMoodBadge(moodId) {
  var tag = findMoodTag(moodId);
  if (!tag) return null;
  var badge = document.createElement("span");
  badge.className = "c-mood";
  badge.textContent = tag.emoji + " " + tag.label;
  return badge;
}

export function renderStars(container, rating, interactive, onSelect) {
  container.innerHTML = "";
  for (var i = 1; i <= 5; i++) {
    var filled = i <= rating;
    if (interactive) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = filled ? "filled" : "";
      btn.appendChild(buildStarIcon(filled));
      btn.setAttribute("aria-label", i + "점");
      btn.addEventListener("click", function (idx) {
        return function () { onSelect(idx); };
      }(i));
      container.appendChild(btn);
    } else {
      var span = document.createElement("span");
      span.className = filled ? "" : "empty";
      span.appendChild(buildStarIcon(filled));
      container.appendChild(span);
    }
  }
}

// 카드/하이라이트처럼 별 5개를 한 덩어리로만 보여주는 자리에서 쓴다.
export function buildStarRow(rating, className) {
  var wrap = document.createElement("span");
  wrap.className = className || "star-row";
  for (var i = 1; i <= 5; i++) wrap.appendChild(buildStarIcon(i <= rating));
  return wrap;
}

// 시트에서 책을 골랐을 때. 이미 책장에 있는 책이면 b.existingId가 있다 — 저장하면 그 책에
// 한줄평만 붙는다(js/main.js). 고른 뒤에야 닉네임·별점·한 줄 칸을 연다.
export function selectBook(b) {
  state.selectedBook = b;
  dom.bookSearchField.hidden = true;
  dom.selectedBookField.hidden = false;
  dom.writeFields.hidden = false;

  var $cover = document.getElementById("selectedBookCover");
  $cover.innerHTML = "";
  $cover.style.setProperty("--cover", coverFor(b.title));
  if (b.cover) {
    var img = document.createElement("img");
    img.src = upscaleCover(b.cover);
    img.alt = "";
    $cover.appendChild(img);
  }
  // 판본을 묶은 줄의 정리된 제목이 아니라 실제로 저장될 제목을 보여준다.
  document.getElementById("selectedBookTitle").textContent = b.title;
  document.getElementById("selectedBookAuthor").textContent = b.author ? " · " + b.author : "";

  var existing = !!b.existingId;
  dom.selectedBookNote.textContent = existing && b.reviewCount
    ? b.reviewCount + "명이 남긴 책이에요"
    : "첫 한 줄의 주인공이 돼보세요";
  dom.selectedBookNote.classList.toggle("is-existing", existing);

  // 길이 제한이 경로마다 다르다(책 등록 80자, 기존 책 한줄평 60자 — 서버가 그 길이로 자른다).
  // 화면에서 미리 맞춰야 서버가 말없이 뒷부분을 자르는 일이 없다.
  var limit = existing ? 60 : 80;
  var $text = document.getElementById("fText");
  $text.maxLength = limit;
  if ($text.value.length > limit) $text.value = $text.value.slice(0, limit);
  document.getElementById("fTextHint").textContent = "최대 " + limit + "자, 한 줄로 남겨주세요";
}

// "다시 검색". 검색창과 결과는 그대로 둔다 — 돌아왔을 때 방금 본 목록에서 바로 고를 수 있게.
export function clearSelectedBook() {
  state.selectedBook = null;
  dom.bookSearchField.hidden = false;
  dom.selectedBookField.hidden = true;
  dom.writeFields.hidden = true;
}

function compactText(v) {
  return String(v || "").normalize("NFC").toLowerCase().replace(/\s+/g, "");
}

// 책장(state.books = DB의 책 전체, 홈이 이미 받아둔 목록)에서 제목+저자로 찾는다. 띄어쓰기는
// 무시하고, 검색어를 띄어 쓴 낱말이 모두 들어 있어야 한다("헤세 데미안"도 걸리게).
function matchRegisteredBooks(query, limit) {
  var words = String(query || "").trim().split(/\s+/).map(compactText).filter(Boolean);
  if (!words.length) return [];
  return state.books.filter(function (b) {
    var hay = compactText(b.title + b.author);
    return words.every(function (w) { return hay.indexOf(w) !== -1; });
  }).sort(function (a, b) {
    return (b.commentCount || 0) - (a.commentCount || 0) || b.updatedAt - a.updatedAt;
  }).slice(0, limit || 5);
}

function buildResultRow(opts) {
  var b = opts.book;
  var li = document.createElement("li");
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "book-result-item" + (opts.registered ? " is-registered" : "");

  var placeholder = document.createElement("div");
  placeholder.className = "book-result-noimg";
  placeholder.textContent = "표지 없음";
  if (b.cover) {
    var img = document.createElement("img");
    img.src = upscaleCover(b.cover);
    img.alt = "";
    // 표지 주소가 죽었으면 깨진 그림 대신 "표지 없음" 칸으로.
    img.addEventListener("error", function () { img.replaceWith(placeholder); });
    btn.appendChild(img);
  } else {
    btn.appendChild(placeholder);
  }

  var info = document.createElement("div");
  var t = document.createElement("div");
  t.className = "book-result-title";
  t.textContent = opts.title;
  var a = document.createElement("div");
  a.className = "book-result-author";
  // 여러 판본을 묶은 줄에서는 출판사가 판본마다 다를 수 있어 대표 판본 것만 적으면
  // 오해를 산다. 저자만 적고 판본 수를 붙인다.
  a.textContent = b.author + (!opts.registered && opts.editionCount < 2 && b.publisher ? " · " + b.publisher : "");
  if (opts.editionCount > 1) {
    var ed = document.createElement("span");
    ed.className = "book-result-editions";
    ed.textContent = "판본 " + opts.editionCount + "개";
    a.appendChild(ed);
  }
  // 등록 여부. 이미 있는 책은 몇 명이 남겼는지, 없는 책은 첫 기록을 권한다 — 고르기 전에
  // "여기에 붙는다 / 새로 생긴다"를 알 수 있게.
  var status = document.createElement("div");
  status.className = "book-result-status";
  status.textContent = opts.registered && opts.reviewCount
    ? opts.reviewCount + "명이 남긴 책이에요"
    : "첫 한 줄의 주인공이 돼보세요";
  info.appendChild(t);
  info.appendChild(a);
  info.appendChild(status);
  btn.appendChild(info);

  btn.addEventListener("click", function () { selectBook(opts.select); });
  li.appendChild(btn);
  return li;
}

function registeredRow(r, editionCount) {
  return buildResultRow({
    // 책장에 있는 책은 책장에 보이는 제목 그대로 적는다(여기서만 다른 이름이면 헷갈린다).
    book: r, title: r.title, registered: true, reviewCount: r.commentCount || 0,
    editionCount: editionCount || 1,
    select: {
      existingId: r.id, reviewCount: r.commentCount || 0,
      title: r.title, author: r.author, cover: r.cover,
      isbn: r.isbn, contents: r.contents
    }
  });
}

function noteRow(text) {
  var li = document.createElement("li");
  li.className = "book-result-empty";
  li.textContent = text;
  return li;
}

// 헤더 돋보기 "책 찾기"의 결과. 책장(state.books)에서만 찾는다 — 이건 리뷰를 보러 온
// 사람용이라 고르면 그 책 상세로 간다. 없으면 그 말로 한 줄 남기기 시트를 열어 준다.
export function renderSiteSearch() {
  var q = dom.siteSearchInput.value.trim();
  var list = dom.siteSearchResults;
  list.innerHTML = "";
  if (!q) { list.hidden = true; return; }
  list.hidden = false;

  var found = matchRegisteredBooks(q, 20);
  if (found.length) {
    var head = document.createElement("li");
    head.className = "site-search-head";
    head.textContent = "책장에 있는 책";
    list.appendChild(head);
  }
  found.forEach(function (r) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "book-result-item";
    var placeholder = document.createElement("div");
    placeholder.className = "book-result-noimg";
    placeholder.textContent = "표지 없음";
    if (r.cover) {
      var img = document.createElement("img");
      img.src = upscaleCover(r.cover);
      img.alt = "";
      img.addEventListener("error", function () { img.replaceWith(placeholder); });
      btn.appendChild(img);
    } else {
      btn.appendChild(placeholder);
    }
    var info = document.createElement("div");
    var t = document.createElement("div");
    t.className = "book-result-title";
    t.textContent = r.title;
    var a = document.createElement("div");
    a.className = "book-result-author";
    a.textContent = r.author;
    var meta = document.createElement("div");
    meta.className = "book-result-status";
    var rating = bookRating(r);
    meta.textContent = (rating ? "★" + rating.avg.toFixed(1) + " · " : "") + "책갈피 " + (r.commentCount || 0);
    info.appendChild(t);
    info.appendChild(a);
    info.appendChild(meta);
    btn.appendChild(info);
    btn.addEventListener("click", function () {
      gtag("event", "click_search_result", { book_id: r.id });
      closeSearchSheet();
      openDetail(r.id);
    });
    li.appendChild(btn);
    list.appendChild(li);
  });

  // 찾는 책이 책장에 없을 때(또는 결과 끝에) 그 말로 한 줄 남기기 시트를 여는 점선 버튼.
  var li = document.createElement("li");
  li.className = "book-result-empty site-search-empty";
  if (!found.length) {
    var p = document.createElement("p");
    p.textContent = "책장에 아직 없는 책이에요.";
    li.appendChild(p);
  }
  var go = document.createElement("button");
  go.type = "button";
  go.className = "add-bookmark-btn";
  go.textContent = "+ 책장에 없는 책 새로 꽂기";
  go.addEventListener("click", function () {
    gtag("event", "click_add_from_search");
    closeSearchSheet();
    startBookRegistration(q);
  });
  li.appendChild(go);
  list.appendChild(li);
}

// 한 줄 남기기 시트의 검색 결과. 위에는 이미 책장에 있는 책(치는 대로 바로), 아래에는
// 카카오 검색 결과(검색 버튼을 눌렀을 때)를 이어 붙인다. 카카오 결과 중 책장에 이미 있는
// 책은 "등록된 책" 줄로 바꿔 보여주고, 위에 이미 나온 책이면 빼서 한 책이 두 줄로 나오지
// 않게 한다. 판본(리커버·양장·개정판 …)만 다른 책은 한 줄로 묶고 "판본 N개"를 단다 —
// 묶는 기준과 대표 판본 고르는 순서는 js/bookIdentity.js(서버의 중복 검사와 같은 파일).
export function renderBookResults() {
  var q = dom.bookSearchInput.value.trim();
  dom.bookResults.innerHTML = "";
  if (!q) { dom.bookResults.hidden = true; return; }
  dom.bookResults.hidden = false;

  var shown = {};
  var local = matchRegisteredBooks(q);
  local.forEach(function (r) {
    shown[r.id] = true;
    dom.bookResults.appendChild(registeredRow(r, 1));
  });

  var search = state.bookSearch && state.bookSearch.query === q ? state.bookSearch : null;
  if (!search || !search.results) {
    dom.bookResults.appendChild(noteRow(
      local.length ? "찾는 책이 없으면 '검색'을 눌러 아직 없는 책까지 찾아보세요" : "'검색'을 누르면 모든 책에서 찾아요"
    ));
    return;
  }
  if (search.error) {
    dom.bookResults.appendChild(noteRow("검색에 실패했어요: " + search.error));
    return;
  }

  var added = 0;
  groupEditions(search.results, state.books).forEach(function (g) {
    if (g.registeredId) {
      if (shown[g.registeredId]) return;
      var r = state.books.find(function (x) { return x.id === g.registeredId; });
      if (!r) return;
      shown[r.id] = true;
      dom.bookResults.appendChild(registeredRow(r, g.editionCount));
    } else {
      dom.bookResults.appendChild(buildResultRow({
        book: g.book, title: g.displayTitle, registered: false, editionCount: g.editionCount,
        select: Object.assign({}, g.book, { displayTitle: g.displayTitle })
      }));
    }
    added++;
  });
  if (!added && !local.length) dom.bookResults.appendChild(noteRow("검색 결과가 없어요."));
}

// 헤더의 "내 닉네임 · 등급" 칩. 4단계 리디자인 때 헤더에서 뺐다가 다시 들였다 — 지금 어떤
// 이름으로 기록되는지와 등급이 늘 보이는 게 낫다는 판단. PC는 "아이콘 3 [등급명] 닉네임",
// 휴대폰은 폭이 모자라 등급명을 빼고 "아이콘 3 닉네임"(css .header-me-level).
// 점수가 바뀌면 renderAuthBox가 같이 부른다(js/api.js refreshMyScore).
function renderHeaderMe() {
  var box = document.getElementById("headerMe");
  if (!box) return;
  box.innerHTML = "";
  var nickname = AUTH_MODE === "nickname" ? getSavedNickname() : "";
  box.hidden = !nickname;
  if (!nickname) return;

  var lvl = getLevel(state.myScore);
  var chip = document.createElement("div");
  chip.className = "user-chip user-chip--level";

  var badge = document.createElement("button");
  badge.type = "button";
  badge.className = "lv-badge-btn";
  badge.setAttribute("aria-label", "등급 안내 보기 (지금 " + lvl.level + "등급 " + lvl.name + ")");
  // 리디자인 B안: 등급 숫자가 적힌 작은 토마토 책갈피. 등급명은 헤더에서 빼고 등급 안내에서만.
  var num = document.createElement("span");
  num.className = "lv-num";
  num.setAttribute("aria-hidden", "true");
  num.textContent = String(lvl.level);
  badge.appendChild(num);
  badge.addEventListener("click", function () { openLevelGuide("badge"); });
  chip.appendChild(badge);

  var nameBtn = document.createElement("button");
  nameBtn.type = "button";
  nameBtn.className = "user-chip-name is-linked";
  nameBtn.setAttribute("aria-label", nickname + "님의 기록 보기");
  nameBtn.addEventListener("click", function () { openProfile(nickname); });
  var name = document.createElement("span");
  name.className = "user-name";
  name.textContent = nickname;
  nameBtn.appendChild(name);
  chip.appendChild(nameBtn);
  box.appendChild(chip);
}

export function renderAuthBox() {
  renderHeaderMe();
  var $box = document.getElementById("authBox");
  $box.innerHTML = "";
  if (AUTH_MODE === "nickname") {
    // 내 책장(이 기기가 평가한 책 · 읽고 싶은 책)으로 가는 길. 닉네임이 없어도 별점은 남길 수
    // 있게 되면서(2026-10-09) 늘 보인다. 예전엔 닉네임이 있을 때만 "내 기록"(공개 프로필)이었고,
    // 그 프로필은 헤더의 닉네임 칩과 내 책장 화면 위쪽 링크로 간다.
    var myShelfTile = document.createElement("button");
    myShelfTile.type = "button";
    myShelfTile.className = "quick-tile";
    myShelfTile.textContent = "내 책장";
    myShelfTile.addEventListener("click", function () { openMyShelf("rated"); });
    $box.appendChild(myShelfTile);
    return;
  }
  if (state.currentUser) {
    var chip = document.createElement("div");
    chip.className = "user-chip";
    if (state.currentUser.picture) {
      var avatar = document.createElement("img");
      avatar.className = "user-avatar";
      avatar.src = state.currentUser.picture;
      avatar.alt = "";
      chip.appendChild(avatar);
    }
    var name = document.createElement("span");
    name.className = "user-name";
    name.textContent = state.currentUser.name || "사용자";
    chip.appendChild(name);
    var logout = document.createElement("button");
    logout.type = "button";
    logout.className = "btn-logout";
    logout.textContent = "로그아웃";
    logout.addEventListener("click", function () {
      api("/api/auth/logout", { method: "POST" }).then(function () {
        state.currentUser = null;
        renderAuthBox();
        if (state.view === "detail") renderDetail();
      });
    });
    chip.appendChild(logout);
    $box.appendChild(chip);
  } else if (!googleConfigured()) {
    var note = document.createElement("span");
    note.className = "user-name";
    note.textContent = "Google 로그인 설정 필요";
    $box.appendChild(note);
  } else {
    var slot = document.createElement("div");
    slot.id = "googleBtnHeader";
    $box.appendChild(slot);
    renderGoogleButtons();
  }
}

// ── 등급 안내 ───────────────────────────────────────────────────────────────
//
// 점수를 새로 계산하지 않는다. functions/_lib/scores.js가 매긴 점수(state.myScore)와
// js/levels.js의 표를 읽어서 그리기만 한다.

function levelIconFor(lv) {
  return buildIcon(lv.icon, "lv-icon lv-icon--" + lv.icon);
}

function buildFactValue(text) {
  var el = document.createElement("strong");
  el.className = "level-fact-value";
  el.textContent = text;
  return el;
}

// 전체 순위 화면. 같은 팝업 안에서 등급 안내와 자리를 바꿔 가며 쓴다.
//
// 점수는 서버가 한 번에 계산해 정렬까지 마쳐서 준다(functions/api/ranking.js) —
// 여기서는 등급 아이콘만 붙여 그린다. 동점자 처리(1, 2, 2, 4식)도 서버와 같은
// 규칙이라 위쪽 "10명 중 1위"와 어긋나지 않는다.
export function renderLevelRanking() {
  var box = dom.levelRankingBody;
  var myName = getSavedNickname();

  box.innerHTML = "";
  var loading = document.createElement("p");
  loading.className = "level-rank-note";
  loading.textContent = "불러오는 중…";
  box.appendChild(loading);

  api("/api/ranking").then(function (data) {
    var rows = data.ranking || [];
    box.innerHTML = "";

    if (rows.length === 0) {
      var none = document.createElement("p");
      none.className = "level-rank-note";
      none.textContent = "아직 기록을 남긴 사람이 없어요.";
      box.appendChild(none);
      return;
    }

    var head = document.createElement("p");
    head.className = "level-rank-note";
    head.textContent = "기록을 남긴 " + data.total + "명";
    box.appendChild(head);

    var list = document.createElement("ol");
    list.className = "rank-list";
    rows.forEach(function (row) {
      var lv = getLevel(row.score);
      var li = document.createElement("li");
      li.className = "rank-row" + (myName && row.name === myName ? " is-me" : "");

      var num = document.createElement("span");
      num.className = "rank-row-num";
      num.textContent = row.rank;
      li.appendChild(num);

      li.appendChild(levelIconFor(lv));

      // 닉네임을 누르면 그 사람 기록으로 간다 — 한줄평 목록·헤더 칩과 같은 동작이라
      // 따로 배울 게 없다. 팝업은 먼저 닫는다. 그대로 두면 프로필이 시트 뒤에서
      // 열려서, 누른 사람은 아무 일도 안 일어난 줄 안다.
      var name = document.createElement("button");
      name.type = "button";
      name.className = "rank-row-name";
      name.textContent = row.name;
      name.setAttribute("aria-label", row.name + "님의 기록 보기");
      name.addEventListener("click", function () {
        closeLevelGuide();
        openProfile(row.name);
      });
      li.appendChild(name);

      // 같은 닉네임이 둘일 수 있는 사이트라(로그인이 없다) 내 줄에 표를 달아준다 —
      // 이름만으로는 어느 줄이 나인지 확신할 수 없다.
      if (myName && row.name === myName) {
        var meBadge = document.createElement("span");
        meBadge.className = "rank-row-me";
        meBadge.textContent = "나";
        li.appendChild(meBadge);
      }

      var lvTag = document.createElement("span");
      lvTag.className = "rank-row-level";
      lvTag.textContent = lv.level + "등급";
      li.appendChild(lvTag);

      var score = document.createElement("span");
      score.className = "rank-row-score";
      score.textContent = row.score + "점";
      li.appendChild(score);

      list.appendChild(li);
    });
    box.appendChild(list);

    // 내 줄이 아래쪽에 있으면 열자마자 안 보인다. 목록 안에서만 스크롤해 가운데로 온다.
    var me = list.querySelector(".is-me");
    if (me) box.scrollTop = Math.max(0, me.offsetTop - box.clientHeight / 2 + me.offsetHeight / 2);
  }).catch(function () {
    box.innerHTML = "";
    var err = document.createElement("p");
    err.className = "level-rank-note";
    err.textContent = "순위를 불러오지 못했어요. 잠시 후 다시 열어주세요.";
    box.appendChild(err);
  });
}

// 팝업을 열 때마다 다시 그린다 — 점수는 책을 등록하거나 좋아요를 받을 때마다 바뀌는데,
// 한 번 그려두고 재활용하면 오래 켜둔 탭에서 옛 점수가 남는다.
// 진행 카드(등급·점수·막대 / 다음 등급까지 / N명 중 M위 + 전체 순위). 등급 안내 팝업과
// 내 기록(프로필) 맨 위가 같은 모양을 쓴다.
function fillLevelProgress(box, score, myRank, myTotal, onRanking) {
  var p = levelProgress(score);

  var now = document.createElement("p");
  now.className = "level-progress-now";
  // 등급 숫자가 적힌 큰 책갈피(리디자인 B안 — 헤더의 작은 책갈피와 같은 모양).
  var mark = document.createElement("span");
  mark.className = "lv-num lv-num--lg";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = String(p.current.level);
  now.appendChild(mark);
  var nowText = document.createElement("span");
  nowText.textContent = p.current.level + "등급 " + p.current.name;
  now.appendChild(nowText);
  var nowScore = document.createElement("span");
  nowScore.className = "level-progress-score";
  nowScore.textContent = score + "점";
  now.appendChild(nowScore);
  box.appendChild(now);

  var bar = document.createElement("div");
  bar.className = "level-bar";
  var fill = document.createElement("span");
  fill.className = "level-bar-fill";
  fill.style.width = Math.round(p.ratio * 100) + "%";
  bar.appendChild(fill);
  box.appendChild(bar);

  // "다음 등급까지 몇 점"과 "몇 명 중 몇 위" 두 줄이 이 팝업에서 제일 궁금한 값인데,
  // 아래 배점표·등급표와 같은 크기·같은 색이라 설명문에 묻혀 있었다. 둘만 따로 묶어
  // 구분선 아래에 세우고, 숫자는 한 단계 키워 브랜드 색으로 세운다.
  var facts = document.createElement("div");
  facts.className = "level-facts";

  var goal = document.createElement("p");
  goal.className = "level-fact";
  if (p.next) {
    goal.appendChild(document.createTextNode("다음 등급까지 "));
    goal.appendChild(buildFactValue(p.remain + "점"));
    var nextTag = document.createElement("span");
    nextTag.className = "level-fact-note";
    nextTag.appendChild(levelIconFor(p.next));
    nextTag.appendChild(document.createTextNode(p.next.name));
    goal.appendChild(nextTag);
  } else {
    goal.appendChild(buildFactValue("가장 높은 등급"));
    goal.appendChild(document.createTextNode("이에요"));
  }
  facts.appendChild(goal);

  // 순위는 분모까지 적는다. "3위"만 적으면 처음엔 커 보이지만 "몇 명 중인데?"가
  // 곧바로 따라오고, 사람이 많지 않다는 걸 나중에 알면 오히려 깎여서 돌아온다.
  // 아직 사람이 적은 지금은 분모가 "여기 아홉 명이 기록 중"이라는 신호이기도 하다.
  //
  // 혼자뿐이면(1명 중 1위) 순위라는 말이 성립하지 않으므로 줄째로 뺀다.
  if (myRank && myTotal > 1) {
    var rankLine = document.createElement("p");
    rankLine.className = "level-fact";
    rankLine.appendChild(document.createTextNode("기록을 남긴 " + myTotal + "명 중 "));
    rankLine.appendChild(buildFactValue(myRank + "위"));

    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "level-rank-btn";
    allBtn.textContent = "전체 순위";
    allBtn.addEventListener("click", onRanking);
    rankLine.appendChild(allBtn);

    facts.appendChild(rankLine);
  }

  box.appendChild(facts);
}

export function renderLevelGuide() {
  var nickname = getSavedNickname();
  var score = state.myScore || 0;

  // ① 진행 바. 닉네임이 없으면 보여줄 점수 자체가 없으므로 안내 한 줄로 대신한다 —
  //    "0점 / 다음 등급까지 20점"은 아직 시작도 안 한 사람에게 숙제처럼 읽힌다.
  dom.levelProgress.innerHTML = "";
  if (!nickname) {
    var note = document.createElement("p");
    note.className = "level-progress-empty";
    note.textContent = "첫 기록을 남기면 등급이 생겨요";
    dom.levelProgress.appendChild(note);
  } else {
    fillLevelProgress(dom.levelProgress, score, state.myRank, state.myTotal, openLevelRanking);
  }

  // ② 배점. 표의 숫자는 js/levels.js의 SCORE_RULES에서 온다(계산은 서버가 한다).
  dom.levelRuleList.innerHTML = "";
  SCORE_RULES.forEach(function (rule) {
    var li = document.createElement("li");
    var label = document.createElement("span");
    label.textContent = rule.label;
    var pts = document.createElement("strong");
    pts.textContent = "+" + rule.points + "점";
    li.appendChild(label);
    li.appendChild(pts);
    dom.levelRuleList.appendChild(li);
  });

  // ③ 20단계 표. 닉네임이 없으면 어느 줄도 강조하지 않는다(아직 내 등급이 없다).
  dom.levelTable.innerHTML = "";
  var myLevel = nickname ? getLevel(score).level : 0;
  LEVELS.forEach(function (lv, i) {
    var next = LEVELS[i + 1];
    var li = document.createElement("li");
    // 접힌 표는 내 등급 앞 하나 ~ 뒤 셋(등급이 없으면 처음 다섯)만 보인다(리디자인 B안).
    var near = myLevel ? lv.level >= myLevel - 1 && lv.level <= myLevel + 3 : lv.level <= 5;
    li.className = "level-row" + (lv.level === myLevel ? " is-current" : "") + (near ? " is-near" : "");

    // 지난 등급 = 회색 책갈피, 지금 = 토마토, 아직 = 점선.
    var mark = document.createElement("span");
    mark.className = "level-row-mark " + (lv.level < myLevel ? "is-past" : lv.level === myLevel ? "is-current" : "is-future");
    mark.setAttribute("aria-hidden", "true");
    li.appendChild(mark);

    var num = document.createElement("span");
    num.className = "level-row-num";
    num.textContent = lv.level;
    li.appendChild(num);

    var name = document.createElement("span");
    name.className = "level-row-name";
    name.textContent = lv.name;
    li.appendChild(name);

    var range = document.createElement("span");
    range.className = "level-row-range";
    range.textContent = next ? lv.min + "~" + (next.min - 1) + "점" : lv.min + "점~";
    li.appendChild(range);

    if (lv.level === myLevel) {
      var badge = document.createElement("span");
      badge.className = "level-row-badge";
      badge.textContent = "지금";
      li.appendChild(badge);
    }

    dom.levelTable.appendChild(li);
  });
  dom.levelTable.classList.toggle("is-collapsed", !state.levelTableOpen);
  var more = document.getElementById("levelTableMore");
  more.textContent = state.levelTableOpen ? "접기" : "20등급 모두 보기";
  more.setAttribute("aria-expanded", state.levelTableOpen ? "true" : "false");
}

// category에는 KDC 대분류 이름("문학")만 들어 있다 — 국립중앙도서관 조회 시점에
// functions/_lib/bookClass.js가 대분류로 줄여서 저장한다. 다만 예전에 도서관 정보나루로
// 채우려 했던 시절의 행에는 "문학 > 한국문학 > 소설" 같은 경로가 남아 있을 수 있어,
// 그런 값은 여기서 최상위 한 단계만 잘라 같은 옵션으로 묶는다.
// 분류 칩. 책이 한 권이라도 있는 갈래만 정해진 순서(js/kdc.js GENRE_ORDER)로 놓고 권수를
// 붙인다. 골라둔 갈래가 사라지면(마지막 책이 지워짐) 전체로 돌아간다.
function renderGenreChips() {
  var counts = {};
  state.books.forEach(function (r) {
    var g = genreOfBook(r.classNo, r.category);
    counts[g] = (counts[g] || 0) + 1;
  });
  if (state.categoryFilter && !counts[state.categoryFilter]) state.categoryFilter = "";

  dom.genreChips.innerHTML = "";
  var chips = [["", "전체", state.books.length]];
  GENRE_ORDER.forEach(function (g) { if (counts[g]) chips.push([g, g, counts[g]]); });
  // 갈래가 하나뿐이면(아직 분류가 다 비어 "기타"만 있는 등) 칩을 늘어놓을 이유가 없다.
  dom.genreChips.hidden = chips.length <= 2;
  chips.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "genre-chip" + (state.categoryFilter === c[0] ? " active" : "");
    b.dataset.genre = c[0];
    b.setAttribute("aria-pressed", state.categoryFilter === c[0] ? "true" : "false");
    b.appendChild(document.createTextNode(c[1]));
    var n = document.createElement("span");
    n.className = "genre-chip-count";
    n.textContent = c[2];
    b.appendChild(n);
    dom.genreChips.appendChild(b);
  });
}

// 홈 서가와 프로필의 "등록한 책"이 같은 카드를 쓴다. 원래 renderLibrary 안에 그대로
// 펼쳐져 있던 것을 옮겨만 놓았고 내용은 바꾸지 않았다.
function buildBookCard(r) {
    var rating = bookRating(r);
    var card = document.createElement("a");
    card.href = "/book/" + encodeURIComponent(r.id);
    // 표지 이미지가 없으면 제목을 크게 조판한 "책등"으로 보여준다(css의 .book-card--typo).
    card.className = r.cover ? "book-card" : "book-card book-card--typo";
    card.setAttribute("aria-label", r.title + ", " + r.author + ", " +
      (rating ? "평점 " + rating.avg.toFixed(1) + "점, 참여자 " + rating.count + "명" : "아직 평점 없음"));

    // 표지는 깨끗하게 둔다 — 그 위에는 NEW 표시만 얹는다. 표지 이미지가 없는 책은 색 배경에
    // 제목을 조판한 "책등"(css .book-card--typo)이 표지 노릇을 한다.
    var coverBox = document.createElement("div");
    coverBox.className = "b-cover";
    coverBox.style.setProperty("--cover", coverFor(r.title));
    // 표지가 없을 때 CSS(.book-card--typo .b-cover::before)가 content: attr(data-title)로
    // 읽어 책등에 제목을 찍는다.
    coverBox.dataset.title = r.title;

    if (r.cover) {
      var img = document.createElement("img");
      img.className = "b-cover-img";
      img.src = upscaleCover(r.cover);
      img.alt = r.title + " 표지";
      coverBox.appendChild(img);
    }

    if (isNewBook(r)) {
      var badge = document.createElement("span");
      badge.className = "b-new-badge";
      badge.textContent = "NEW";
      coverBox.appendChild(badge);
    }

    // 표지 위로 튀어나온 책갈피 탭(리디자인 B안) — 한 줄 수만큼, 최대 4장을 서로 다른 색으로.
    var tabCount = Math.min(r.commentCount || 0, 4);
    for (var t = 0; t < tabCount; t++) {
      var tab = document.createElement("span");
      tab.className = "bm-tab bm-tab--" + (t + 1) + " bm-" + BOOKMARK_COLORS[t];
      tab.setAttribute("aria-hidden", "true");
      coverBox.appendChild(tab);
    }

    card.appendChild(coverBox);

    // 표지 아래 정보: 제목 → 별점(평균 · 한 줄 수) → 대표 한 줄(최대 2줄). 예전엔 이걸 표지
    // 위 어두운 그라데이션에 얹었는데, 표지를 가리고 글자도 표지 색에 따라 읽기 힘들었다.
    // "아직 1명이 읽었어요" 같은 권유 문구와 마우스를 올리면 나오던 "별점 남기기 →"도 뺐다 —
    // 행동은 홈 위쪽의 "한 줄 남기기" 하나로 모았다.
    var info = document.createElement("div");
    info.className = "b-info";

    var titleEl = document.createElement("div");
    titleEl.className = "b-title";
    titleEl.textContent = r.title;
    info.appendChild(titleEl);

    // 리디자인 B안: 제목 → 대표 한 줄 → "★4.0 · 책갈피 2" 순서.
    var meta = document.createElement("div");
    meta.className = "b-meta";
    if (rating) {
      meta.textContent = "★" + rating.avg.toFixed(1) + " · 책갈피 " + (r.commentCount || 0);
    } else {
      meta.textContent = "아직 책갈피가 없어요";
    }

    // 대표 한 줄: 좋아요 많은 한줄평(목록 API의 top_text) > 첫 한줄평 > 첫 한줄평의 태그.
    // 한줄평이 다 지워진 책(rating 없음)은 books.text가 지워진 첫 한줄평이라 쓰지 않는다.
    var lineText = r.topText || (rating ? r.text : "");
    var tag = rating ? findMoodTag(r.mood) : null;
    if (lineText || tag) {
      var line = document.createElement("p");
      line.className = "b-line";
      line.textContent = lineText ? "“" + lineText + "”" : tag.emoji + " " + tag.label;
      info.appendChild(line);
    }
    info.appendChild(meta);
    card.appendChild(info);

    card.addEventListener("click", function (id) {
      return function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openDetail(id);
      };
    }(r.id));

    return card;
}
export function renderLibrary() {
  renderGenreChips();

  var query = state.searchQuery.trim().toLowerCase();
  var visible = query
    ? state.books.filter(function (r) { return r.title.toLowerCase().indexOf(query) !== -1; })
    : state.books.slice();

  if (state.categoryFilter) {
    visible = visible.filter(function (r) { return genreOfBook(r.classNo, r.category) === state.categoryFilter; });
  }

  if (state.sortMode === "comments") {
    visible.sort(function (a, b) { return b.commentCount - a.commentCount || b.createdAt - a.createdAt; });
  } else if (state.sortMode === "rating") {
    visible.sort(function (a, b) {
      var ra = bookRating(a), rb = bookRating(b);
      return (rb ? rb.avg : 0) - (ra ? ra.avg : 0) || b.createdAt - a.createdAt;
    });
  } else if (state.sortMode === "title") {
    visible.sort(function (a, b) { return a.title.localeCompare(b.title, "ko"); });
  } else {
    visible.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  var filtered = !!(query || state.categoryFilter);

  // "모두의 책장" 옆 한마디. 숫자만("74권") 두면 표 같아서 서가에 책이 꽂혀 있는 모습으로
  // 말한다("지금 74권이 있어요"). 분류로 거르면 그 칸 얘기로 바꾼다.
  if (!state.booksLoaded) {
    dom.countLabel.textContent = "";
  } else if (filtered) {
    dom.countLabel.textContent = state.categoryFilter + " " + visible.length + "권";
  } else {
    dom.countLabel.textContent = state.books.length
      ? "지금 " + state.books.length + "권"
      : "아직 비어 있어요";
  }

  dom.shelf.innerHTML = "";

  if (state.booksLoaded && state.books.length === 0) {
    var note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "아직 기록한 책이 없어요. 위쪽 '한 줄 남기기'로 첫 책을 남겨보세요.";
    dom.shelf.appendChild(note);
  } else if (filtered && visible.length === 0) {
    var noMatch = document.createElement("p");
    noMatch.className = "empty-note";

    if (query) {
      // 제목으로 찾았는데 없을 때가 이탈이 제일 쉬운 지점이다. 예전에는 "없어요"에서
      // 끝나 다음에 뭘 해야 할지 알려주지 않았다 — 아직 아무도 안 남긴 책이라는 뜻이니
      // 그 자리에서 등록으로 넘어갈 수 있게 안내와 버튼을 같이 둔다.
      //
      // 문구에 조사(은/는)를 붙이지 않았다. 검색어 끝 글자의 받침에 따라 달라지는데
      // 영문·숫자 제목까지 맞추기가 애매해서, 조사가 필요 없는 형태로 썼다.
      var typed = state.searchQuery.trim();
      noMatch.textContent = "아직 “" + typed + "” 기록이 없어요";

      var subNote = document.createElement("p");
      subNote.className = "empty-note-sub";
      subNote.textContent = "찾으시는 책이면 직접 남겨보실래요?";

      var goRegister = document.createElement("button");
      goRegister.type = "button";
      goRegister.className = "empty-note-cta";
      goRegister.textContent = "이 제목으로 등록하기";
      goRegister.addEventListener("click", function () {
        gtag("event", "click_add_from_search");
        // 방금 친 제목을 그대로 넘겨서 카카오 책 검색까지 자동으로 돌게 한다.
        startBookRegistration(typed);
      });

      // .shelf가 카드용 그리드라서 세 요소를 그대로 넣으면 각각 다른 칸/행에 떨어져
      // 사이에 카드 간격(gap)이 끼어든다. 한 덩어리로 읽히도록 묶어서 넣는다.
      var block = document.createElement("div");
      block.className = "empty-cta";
      block.appendChild(noMatch);
      block.appendChild(subNote);
      block.appendChild(goRegister);
      dom.shelf.appendChild(block);
    } else {
      // 분류 필터만 걸린 경우에는 넘겨줄 검색어가 없어 등록 버튼을 붙이지 않는다.
      noMatch.textContent = "\"" + state.categoryFilter + "\" 분류의 책이 없어요.";
      dom.shelf.appendChild(noMatch);
    }
  }

  visible.forEach(function (r) {
    dom.shelf.appendChild(buildBookCard(r));
  });
}

// 닉네임 한 명분의 기록 화면. 서버가 이미 다 계산해서 내려주므로(functions/api/nickname/
// [name]/reviews.js) 여기서는 그리기만 한다. state.profile이 비어 있으면 아직 불러오는
// 중이라는 뜻이다.
// 내 책장. 탭 둘(평가한 책 N / 읽고 싶은 책 N)에 표지 3열. 평가한 책은 표지 아래 내 별점.
export function renderMyShelf() {
  var data = state.myShelf;
  var tab = state.myShelfTab === "wants" ? "wants" : "rated";
  var nickname = AUTH_MODE === "nickname" ? getSavedNickname() : "";

  var $sub = document.getElementById("myShelfSub");
  $sub.innerHTML = "";
  if (nickname) {
    $sub.appendChild(document.createTextNode(nickname + "님의 책장이에요 · "));
    var profileLink = document.createElement("button");
    profileLink.type = "button";
    profileLink.className = "link-btn";
    profileLink.textContent = "공개 기록 보기";
    profileLink.addEventListener("click", function () { openProfile(nickname); });
    $sub.appendChild(profileLink);
  } else {
    $sub.textContent = "가입 없이 이 기기에서 남긴 기록이 모여요. 한 줄을 남기며 닉네임을 정하면 그 이름으로 이어져요.";
  }

  var counts = { rated: data ? data.rated.length : null, wants: data ? data.wants.length : null };

  // 닉네임 없이 별점·읽고 싶어요가 3개 이상 — 다른 기기에서도 보려면 닉네임이 필요하다는 안내.
  var promptDone = false;
  try { promptDone = !!localStorage.getItem(NICK_PROMPT_KEY); } catch (e) {}
  document.getElementById("myNickPrompt").hidden =
    AUTH_MODE !== "nickname" || !!nickname || promptDone || !data || (counts.rated + counts.wants) < 3;
  [["rated", "myTabRated", "myRatedCount"], ["wants", "myTabWants", "myWantsCount"]].forEach(function (t) {
    var $tab = document.getElementById(t[1]);
    var on = t[0] === tab;
    $tab.classList.toggle("is-on", on);
    $tab.setAttribute("aria-selected", on ? "true" : "false");
    document.getElementById(t[2]).textContent = counts[t[0]] === null ? "" : String(counts[t[0]]);
  });

  var $grid = document.getElementById("myShelfGrid");
  var $empty = document.getElementById("myShelfEmpty");
  $grid.innerHTML = "";
  var $emptyTitle = document.getElementById("myEmptyTitle");
  var $emptyText = document.getElementById("myEmptyText");
  if (!data) {
    $empty.hidden = false;
    $empty.classList.add("is-loading");
    $emptyTitle.textContent = "불러오는 중이에요…";
    $emptyText.textContent = "";
    return;
  }
  $empty.classList.remove("is-loading");
  var items = data[tab];
  $empty.hidden = items.length > 0;
  if (tab === "rated") {
    $emptyTitle.textContent = "첫 책갈피를 꽂아볼까요?";
    $emptyText.textContent = "읽은 책을 찾아 별을 누르면\n여기에 책갈피가 하나씩 쌓여요.";
  } else {
    $emptyTitle.textContent = "읽고 싶은 책을 담아볼까요?";
    $emptyText.textContent = "책에서 \"읽고 싶어요\"를 누르면\n여기에 하나씩 모여요.";
  }

  items.forEach(function (b) {
    var a = document.createElement("a");
    a.className = "my-tile";
    a.href = "/book/" + encodeURIComponent(b.id);
    a.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      openDetail(b.id);
    });

    // 표지 칸은 aspect-ratio 대신 퍼센트 여백으로 높이를 잡는다(사파리 표지 모음판 사건, CLAUDE.md).
    var cover = document.createElement("div");
    cover.className = "my-tile-cover" + (b.cover ? "" : " is-typo");
    cover.style.setProperty("--cover", coverFor(b.title));
    if (b.cover) {
      // 카카오 썸네일(120x174)을 그대로 쓰면 휴대폰 3열(한 칸 ~110px, 화면 배율 2~3배)에서 흐릿하다.
      // 홈 카드처럼 원본 주소를 먼저 쓰고, 그게 죽어 있으면 썸네일, 그것도 안 되면 책등.
      var img = document.createElement("img");
      img.src = upscaleCover(b.cover);
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", function () {
        if (img.getAttribute("src") !== b.cover) { img.src = b.cover; return; }
        img.remove();
        cover.classList.add("is-typo");
      });
      cover.appendChild(img);
    }
    var spine = document.createElement("span");
    spine.className = "my-tile-spine";
    spine.textContent = b.title;
    cover.appendChild(spine);
    a.appendChild(cover);

    var title = document.createElement("span");
    title.className = "my-tile-title";
    title.textContent = b.title;
    a.appendChild(title);

    if (tab === "rated" && b.rating) a.appendChild(buildStarRow(b.rating, "my-tile-stars"));
    $grid.appendChild(a);
  });
}

export function renderProfile() {
  var data = state.profile;
  var isMe = !!data && data.nickname === getSavedNickname();

  dom.profileName.textContent = data ? data.nickname : "";
  if (!data) {
    document.getElementById("profileProgress").hidden = true;
    document.getElementById("profileBadge").hidden = true;
    dom.profileSub.textContent = "불러오는 중...";
    dom.profileStats.innerHTML = "";
    dom.profileShelf.innerHTML = "";
    dom.profileReviews.innerHTML = "";
    dom.profileBookCount.textContent = "";
    dom.profileReviewCount.textContent = "";
    return;
  }

  var lvl = getLevel(data.score);
  // 이름 앞 큰 등급 책갈피(리디자인 B안).
  var $badge = document.getElementById("profileBadge");
  $badge.textContent = String(lvl.level);
  $badge.hidden = false;
  dom.profileSub.textContent = (isMe ? "내 기록 · " : "") + lvl.name + " · " + data.score + "점" +
    (isMe && state.myRank && state.myTotal > 1 ? " · " + state.myTotal + "명 중 " + state.myRank + "위" : "");

  // 내 기록이면 등급 안내 팝업과 같은 진행 카드(다음 등급까지·순위·전체 순위)를 맨 위에 둔다.
  // 점수는 이 응답의 것, 순위는 refreshMyScore가 받아둔 것(openProfile이 새로 받음).
  var $progress = document.getElementById("profileProgress");
  $progress.innerHTML = "";
  $progress.hidden = !isMe;
  if (isMe) {
    fillLevelProgress($progress, data.score, state.myRank, state.myTotal, function () {
      openLevelGuide("profile");
      openLevelRanking();
    });
  }

  // 요약 숫자. 값이 없는 항목(아직 별점을 안 준 경우의 평균)은 아예 빼서 "-"가 줄줄이
  // 늘어서지 않게 한다.
  var s = data.summary;
  // 리디자인 B안: 숫자를 크게(Black Han Sans), 이름은 아래 작게.
  var stats = [
    ["등록한 책", String(s.bookCount)],
    ["꽂은 책갈피", String(s.reviewCount)],
    ["받은 좋아요", String(s.likesReceived)]
  ];
  if (s.avgRating !== null && s.avgRating !== undefined) stats.push(["평균 별점", s.avgRating.toFixed(1)]);
  if (s.replyCount) stats.push(["남긴 답글", String(s.replyCount)]);

  dom.profileStats.innerHTML = "";
  stats.forEach(function (pair) {
    // dt/dd를 <dl>의 직계 자식으로 두면 그리드가 둘을 각각 한 칸씩 잡아서 "등록한 책 3권"이
    // 가로로 흩어진다. 항목마다 div로 묶어 한 칸에 이름 위 값 아래로 세운다(HTML5에서 dl
    // 안의 div 묶음은 정식 문법이다).
    var cell = document.createElement("div");
    var dt = document.createElement("dt");
    dt.textContent = pair[0];
    var dd = document.createElement("dd");
    dd.textContent = pair[1];
    cell.appendChild(dd);
    cell.appendChild(dt);
    dom.profileStats.appendChild(cell);
  });
  // 마지막 칸: 모음 카드 저장(공유 카드, 남긴 한 줄이 있을 때만).
  if (data.reviews.length) {
    warmShareFonts(data.nickname + data.reviews.slice(0, 5).map(function (r) { return r.book_title + (r.text || ""); }).join(""));
    var shareTile = document.createElement("button");
    shareTile.type = "button";
    shareTile.className = "profile-share-tile";
    shareTile.textContent = "모음 카드\n저장 →";
    shareTile.addEventListener("click", shareSetCard);
    dom.profileStats.appendChild(shareTile);
  }
  // 탭(꽂은 책갈피 / 등록한 책) — 둘 중 하나만 보인다.
  var tab = state.profileTab === "books" ? "books" : "reviews";
  [["reviews", "profileTabReviews", "profileReviewsSection"], ["books", "profileTabBooks", "profileBooksSection"]].forEach(function (t) {
    var on = t[0] === tab;
    var $t = document.getElementById(t[1]);
    $t.classList.toggle("is-on", on);
    $t.setAttribute("aria-selected", on ? "true" : "false");
    document.getElementById(t[2]).hidden = !on;
  });

  // 등록한 책 — 홈 서가와 같은 카드를 쓴다.
  dom.profileBookCount.textContent = String(data.books.length);
  dom.profileShelf.innerHTML = "";
  if (data.books.length === 0) {
    var noBook = document.createElement("p");
    noBook.className = "empty-note";
    noBook.textContent = isMe ? "아직 등록한 책이 없어요." : "아직 등록한 책이 없어요";
    dom.profileShelf.appendChild(noBook);
  } else {
    data.books.forEach(function (row) {
      dom.profileShelf.appendChild(buildBookCard(normalizeBook(row)));
    });
  }

  // 남긴 한줄평 — 어느 책에 남긴 건지가 핵심이라 표지와 책 제목을 앞에 둔다.
  dom.profileReviewCount.textContent = String(data.reviews.length);
  dom.profileReviews.innerHTML = "";
  if (data.reviews.length === 0) {
    var noReview = document.createElement("li");
    noReview.className = "empty-note";
    noReview.textContent = isMe ? "아직 꽂은 책갈피가 없어요." : "아직 꽂은 책갈피가 없어요";
    dom.profileReviews.appendChild(noReview);
  } else {
    data.reviews.forEach(function (r) {
      var li = document.createElement("li");
      li.className = "bookmark-card bm-" + bookmarkColorOf(r.id, r.color);

      // 책갈피 카드 한 장(리디자인 B안): 태그 → 한 줄(굵게) → "책 제목 · ★4 · 좋아요 1 · 날짜".
      // 카드 전체가 그 책으로 가는 링크다.
      var link = document.createElement("a");
      link.className = "pr-link";
      link.href = "/book/" + encodeURIComponent(r.book_id);
      link.addEventListener("click", function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openDetail(r.book_id);
      });
      var main = link;

      var badge = buildMoodBadge(r.mood);
      if (badge) main.appendChild(badge);

      if (r.text) {
        var textEl = document.createElement("span");
        textEl.className = "pr-text";
        textEl.textContent = "“" + r.text + "”";
        main.appendChild(textEl);
      }

      var meta = document.createElement("span");
      meta.className = "pr-meta";
      meta.textContent = r.book_title + " · ★" + r.rating + (r.likes ? " · 좋아요 " + r.likes : "") + " · " + formatDate(r.created_at);
      main.appendChild(meta);

      li.appendChild(main);
      dom.profileReviews.appendChild(li);
    });
  }
}

// "나를 위한 추천" 화면.
//
// 카드는 홈 서가와 같은 buildBookCard를 그대로 쓰고, 여기서만 저자 한 줄과 "왜 이 책이
// 골라졌는지"를 덧붙인다. 카드 자체를 고치지 않고 만들어진 카드에 덧붙이는 방식이라
// 홈·프로필 서가는 영향을 받지 않는다.
export function renderRecommend() {
  var data = state.recommend;
  var books = (data && data.books) || [];
  var name = (data && data.nickname) || getSavedNickname();

  dom.recommendTitle.textContent = name ? name + "님을 위한 추천" : "나를 위한 추천";
  dom.recommendShelf.innerHTML = "";
  // 응답 전에는 "기록을 살펴보는 중" 화면이 그 자리를 대신한다(내용은 main.js가 채운다).
  dom.recommendAnalyze.hidden = state.recommendReady;

  // 아직 응답 전. 빈 화면에 "추천할 책이 없다"고 단정해버리면 잠깐 잘못된 안내가 보인다.
  if (!state.recommendReady) {
    dom.recommendSub.textContent = "";
    dom.recommendEmpty.hidden = true;
    dom.recommendClaim.hidden = true;
    return;
  }

  var seedCount = data ? data.seedCount : 0;
  var minRatings = (data && data.minRatings) || MIN_RATINGS_FOR_RECOMMEND;

  // 별점은 남겼는데 아직 모자란 경우. 그냥 "데이터가 없다"고 하면 얼마나 더 해야 하는지
  // 알 수 없어 막힌 느낌만 남는다. 지금 몇 개인지와 몇 개가 남았는지를 같이 보여준다.
  if (seedCount > 0 && seedCount < minRatings) {
    dom.recommendSub.textContent = "";
    dom.recommendEmptyText.textContent =
      "지금 별점 " + seedCount + "개 · " + (minRatings - seedCount) +
      "개만 더 남기면 맞춤 추천을 보여드릴게요. 이미 책장에 있는 책에 별점만 눌러도 됩니다.";
    dom.recommendClaim.hidden = true;   // 누구인지는 이미 알고 있다
    dom.recommendEmpty.hidden = false;
    return;
  }

  // 근거가 아예 없는 경우 — 닉네임이 없거나(첫 방문), 있어도 별점을 하나도 안 남겼거나.
  if (!seedCount) {
    dom.recommendSub.textContent = "";
    // 문구가 "책을 등록해야 한다"로 읽히면 안 된다. 실제로는 이미 등록된 책에 별점만
    // 남겨도 추천이 돌아간다(추천의 근거는 등록이 아니라 별점이다).
    dom.recommendEmptyText.textContent =
      "책을 등록하지 않아도 괜찮아요. 이미 책장에 있는 책에 별점 " + minRatings +
      "개만 남겨주시면, 그걸로 취향을 읽어 골라드릴게요.";
    // 닉네임으로 기록을 다시 집어오는 입구는 이 경우에만 보여준다. 이름이 저장돼 있는데도
    // 별점이 없다면 다른 이름으로 남겼을 수 있으니 문구만 바꿔 같은 칸을 쓴다.
    dom.recommendClaimLabel.textContent = name
      ? "다른 닉네임으로 남기셨나요?"
      : "이미 기록을 남기신 적 있나요?";
    dom.recommendClaimMsg.textContent = "";
    dom.recommendClaim.hidden = false;
    dom.recommendEmpty.hidden = false;
    return;
  }

  // 여기부터는 누구인지 알아낸 뒤라 입력칸이 필요 없다.
  dom.recommendClaim.hidden = true;

  dom.recommendSub.textContent =
    "별점을 남긴 " + seedCount + "권의 저자와 분류를 바탕으로 골랐어요.";

  // 근거는 있는데 걸리는 책이 없는 경우. 자리를 채우려고 아무 책이나 넣지 않는다.
  if (books.length === 0) {
    dom.recommendEmptyText.textContent =
      "아직 비슷한 책을 찾지 못했어요. 책이 더 쌓이면 다시 골라볼게요.";
    dom.recommendEmpty.hidden = false;
    return;
  }

  dom.recommendEmpty.hidden = true;
  books.forEach(function (row, index) {
    var card = buildBookCard(normalizeBook(row));

    // 추천 화면까지 들어온 것은 view_recommend로 잡히지만, 거기서 실제로 책을 눌렀는지는
    // 지금까지 알 수 없었다. 추천이 쓸모가 있는지를 재는 건 이 클릭이라 따로 남긴다.
    // 몇 번째 카드를 눌렀는지(position)도 같이 보내 1위와 2위의 차이를 볼 수 있게 한다.
    // 카드 자체의 이동 동작은 buildBookCard가 이미 달아뒀고, 여기서는 기록만 한다.
    card.addEventListener("click", function () {
      gtag("event", "click_recommend_book", { book_id: row.id, position: index + 1 });
    });
    var info = card.querySelector(".b-info");
    if (!info) return;

    var author = document.createElement("div");
    author.className = "b-author";
    author.textContent = row.author;
    // 제목 바로 아래에 둔다(별점 줄 위).
    info.insertBefore(author, info.children[1] || null);

    // 추천 근거는 화면에 쓰지 않는다. "비슷한 분류 · 사회과학"은 알려주는 게 없었고,
    // "같은 작가 · 김훈"도 저자 줄이 바로 위에 있어서 같은 말을 두 번 하는 꼴이었다.
    // 응답에는 reason/reasonKind가 그대로 오므로(디버깅과 나중에 쓸 여지), 여기서 안 그릴 뿐이다.

    dom.recommendShelf.appendChild(card);
  });
}

// 추천을 고르는 동안 렌즈 아래로 흘러가는 표지 띠. 책장에 실제로 꽂힌 책의 표지를
// 섞어서 쓴다 — "이 책들과 맞춰보는 중"이라는 문장과 그림이 같은 걸 가리키게.
// 띠를 두 번 이어 붙여 -50%만큼 흘리면 이음매 없이 돈다(CSS raScroll).
var SCAN_TILES = 10;

export function renderRecommendScan() {
  var track = dom.recommendScanTrack;
  track.innerHTML = "";
  var pool = state.books.slice();
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  // 표지 있는 책을 앞으로. 책이 아직 안 불려왔으면(주소로 바로 들어온 경우) 색 띠로 채운다.
  pool.sort(function (a, b) { return (b.cover ? 1 : 0) - (a.cover ? 1 : 0); });
  var picks = pool.slice(0, SCAN_TILES);
  while (picks.length < SCAN_TILES) picks.push({ title: "책" + picks.length });

  for (var round = 0; round < 2; round++) {
    picks.forEach(function (b) {
      var tile = document.createElement("span");
      tile.className = "ra-tile";
      tile.style.setProperty("--cover", coverFor(b.title || ""));
      if (b.cover) {
        var img = document.createElement("img");
        img.src = b.cover;
        img.alt = "";
        img.addEventListener("error", function () { img.remove(); });
        tile.appendChild(img);
      }
      track.appendChild(tile);
    });
  }
}

// 단계 목록. active보다 앞은 끝난 줄(체크), active는 지금 하는 줄(점 세 개),
// 뒤는 아직 차례가 안 온 흐린 줄이다.
export function renderRecommendSteps(steps, active) {
  var list = dom.recommendSteps;
  list.innerHTML = "";
  steps.forEach(function (text, i) {
    var li = document.createElement("li");
    li.className = "ra-step " + (i < active ? "is-done" : i === active ? "is-active" : "is-todo");
    var mark = document.createElement("span");
    mark.className = "ra-step-mark";
    mark.setAttribute("aria-hidden", "true");
    if (i < active) mark.textContent = "✓";
    li.appendChild(mark);
    var label = document.createElement("span");
    label.textContent = text;
    li.appendChild(label);
    list.appendChild(li);
  });
}

// 홈 "오늘의 한 줄". 카드·박스 없이 가운데 정렬로 한 문장씩: 작은 라벨 → 한줄평(제목 글꼴)
// → "책 제목 · 저자 ★별점". 후보 5개를 옆으로 넘겨 본다(손가락으로 밀거나 아래 점을 눌러서).
// 처음 보이는 문장은 접속할 때마다 무작위(state.featured.pickId) — 매번 같은 첫 문장만 읽히지
// 않게. 저절로 넘어가게 하지는 않았다: 읽는 도중에 넘어가면 답답하다.
// 문장을 누르면 그 책 상세로 간다. 관리자 모드에서 고정된 문장이면 "고정 해제"가 붙는다.
// 오늘의 한 줄 자동 넘김(2026-10-13). 한 문장이 머무는 시간은 길이에 맞춘다 — 2~3초는 한 줄을
// 다 읽기도 전에 넘어간다(한국어 한 줄 30자 + 책 제목 줄을 읽는 데 3초 남짓). 기본 3.5초에
// 글자당 0.06초를 더하고 4~6.5초 안에 둔다. 다시 그릴 때마다 앞 타이머는 버린다.
var featuredTimer = null;
var featuredObserver = null;
var FEATURED_BASE_MS = 3500;
var FEATURED_PER_CHAR_MS = 60;
var FEATURED_MIN_MS = 4000;
var FEATURED_MAX_MS = 6500;
// 한 문장이 옆으로 밀려나는 데 걸리는 시간(사용자 요청: 0.5~1초).
var FEATURED_SLIDE_MS = 800;

export function renderFeatured() {
  clearTimeout(featuredTimer);
  if (featuredObserver) { featuredObserver.disconnect(); featuredObserver = null; }
  var section = dom.featuredSection;
  var box = dom.featuredTrack;
  if (!section) return;
  var f = state.featured || {};
  var reviews = f.reviews || [];
  var start = 0;
  for (var i = 0; i < reviews.length; i++) if (reviews[i].id === f.pickId) start = i;
  box.innerHTML = "";
  section.hidden = reviews.length === 0;
  if (!reviews.length) return;

  renderHeroBookmarks(reviews);

  var track = document.createElement("div");
  track.className = "today-track";
  track.tabIndex = 0;
  track.setAttribute("aria-roledescription", "carousel");
  track.setAttribute("aria-label", "오늘의 한 줄 " + reviews.length + "개, 옆으로 넘겨 보세요");

  reviews.forEach(function (r, index) {
    var slide = document.createElement("div");
    slide.className = "today-slide";
    slide.setAttribute("aria-roledescription", "slide");
    slide.setAttribute("aria-label", (index + 1) + " / " + reviews.length);

    var link = document.createElement("a");
    link.className = "today-quote bookmark-card bm-" + bookmarkColorOf(r.id, r.color);
    link.href = "/book/" + encodeURIComponent(r.book_id);
    var line = document.createElement("span");
    line.className = "today-text";
    var tag = findMoodTag(r.mood);
    line.textContent = r.text ? "“" + r.text + "”" : (tag ? tag.emoji + " " + tag.label : "");
    link.appendChild(line);
    var meta = document.createElement("span");
    meta.className = "today-meta";
    meta.textContent = r.title + " · " + r.author + (r.rating ? "  ★" + r.rating : "");
    link.appendChild(meta);
    link.addEventListener("click", function (e) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      gtag("event", "click_featured_review", { comment_id: r.id, book_id: r.book_id, position: index + 1, source: r.pinned ? "pinned" : "auto" });
      openDetail(r.book_id);
    });
    slide.appendChild(link);

    if (isAdminMode() && r.pinned) {
      var unpin = document.createElement("button");
      unpin.type = "button";
      unpin.className = "featured-unpin";
      unpin.textContent = "고정 해제";
      unpin.addEventListener("click", function () { setFeaturedPin(r.id, false); });
      slide.appendChild(unpin);
    }
    track.appendChild(slide);
  });
  box.appendChild(track);

  // 점이 하나뿐이면 넘길 게 없으니 그리지 않는다.
  var dots = document.createElement("div");
  dots.className = "today-dots";
  dots.hidden = reviews.length < 2;
  var dotEls = reviews.map(function (r, index) {
    var d = document.createElement("button");
    d.type = "button";
    d.className = "today-dot";
    d.setAttribute("aria-label", (index + 1) + "번째 한 줄 보기");
    d.addEventListener("click", function () { goTo(index, true); });
    dots.appendChild(d);
    return d;
  });
  box.appendChild(dots);

  var current = -1;
  var swiped = {};
  function mark(index, byUser) {
    if (index === current) return;
    current = index;
    dotEls.forEach(function (d, i) {
      d.classList.toggle("is-active", i === index);
      d.setAttribute("aria-current", i === index ? "true" : "false");
    });
    // 다시 그려도(관리자 고정 등) 보던 문장에 머물게 기억해 둔다.
    state.featured.pickId = reviews[index].id;
    // 사람들이 실제로 넘겨 보는지 — 문장마다 한 번만 센다.
    if (byUser && !swiped[index]) {
      swiped[index] = true;
      gtag("event", "swipe_featured", { position: index + 1 });
    }
  }
  // 브라우저의 smooth 스크롤은 0.3초 남짓이라 문장이 "쉬리릭" 지나갔다. 0.8초 동안 천천히
  // 밀려나도록 직접 움직인다. 움직이는 동안은 scroll-snap을 꺼 둔다 — 켜 두면 프레임마다
  // 가까운 칸으로 다시 끌어당겨 덜컹거린다.
  var slideAnim = 0;
  function animateTo(left) {
    var from = track.scrollLeft;
    var dist = left - from;
    var run = ++slideAnim;
    if (!dist) return;
    var t0 = null;
    track.classList.add("is-sliding");
    function step(ts) {
      if (run !== slideAnim) return;
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / FEATURED_SLIDE_MS);
      // 천천히 출발해서 천천히 멈춘다(easeInOutCubic).
      var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      track.scrollLeft = from + dist * e;
      if (p < 1) requestAnimationFrame(step);
      else track.classList.remove("is-sliding");
    }
    requestAnimationFrame(step);
  }
  function goTo(index, smooth, byUser) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var left = index * track.clientWidth;
    if (smooth && !reduce) animateTo(left);
    else { slideAnim++; track.classList.remove("is-sliding"); track.scrollLeft = left; }
    mark(index, byUser === undefined ? smooth : byUser);
  }
  var userScrolling = false;
  track.addEventListener("pointerdown", function () { userScrolling = true; });
  track.addEventListener("touchstart", function () { userScrolling = true; }, { passive: true });
  track.addEventListener("wheel", function () { userScrolling = true; }, { passive: true });
  track.addEventListener("scroll", function () {
    if (!track.clientWidth) return;
    var index = Math.round(track.scrollLeft / track.clientWidth);
    mark(Math.max(0, Math.min(reviews.length - 1, index)), userScrolling);
  }, { passive: true });
  track.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(Math.min(reviews.length - 1, current + 1), true); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(Math.max(0, current - 1), true); }
  });

  // ── 자동 넘김 ──
  // 멈추는 때: 마우스를 올렸거나(PC) 손가락이 닿아 있거나 키보드 초점이 안에 있을 때, 칸이
  // 화면 밖이거나 탭이 가려졌을 때, 기기에서 "동작 줄이기"를 켰을 때(아예 돌지 않음). 사람이
  // 넘기면 그 문장부터 시간을 다시 잰다. 마지막 다음은 첫 문장으로 돌아간다.
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hovering = false;
  var touching = false;
  var focused = false;
  var visible = true;
  function dwell(index) {
    var r = reviews[index] || {};
    var len = String(r.text || "").length + String(r.title || "").length;
    return Math.max(FEATURED_MIN_MS, Math.min(FEATURED_MAX_MS, FEATURED_BASE_MS + len * FEATURED_PER_CHAR_MS));
  }
  function paused() {
    return hovering || touching || focused || !visible || document.hidden;
  }
  function schedule() {
    clearTimeout(featuredTimer);
    if (reviews.length < 2 || reduceMotion) return;
    featuredTimer = setTimeout(function () {
      if (!track.isConnected) return;
      if (paused()) { schedule(); return; }
      userScrolling = false;
      goTo((current + 1) % reviews.length, true, false);
      schedule();
    }, dwell(current));
  }
  track.addEventListener("mouseenter", function () { hovering = true; });
  track.addEventListener("mouseleave", function () { hovering = false; schedule(); });
  track.addEventListener("touchstart", function () {
    touching = true;
    // 넘어가는 도중에 손을 대면 그 자리에서 멈추고 사람에게 맡긴다.
    slideAnim++;
    track.classList.remove("is-sliding");
  }, { passive: true });
  track.addEventListener("touchend", function () { touching = false; schedule(); }, { passive: true });
  track.addEventListener("touchcancel", function () { touching = false; schedule(); }, { passive: true });
  box.addEventListener("focusin", function () { focused = true; });
  box.addEventListener("focusout", function () { focused = false; schedule(); });
  dotEls.forEach(function (d) { d.addEventListener("click", schedule); });
  if ("IntersectionObserver" in window) {
    featuredObserver = new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) schedule();
    }, { threshold: 0.5 });
    featuredObserver.observe(track);
  }

  // 처음 위치: 무작위로 고른 문장. 칸이 그려진 다음에야 폭을 알 수 있다.
  mark(start, false);
  requestAnimationFrame(function () { track.scrollLeft = start * track.clientWidth; });
  schedule();
}

// 관리자: 한줄평을 "오늘의 한 줄" 후보에 고정/해제(최대 5개, 서버가 막는다).
export function setFeaturedPin(commentId, pinned) {
  return api("/api/featured", {
    method: "POST",
    headers: { "X-Admin-Key": getAdminKey() },
    body: { commentId: commentId, pinned: pinned }
  })
    .then(function () { return refreshFeatured(); })
    .catch(function (e) { alert(e.message); });
}

// 제목 아래 "★ 4.8 · 평가 5 · 한 줄 3". 평가는 별점만 남긴 것까지, 한 줄은 문장·태그가 있는
// 것만 센다(functions/_lib/lines.js). 3명 이상 담았을 때만 "N명이 읽고 싶어해요"를 붙인다 —
// 1~2명은 오히려 "아무도 관심 없는 책"처럼 읽힌다.
function renderDetailStats(r) {
  var $meta = document.getElementById("detailRatingMeta");
  $meta.innerHTML = "";
  var rating = bookRating(r);
  if (rating) {
    var avg = document.createElement("span");
    avg.className = "rating-avg";
    avg.textContent = "★ " + rating.avg.toFixed(1);
    $meta.appendChild(avg);
    $meta.appendChild(document.createTextNode(" · 평가 " + rating.count));
  } else {
    $meta.appendChild(document.createTextNode("아직 평가가 없어요"));
  }
  $meta.appendChild(document.createTextNode(" · 책갈피 " + (r.commentCount || 0)));

  var $want = document.getElementById("detailWantCount");
  $want.hidden = !(state.wantCount >= 3);
  $want.textContent = state.wantCount >= 3 ? state.wantCount + "명이 읽고 싶어해요" : "";
}

// 이 책의 기록 요약 — 남긴 태그(많은 순 3개)와 별점 분포. 서버가 첫 HTML에 같은 문장을
// 미리 채워 두고(functions/book/[id].js) 여기서 이어받는다. 한줄평 목록을 아직 못 받았으면
// 서버가 채운 것을 그대로 둔다.
function renderDetailSummary() {
  var $box = document.getElementById("detailSummary");
  if (!state.ratingDist) return;
  var moods = {};
  state.comments.forEach(function (c) { if (!c.parentId && c.mood) moods[c.mood] = (moods[c.mood] || 0) + 1; });
  var tags = tagsText(topTags(moods));
  $box.innerHTML = "";
  if (tags) {
    var p = document.createElement("p");
    p.className = "ds-row";
    var label = document.createElement("span");
    label.className = "ds-label";
    label.textContent = "남긴 태그";
    var value = document.createElement("span");
    value.className = "ds-value";
    value.textContent = tags;
    p.appendChild(label);
    p.appendChild(value);
    $box.appendChild(p);
  }
  // 별점 분포는 가로 막대(리디자인 B안). 문장(distText)은 서버가 첫 HTML에 쓰고, 화면은 막대로
  // 이어받는다 — 그래서 평가 2개 이상이라는 기준은 문장과 같다(distText가 빈 값이면 안 그림).
  if (distText(state.ratingDist)) {
    var dist = state.ratingDist;
    var max = Math.max.apply(null, dist) || 1;
    var head = document.createElement("p");
    head.className = "ds-dist-title";
    head.textContent = "별점 분포";
    $box.appendChild(head);
    var grid = document.createElement("div");
    grid.className = "ds-dist";
    for (var star = 5; star >= 1; star--) {
      var n = dist[star - 1] || 0;
      var lab = document.createElement("span");
      lab.textContent = "★" + star;
      var bar = document.createElement("span");
      bar.className = "ds-bar";
      var fill = document.createElement("span");
      fill.className = "ds-bar-fill";
      fill.style.width = Math.round((n / max) * 100) + "%";
      bar.appendChild(fill);
      var num = document.createElement("span");
      num.textContent = n + "명";
      grid.appendChild(lab);
      grid.appendChild(bar);
      grid.appendChild(num);
    }
    grid.setAttribute("aria-label", "별점 분포: " + distText(dist));
    $box.appendChild(grid);
  }
  $box.hidden = !$box.children.length;
}

// 별점 카드. 이 기기로 평가한 책이면 "내 평가" + 채운 별, 아니면 안내 문구 + 빈 별.
// 누르면 js/main.js rateBook이 바로 저장하고 시트를 연다.
export function renderRateCard() {
  var mine = state.my && state.my.rating ? state.my.rating : 0;
  var $label = document.getElementById("rateLabel");
  $label.textContent = mine ? "내 평가" : "어떠셨나요? 별을 누르면 책갈피를 꽂을 수 있어요";
  $label.classList.toggle("is-mine", !!mine);

  var $stars = document.getElementById("rateStars");
  var popUpTo = state.ratePop || 0;
  state.ratePop = 0;
  $stars.innerHTML = "";
  for (var i = 1; i <= 5; i++) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = (i <= mine ? "is-on" : "") + (i <= popUpTo ? " is-pop" : "");
    if (i <= popUpTo) btn.style.animationDelay = "0s";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", i === mine ? "true" : "false");
    btn.setAttribute("aria-label", i + "점");
    // 빈 별도 속이 찬 연한 베이지라 .star-icon(테두리만 있는 별)이 아니라 따로 칠한다.
    btn.appendChild(buildIcon("star", "rate-star"));
    // 하나씩 차오르는 느낌 — 앞 별부터 조금씩 늦게 튄다.
    if (i <= popUpTo) btn.querySelector(".icon").style.animationDelay = (i - 1) * 0.04 + "s";
    btn.addEventListener("click", function (idx) {
      return function () { rateBook(idx); };
    }(i));
    $stars.appendChild(btn);
  }

  // 이미 평가한 책(별점만 남긴 것 포함)은 읽은 책이라 "읽고 싶어요"를 숨긴다.
  var $want = document.getElementById("wantBtn");
  $want.hidden = !!mine;
  $want.classList.toggle("is-on", !!state.wanted);
  $want.setAttribute("aria-pressed", state.wanted ? "true" : "false");
  document.getElementById("wantLabel").textContent = state.wanted ? "읽고 싶은 책에 담김" : "읽고 싶어요";
}

export function renderDetail() {
  var r = findBook(state.currentId);
  if (!r) {
    // 책 목록이 아직 안 불러와졌으면(예: /book/:id 직접 접속 직후) 아직 못 찾은 것뿐이니
    // 목록 로딩이 끝난 뒤 다시 렌더링될 때까지 기다린다. 로딩이 끝났는데도 없으면 삭제된
    // 책이거나 잘못된 링크인 것이므로 그때만 목록으로 돌려보낸다.
    if (state.booksLoaded) showView("library");
    return;
  }

  document.getElementById("detailTitle").textContent = r.title;
  // "저자 · 분류". 출판사는 아직 DB에 저장하지 않아서(카카오 결과에는 있음) 빠져 있다.
  var genre = genreOfBook(r);
  document.getElementById("detailAuthor").textContent = r.author + (genre && genre !== "기타" ? " · " + genre : "");
  renderDetailStats(r);
  renderDetailBom();
  // "내 책갈피 저장"은 이 기기의 평가나 지금 닉네임으로 이 책에 본문 있는 한 줄을 꽂았을 때만.
  var myLine = shareLineFor(state.currentId);
  document.getElementById("detailShareBtn").hidden = !myLine;
  if (myLine) warmShareFonts(r.title + (myLine.name || "") + myLine.text);

  var $detailCover = document.getElementById("detailCover");
  $detailCover.innerHTML = "";
  $detailCover.style.setProperty("--cover", coverFor(r.title));
  // 목록 카드와 같은 규칙: 표지가 없으면 제목을 조판한 책등으로 보여준다.
  $detailCover.dataset.title = r.title;
  $detailCover.classList.toggle("detail-cover--typo", !r.cover);
  if (r.cover) {
    var coverImg = document.createElement("img");
    coverImg.src = upscaleCover(r.cover);
    coverImg.alt = r.title + " 표지";
    $detailCover.appendChild(coverImg);
  }
  // 표지 위로 튀어나온 책갈피 탭(리디자인 B안) — 홈 카드와 같은 규칙.
  for (var t = 0; t < Math.min(r.commentCount || 0, 4); t++) {
    var tab = document.createElement("span");
    tab.className = "bm-tab bm-tab--" + (t + 1) + " bm-" + BOOKMARK_COLORS[t];
    tab.setAttribute("aria-hidden", "true");
    $detailCover.appendChild(tab);
  }

  // 상세 페이지에 처음 진입한 순간에만(카드 클릭/딥링크 등) 표지 펼침 연출을 재생한다.
  // 8초 폴링으로 renderDetail이 다시 불릴 때는 이 플래그가 꺼져 있어 재생되지 않는다.
  if (state.detailCoverAnimatePending) {
    state.detailCoverAnimatePending = false;
    var $detailHeaderInfo = document.getElementById("detailHeaderInfo");
    $detailCover.classList.remove("cover-in");
    $detailHeaderInfo.classList.remove("info-in");
    void $detailCover.offsetWidth;
    $detailCover.classList.add("cover-in");
    $detailHeaderInfo.classList.add("info-in");
  }


  document.getElementById("deleteBtn").hidden = !isAdminMode();
  document.getElementById("bomSetBtn").hidden = !isAdminMode();
  document.getElementById("adminZone").hidden = !isAdminMode();
  renderAlsoBooks();
  renderRateCard();
  renderDetailSummary();

  var $list = document.getElementById("commentList");
  // $list.innerHTML을 비우면 그 안에 포커스가 있던 답글 입력창은 (removal로 인해) blur된다.
  // 그 blur는 "사용자가 답글창을 떠났다"는 신호가 아니라 재렌더링의 부작용일 뿐이므로,
  // 지우기 전에 지금 포커스가 어느 댓글의 답글창에 있었는지 미리 스냅샷해 재렌더링 후 복원한다.
  var focusedReplyId = null;
  var focusedEditId = null;
  var $activeEl = document.activeElement;
  if ($activeEl && $activeEl.classList) {
    if ($activeEl.classList.contains("c-reply-text-input")) {
      focusedReplyId = $activeEl.dataset.replyFor || null;
    } else if ($activeEl.classList.contains("c-edit-text-input")) {
      focusedEditId = $activeEl.dataset.editFor || null;
    }
  }
  $list.innerHTML = "";

  var topLevel = state.comments.filter(function (c) { return !c.parentId; });
  var repliesByParent = {};
  state.comments.forEach(function (c) {
    if (!c.parentId) return;
    if (!repliesByParent[c.parentId]) repliesByParent[c.parentId] = [];
    repliesByParent[c.parentId].push(c);
  });
  Object.keys(repliesByParent).forEach(function (pid) {
    repliesByParent[pid].sort(function (a, b) { return a.createdAt - b.createdAt; });
  });

  document.getElementById("commentCount").textContent = String(topLevel.length);

  if (topLevel.length === 0) {
    var li = document.createElement("li");
    li.style.color = "var(--ink-faint)";
    li.style.fontSize = "0.88rem";
    li.textContent = "첫 책갈피를 꽂아주세요";
    $list.appendChild(li);
  } else {
    var sortedComments = topLevel.slice().sort(function (a, b) { return b.likes - a.likes; });

    sortedComments.forEach(function (c) {
      var item = document.createElement("li");
      var bm = bookmarkColorOf(c.id, c.color);
      item.className = "bookmark-card bm-" + bm;
      var moodBadge = buildMoodBadge(c.mood);
      var textSpan = document.createElement("span");
      textSpan.className = "c-text";
      textSpan.textContent = c.text;
      textSpan.title = c.text;

      var authorSpan = buildAuthorChip(c.authorName, c.authorScore, "c-author", bm);

      var ratingSpan = document.createElement("span");
      ratingSpan.className = "c-rating";
      if (typeof c.rating === "number") {
        for (var i = 1; i <= 5; i++) ratingSpan.appendChild(buildStarIcon(i <= c.rating));
      }

      var likeBtn = document.createElement("button");
      likeBtn.type = "button";
      likeBtn.className = "c-like" + (c.likedByMe ? " liked" : "");
      likeBtn.appendChild(buildIcon("heart", "like-icon"));
      likeBtn.appendChild(document.createTextNode(String(c.likes)));
      likeBtn.setAttribute("aria-pressed", c.likedByMe ? "true" : "false");
      likeBtn.setAttribute("aria-label", "좋아요 " + c.likes + "개");
      likeBtn.addEventListener("click", function () {
        gtag("event", "click_like");
        if (!myUid()) return;
        api("/api/comments/" + c.id + "/like", { method: "POST" })
          .then(function () { refreshComments(); })
          .catch(function (e) { alert(e.message); });
      });

      var dateSpan = document.createElement("span");
      dateSpan.className = "c-date";
      dateSpan.textContent = formatDate(c.createdAt);

      // 태그는 본문 앞에 온다. 본문 없이 태그만 남긴 한줄평이면 이 배지가 곧 내용이다.
      if (moodBadge) item.appendChild(moodBadge);
      item.appendChild(textSpan);
      item.appendChild(authorSpan);
      item.appendChild(ratingSpan);
      item.appendChild(likeBtn);
      item.appendChild(dateSpan);

      // 수정 중이면 원래 본문/별점 자리를 감추고 아래 수정 폼을 대신 보여준다. 수정
      // 여부는 state.openEdits에 키가 있는지로 판단하므로, 폴링으로 목록이 다시 그려져도
      // 수정 모드와 입력 중이던 내용이 그대로 유지된다.
      var editDraft = Object.prototype.hasOwnProperty.call(state.openEdits, c.id)
        ? state.openEdits[c.id]
        : null;
      // 태그만 고르고 본문 없이 남긴 한줄평은 c-text가 빈 칸이다. 모바일에서 이 칸이
      // flex-basis: 100%로 한 줄을 통째로 차지하므로, 비어 있으면 아예 감춘다.
      textSpan.hidden = !!editDraft || !c.text;
      ratingSpan.hidden = !!editDraft;

      var editForm = null;
      var editTextInput = null;
      if (c.mine) {
        editForm = document.createElement("div");
        editForm.className = "c-edit-form";
        editForm.hidden = !editDraft;

        var editStars = document.createElement("div");
        editStars.className = "star-picker c-edit-stars";
        editForm.appendChild(editStars);

        editTextInput = document.createElement("input");
        editTextInput.type = "text";
        editTextInput.className = "c-edit-text-input";
        editTextInput.maxLength = 60;
        editTextInput.dataset.editFor = String(c.id);
        editTextInput.value = editDraft ? editDraft.text : c.text;
        editForm.appendChild(editTextInput);

        var editSaveBtn = document.createElement("button");
        editSaveBtn.type = "button";
        editSaveBtn.className = "c-edit-save";
        editSaveBtn.textContent = "저장";
        editForm.appendChild(editSaveBtn);

        var editCancelBtn = document.createElement("button");
        editCancelBtn.type = "button";
        editCancelBtn.className = "c-edit-cancel";
        editCancelBtn.textContent = "취소";
        editForm.appendChild(editCancelBtn);

        // 별점 위젯은 고를 때마다 다시 그려야 채워진 개수가 바뀐다. 고른 값은 초안에
        // 바로 적어둬서 폴링 재렌더링에도 살아남게 한다.
        var paintEditStars = function () {
          var draft = state.openEdits[c.id];
          renderStars(editStars, draft ? draft.rating : c.rating, true, function (n) {
            if (state.openEdits[c.id]) state.openEdits[c.id].rating = n;
            paintEditStars();
          });
        };
        paintEditStars();

        editTextInput.addEventListener("input", function () {
          if (state.openEdits[c.id]) state.openEdits[c.id].text = editTextInput.value;
        });

        var closeEdit = function () {
          delete state.openEdits[c.id];
          editForm.hidden = true;
          textSpan.hidden = false;
          ratingSpan.hidden = false;
        };

        editCancelBtn.addEventListener("click", closeEdit);

        editSaveBtn.addEventListener("click", function () {
          var draft = state.openEdits[c.id];
          var newText = editTextInput.value.trim().slice(0, 60);
          if (!newText) { alert("내용을 입력해주세요."); return; }
          api("/api/comments/" + c.id, {
            method: "PATCH",
            body: { text: newText, rating: draft ? draft.rating : c.rating }
          })
            .then(function () {
              gtag("event", "edit_comment");
              delete state.openEdits[c.id];
              // 별점을 바꿨으면 책의 평균도 달라지므로 목록까지 같이 새로고침한다.
              return Promise.all([refreshBooks(), refreshComments()]);
            })
            .catch(function (e) { alert(e.message); });
        });

        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "c-edit";
        editBtn.appendChild(buildIcon("pencil"));
        editBtn.setAttribute("aria-label", "댓글 수정");
        editBtn.addEventListener("click", function () {
          if (state.openEdits[c.id]) { closeEdit(); return; }
          state.openEdits[c.id] = { text: c.text, rating: c.rating };
          editTextInput.value = c.text;
          paintEditStars();
          editForm.hidden = false;
          textSpan.hidden = true;
          ratingSpan.hidden = true;
          editTextInput.focus();
        });
        item.appendChild(editBtn);
      }

      // 내 댓글인지는 서버가 판단해서 mine으로 내려준다(예전엔 uid를 받아와 직접
      // 비교했는데, 그러려면 모든 사람의 uid가 공개돼야 했다).
      if (c.mine || isAdminMode()) {
        var delBtn = document.createElement("button");
        delBtn.className = "c-del";
        delBtn.type = "button";
        delBtn.appendChild(buildIcon("trash"));
        delBtn.setAttribute("aria-label", "댓글 삭제");
        delBtn.addEventListener("click", function () {
          api("/api/comments/" + c.id, { method: "DELETE", headers: { "X-Admin-Key": getAdminKey() } })
            .then(function () { return Promise.all([refreshBooks(), refreshComments()]); })
            .catch(function (e) { alert(e.message); });
        });
        item.appendChild(delBtn);
      }

      // 관리자: 이 한줄평을 홈 "오늘의 한 줄" 후보에 고정/해제(최대 5개, 서버가 막는다).
      if (isAdminMode()) {
        var isPinned = (state.featured.pinnedIds || []).indexOf(c.id) !== -1;
        var pinBtn = document.createElement("button");
        pinBtn.type = "button";
        pinBtn.className = "c-pin" + (isPinned ? " is-pinned" : "");
        pinBtn.textContent = isPinned ? "오늘의 한 줄 고정 해제" : "오늘의 한 줄로 고정";
        pinBtn.addEventListener("click", function () { setFeaturedPin(c.id, !isPinned); });
        item.appendChild(pinBtn);
      }

      var replyBtn = document.createElement("button");
      replyBtn.type = "button";
      replyBtn.className = "c-reply-btn";
      replyBtn.appendChild(buildIcon("reply", "reply-icon"));
      replyBtn.appendChild(document.createTextNode("답글"));
      item.appendChild(replyBtn);

      var repliesList = document.createElement("ul");
      repliesList.className = "c-replies";
      (repliesByParent[c.id] || []).forEach(function (r) {
        var rItem = document.createElement("li");

        var rAuthor = buildAuthorChip(r.authorName, r.authorScore, "c-reply-author", bookmarkColorOf(r.id, r.color));

        var rText = document.createElement("span");
        rText.className = "c-reply-text";
        rText.textContent = r.text;
        rText.title = r.text;

        var rLikeBtn = document.createElement("button");
        rLikeBtn.type = "button";
        rLikeBtn.className = "c-reply-like" + (r.likedByMe ? " liked" : "");
        rLikeBtn.appendChild(buildIcon("heart", "like-icon"));
        rLikeBtn.appendChild(document.createTextNode(String(r.likes)));
        rLikeBtn.setAttribute("aria-pressed", r.likedByMe ? "true" : "false");
        rLikeBtn.setAttribute("aria-label", "좋아요 " + r.likes + "개");
        rLikeBtn.addEventListener("click", function () {
          gtag("event", "click_like");
          if (!myUid()) return;
          api("/api/comments/" + r.id + "/like", { method: "POST" })
            .then(function () { refreshComments(); })
            .catch(function (e) { alert(e.message); });
        });

        // 원댓글 줄은 좋아요 다음에 "답글" 버튼이 오지만 답글 줄에는 그게 없다. 좋아요
        // 버튼끼리 세로로 줄이 맞도록, 보이지 않지만 같은 너비를 차지하는 자리표시자를
        // 같은 위치에 넣어 뒤따르는 요소(날짜/삭제)의 폭을 원댓글과 맞춘다.
        var rReplyBtnSpacer = document.createElement("span");
        rReplyBtnSpacer.className = "c-reply-btn-spacer";
        rReplyBtnSpacer.textContent = "답글";
        rReplyBtnSpacer.setAttribute("aria-hidden", "true");

        var rDate = document.createElement("span");
        rDate.className = "c-reply-date";
        rDate.textContent = formatDate(r.createdAt);

        rItem.appendChild(rAuthor);
        rItem.appendChild(rText);
        rItem.appendChild(rLikeBtn);
        rItem.appendChild(rReplyBtnSpacer);
        rItem.appendChild(rDate);

        // 답글 수정. 원댓글과 같은 방식이지만 답글에는 별점이 없어 본문만 고친다.
        var rEditDraft = Object.prototype.hasOwnProperty.call(state.openEdits, r.id)
          ? state.openEdits[r.id]
          : null;
        rText.hidden = !!rEditDraft;

        var rEditForm = null;
        var rEditInput = null;
        if (r.mine) {
          rEditForm = document.createElement("div");
          rEditForm.className = "c-edit-form c-reply-edit-form";
          rEditForm.hidden = !rEditDraft;

          rEditInput = document.createElement("input");
          rEditInput.type = "text";
          rEditInput.className = "c-edit-text-input";
          rEditInput.maxLength = 60;
          rEditInput.dataset.editFor = String(r.id);
          rEditInput.value = rEditDraft ? rEditDraft.text : r.text;
          rEditForm.appendChild(rEditInput);

          var rEditSave = document.createElement("button");
          rEditSave.type = "button";
          rEditSave.className = "c-edit-save";
          rEditSave.textContent = "저장";
          rEditForm.appendChild(rEditSave);

          var rEditCancel = document.createElement("button");
          rEditCancel.type = "button";
          rEditCancel.className = "c-edit-cancel";
          rEditCancel.textContent = "취소";
          rEditForm.appendChild(rEditCancel);

          rEditInput.addEventListener("input", function () {
            if (state.openEdits[r.id]) state.openEdits[r.id].text = rEditInput.value;
          });

          var closeReplyEdit = function () {
            delete state.openEdits[r.id];
            rEditForm.hidden = true;
            rText.hidden = false;
          };

          rEditCancel.addEventListener("click", closeReplyEdit);

          rEditSave.addEventListener("click", function () {
            var newText = rEditInput.value.trim().slice(0, 60);
            if (!newText) { alert("내용을 입력해주세요."); return; }
            api("/api/comments/" + r.id, { method: "PATCH", body: { text: newText } })
              .then(function () {
                gtag("event", "edit_comment");
                delete state.openEdits[r.id];
                refreshComments();
              })
              .catch(function (e) { alert(e.message); });
          });

          var rEditBtn = document.createElement("button");
          rEditBtn.type = "button";
          rEditBtn.className = "c-reply-edit";
          rEditBtn.appendChild(buildIcon("pencil"));
          rEditBtn.setAttribute("aria-label", "답글 수정");
          rEditBtn.addEventListener("click", function () {
            if (state.openEdits[r.id]) { closeReplyEdit(); return; }
            state.openEdits[r.id] = { text: r.text, rating: 0 };
            rEditInput.value = r.text;
            rEditForm.hidden = false;
            rText.hidden = true;
            rEditInput.focus();
          });
          rItem.appendChild(rEditBtn);
        }

        if (r.mine || isAdminMode()) {
          var rDelBtn = document.createElement("button");
          rDelBtn.type = "button";
          rDelBtn.className = "c-reply-del";
          rDelBtn.appendChild(buildIcon("trash"));
          rDelBtn.setAttribute("aria-label", "답글 삭제");
          rDelBtn.addEventListener("click", function () {
            api("/api/comments/" + r.id, { method: "DELETE", headers: { "X-Admin-Key": getAdminKey() } })
              .then(function () { refreshComments(); })
              .catch(function (e) { alert(e.message); });
          });
          rItem.appendChild(rDelBtn);
        }

        if (rEditForm) rItem.appendChild(rEditForm);
        repliesList.appendChild(rItem);

        if (rEditDraft && rEditInput && focusedEditId === String(r.id)) {
          rEditInput.focus();
          var rCaret = rEditInput.value.length;
          rEditInput.setSelectionRange(rCaret, rCaret);
        }
      });
      if (repliesList.children.length) item.appendChild(repliesList);

      var replyForm = document.createElement("div");
      replyForm.className = "c-reply-form";
      var hasOpenDraft = Object.prototype.hasOwnProperty.call(state.openReplies, c.id);
      replyForm.hidden = !hasOpenDraft;

      var replyNameInput = null;
      if (AUTH_MODE === "nickname") {
        replyNameInput = document.createElement("input");
        replyNameInput.type = "text";
        replyNameInput.className = "c-reply-name";
        replyNameInput.placeholder = "닉네임";
        replyNameInput.maxLength = 10;
        // 치던 값이 있으면 그것부터 쓴다. 저장된 닉네임으로 무조건 덮어쓰면, 8초 폴링이
        // 목록을 다시 그릴 때마다 치던 글자가 사라진다 — 닉네임을 저장한 적 없는 사람은
        // 아예 입력을 끝낼 수가 없었다(한줄평의 openReplies와 같은 이유, 같은 방식).
        replyNameInput.value = Object.prototype.hasOwnProperty.call(state.openReplyNames, c.id)
          ? state.openReplyNames[c.id]
          : getSavedNickname();
        replyNameInput.addEventListener("input", function () {
          state.openReplyNames[c.id] = replyNameInput.value;
        });
        replyForm.appendChild(replyNameInput);
      }

      var replyTextInput = document.createElement("input");
      replyTextInput.type = "text";
      replyTextInput.className = "c-reply-text-input";
      replyTextInput.placeholder = "답글을 남겨보세요";
      replyTextInput.maxLength = 60;
      replyTextInput.dataset.replyFor = String(c.id);
      if (hasOpenDraft) replyTextInput.value = state.openReplies[c.id];
      replyForm.appendChild(replyTextInput);

      var replySubmitBtn = document.createElement("button");
      replySubmitBtn.type = "button";
      replySubmitBtn.textContent = "등록";
      replyForm.appendChild(replySubmitBtn);

      replyTextInput.addEventListener("input", function () {
        state.openReplies[c.id] = replyTextInput.value;
      });

      replyBtn.addEventListener("click", function () {
        replyForm.hidden = !replyForm.hidden;
        if (replyForm.hidden) {
          delete state.openReplies[c.id];
          delete state.openReplyNames[c.id];
        } else {
          state.openReplies[c.id] = replyTextInput.value;
          replyTextInput.focus();
        }
      });

      replySubmitBtn.addEventListener("click", function () {
        if (AUTH_MODE !== "nickname" && !state.currentUser) { alert("로그인 후 등록할 수 있어요."); return; }

        var name = "";
        if (AUTH_MODE === "nickname") {
          name = replyNameInput.value.trim().slice(0, 10);
          if (!name) { alert("닉네임을 입력해주세요."); return; }
        }

        var text = replyTextInput.value.trim().slice(0, 60);
        if (!text) return;

        var bookId = state.currentId;
        withNickname(name, function (canon) {
          if (AUTH_MODE === "nickname") saveNickname(canon);
          return api("/api/books/" + bookId + "/comments", { method: "POST", body: { text: text, parentId: c.id, name: canon } });
        })
          .then(function () {
            gtag("event", "post_reply");
            replyTextInput.value = "";
            replyForm.hidden = true;
            delete state.openReplies[c.id];
            delete state.openReplyNames[c.id];
            refreshComments();
            refreshMyScore();
          })
          .catch(function (e) { if (!e.cancelled) alert(e.message); });
      });

      if (editForm) item.appendChild(editForm);
      item.appendChild(replyForm);
      $list.appendChild(item);

      if (hasOpenDraft && focusedReplyId === String(c.id)) {
        replyTextInput.focus();
        var caret = replyTextInput.value.length;
        replyTextInput.setSelectionRange(caret, caret);
      }
      if (editDraft && editTextInput && focusedEditId === String(c.id)) {
        editTextInput.focus();
        var editCaret = editTextInput.value.length;
        editTextInput.setSelectionRange(editCaret, editCaret);
      }
    });
  }
}

export function renderRandomCard(b) {
  dom.randomCardCover.innerHTML = "";
  dom.randomCardCover.style.setProperty("--cover", coverFor(b.title));
  if (b.cover) {
    var img = document.createElement("img");
    img.src = upscaleCover(b.cover);
    img.alt = b.title + " 표지";
    dom.randomCardCover.appendChild(img);
  }
}

// 알림: 내가 등록한 책에 남이 새로 남긴 리뷰/답글 + 내 리뷰(또는 답글)에 남이 새로 남긴
// 답글·좋아요. api.js의 refreshNotifications가 state.notifications를 채우고 이 함수를
// 부르면, 배지 점과(열려 있다면) 드롭다운 목록을 함께 갱신한다.
export function renderNotifBadge() {
  var $badge = document.getElementById("notifBadge");
  if ($badge) $badge.hidden = state.notifications.length === 0;
  renderNotifDropdown();
}

export function renderNotifDropdown() {
  var $list = document.getElementById("notifList");
  var $empty = document.getElementById("notifEmpty");
  if (!$list || !$empty) return;

  $list.innerHTML = "";
  $empty.hidden = state.notifications.length > 0;

  state.notifications.forEach(function (n) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notif-item";
    btn.textContent = n.text;
    btn.addEventListener("click", function () {
      markNotificationRead(n.key, n.metric);
      closeNotifDropdown();
      openDetail(n.bookId);
    });
    li.appendChild(btn);
    $list.appendChild(li);
  });
}

function markNotificationRead(key, metric) {
  var seen = getNotifSeenMap();
  seen[key] = metric;
  saveNotifSeenMap(seen);
  state.notifications = state.notifications.filter(function (n) { return n.key !== key; });
  renderNotifBadge();
}

export function openNotifDropdown() {
  var $dd = document.getElementById("notifDropdown");
  var $btn = document.getElementById("notifBtn");
  if (!$dd) return;
  renderNotifDropdown();
  $dd.hidden = false;
  if ($btn) $btn.setAttribute("aria-expanded", "true");
}

export function closeNotifDropdown() {
  var $dd = document.getElementById("notifDropdown");
  var $btn = document.getElementById("notifBtn");
  if (!$dd) return;
  $dd.hidden = true;
  if ($btn) $btn.setAttribute("aria-expanded", "false");
}

export function toggleNotifDropdown() {
  var $dd = document.getElementById("notifDropdown");
  if (!$dd) return;
  if ($dd.hidden) openNotifDropdown(); else closeNotifDropdown();
}

// 관리자 닉네임 관리 화면의 한 줄(js/main.js openAdminNicknames). onAction(action, name).
export function formatAdminNickRow(r, onAction) {
  var row = document.createElement("div");
  row.className = "admin-nick-row";

  var name = document.createElement("span");
  name.className = "admin-nick-name";
  name.textContent = r.name;
  row.appendChild(name);

  var badge = document.createElement("span");
  badge.className = "admin-nick-badge" + (r.locked ? " is-locked" : r.status === "owned" ? " is-owned" : "");
  badge.textContent = r.locked ? "잠김" : r.status === "owned" ? "PIN 있음" : "보호됨";
  row.appendChild(badge);

  var meta = document.createElement("p");
  meta.className = "admin-nick-meta";
  var parts = ["글 " + r.posts, "마지막 " + (r.lastAt ? formatDate(r.lastAt) : "-")];
  if (r.status === "owned") parts.push("들어온 기기 " + r.devices);
  if (r.failed) parts.push("틀림 " + r.failed);
  if (r.locked) parts.push("잠금 해제 " + new Date(r.lockedUntil).toLocaleString("ko-KR"));
  meta.textContent = parts.join(" · ");
  row.appendChild(meta);

  var actions = document.createElement("div");
  actions.className = "admin-nick-actions";
  [
    ["set_pin", r.status === "owned" ? "PIN 다시 설정" : "PIN 설정", true],
    ["reset_pin", "PIN 초기화", r.status === "owned"],
    ["unlock", "잠금 풀기", r.locked || r.failed > 0],
    ["release", "보호 해제", true]
  ].forEach(function (a) {
    if (!a[2]) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = a[1];
    btn.addEventListener("click", function () { onAction(a[0], r.name); });
    actions.appendChild(btn);
  });
  row.appendChild(actions);
  return row;
}

// ── 홈 첫 화면 책갈피 세 장 ─────────────────────────────────────────────────────
//
// 오늘의 한 줄 후보(functions/api/featured.js)에서 본문이 있는 것 셋을 세로 책갈피로
// 부채꼴처럼 놓는다(리디자인 B안). 색은 자리마다 코발트·토마토·민트로 고정 — 시안의
// 구성 그대로다. 셋이 안 되면 장식째 숨긴다(한두 장만 덩그러니 있으면 어색하다).
var HERO_COLORS = ["cobalt", "tomato", "mint"];
function renderHeroBookmarks(reviews) {
  var box = document.getElementById("heroBookmarks");
  if (!box) return;
  var picks = (reviews || []).filter(function (r) { return String(r.text || "").trim(); }).slice(0, 3);
  box.innerHTML = "";
  box.hidden = picks.length < 3;
  if (box.hidden) return;
  picks.forEach(function (r, i) {
    var bm = document.createElement("div");
    bm.className = "hero-bm hero-bm-" + (i + 1) + " bm-" + HERO_COLORS[i];
    var text = document.createElement("div");
    text.className = "hero-bm-text";
    text.textContent = "“" + r.text + "”";
    bm.appendChild(text);
    var book = document.createElement("div");
    book.className = "hero-bm-book";
    book.textContent = r.title;
    bm.appendChild(book);
    box.appendChild(bm);
  });
}

// ── 이달의 책 ──────────────────────────────────────────────────────────────────

function bomCoverInto(el, item) {
  el.innerHTML = "";
  el.style.setProperty("--cover", coverFor(item.title));
  if (item.cover) {
    var img = document.createElement("img");
    img.src = upscaleCover(item.cover);
    img.alt = item.title + " 표지";
    img.loading = "lazy";
    el.appendChild(img);
  } else {
    var t = document.createElement("span");
    t.className = "bom-cover-typo";
    t.textContent = item.title;
    el.appendChild(t);
  }
}

function talkersText(n) {
  return "지금까지 " + n + "명이 이야기했어요";
}

// 홈 카드. 이야기한 사람이 3명 미만이면 숫자를 숨긴다(1·2명은 오히려 썰렁해 보인다).
var bomViewSent = null;
export function renderBookOfMonth() {
  var card = document.getElementById("bomCard");
  var b = state.bom;
  var live = !!(b && Date.now() < b.endsAt);
  card.hidden = !live;
  // 이달의 책이 없을 때도 지난 것이 있으면 홈 아래 작은 링크로.
  document.getElementById("bomPastFooter").hidden = live || !state.bomHasPast;
  document.getElementById("bomPastSep").hidden = live || !state.bomHasPast;
  if (!live) return;

  document.getElementById("bomLabel").textContent = b.label;
  var $bomCover = document.getElementById("bomCover");
  bomCoverInto($bomCover, b);
  // 표지 위 책갈피 탭 두 장(리디자인 B안).
  ["tomato", "butter"].forEach(function (c, i) {
    var tab = document.createElement("span");
    tab.className = "bm-tab bm-tab--" + (i + 1) + " bm-" + c;
    tab.setAttribute("aria-hidden", "true");
    $bomCover.appendChild(tab);
  });
  document.getElementById("bomTitle").textContent = b.title;
  // "저자 · 책갈피 N장" — N은 이 책의 한 줄 수(책장 목록이 아직 없으면 저자만).
  var bomBook = findBook(b.bookId);
  document.getElementById("bomAuthor").textContent = b.author +
    (bomBook && bomBook.commentCount ? " · 책갈피 " + bomBook.commentCount + "장" : "");
  document.getElementById("bomQuestion").textContent = b.question;
  var $talkers = document.getElementById("bomTalkers");
  $talkers.hidden = b.talkers < 3;
  $talkers.textContent = talkersText(b.talkers);

  var $lines = document.getElementById("bomLines");
  $lines.innerHTML = "";
  (b.lines || []).forEach(function (l) {
    var li = document.createElement("li");
    var text = document.createElement("span");
    text.className = "bom-line-text";
    var tag = findMoodTag(l.mood);
    text.textContent = l.text ? "“" + l.text + "”" : (tag ? tag.label : "");
    li.appendChild(text);
    var who = document.createElement("span");
    who.className = "bom-line-who";
    who.textContent = (l.name || "익명") + " · ★" + l.rating;
    li.appendChild(who);
    $lines.appendChild(li);
  });
  document.getElementById("bomPastLink").hidden = !state.bomHasPast;

  if (bomViewSent !== b.id && state.view === "library") {
    bomViewSent = b.id;
    gtag("event", "view_book_of_month", { book_id: b.bookId });
  }
}

// 책 상세 맨 위 질문.
export function renderDetailBom() {
  var box = document.getElementById("detailBom");
  var on = isBomBook(state.currentId);
  box.hidden = !on;
  if (!on) return;
  document.getElementById("detailBomLabel").textContent = state.bom.label + " · 이번 달 질문";
  document.getElementById("detailBomQuestion").textContent = state.bom.question;
}

// 지난 이달의 책 목록. 관리자 모드면 지금·앞으로의 것도 같이 오고 "지우기"가 붙는다.
export function renderBomPast() {
  var $sub = document.getElementById("bomPastSub");
  var $list = document.getElementById("bomPastList");
  $list.innerHTML = "";
  var items = state.bomPast;
  if (!items) { $sub.textContent = "불러오는 중..."; return; }
  var admin = isAdminMode();
  $sub.textContent = items.length
    ? (admin ? "관리자 보기 · 지금·앞으로의 것까지 " : "") + items.length + "권"
    : "아직 지난 이달의 책이 없어요.";
  var now = Date.now();
  items.forEach(function (item) {
    var row = document.createElement("div");
    row.className = "bom-past-item";
    var cover = document.createElement("span");
    cover.className = "bom-cover";
    bomCoverInto(cover, item);
    row.appendChild(cover);

    var body = document.createElement("div");
    body.className = "bom-past-body";
    var label = document.createElement("p");
    label.className = "bom-label";
    var when = item.startsAt > now ? " · 예정" : item.endsAt > now ? " · 진행 중" : "";
    label.textContent = item.label + (admin ? when : "");
    body.appendChild(label);
    var title = document.createElement("p");
    title.className = "bom-title";
    title.textContent = item.title;
    body.appendChild(title);
    var author = document.createElement("p");
    author.className = "bom-author";
    author.textContent = item.author;
    body.appendChild(author);
    var q = document.createElement("p");
    q.className = "bom-question";
    q.textContent = item.question;
    body.appendChild(q);
    if (item.talkers >= 3) {
      var t = document.createElement("p");
      t.className = "bom-talkers";
      t.textContent = item.talkers + "명이 이야기했어요";
      body.appendChild(t);
    }
    if (admin) {
      var del = document.createElement("button");
      del.type = "button";
      del.className = "btn-ghost-danger is-delete bom-past-admin";
      del.textContent = "지우기";
      del.addEventListener("click", function (e) { e.stopPropagation(); deleteBookOfMonth(item); });
      body.appendChild(del);
    }
    row.appendChild(body);
    row.addEventListener("click", function () {
      gtag("event", "click_book_of_month", { book_id: item.bookId, target: "past" });
      openDetail(item.bookId);
    });
    $list.appendChild(row);
  });
}

// ── 이 책을 꽂은 사람이 함께 꽂은 책(리디자인 B안 제안 ②) · 같은 갈래의 책 ──────────────
// 두 칸 모두 서버가 첫 HTML에 미리 채워 두고(functions/book/[id].js, grid의 data-book = 그 책 id),
// 여기서 같은 모양으로 다시 그린다. 아직 데이터가 없으면(받는 중이거나 /api/를 못 받는 검색엔진의
// 렌더러) 서버가 채운 링크를 지우지 않고 둔다 — 책 페이지끼리 잇는 링크가 이것뿐이다.
function buildRelatedLink(b, gaEvent) {
  var a = document.createElement("a");
  a.className = "also-book";
  a.href = "/book/" + encodeURIComponent(b.id);
  a.setAttribute("aria-label", b.title);
  var cover = document.createElement("span");
  cover.className = "also-cover";
  cover.style.setProperty("--cover", coverFor(b.title));
  if (b.cover) {
    var img = document.createElement("img");
    img.src = upscaleCover(b.cover);
    img.alt = "";
    img.loading = "lazy";
    cover.appendChild(img);
  } else {
    cover.classList.add("also-cover--typo");
    var t = document.createElement("span");
    t.className = "also-cover-typo";
    t.textContent = b.title;
    cover.appendChild(t);
  }
  for (var i = 0; i < Math.min(b.commentCount || 0, 2); i++) {
    var tab = document.createElement("span");
    tab.className = "bm-tab bm-tab--" + (i + 1) + " bm-" + BOOKMARK_COLORS[(i + 1) % BOOKMARK_COLORS.length];
    tab.setAttribute("aria-hidden", "true");
    cover.appendChild(tab);
  }
  a.appendChild(cover);
  var title = document.createElement("span");
  title.className = "also-name";
  title.textContent = b.title;
  a.appendChild(title);
  a.addEventListener("click", function (e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    gtag("event", gaEvent, { from_book_id: state.currentId, book_id: b.id });
    openDetail(b.id);
  });
  return a;
}

function fillRelatedGrid(box, grid, list, gaEvent) {
  delete grid.dataset.book;
  box.hidden = !list.length;
  grid.innerHTML = "";
  list.forEach(function (b) { grid.appendChild(buildRelatedLink(b, gaEvent)); });
}

// js/main.js openDetail이 받은 목록(state.also)을 표지 셋으로. 겹치는 사람이 없으면 숨긴다.
export function renderAlsoBooks() {
  var box = document.getElementById("alsoBooks");
  var grid = document.getElementById("alsoGrid");
  var data = state.also;
  if (data && data.bookId === state.currentId) fillRelatedGrid(box, grid, data.books, "click_also_book");
  else if (grid.dataset.book !== state.currentId) fillRelatedGrid(box, grid, [], "click_also_book");
  renderGenreBooks();
}

// 같은 갈래의 책 — 홈이 받아 둔 책 목록(state.books)에서 고른다(js/relatedBooks.js).
export function renderGenreBooks() {
  var box = document.getElementById("genreBooks");
  var grid = document.getElementById("genreGrid");
  var current = findBook(state.currentId);
  if (!state.booksLoaded || !current) {
    if (grid.dataset.book !== state.currentId) fillRelatedGrid(box, grid, [], "click_genre_book");
    return;
  }
  var also = state.also && state.also.bookId === state.currentId ? state.also.books : [];
  var picked = pickGenreBooks(state.books, current, also.map(function (b) { return b.id; }));
  document.getElementById("genreBooksTitle").textContent = "같은 갈래의 책 · " + picked.genre;
  fillRelatedGrid(box, grid, picked.books, "click_genre_book");
}

// 책갈피 색 고르는 동그라미 넷(한 줄 남기기 시트·한 줄 시트). 고른 것은 먹색 굵은 테두리.
export function renderColorPicker(box, value, onSelect) {
  box.innerHTML = "";
  BOOKMARK_COLORS.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "bm-color bm-" + c + (c === value ? " is-on" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", c === value ? "true" : "false");
    b.setAttribute("aria-label", BOOKMARK_COLOR_LABELS[c]);
    b.addEventListener("click", function () { onSelect(c); });
    box.appendChild(b);
  });
}
