#!/usr/bin/env node
// REA 웹 분석 파이프라인 재현 스크립트
//
// 전제: 127.0.0.1:9222 에 원격 디버깅이 켜진 Chrome이 떠 있고,
//       분석 대상 URL이 탭 하나에 열려 있어야 한다. (docs/setup.md 3절)
//
// 하는 일
//   1) list-browser-targets 로 대상 target id 확인
//   2) inspect-web-page --include-script-sources 로 스크립트 원문 보존
//   3) export-web-scripts 로 검증된 파일 추출
//   4) analyze-javascript-application 으로 정적 애플리케이션 그래프 생성
//   5) capture-web-screenshot 으로 화면 Evidence 확보
//   6) docs/evidence/ 에 요약본(커밋 대상)과 digests.json 기록
//
// 사용법:  node scripts/capture-and-analyze.mjs [대상URL]

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = process.env.REA_CDP_ENDPOINT ?? "http://127.0.0.1:9222";
const TARGET_URL = process.argv[2] ?? "https://jngbnss.github.io/f1/";
const TMP = resolve(ROOT, ".tmp/evidence");
const SCRIPTS_DIR = resolve(ROOT, ".tmp/f1-scripts");
const OUT = resolve(ROOT, "docs/evidence");

mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

/** REA CLI를 실행하고 마지막 JSON 줄(최종 Evidence)을 반환한다. */
function rea(args, { saveAs } = {}) {
  console.log(`\n$ npx -y rea-agents@latest ${args.join(" ")}`);
  const stdout = execFileSync("npx", ["-y", "rea-agents@latest", ...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  if (saveAs) writeFileSync(resolve(TMP, saveAs), stdout);
  // 진행 로그(rea_progress)가 JSONL로 먼저 나오고 마지막 줄이 결과다. (docs/errors.md E-005)
  const lines = stdout.split("\n").filter((l) => l.trim());
  return JSON.parse(lines[lines.length - 1]);
}

function sha256(path) {
  return new Promise((ok, no) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", no);
  });
}

// 1) target 선택 -------------------------------------------------------------
const targets = rea(["list-browser-targets", ENDPOINT]);
const page = targets.normalized_result.targets.find((t) => t.url?.startsWith(TARGET_URL));
if (!page) {
  console.error(`대상 URL(${TARGET_URL})이 열린 탭을 찾지 못했습니다.`);
  console.error("열린 탭:", targets.normalized_result.targets.map((t) => t.url).join("\n  "));
  process.exit(1);
}
const TARGET_ID = page.target_id;
console.log(`target_id = ${TARGET_ID}`);

// 2) 페이지 캡처 (스크립트 원문 포함) ----------------------------------------
const capture = rea(
  ["inspect-web-page", ENDPOINT, TARGET_ID, "--observation-ms", "4000",
   "--include-script-sources", "--include-accessibility-text", "--include-console-text"],
  { saveAs: "inspect-web-page.json" },
);
const scripts = capture.normalized_result.scripts.items;
console.log(`스크립트 ${scripts.length}개 보존`);

writeFileSync(
  resolve(OUT, "script-inventory.json"),
  JSON.stringify({
    captured_from: TARGET_URL,
    tool: "rea inspect-web-page --include-script-sources",
    scripts: scripts.map((s) => ({
      url: s.url, bytes: s.length, is_module: s.is_module,
      source_map_url: s.source_map_url, sha256: s.source?.artifact?.sha256,
    })),
  }, null, 2),
);

// 3) 스크립트 추출 -----------------------------------------------------------
// export-web-scripts 는 CLI 사양상 "존재하지 않는 디렉터리"만 받는다(--help: "absent directory").
if (existsSync(SCRIPTS_DIR)) rmSync(SCRIPTS_DIR, { recursive: true, force: true });
rea(["export-web-scripts", resolve(TMP, "inspect-web-page.json"), SCRIPTS_DIR]);

// 4) 정적 애플리케이션 그래프 ------------------------------------------------
const graph = rea(["analyze-javascript-application", SCRIPTS_DIR], { saveAs: "app-graph.json" });
console.log("파싱된 JS 파일:", graph.normalized_result.statistics?.parsed_javascript_files);

// 5) 스크린샷 ----------------------------------------------------------------
const shot = rea(["capture-web-screenshot", ENDPOINT, TARGET_ID], { saveAs: "screenshot-original.json" });
writeFileSync(resolve(OUT, "original-game.png"),
  Buffer.from(shot.normalized_result.artifact.data_base64, "base64"));

// 6) 다이제스트 --------------------------------------------------------------
const files = {};
for (const f of ["inspect-web-page.json", "app-graph.json", "screenshot-original.json"]) {
  const p = resolve(TMP, f);
  files[f] = { sha256: await sha256(p), bytes: readFileSync(p).length };
}
for (const f of ["original-game.png", "script-inventory.json"]) {
  const p = resolve(OUT, f);
  files[f] = { sha256: await sha256(p), bytes: readFileSync(p).length, committed: true };
}
const digestPath = resolve(OUT, "digests.json");
const prev = existsSync(digestPath) ? JSON.parse(readFileSync(digestPath, "utf8")) : { files: {} };
writeFileSync(digestPath, JSON.stringify({
  note: "대용량 원본 Evidence는 커밋하지 않고 .tmp/evidence/ 에 보관. 이 스크립트로 재생성 가능.",
  files: { ...prev.files, ...files },
}, null, 2));

console.log("\n완료. docs/evidence/ 갱신됨.");
