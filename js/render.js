import { state, dom, AUTH_MODE, openDetail, showView, startBookRegistration, openProfile } from "./main.js";
import { MOOD_TAGS, findMoodTag } from "./moodTags.js";
import { formatContents } from "./bookContents.js";
import {
  googleConfigured, myUid, api, refreshBooks, refreshComments, refreshMyScore, getSavedNickname, saveNickname,
  renderGoogleButtons, isAdminMode, getAdminKey, getNotifSeenMap, saveNotifSeenMap, normalizeBook
} from "./api.js";
import { getLevel, formatNicknameShort, formatNicknameFull } from "./levels.js";

// 표지 없는 책의 "책등" 배경색. 예전엔 녹색·청색·남색까지 섞인 6색이라 브랜드 색과
// 무관한 무지개가 됐다 — 버건디에서 클레이/탠으로 이어지는 같은 계열 5색으로 좁혀,
// 서로 구분은 되면서 서가 전체가 한 톤으로 읽히게 한다. 전부 크림색 활자를 얹어도
// 대비가 충분한 중간~어두운 명도로 골랐다.
var COVERS = ["#6E2733", "#8C3A38", "#A85C46", "#7A4A52", "#6B5240"];

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

export function coverFor(title) {
  var hash = 0;
  for (var i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return COVERS[hash % COVERS.length];
}

// 댓글/답글 작성자 닉네임 span을 공통으로 만든다. 별점·좋아요·날짜까지 같이 붙는 줄이라
// "등급아이콘 레벨 닉네임" 축약형으로 표시한다 (예: 책아이콘 + "6 이과생").
// 닉네임은 사용자 입력이므로 textContent로만 넣는다 — innerHTML로 조립하지 않는다.
function buildAuthorChip(name, score, className) {
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
  MOOD_TAGS.forEach(function (tag) {
    var btn = document.createElement("button");
    btn.type = "button";
    var isOn = tag.id === selectedId;
    btn.className = "mood-chip" + (isOn ? " is-on" : "");
    btn.textContent = tag.label + " " + tag.emoji;
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

export function selectBook(b) {
  state.selectedBook = b;
  dom.bookSearchField.hidden = true;
  dom.selectedBookField.hidden = false;
  dom.bookResults.hidden = true;
  dom.bookResults.innerHTML = "";
  dom.bookSearchInput.value = "";

  var $cover = document.getElementById("selectedBookCover");
  $cover.innerHTML = "";
  $cover.style.setProperty("--cover", coverFor(b.title));
  if (b.cover) {
    var img = document.createElement("img");
    img.src = upscaleCover(b.cover);
    img.alt = "";
    $cover.appendChild(img);
  }
  document.getElementById("selectedBookTitle").textContent = b.title;
  document.getElementById("selectedBookAuthor").textContent = b.author;
}

export function clearSelectedBook() {
  state.selectedBook = null;
  dom.bookSearchField.hidden = false;
  dom.selectedBookField.hidden = true;
}

export function renderBookResults(list) {
  dom.bookResults.innerHTML = "";
  dom.bookResults.hidden = false;

  if (list.length === 0) {
    var empty = document.createElement("li");
    empty.className = "book-result-empty";
    empty.textContent = "검색 결과가 없어요.";
    dom.bookResults.appendChild(empty);
    return;
  }

  list.forEach(function (b) {
    var li = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "book-result-item";

    if (b.cover) {
      var img = document.createElement("img");
      img.src = upscaleCover(b.cover);
      img.alt = "";
      btn.appendChild(img);
    } else {
      var placeholder = document.createElement("div");
      placeholder.className = "book-result-noimg";
      placeholder.textContent = "표지 없음";
      btn.appendChild(placeholder);
    }

    var info = document.createElement("div");
    var t = document.createElement("div");
    t.className = "book-result-title";
    t.textContent = b.title;
    var a = document.createElement("div");
    a.className = "book-result-author";
    a.textContent = b.author + (b.publisher ? " · " + b.publisher : "");
    info.appendChild(t);
    info.appendChild(a);
    btn.appendChild(info);

    btn.addEventListener("click", function () { selectBook(b); });
    li.appendChild(btn);
    dom.bookResults.appendChild(li);
  });
}

export function renderAuthBox() {
  var $box = document.getElementById("authBox");
  $box.innerHTML = "";
  if (AUTH_MODE === "nickname") {
    var nickname = getSavedNickname();
    if (nickname) {
      // 내 기록으로 들어가는 입구. 별도 메뉴를 만드는 대신 이미 헤더에 떠 있는 내 닉네임을
      // 그대로 누를 수 있게 했다 — 남의 닉네임을 누르는 것과 같은 동작이라 배울 게 없다.
      var savedChip = document.createElement("button");
      savedChip.type = "button";
      savedChip.className = "user-chip is-linked";
      savedChip.setAttribute("aria-label", nickname + "님의 기록 보기");
      savedChip.addEventListener("click", function () { openProfile(nickname); });
      var savedName = document.createElement("span");
      savedName.className = "user-name";
      var myLevel = getLevel(state.myScore);
      savedName.appendChild(buildIcon(myLevel.icon, "lv-icon lv-icon--" + myLevel.icon));
      savedName.appendChild(document.createTextNode(formatNicknameFull(nickname, state.myScore)));
      savedChip.appendChild(savedName);
      $box.appendChild(savedChip);
    }
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

// 도서관 정보나루가 주는 분류(class_nm)는 "문학 > 한국문학 > 소설"처럼 KDC 계층 전체를
// " > "로 이어붙인 문자열이다. 필터 옵션이 지나치게 세분화되지 않도록 최상위 한 단계만
// 잘라 쓴다.
function genreOf(category) {
  if (!category) return "";
  return category.split(">")[0].trim();
}

function updateCategoryFilterOptions() {
  var genres = [];
  state.books.forEach(function (r) {
    var g = genreOf(r.category);
    if (g && genres.indexOf(g) === -1) genres.push(g);
  });
  genres.sort(function (a, b) { return a.localeCompare(b, "ko"); });

  var current = dom.categoryFilter.value;
  dom.categoryFilter.innerHTML = "";
  var allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "전체 분류";
  dom.categoryFilter.appendChild(allOpt);
  genres.forEach(function (g) {
    var opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    dom.categoryFilter.appendChild(opt);
  });

  // 폴링으로 목록이 갱신되며 이 함수가 반복 호출될 때 사용자가 골라둔 필터가 풀리지
  // 않도록 유지한다. 다만 그 분류가 더 이상 존재하지 않으면(옵션 자체가 없어짐) 전체로.
  if (genres.indexOf(current) !== -1) dom.categoryFilter.value = current;
  else state.categoryFilter = "";
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

    // 표지 영역을 별도 컨테이너(.b-cover)로 감싸서, PC에서는 지금처럼 표지 위에 정보가
    // 절대위치로 겹치고(css/style.css 기본 규칙) 모바일에서는 표지 "아래"에 다크 정보
    // 카드로 분리되도록(같은 미디어쿼리, .b-overlay를 static으로 전환) CSS만으로 두 레이아웃을
    // 다 표현한다. 표지 이미지가 없는 책도 색상 배경이 이 컨테이너 크기를 그대로 차지해야
    // 하므로, img 유무와 무관하게 항상 이 컨테이너를 만든다.
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

    card.appendChild(coverBox);

    var overlay = document.createElement("div");
    overlay.className = "b-overlay";

    var titleEl = document.createElement("div");
    titleEl.className = "b-title";
    titleEl.textContent = r.title;

    // 카드 하단 문구는 참여자 수에 따라 다르게 쓴다. 처음 온 사람이 카드를 "정보 표시"로만
    // 읽고 지나가지 않도록, 아직 비어 있거나 한 명뿐인 책에서는 숫자 대신 사람 말로 상태를
    // 알려주고 자리가 남아 있다는 걸 드러낸다. 두 명 이상 모인 책은 이미 읽을거리가 있으니
    // 원래대로 별점과 참여자 수를 보여준다.
    var starsEl = document.createElement("div");
    starsEl.className = "b-stars";
    if (!rating) {
      starsEl.classList.add("b-stars--invite");
      starsEl.textContent = "첫 리뷰를 남겨보세요";
      // 터치 기기에는 hover가 없어서 아래 행동 유도 문구를 열 방법이 없다. 참여가 필요한
      // 이런 카드에서만 상시 노출하도록 CSS가 이 클래스를 잡는다(모든 카드에 항상 띄우면
      // 좁은 화면에서 줄만 늘어난다).
      card.classList.add("book-card--invite");
    } else if (rating.count === 1) {
      starsEl.classList.add("b-stars--invite");
      starsEl.textContent = "아직 1명이 읽었어요";
      card.classList.add("book-card--invite");
    } else {
      starsEl.appendChild(buildStarRow(Math.round(rating.avg)));
      starsEl.appendChild(document.createTextNode(" " + rating.avg.toFixed(1) + " (" + rating.count + ")"));
    }

    // 마우스를 올리거나(PC) 누르는 동안(모바일) 나타나는 행동 유도 문구. 카드가 그냥
    // 읽을거리가 아니라 "눌러서 참여하는 곳"이라는 신호를 준다. 링크 자체가 이미 상세로
    // 가는 역할을 하고 위 aria-label이 책 정보를 읽어주므로, 이 줄은 화면에만 보이면
    // 충분해서 스크린리더에서는 감춘다.
    var cta = document.createElement("span");
    cta.className = "b-cta";
    cta.textContent = "별점 남기기 →";
    cta.setAttribute("aria-hidden", "true");

    overlay.appendChild(titleEl);
    overlay.appendChild(starsEl);
    overlay.appendChild(cta);
    card.appendChild(overlay);

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
  updateCategoryFilterOptions();

  var query = state.searchQuery.trim().toLowerCase();
  var visible = query
    ? state.books.filter(function (r) { return r.title.toLowerCase().indexOf(query) !== -1; })
    : state.books.slice();

  if (state.categoryFilter) {
    visible = visible.filter(function (r) { return genreOf(r.category) === state.categoryFilter; });
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

  if (!state.booksLoaded) {
    dom.countLabel.textContent = "불러오는 중...";
  } else if (filtered) {
    dom.countLabel.textContent = visible.length + "권 검색됨 (전체 " + state.books.length + "권)";
  } else {
    dom.countLabel.textContent = state.books.length ? "총 " + state.books.length + "권의 리뷰" : "";
  }

  // 처음 온 사람이 "나는 지금 등록할 책이 없다"고 느끼고 그냥 나가는 걸 줄이려고, 이미
  // 이만큼 쌓여 있다는 사실과 함께 한 권 보태달라고 가볍게 권한다. 권수는 바로 위
  // countLabel과 같은 state.books.length를 그대로 쓴다 — 따로 세지 않는다.
  //
  // 검색·분류로 걸러도 문구는 전체 권수를 그대로 보여준다. 이 줄은 "이 서가에 지금까지
  // 몇 권이 모였나"를 말하는 것이지 지금 화면에 몇 권이 보이나가 아니고, 필터를 만질
  // 때마다 숫자가 같이 흔들리면 오히려 산만하다.
  if (dom.introInvite) {
    if (!state.booksLoaded) {
      dom.introInvite.hidden = true;
    } else {
      dom.introInvite.hidden = false;
      dom.introInvite.textContent = state.books.length
        ? "지금까지 " + state.books.length + "권이 모였어요. 다음 한 권은 당신 차례예요"
        : "아직 한 권도 없어요. 첫 기록을 남겨보세요";
    }
  }

  // 검색어나 분류로 목록을 걸렀다면 인트로(헤드라인 + 참여 문구 + "방금 등록됐어요"
  // 하이라이트)를 접는다. 결과를 보려고 거른 건데 그 위에 고정 안내가 한 화면을
  // 차지하고 있으면 결과가 화면 밖으로 밀려서, 검색이 된 건지조차 바로 안 보인다.
  //
  // showView()도 같은 요소를 여닫는다(목록 화면이 아니면 항상 숨김). 그래서 여기서는
  // 목록 화면일 때만 손대 — 안 그러면 폴링으로 이 함수가 돌 때 상세/등록 화면 위에
  // 인트로가 되살아난다.
  if (dom.headerIntro && !dom.libraryView.hidden) {
    dom.headerIntro.hidden = filtered;
  }

  dom.shelf.innerHTML = "";

  if (state.booksLoaded && state.books.length === 0) {
    var note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "아직 기록한 책이 없어요. 위쪽 '+ 책 기록하기' 버튼으로 첫 책을 남겨보세요.";
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
export function renderProfile() {
  var data = state.profile;
  var isMe = !!data && data.nickname === getSavedNickname();

  dom.profileName.textContent = data ? data.nickname : "";
  if (!data) {
    dom.profileSub.textContent = "불러오는 중...";
    dom.profileStats.innerHTML = "";
    dom.profileShelf.innerHTML = "";
    dom.profileReviews.innerHTML = "";
    dom.profileBookCount.textContent = "";
    dom.profileReviewCount.textContent = "";
    return;
  }

  var lvl = getLevel(data.score);
  dom.profileSub.textContent = (isMe ? "내 기록 · " : "") + lvl.name + " · " + data.score + "점";

  // 요약 숫자. 값이 없는 항목(아직 별점을 안 준 경우의 평균)은 아예 빼서 "-"가 줄줄이
  // 늘어서지 않게 한다.
  var s = data.summary;
  var stats = [
    ["등록한 책", s.bookCount + "권"],
    ["남긴 한줄평", s.reviewCount + "개"],
    ["받은 좋아요", s.likesReceived + "개"]
  ];
  if (s.avgRating !== null && s.avgRating !== undefined) stats.push(["평균 별점", s.avgRating.toFixed(1) + "점"]);
  if (s.replyCount) stats.push(["남긴 답글", s.replyCount + "개"]);

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
    cell.appendChild(dt);
    cell.appendChild(dd);
    dom.profileStats.appendChild(cell);
  });

  // 등록한 책 — 홈 서가와 같은 카드를 쓴다.
  dom.profileBookCount.textContent = data.books.length ? "(" + data.books.length + ")" : "";
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

  // 남긴 한줄평 — 어느 책에 남긴 건지가 핵심이라 책 제목을 앞에 둔다.
  dom.profileReviewCount.textContent = data.reviews.length ? "(" + data.reviews.length + ")" : "";
  dom.profileReviews.innerHTML = "";
  if (data.reviews.length === 0) {
    var noReview = document.createElement("li");
    noReview.className = "empty-note";
    noReview.textContent = isMe ? "아직 남긴 한줄평이 없어요." : "아직 남긴 한줄평이 없어요";
    dom.profileReviews.appendChild(noReview);
  } else {
    data.reviews.forEach(function (r) {
      var li = document.createElement("li");

      var bookLink = document.createElement("a");
      bookLink.className = "pr-book";
      bookLink.href = "/book/" + encodeURIComponent(r.book_id);
      bookLink.textContent = r.book_title;
      bookLink.addEventListener("click", function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openDetail(r.book_id);
      });
      li.appendChild(bookLink);

      var stars = document.createElement("span");
      stars.className = "pr-rating";
      for (var i = 1; i <= 5; i++) stars.appendChild(buildStarIcon(i <= r.rating));
      li.appendChild(stars);

      var badge = buildMoodBadge(r.mood);
      if (badge) li.appendChild(badge);

      if (r.text) {
        var textEl = document.createElement("span");
        textEl.className = "pr-text";
        textEl.textContent = r.text;
        li.appendChild(textEl);
      }

      var date = document.createElement("span");
      date.className = "pr-date";
      date.textContent = formatDate(r.created_at);
      li.appendChild(date);

      dom.profileReviews.appendChild(li);
    });
  }
}

// 정렬탭의 "최신순" 목록과 별개로, 홈 상단 설명 영역에 방금 등록된 한줄평 1~2개를
// 별도로 하이라이트해서 보여준다. 책 등록 시에도 첫 리뷰가 댓글로 함께 저장되므로
// (functions/api/books/index.js), 최신 댓글 목록 하나만 보면 "새로 등록된 책"과
// "기존 책에 새로 달린 리뷰"가 자연히 함께 섞여 나온다.
export function renderLatestHighlight() {
  var container = dom.latestHighlight;
  if (!container) return;

  var latest = state.recentComments.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 2);

  if (!state.booksLoaded || latest.length === 0) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.innerHTML = "";
  container.hidden = false;

  latest.forEach(function (r) {
    var card = document.createElement("a");
    card.href = "/book/" + encodeURIComponent(r.bookId);
    card.className = "latest-highlight-card";
    card.setAttribute("aria-label", "방금 등록된 한줄평: " + r.bookTitle + ", " + r.bookAuthor);

    var label = document.createElement("span");
    label.className = "latest-highlight-label";
    label.textContent = "방금 등록됐어요";

    var bookLine = document.createElement("div");
    bookLine.className = "latest-highlight-book";
    var titleEl = document.createElement("strong");
    titleEl.textContent = r.bookTitle;
    bookLine.appendChild(titleEl);
    bookLine.appendChild(document.createTextNode(" · " + r.bookAuthor));

    var starsEl = document.createElement("div");
    starsEl.className = "latest-highlight-stars";
    starsEl.appendChild(buildStarRow(r.rating));

    var textEl = document.createElement("p");
    textEl.className = "latest-highlight-text";
    // 태그만 고르고 본문 없이 남긴 한줄평이면 빈 따옴표("")만 남는다. 그럴 땐 따옴표를
    // 빼고 태그 문구를 그대로 보여준다 — 남이 쓴 문장이 아니니 인용처럼 감싸지 않는다.
    var highlightTag = findMoodTag(r.mood);
    if (r.text) {
      textEl.textContent = "“" + r.text + "”";
    } else if (highlightTag) {
      textEl.textContent = highlightTag.emoji + " " + highlightTag.label;
    } else {
      textEl.hidden = true;
    }

    card.appendChild(label);
    card.appendChild(bookLine);
    card.appendChild(starsEl);
    card.appendChild(textEl);

    card.addEventListener("click", function (id) {
      return function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openDetail(id);
      };
    }(r.bookId));

    container.appendChild(card);
  });
}

// 책 소개(카카오 API의 contents)를 보여준다.
//
// 예전엔 PC 3줄 / 모바일 2줄로 접고 "더 보기" 버튼을 달았는데, 카카오가 주는 소개가
// 260자 남짓이라 접을 만큼 길지 않았다. 버튼 한 번을 더 누르게 할 이유가 없어서 접는
// 걸 없애고 한 번에 다 보여준다. 대신 발췌라서 문장이 끊긴 자리에는 formatContents가
// "…"를 붙인다(js/bookContents.js).
function updateBookContents(r) {
  var $section = document.getElementById("bookContentsSection");
  var $text = document.getElementById("bookContentsText");
  var contents = formatContents(r.contents);

  if (!contents) {
    $section.hidden = true;
    return;
  }

  $section.hidden = false;
  // 폴링(8~20초)으로 이 함수가 반복 호출되는데, 같은 값을 매번 다시 넣으면 텍스트 노드가
  // 교체되면서 사용자가 드래그해둔 선택이 풀린다. 달라졌을 때만 쓴다.
  if ($text.textContent !== contents) $text.textContent = contents;
}
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
  document.getElementById("detailAuthor").textContent = r.author;
  document.getElementById("detailDate").textContent = formatDate(r.createdAt) + " 기록";
  var $detailOwner = document.getElementById("detailOwner");
  $detailOwner.innerHTML = "";
  $detailOwner.appendChild(document.createTextNode("등록: "));
  var ownerNameSpan = document.createElement("span");
  ownerNameSpan.className = "meta-owner-name";
  ownerNameSpan.textContent = r.ownerName || "알 수 없음";
  $detailOwner.appendChild(ownerNameSpan);

  var rating = bookRating(r);
  renderStars(document.getElementById("detailStars"), rating ? Math.round(rating.avg) : 0, false);
  document.getElementById("detailRatingMeta").textContent = rating
    ? rating.avg.toFixed(1) + " (" + rating.count + ")"
    : "아직 평점 없음";

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

  updateBookContents(r);

  document.getElementById("deleteBtn").hidden = !isAdminMode();

  var $commentForm = document.getElementById("commentForm");
  var $commentSignin = document.getElementById("commentSignin");
  var $commentHint = document.getElementById("commentHint");
  if (AUTH_MODE === "nickname") {
    $commentForm.hidden = false;
    $commentSignin.hidden = true;
    $commentHint.hidden = false;
  } else {
    $commentForm.hidden = !state.currentUser;
    $commentSignin.hidden = !!state.currentUser;
    $commentHint.hidden = !state.currentUser;
    if (!state.currentUser) {
      document.getElementById("commentSigninText").textContent = googleConfigured()
        ? "로그인하면 이 책에 한줄평을 남길 수 있어요."
        : "아직 Google 로그인이 설정되지 않았어요.";
      document.getElementById("googleBtnComment").hidden = !googleConfigured();
    }
  }

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

  document.getElementById("commentCount").textContent = topLevel.length ? "(" + topLevel.length + ")" : "";

  if (topLevel.length === 0) {
    var li = document.createElement("li");
    li.style.color = "var(--ink-faint)";
    li.style.fontSize = "0.88rem";
    li.textContent = "아직 댓글이 없어요. 별점과 함께 첫 한 줄을 남겨보세요.";
    $list.appendChild(li);
  } else {
    var sortedComments = topLevel.slice().sort(function (a, b) { return b.likes - a.likes; });

    sortedComments.forEach(function (c) {
      var item = document.createElement("li");
      var moodBadge = buildMoodBadge(c.mood);
      var textSpan = document.createElement("span");
      textSpan.className = "c-text";
      textSpan.textContent = c.text;
      textSpan.title = c.text;

      var authorSpan = buildAuthorChip(c.authorName, c.authorScore, "c-author");

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

      var replyBtn = document.createElement("button");
      replyBtn.type = "button";
      replyBtn.className = "c-reply-btn";
      replyBtn.textContent = "답글";
      item.appendChild(replyBtn);

      var repliesList = document.createElement("ul");
      repliesList.className = "c-replies";
      (repliesByParent[c.id] || []).forEach(function (r) {
        var rItem = document.createElement("li");

        var rAuthor = buildAuthorChip(r.authorName, r.authorScore, "c-reply-author");

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
        replyNameInput.value = getSavedNickname();
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

        if (AUTH_MODE === "nickname") saveNickname(name);

        api("/api/books/" + state.currentId + "/comments", { method: "POST", body: { text: text, parentId: c.id, name: name } })
          .then(function () {
            gtag("event", "post_reply");
            replyTextInput.value = "";
            replyForm.hidden = true;
            delete state.openReplies[c.id];
            refreshComments();
            refreshMyScore();
          })
          .catch(function (e) { alert(e.message); });
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
