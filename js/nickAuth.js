import { AUTH_MODE, openFeedback, renderPinNotice } from "./main.js";
import { api, getNickToken, setNickToken, clearNickToken, saveNickname } from "./api.js";
import { renderAuthBox } from "./render.js";
import { nicknameKey, isPinFormat, isWeakPin } from "./pinRules.js";

// 닉네임 소유(4자리 PIN). 서버 쪽은 functions/_lib/nickname.js.
//
// 글을 남기는 곳(한 줄 남기기 시트, 한 줄 시트, 답글)은 저장 요청을 withNickname으로 감싼다.
// 이 기기가 그 닉네임의 PIN을 이미 맞췄으면 바로 보내고, 처음 보는 닉네임이면 PIN을 정하는
// 시트, PIN이 걸린 닉네임이면 PIN을 묻는 시트를 먼저 띄운다. 예전부터 쓰던(reserved) 닉네임은
// 그 이름으로 기록을 남긴 기기면 PIN을 정하게 하고(claim), 아니면 막는다(blocked — 주인이면
// 의견 보내기로). 시트를 닫으면 { cancelled: true } 오류로 끝난다 — 부르는 쪽은
// 그때 알림을 띄우지 않는다.

var dom = {
  sheet: document.getElementById("pinSheet"),
  form: document.getElementById("pinForm"),
  title: document.getElementById("pinSheetTitle"),
  sub: document.getElementById("pinSheetSub"),
  nickWrap: document.getElementById("pinNickWrap"),
  nickInput: document.getElementById("pinNickInput"),
  forLine: document.getElementById("pinFor"),
  forName: document.getElementById("pinForName"),
  input: document.getElementById("pinInput"),
  msg: document.getElementById("pinMsg"),
  submit: document.getElementById("pinSubmit"),
  help: document.getElementById("pinHelp")
};

// 열려 있는 시트 하나의 상태. mode: choose(닉네임부터) | setup(PIN 정하기) | claim(예전 닉네임에
// PIN 정하기) | enter(PIN 입력) | blocked(남의 예전 닉네임 — PIN 칸 없이 안내만)
var sheet = null;

function cancelledError() {
  var err = new Error("cancelled");
  err.cancelled = true;
  return err;
}

function render() {
  var mode = sheet.mode;
  dom.nickWrap.hidden = mode !== "choose";
  dom.forLine.hidden = mode === "choose";
  dom.forName.textContent = sheet.name;
  dom.input.hidden = mode === "choose" || mode === "blocked";
  dom.help.parentNode.hidden = mode === "choose" || mode === "blocked";
  if (mode === "blocked") {
    dom.title.textContent = "보호된 닉네임이에요";
    dom.sub.textContent = "내 닉네임이 맞다면 의견 보내기로 알려주세요";
    dom.submit.textContent = "의견 보내기";
  } else if (mode === "claim") {
    dom.title.textContent = "닉네임을 지키려면 4자리 비밀번호를 정해주세요";
    dom.sub.textContent = "다른 곳에서 쓰는 비밀번호는 쓰지 마세요";
    dom.submit.textContent = "정하기";
  } else if (mode === "choose") {
    dom.title.textContent = "닉네임 정하기";
    dom.sub.textContent = "닉네임을 정하면 다른 기기에서도 내 책장을 볼 수 있어요";
    dom.submit.textContent = "다음";
  } else if (mode === "setup") {
    dom.title.textContent = "이 닉네임을 지킬 4자리 비밀번호";
    dom.sub.textContent = "다른 곳에서 쓰는 비밀번호는 쓰지 마세요";
    dom.submit.textContent = "정하기";
  } else {
    dom.title.textContent = "이미 있는 닉네임이에요";
    dom.sub.textContent = "비밀번호를 입력해 주세요";
    dom.submit.textContent = "확인";
  }
}

function setMode(mode, name, msg) {
  sheet.mode = mode;
  if (name) sheet.name = name;
  dom.input.value = "";
  dom.msg.textContent = msg || "";
  render();
  focusField();
}

function focusField() {
  if (sheet.mode === "blocked") return;
  var el = sheet.mode === "choose" ? dom.nickInput : dom.input;
  // 시트가 그려진 다음에 — 바로 주면 휴대폰에서 키보드가 시트보다 먼저 올라와 화면이 튄다.
  setTimeout(function () { el.focus(); }, 60);
}

// PIN 시트를 연다. 맞추면 그 닉네임(서버가 정한 표기)으로 풀린다.
export function openPinSheet(opts) {
  if (sheet) finish(cancelledError());
  return new Promise(function (resolve, reject) {
    sheet = { mode: opts.mode, name: opts.name || "", resolve: resolve, reject: reject, busy: false };
    dom.nickInput.value = opts.name || "";
    dom.input.value = "";
    dom.msg.textContent = "";
    render();
    if (typeof dom.sheet.showModal === "function") dom.sheet.showModal();
    else dom.sheet.setAttribute("open", "");
    focusField();
  });
}

function finish(result) {
  var s = sheet;
  sheet = null;
  if (dom.sheet.open) {
    if (typeof dom.sheet.close === "function") dom.sheet.close();
    else dom.sheet.removeAttribute("open");
  }
  if (!s) return;
  if (result instanceof Error) s.reject(result);
  else s.resolve(result);
}

function succeed(name, token) {
  if (token) setNickToken(name, token);
  saveNickname(name);
  renderAuthBox();
  renderPinNotice();
  finish(name);
}

// /api/nickname/status 응답으로 띄울 시트 모드. null이면 시트 없이 바로 써도 된다.
function modeForStatus(s) {
  if (!s.enabled || s.authed) return null;
  if (s.status === "owned") return "enter";
  if (s.status === "reserved") return s.claimable ? "claim" : "blocked";
  return "setup";
}

var MODE_FOR_CODE = { pin_required: "enter", pin_setup: "setup", pin_claim: "claim", reserved: "blocked" };

// 이 기기가 이 닉네임으로 써도 되는지 확인하고, 필요하면 시트를 띄운다.
export function ensureNickname(raw) {
  var name = String(raw || "").trim().slice(0, 10);
  if (AUTH_MODE !== "nickname" || !name) return Promise.resolve(name);
  var tok = getNickToken();
  if (tok && tok.key === nicknameKey(name)) return Promise.resolve(tok.name || name);
  return api("/api/nickname/status?name=" + encodeURIComponent(name)).then(function (s) {
    var mode = modeForStatus(s);
    if (!mode) return s.name || name;
    return openPinSheet({ mode: mode, name: s.name || name });
  });
}

// 닉네임으로 저장하는 요청 fn(닉네임)을 감싼다. 토큰이 서버에서 사라졌으면(관리자가 PIN을
// 초기화했을 때 등) 저장이 PIN 오류로 돌아오는데, 그때 시트를 띄워 한 번 더 보낸다.
export function withNickname(raw, fn) {
  return ensureNickname(raw).then(function (name) {
    return fn(name).catch(function (err) {
      var code = err && err.data && err.data.code;
      if (!MODE_FOR_CODE[code]) throw err;
      clearNickToken();
      return openPinSheet({ mode: MODE_FOR_CODE[code], name: err.data.name || name }).then(fn);
    });
  });
}

dom.form.addEventListener("submit", function (e) {
  e.preventDefault();
  if (!sheet || sheet.busy) return;

  if (sheet.mode === "blocked") {
    finish(cancelledError());
    openFeedback();
    return;
  }

  if (sheet.mode === "choose") {
    var name = dom.nickInput.value.trim().slice(0, 10);
    if (!name) { dom.msg.textContent = "닉네임을 입력해주세요."; dom.nickInput.focus(); return; }
    sheet.busy = true;
    api("/api/nickname/status?name=" + encodeURIComponent(name)).then(function (s) {
      if (!sheet) return;
      sheet.busy = false;
      var mode = modeForStatus(s);
      if (!mode) { succeed(s.name || name); return; }
      setMode(mode, s.name || name);
    }).catch(function (err) {
      if (!sheet) return;
      sheet.busy = false;
      dom.msg.textContent = err.message;
    });
    return;
  }

  var pin = dom.input.value.trim();
  if (!isPinFormat(pin)) { dom.msg.textContent = "숫자 4자리를 입력해 주세요"; dom.input.focus(); return; }
  if ((sheet.mode === "setup" || sheet.mode === "claim") && isWeakPin(pin)) {
    dom.msg.textContent = "조금 더 어려운 번호로 정해주세요";
    dom.input.value = "";
    dom.input.focus();
    return;
  }

  var intent = sheet.mode;
  sheet.busy = true;
  dom.submit.disabled = true;
  api("/api/nickname/pin", { method: "POST", body: { name: sheet.name, pin: pin, intent: intent } })
    .then(function (res) {
      dom.submit.disabled = false;
      if (!sheet) return;
      gtag("event", "nickname_pin", { type: intent });
      succeed(res.name, res.token);
    })
    .catch(function (err) {
      dom.submit.disabled = false;
      if (!sheet) return;
      sheet.busy = false;
      var data = err.data || {};
      if (data.code === "taken") { setMode("enter", data.name, "이미 있는 닉네임이에요. 비밀번호를 입력해 주세요"); return; }
      if (data.code === "free") { setMode("setup", data.name); return; }
      if (data.code === "claim") { setMode("claim", data.name); return; }
      if (data.code === "reserved") { setMode("blocked", data.name); return; }
      dom.input.value = "";
      if (data.code === "wrong") {
        dom.msg.textContent = "비밀번호가 맞지 않아요" + (data.left ? " (" + data.left + "번 남았어요)" : "");
      } else {
        dom.msg.textContent = err.message;
      }
      dom.input.focus();
    });
});

// 숫자만, 4자리까지(휴대폰 숫자 자판이 아닌 키보드로 쳐도).
dom.input.addEventListener("input", function () {
  var v = dom.input.value.replace(/[^0-9]/g, "").slice(0, 4);
  if (v !== dom.input.value) dom.input.value = v;
});

document.getElementById("pinCancel").addEventListener("click", function () { finish(cancelledError()); });
// Esc·바깥 누르기 등으로 닫혀도 취소로 끝낸다.
dom.sheet.addEventListener("close", function () { if (sheet) finish(cancelledError()); });
dom.sheet.addEventListener("click", function (e) {
  if (e.target === dom.sheet) finish(cancelledError());
});
dom.help.addEventListener("click", function () {
  finish(cancelledError());
  openFeedback();
});
