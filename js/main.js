import {
  googleConfigured, api, refreshBooks, refreshComments,
  getSavedNickname, saveNickname, normalizeBook, initGoogleSignIn, searchBooks, renderGoogleButtons,
  isAdminMode, getAdminKey, clearAdminKey, verifyAdminKey
} from "./api.js";
import {
  renderStars, renderLibrary, renderDetail, renderAuthBox,
  clearSelectedBook, findBook, renderRandomCard, bookRating, formatDate
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
  // 8초 폴링(refreshComments)이 댓글 목록을 통째로 다시 그리기 때문에, 답글 입력 중이던
  // 내용을 잃지 않도록 열려 있는 답글창의 임시 입력값을 부모 댓글 id별로 기억해둔다.
  openReplies: {}
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
  randomCardTitle: document.getElementById("randomCardTitle"),
  randomInfo: document.getElementById("randomInfo"),
  randomDrawBtn: document.getElementById("randomDrawBtn"),
  randomGoBtn: document.getElementById("randomGoBtn"),
  homeBtn: document.getElementById("homeBtn")
};

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
  state.libraryPollTimer = setInterval(refreshBooks, 20000);
}

function stopDetailPolling() {
  if (state.detailPollTimer) { clearInterval(state.detailPollTimer); state.detailPollTimer = null; }
}

function startDetailPolling() {
  stopDetailPolling();
  state.detailPollTimer = setInterval(function () { refreshBooks(); refreshComments(); }, 8000);
}

export function showView(name) {
  state.view = name;
  dom.libraryView.hidden = name !== "library";
  dom.libraryToolbar.hidden = name !== "library";
  dom.formView.hidden = name !== "form";
  dom.detailView.hidden = name !== "detail";
  dom.randomView.hidden = name !== "random";
  dom.feedbackView.hidden = name !== "feedback";
  dom.homeBtn.hidden = name !== "detail";
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
  dom.randomInfo.hidden = true;
  dom.randomGoBtn.hidden = true;
  dom.randomDrawBtn.disabled = false;
  dom.randomCard.classList.remove("spinning");
  dom.randomCardCover.innerHTML = "";
  dom.randomCardCover.style.removeProperty("--cover");
  dom.randomCardTitle.textContent = "책 뽑기 버튼을 눌러보세요";
  showView("random");
}

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
document.getElementById("backBtn").addEventListener("click", function () {
  showView("library");
});

document.getElementById("randomBtn").addEventListener("click", function () {
  gtag("event", "click_random_book");
  openRandomView();
});
document.getElementById("randomBackBtn").addEventListener("click", function () { showView("library"); });
dom.randomDrawBtn.addEventListener("click", drawRandomBook);
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
      isbn: state.selectedBook.isbn, text: text, rating: state.formRating, name: nickname
    }
  })
    .then(function (data) {
      gtag("event", "complete_review", { book_id: data.book.id });
      renderAuthBox();
      state.books.unshift(normalizeBook(data.book));
      showView("library");
      renderLibrary();
    })
    .catch(function (e) {
      alert(e.message);
      if (e.message.indexOf("이미 등록된") !== -1) clearSelectedBook();
    });
});

document.getElementById("deleteBtn").addEventListener("click", function () {
  var r = findBook(state.currentId);
  if (!r) return;
  if (!confirm("이 리뷰를 삭제할까요? 댓글도 함께 사라져요.")) return;

  api("/api/books/" + state.currentId, { method: "DELETE", headers: { "X-Admin-Key": getAdminKey() } })
    .then(function () {
      state.books = state.books.filter(function (b) { return b.id !== state.currentId; });
      showView("library");
      renderLibrary();
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

window.addEventListener("popstate", function () {
  var id = bookIdFromPath(window.location.pathname);
  if (id) openDetail(id);
  else showView("library");
});

var initialBookId = bookIdFromPath(window.location.pathname);
if (initialBookId) openDetail(initialBookId);
else showView("library");

refreshBooks();
