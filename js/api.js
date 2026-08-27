import { AUTH_MODE, GOOGLE_CLIENT_ID, state, dom } from "./main.js";
import { renderBookResults, renderAuthBox, renderLibrary, renderDetail } from "./render.js";

export function googleConfigured() {
  return AUTH_MODE === "google" && GOOGLE_CLIENT_ID.indexOf("YOUR_GOOGLE_CLIENT_ID") !== 0;
}

var ANON_ID_KEY = "chaekgalpi_anon_id";
var NICKNAME_KEY = "chaekgalpi_nickname";
var ADMIN_KEY_STORAGE = "chaekgalpi_admin_key";

export function getAnonId() {
  try {
    var id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return "anon-" + Date.now().toString(36);
  }
}

export function getSavedNickname() {
  try { return localStorage.getItem(NICKNAME_KEY) || ""; } catch (e) { return ""; }
}

export function saveNickname(name) {
  try { localStorage.setItem(NICKNAME_KEY, name); } catch (e) {}
}

export function myUid() {
  return AUTH_MODE === "nickname" ? getAnonId() : (state.currentUser ? state.currentUser.uid : null);
}

// 이 브라우저가 관리자 비밀번호를 확인받은 적 있는지 여부. 로그인이 없는 사이트라 "나"를
// 서버가 알지는 못하고, 비밀번호를 맞춰 저장해둔 브라우저인지만 구분한다.
export function isAdminMode() {
  try { return !!localStorage.getItem(ADMIN_KEY_STORAGE); } catch (e) { return false; }
}

export function getAdminKey() {
  try { return localStorage.getItem(ADMIN_KEY_STORAGE) || ""; } catch (e) { return ""; }
}

export function clearAdminKey() {
  try { localStorage.removeItem(ADMIN_KEY_STORAGE); } catch (e) {}
}

export function verifyAdminKey(key) {
  return fetch("/api/admin/verify", { method: "POST", headers: { "X-Admin-Key": key } })
    .then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (res.ok) {
          try { localStorage.setItem(ADMIN_KEY_STORAGE, key); } catch (e) {}
          return { ok: true };
        }
        return { ok: false, error: (data && data.error) || "비밀번호가 틀렸어요." };
      });
    })
    .catch(function () { return { ok: false, error: "요청이 실패했어요." }; });
}

export function normalizeBook(row) {
  return {
    id: row.id, title: row.title, author: row.author, cover: row.cover, isbn: row.isbn, text: row.text,
    ratingSum: row.rating_sum, ratingCount: row.rating_count, commentCount: row.comment_count,
    ownerUid: row.owner_uid, ownerName: row.owner_name, ownerPhoto: row.owner_photo,
    createdAt: row.created_at, updatedAt: row.updated_at || row.created_at
  };
}

export function normalizeComment(row) {
  return {
    id: row.id, text: row.text, rating: row.rating,
    authorUid: row.author_uid, authorName: row.author_name, authorPhoto: row.author_photo,
    createdAt: row.created_at, likes: row.likes, likedByMe: !!row.liked_by_me
  };
}

export function api(path, opts) {
  opts = opts || {};
  var headers = Object.assign({}, opts.headers);
  if (opts.body) headers["Content-Type"] = "application/json";
  if (AUTH_MODE === "nickname") headers["X-Anon-Id"] = getAnonId();
  return fetch(path, {
    method: opts.method || "GET",
    headers: headers,
    credentials: "same-origin",
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(function (res) {
    return res.json().catch(function () { return null; }).then(function (data) {
      if (!res.ok) throw new Error((data && data.error) || ("요청이 실패했어요 (" + res.status + ")"));
      return data;
    });
  });
}

export function searchBooks(q) {
  if (!q) { dom.bookResults.hidden = true; dom.bookResults.innerHTML = ""; return; }
  gtag("event", "search_book");
  api("/api/search-books?q=" + encodeURIComponent(q)).then(function (data) {
    renderBookResults(data.books || []);
  }).catch(function (e) {
    dom.bookResults.hidden = false;
    dom.bookResults.innerHTML = "";
    var li = document.createElement("li");
    li.className = "book-result-empty";
    li.textContent = "검색에 실패했어요: " + e.message;
    dom.bookResults.appendChild(li);
  });
}

export function refreshBooks() {
  return api("/api/books").then(function (data) {
    state.books = (data.books || []).map(normalizeBook);
    state.booksLoaded = true;
    if (state.view === "library") renderLibrary();
    else if (state.view === "detail") renderDetail();
  }).catch(function (e) {
    state.booksLoaded = true;
    if (state.view === "library") dom.countLabel.textContent = "불러오지 못했어요: " + e.message;
  });
}

export function refreshComments() {
  if (!state.currentId) return Promise.resolve();
  return api("/api/books/" + state.currentId + "/comments").then(function (data) {
    state.comments = (data.comments || []).map(normalizeComment);
    if (state.view === "detail") renderDetail();
  }).catch(function () {});
}

export function renderGoogleButtons() {
  if (!googleConfigured()) return;
  if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
  ["googleBtnHeader", "googleBtnComment"].forEach(function (slotId) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    slot.innerHTML = "";
    google.accounts.id.renderButton(slot, { theme: "outline", size: "medium", shape: "pill", text: "signin_with", locale: "ko" });
  });
}

export function handleGoogleCredential(response) {
  api("/api/auth/google", { method: "POST", body: { credential: response.credential } })
    .then(function (data) {
      state.currentUser = data.user;
      renderAuthBox();
      if (state.view === "detail") renderDetail();
    })
    .catch(function (e) {
      alert("로그인에 실패했어요: " + e.message);
    });
}

export function initGoogleSignIn() {
  if (!googleConfigured()) return;
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    setTimeout(initGoogleSignIn, 200);
    return;
  }
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential });
  renderAuthBox();
}
