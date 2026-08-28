// cross-platform tile server launcher: reads CITY from .env and serves the
// matching map_tiles_<city> directory on :8000 (the shell substitution the old
// npm script used only worked in bash, not on Windows)
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const city = (readFileSync(".env", "utf8").match(/^CITY=(.+)$/m)?.[1] ?? "boston").trim();
const dir = `./backend/stewards_files/map_tiles_${city}`;

console.log(`[tiles] serving ${dir} on http://localhost:8000`);
spawn("python", ["-m", "http.server", "8000", "--directory", dir], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
