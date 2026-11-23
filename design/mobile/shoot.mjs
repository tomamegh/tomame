// Screenshot every prototype screen at exactly 390 × 844 (@3x) through the Chrome DevTools protocol.
// Needs the design-kit server on :4321 (launch.json "design-kit"). Usage: node shoot.mjs [pins]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pins = process.argv[2] === "pins";
const OUT = pins ? "screens-haptics" : "screens";
const BASE = "http://localhost:4321/mobile/index.html";
const SHOTS = [
  ["01-welcome", "welcome"], ["02-home", "home"], ["03-buy-for-me", "chat"], ["04-product", "product/sony"],
  ["05-bag", "bag"], ["06-pay-momo", "pay"], ["07-paid", "paid"], ["08-orders", "orders"],
  ["09-track-in-flight", "track"], ["10-track-out-for-delivery", "track", "stage=5&reveal=1"],
  ["11-price-watch", "watch"], ["12-account", "account"], ["13-share-extension", "share"], ["14-lock-screen", "lock"],
];
mkdirSync(OUT, { recursive: true });

const port = 9333;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, "--hide-scrollbars", "--user-data-dir=/tmp/tm-shoot-profile", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
for (const [name, hash, extra] of SHOTS) {
  const q = `shot=1&still=1&clean=1${pins ? "&pins=1" : ""}${extra ? "&" + extra : ""}`;
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: `${BASE}?${q}#${hash}` });
  await sleep(2200);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log(`${OUT}/${name}.png`);
}
ws.close(); chrome.kill();
