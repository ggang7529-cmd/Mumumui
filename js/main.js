import {
  googleConfigured, api, refreshBooks, refreshComments, refreshNotifications,
  getSavedNickname, saveNickname, normalizeBook, initGoogleSignIn, searchBooks, renderGoogleButtons,
  isAdminMode, getAdminKey, clearAdminKey, verifyAdminKey
} from "./api.js";
import {
  renderStars, renderLibrary, renderDetail, renderAuthBox,
  clearSelectedBook, findBook, renderRandomCard, bookRating, formatDate,
  toggleNotifDropdown, closeNotifDropdown, renderLatestHighlight
} from "./render.js";

// "nickname" = 가입 없이 닉네임만 입력해서 작성 (현재 사용 중).
// "google" = Google 로그인 필요 (D1 + Google OAuth 설정 끝나면 이 값으로 되돌리면 됨. 관련 코드는 지우지 않고 남겨둠).
export var AUTH_MODE = "nickname";

// 아래 값을 본인의 Google Cloud 콘솔 OAuth 클라이언트 ID로 교체하세요 (AUTH_MODE가 "google"일 때만 쓰임).
export var GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

// web3forms.com에서 이메일로 가입하고 발급받은 Access Key로 교체하세요. 공개돼도 되는 값이에요
// (요청 출처/사용량은 web3forms 대시보드에서 제한·확인 가능).
export var WEB3FORMS_ACCESS_KEY = "57e4e1cb-8aea-4711-945b-886fb13cd71e";

// 여러 파일에서 공유하는 전역 상태. 재할당(state = ...) 대신 항상 속성만 바꿔서 씁니다.
export var state = {
  currentUser: null,
  books: [],
  booksLoaded: false,
  recentComments: [],
  comments: [],
  libraryPollTimer: null,
  detailPollTimer: null,
  view: "library",
  currentId: null,
  commentRating: 0,
  formRating: 0,
  selectedBook: null,
  searchQuery: "",
  sortMode: "latest",
  randomPickedId: null,
  randomSpinning: false,
  // 내가 등록한 책에 남이 새로 남긴 리뷰/답글 중 아직 확인하지 않은 것들 (refreshNotifications 참고).
  notifications: [],
  // 8초 폴링(refreshComments)이 댓글 목록을 통째로 다시 그리기 때문에, 답글 입력 중이던
  // 내용을 잃지 않도록 열려 있는 답글창의 임시 입력값을 부모 댓글 id별로 기억해둔다.
  openReplies: {},
  // "책 뽑기" 연속 클릭 이스터에그: 최근 클릭 시각들을 기억해 짧은 시간 안에 여러 번
  // 눌렀는지 판단한다 (trackRandomStreak 참고).
  randomClickTimestamps: [],
  // 상세 페이지에 막 진입했을 때만 표지 펼침 애니메이션을 재생하기 위한 1회성 플래그
  // (renderDetail이 폴링으로 반복 호출될 때는 재생하지 않아야 하므로 필요).
  detailCoverAnimatePending: false
};

// 여러 파일에서 공유하는 DOM 참조.
export var dom = {
  shelf: document.getElementById("shelfGrid"),
  countLabel: document.getElementById("countLabel"),
  searchInput: document.getElementById("searchInput"),
  libraryView: document.getElementById("libraryView"),
  libraryToolbar: document.getElementById("libraryToolbar"),
  formView: document.getElementById("formView"),
  detailView: document.getElementById("detailView"),
  randomView: document.getElementById("randomView"),
  feedbackView: document.getElementById("feedbackView"),
  cStars: document.getElementById("cStars"),
  fStars: document.getElementById("fStars"),
  reviewForm: document.getElementById("reviewForm"),
  bookSearchInput: document.getElementById("bookSearchInput"),
  bookResults: document.getElementById("bookResults"),
  bookSearchField: document.getElementById("bookSearchField"),
  selectedBookField: document.getElementById("selectedBookField"),
  randomCard: document.getElementById("randomCard"),
  randomCardCover: document.getElementById("randomCardCover"),
  randomInfo: document.getElementById("randomInfo"),
  randomDrawBtn: document.getElementById("randomDrawBtn"),
  randomGoBtn: document.getElementById("randomGoBtn"),
  homeBtn: document.getElementById("homeBtn"),
  randomStreakMsg: document.getElementById("randomStreakMsg"),
  milestoneOverlay: document.getElementById("milestoneOverlay"),
  milestoneMessage: document.getElementById("milestoneMessage"),
  latestHighlight: document.getElementById("latestHighlight"),
  stickyHeader: document.getElementById("stickyHeader")
};

// 연속 뽑기 이스터에그 설정: 이 시간(ms) 안에 이 횟수 이상 "책 뽑기"를 누르면 문구가 뜬다.
var RANDOM_STREAK_WINDOW_MS = 10000;
var RANDOM_STREAK_THRESHOLD = 3;
var RANDOM_STREAK_MESSAGES = [
  "이 정도면 운명이에요 🍀",
  "오늘의 책은 이미 정해져 있을지도요 📖",
  "책 고르기 어려우시죠? 😅"
];

// 등록 마일스톤 축하 연출 기준. 테스트할 때는 이 값을 3처럼 작게 잠깐 바꿔서 확인하고
// 확인이 끝나면 반드시 50으로 되돌려두세요 (커밋 전에요!).
var MILESTONE_STEP = 50;

function renderAdminToggle() {
  if (state.view === "detail") renderDetail();
}

function selectCommentRating(idx) {
  state.commentRating = idx;
  renderStars(dom.cStars, state.commentRating, true, selectCommentRating);
}

function selectFormRating(idx) {
  state.formRating = idx;
  renderStars(dom.fStars, state.formRating, true, selectFormRating);
}

function stopLibraryPolling() {
  if (state.libraryPollTimer) { clearInterval(state.libraryPollTimer); state.libraryPollTimer = null; }
}

function startLibraryPolling() {
  stopLibraryPolling();
  state.libraryPollTimer = setInterval(function () { refreshBooks(); refreshNotifications(); }, 20000);
}

function stopDetailPolling() {
  if (state.detailPollTimer) { clearInterval(state.detailPollTimer); state.detailPollTimer = null; }
}

function startDetailPolling() {
  stopDetailPolling();
  state.detailPollTimer = setInterval(function () { refreshBooks(); refreshComments(); refreshNotifications(); }, 8000);
}

export function showView(name) {
  state.view = name;
  dom.libraryView.hidden = name !== "library";
  dom.libraryToolbar.hidden = name !== "library";
  dom.formView.hidden = name !== "form";
  dom.detailView.hidden = name !== "detail";
  dom.randomView.hidden = name !== "random";
  dom.feedbackView.hidden = name !== "feedback";
  dom.homeBtn.hidden = name !== "detail" && name !== "random";
  if (name === "library") {
    stopDetailPolling(); startLibraryPolling();
    // /book/:id로 바로 들어왔다가 돌아오는 경우처럼, 책 목록이 로딩된 뒤로 한 번도
    // 목록 화면 자체가 렌더링된 적이 없을 수 있으니 여기서도 다시 그려준다.
    if (state.booksLoaded) renderLibrary();
  }
  else if (name === "detail") { stopLibraryPolling(); startDetailPolling(); }
  else { stopLibraryPolling(); stopDetailPolling(); }

  // 책 상세만 고유 URL(/book/:id)을 갖고, 나머지 화면(목록/글쓰기/랜덤/의견)은 모두 "/"로
  // 취급한다. 이미 같은 경로면 history를 더 쌓지 않는다 (뒤로가기가 자연스럽게 목록으로).
  var path = (name === "detail" && state.currentId) ? "/book/" + encodeURIComponent(state.currentId) : "/";
  if (window.location.pathname !== path) history.pushState(null, "", path);

  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function openForm() {
  dom.reviewForm.reset();
  state.selectedBook = null;
  state.formRating = 0;
  dom.bookSearchField.hidden = false;
  dom.selectedBookField.hidden = true;
  dom.bookResults.hidden = true;
  dom.bookResults.innerHTML = "";
  renderStars(dom.fStars, 0, true, selectFormRating);
  if (AUTH_MODE === "nickname") document.getElementById("fNickname").value = getSavedNickname();
  showView("form");
  dom.bookSearchInput.focus();
}

export function openDetail(id) {
  state.currentId = id;
  state.comments = [];
  state.commentRating = 0;
  state.openReplies = {};
  state.detailCoverAnimatePending = true;
  renderStars(dom.cStars, 0, true, selectCommentRating);
  if (AUTH_MODE === "nickname") document.getElementById("cNickname").value = getSavedNickname();
  renderDetail();
  showView("detail");
  renderGoogleButtons();
  refreshComments();
}

function openRandomView() {
  state.randomPickedId = null;
  state.randomSpinning = false;
  state.randomClickTimestamps = [];
  clearTimeout(randomStreakHideTimer);
  dom.randomStreakMsg.classList.remove("show");
  dom.randomStreakMsg.hidden = true;
  dom.randomInfo.hidden = true;
  dom.randomGoBtn.hidden = true;
  dom.randomDrawBtn.disabled = false;
  dom.randomCard.classList.remove("spinning", "page-in");
  dom.randomCardCover.innerHTML = "";
  dom.randomCardCover.style.removeProperty("--cover");
  showView("random");
}

// "책 뽑기"를 짧은 시간 안에 여러 번 누르면 재치있는 문구를 잠깐 보여주는 이스터에그.
var randomStreakHideTimer = null;

function trackRandomStreak() {
  var now = Date.now();
  state.randomClickTimestamps = state.randomClickTimestamps.filter(function (t) {
    return now - t < RANDOM_STREAK_WINDOW_MS;
  });
  state.randomClickTimestamps.push(now);
  if (state.randomClickTimestamps.length >= RANDOM_STREAK_THRESHOLD) {
    state.randomClickTimestamps = [];
    showRandomStreakMsg();
  }
}

function showRandomStreakMsg() {
  clearTimeout(randomStreakHideTimer);
  var msg = RANDOM_STREAK_MESSAGES[Math.floor(Math.random() * RANDOM_STREAK_MESSAGES.length)];
  dom.randomStreakMsg.textContent = msg;
  dom.randomStreakMsg.hidden = false;
  void dom.randomStreakMsg.offsetWidth;
  dom.randomStreakMsg.classList.add("show");
  randomStreakHideTimer = setTimeout(function () {
    dom.randomStreakMsg.classList.remove("show");
    setTimeout(function () { dom.randomStreakMsg.hidden = true; }, 260);
  }, 1600);
}

// 등록 권수가 50의 배수에 도달했을 때 보여주는 축하 연출.
var milestoneHideTimer = null;

function showMilestoneCelebration(count) {
  clearTimeout(milestoneHideTimer);
  dom.milestoneMessage.textContent = count + "번째 기록을 남겨주셨어요! 🎉";
  dom.milestoneOverlay.hidden = false;
  void dom.milestoneOverlay.offsetWidth;
  dom.milestoneOverlay.classList.add("show");
  milestoneHideTimer = setTimeout(hideMilestoneCelebration, 2200);
}

function hideMilestoneCelebration() {
  clearTimeout(milestoneHideTimer);
  dom.milestoneOverlay.classList.remove("show");
  setTimeout(function () { dom.milestoneOverlay.hidden = true; }, 260);
}

dom.milestoneOverlay.addEventListener("click", hideMilestoneCelebration);

function drawRandomBook() {
  if (state.randomSpinning) return;
  if (!state.booksLoaded || state.books.length === 0) {
    alert("아직 등록된 책이 없어요. 먼저 책을 기록해보세요.");
    return;
  }

  state.randomSpinning = true;
  dom.randomDrawBtn.disabled = true;
  dom.randomInfo.hidden = true;
  dom.randomGoBtn.hidden = true;
  // 이전 뽑기의 펼침 애니메이션이 아직 재생 중이었다면 정리하고(리플로우로 강제 리셋),
  // 다시 눌렀을 때 흔들림 애니메이션부터 자연스럽게 새로 시작하게 한다.
  dom.randomCard.classList.remove("page-in");
  void dom.randomCard.offsetWidth;
  dom.randomCard.classList.add("spinning");

  var pool = state.books;
  var target = pool[Math.floor(Math.random() * pool.length)];
  var duration = 2000;
  var minDelay = 45;
  var maxDelay = 260;
  var elapsed = 0;

  function pickFlash() {
    if (pool.length === 1) return pool[0];
    var b;
    do { b = pool[Math.floor(Math.random() * pool.length)]; } while (b.id === target.id);
    return b;
  }

  function step() {
    var progress = Math.min(elapsed / duration, 1);
    if (progress >= 1) {
      renderRandomCard(target);
      dom.randomCard.classList.remove("spinning");
      // 클래스를 뗐다 붙이며 리플로우를 강제해서, 결과가 확정될 때마다 책장이 펼쳐지는
      // 애니메이션이 매번 처음부터 다시 재생되게 한다.
      void dom.randomCard.offsetWidth;
      dom.randomCard.classList.add("page-in");
      state.randomSpinning = false;
      dom.randomDrawBtn.disabled = false;
      finishRandomDraw(target);
      return;
    }
    renderRandomCard(pickFlash());
    var eased = Math.pow(progress, 2.2);
    var delay = minDelay + (maxDelay - minDelay) * eased;
    elapsed += delay;
    setTimeout(step, delay);
  }

  step();
}

function finishRandomDraw(b) {
  state.randomPickedId = b.id;
  document.getElementById("randomInfoTitle").textContent = b.title;
  document.getElementById("randomInfoAuthor").textContent = b.author;

  var rating = bookRating(b);
  renderStars(document.getElementById("randomInfoStars"), rating ? Math.round(rating.avg) : 0, false);
  document.getElementById("randomInfoRatingMeta").textContent = rating
    ? rating.avg.toFixed(1) + " (" + rating.count + ")"
    : "아직 평점 없음";
  document.getElementById("randomInfoOwner").textContent =
    "등록: " + (b.ownerName || "알 수 없음") + " · " + formatDate(b.createdAt);

  var $review = document.getElementById("randomInfoReview");
  if (b.text) {
    $review.textContent = "“" + b.text + "”";
    $review.hidden = false;
  } else {
    $review.hidden = true;
  }

  dom.randomInfo.hidden = false;
  dom.randomGoBtn.hidden = false;
}

document.getElementById("bookSearchBtn").addEventListener("click", function () {
  searchBooks(dom.bookSearchInput.value.trim());
});
dom.bookSearchInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    searchBooks(dom.bookSearchInput.value.trim());
  }
});
document.getElementById("clearSelectedBook").addEventListener("click", clearSelectedBook);

dom.searchInput.addEventListener("input", function (e) {
  state.searchQuery = e.target.value;
  renderLibrary();
});

document.querySelectorAll(".sort-tab").forEach(function (btn) {
  btn.addEventListener("click", function () {
    state.sortMode = btn.dataset.sort;
    gtag("event", "change_sort", { sort_mode: state.sortMode });
    document.querySelectorAll(".sort-tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
    renderLibrary();
  });
});

document.getElementById("newReviewBtn").addEventListener("click", function () {
  gtag("event", "click_add_book");
  if (AUTH_MODE === "nickname") { openForm(); return; }
  if (!googleConfigured()) { alert("아직 Google 로그인이 설정되지 않았어요. 관리자에게 문의해주세요."); return; }
  if (!state.currentUser) { alert("먼저 오른쪽 위 'Google로 로그인' 버튼으로 로그인해주세요."); return; }
  openForm();
});
document.getElementById("cancelForm").addEventListener("click", function () { showView("library"); });
document.getElementById("feedbackBtn").addEventListener("click", function () {
  gtag("event", "click_feedback");
  document.getElementById("feedbackForm").reset();
  showView("feedback");
});
document.getElementById("cancelFeedback").addEventListener("click", function () { showView("library"); });
document.getElementById("homeBtn").addEventListener("click", function () { showView("library"); });

document.getElementById("notifBtn").addEventListener("click", function (e) {
  e.stopPropagation();
  toggleNotifDropdown();
});
document.addEventListener("click", function (e) {
  var $dd = document.getElementById("notifDropdown");
  if ($dd && !$dd.hidden && !$dd.contains(e.target) && e.target.id !== "notifBtn") closeNotifDropdown();
});

// Ctrl+Shift+A (Mac: Cmd+Shift+A) — 화면에 아무 흔적도 남기지 않는 숨겨진 관리자 모드 전환 단축키.
document.addEventListener("keydown", function (e) {
  if (!e.shiftKey || e.key.toLowerCase() !== "a" || !(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();

  if (isAdminMode()) {
    if (!confirm("관리자 모드를 해제할까요?")) return;
    clearAdminKey();
    renderAdminToggle();
    return;
  }
  var key = prompt("관리자 비밀번호를 입력하세요.");
  if (key === null) return;
  verifyAdminKey(key).then(function (result) {
    alert(result.ok ? "관리자 모드 켜짐" : result.error);
    if (result.ok) renderAdminToggle();
  });
});
document.getElementById("feedbackForm").addEventListener("submit", function (e) {
  e.preventDefault();
  if (WEB3FORMS_ACCESS_KEY.indexOf("YOUR_WEB3FORMS_ACCESS_KEY") === 0) {
    alert("아직 의견 보내기 기능이 설정되지 않았어요.");
    return;
  }

  var text = document.getElementById("feedbackText").value.trim();
  if (!text) return;
  var replyEmail = document.getElementById("feedbackEmail").value.trim();
  var submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;

  fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: "[책갈피] 새 의견이 도착했어요",
      message: text,
      email: replyEmail || undefined
    })
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.success) throw new Error(data.message || "전송에 실패했어요.");
      alert("의견이 전달됐어요. 감사합니다!");
      showView("library");
    })
    .catch(function (e) { alert(e.message); })
    .finally(function () { submitBtn.disabled = false; });
});

document.getElementById("randomBtn").addEventListener("click", function () {
  gtag("event", "click_random_book");
  openRandomView();
});
dom.randomDrawBtn.addEventListener("click", function () {
  trackRandomStreak();
  drawRandomBook();
});
dom.randomGoBtn.addEventListener("click", function () {
  if (state.randomPickedId) openDetail(state.randomPickedId);
});

dom.reviewForm.addEventListener("submit", function (e) {
  e.preventDefault();
  if (AUTH_MODE !== "nickname" && !state.currentUser) { alert("로그인 후 등록할 수 있어요."); return; }
  if (!state.selectedBook) { alert("책을 검색해서 선택해주세요."); return; }

  var nickname = "";
  if (AUTH_MODE === "nickname") {
    nickname = document.getElementById("fNickname").value.trim().slice(0, 20);
    if (!nickname) { alert("닉네임을 입력해주세요."); return; }
  }

  var text = document.getElementById("fText").value.trim();
  if (!text) return;
  if (state.formRating === 0) {
    alert("별점을 선택해주세요.");
    return;
  }

  if (AUTH_MODE === "nickname") saveNickname(nickname);

  api("/api/books", {
    method: "POST",
    body: {
      title: state.selectedBook.title, author: state.selectedBook.author, cover: state.selectedBook.cover,
      isbn: state.selectedBook.isbn, contents: state.selectedBook.contents, text: text, rating: state.formRating, name: nickname
    }
  })
    .then(function (data) {
      gtag("event", "complete_review", { book_id: data.book.id });
      renderAuthBox();
      state.books.unshift(normalizeBook(data.book));
      state.recentComments.unshift({
        bookId: data.book.id, bookTitle: data.book.title, bookAuthor: data.book.author,
        text: data.book.text, rating: data.book.rating_sum, createdAt: data.book.created_at
      });
      var totalCount = state.books.length;
      showView("library");
      renderLibrary();
      renderLatestHighlight();
      if (totalCount > 0 && totalCount % MILESTONE_STEP === 0) showMilestoneCelebration(totalCount);
    })
    .catch(function (e) {
      alert(e.message);
      if (e.message.indexOf("이미 등록된") !== -1) clearSelectedBook();
    });
});

document.getElementById("bookContentsToggle").addEventListener("click", function () {
  var $text = document.getElementById("bookContentsText");
  var expanded = $text.classList.toggle("expanded");
  this.textContent = expanded ? "접기" : "더 보기";
});

document.getElementById("deleteBtn").addEventListener("click", function () {
  var r = findBook(state.currentId);
  if (!r) return;
  if (!confirm("이 리뷰를 삭제할까요? 댓글도 함께 사라져요.")) return;

  api("/api/books/" + state.currentId, { method: "DELETE", headers: { "X-Admin-Key": getAdminKey() } })
    .then(function () {
      state.books = state.books.filter(function (b) { return b.id !== state.currentId; });
      state.recentComments = state.recentComments.filter(function (c) { return c.bookId !== state.currentId; });
      showView("library");
      renderLibrary();
      renderLatestHighlight();
    })
    .catch(function (e) {
      alert(e.message);
      if (e.message.indexOf("권한이 없") !== -1) { clearAdminKey(); renderAdminToggle(); }
    });
});

document.getElementById("commentForm").addEventListener("submit", function (e) {
  e.preventDefault();
  if (AUTH_MODE !== "nickname" && !state.currentUser) return;

  var nickname = "";
  if (AUTH_MODE === "nickname") {
    nickname = document.getElementById("cNickname").value.trim().slice(0, 20);
    if (!nickname) { alert("닉네임을 입력해주세요."); return; }
  }

  var input = document.getElementById("commentInput");
  var text = input.value.replace(/[\r\n]+/g, " ").trim();
  if (!text) return;
  if (state.commentRating === 0) {
    alert("별점을 선택해주세요.");
    return;
  }

  if (AUTH_MODE === "nickname") saveNickname(nickname);

  api("/api/books/" + state.currentId + "/comments", { method: "POST", body: { text: text, rating: state.commentRating, name: nickname } })
    .then(function () {
      gtag("event", "complete_review", { book_id: state.currentId });
      input.value = "";
      state.commentRating = 0;
      renderStars(dom.cStars, 0, true, selectCommentRating);
      renderAuthBox();
      return Promise.all([refreshBooks(), refreshComments()]);
    })
    .catch(function (e) { alert(e.message); });
});

if (AUTH_MODE === "google") {
  api("/api/me").then(function (data) {
    state.currentUser = data.user || null;
    renderAuthBox();
    if (state.view === "detail") renderDetail();
  }).catch(function () {
    renderAuthBox();
  });
  initGoogleSignIn();
} else {
  renderAuthBox();
}

function bookIdFromPath(pathname) {
  var m = pathname.match(/^\/book\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// 모바일에서만 의미가 있는 스크롤 방향 기반 헤더 숨김/노출 (css/style.css의
// @media (max-width: 640px) .sticky-header.header-hidden 규칙에서만 실제로 보이므로,
// PC 폭에서는 클래스가 붙어도 시각적으로 아무 효과가 없다 — 뷰포트 분기를 여기서 따로
// 할 필요가 없다). 헤더 높이만큼 스크롤하기 전까지는 숨기지 않고, 위로 스크롤하면 즉시
// 다시 보여준다.
var lastScrollY = window.scrollY;
var SCROLL_HIDE_DELTA = 8;
window.addEventListener("scroll", function () {
  var currentY = window.scrollY;
  var delta = currentY - lastScrollY;
  if (Math.abs(delta) < SCROLL_HIDE_DELTA) return;

  if (delta > 0 && currentY > dom.stickyHeader.offsetHeight) {
    dom.stickyHeader.classList.add("header-hidden");
  } else {
    dom.stickyHeader.classList.remove("header-hidden");
  }
  lastScrollY = currentY;
}, { passive: true });

window.addEventListener("popstate", function () {
  var id = bookIdFromPath(window.location.pathname);
  if (id) openDetail(id);
  else showView("library");
});

var initialBookId = bookIdFromPath(window.location.pathname);
if (initialBookId) openDetail(initialBookId);
else showView("library");

refreshBooks();
refreshNotifications();
