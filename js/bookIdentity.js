// "같은 책"을 가리는 기준 — 판본(리커버·개정판·양장 …)만 다른 책을 한 권으로 본다.
//
// js/kdc.js·js/moodTags.js처럼 브라우저(책 검색 결과 묶기, js/render.js)와 서버(책 등록 때
// 중복 막기 functions/api/books/index.js, 기존 중복 찾기 functions/api/admin/
// edition-duplicates.js)가 같은 파일을 import한다. 양쪽 기준이 한 글자라도 어긋나면
// 검색에서는 한 줄로 묶였는데 등록은 따로 되는 일이 생긴다.
//
// 같은 책 = 정규화한 제목 + 첫 번째 저자가 같음.
//
// 정규화:
//   - 제목 끝의 괄호 부분을 뗀다: "데미안 (리커버 에디션)" → "데미안"
//   - 판본 표기 낱말을 뗀다: 리커버, 개정판, 양장, 특별판, 에디션 …
//   - 단, 권차(1권·2권·Vol.)와 만화·그래픽·청소년·어린이는 **다른 책**의 표시라 남긴다.
//     "사피엔스 (그래픽 노블)"은 "사피엔스"와 다른 책이고, "토지 1"과 "토지 2"도 다르다.
//     괄호 안에 이런 말이 있으면 그 괄호는 떼지 않는다.
//   - 권차는 쓰는 방식이 제각각이라("안나 카레니나 1", "안나 카레니나 (1권)",
//     "Vol. 1") 숫자만 뽑아 같은 모양으로 맞춘다.
//   - "세트"는 낱권과 다른 상품이라 건드리지 않는다.
//
// 기준을 바꾸면 이미 등록된 책끼리의 관계도 바뀐다. 바꾼 뒤에는 /api/admin/edition-duplicates
// 로 새로 묶이는 책이 없는지 확인할 것.

// 이 말이 들어간 괄호는 떼지 않는다(다른 책의 표시).
var DISTINCT_MARKERS = /만화|그래픽|청소년|어린이|\d+\s*권|vol\.?\s*\d+|volume\s*\d+|[상중하]\s*권|^\s*[상중하]\s*$/i;

// 판본 표기. 긴 것부터 적어야 "개정증보판"이 "개정"만 떨어지고 "증보판"이 남는 일이 없다.
// "개정"·"무선"·"신판"처럼 홀로 쓰이면 다른 뜻이 되는 말("헌법 개정", "무선 통신")은
// 넣지 않는다 — 괄호 안에 있으면 괄호째 떨어지므로 대개는 여기까지 올 일도 없다.
var EDITION_WORDS = [
  "전면\\s*개정\\s*증보판", "개정\\s*증보판", "전면\\s*개정판", "개정\\s*신판", "개정판", "증보판",
  "반양장본", "반양장", "양장본", "양장", "무선본",
  "리커버\\s*에디션", "리커버", "스페셜\\s*에디션", "리미티드\\s*에디션", "한정판", "특별판", "기념판",
  "보급판", "소장판", "에디션", "special\\s*edition",
  "제?\\s*\\d+\\s*판"
];
// 낱말 단위로만 뗀다("양장점"의 "양장"은 그대로). 한글에는 \\b가 통하지 않아 앞뒤 글자를
// 직접 본다. 앞 글자는 붙잡아 두었다가 그대로 돌려놓는다(사파리 구버전은 뒤돌아보기
// 정규식을 몰라서 쓰지 않는다).
var EDITION_RE = new RegExp(
  "(^|[\\s(\\[（［\\-–—:·,/])(" + EDITION_WORDS.join("|") + ")(?=$|[\\s)\\]）］\\-–—:·,/])", "gi"
);

// 끝에 붙은 괄호 하나: "(…)", "[…]", 전각 괄호 포함.
var TRAILING_GROUP = /\s*[(\[（［]([^()\[\]（）［］]*)[)\]）］]\s*$/;
// 앞뒤에 남는 구분 기호
var EDGE_PUNCT = /^[\s\-–—:·,|/]+|[\s\-–—:·,|/]+$/g;

// 화면에 보여줄 정리된 제목. 권차·만화 같은 괄호는 그대로 남는다.
export function editionlessTitle(title) {
  var t = String(title || "").normalize("NFC").trim();
  for (var guard = 0; guard < 5; guard++) {
    var m = t.match(TRAILING_GROUP);
    if (!m) break;
    if (DISTINCT_MARKERS.test(m[1])) {
      // 권차 괄호 안에 판본 표기가 섞여 있으면("(1권, 양장)") 괄호는 두고 표기만 뺀다.
      // 그 앞에 또 판본 괄호가 있을 수 있으니 이 괄호는 잠시 떼어 두고 계속 본다.
      var keep = m[0].replace(EDITION_RE, "$1").replace(/[,\s]+([)\]）］])/, "$1").replace(/([(\[（［])[,\s]+/, "$1");
      return (editionlessTitle(t.slice(0, m.index)) + " " + keep.trim()).trim();
    }
    t = t.slice(0, m.index);
  }
  // 판본 표기만 들어 있던 앞쪽 괄호("[리커버] 데미안")는 빈 괄호로 남으니 같이 지운다.
  t = t.replace(EDITION_RE, "$1").replace(/[(\[（［][\s,]*[)\]）］]/g, " ")
    .replace(/\s{2,}/g, " ").replace(EDGE_PUNCT, "");
  // 전부 판본 표기뿐인 이상한 제목이면 원래 제목을 쓴다(빈 키로 아무 책과 묶이지 않게).
  return t || String(title || "").trim();
}

// 비교용 키. 공백·문장부호·대소문자를 무시하고, 권차는 "#v1" 모양으로 맞춘다.
export function titleKey(title) {
  var t = editionlessTitle(title).toLowerCase();
  var vol = "";
  var volPatterns = [
    /[(\[（［]?\s*제?\s*(\d+)\s*권\s*[)\]）］]?/,
    /[(\[（［]?\s*vol(?:ume)?\.?\s*(\d+)\s*[)\]）］]?/,
    /[(\[（［]?\s*([상중하])\s*권?\s*[)\]）］]?\s*$/,
    // "안나 카레니나 1"처럼 끝에 띄어 쓴 숫자. "1984"처럼 제목 자체가 숫자인 경우는
    // 앞에 공백이 없어서 걸리지 않는다.
    /\s(\d{1,3})\s*$/
  ];
  for (var i = 0; i < volPatterns.length; i++) {
    var m = t.match(volPatterns[i]);
    if (m) {
      vol = "#v" + m[1];
      t = t.slice(0, m.index) + " " + t.slice(m.index + m[0].length);
      break;
    }
  }
  var core = t.replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ぀-ヿ一-鿿]/g, "");
  return core + vol;
}

// 첫 번째 저자. 카카오는 저자 배열을 ", "로 이어 붙여 저장한다(functions/api/search-books.js).
export function firstAuthorKey(author) {
  var first = String(author || "").split(",")[0];
  return first.normalize("NFC").toLowerCase().replace(/[^0-9a-z가-힣぀-ヿ一-鿿]/g, "");
}

export function bookKey(title, author) {
  return titleKey(title) + "|" + firstAuthorKey(author);
}

// isbn은 카카오가 "ISBN10 ISBN13"을 한 칸에 이어서 준다. 비교는 낱낱으로 한다.
function isbnParts(isbn) {
  return String(isbn || "").split(/\s+/).filter(Boolean);
}

export function sameIsbn(a, b) {
  var pa = isbnParts(a);
  var pb = isbnParts(b);
  return pa.some(function (x) { return pb.indexOf(x) !== -1; });
}

// 카카오 검색 결과를 같은 책끼리 한 묶음으로. 검색 순서(관련도)는 각 묶음이 처음 나온
// 자리로 지킨다. registered는 이미 책장에 있는 책들(state.books).
//
// 대표 판본: 이미 등록된 판본 > 표지 있는 최신판 > 표지 없는 최신판.
// 등록된 판본이 검색 결과에 없어도(다른 판본만 검색된 경우) 등록된 책을 대표로 세운다 —
// 이 묶음을 고르면 결국 그 책에 기록이 쌓여야 하기 때문이다.
export function groupEditions(results, registered) {
  var groups = [];
  var byKey = {};
  (results || []).forEach(function (b) {
    var key = bookKey(b.title, b.author);
    var g = byKey[key];
    if (!g) {
      g = byKey[key] = { key: key, editions: [], registered: null };
      groups.push(g);
    }
    g.editions.push(b);
  });

  (registered || []).forEach(function (r) {
    var g = byKey[bookKey(r.title, r.author)];
    if (!g) {
      // 키는 달라도 isbn이 같은 판본이면(제목 표기가 바뀐 경우 등) 같은 책이다.
      g = groups.find(function (x) {
        return x.editions.some(function (e) { return sameIsbn(e.isbn, r.isbn); });
      });
    }
    if (g && !g.registered) g.registered = r;
  });

  return groups.map(function (g) {
    var rep = null;
    if (g.registered) {
      rep = g.editions.find(function (e) { return sameIsbn(e.isbn, g.registered.isbn); }) || {
        title: g.registered.title, author: g.registered.author, cover: g.registered.cover,
        isbn: g.registered.isbn || "", contents: g.registered.contents || "", publisher: "", datetime: ""
      };
    } else {
      var sorted = g.editions.slice().sort(function (a, b) {
        var ca = a.cover ? 1 : 0;
        var cb = b.cover ? 1 : 0;
        if (ca !== cb) return cb - ca;
        return String(b.datetime || "").localeCompare(String(a.datetime || ""));
      });
      rep = sorted[0];
    }
    // 판본 수: 검색된 판본 + (검색에는 안 나왔지만 등록돼 있는 판본)
    var count = g.editions.length;
    if (g.registered && !g.editions.some(function (e) { return sameIsbn(e.isbn, g.registered.isbn); })) count++;
    return {
      key: g.key,
      book: rep,
      displayTitle: editionlessTitle(rep.title),
      editionCount: count,
      registeredId: g.registered ? g.registered.id : null
    };
  });
}
