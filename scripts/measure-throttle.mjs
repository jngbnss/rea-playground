#!/usr/bin/env node
// 가속 계측 스크립트 — REA 도구가 아니다. (docs/analysis/04-evidence.md 3-4절)
//
// REA에는 "키를 누른 상태로 유지"하는 기능이 없다(capture-browser-scenario 의 press 는
// 누름-뗌 1회). 그래서 CDP Input.dispatchKeyEvent 로 rawKeyDown 만 보내 상태를 유지하고,
// HUD 속도계 텍스트를 일정 간격으로 읽어 기록한다.
//
// 전제: 127.0.0.1:9222 Chrome, 게임이 이미 "주행 가능" 상태(카운트다운 종료)여야 한다.
// 사용법:
//   node scripts/measure-throttle.mjs                      # 원본 게임 (기본)
//   node scripts/measure-throttle.mjs --demo               # 자체 데모 (http://localhost:4173)
//   node scripts/measure-throttle.mjs --url <URL> --out <csv> --key KeyW --samples 70

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const isDemo = argv.includes("--demo");

const ENDPOINT = process.env.REA_CDP_ENDPOINT ?? "http://127.0.0.1:9222";
const URL_PREFIX = flag("url", isDemo ? "http://localhost:4173" : "https://jngbnss.github.io/f1/");
const OUT = resolve(ROOT, flag("out", isDemo ? "docs/evidence/throttle-run-demo.csv"
                                             : "docs/evidence/throttle-run.csv"));
const KEY = flag("key", "KeyW");
const SAMPLES = Number(flag("samples", "70"));
const INTERVAL_MS = Number(flag("interval", "100"));

const KEY_CODES = {
  KeyW: { key: "w", windowsVirtualKeyCode: 87 },
  KeyS: { key: "s", windowsVirtualKeyCode: 83 },
  KeyA: { key: "a", windowsVirtualKeyCode: 65 },
  KeyD: { key: "d", windowsVirtualKeyCode: 68 },
};

// --- 최소 CDP 클라이언트 (의존성 없음) --------------------------------------
async function pickTarget() {
  const list = await (await fetch(`${ENDPOINT}/json/list`)).json();
  const t = list.find((x) => x.type === "page" && x.url?.startsWith(URL_PREFIX));
  if (!t) {
    console.error(`${URL_PREFIX} 로 시작하는 탭을 찾지 못했습니다.`);
    console.error("열린 탭:\n  " + list.map((x) => x.url).join("\n  "));
    process.exit(1);
  }
  return t;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  });
  const ready = new Promise((ok) => ws.addEventListener("open", ok));
  return {
    ready,
    send(method, params = {}) {
      const mid = ++id;
      return new Promise((resolve, reject) => {
        pending.set(mid, { resolve, reject });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

const target = await pickTarget();
const cdp = connect(target.webSocketDebuggerUrl);
await cdp.ready;
console.log(`연결됨: ${target.url}`);

const evaluate = async (expr) =>
  (await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;

// HUD 속도계 셀렉터: 원본은 .speedo .value, 데모는 #speed
const readSpeed = isDemo
  ? `Number(document.querySelector('#speed')?.textContent ?? NaN)`
  : `Number(document.querySelector('.speedo .value')?.textContent ?? NaN)`;
const readSource = isDemo
  ? `(document.querySelector('#source')?.textContent ?? '')`
  : `((document.body.innerText.match(/input\\s*\\n?([^\\n]*)/)||[])[1] ?? '')`;

const code = KEY_CODES[KEY];
const keyArgs = { code: KEY, key: code.key, windowsVirtualKeyCode: code.windowsVirtualKeyCode,
                  nativeVirtualKeyCode: code.windowsVirtualKeyCode };

await new Promise((r) => setTimeout(r, 1500));          // 안정화
const t0 = Date.now();
await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...keyArgs });

const rows = [];
for (let i = 0; i < SAMPLES; i++) {
  const [kmh, src] = await Promise.all([evaluate(readSpeed), evaluate(readSource)]);
  rows.push([Date.now() - t0, kmh, String(src).trim()]);
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}
await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...keyArgs });
cdp.close();

writeFileSync(OUT, ["ms,kmh,active_input_source", ...rows.map((r) => r.join(","))].join("\n") + "\n");

const at = (v) => rows.find((r) => r[1] >= v);
console.log(`\n${rows.length}개 샘플 → ${OUT}`);
console.log("0→100 km/h:", at(100)?.[0] ?? "미도달", "ms");
console.log("0→200 km/h:", at(200)?.[0] ?? "미도달", "ms");
console.log("최종:", rows[rows.length - 1]?.join(" / "));
