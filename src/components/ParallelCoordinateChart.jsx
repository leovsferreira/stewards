import { useState, useRef, useCallback, useMemo, useEffect } from "react";

// ── Axis definitions ─────────────────────────────────────────────────────────
export const PCP_AXES = [
  { key: "paved_plaza_surface_area",      label: "Paved Plaza" },
  { key: "isolated_walkway_area",         label: "Walkway" },
  { key: "meandering_sidewalk_area",      label: "Meandering" },
  { key: "fragmented_sidewalk_area",      label: "Fragmented" },
  { key: "isolated_roadway_area",         label: "Roadway" },
  { key: "vegetated_ground_surface_area", label: "Vegetation" },
  { key: "road_marking_surface_area",     label: "Road Mark" },
  { key: "n_uncertain",                   label: "Uncertain" },
];

// ── SVG viewport constants ────────────────────────────────────────────────────
const VW      = 900;
const VH      = 360;
const TOP_PAD = 32;           // horizontal labels need less top space
const BOT_PAD = 20;
const L_PAD   = 28;
const R_PAD   = 28;
const AXIS_H  = VH - TOP_PAD - BOT_PAD;
const N       = PCP_AXES.length;
const STEP    = (VW - L_PAD - R_PAD) / (N - 1);
const axX     = (i) => L_PAD + i * STEP;

// ── Colors ────────────────────────────────────────────────────────────────────
const LINE_DEFAULT   = "#b0b8c4";   // ③ all lines same neutral color
const LINE_HIGHLIGHT = "#3b82f6";   // highlighted (selected) lines
const LINE_DIM       = "#dde3ec";   // dimmed unselected lines

// ── Helpers ───────────────────────────────────────────────────────────────────
const ynToY   = (yn)          => TOP_PAD + yn * AXIS_H;
const yToYn   = (svgY)        => Math.max(0, Math.min(1, (svgY - TOP_PAD) / AXIS_H));
const valToYn = (min, max, v) => 1 - (v - min) / (max - min); // high val → top

// ⑤ Compact value formatter for tick labels
function fmtVal(v) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Number.isInteger(v) || Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10)  return v.toFixed(1);
  return v.toFixed(2);
}

/**
 * ParallelCoordinateChart
 *
 * Props:
 *   data          – array of ALL metadata objects (meta8x8) – used for scales
 *   visibleIds    – Set<tile_id> of tiles currently visible in the viewport
 *   sortKey       – currently active sort metric
 *   onSortChange  – (key: string) => void
 *   onFilterChange– (filteredIds: Set<string> | null) => void
 */
export function ParallelCoordinateChart({ data, visibleIds, sortKey, onSortChange, onFilterChange }) {
  const svgRef = useRef(null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [brushes, setBrushes]     = useState({});
  const [liveBrush, setLiveBrush] = useState(null);
  const liveBrushRef              = useRef(null);
  liveBrushRef.current            = liveBrush;
  const dragRef                   = useRef(null);
  const onFilterRef               = useRef(onFilterChange);
  onFilterRef.current             = onFilterChange;

  // ① Restrict lines to only tiles visible in the current viewport
  const visibleData = useMemo(() => {
    if (!visibleIds || visibleIds.size === 0) return data;
    return data.filter((d) => visibleIds.has(d.tile_id));
  }, [data, visibleIds]);

  // ── Per-axis scales (from ALL data for consistency across panning) ─────────
  const scales = useMemo(() => {
    const out = {};
    for (const { key } of PCP_AXES) {
      const vals = data.map((d) => +d[key] || 0);
      const min  = Math.min(...vals);
      const max  = Math.max(...vals);
      out[key]   = { min, max: max > min ? max : min + 1 };
    }
    return out;
  }, [data]);

  // ── Filtered tile IDs (subset of visibleData) ─────────────────────────────
  const filteredIds = useMemo(() => {
    const active = Object.entries(brushes).filter(([, b]) => !!b);
    if (active.length === 0) return null;

    return new Set(
      visibleData
        .filter((d) => {
          for (const [key, brush] of active) {
            const { min, max } = scales[key];
            const yn = valToYn(min, max, +d[key] || 0);
            if (yn < brush.lo || yn > brush.hi) return false;
          }
          return true;
        })
        .map((d) => d.tile_id)
    );
  }, [brushes, visibleData, scales]);

  // Notify parent only when the actual set of IDs changes (not just reference)
  const prevFilteredRef = useRef(null);
  useEffect(() => {
    const prev = prevFilteredRef.current;
    const curr = filteredIds;

    const sameContent =
      prev === curr ||
      (prev !== null && curr !== null &&
       prev.size === curr.size &&
       [...curr].every((id) => prev.has(id)));

    if (!sameContent) {
      prevFilteredRef.current = curr;
      onFilterRef.current(curr);
    }
  }, [filteredIds]);

  // ── SVG helpers ───────────────────────────────────────────────────────────
  const clientToSvgY = useCallback((clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return TOP_PAD;
    return ((clientY - rect.top) / rect.height) * VH;
  }, []);

  const buildPath = useCallback(
    (d) =>
      PCP_AXES.map(({ key }, i) => {
        const { min, max } = scales[key];
        const yn = valToYn(min, max, +d[key] || 0);
        return `${i === 0 ? "M" : "L"}${axX(i)},${ynToY(yn)}`;
      }).join(" "),
    [scales]
  );

  // ── Brush interaction ─────────────────────────────────────────────────────
  const onAxisDown = useCallback(
    (e, axisKey) => {
      e.preventDefault();
      const yn = yToYn(clientToSvgY(e.clientY));
      dragRef.current = { type: "new", axisKey, startYn: yn };
      setLiveBrush({ axisKey, lo: yn, hi: yn });
    },
    [clientToSvgY]
  );

  const onBrushDown = useCallback(
    (e, axisKey, part) => {
      e.stopPropagation();
      e.preventDefault();
      const yn = yToYn(clientToSvgY(e.clientY));
      const b  = brushes[axisKey] ?? liveBrushRef.current;
      if (!b) return;
      dragRef.current = { type: part, axisKey, startYn: yn, origLo: b.lo, origHi: b.hi };
      setLiveBrush({ axisKey, lo: b.lo, hi: b.hi });
    },
    [clientToSvgY, brushes]
  );

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const { type, axisKey, startYn, origLo, origHi } = drag;
      const yn = yToYn(clientToSvgY(e.clientY));
      let lo, hi;

      if (type === "new") {
        lo = Math.min(startYn, yn);
        hi = Math.max(startYn, yn);
      } else if (type === "move") {
        const dy   = yn - startYn;
        const span = origHi - origLo;
        lo = Math.max(0, Math.min(1 - span, origLo + dy));
        hi = lo + span;
      } else if (type === "lo") {
        lo = Math.max(0, Math.min(origHi - 0.04, yn));
        hi = origHi;
      } else {
        lo = origLo;
        hi = Math.min(1, Math.max(origLo + 0.04, yn));
      }
      setLiveBrush({ axisKey, lo, hi });
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const lb = liveBrushRef.current;
      if (lb) {
        if (lb.hi - lb.lo < 0.025) {
          setBrushes((prev) => { const next = { ...prev }; delete next[lb.axisKey]; return next; });
        } else {
          setBrushes((prev) => ({ ...prev, [lb.axisKey]: { lo: lb.lo, hi: lb.hi } }));
        }
      }
      dragRef.current = null;
      setLiveBrush(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [clientToSvgY]);

  const dispBrushes = useMemo(() => {
    const m = { ...brushes };
    if (liveBrush) m[liveBrush.axisKey] = liveBrush;
    return m;
  }, [brushes, liveBrush]);

  const hasBrush = Object.keys(brushes).length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pcpWrapper">
      <div className="pcpHeader">
        <span className="pcpTitle">Filter &amp; Sort</span>
        {hasBrush && (
          <button className="pcpClearBtn" onClick={() => setBrushes({})}>
            Clear filters
          </button>
        )}
        {filteredIds !== null && (
          <span className="pcpCount">
            {filteredIds.size} / {visibleData.length} tiles
          </span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        width="100%"
        height={VH}
        style={{ display: "block" }}
      >
        {/* ③ Draw dimmed lines first (under), highlighted lines on top */}
        {filteredIds !== null &&
          visibleData
            .filter((d) => !filteredIds.has(d.tile_id))
            .map((d) => (
              <path
                key={d.tile_id}
                d={buildPath(d)}
                fill="none"
                stroke={LINE_DIM}
                strokeWidth={0.8}
                opacity={0.5}
              />
            ))}

        {visibleData
          .filter((d) => filteredIds === null || filteredIds.has(d.tile_id))
          .map((d) => (
            <path
              key={d.tile_id}
              d={buildPath(d)}
              fill="none"
              stroke={filteredIds !== null ? LINE_HIGHLIGHT : LINE_DEFAULT}
              strokeWidth={filteredIds !== null ? 1.5 : 1.0}
              opacity={filteredIds !== null ? 0.72 : 0.5}
            />
          ))}

        {/* ── Axes ── */}
        {PCP_AXES.map(({ key, label }, i) => {
          const x      = axX(i);
          const brush  = dispBrushes[key];
          const isSort = key === sortKey;
          const { min, max } = scales[key] ?? { min: 0, max: 1 };

          // ⑤ Five ticks: 0%, 25%, 50%, 75%, 100% along axis
          const tickFracs = [0, 0.25, 0.5, 0.75, 1];
          const ticks = tickFracs.map((f) => ({
            y:   ynToY(f),
            val: max - f * (max - min),
          }));

          return (
            <g key={key}>
              {/* Invisible hit-area for brush creation */}
              <rect
                x={x - 10}
                y={TOP_PAD}
                width={20}
                height={AXIS_H}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onMouseDown={(e) => onAxisDown(e, key)}
              />

              {/* Axis line */}
              <line
                x1={x} y1={TOP_PAD}
                x2={x} y2={TOP_PAD + AXIS_H}
                stroke={isSort ? "#3b82f6" : "#c8cdd6"}
                strokeWidth={isSort ? 2 : 1}
                pointerEvents="none"
              />

              {/* ⑤ Tick marks + value labels */}
              {ticks.map(({ y, val }, ti) => (
                <g key={ti} pointerEvents="none">
                  <line
                    x1={x - 4} y1={y}
                    x2={x + 4} y2={y}
                    stroke={isSort ? "#3b82f6" : "#c8cdd6"}
                    strokeWidth={1}
                  />
                  <text
                    x={x + 7}
                    y={y}
                    dominantBaseline="middle"
                    textAnchor="start"
                    fontSize={7}
                    fill={isSort ? "#3b82f6" : "#9aa0aa"}
                  >
                    {fmtVal(val)}
                  </text>
                </g>
              ))}

              {/* Active brush */}
              {brush && (
                <g>
                  <rect
                    x={x - 7}
                    y={ynToY(brush.lo)}
                    width={14}
                    height={Math.max(3, ynToY(brush.hi) - ynToY(brush.lo))}
                    fill="rgba(59,130,246,0.18)"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => onBrushDown(e, key, "move")}
                  />
                  <line
                    x1={x - 9} y1={ynToY(brush.lo)}
                    x2={x + 9} y2={ynToY(brush.lo)}
                    stroke="#3b82f6" strokeWidth={3} strokeLinecap="round"
                    style={{ cursor: "ns-resize" }}
                    onMouseDown={(e) => onBrushDown(e, key, "lo")}
                  />
                  <line
                    x1={x - 9} y1={ynToY(brush.hi)}
                    x2={x + 9} y2={ynToY(brush.hi)}
                    stroke="#3b82f6" strokeWidth={3} strokeLinecap="round"
                    style={{ cursor: "ns-resize" }}
                    onMouseDown={(e) => onBrushDown(e, key, "hi")}
                  />
                </g>
              )}

              {/* ② Horizontal axis label centered on the axis */}
              <text
                x={x}
                y={TOP_PAD - 10}
                textAnchor="middle"
                dominantBaseline="auto"
                fontSize={10}
                fontWeight={isSort ? 700 : 500}
                fill={isSort ? "#3b82f6" : "#555"}
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => onSortChange(key)}
                pointerEvents="all"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}