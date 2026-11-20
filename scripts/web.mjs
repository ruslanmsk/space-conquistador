// `npm run web`: opens the game in the browser.
// If the dev server is already running on 8081 — just print the link and open it, no questions asked.
// Otherwise start Expo for web on 8081 (Expo opens the browser itself once the bundle is ready).
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8081;
const URL = `http://localhost:${PORT}`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", shell: process.platform === "win32", detached: true }).unref();
}

async function running() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

if (await running()) {
  console.log(`\n  Игра уже запущена: ${URL}\n`);
  openBrowser(URL);
} else {
  console.log(`\n  Запускаю игру… ссылка: ${URL}\n`);
  const child = spawn("npx", ["expo", "start", "--web", "--port", String(PORT)], {
    cwd: join(root, "apps/mobile"),
    stdio: "inherit",
    env: { ...process.env, CI: process.env.CI ?? "" },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
