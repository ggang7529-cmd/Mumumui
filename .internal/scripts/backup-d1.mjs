// 운영 D1의 내용을 파일로 받아두는 백업 스크립트. 스키마를 바꾸는 마이그레이션을 돌리기
// 전에 한 번 실행해두면, 최악의 경우 이 파일만으로 데이터를 되살릴 수 있다.
//
// 테이블마다 (1) 사람이 바로 읽을 수 있는 JSON과 (2) 그대로 다시 넣을 수 있는 INSERT
// 문(.sql) 두 가지를 같이 만든다. 되돌릴 때 SQL 쪽은 D1 Console에 그대로 붙여넣으면 된다.
//
// 실행 방법:
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... D1_DATABASE_ID=... \
//     node .internal/scripts/backup-d1.mjs
//
// - CLOUDFLARE_ACCOUNT_ID: Cloudflare 대시보드 오른쪽 하단 계정 ID
// - D1_DATABASE_ID: D1 데이터베이스 상세 페이지에 표시되는 데이터베이스 ID (UUID)
// - CLOUDFLARE_API_TOKEN: "D1 읽기"(또는 편집) 권한을 가진 API 토큰
//
// 결과는 .internal/backups/d1-<날짜시각>/ 아래에 쌓인다(이 폴더는 .gitignore 대상).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const DATABASE_ID = process.env.D1_DATABASE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

// comment_likes까지 받아둬야 좋아요 수(=활동 점수의 일부)가 복구된다.
const TABLES = ["books", "comments", "comment_likes"];

if (!ACCOUNT_ID || !DATABASE_ID || !API_TOKEN) {
  console.error("필수 환경변수가 빠졌어요: CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

async function runD1Query(sql, params) {
  var res = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT_ID + "/d1/database/" + DATABASE_ID + "/query",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + API_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sql: sql, params: params || [] })
    }
  );
  var data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error("D1 쿼리 실패: " + JSON.stringify(data.errors || data));
  }
  return data.result[0].results;
}

// SQLite 문자열 리터럴. 작은따옴표만 두 번 겹쳐주면 되고, 숫자/NULL은 따옴표 없이 쓴다.
function toSqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function toInsertStatements(table, rows) {
  if (rows.length === 0) return "-- " + table + ": 0행\n";
  var columns = Object.keys(rows[0]);
  var lines = rows.map(function (row) {
    var values = columns.map(function (c) { return toSqlLiteral(row[c]); });
    return "INSERT INTO " + table + " (" + columns.join(", ") + ") VALUES (" + values.join(", ") + ");";
  });
  return lines.join("\n") + "\n";
}

function stamp() {
  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, "0"); };
  return (
    d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
  );
}

async function main() {
  var outDir = path.join(".internal", "backups", "d1-" + stamp());
  await mkdir(outDir, { recursive: true });

  for (var i = 0; i < TABLES.length; i++) {
    var table = TABLES[i];
    var rows = await runD1Query("SELECT * FROM " + table);
    await writeFile(path.join(outDir, table + ".json"), JSON.stringify(rows, null, 2), "utf8");
    await writeFile(path.join(outDir, table + ".sql"), toInsertStatements(table, rows), "utf8");
    console.log(table + ": " + rows.length + "행 저장");
  }

  console.log("\n백업 위치: " + outDir);
}

main().catch(function (e) {
  console.error(e.message);
  process.exit(1);
});
