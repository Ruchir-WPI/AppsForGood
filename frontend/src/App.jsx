import { useState, useRef, useEffect, useCallback } from "react";

// ── Constants ────────────────────────────────────────────────────────────────

const BUILDINGS = [
  { id: "ambulatory",         label: "Ambulatory Care Center",   cx: 280, cy: 417, type: "clinical" },
  { id: "albert-sherman",     label: "Albert Sherman Center",     cx: 180, cy: 417, type: "clinical" },
  { id: "medical-school",     label: "Medical School Building",   cx: 405, cy: 417, type: "academic" },
  { id: "lazare",             label: "Lazare Research Building",  cx: 500, cy: 417, type: "research" },
  { id: "paul-dimare",        label: "Paul J. DiMare Center",     cx: 175, cy: 332, type: "clinical" },
  { id: "leahy",              label: "Paul T. Leahy Center",      cx: 117, cy: 415, type: "clinical" },
  { id: "north-pavilion",     label: "North Pavilion",            cx: 400, cy: 222, type: "clinical" },
  { id: "shaw",               label: "Shaw Building",             cx: 495, cy: 332, type: "clinical" },
  { id: "anderson",           label: "Anderson House",            cx: 567, cy: 410, type: "admin" },
  { id: "benedict",           label: "Benedict Building",         cx: 482, cy: 139, type: "research" },
  { id: "biotech1",           label: "Biotech 1",                 cx: 137, cy: 139, type: "research" },
  { id: "biotech2",           label: "Biotech 2",                 cx: 202, cy: 139, type: "research" },
  { id: "biotech3",           label: "Biotech 3",                 cx: 267, cy: 139, type: "research" },
  { id: "biotech4",           label: "Biotech 4",                 cx: 332, cy: 139, type: "research" },
  { id: "biotech5",           label: "Biotech 5",                 cx: 397, cy: 139, type: "research" },
  { id: "west-garage",        label: "West Garage",               cx: 130, cy: 469, type: "parking" },
  { id: "south-garage",       label: "South Garage",              cx: 390, cy: 469, type: "parking" },
  { id: "plantation-garage",  label: "Plantation St. Garage",     cx: 552, cy: 199, type: "parking" },
  { id: "va-building",        label: "VA Building",               cx: 567, cy: 320, type: "admin" },
];

const BUILDING_MAP = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

const TYPE_COLORS = {
  clinical:  { fill: "#b8c0e0", stroke: "#8890c0", text: "#2a3060" },
  research:  { fill: "#d0c8e8", stroke: "#9088c0", text: "#3a2860" },
  parking:   { fill: "#ccc8b0", stroke: "#a0a080", text: "#555544" },
  admin:     { fill: "#c8d8b8", stroke: "#88a880", text: "#2a4020" },
  academic:  { fill: "#b8c8e0", stroke: "#7090c0", text: "#1a3060" },
};

const PATIENT_BUILDINGS = BUILDINGS.filter((b) =>
  ["clinical", "parking", "admin"].includes(b.type)
);

// ── API helpers ───────────────────────────────────────────────────────────────

/**
 * POST /api/route
 * Body: { from: string, to: string }
 * Expected response:
 * {
 *   steps: string[],          // turn-by-turn instructions
 *   distanceFt: number,
 *   walkMinutes: number,
 *   waypoints: { x: number, y: number }[]   // SVG coordinates for the path
 * }
 */
async function fetchRoute(from, to) {
  const res = await fetch("/api/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) throw new Error(`Route API error: ${res.status}`);
  return res.json();
}

// ── Utility ───────────────────────────────────────────────────────────────────

function buildWaypoints(from, to) {
  // Fallback straight-line waypoints used when the API is unavailable.
  const f = BUILDING_MAP[from];
  const t = BUILDING_MAP[to];
  if (!f || !t) return [];
  const mid =
    Math.abs(f.cx - t.cx) > 40 && Math.abs(f.cy - t.cy) > 40
      ? [{ x: f.cx, y: t.cy }]
      : [];
  return [{ x: f.cx, y: f.cy }, ...mid, { x: t.cx, y: t.cy }];
}

function waypointsToPoints(wps) {
  return wps.map((p) => `${p.x},${p.y}`).join(" ");
}

function estimateRoute(from, to) {
  const f = BUILDING_MAP[from];
  const t = BUILDING_MAP[to];
  const dist = Math.round(
    Math.sqrt(Math.pow(f.cx - t.cx, 2) + Math.pow(f.cy - t.cy, 2)) * 1.5
  );
  const walkMinutes = Math.max(1, Math.round(dist / 80));
  const dx = t.cx - f.cx;
  const dy = t.cy - f.cy;
  const steps = [];
  if (Math.abs(dx) > Math.abs(dy)) {
    steps.push(`Head ${dx > 0 ? "east" : "west"} along the main corridor`);
    if (Math.abs(dy) > 30)
      steps.push(`Turn ${dy > 0 ? "south" : "north"} at the next junction`);
  } else {
    steps.push(`Head ${dy > 0 ? "south" : "north"} along the path`);
    if (Math.abs(dx) > 30)
      steps.push(`Turn ${dx > 0 ? "east" : "west"} at the next junction`);
  }
  steps.push(`Arrive at ${t.label}`);
  return { steps, distanceFt: dist, walkMinutes, waypoints: buildWaypoints(from, to) };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BuildingRect({ b, isStart, isEnd, isHighlighted }) {
  const colors = TYPE_COLORS[b.type] || TYPE_COLORS.clinical;
  const w = b.id.startsWith("biotech") || b.id === "benedict" ? 55 : 80;
  const h = b.id.startsWith("biotech") || b.id === "benedict" ? 38 :
            b.id === "leahy" ? 40 :
            b.id === "plantation-garage" ? 38 : 45;
  const x = b.cx - w / 2;
  const y = b.cy - h / 2;
  const strokeWidth = isStart || isEnd ? 2.5 : isHighlighted ? 2 : 1;
  const strokeColor = isStart ? "#1a73e8" : isEnd ? "#ea4335" : colors.stroke;
  const labelLines = b.label.split(" ").reduce((acc, word) => {
    const last = acc[acc.length - 1];
    if (last && (last + " " + word).length <= 14) acc[acc.length - 1] = last + " " + word;
    else acc.push(word);
    return acc;
  }, []);

  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={3}
        fill={colors.fill} stroke={strokeColor} strokeWidth={strokeWidth}
      />
      {labelLines.map((line, i) => (
        <text
          key={i}
          x={b.cx}
          y={b.cy - ((labelLines.length - 1) * 6) + i * 12}
          fontSize={9}
          fill={colors.text}
          textAnchor="middle"
          fontFamily="sans-serif"
          fontWeight={i === 0 ? "bold" : "normal"}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function RouteMarker({ cx, cy, type }) {
  if (type === "start") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={12} fill="#1a73e8" opacity={0.2} />
        <circle cx={cx} cy={cy} r={7} fill="#1a73e8" />
        <circle cx={cx} cy={cy} r={3} fill="white" />
      </g>
    );
  }
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="#ea4335" />
      <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} stroke="white" strokeWidth={1.5} />
      <line x1={cx + 5} y1={cy - 5} x2={cx - 5} y2={cy + 5} stroke="white" strokeWidth={1.5} />
    </g>
  );
}

function StepItem({ icon, iconStyle, title, subtitle }) {
  return (
    <div style={styles.stepItem}>
      <div style={{ ...styles.stepIcon, ...iconStyle }}>{icon}</div>
      <div style={styles.stepText}>
        <div style={styles.stepTitle}>{title}</div>
        {subtitle && <div style={styles.stepSub}>{subtitle}</div>}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MapNavigation() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [zoom, setZoom] = useState(1);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const handleGetDirections = async () => {
    if (!from || !to) { showToast("Pick a start and destination"); return; }
    if (from === to)  { showToast("Start and destination are the same"); return; }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchRoute(from, to);
      setRouteData({ ...data, from, to });
      showToast(`Route to ${BUILDING_MAP[to]?.label}`);
    } catch (err) {
      // Fallback: estimate locally if API is not yet available
      console.warn("Route API unavailable, using local estimate:", err.message);
      const fallback = estimateRoute(from, to);
      setRouteData({ ...fallback, from, to });
      showToast("Using estimated route (API offline)");
    } finally {
      setLoading(false);
    }
  };

  const fromBuilding = BUILDING_MAP[from];
  const toBuilding   = BUILDING_MAP[to];
  const waypoints    = routeData?.waypoints ?? [];

  return (
    <div style={styles.wrapper}>
      {/* ── Sidebar ── */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.logo}>UMass Chan Navigation</div>

          {/* Route inputs */}
          <div style={styles.routePanel}>
            <div style={styles.routeRow}>
              <div style={{ ...styles.routeDot, background: "#1a73e8" }} />
              <select
                style={styles.select}
                value={from}
                onChange={(e) => { setFrom(e.target.value); setRouteData(null); }}
              >
                <option value="">Starting location…</option>
                {PATIENT_BUILDINGS.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </div>
            <div style={styles.routeLine} />
            <div style={styles.routeRow}>
              <div style={{ ...styles.routeDot, background: "#ea4335" }} />
              <select
                style={styles.select}
                value={to}
                onChange={(e) => { setTo(e.target.value); setRouteData(null); }}
              >
                <option value="">Destination…</option>
                {BUILDINGS.filter((b) => b.type !== "parking").map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </div>
            <button
              style={{ ...styles.goBtn, opacity: loading ? 0.7 : 1 }}
              onClick={handleGetDirections}
              disabled={loading}
            >
              {loading ? "Calculating…" : "Get Directions"}
            </button>
          </div>
        </div>

        {/* Route stats */}
        {routeData && (
          <div style={styles.routeInfo}>
            <div style={styles.routeMeta}>
              <div style={styles.routeStat}>
                <strong style={styles.routeStatNum}>{routeData.walkMinutes} min</strong>
                walk
              </div>
              <div style={styles.routeStat}>
                <strong style={styles.routeStatNum}>{routeData.distanceFt} ft</strong>
                distance
              </div>
              <div style={styles.routeStat}>
                <strong style={styles.routeStatNum}>{routeData.steps.length}</strong>
                steps
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={styles.errorBanner}>{error}</div>
        )}

        {/* Steps list */}
        <div style={styles.stepsList}>
          {!routeData ? (
            <StepItem
              icon="i"
              iconStyle={styles.iconInfo}
              title="Select a start and destination"
              subtitle="Directions will appear here"
            />
          ) : (
            <>
              <StepItem
                icon="A"
                iconStyle={styles.iconNav}
                title={fromBuilding?.label}
                subtitle="Starting point"
              />
              {routeData.steps.map((step, i) => (
                <StepItem
                  key={i}
                  icon={i + 1}
                  iconStyle={styles.iconNav}
                  title={step}
                />
              ))}
              <StepItem
                icon="B"
                iconStyle={styles.iconDest}
                title={toBuilding?.label}
                subtitle="Destination — arrived"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Map ── */}
      <div style={styles.mapArea}>
        <div style={styles.mapLabel}>UMass Chan Medical School — Worcester, MA</div>

        <svg
          viewBox="0 0 700 580"
          xmlns="http://www.w3.org/2000/svg"
          style={{ ...styles.mapSvg, transform: `scale(${zoom})`, transformOrigin: "center center" }}
        >
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#1a73e8" />
            </marker>
          </defs>

          {/* Background */}
          <rect x={0} y={0} width={700} height={580} fill="#e8ead3" />

          {/* Roads */}
          <line x1={0} y1={520} x2={700} y2={520} stroke="#c9c9a0" strokeWidth={14} />
          <text x={10} y={516} fontSize={9} fill="#888" fontFamily="sans-serif">Plantation Street</text>
          <line x1={0} y1={480} x2={700} y2={480} stroke="#d4d6ba" strokeWidth={8} />
          <text x={10} y={476} fontSize={9} fill="#999" fontFamily="sans-serif">South Road</text>
          <line x1={80} y1={0} x2={80} y2={580} stroke="#d4d6ba" strokeWidth={6} />
          <line x1={600} y1={0} x2={600} y2={580} stroke="#c9c9a0" strokeWidth={10} />
          <text x={605} y={30} fontSize={9} fill="#888" fontFamily="sans-serif">Lake Ave N</text>
          <line x1={200} y1={200} x2={200} y2={480} stroke="#dddfc5" strokeWidth={5} />
          <line x1={350} y1={100} x2={350} y2={480} stroke="#dddfc5" strokeWidth={5} />
          <line x1={100} y1={300} x2={580} y2={300} stroke="#dddfc5" strokeWidth={5} />
          <text x={102} y={296} fontSize={8} fill="#aaa" fontFamily="sans-serif">North Road</text>
          <line x1={100} y1={380} x2={580} y2={380} stroke="#dddfc5" strokeWidth={4} />
          <text x={102} y={376} fontSize={8} fill="#aaa" fontFamily="sans-serif">Second Road</text>
          <line x1={100} y1={180} x2={580} y2={180} stroke="#dddfc5" strokeWidth={4} />
          <text x={102} y={176} fontSize={8} fill="#aaa" fontFamily="sans-serif">Innovation Drive</text>

          {/* Green quads */}
          {[
            [220, 310, "Quad 1"], [310, 310, "Quad 2"],
            [220, 220, "Quad 3"], [310, 220, "Quad 4"],
          ].map(([x, y, label]) => (
            <g key={label}>
              <rect x={x} y={y} width={60} height={50} rx={4} fill="#c8d9a0" opacity={0.7} />
              <text x={x + 30} y={y + 28} fontSize={8} fill="#5a7a30" textAnchor="middle" fontFamily="sans-serif">{label}</text>
            </g>
          ))}

          {/* Buildings */}
          {BUILDINGS.map((b) => (
            <BuildingRect
              key={b.id}
              b={b}
              isStart={routeData?.from === b.id}
              isEnd={routeData?.to === b.id}
              isHighlighted={false}
            />
          ))}

          {/* Route path */}
          {waypoints.length > 1 && (
            <polyline
              points={waypointsToPoints(waypoints)}
              fill="none"
              stroke="#1a73e8"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="8,4"
              markerEnd="url(#arrow)"
              opacity={0.85}
            />
          )}

          {/* Start / end markers */}
          {routeData && fromBuilding && (
            <RouteMarker cx={fromBuilding.cx} cy={fromBuilding.cy} type="start" />
          )}
          {routeData && toBuilding && (
            <RouteMarker cx={toBuilding.cx} cy={toBuilding.cy} type="end" />
          )}

          {/* Compass */}
          <g transform="translate(655,50)">
            <circle cx={0} cy={0} r={16} fill="white" stroke="#ccc" strokeWidth={0.5} />
            <text x={0} y={-4} fontSize={10} fill="#d32" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">N</text>
            <path d="M0,-13 L3,-3 L0,-6 L-3,-3 Z" fill="#d32" />
            <path d="M0,13 L3,3 L0,6 L-3,3 Z" fill="#bbb" />
          </g>
        </svg>

        {/* Zoom controls */}
        <div style={styles.mapControls}>
          <button style={styles.mapBtn} onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}>+</button>
          <button style={styles.mapBtn} onClick={() => setZoom((z) => Math.max(z - 0.15, 0.5))}>−</button>
          <button style={styles.mapBtn} onClick={() => setZoom(1)} title="Reset zoom">⊙</button>
        </div>

        {/* Toast */}
        {toast && <div style={styles.toast}>{toast}</div>}
      </div>
    </div>
  );
}
