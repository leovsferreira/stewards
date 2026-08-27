import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

function saveNetworkPlugin(publicDir) {
  const dirAbs = () => path.resolve(process.cwd(), publicDir);

  // network.geojson is the original (also rewritten by the inference pipeline);
  // manual saves become network_edited_* files. The app loads whichever is newest.
  const latestNetworkPath = () => {
    const dir = dirAbs();
    const candidates = fs.readdirSync(dir)
      .filter((f) => f === "network.geojson" || /^network_edited_\d{8}_\d{6}_\d{3}\.geojson$/.test(f))
      .flatMap((f) => {
        const p = path.join(dir, f);
        try { return [{ p, mtime: fs.statSync(p).mtimeMs }]; }
        catch { return []; } // file vanished between readdir and stat
      })
      .sort((a, b) => b.mtime - a.mtime);
    return candidates[0]?.p ?? null;
  };

  const editedFileName = () => {
    const d = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return `network_edited_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${pad(d.getMilliseconds(), 3)}.geojson`;
  };

  return {
    name: "save-network",
    configureServer(server) {
      server.middlewares.use("/api/save-network", (req, res, next) => {
        if (req.method !== "POST") return next();

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const geojson = JSON.parse(body);
            if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
              res.statusCode = 400;
              res.end("Invalid GeoJSON: expected a FeatureCollection");
              return;
            }

            const fileName = editedFileName();
            const outPath = path.join(dirAbs(), fileName);
            fs.writeFileSync(outPath, JSON.stringify(geojson), "utf-8");

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, features: geojson.features.length, file: fileName }));
          } catch (err) {
            console.error("Save network error:", err);
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });

      server.middlewares.use("/api/latest-network", (req, res, next) => {
        if (req.method !== "GET") return next();
        try {
          const p = latestNetworkPath();
          if (!p) {
            res.statusCode = 404;
            res.end("No network file found");
            return;
          }
          const data = fs.readFileSync(p);
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Network-File", path.basename(p));
          res.end(data);
        } catch (err) {
          console.error("Latest network error:", err);
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");   // "" = load ALL vars, not just VITE_*
  const city = (env.CITY || "boston").trim();
  const publicDir = `public_${city}`;

  // ── startup diagnostics: says exactly why the layers would 404 ──
  const abs = path.resolve(process.cwd(), publicDir);
  console.log(`[stewards] CITY=${city}  ->  publicDir=${publicDir}`);
  console.log(`[stewards] resolved to ${abs}`);
  if (!fs.existsSync(abs)) {
    console.error(`[stewards] ERROR: that folder does not exist. Create it (see the `
      + `migration doc, step 2) or fix CITY in .env.`);
  } else {
    const files = fs.readdirSync(abs);
    console.log(`[stewards] contents: ${files.join("  ") || "(empty)"}`);
    for (const required of ["network.geojson", "polygons.geojson", "meta"]) {
      if (!files.includes(required)) {
        console.error(`[stewards] MISSING: ${publicDir}/${required} `
          + `-> requests for it will return index.html and fail to parse as JSON`);
      }
    }
    if (files.includes(publicDir)) {
      console.error(`[stewards] NESTED FOLDER: ${publicDir}/${publicDir} exists — `
        + `move its contents one level up`);
    }
  }

  return {
    plugins: [react(), saveNetworkPlugin(publicDir)],
    publicDir,
    server: {
      proxy: {
        "/tiles": {
          target: "http://localhost:8000",
          changeOrigin: true,
        },
        "/api/apply-model": {
          target: "http://localhost:8001",
          changeOrigin: true,
        },
        "/api/train": {
          target: "http://localhost:8001",
          changeOrigin: true,
        },
      },
    },
  };
});
