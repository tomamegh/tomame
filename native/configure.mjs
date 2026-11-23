// Point the shell at a Tomame host: `node configure.mjs <url>` rewrites server.url in
// capacitor.config.json. `npm run sim | dev | prod` call this, then `cap sync ios`.
import { readFileSync, writeFileSync } from "node:fs";
const url = new URL(process.argv[2] ?? "https://dev.tomame.ca/m");
const f = new URL("./capacitor.config.json", import.meta.url);
const c = JSON.parse(readFileSync(f, "utf8"));
c.server = { ...c.server, url: url.href, cleartext: url.protocol === "http:" };
writeFileSync(f, JSON.stringify(c, null, 2) + "\n");
console.log("server.url →", url.href);
