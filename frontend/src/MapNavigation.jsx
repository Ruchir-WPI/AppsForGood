import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "./MapNavigation.css";
import { fetchIndoorBuildings, fetchIndoorRoute } from "./utils/navigationApi";
import { PATIENT_BUILDING_TYPES, TYPE_COLORS } from "./constants/mapNavigation";

function waypointsToPoints(wps) {
    return wps.map((p) => `${p.x},${p.y}`).join(" ");
}

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

function StepItem({ icon, iconClassName, title, subtitle }) {
    return (
        <div className="stepItem">
            <div className={`stepIcon ${iconClassName}`}>{icon}</div>
            <div className="stepText">
                <div className="stepTitle">{title}</div>
                {subtitle && <div className="stepSub">{subtitle}</div>}
            </div>
        </div>
    );
}

export default function MapNavigation() {
    const [buildings, setBuildings] = useState([]);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [routeData, setRouteData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingBuildings, setLoadingBuildings] = useState(true);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);
    const [zoom, setZoom] = useState(1);
    const toastTimer = useRef(null);

    const buildingMap = useMemo(
        () => Object.fromEntries(buildings.map((building) => [building.id, building])),
        [buildings],
    );
    const patientBuildings = useMemo(
        () => buildings.filter((building) => PATIENT_BUILDING_TYPES.has(building.type)),
        [buildings],
    );

    const showToast = useCallback((msg) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2500);
    }, []);

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    useEffect(() => {
        let cancelled = false;

        async function loadBuildings() {
            setLoadingBuildings(true);
            setError(null);

            try {
                const data = await fetchIndoorBuildings();
                if (cancelled) return;
                setBuildings(data);
            } catch (err) {
                if (cancelled) return;
                setError(err.message || "Failed to load campus locations.");
            } finally {
                if (!cancelled) {
                    setLoadingBuildings(false);
                }
            }
        }

        loadBuildings();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleGetDirections = async () => {
        if (loadingBuildings) { showToast("Loading campus locations"); return; }
        if (!from || !to) { showToast("Pick a start and destination"); return; }
        if (from === to)  { showToast("Start and destination are the same"); return; }

        setLoading(true);
        setError(null);

        try {
            const data = await fetchIndoorRoute({ from, to });
            setRouteData(data);
            showToast(`Route to ${buildingMap[to]?.label || "destination"}`);
        } catch (err) {
            setRouteData(null);
            setError(err.message || "Failed to fetch indoor route.");
            showToast("Could not fetch route");
        } finally {
            setLoading(false);
        }
    };

    const fromBuilding = buildingMap[from];
    const toBuilding   = buildingMap[to];
    const waypoints    = routeData?.waypoints ?? [];

    return (
        <div className="wrapper">
            <div className="sidebar">
                <div className="sidebarHeader">
                    <div className="logo">UMass Chan Navigation</div>

                    <div className="routePanel">
                        <div className="routeRow">
                            <div className="routeDot routeDotStart" />
                            <select
                                className="select"
                                value={from}
                                disabled={loadingBuildings}
                                onChange={(e) => { setFrom(e.target.value); setRouteData(null); }}
                            >
                                <option value="">{loadingBuildings ? "Loading locations…" : "Starting location…"}</option>
                                {patientBuildings.map((b) => (
                                    <option key={b.id} value={b.id}>{b.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="routeLine" />
                        <div className="routeRow">
                            <div className="routeDot routeDotEnd" />
                            <select
                                className="select"
                                value={to}
                                disabled={loadingBuildings}
                                onChange={(e) => { setTo(e.target.value); setRouteData(null); }}
                            >
                                <option value="">Destination…</option>
                                {buildings.filter((b) => b.type !== "parking").map((b) => (
                                    <option key={b.id} value={b.id}>{b.label}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            className={`goBtn${loading ? " goBtnLoading" : ""}`}
                            onClick={handleGetDirections}
                            disabled={loading || loadingBuildings}
                        >
                            {loading ? "Calculating…" : "Get Directions"}
                        </button>
                    </div>
                </div>

                {routeData && (
                    <div className="routeInfo">
                        <div className="routeMeta">
                            <div className="routeStat">
                                <strong className="routeStatNum">{routeData.walkMinutes} min</strong>
                                walk
                            </div>
                            <div className="routeStat">
                                <strong className="routeStatNum">{routeData.distanceFt} ft</strong>
                                distance
                            </div>
                            <div className="routeStat">
                                <strong className="routeStatNum">{routeData.steps.length}</strong>
                                steps
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="errorBanner">{error}</div>
                )}

                <div className="stepsList">
                    {!routeData ? (
                        <StepItem
                            icon="i"
                            iconClassName="iconInfo"
                            title="Select a start and destination"
                            subtitle="Directions will appear here"
                        />
                    ) : (
                        <>
                            <StepItem
                                icon="A"
                                iconClassName="iconNav"
                                title={fromBuilding?.label}
                                subtitle="Starting point"
                            />
                            {routeData.steps.map((step, i) => (
                                <StepItem
                                    key={i}
                                    icon={i + 1}
                                    iconClassName="iconNav"
                                    title={step}
                                />
                            ))}
                            <StepItem
                                icon="B"
                                iconClassName="iconDest"
                                title={toBuilding?.label}
                                subtitle="Destination — arrived"
                            />
                        </>
                    )}
                </div>
            </div>

            <div className="mapArea">
                <div className="mapLabel">UMass Chan Medical School — Worcester, MA</div>

                <svg
                    viewBox="0 0 700 580"
                    xmlns="http://www.w3.org/2000/svg"
                    className="mapSvg"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                >
                    <defs>
                        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                            <path d="M0,0 L0,6 L6,3 z" fill="#1a73e8" />
                        </marker>
                    </defs>

                    <rect x={0} y={0} width={700} height={580} fill="#e8ead3" />

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

                    {[
                        [220, 310, "Quad 1"], [310, 310, "Quad 2"],
                        [220, 220, "Quad 3"], [310, 220, "Quad 4"],
                    ].map(([x, y, label]) => (
                        <g key={label}>
                            <rect x={x} y={y} width={60} height={50} rx={4} fill="#c8d9a0" opacity={0.7} />
                            <text x={x + 30} y={y + 28} fontSize={8} fill="#5a7a30" textAnchor="middle" fontFamily="sans-serif">{label}</text>
                        </g>
                    ))}

                    {buildings.map((b) => (
                        <BuildingRect
                            key={b.id}
                            b={b}
                            isStart={routeData?.from === b.id}
                            isEnd={routeData?.to === b.id}
                            isHighlighted={false}
                        />
                    ))}

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

                    {routeData && fromBuilding && (
                        <RouteMarker cx={fromBuilding.cx} cy={fromBuilding.cy} type="start" />
                    )}
                    {routeData && toBuilding && (
                        <RouteMarker cx={toBuilding.cx} cy={toBuilding.cy} type="end" />
                    )}

                    <g transform="translate(655,50)">
                        <circle cx={0} cy={0} r={16} fill="white" stroke="#ccc" strokeWidth={0.5} />
                        <text x={0} y={-4} fontSize={10} fill="#d32" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">N</text>
                        <path d="M0,-13 L3,-3 L0,-6 L-3,-3 Z" fill="#d32" />
                        <path d="M0,13 L3,3 L0,6 L-3,3 Z" fill="#bbb" />
                    </g>
                </svg>

                <div className="mapControls">
                    <button className="mapBtn" onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}>+</button>
                    <button className="mapBtn" onClick={() => setZoom((z) => Math.max(z - 0.15, 0.5))}>−</button>
                    <button className="mapBtn" onClick={() => setZoom(1)} title="Reset zoom">⊙</button>
                </div>

                {toast && <div className="toast">{toast}</div>}
            </div>
        </div>
    );
}