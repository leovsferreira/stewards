# Stewards — Setup Guide

Stewards is a visual analytics tool for pedestrian network mapping and repair. It combines a React/MapLibre GL frontend with a Python FastAPI backend and a local tile server.

---

## Prerequisites

Before setting up Stewards, make sure you have the following installed:

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.19.0 | Required by Vite/React |
| npm | ≥ 8.0.0 | Bundled with Node.js |
| Python | ≥ 3.9 | For the backend and tile server |
| pip | latest | For Python dependencies |
| Google Maps API Key | — | Required for Street View integration |

---

## Repository Structure

After cloning and placing all required files, your project should look like this:

```
stewards/
├── .env                          ← You create this (see Step 3)
├── public/
│   ├── polygons.geojson          ← Global sidewalk polygons
│   └── network.geojson           ← Global pedestrian network
├── src/                          ← React frontend source
├── backend/
│   ├── server.py                 ← FastAPI server entry point
│   ├── requirements.txt
│   └── stewards_files/
│       ├── map_tiles/            ← Raster map tiles for the tile server
│       └── boston/
│           ├── tiles/            ← Satellite imagery tiles (zoom-20 PNG)
│           ├── masks_tile2net_polygons/   ← tile2net prediction masks
│           ├── masks_confidence/          ← Confidence score masks
│           ├── masks_groundtruth_polygons/ ← Ground-truth polygon masks
│           └── stewards_scripts/
│               ├── train_from_suggestions.py
│               ├── apply_model.py
│               ├── helper_scripts/
│               └── output/       ← Trained model checkpoints saved here
└── vite.config.js
```

---

## Step 1 — Clone the Repository

```bash
git clone <repository-url>
cd stewards
```

---

## Step 2 — Download and Place the Data Folder

The `stewards_files` folder contains large binary data (satellite tiles, masks, map tiles) and is distributed separately from the repository.

1. Download the `stewards_files` archive (shared separately).
2. Place it inside `./backend/` so the path is `stewards/backend/stewards_files/`.

The folder must contain:

```
stewards_files/
├── map_tiles/                    ← Used by the tile server (port 8002)
└── boston/
    ├── tiles/
    ├── masks_tile2net_polygons/
    ├── masks_confidence/
    ├── masks_groundtruth_polygons/
    └── stewards_scripts/
        ├── train_from_suggestions.py
        ├── apply_model.py
        ├── helper_scripts/
        └── output/
```

> **Note:** The `public/polygons.geojson` and `public/network.geojson` files are also distributed separately. Place them in the `public/` folder at the project root before running.

---

## Step 3 — Create Your `.env` File

Create a file named `.env` in the **project root** (`stewards/.env`). This file configures all local file paths and your Google Maps API key. It is gitignored and must be created manually on each machine.

```dotenv
# ── Satellite tile directories (zoom-20 PNG files) ──
TILES_DIR=C:/Users/your_user/path/to/stewards/backend/stewards_files/boston/tiles

# ── tile2net prediction mask directory ──
T2N_DIR=C:/Users/your_user/path/to/stewards/backend/stewards_files/boston/masks_tile2net_polygons

# ── Confidence score mask directory ──
CONF_DIR=C:/Users/your_user/path/to/stewards/backend/stewards_files/boston/masks_confidence

# ── Ground-truth polygon mask directory ──
GT_DIR=C:/Users/your_user/path/to/stewards/backend/stewards_files/boston/masks_groundtruth_polygons

# ── Global GeoJSON files (served from /public) ──
ORIGINAL_POLYGONS=C:/Users/your_user/path/to/stewards/public/polygons.geojson
ORIGINAL_NETWORK=C:/Users/your_user/path/to/stewards/public/network.geojson

# ── Directory where trained model checkpoints are saved ──
TRANED_MODEL_OUTPUT=C:/Users/your_user/path/to/stewards/backend/stewards_files/boston/stewards_scripts/output

# ── Helper scripts directory (training utilities) ──
HELPERS_PATH=C:/Users/your_user/path/to/stewards/backend/stewards_files/boston/stewards_scripts/helper_scripts

# ── Stewards ML scripts directory ──
SCRIPT_PATH=C:/Users/your_user/path/to/stewards/backend/stewards_files/boston/stewards_scripts

# ── Google Maps API key (for Street View) ──
VITE_GOOGLE_MAPS_KEY=your_google_maps_api_key_here
```

> **Windows & macOS:** Use forward slashes (`/`) in all paths. Python handles them correctly on all platforms, including Windows.

> **Important:** All paths must be **absolute, full paths** — not relative paths or bare directory names.

---

## Step 4 — Install Frontend Dependencies

From the **project root**:

```bash
npm install
```

This installs React, MapLibre GL JS, Vite, and all other frontend dependencies.

---

## Step 5 — Install Python Dependencies

From the **`./backend`** folder:

```bash
cd backend
pip install -r requirements.txt
```

This installs FastAPI, Uvicorn, geopandas, pyogrio, PyTorch, and all other backend dependencies.

> **Note:** If you are on a system with multiple Python environments (e.g., conda), make sure you are installing into the correct environment that will be used to run the server.

---

## Step 6 — Run the Application

Stewards requires **three processes running simultaneously**, each in its own terminal. Start them in the order listed below.

---

### Terminal 1 — Frontend Dev Server

From the **project root**:

```bash
npm run dev
```

Starts the Vite development server. The app will be available at:

```
http://localhost:5173
```

---

### Terminal 2 — Backend API Server

From the **`./backend`** folder:

```bash
cd backend
uvicorn server:app --reload --port 8001
```

Starts the FastAPI server that handles training and inference requests. The API runs at:

```
http://localhost:8001
```

> The Vite dev server proxies `/api/*` requests to this port automatically — no additional configuration needed.

---

### Terminal 3 — Map Tile Server

From the **project root**:

```bash
python -m http.server 8002 --directory ./backend/stewards_files/map_tiles
```

Serves the raster map tile files used as the base map. Tiles are requested by the frontend at:

```
http://localhost:8002/{z}/{x}/{y}.png
```

---

## Verifying the Setup

Once all three processes are running, open your browser at **http://localhost:5173**.

You should see:
- The map loads with raster tiles from the tile server.
- Sidewalk polygon overlays are visible on the map.
- The sidebar shows tile cards at the appropriate zoom levels.

If anything fails to load, check the browser console and each terminal for error messages.

---

## Troubleshooting

**Map tiles are blank or show a 404**  
Confirm the tile server (Terminal 3) is running and that `./backend/stewards_files/map_tiles/` exists and contains tile files in `{z}/{x}/{y}.png` format.

**Polygons or network don't appear**  
Confirm that `public/polygons.geojson` and `public/network.geojson` exist at the project root. These are distributed separately from the repository.

**Backend returns a 500 error on training or inference**  
Check that all `.env` paths are correct and point to existing directories. Confirm that `stewards_scripts/` contains `train_from_suggestions.py` and `apply_model.py`, and that Python dependencies are installed in the same environment used to run Uvicorn.

**Encoding error on Windows during training or inference**  
Ensure you are using Python ≥ 3.9. The backend explicitly sets `encoding="utf-8"` on all subprocesses, but older Python versions may ignore this on some Windows configurations.

**Street View panel does not load**  
Confirm that `VITE_GOOGLE_MAPS_KEY` is set correctly in `.env` and that the key has the **Maps JavaScript API** and **Street View Static API** enabled in the Google Cloud Console.

**Port already in use**  
If any port (5173, 8001, or 8002) is occupied, stop the conflicting process. If you need to change port 8001 or 8002, update `vite.config.js` to match.

---

## Required Files Summary

| File / Folder | Source | Location in Project |
|---|---|---|
| `backend/stewards_files/` | Distributed separately | `stewards/backend/stewards_files/` |
| `public/polygons.geojson` | Distributed separately | `stewards/public/` |
| `public/network.geojson` | Distributed separately | `stewards/public/` |
| `.env` | Created manually per machine | `stewards/.env` |
| `VITE_GOOGLE_MAPS_KEY` | Google Cloud Console | Inside `.env` |

---

## Port Reference

| Service | Port | Start from |
|---|---|---|
| Frontend (Vite) | 5173 | Project root |
| Backend API (FastAPI) | 8001 | `./backend/` |
| Map Tile Server | 8002 | Project root |