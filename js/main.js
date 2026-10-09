import {
  googleConfigured, api, refreshBooks, refreshFeatured, refreshComments, refreshNotifications, refreshMyScore,
  getSavedNickname, saveNickname, linkMyRecords, normalizeBook, initGoogleSignIn, searchBooks, renderGoogleButtons,
  isAdminMode, getAdminKey, clearAdminKey, verifyAdminKey
} from "./api.js";
import {
  renderStars, renderLibrary, renderDetail, renderRateCard, renderMyShelf, renderAuthBox,
  clearSelectedBook, renderBookResults, renderSiteSearch, findBook, renderRandomCard, bookRating, formatDate,
  toggleNotifDropdown, closeNotifDropdown, renderMoodPicker, renderProfile,
  renderRecommend, renderRecommendScan, renderRecommendSteps, renderLevelGuide, renderLevelRanking, buildIcon
} from "./render.js";
import { initCollage, openCollage } from "./collage.js";

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
  // 등급 안내 팝업의 "9명 중 3위". 기록이 없는 닉네임이면 myRank가 null이다.
  myRank: null,
  myTotal: 0,
  // 표지 모음 이미지 화면(js/collage.js). picked는 고른 책, results는 카카오 검색 결과.
  collage: {
    picked: [],
    results: [],
    top: "",
    bottom: "",
    ratio: "portrait",
    style: "grid",
    bg: "#f3eee6",
    note: ""
  },
  books: [],
  booksLoaded: false,
  // 홈 "오늘의 한 줄"(js/api.js refreshFeatured). reviews는 후보 5개, pickId는 이번 접속에
  // 보여줄 하나, pinnedIds는 관리자 고정 버튼 표시용.
  featured: { reviews: [], pinnedIds: [], pickId: null },
  comments: [],
  libraryPollTimer: null,
  detailPollTimer: null,
  view: "library",
  currentId: null,
  // 책 상세: 이 기기가 이 책에 남긴 평가({rating,text,mood,name})와 읽고 싶어요 상태.
  // refreshComments가 채우고, 별·버튼을 누르면 응답을 기다리지 않고 먼저 바꾼다(mySeq로
  // 그 사이 출발한 폴링 응답이 되돌리지 못하게).
  my: null,
  wanted: false,
  wantCount: 0,
  mySeq: 0,
  ratePop: 0,
  lineMood: null,
  // 내 책장(/my): 서버에서 받은 { rated, wants }(아직 안 왔으면 null)와 보고 있는 탭.
  myShelf: null,
  myShelfTab: "rated",
  formRating: 0,
  // 고른 감정 태그 id (js/moodTags.js). 고르지 않았으면 null — 선택 항목이다.
  formMood: null,
  selectedBook: null,
  // 프로필 화면에서 보고 있는 닉네임과, 서버에서 받아온 그 사람의 기록. 아직 안 왔으면 null.
  profileName: null,
  profile: null,
  // "나를 위한 추천" 화면의 응답. 아직 안 왔으면 null, 닉네임이 없어 아예 조회를 못 한
  // 경우는 recommendReady만 true가 되고 recommend는 null로 남는다.
  // 한 줄 남기기 시트의 카카오 검색 결과. 검색창의 말이 query와 다르면(그 뒤로 더 쳤으면)
  // 낡은 결과라 쓰지 않는다. results가 null이면 아직 검색 버튼을 안 누른 것이다.
  bookSearch: { query: "", results: null },
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
  // 답글창의 닉네임 입력값도 같은 이유로 기억해둔다. 예전에는 다시 그릴 때마다
  // 저장된 닉네임으로 덮어썼는데, 아직 닉네임을 저장한 적 없는 사람은 8초마다 빈 칸이
  // 되어 글자를 칠 수가 없었다.
  openReplyNames: {},
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
  searchSheet: document.getElementById("searchSheet"),
  searchSheetClose: document.getElementById("searchSheetClose"),
  siteSearchInput: document.getElementById("siteSearchInput"),
  siteSearchResults: document.getElementById("siteSearchResults"),
  themeBtn: document.getElementById("themeBtn"),
  genreChips: document.getElementById("genreChips"),
  featuredSection: document.getElementById("featuredSection"),
  featuredTrack: document.getElementById("featuredTrack"),
  libraryView: document.getElementById("libraryView"),
  libraryToolbar: document.getElementById("libraryToolbar"),
  writeSheet: document.getElementById("writeSheet"),
  writeSheetClose: document.getElementById("writeSheetClose"),
  writeFields: document.getElementById("writeFields"),
  writeSubmit: document.getElementById("writeSubmit"),
  writeMore: document.getElementById("writeMore"),
  nicknameLine: document.getElementById("nicknameLine"),
  nicknameLineName: document.getElementById("nicknameLineName"),
  nicknameInputWrap: document.getElementById("nicknameInputWrap"),
  selectedBookNote: document.getElementById("selectedBookNote"),
  detailView: document.getElementById("detailView"),
  randomView: document.getElementById("randomView"),
  feedbackView: document.getElementById("feedbackView"),
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
  randomStreakMsg: document.getElementById("randomStreakMsg"),
  milestoneOverlay: document.getElementById("milestoneOverlay"),
  milestoneMessage: document.getElementById("milestoneMessage"),
  headerIntro: document.getElementById("headerIntro"),
  stickyHeader: document.getElementById("stickyHeader"),
  fMoods: document.getElementById("fMoods"),
  recommendView: document.getElementById("recommendView"),
  recommendAnalyze: document.getElementById("recommendAnalyze"),
  recommendScanTrack: document.getElementById("recommendScanTrack"),
  recommendSteps: document.getElementById("recommendSteps"),
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
  profileReviewCount: document.getElementById("profileReviewCount"),
  collageView: document.getElementById("collageView"),
  collageShelf: document.getElementById("collageShelf"),
  collageResults: document.getElementById("collageResults"),
  collageSearch: document.getElementById("collageSearch"),
  collageSearchBtn: document.getElementById("collageSearchBtn"),
  collagePicked: document.getElementById("collagePicked"),
  collagePickedCount: document.getElementById("collagePickedCount"),
  collagePickedStrip: document.getElementById("collagePickedStrip"),
  collageTop: document.getElementById("collageTop"),
  collageBottom: document.getElementById("collageBottom"),
  collageRatio: document.getElementById("collageRatio"),
  collageStyle: document.getElementById("collageStyle"),
  collageBg: document.getElementById("collageBg"),
  collageOut: document.getElementById("collageOut"),
  collageSaveBtn: document.getElementById("collageSaveBtn"),
  collageNote: document.getElementById("collageNote"),
  levelGuide: document.getElementById("levelGuide"),
  levelGuideClose: document.getElementById("levelGuideClose"),
  levelGuideBack: document.getElementById("levelGuideBack"),
  levelGuideTitle: document.getElementById("levelGuideTitle"),
  levelGuideBody: document.getElementById("levelGuideBody"),
  levelRankingBody: document.getElementById("levelRankingBody"),
  levelProgress: document.getElementById("levelProgress"),
  levelRuleList: document.getElementById("levelRuleList"),
  levelTable: document.getElementById("levelTable"),
  scoreToast: document.getElementById("scoreToast"),
  lineSheet: document.getElementById("lineSheet"),
  lineForm: document.getElementById("lineForm"),
  lineMoods: document.getElementById("lineMoods"),
  lineText: document.getElementById("lineText"),
  lineNickLine: document.getElementById("lineNickLine"),
  lineNickName: document.getElementById("lineNickName"),
  lineNickInputWrap: document.getElementById("lineNickInputWrap"),
  lineNickInput: document.getElementById("lineNickInput"),
  actionToast: document.getElementById("actionToast"),
  actionToastText: document.getElementById("actionToastText"),
  actionToastBtn: document.getElementById("actionToastBtn"),
  myShelfView: document.getElementById("myShelfView")
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

// 별점이 유일한 필수 항목이라, 별점을 누르는 순간 나머지(태그·한 줄·닉네임)를 펼친다.
function selectFormRating(idx) {
  state.formRating = idx;
  renderStars(dom.fStars, state.formRating, true, selectFormRating);
  dom.writeMore.hidden = false;
  syncWriteSubmit();
}

// 저장 버튼은 모바일(시트 바닥에 고정된 바)에서만 별점 전에 꺼둔다 — 좁은 화면에선 꺼진
// 버튼이 "별점부터"라는 안내 노릇을 한다. PC는 화면이 넓어 별점 칸이 바로 눈에 들어오니
// 켜두고, 별점 없이 누르면 제출 단계의 "별점을 선택해주세요"가 알려준다.
var writeMobileMQ = window.matchMedia("(max-width: 640px)");
function syncWriteSubmit() {
  dom.writeSubmit.disabled = state.formRating === 0 && writeMobileMQ.matches;
}
if (writeMobileMQ.addEventListener) writeMobileMQ.addEventListener("change", syncWriteSubmit);

// 닉네임이 이 브라우저에 저장돼 있으면 입력칸 대신 "○○ 님으로 남겨요 · 변경" 한 줄로.
function renderNicknameRow(editing) {
  var saved = AUTH_MODE === "nickname" ? getSavedNickname() : "";
  var showLine = !!saved && !editing;
  dom.nicknameLine.hidden = !showLine;
  dom.nicknameInputWrap.hidden = showLine;
  dom.nicknameLineName.textContent = saved;
}

function selectFormMood(id) {
  state.formMood = id;
  renderMoodPicker(dom.fMoods, state.formMood, selectFormMood);
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
  // 책 상세를 떠나면 그 책의 한 줄 시트도 닫는다(뒤로가기 등).
  if (name !== "detail") closeLineSheet();
  dom.libraryView.hidden = name !== "library";
  dom.libraryToolbar.hidden = name !== "library";
  dom.detailView.hidden = name !== "detail";
  dom.randomView.hidden = name !== "random";
  dom.feedbackView.hidden = name !== "feedback";
  dom.profileView.hidden = name !== "profile";
  dom.recommendView.hidden = name !== "recommend";
  dom.collageView.hidden = name !== "collage";
  dom.myShelfView.hidden = name !== "myShelf";
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
  else if (name === "collage") path = "/collage";
  else if (name === "myShelf") path = "/my";
  if (window.location.pathname !== path) history.pushState(null, "", path);

  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

// "한 줄 남기기" 시트를 연다. prefillQuery를 주면 검색창을 그 말로 채우고 바로 검색까지
// 돌린다. 홈에서 검색했는데 등록된 책이 없어 "이 제목으로 등록하기"로 넘어온 경우, 방금
// 친 제목을 또 치게 하지 않으려는 것이다.
//
// 예전엔 별도 화면(showView("form"))이었다. 지금은 보던 화면 위에 시트로 뜨고, 닫으면
// 보던 화면 그대로다 — 이미 있는 책에 한 줄을 남기는 경우엔 페이지를 옮길 이유가 없다.
var writeSheetOpener = null;

function openForm(prefillQuery) {
  dom.reviewForm.reset();
  clearSelectedBook();
  state.bookSearch = { query: "", results: null };
  dom.bookResults.hidden = true;
  dom.bookResults.innerHTML = "";
  state.formRating = 0;
  renderStars(dom.fStars, 0, true, selectFormRating);
  dom.writeMore.hidden = true;
  syncWriteSubmit();
  state.formMood = null;
  renderMoodPicker(dom.fMoods, null, selectFormMood);
  // 폼을 열 때마다 예시 문구를 하나 새로 뽑는다(같은 문구만 계속 보면 예시로 안 읽힌다).
  document.getElementById("fText").placeholder = pickReviewPlaceholder();
  if (AUTH_MODE === "nickname") document.getElementById("fNickname").value = getSavedNickname();
  renderNicknameRow(false);

  writeSheetOpener = document.activeElement;
  dom.writeSheet.hidden = false;
  void dom.writeSheet.offsetWidth;
  dom.writeSheet.classList.add("show");

  // reset()이 입력값을 비우므로 채우는 건 그 뒤여야 한다.
  var prefill = String(prefillQuery || "").trim();
  if (prefill) {
    dom.bookSearchInput.value = prefill;
    renderBookResults();
    searchBooks(prefill);
  }
  dom.bookSearchInput.focus();
}

// 쓰던 내용이 있으면 바깥을 잘못 눌러 날아가지 않게 한 번 묻는다.
function writeSheetDirty() {
  if (!state.selectedBook) return false;
  return !!(document.getElementById("fText").value.trim() || state.formRating || state.formMood);
}

export function closeWriteSheet(force) {
  if (dom.writeSheet.hidden) return;
  if (!force && writeSheetDirty() && !confirm("쓰던 한 줄이 사라져요. 닫을까요?")) return;
  dom.writeSheet.classList.remove("show");
  setTimeout(function () { dom.writeSheet.hidden = true; }, 220);
  if (writeSheetOpener && writeSheetOpener.focus) writeSheetOpener.focus();
  writeSheetOpener = null;
}

// 한 줄 남기기 시트로 들어가는 공통 진입점. 헤더의 "한 줄 남기기" 버튼과, 홈 검색이
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
// 내 책장(/my). 이 기기가 평가한 책과 읽고 싶은 책 — 닉네임이 없어도 열린다. 먼저 갖고 있는
// 값(없으면 "불러오는 중")으로 그리고 새로 받아 고친다.
export function openMyShelf(tab) {
  if (tab) state.myShelfTab = tab;
  gtag("event", "view_my_shelf", { tab: state.myShelfTab });
  renderMyShelf();
  showView("myShelf");
  api("/api/my-shelf")
    .then(function (data) {
      state.myShelf = { rated: data.rated || [], wants: data.wants || [] };
      if (state.view === "myShelf") renderMyShelf();
    })
    .catch(function (e) {
      if (state.view !== "myShelf") return;
      document.getElementById("myShelfSub").textContent = "불러오지 못했어요: " + e.message;
    });
}

["myTabRated", "myTabWants"].forEach(function (id) {
  document.getElementById(id).addEventListener("click", function (e) {
    state.myShelfTab = e.currentTarget.dataset.tab;
    renderMyShelf();
  });
});

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
//
// 닉네임이 있으면 결과를 바로 펼치지 않고 "기록을 살펴보는 중" 화면을 먼저 보여준다.
// 응답은 대개 순식간에 오지만, 그러면 무엇을 보고 골랐는지 느낄 틈 없이 책 두 권이
// 툭 떨어져 "아무 책이나 띄운 것"처럼 읽힌다. 첫 줄(별점 확인)은 실제 응답을 기다렸다가
// 받은 별점 개수로 바꿔 적고, 나머지 줄은 짧은 간격으로 넘긴다.
var recommendRun = 0;
var RECOMMEND_FIRST_STEP_MS = 900;
var RECOMMEND_STEP_MS = 600;

function waitMs(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

export function openRecommend() {
  gtag("event", "view_recommend");
  var run = ++recommendRun;
  state.recommend = null;
  state.recommendReady = false;

  var name = getSavedNickname();
  if (!name) {
    // 아직 아무것도 안 남긴 첫 방문자. "불러오는 중"으로 두면 영영 안 끝나는 것처럼 보인다.
    state.recommendReady = true;
    renderRecommend();
    showView("recommend");
    return;
  }

  var count = state.books.length;
  var steps = [
    name + "님의 별점과 기록을 확인하는 중...",
    "좋아하신 작가와 분류를 살펴보는 중...",
    count ? "책장에 꽂힌 " + count + "권과 맞춰보는 중..." : "책장의 책들과 맞춰보는 중...",
    "어울리는 책을 고르는 중..."
  ];
  renderRecommend();
  renderRecommendScan();
  renderRecommendSteps(steps, 0);
  showView("recommend");

  // 기다리는 동안 다른 화면으로 옮겨갔거나 추천을 다시 눌렀다면 늦게 끝난 쪽은 버린다.
  function stale() { return run !== recommendRun || state.view !== "recommend"; }

  function finish(res) {
    if (stale()) return;
    state.recommend = res.data || null;
    state.recommendReady = true;
    renderRecommend();
    if (res.error) dom.recommendSub.textContent = "불러오지 못했어요: " + res.error.message;
  }

  var fetched = api("/api/recommend/" + encodeURIComponent(name)).then(
    function (data) { return { data: data }; },
    function (e) { return { error: e }; }
  );

  Promise.all([fetched, waitMs(RECOMMEND_FIRST_STEP_MS)]).then(function (arr) {
    var res = arr[0];
    if (stale()) return;
    var data = res.data;
    // 실패했거나 별점이 모자라 고를 게 없으면 "작가와 분류를 살펴보는 중"을 이어가는 건
    // 거짓말이 된다. 그 자리에서 바로 안내로 넘어간다.
    if (!data || !data.seedCount || data.seedCount < (data.minRatings || 0)) { finish(res); return; }

    steps[0] = name + "님의 별점 " + data.seedCount + "개를 확인했어요";
    var step = 1;
    (function next() {
      if (stale()) return;
      renderRecommendSteps(steps, step);
      if (step > steps.length - 1) { waitMs(300).then(function () { finish(res); }); return; }
      step++;
      waitMs(RECOMMEND_STEP_MS).then(next);
    })();
  });
}

export function openDetail(id) {
  state.currentId = id;
  state.comments = [];
  state.my = null;
  state.wanted = false;
  state.wantCount = 0;
  state.mySeq++;
  state.openReplies = {};
  state.openReplyNames = {};
  state.detailCoverAnimatePending = true;
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

// ── 등급 안내 ───────────────────────────────────────────────────────────────
//
// 등급/점수 시스템은 진작 있었는데(functions/_lib/scores.js가 계산, js/levels.js가 표)
// 헤더 뱃지에 "14 [책갈피 큐레이터] 이과생"이라고 떠 있는 게 전부라, 처음 온 사람은
// 저게 무슨 숫자인지도 몰랐다. 여기서 여는 팝업이 배점과 20단계 표를 한 번에 보여준다.
// 점수를 새로 매기지는 않는다 — 있는 값을 읽어서 그리기만 한다.

// 팝업을 열기 직전의 포커스. 닫을 때 그 자리로 돌려놔야 키보드로 쓰던 사람이 길을 잃지 않는다.
var levelGuideOpener = null;

export function openLevelGuide(from) {
  levelGuideOpener = document.activeElement;
  showLevelGuidePage("guide");
  renderLevelGuide();
  dom.levelGuide.hidden = false;
  void dom.levelGuide.offsetWidth;
  dom.levelGuide.classList.add("show");
  dom.levelGuideClose.focus();

  // 20줄짜리 표라 내 등급이 표 아래쪽에 숨어 있기 쉽다. 열자마자 내 줄이 가운데
  // 오도록 표를 스크롤한다 — scrollIntoView를 쓰면 팝업 전체가 같이 밀려 올라가서
  // 맨 위의 진행 바가 안 보이므로, 표 자신의 scrollTop만 움직인다.
  var current = dom.levelTable.querySelector(".is-current");
  if (current) {
    dom.levelTable.scrollTop = Math.max(
      0,
      current.offsetTop - dom.levelTable.clientHeight / 2 + current.offsetHeight / 2
    );
  }

  gtag("event", "open_level_guide", { from: from || "unknown" });

  // 순위는 남이 기록해도 바뀌므로, 오래 열어둔 탭에서는 내 점수보다 먼저 낡는다.
  // 열자마자 한 번 다시 받아오되, 화면은 이미 갖고 있는 값으로 먼저 그려둔다 —
  // 응답을 기다렸다 그리면 팝업이 빈 채로 떴다가 채워진다.
  var shownScore = state.myScore;
  var shownRank = state.myRank;
  var shownTotal = state.myTotal;
  refreshMyScore().then(function () {
    if (dom.levelGuide.hidden) return;
    if (state.myScore === shownScore && state.myRank === shownRank && state.myTotal === shownTotal) return;
    // 표를 훑던 중이었을 수 있으므로 스크롤 위치는 그대로 돌려놓는다.
    var scrolled = dom.levelTable.scrollTop;
    renderLevelGuide();
    dom.levelTable.scrollTop = scrolled;
  });
}

export function closeLevelGuide() {
  if (dom.levelGuide.hidden) return;
  dom.levelGuide.classList.remove("show");
  setTimeout(function () { dom.levelGuide.hidden = true; }, 220);
  if (levelGuideOpener && levelGuideOpener.focus) levelGuideOpener.focus();
  levelGuideOpener = null;
}

// 팝업 안에서 "등급 안내"와 "전체 순위" 두 화면을 갈아 끼운다. 새 팝업을 겹쳐 띄우면
// 모바일에서 닫는 법부터 헷갈리고, 뒤에 깔린 시트가 반쯤 보여 지저분하다.
export function showLevelGuidePage(page) {
  var ranking = page === "ranking";
  dom.levelGuideBody.hidden = ranking;
  dom.levelRankingBody.hidden = !ranking;
  dom.levelGuideBack.hidden = !ranking;
  dom.levelGuideTitle.textContent = ranking ? "전체 순위" : "등급 안내";
  // 화면이 바뀌었는데 스크롤이 남아 있으면 가운데부터 시작한 것처럼 보인다.
  (ranking ? dom.levelRankingBody : dom.levelGuideBody).scrollTop = 0;
}

export function openLevelRanking() {
  showLevelGuidePage("ranking");
  renderLevelRanking();
  dom.levelGuideBack.focus();
  gtag("event", "open_level_ranking");
}

dom.levelGuideBack.addEventListener("click", function () {
  showLevelGuidePage("guide");
  dom.levelGuideClose.focus();
});

dom.levelGuideClose.addEventListener("click", closeLevelGuide);
// 바깥(어두운 배경)을 눌러도 닫는다. 패널 안쪽 클릭까지 닫히면 표를 훑다 말고 사라진다.
dom.levelGuide.addEventListener("click", function (e) {
  if (e.target === dom.levelGuide) closeLevelGuide();
});
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape" || dom.levelGuide.hidden) return;
  // 전체 순위를 보던 중이면 한 단계만 되돌린다 — 곧바로 닫히면 등급 안내로 돌아갈
  // 길이 없어지고, 보통 "뒤로"를 기대한다.
  if (!dom.levelRankingBody.hidden) {
    showLevelGuidePage("guide");
    dom.levelGuideClose.focus();
    return;
  }
  closeLevelGuide();
});

document.getElementById("levelGuideLink").addEventListener("click", function () { openLevelGuide("footer"); });

// ── 점수·승급 토스트 ────────────────────────────────────────────────────────
//
// 축하 모달(가운데 큰 팝업)과 일부러 다른 자리를 쓴다. 기록을 남길 때마다 화면 한가운데가
// 막히면 방금 쓴 글을 확인하지 못하고, 모바일에서는 특히 답답하다.
var scoreToastTimer = null;

export function showScoreToast(text, iconName) {
  clearTimeout(scoreToastTimer);
  hideActionToast();
  dom.scoreToast.innerHTML = "";
  if (iconName) dom.scoreToast.appendChild(buildIcon(iconName, "lv-icon lv-icon--" + iconName));
  var label = document.createElement("span");
  label.className = "score-toast-text";
  label.textContent = text;
  dom.scoreToast.appendChild(label);

  // 누를 수 있다는 표시. 글자로 "등급 보기"까지 붙이면 알약이 두 줄로 접히는 폭이
  // 생겨서, 링크에 흔히 쓰는 홑화살괄호 하나로만 알린다.
  var chevron = document.createElement("span");
  chevron.className = "score-toast-more";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "›";
  dom.scoreToast.appendChild(chevron);

  dom.scoreToast.hidden = false;
  void dom.scoreToast.offsetWidth;
  dom.scoreToast.classList.add("show");
  // 누를 수 있게 된 뒤로는 조금 더 오래 둔다 — 2.6초는 읽고 손을 올리기에 짧았다.
  scoreToastTimer = setTimeout(hideScoreToast, 3500);
}

function hideScoreToast() {
  clearTimeout(scoreToastTimer);
  dom.scoreToast.classList.remove("show");
  setTimeout(function () { dom.scoreToast.hidden = true; }, 260);
}

// "+3점!"이 눈앞에 뜬 순간이 "점수가 뭔데?"가 가장 궁금한 때다. 가만히 있는 사람을
// 헤더 뱃지로 끌어오는 것보다, 궁금해진 사람 앞에 입구를 놓는 편이 훨씬 잘 눌린다.
dom.scoreToast.addEventListener("click", function () {
  hideScoreToast();
  openLevelGuide("toast");
});

// ── 별점·읽고 싶어요 알림 띠 ────────────────────────────────────────────────
//
// "한 줄도 남겨볼래요?" 시트(<dialog>)가 떠 있는 동안에도 그 위에 보여야 한다. 모달 dialog는
// 최상위 층에 올라가서 z-index로는 못 이기므로, popover를 아는 브라우저에서는 이것도 popover로
// 최상위 층에 올린다(나중에 연 쪽이 위). 모르면 그냥 fixed로 띄운다(시트 뒤로 가려질 수 있음).
var actionToastTimer = null;
var actionToastHandler = null;
var actionToastPopover = typeof dom.actionToast.showPopover === "function";
if (actionToastPopover) {
  dom.actionToast.setAttribute("popover", "manual");
  dom.actionToast.hidden = false;
}

// action: { label, onClick } — onClick이 없으면 누를 수 없는 글자(예: "내 책장 1/3")다.
export function showActionToast(textNodes, action) {
  clearTimeout(actionToastTimer);
  hideScoreToast();
  dom.actionToastText.innerHTML = "";
  (Array.isArray(textNodes) ? textNodes : [textNodes]).forEach(function (n) {
    dom.actionToastText.appendChild(typeof n === "string" ? document.createTextNode(n) : n);
  });
  actionToastHandler = action && action.onClick ? action.onClick : null;
  dom.actionToastBtn.hidden = !action;
  dom.actionToastBtn.textContent = action ? action.label : "";
  dom.actionToastBtn.disabled = !actionToastHandler;

  if (actionToastPopover) {
    // 이미 떠 있으면 한 번 내렸다 올려야 다시 맨 위(시트보다 위)로 온다.
    try { dom.actionToast.hidePopover(); } catch (e) {}
    try { dom.actionToast.showPopover(); } catch (e) {}
  } else {
    dom.actionToast.hidden = false;
  }
  void dom.actionToast.offsetWidth;
  dom.actionToast.classList.add("show");
  actionToastTimer = setTimeout(hideActionToast, 3500);
}

function hideActionToast() {
  clearTimeout(actionToastTimer);
  dom.actionToast.classList.remove("show");
  setTimeout(function () {
    if (dom.actionToast.classList.contains("show")) return;
    if (actionToastPopover) { try { dom.actionToast.hidePopover(); } catch (e) {} }
    else dom.actionToast.hidden = true;
  }, 240);
}

dom.actionToastBtn.addEventListener("click", function () {
  var handler = actionToastHandler;
  hideActionToast();
  if (handler) handler();
});

// ── 책 상세: 별점 바로 저장 ─────────────────────────────────────────────────
//
// 별을 누르면 그 자리에서 저장한다(닉네임 없어도 됨 — 이 브라우저의 X-Anon-Id로). 같은 기기는
// 책당 평가 하나라 다시 누르면 고친다. 아직 한 줄이 없는 평가면 "한 줄도 남겨볼래요?" 시트를
// 올리고, 이미 한 줄이 있으면(별점만 고치는 것) 시트 없이 알림만.
var MY_SHELF_GOAL = 3;

function starText(n) {
  var span = document.createElement("span");
  span.className = "toast-stars";
  span.textContent = "★★★★★".slice(0, n);
  return span;
}

export function rateBook(n) {
  var bookId = state.currentId;
  if (!bookId) return;
  var prev = state.my;
  var hadLine = !!(prev && (String(prev.text || "").trim() || prev.mood));
  state.mySeq++;
  state.my = Object.assign({}, prev || {}, { rating: n });
  state.ratePop = n;
  renderRateCard();
  if (!hadLine) openLineSheet();

  var nickname = AUTH_MODE === "nickname" ? getSavedNickname() : "";
  var body = { rating: n };
  if (nickname) body.name = nickname;
  api("/api/books/" + encodeURIComponent(bookId) + "/mine", { method: "PUT", body: body })
    .then(function (res) {
      if (state.currentId === bookId) {
        state.my = res.review;
        renderRateCard();
      }
      var count = res.ratedCount || 0;
      showActionToast(
        ["별점을 남겼어요 · ", starText(n)],
        count >= MY_SHELF_GOAL
          ? { label: "내 책장 한 컷 만들기 ›", onClick: function () { closeLineSheet(); openCollage(); } }
          : { label: "내 책장 " + count + "/" + MY_SHELF_GOAL, onClick: function () { closeLineSheet(); openMyShelf("rated"); } }
      );
      // 평균 별점·"평가 N"이 바뀌었다. 점수는 닉네임이 있을 때만 붙고(별점만 1점) 토스트는
      // 띄우지 않는다 — 방금 뜬 알림 띠를 덮는다.
      refreshBooks();
      if (res.points) refreshMyScore();
    })
    .catch(function (e) {
      if (state.currentId === bookId) {
        state.mySeq++;
        state.my = prev;
        renderRateCard();
      }
      closeLineSheet();
      alert(e.message);
    });
}

// ── 책 상세: "한 줄도 남겨볼래요?" 시트 ──────────────────────────────────────
//
// 별점은 이미 저장돼 있다. 여기서 남기면 같은 평가 행에 태그·한 줄·닉네임이 합쳐진다.
// 태그나 한 줄은 남들에게 보이는 기록이라 닉네임이 있어야 한다.
var lineMoodTouched = false;

function selectLineMood(id) {
  state.lineMood = id;
  lineMoodTouched = true;
  renderMoodPicker(dom.lineMoods, state.lineMood, selectLineMood);
}

function renderLineNickname(editing) {
  var saved = AUTH_MODE === "nickname" ? getSavedNickname() : "";
  var showLine = !!saved && !editing;
  dom.lineNickLine.hidden = !showLine;
  dom.lineNickInputWrap.hidden = showLine;
  dom.lineNickName.textContent = saved;
  dom.lineNickInput.value = editing ? saved : "";
}

function openLineSheet() {
  if (dom.lineSheet.open) return;
  var my = state.my || {};
  // 옛 목록의 태그(감동적이었어요 등)는 고르는 칸에 없다. 손대지 않으면 그대로 두려고,
  // 고른 값과 "건드렸는지"를 따로 둔다.
  state.lineMood = my.mood || null;
  lineMoodTouched = false;
  renderMoodPicker(dom.lineMoods, state.lineMood, selectLineMood);
  dom.lineText.value = my.text || "";
  renderLineNickname(false);
  if (typeof dom.lineSheet.showModal === "function") dom.lineSheet.showModal();
  else dom.lineSheet.setAttribute("open", "");
  // 열자마자 칸에 초점을 주면 휴대폰 키보드가 튀어 올라 태그가 가려진다. 시트 자체에 둔다.
  dom.lineForm.setAttribute("tabindex", "-1");
  dom.lineForm.focus({ preventScroll: true });
}

function closeLineSheet() {
  if (!dom.lineSheet.open) return;
  if (typeof dom.lineSheet.close === "function") dom.lineSheet.close();
  else dom.lineSheet.removeAttribute("open");
}

document.getElementById("lineSkip").addEventListener("click", closeLineSheet);
document.getElementById("lineNickChange").addEventListener("click", function () {
  renderLineNickname(true);
  dom.lineNickInput.focus();
});
// 어두운 바깥을 누르면 닫는다(별점만 남긴 것과 같다).
dom.lineSheet.addEventListener("click", function (e) {
  if (e.target === dom.lineSheet) closeLineSheet();
});

dom.lineForm.addEventListener("submit", function (e) {
  e.preventDefault();
  var bookId = state.currentId;
  var my = state.my;
  if (!bookId || !my || !my.rating) { closeLineSheet(); return; }

  var text = dom.lineText.value.replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  var mood = lineMoodTouched ? state.lineMood : (my.mood || null);
  if (!text && !mood) {
    alert("태그를 고르거나 한 줄을 써주세요. 별점만 남기려면 아래 \"별점만 남길게요\"를 눌러주세요.");
    return;
  }

  var nickname = dom.lineNickInputWrap.hidden ? getSavedNickname() : dom.lineNickInput.value.trim().slice(0, 10);
  if (!nickname) {
    alert("닉네임을 정해주세요.");
    dom.lineNickInput.focus();
    return;
  }
  saveNickname(nickname);

  var submitBtn = document.getElementById("lineSubmit");
  submitBtn.disabled = true;
  api("/api/books/" + encodeURIComponent(bookId) + "/mine", {
    method: "PUT",
    body: { rating: my.rating, text: text, mood: mood, name: nickname }
  })
    .then(function (res) {
      submitBtn.disabled = false;
      // 기존 GA(리뷰 완료 총합·상세 경로)는 그대로 보낸다 — 이 시트가 상세의 한 줄 칸을 대신한다.
      gtag("event", "complete_review", { book_id: bookId, from: "line_sheet" });
      gtag("event", "complete_comment", { book_id: bookId, from: "line_sheet" });
      state.mySeq++;
      state.my = res.review;
      closeLineSheet();
      renderAuthBox();
      refreshMyScore(res.points > 0 ? res.points : undefined);
      return Promise.all([refreshBooks(), refreshComments()]);
    })
    .catch(function (err) {
      submitBtn.disabled = false;
      alert(err.message);
    });
});

// ── 책 상세: 읽고 싶어요 ────────────────────────────────────────────────────
//
// 누르면 담기고 다시 누르면 빠진다. 더 묻는 것 없이 알림만.
document.getElementById("wantBtn").addEventListener("click", function () {
  var bookId = state.currentId;
  if (!bookId) return;
  var want = !state.wanted;
  var prev = { wanted: state.wanted, count: state.wantCount };
  state.mySeq++;
  state.wanted = want;
  state.wantCount = Math.max(0, state.wantCount + (want ? 1 : -1));
  renderDetail();
  if (want) {
    showActionToast("읽고 싶은 책에 담았어요", { label: "보기 ›", onClick: function () { openMyShelf("wants"); } });
  } else {
    hideActionToast();
  }

  var body = { want: want };
  var name = AUTH_MODE === "nickname" ? getSavedNickname() : "";
  if (name) body.name = name;
  api("/api/books/" + encodeURIComponent(bookId) + "/want", { method: "PUT", body: body })
    .then(function (res) {
      if (state.currentId !== bookId) return;
      state.wanted = !!res.wanted;
      state.wantCount = res.count || 0;
      renderDetail();
    })
    .catch(function (e) {
      if (state.currentId === bookId) {
        state.mySeq++;
        state.wanted = prev.wanted;
        state.wantCount = prev.count;
        renderDetail();
      }
      hideActionToast();
      alert(e.message);
    });
});

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
// 책장에 이미 있는 책은 치는 대로 바로 보여준다(이미 받아둔 목록에서 찾으니 공짜다).
// 카카오 검색은 요청 한도가 있어서 예전처럼 검색 버튼/Enter에서만 돈다.
dom.bookSearchInput.addEventListener("input", function () { renderBookResults(); });
dom.bookSearchInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    searchBooks(dom.bookSearchInput.value.trim());
  }
});
document.getElementById("clearSelectedBook").addEventListener("click", clearSelectedBook);

document.querySelectorAll(".sort-tab").forEach(function (btn) {
  btn.addEventListener("click", function () {
    state.sortMode = btn.dataset.sort;
    gtag("event", "change_sort", { sort_mode: state.sortMode });
    document.querySelectorAll(".sort-tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
    renderLibrary();
  });
});

// 분류 칩은 책 목록이 바뀔 때마다 다시 그려지므로(js/render.js renderGenreChips) 칸에
// 한 번만 달아 두고 눌린 칩을 찾는다.
dom.genreChips.addEventListener("click", function (e) {
  var chip = e.target.closest("[data-genre]");
  if (!chip) return;
  state.categoryFilter = chip.dataset.genre;
  gtag("event", "filter_category", { category: state.categoryFilter || "전체" });
  renderLibrary();
});

document.getElementById("newReviewBtn").addEventListener("click", function () {
  gtag("event", "click_add_book");
  startBookRegistration();
});
document.getElementById("cancelForm").addEventListener("click", function () { closeWriteSheet(); });
document.getElementById("nicknameChange").addEventListener("click", function () {
  renderNicknameRow(true);
  var input = document.getElementById("fNickname");
  input.focus();
  input.select();
});
dom.writeSheetClose.addEventListener("click", function () { closeWriteSheet(); });
// 바깥(어두운 배경)을 눌러도 닫는다.
dom.writeSheet.addEventListener("click", function (e) {
  if (e.target === dom.writeSheet) closeWriteSheet();
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !dom.writeSheet.hidden) closeWriteSheet();
});
document.getElementById("feedbackBtn").addEventListener("click", function () {
  gtag("event", "click_feedback");
  document.getElementById("feedbackForm").reset();
  showView("feedback");
});
document.getElementById("cancelFeedback").addEventListener("click", function () { showView("library"); });
// 로고 = 홈. 링크라 새 탭 열기(가운데 클릭 등)는 그대로 두고, 그냥 누르면 페이지를 다시
// 받지 않고 화면만 바꾼다.
document.getElementById("brandLink").addEventListener("click", function (e) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  showView("library");
});

// 키보드가 올라오면 "눈에 보이는 화면"이 줄어든다. 아이폰 사파리는 그래도 fixed 요소의 기준을
// 그대로 둬서, 아래에서 올라오는 시트(한 줄 남기기·책 찾기)가 키보드 뒤에 숨었다. 보이는
// 영역의 높이와 위치를 CSS 변수로 넘겨 시트가 그 안에 맞춰 앉게 한다(css .level-guide).
(function trackVisualViewport() {
  var vv = window.visualViewport;
  if (!vv) return;
  var root = document.documentElement;
  function sync() {
    root.style.setProperty("--vv-height", vv.height + "px");
    root.style.setProperty("--vv-top", vv.offsetTop + "px");
  }
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
})();

// 테마. 기본은 크림(data-theme 없음)이고 다크를 고르면 이 브라우저에 기억한다. 첫 그림을
// 그리기 전에 적용하는 부분은 index.html <head>의 작은 스크립트가 맡는다.
var THEME_KEY = "chaekgalpi_theme";
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
function renderThemeBtn() {
  var dark = currentTheme() === "dark";
  dom.themeBtn.innerHTML = "";
  dom.themeBtn.appendChild(buildIcon(dark ? "sun" : "moon"));
  dom.themeBtn.setAttribute("aria-label", dark ? "밝은 테마로 바꾸기" : "다크 모드로 바꾸기");
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#17140F" : "#F7F3EC");
}
dom.themeBtn.addEventListener("click", function () {
  var next = currentTheme() === "dark" ? "light" : "dark";
  if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  renderThemeBtn();
  gtag("event", "toggle_theme", { theme: next });
});
renderThemeBtn();

// 헤더 돋보기 "책 찾기". 리뷰를 보러 온 사람이 책장에 있는 책을 찾아 바로 상세로 간다.
var searchSheetOpener = null;
function openSearchSheet() {
  searchSheetOpener = document.activeElement;
  dom.siteSearchInput.value = "";
  renderSiteSearch();
  dom.searchSheet.hidden = false;
  void dom.searchSheet.offsetWidth;
  dom.searchSheet.classList.add("show");
  dom.siteSearchInput.focus();
  gtag("event", "open_search");
}
export function closeSearchSheet() {
  if (dom.searchSheet.hidden) return;
  dom.searchSheet.classList.remove("show");
  setTimeout(function () { dom.searchSheet.hidden = true; }, 220);
  if (searchSheetOpener && searchSheetOpener.focus) searchSheetOpener.focus();
  searchSheetOpener = null;
}
document.getElementById("searchBtn").addEventListener("click", openSearchSheet);
dom.searchSheetClose.addEventListener("click", closeSearchSheet);
dom.searchSheet.addEventListener("click", function (e) {
  if (e.target === dom.searchSheet) closeSearchSheet();
});
dom.siteSearchInput.addEventListener("input", renderSiteSearch);
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !dom.searchSheet.hidden) closeSearchSheet();
});
document.getElementById("recommendBtn").addEventListener("click", function () { openRecommend(); });
// 추천할 근거가 없을 때 뜨는 두 버튼. 기본은 책장으로 보내는 것이다 — 이미 등록된 책에
// 별점만 남겨도 추천은 돌아가므로, 등록을 먼저 요구할 이유가 없다.
document.getElementById("recommendCta").addEventListener("click", function () { showView("library"); });
// 찾는 책이 없을 때의 다음 단계. 헤더의 "한 줄 남기기"와 같은 진입점을 써서
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

// 헤더의 "랜덤 책 추천" 자리를 표지 모음 이미지가 가져갔다(2026-10-01). 랜덤 화면
// 자체(openRandomView/drawRandomBook/#randomView)는 지우지 않고 그대로 뒀다 — 지금은
// 들어갈 입구가 없을 뿐이라, 버튼 한 줄만 되돌리면 다시 쓸 수 있다.
document.getElementById("collageBtn").addEventListener("click", function () {
  openCollage();
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
    if (!nickname) {
      renderNicknameRow(true);
      document.getElementById("fNickname").focus();
      alert("닉네임을 입력해주세요.");
      return;
    }
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

  var review = { text: text, rating: state.formRating, mood: state.formMood, name: nickname };
  dom.writeSubmit.disabled = true;
  var done = function () { dom.writeSubmit.disabled = false; };

  // 이미 책장에 있는 책: 새 책을 만들지 않고 그 책에 한줄평만 붙인다.
  if (state.selectedBook.existingId) {
    addReviewToExisting(state.selectedBook.existingId, review).then(done, function (err) { done(); alert(err.message); });
    return;
  }

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
      done();
      closeWriteSheet(true);
      renderAuthBox();
      refreshMyScore(10);
      state.books.unshift(normalizeBook(data.book));
      var totalCount = state.books.length;
      showView("library");
      renderLibrary();
      // 첫 등록자 축하와 N권째 기록 축하가 같은 순간에 겹칠 수 있는데, 같은 모달을
      // 동시에 두 번 못 띄우니 첫 등록자 쪽을 우선한다(더 개인적인 축하라서).
      if (data.firstRegistration) showCelebrationModal("이 책의 첫 번째 등록자예요! 🎉");
      else if (totalCount > 0 && totalCount % MILESTONE_STEP === 0) showMilestoneCelebration(totalCount);
    })
    .catch(function (err) {
      // 화면은 "아직 없는 책"으로 알았는데 서버에는 이미 있는 경우(방금 누가 등록했거나,
      // 목록을 받기 전에 골랐거나). 예전엔 여기서 알림만 띄우고 쓴 한 줄을 버렸다 —
      // 이제는 서버가 알려준 그 책에 그대로 붙인다. 새 책은 절대 만들지 않는다.
      if (err.status === 409 && err.data && err.data.bookId) {
        return addReviewToExisting(err.data.bookId, review).then(done);
      }
      throw err;
    })
    .catch(function (err) {
      done();
      alert(err.message);
    });
});

// 이미 있는 책에 한줄평을 붙인다(시트에서). 책 상세의 한줄평 칸과 같은 API·같은 GA
// 이벤트를 쓰고, from으로 시트에서 왔는지만 구분한다. 화면은 옮기지 않는다 — 시트만
// 닫고, 보던 화면의 숫자(리뷰 수·별점)만 새로 받아 고친다.
function addReviewToExisting(bookId, review) {
  return api("/api/books/" + encodeURIComponent(bookId) + "/comments", {
    method: "POST",
    body: { text: review.text, rating: review.rating, mood: review.mood, name: review.name }
  }).then(function (res) {
    gtag("event", "complete_review", { book_id: bookId, from: "write_sheet" });
    gtag("event", "complete_comment", { book_id: bookId, from: "write_sheet" });
    closeWriteSheet(true);
    renderAuthBox();
    // 같은 기기가 이미 남긴 책이면 새로 붙지 않고 그 평가를 고친다 — 점수 차이는 서버가 준다
    // (별점만 있던 것에 한 줄을 채우면 +2, 이미 있던 한 줄을 고치면 0).
    refreshMyScore(res && typeof res.points === "number" ? res.points : 3);
    var jobs = [refreshBooks()];
    if (state.view === "detail" && state.currentId === bookId) jobs.push(refreshComments());
    return Promise.all(jobs);
  });
}

document.getElementById("deleteBtn").addEventListener("click", function () {
  var r = findBook(state.currentId);
  if (!r) return;
  if (!confirm("이 리뷰를 삭제할까요? 댓글도 함께 사라져요.")) return;

  api("/api/books/" + state.currentId, { method: "DELETE", headers: { "X-Admin-Key": getAdminKey() } })
    .then(function () {
      state.books = state.books.filter(function (b) { return b.id !== state.currentId; });
      showView("library");
      renderLibrary();
      refreshFeatured();
    })
    .catch(function (e) {
      alert(e.message);
      if (e.message.indexOf("권한이 없") !== -1) { clearAdminKey(); renderAdminToggle(); }
    });
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
  if (getSavedNickname()) linkMyRecords(getSavedNickname());
}

initCollage();

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

function isMyShelfPath(pathname) {
  return /^\/my\/?$/.test(pathname);
}

function isCollagePath(pathname) {
  return /^\/collage\/?$/.test(pathname);
}

window.addEventListener("popstate", function () {
  var id = bookIdFromPath(window.location.pathname);
  if (id) { openDetail(id); return; }
  var who = nicknameFromPath(window.location.pathname);
  if (who) { openProfile(who); return; }
  if (isRecommendPath(window.location.pathname)) { openRecommend(); return; }
  if (isCollagePath(window.location.pathname)) { openCollage(); return; }
  if (isMyShelfPath(window.location.pathname)) { openMyShelf(); return; }
  showView("library");
});

var initialBookId = bookIdFromPath(window.location.pathname);
var initialNickname = nicknameFromPath(window.location.pathname);
if (initialBookId) openDetail(initialBookId);
else if (initialNickname) openProfile(initialNickname);
else if (isRecommendPath(window.location.pathname)) openRecommend();
else if (isCollagePath(window.location.pathname)) openCollage();
else if (isMyShelfPath(window.location.pathname)) openMyShelf();
else showView("library");

refreshBooks();
refreshFeatured();

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
