import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

function saveNetworkPlugin(publicDir) {
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

            const outPath = path.resolve(publicDir, "network.geojson");
            fs.writeFileSync(outPath, JSON.stringify(geojson), "utf-8");

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, features: geojson.features.length }));
          } catch (err) {
            console.error("Save network error:", err);
            res.statusCode = 500;
            res.end(String(err));
          }
        });
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
