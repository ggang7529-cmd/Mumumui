import { state, dom, AUTH_MODE, openDetail, showView } from "./main.js";
import {
  googleConfigured, myUid, api, refreshBooks, refreshComments, getSavedNickname, saveNickname, renderGoogleButtons,
  isAdminMode, getAdminKey, getNotifSeenMap, saveNotifSeenMap
} from "./api.js";

var COVERS = ["#5B6B4F", "#3F5A6B", "#7C5A3A", "#6B4357", "#4A6B5C", "#7A4B3A"];

export function coverFor(title) {
  var hash = 0;
  for (var i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return COVERS[hash % COVERS.length];
}

// 댓글/답글 작성자 닉네임 span을 공통으로 만든다.
function buildAuthorChip(name, className) {
  var span = document.createElement("span");
  span.className = className;
  span.textContent = (name || "").trim() || "익명";
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

export function renderStars(container, rating, interactive, onSelect) {
  container.innerHTML = "";
  for (var i = 1; i <= 5; i++) {
    var filled = i <= rating;
    if (interactive) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = filled ? "filled" : "";
      btn.textContent = filled ? "★" : "☆";
      btn.setAttribute("aria-label", i + "점");
      btn.addEventListener("click", function (idx) {
        return function () { onSelect(idx); };
      }(i));
      container.appendChild(btn);
    } else {
      var span = document.createElement("span");
      span.className = filled ? "" : "empty";
      span.textContent = filled ? "★" : "☆";
      container.appendChild(span);
    }
  }
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
      var savedChip = document.createElement("div");
      savedChip.className = "user-chip";
      var savedName = document.createElement("span");
      savedName.className = "user-name";
      savedName.textContent = nickname;
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

export function renderLibrary() {
  var query = state.searchQuery.trim().toLowerCase();
  var visible = query
    ? state.books.filter(function (r) { return r.title.toLowerCase().indexOf(query) !== -1; })
    : state.books.slice();

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

  if (!state.booksLoaded) {
    dom.countLabel.textContent = "불러오는 중...";
  } else if (query) {
    dom.countLabel.textContent = visible.length + "권 검색됨 (전체 " + state.books.length + "권)";
  } else {
    dom.countLabel.textContent = state.books.length ? "총 " + state.books.length + "권의 리뷰" : "";
  }

  dom.shelf.innerHTML = "";

  if (state.booksLoaded && state.books.length === 0) {
    var note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "아직 기록한 책이 없어요. 위쪽 '+ 책 기록하기' 버튼으로 첫 책을 남겨보세요.";
    dom.shelf.appendChild(note);
  } else if (query && visible.length === 0) {
    var noMatch = document.createElement("p");
    noMatch.className = "empty-note";
    noMatch.textContent = "\"" + state.searchQuery.trim() + "\"에 해당하는 책이 없어요.";
    dom.shelf.appendChild(noMatch);
  }

  visible.forEach(function (r) {
    var rating = bookRating(r);
    var card = document.createElement("button");
    card.type = "button";
    card.className = "book-card";
    card.style.setProperty("--cover", coverFor(r.title));
    card.setAttribute("aria-label", r.title + ", " + r.author + ", " +
      (rating ? "평점 " + rating.avg.toFixed(1) + "점, 참여자 " + rating.count + "명" : "아직 평점 없음"));

    if (r.cover) {
      var img = document.createElement("img");
      img.className = "b-cover-img";
      img.src = upscaleCover(r.cover);
      img.alt = "";
      card.appendChild(img);
    }

    if (isNewBook(r)) {
      var badge = document.createElement("span");
      badge.className = "b-new-badge";
      badge.textContent = "NEW";
      card.appendChild(badge);
    }

    var overlay = document.createElement("div");
    overlay.className = "b-overlay";

    var titleEl = document.createElement("div");
    titleEl.className = "b-title";
    titleEl.textContent = r.title;

    var authorEl = document.createElement("div");
    authorEl.className = "b-author";
    authorEl.textContent = r.author;

    var starsEl = document.createElement("div");
    starsEl.className = "b-stars";
    if (rating) {
      var stars = "";
      for (var i = 1; i <= 5; i++) stars += i <= Math.round(rating.avg) ? "★" : "☆";
      starsEl.textContent = stars + " " + rating.avg.toFixed(1) + " (" + rating.count + ")";
    } else {
      starsEl.textContent = "평점 없음";
    }

    overlay.appendChild(titleEl);
    overlay.appendChild(authorEl);
    overlay.appendChild(starsEl);
    card.appendChild(overlay);

    card.addEventListener("click", function (id) {
      return function () { openDetail(id); };
    }(r.id));

    dom.shelf.appendChild(card);
  });
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
  if (r.cover) {
    var coverImg = document.createElement("img");
    coverImg.src = upscaleCover(r.cover);
    coverImg.alt = "";
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
  var $activeEl = document.activeElement;
  if ($activeEl && $activeEl.classList && $activeEl.classList.contains("c-reply-text-input")) {
    focusedReplyId = $activeEl.dataset.replyFor || null;
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
      var textSpan = document.createElement("span");
      textSpan.className = "c-text";
      textSpan.textContent = c.text;
      textSpan.title = c.text;

      var authorSpan = buildAuthorChip(c.authorName, "c-author");

      var ratingSpan = document.createElement("span");
      ratingSpan.className = "c-rating";
      if (typeof c.rating === "number") {
        var ratingStars = "";
        for (var i = 1; i <= 5; i++) ratingStars += i <= c.rating ? "★" : "☆";
        ratingSpan.textContent = ratingStars;
      }

      var likeBtn = document.createElement("button");
      likeBtn.type = "button";
      likeBtn.className = "c-like" + (c.likedByMe ? " liked" : "");
      likeBtn.textContent = "♥ " + c.likes;
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

      item.appendChild(textSpan);
      item.appendChild(authorSpan);
      item.appendChild(ratingSpan);
      item.appendChild(likeBtn);
      item.appendChild(dateSpan);

      if (myUid() === c.authorUid || isAdminMode()) {
        var delBtn = document.createElement("button");
        delBtn.className = "c-del";
        delBtn.type = "button";
        delBtn.textContent = "×";
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

        var rAuthor = buildAuthorChip(r.authorName, "c-reply-author");

        var rText = document.createElement("span");
        rText.className = "c-reply-text";
        rText.textContent = r.text;
        rText.title = r.text;

        var rLikeBtn = document.createElement("button");
        rLikeBtn.type = "button";
        rLikeBtn.className = "c-reply-like" + (r.likedByMe ? " liked" : "");
        rLikeBtn.textContent = "♥ " + r.likes;
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

        if (myUid() === r.authorUid || isAdminMode()) {
          var rDelBtn = document.createElement("button");
          rDelBtn.type = "button";
          rDelBtn.className = "c-reply-del";
          rDelBtn.textContent = "×";
          rDelBtn.setAttribute("aria-label", "답글 삭제");
          rDelBtn.addEventListener("click", function () {
            api("/api/comments/" + r.id, { method: "DELETE", headers: { "X-Admin-Key": getAdminKey() } })
              .then(function () { refreshComments(); })
              .catch(function (e) { alert(e.message); });
          });
          rItem.appendChild(rDelBtn);
        }

        repliesList.appendChild(rItem);
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
        replyNameInput.maxLength = 20;
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
          name = replyNameInput.value.trim().slice(0, 20);
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
          })
          .catch(function (e) { alert(e.message); });
      });

      item.appendChild(replyForm);
      $list.appendChild(item);

      if (hasOpenDraft && focusedReplyId === String(c.id)) {
        replyTextInput.focus();
        var caret = replyTextInput.value.length;
        replyTextInput.setSelectionRange(caret, caret);
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
    img.alt = "";
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
