#!/usr/bin/env node
/**
 * 도구 페이지를 데스크톱·모바일 폭에서 렌더링해 스크린샷을 찍고
 * 콘솔 에러를 보고합니다.
 *
 *   node .claude/skills/math-lab-tool/scripts/preview.mjs sierpinski
 *   node .claude/skills/math-lab-tool/scripts/preview.mjs .          # 메인 페이지
 *   node .claude/skills/math-lab-tool/scripts/preview.mjs sierpinski --out /tmp/shots
 *
 * 저장소 루트에서 실행하세요. 정적 서버를 임시로 띄웠다가 알아서 정리합니다.
 * 찍은 PNG는 Read 도구로 직접 열어 눈으로 확인해야 의미가 있습니다.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PLAYWRIGHT = "/opt/node22/lib/node_modules/playwright";
const CHROMIUM = "/opt/pw-browsers/chromium";

const args = process.argv.slice(2);
const target = (args[0] ?? ".").replace(/^\.?\//, "").replace(/\/+$/, "");
const outIdx = args.indexOf("--out");
const outDir = outIdx !== -1 ? args[outIdx + 1] : "/tmp/math-lab-preview";
const root = process.cwd();

if (!existsSync(join(root, "script.js")) || !existsSync(join(root, "index.html"))) {
  console.error("저장소 루트(index.html, script.js가 있는 곳)에서 실행하세요.");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(root, "." + path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const url = target === "." ? `${base}/index.html` : `${base}/${target}/index.html`;

const { chromium } = require(PLAYWRIGHT);
const browser = await chromium.launch({ executablePath: CHROMIUM });
const problems = [];
const notes = [];
const shots = [];

// ---- 등록 검사: TOOLS 배열이 실제 폴더·썸네일과 맞는지 ----
{
  const src = await readFile(join(root, "script.js"), "utf8");
  const entries = [...src.matchAll(/\{[^{}]*?url:\s*"([^"]+)"[^{}]*?\}/gs)].map((m) => {
    const body = m[0];
    const pick = (k) => body.match(new RegExp(k + ':\\s*"([^"]+)"'))?.[1] ?? "";
    return { url: m[1], title: pick("title"), subject: pick("subject") };
  });

  const seen = new Map();
  for (const e of entries) {
    if (seen.has(e.url)) {
      problems.push(`등록 중복 — "${seen.get(e.url)}"와 "${e.title}"가 같은 ${e.url}을 가리킵니다.`);
    }
    seen.set(e.url, e.title);

    const folder = e.url.replace(/^\.?\//, "").replace(/\/+$/, "");
    if (!existsSync(join(root, folder, "index.html"))) {
      problems.push(`"${e.title}" 항목의 ${e.url}에 index.html이 없습니다 — 메인에서 누르면 404입니다.`);
    }
    const hasThumb = [".jpg", ".png", ".jpeg", ".webp"].some((x) =>
      existsSync(join(root, "thumbnails", folder + x)));
    if (!hasThumb) notes.push(`"${e.title}" 썸네일 없음 — thumbnails/${folder}.png (기호로 대체 표시됩니다)`);
  }

  const groupsBlock = src.match(/const SUBJECT_GROUPS\s*=\s*\[[\s\S]*?\];/)?.[0] ?? "";
  const subjects = new Set(
    [...groupsBlock.matchAll(/items:\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])));
  for (const e of entries) {
    if (e.subject && subjects.size && !subjects.has(e.subject)) {
      problems.push(`"${e.title}"의 과목 "${e.subject}"은 SUBJECT_GROUPS에 없어 과목 칩으로 걸러지지 않습니다.`);
    }
  }
}

for (const [name, width, height] of [["desktop", 1280, 900], ["mobile", 412, 900]]) {
  // favicon과 폰트 CDN은 이 환경의 네트워크 제약이라 무시합니다.
  const ignorable = (u) => /favicon|fonts\.(googleapis|gstatic)\.com/i.test(u);

  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", (e) => problems.push(`[${name}] JS 에러: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // URL이 없는 리소스 로드 실패는 아래 response/requestfailed에서 URL과 함께 보고합니다.
    if (/Failed to load resource/i.test(t)) return;
    problems.push(`[${name}] 콘솔: ${t}`);
  });
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() < 400 || ignorable(u)) return;
    // 썸네일은 jpg→png→jpeg→webp 순으로 일부러 찔러 보므로 404가 정상입니다.
    // 네 확장자를 모두 소진한 도구만 아래 "등록 검사"에서 따로 잡습니다.
    if (/\/thumbnails\//.test(u)) return;
    problems.push(`[${name}] ${r.status()} — ${u}`);
  });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (ignorable(u)) return;
    if (/^https?:\/\/(?!127\.0\.0\.1)/.test(u)) {
      // 이 샌드박스는 외부 CDN을 막습니다. URL 자체가 맞는지는 눈으로 확인하세요.
      notes.push(`외부 CDN이 이 환경에서 차단됨 — ${u} (GitHub Pages에서는 로드되는지 확인 필요)`);
      return;
    }
    problems.push(`[${name}] 요청 실패 — ${u} (${r.failure()?.errorText ?? "알 수 없음"})`);
  });

  const res = await page.goto(url, { waitUntil: "networkidle" });
  if (!res || res.status() >= 400) problems.push(`[${name}] 페이지 로드 실패: ${res?.status()}`);
  await page.waitForTimeout(400);

  // 가로 스크롤은 모바일에서 레이아웃이 터졌다는 신호입니다.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) problems.push(`[${name}] 가로 스크롤 ${overflow}px — 넘치는 요소가 있습니다.`);

  const shot = join(outDir, `${target === "." ? "home" : target}-${name}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  shots.push(shot);
  await page.close();
}

await browser.close();
server.close();

const uniq = (a) => [...new Set(a)];

console.log("스크린샷:");
for (const s of shots) console.log("  " + s);

if (problems.length) {
  console.log("\n고쳐야 할 문제:");
  for (const p of uniq(problems)) console.log("  - " + p);
}
if (notes.length) {
  console.log("\n참고(대개 문제 아님):");
  for (const n of uniq(notes)) console.log("  - " + n);
}
if (!problems.length) {
  console.log("\nJS 에러·깨진 링크·가로 스크롤 없음.");
}
console.log("\n스크린샷을 Read로 열어 디자인을 직접 확인하세요 — 색이나 여백이 어긋난 것은 이 스크립트가 보지 못합니다.");
if (problems.length) process.exitCode = 1;
