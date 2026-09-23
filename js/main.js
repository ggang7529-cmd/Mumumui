import {
  googleConfigured, api, refreshBooks, refreshComments, refreshNotifications, refreshMyScore,
  getSavedNickname, saveNickname, normalizeBook, initGoogleSignIn, searchBooks, renderGoogleButtons,
  isAdminMode, getAdminKey, clearAdminKey, verifyAdminKey
} from "./api.js";
import {
  renderStars, renderLibrary, renderDetail, renderAuthBox,
  clearSelectedBook, findBook, renderRandomCard, bookRating, formatDate,
  toggleNotifDropdown, closeNotifDropdown, renderLatestHighlight, renderMoodPicker, renderProfile,
  renderRecommend
} from "./render.js";

// "nickname" = 가입 없이 닉네임만 입력해서 작성 (현재 사용 중).
// "google" = Google 로그인 필요 (D1 + Google OAuth 설정 끝나면 이 값으로 되돌리면 됨. 관련 코드는 지우지 않고 남겨둠).
export var AUTH_MODE = "nickname";

// 한 줄 리뷰 입력창의 자리표시자 후보. 빈 칸 앞에서 무슨 말을 써야 할지 막막해하는 걸
// 줄이려고 "이렇게 쓰면 된다"는 예시를 하나씩 돌려가며 보여준다.
//
// 전부 긍정적인 톤으로만 모아뒀다. 자리표시자는 화면에 늘 떠 있는 문구라 "아쉬웠다"류를
// 섞으면 사이트 첫인상이 그쪽으로 기운다 — 실제 리뷰는 당연히 좋았든 아쉬웠든 자유롭게
// 쓸 수 있고, 이건 어디까지나 예시일 뿐이다(입력하면 바로 사라진다).
var REVIEW_PLACEHOLDERS = [
  "다 읽고 나니 여운이 남는 책이에요",
  "생각할 거리를 많이 준 책이에요",
  "이번 달 최고의 발견이었어요",
  "다시 읽고 싶은 책이에요",
  "누군가에게 꼭 권하고 싶어요",
  "읽는 내내 시간 가는 줄 몰랐어요"
];

function pickReviewPlaceholder() {
  return REVIEW_PLACEHOLDERS[Math.floor(Math.random() * REVIEW_PLACEHOLDERS.length)];
}

// 아래 값을 본인의 Google Cloud 콘솔 OAuth 클라이언트 ID로 교체하세요 (AUTH_MODE가 "google"일 때만 쓰임).
export var GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

// web3forms.com에서 이메일로 가입하고 발급받은 Access Key로 교체하세요. 공개돼도 되는 값이에요
// (요청 출처/사용량은 web3forms 대시보드에서 제한·확인 가능).
export var WEB3FORMS_ACCESS_KEY = "57e4e1cb-8aea-4711-945b-886fb13cd71e";

// 여러 파일에서 공유하는 전역 상태. 재할당(state = ...) 대신 항상 속성만 바꿔서 씁니다.
export var state = {
  currentUser: null,
  // 헤더의 "이모지 레벨 [등급명] 닉네임" 표시용 내 활동 점수 (api.js refreshMyScore 참고).
  myScore: 0,
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
  // 고른 감정 태그 id (js/moodTags.js). 고르지 않았으면 null — 선택 항목이다.
  commentMood: null,
  formMood: null,
  selectedBook: null,
  // 프로필 화면에서 보고 있는 닉네임과, 서버에서 받아온 그 사람의 기록. 아직 안 왔으면 null.
  profileName: null,
  profile: null,
  // "나를 위한 추천" 화면의 응답. 아직 안 왔으면 null, 닉네임이 없어 아예 조회를 못 한
  // 경우는 recommendReady만 true가 되고 recommend는 null로 남는다.
  recommend: null,
  recommendReady: false,
  searchQuery: "",
  sortMode: "latest",
  categoryFilter: "",
  randomPickedId: null,
  randomSpinning: false,
  // 내가 등록한 책에 남이 새로 남긴 리뷰/답글 중 아직 확인하지 않은 것들 (refreshNotifications 참고).
  notifications: [],
  // 8초 폴링(refreshComments)이 댓글 목록을 통째로 다시 그리기 때문에, 답글 입력 중이던
  // 내용을 잃지 않도록 열려 있는 답글창의 임시 입력값을 부모 댓글 id별로 기억해둔다.
  openReplies: {},
  // 수정 중인 댓글의 임시 입력값을 댓글 id별로 기억해둔다 — openReplies와 같은 이유로,
  // 8초 폴링이 목록을 다시 그려도 쓰던 내용과 고르던 별점이 날아가지 않게 한다.
  // { 댓글id: { text, rating } } 형태이고, 키가 있으면 그 댓글이 수정 모드라는 뜻이다.
  openEdits: {},
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
  categoryFilter: document.getElementById("categoryFilter"),
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
  headerIntro: document.getElementById("headerIntro"),
  introInvite: document.getElementById("introInvite"),
  stickyHeader: document.getElementById("stickyHeader"),
  fMoods: document.getElementById("fMoods"),
  cMoods: document.getElementById("cMoods"),
  recommendView: document.getElementById("recommendView"),
  recommendTitle: document.getElementById("recommendTitle"),
  recommendSub: document.getElementById("recommendSub"),
  recommendShelf: document.getElementById("recommendShelf"),
  recommendEmpty: document.getElementById("recommendEmpty"),
  recommendEmptyText: document.getElementById("recommendEmptyText"),
  recommendClaim: document.getElementById("recommendClaim"),
  recommendClaimLabel: document.getElementById("recommendClaimLabel"),
  recommendNickname: document.getElementById("recommendNickname"),
  recommendClaimMsg: document.getElementById("recommendClaimMsg"),
  profileView: document.getElementById("profileView"),
  profileName: document.getElementById("profileName"),
  profileSub: document.getElementById("profileSub"),
  profileStats: document.getElementById("profileStats"),
  profileShelf: document.getElementById("profileShelf"),
  profileReviews: document.getElementById("profileReviews"),
  profileBookCount: document.getElementById("profileBookCount"),
  profileReviewCount: document.getElementById("profileReviewCount")
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

function selectFormMood(id) {
  state.formMood = id;
  renderMoodPicker(dom.fMoods, state.formMood, selectFormMood);
}

function selectCommentMood(id) {
  state.commentMood = id;
  renderMoodPicker(dom.cMoods, state.commentMood, selectCommentMood);
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
  dom.profileView.hidden = name !== "profile";
  dom.recommendView.hidden = name !== "recommend";
  // 목록(홈)이 아닌 모든 화면에서 "홈으로"를 띄운다. 책 등록 화면에는 폼 아래에 "취소"가
  // 있지만, 그건 폼을 스크롤해 끝까지 내려가야 보인다 — 화면 위에서 바로 빠져나올 길이 없었다.
  dom.homeBtn.hidden = name === "library";
  // 인트로(헤드라인 + "방금 등록됐어요" 하이라이트)는 목록 화면의 것이다. 예전엔 책 상세나
  // 등록 폼에서도 그대로 위에 남아, 정작 보러 온 내용이 스크롤 한참 아래로 밀렸다.
  if (dom.headerIntro) dom.headerIntro.hidden = name !== "library";
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
  // 책 상세(/book/:id)와 프로필(/u/:닉네임)만 고유 URL을 갖고, 나머지 화면은 모두 "/"다.
  var path = "/";
  if (name === "detail" && state.currentId) path = "/book/" + encodeURIComponent(state.currentId);
  else if (name === "profile" && state.profileName) path = "/u/" + encodeURIComponent(state.profileName);
  else if (name === "recommend") path = "/recommend";
  if (window.location.pathname !== path) history.pushState(null, "", path);

  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

// prefillQuery를 주면 카카오 책 검색창을 그 말로 채우고 바로 검색까지 돌린다. 홈에서
// 검색했는데 등록된 책이 없어 "등록하러 가기"로 넘어온 경우, 방금 친 제목을 또 치게 하지
// 않으려는 것이다.
function openForm(prefillQuery) {
  dom.reviewForm.reset();
  state.selectedBook = null;
  state.formRating = 0;
  dom.bookSearchField.hidden = false;
  dom.selectedBookField.hidden = true;
  dom.bookResults.hidden = true;
  dom.bookResults.innerHTML = "";
  renderStars(dom.fStars, 0, true, selectFormRating);
  state.formMood = null;
  renderMoodPicker(dom.fMoods, null, selectFormMood);
  // 폼을 열 때마다 예시 문구를 하나 새로 뽑는다(같은 문구만 계속 보면 예시로 안 읽힌다).
  document.getElementById("fText").placeholder = pickReviewPlaceholder();
  if (AUTH_MODE === "nickname") document.getElementById("fNickname").value = getSavedNickname();
  showView("form");

  // reset()이 입력값을 비우므로 채우는 건 그 뒤여야 한다.
  var prefill = String(prefillQuery || "").trim();
  if (prefill) {
    dom.bookSearchInput.value = prefill;
    searchBooks(prefill);
  }
  dom.bookSearchInput.focus();
}

// 책 등록 화면으로 들어가는 공통 진입점. 헤더의 "+ 책장에 추가하기" 버튼과, 홈 검색이
// 비었을 때 뜨는 "등록하러 가기" 버튼이 같은 함수를 쓴다 — 로그인 모드일 때의 확인 절차가
// 한쪽에만 빠지는 일이 없도록 한곳에 모아둔다.
export function startBookRegistration(prefillQuery) {
  if (AUTH_MODE === "nickname") { openForm(prefillQuery); return; }
  if (!googleConfigured()) { alert("아직 Google 로그인이 설정되지 않았어요. 관리자에게 문의해주세요."); return; }
  if (!state.currentUser) { alert("먼저 오른쪽 위 'Google로 로그인' 버튼으로 로그인해주세요."); return; }
  openForm(prefillQuery);
}

// 닉네임 한 명분의 기록 화면으로 간다. 헤더의 내 닉네임과 한줄평의 남의 닉네임이 같은
// 함수를 쓴다 — 보는 대상만 다르고 화면은 하나다.
export function openProfile(nickname) {
  var name = String(nickname || "").trim();
  if (!name) return;
  gtag("event", "view_profile");
  state.profileName = name;
  // 먼저 빈 화면을 띄워두고 채운다. 응답을 기다린 뒤에 화면을 바꾸면 누른 직후 아무 반응이
  // 없어서 안 눌린 것처럼 느껴진다.
  state.profile = null;
  renderProfile();
  showView("profile");

  api("/api/nickname/" + encodeURIComponent(name) + "/reviews")
    .then(function (data) {
      // 기다리는 동안 다른 닉네임을 눌렀다면 늦게 온 응답은 버린다.
      if (state.profileName !== name) return;
      state.profile = data;
      renderProfile();
    })
    .catch(function (e) {
      if (state.profileName !== name) return;
      dom.profileSub.textContent = "불러오지 못했어요: " + e.message;
    });
}

// "나를 위한 추천" 화면. 이 브라우저에 저장된 닉네임(책·한줄평을 남길 때 쓴 그 이름)으로
// 조회한다. 닉네임이 아직 없으면 서버를 부를 것도 없이 안내 화면만 띄운다.
export function openRecommend() {
  gtag("event", "view_recommend");
  state.recommend = null;
  state.recommendReady = false;
  renderRecommend();
  showView("recommend");

  var name = getSavedNickname();
  if (!name) {
    // 아직 아무것도 안 남긴 첫 방문자. "불러오는 중"으로 두면 영영 안 끝나는 것처럼 보인다.
    state.recommendReady = true;
    renderRecommend();
    return;
  }

  api("/api/recommend/" + encodeURIComponent(name))
    .then(function (data) {
      // 기다리는 동안 다른 화면으로 옮겨갔다면 늦게 온 응답으로 화면을 덮지 않는다.
      if (state.view !== "recommend") return;
      state.recommend = data;
      state.recommendReady = true;
      renderRecommend();
    })
    .catch(function (e) {
      if (state.view !== "recommend") return;
      state.recommendReady = true;
      renderRecommend();
      dom.recommendSub.textContent = "불러오지 못했어요: " + e.message;
    });
}

export function openDetail(id) {
  state.currentId = id;
  state.comments = [];
  state.commentRating = 0;
  state.commentMood = null;
  state.openReplies = {};
  state.detailCoverAnimatePending = true;
  renderStars(dom.cStars, 0, true, selectCommentRating);
  renderMoodPicker(dom.cMoods, null, selectCommentMood);
  document.getElementById("commentInput").placeholder = pickReviewPlaceholder();
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

// 등록 권수가 50의 배수에 도달했을 때, 그리고 어떤 책이 galpi에 처음 등록됐을 때 보여주는
// 짧은 축하 연출. 두 이벤트는 같은 모달/타이머를 공유한다.
var milestoneHideTimer = null;

export function showCelebrationModal(message) {
  clearTimeout(milestoneHideTimer);
  dom.milestoneMessage.textContent = message;
  dom.milestoneOverlay.hidden = false;
  void dom.milestoneOverlay.offsetWidth;
  dom.milestoneOverlay.classList.add("show");
  milestoneHideTimer = setTimeout(hideMilestoneCelebration, 2200);
}

function showMilestoneCelebration(count) {
  showCelebrationModal(count + "번째 기록을 남겨주셨어요! 🎉");
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

dom.categoryFilter.addEventListener("change", function (e) {
  state.categoryFilter = e.target.value;
  gtag("event", "filter_category", { category: state.categoryFilter || "전체" });
  renderLibrary();
});

document.getElementById("newReviewBtn").addEventListener("click", function () {
  gtag("event", "click_add_book");
  startBookRegistration();
});
document.getElementById("cancelForm").addEventListener("click", function () { showView("library"); });
document.getElementById("feedbackBtn").addEventListener("click", function () {
  gtag("event", "click_feedback");
  document.getElementById("feedbackForm").reset();
  showView("feedback");
});
document.getElementById("cancelFeedback").addEventListener("click", function () { showView("library"); });
document.getElementById("homeBtn").addEventListener("click", function () { showView("library"); });
document.getElementById("recommendBtn").addEventListener("click", function () { openRecommend(); });
// 추천할 근거가 없을 때 뜨는 두 버튼. 기본은 책장으로 보내는 것이다 — 이미 등록된 책에
// 별점만 남겨도 추천은 돌아가므로, 등록을 먼저 요구할 이유가 없다.
document.getElementById("recommendCta").addEventListener("click", function () { showView("library"); });
// 찾는 책이 없을 때의 다음 단계. 헤더의 "+ 책장에 추가하기"와 같은 진입점을 써서
// 로그인 모드일 때의 확인 절차가 한쪽에만 빠지는 일이 없게 한다.
document.getElementById("recommendAddCta").addEventListener("click", function () { startBookRegistration(); });

// 닉네임으로 내 기록을 다시 집어오는 입구. 닉네임은 글을 남길 때만 이 브라우저에
// 저장되므로, 기기를 바꾸거나 저장소가 지워지면 기록은 서버에 그대로 있는데 이름만
// 잃어버린다. 그때 여기에 이름을 적으면 다시 이어진다.
//
// 적어넣은 이름을 곧바로 저장하지는 않는다. 그 이름으로 남긴 별점이 실제로 있을 때만
// 저장한다 — 오타를 신원으로 굳혀버리면 이후 화면들(헤더 닉네임, 내 기록, 레벨 점수)이
// 전부 빈 사람을 가리키게 되고, 사용자는 왜 그런지 알 방법이 없다.
dom.recommendClaim.addEventListener("submit", function (e) {
  e.preventDefault();
  var name = dom.recommendNickname.value.trim().slice(0, 10);
  if (!name) { dom.recommendNickname.focus(); return; }

  dom.recommendClaimMsg.textContent = "찾는 중...";
  api("/api/recommend/" + encodeURIComponent(name))
    .then(function (data) {
      if (!data.seedCount) {
        dom.recommendClaimMsg.textContent = "\"" + name + "\" 닉네임으로 남긴 별점이 없어요. 오타가 없는지 확인해주세요.";
        return;
      }
      saveNickname(name);
      renderAuthBox();      // 헤더의 닉네임 칩도 곧바로 그 이름으로 바뀐다
      refreshMyScore();
      gtag("event", "recommend_claim_nickname");
      dom.recommendClaimMsg.textContent = "";
      dom.recommendNickname.value = "";
      state.recommend = data;
      state.recommendReady = true;
      renderRecommend();
    })
    .catch(function (err) {
      dom.recommendClaimMsg.textContent = "불러오지 못했어요: " + err.message;
    });
});

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
    nickname = document.getElementById("fNickname").value.trim().slice(0, 10);
    if (!nickname) { alert("닉네임을 입력해주세요."); return; }
  }

  var text = document.getElementById("fText").value.trim();
  // 감정 태그를 골랐다면 한 줄 리뷰는 비워둘 수 있다(별점은 예전과 똑같이 필수).
  if (!text && !state.formMood) {
    alert("한 줄 리뷰를 쓰거나 위에서 태그를 골라주세요.");
    return;
  }
  if (state.formRating === 0) {
    alert("별점을 선택해주세요.");
    return;
  }

  if (AUTH_MODE === "nickname") saveNickname(nickname);

  api("/api/books", {
    method: "POST",
    body: {
      title: state.selectedBook.title, author: state.selectedBook.author, cover: state.selectedBook.cover,
      isbn: state.selectedBook.isbn, contents: state.selectedBook.contents, text: text, rating: state.formRating,
      mood: state.formMood, name: nickname
    }
  })
    .then(function (data) {
      // complete_review는 "한 줄 기록이 하나 남았다"는 총합이라 예전부터 쌓인 것과 이어지게
      // 그대로 둔다. 다만 이 이벤트는 새 책 등록과 기존 책 한줄평 두 곳에서 나가서, 그것만
      // 보면 click_add_book(등록 시도) 대비 완료율을 낼 수 없다 — 한줄평은 등록 버튼을
      // 거치지 않기 때문이다. 어느 쪽인지 알 수 있게 경로별 이벤트를 따로 하나 더 보낸다.
      gtag("event", "complete_review", { book_id: data.book.id });
      gtag("event", "complete_book_add", { book_id: data.book.id });
      renderAuthBox();
      refreshMyScore();
      state.books.unshift(normalizeBook(data.book));
      state.recentComments.unshift({
        bookId: data.book.id, bookTitle: data.book.title, bookAuthor: data.book.author,
        text: data.book.text, mood: data.book.mood || null, rating: data.book.rating_sum, createdAt: data.book.created_at
      });
      var totalCount = state.books.length;
      showView("library");
      renderLibrary();
      renderLatestHighlight();
      // 첫 등록자 축하와 N권째 기록 축하가 같은 순간에 겹칠 수 있는데, 같은 모달을
      // 동시에 두 번 못 띄우니 첫 등록자 쪽을 우선한다(더 개인적인 축하라서).
      if (data.firstRegistration) showCelebrationModal("이 책의 첫 번째 등록자예요! 🎉");
      else if (totalCount > 0 && totalCount % MILESTONE_STEP === 0) showMilestoneCelebration(totalCount);
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
    nickname = document.getElementById("cNickname").value.trim().slice(0, 10);
    if (!nickname) { alert("닉네임을 입력해주세요."); return; }
  }

  var input = document.getElementById("commentInput");
  var text = input.value.replace(/[\r\n]+/g, " ").trim();
  if (!text && !state.commentMood) {
    alert("한 줄 감상을 쓰거나 위에서 태그를 골라주세요.");
    return;
  }
  if (state.commentRating === 0) {
    alert("별점을 선택해주세요.");
    return;
  }

  if (AUTH_MODE === "nickname") saveNickname(nickname);

  api("/api/books/" + state.currentId + "/comments", {
    method: "POST",
    body: { text: text, rating: state.commentRating, mood: state.commentMood, name: nickname }
  })
    .then(function () {
      // 총합(complete_review)과 경로별(complete_comment)을 같이 보낸다 — 위 새 책 등록
      // 경로와 같은 이유다.
      gtag("event", "complete_review", { book_id: state.currentId });
      gtag("event", "complete_comment", { book_id: state.currentId });
      input.value = "";
      input.placeholder = pickReviewPlaceholder();
      state.commentRating = 0;
      state.commentMood = null;
      renderStars(dom.cStars, 0, true, selectCommentRating);
      renderMoodPicker(dom.cMoods, null, selectCommentMood);
      renderAuthBox();
      refreshMyScore();
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
  refreshMyScore();
}

function bookIdFromPath(pathname) {
  var m = pathname.match(/^\/book\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function nicknameFromPath(pathname) {
  var m = pathname.match(/^\/u\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// 헤더가 두 줄로 접히는 폭(모바일·태블릿)에서 의미가 있는 스크롤 방향 기반 헤더
// 숨김/노출 (css/style.css의 @media (max-width: 900px) .sticky-header.header-hidden
// 규칙에서만 실제로 보이므로, PC 폭에서는 클래스가 붙어도 시각적으로 아무 효과가 없다
// — 뷰포트 분기를 여기서 따로 할 필요가 없다). 헤더 높이만큼 스크롤하기 전까지는
// 숨기지 않고, 위로 스크롤하면 즉시 다시 보여준다.
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

function isRecommendPath(pathname) {
  return /^\/recommend\/?$/.test(pathname);
}

window.addEventListener("popstate", function () {
  var id = bookIdFromPath(window.location.pathname);
  if (id) { openDetail(id); return; }
  var who = nicknameFromPath(window.location.pathname);
  if (who) { openProfile(who); return; }
  if (isRecommendPath(window.location.pathname)) { openRecommend(); return; }
  showView("library");
});

var initialBookId = bookIdFromPath(window.location.pathname);
var initialNickname = nicknameFromPath(window.location.pathname);
if (initialBookId) openDetail(initialBookId);
else if (initialNickname) openProfile(initialNickname);
else if (isRecommendPath(window.location.pathname)) openRecommend();
else showView("library");

refreshBooks();

// PWA 서비스워커 등록. 새 워커가 설치되고 나서(즉 배포로 파일이 바뀌어서
// 대기 상태가 되었을 때) 안내 배너를 띄워 새로고침을 유도한다.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").then(function (registration) {
      registration.addEventListener("updatefound", function () {
        var installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", function () {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(registration.waiting);
          }
        });
      });
    }).catch(function (err) {
      console.warn("서비스워커 등록 실패:", err);
    });

    var reloadedAfterUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloadedAfterUpdate) return;
      reloadedAfterUpdate = true;
      window.location.reload();
    });
  });
}

function showUpdateBanner(waitingWorker) {
  if (document.getElementById("swUpdateBanner")) return;

  var banner = document.createElement("div");
  banner.id = "swUpdateBanner";
  banner.className = "sw-update-banner";
  banner.innerHTML =
    '<span>새로운 버전이 있어요.</span>' +
    '<button type="button" class="sw-update-banner__btn">새로고침</button>';

  banner.querySelector(".sw-update-banner__btn").addEventListener("click", function () {
    if (waitingWorker) waitingWorker.postMessage("SKIP_WAITING");
    banner.remove();
  });

  document.body.appendChild(banner);
}
refreshNotifications();
