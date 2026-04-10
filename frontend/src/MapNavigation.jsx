import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "./MapNavigation.css";
import { fetchIndoorGraphRoute, fetchIndoorMapData } from "./utils/navigationApi";
import {
    EDGE_STYLE,
    FLOOR_BG_COLORS,
    INDOOR_ROUTING_ALGORITHM,
    MAX_MAP_ZOOM,
    MAP_PADDING,
    MAP_SCALE,
    MIN_MAP_ZOOM,
    PAN_OVERSCROLL_RATIO,
    NODE_TYPE_STYLES,
    ZOOM_STEP,
} from "./constants/mapNavigation";

const EMPTY_INDOOR_MAP = {
    buildings: [],
    floors: [],
    rooms: [],
    nodes: [],
    edges: [],
    entrances: [],
    outdoorPoints: [],
};

function toProjectedPoint(node) {
    return {
        x: node.x * MAP_SCALE,
        y: node.y * MAP_SCALE,
    };
}

function segmentKey(a, b) {
    return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function endpointToRequest(endpointValue, entranceMap) {
    const [kind, id] = endpointValue.split(":");
    if (kind === "room") {
        return { roomId: id };
    }

    if (kind === "entrance") {
        const entrance = entranceMap.get(id);
        if (!entrance) {
            return null;
        }

        return { nodeId: entrance.indoorNodeId };
    }

    return null;
}

function endpointLabel(endpointValue, roomMap, entranceMap) {
    const [kind, id] = endpointValue.split(":");
    if (kind === "room") {
        return roomMap.get(id)?.name || id;
    }

    if (kind === "entrance") {
        return `${entranceMap.get(id)?.label || id}`;
    }

    return endpointValue;
}

function getNodeStyle(type) {
    return NODE_TYPE_STYLES[type] || NODE_TYPE_STYLES.default;
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function clampPanForZoom(pan, zoom, mapBounds) {
    const visibleWidth = mapBounds.width / zoom;
    const visibleHeight = mapBounds.height / zoom;
    const baseMaxPanX = Math.max(0, (mapBounds.width - visibleWidth) / 2);
    const baseMaxPanY = Math.max(0, (mapBounds.height - visibleHeight) / 2);
    const maxPanX = baseMaxPanX + (visibleWidth * PAN_OVERSCROLL_RATIO);
    const maxPanY = baseMaxPanY + (visibleHeight * PAN_OVERSCROLL_RATIO);

    return {
        x: clampNumber(pan.x, -maxPanX, maxPanX),
        y: clampNumber(pan.y, -maxPanY, maxPanY),
    };
}

function computeViewBox(nodes) {
    if (nodes.length === 0) {
        return {
            minX: 0,
            minY: 0,
            width: 320,
            height: 240,
            value: "0 0 320 240",
        };
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    nodes.forEach((node) => {
        const point = toProjectedPoint(node);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    });

    const width = Math.max(140, maxX - minX);
    const height = Math.max(140, maxY - minY);
    const value = `${minX - MAP_PADDING} ${minY - MAP_PADDING} ${width + (MAP_PADDING * 2)} ${height + (MAP_PADDING * 2)}`;

    return {
        minX,
        minY,
        width,
        height,
        value,
    };
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
    const [mapData, setMapData] = useState(null);
    const [selectedBuildingId, setSelectedBuildingId] = useState("");
    const [selectedFloorId, setSelectedFloorId] = useState("");
    const [fromEndpoint, setFromEndpoint] = useState("");
    const [toEndpoint, setToEndpoint] = useState("");
    const [routeData, setRouteData] = useState(null);
    const [loadingMap, setLoadingMap] = useState(true);
    const [loadingRoute, setLoadingRoute] = useState(false);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const mapAreaRef = useRef(null);
    const panStateRef = useRef(null);
    const toastTimer = useRef(null);

    const showToast = useCallback((message) => {
        setToast(message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2500);
    }, []);

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    useEffect(() => {
        let cancelled = false;

        async function loadIndoorMap() {
            setLoadingMap(true);
            setError(null);

            try {
                const payload = await fetchIndoorMapData();
                if (cancelled) {
                    return;
                }

                setMapData(payload);

                if (payload.buildings.length > 0) {
                    setSelectedBuildingId(payload.buildings[0].id);
                }
            } catch (err) {
                if (cancelled) {
                    return;
                }

                setError(err.message || "Failed to load indoor map data.");
            } finally {
                if (!cancelled) {
                    setLoadingMap(false);
                }
            }
        }

        loadIndoorMap();

        return () => {
            cancelled = true;
        };
    }, []);

    const normalizedMapData = mapData || EMPTY_INDOOR_MAP;
    const { buildings, floors, rooms, nodes, edges, entrances, outdoorPoints } = normalizedMapData;

    const buildingMap = useMemo(
        () => new Map(buildings.map((building) => [building.id, building])),
        [buildings],
    );
    const floorMap = useMemo(
        () => new Map(floors.map((floor) => [floor.id, floor])),
        [floors],
    );
    const roomMap = useMemo(
        () => new Map(rooms.map((room) => [room.id, room])),
        [rooms],
    );
    const nodeMap = useMemo(
        () => new Map(nodes.map((node) => [node.id, node])),
        [nodes],
    );
    const entranceMap = useMemo(
        () => new Map(entrances.map((entrance) => [entrance.id, entrance])),
        [entrances],
    );

    const selectedBuilding = buildingMap.get(selectedBuildingId) || null;

    const floorsForBuilding = useMemo(
        () => floors
            .filter((floor) => floor.buildingId === selectedBuildingId)
            .sort((a, b) => a.level - b.level),
        [floors, selectedBuildingId],
    );
    const roomsForBuilding = useMemo(
        () => rooms.filter((room) => room.buildingId === selectedBuildingId),
        [rooms, selectedBuildingId],
    );
    const buildingNodes = useMemo(
        () => nodes.filter((node) => node.buildingId === selectedBuildingId),
        [nodes, selectedBuildingId],
    );
    const floorNodes = useMemo(
        () => buildingNodes.filter((node) => node.floorId === selectedFloorId),
        [buildingNodes, selectedFloorId],
    );

    const floorNodeIds = useMemo(
        () => new Set(floorNodes.map((node) => node.id)),
        [floorNodes],
    );

    const floorEdges = useMemo(
        () => edges.filter((edge) => floorNodeIds.has(edge.fromNodeId) && floorNodeIds.has(edge.toNodeId)),
        [edges, floorNodeIds],
    );

    const entrancesForBuilding = useMemo(
        () => entrances
            .filter((entrance) => entrance.buildingId === selectedBuildingId)
            .map((entrance) => ({
                entrance,
                node: nodeMap.get(entrance.indoorNodeId) || null,
            }))
            .filter((entry) => Boolean(entry.node)),
        [entrances, selectedBuildingId, nodeMap],
    );

    const floorEntrances = useMemo(
        () => entrancesForBuilding.filter((entry) => entry.node.floorId === selectedFloorId),
        [entrancesForBuilding, selectedFloorId],
    );

    const entranceOptions = useMemo(
        () => entrancesForBuilding.map(({ entrance, node }) => ({
            value: `entrance:${entrance.id}`,
            label: `${entrance.label} (${floorMap.get(node.floorId)?.name || node.floorId})`,
        })),
        [entrancesForBuilding, floorMap],
    );

    const roomOptions = useMemo(
        () => roomsForBuilding.map((room) => ({
            value: `room:${room.id}`,
            label: `${room.name} (${floorMap.get(room.floorId)?.name || room.floorId})`,
        })),
        [roomsForBuilding, floorMap],
    );

    const endpointValues = useMemo(
        () => new Set([...entranceOptions, ...roomOptions].map((option) => option.value)),
        [entranceOptions, roomOptions],
    );

    const projectedNodeMap = useMemo(() => {
        const projected = new Map();
        buildingNodes.forEach((node) => {
            projected.set(node.id, toProjectedPoint(node));
        });
        return projected;
    }, [buildingNodes]);

    const viewBox = useMemo(
        () => computeViewBox(buildingNodes),
        [buildingNodes],
    );

    const mapBounds = useMemo(
        () => ({
            x: viewBox.minX - MAP_PADDING,
            y: viewBox.minY - MAP_PADDING,
            width: viewBox.width + (MAP_PADDING * 2),
            height: viewBox.height + (MAP_PADDING * 2),
        }),
        [viewBox],
    );

    const clampedPan = useMemo(
        () => clampPanForZoom(pan, zoom, mapBounds),
        [pan, zoom, mapBounds],
    );

    const interactiveViewBox = useMemo(() => {
        const visibleWidth = mapBounds.width / zoom;
        const visibleHeight = mapBounds.height / zoom;
        const x = mapBounds.x + ((mapBounds.width - visibleWidth) / 2) + clampedPan.x;
        const y = mapBounds.y + ((mapBounds.height - visibleHeight) / 2) + clampedPan.y;

        return {
            x,
            y,
            width: visibleWidth,
            height: visibleHeight,
            value: `${x} ${y} ${visibleWidth} ${visibleHeight}`,
        };
    }, [mapBounds, zoom, clampedPan]);

    const floorIndex = useMemo(
        () => floorsForBuilding.findIndex((floor) => floor.id === selectedFloorId),
        [floorsForBuilding, selectedFloorId],
    );

    const routeSegmentKeys = useMemo(() => {
        const keys = new Set();
        const path = routeData?.nodePath;
        if (!Array.isArray(path)) {
            return keys;
        }

        for (let i = 0; i < path.length - 1; i += 1) {
            keys.add(segmentKey(path[i], path[i + 1]));
        }

        return keys;
    }, [routeData]);

    const routeNodeIds = useMemo(() => {
        const ids = new Set();
        if (!Array.isArray(routeData?.nodePath)) {
            return ids;
        }

        routeData.nodePath.forEach((nodeId) => ids.add(nodeId));
        return ids;
    }, [routeData]);

    const floorRouteNodeIds = useMemo(() => {
        if (!Array.isArray(routeData?.nodePath)) {
            return [];
        }

        return routeData.nodePath.filter((nodeId) => floorNodeIds.has(nodeId));
    }, [routeData, floorNodeIds]);

    const routePolyline = useMemo(
        () => floorRouteNodeIds
            .map((nodeId) => {
                const point = projectedNodeMap.get(nodeId);
                return point ? `${point.x},${point.y}` : null;
            })
            .filter(Boolean)
            .join(" "),
        [floorRouteNodeIds, projectedNodeMap],
    );

    const routeFloors = useMemo(() => {
        if (!Array.isArray(routeData?.nodePath)) {
            return [];
        }

        const seen = new Set();
        return routeData.nodePath
            .map((nodeId) => nodeMap.get(nodeId)?.floorId)
            .filter((floorId) => {
                if (!floorId || seen.has(floorId)) {
                    return false;
                }
                seen.add(floorId);
                return true;
            })
            .map((floorId) => floorMap.get(floorId)?.name || floorId);
    }, [routeData, nodeMap, floorMap]);

    useEffect(() => {
        setPan((currentPan) => {
            const nextPan = clampPanForZoom(currentPan, zoom, mapBounds);
            const hasChanged = Math.abs(nextPan.x - currentPan.x) > 0.001 || Math.abs(nextPan.y - currentPan.y) > 0.001;
            return hasChanged ? nextPan : currentPan;
        });
    }, [zoom, mapBounds]);

    useEffect(() => {
        if (floorsForBuilding.length === 0) {
            setSelectedFloorId("");
            return;
        }

        const hasSelectedFloor = floorsForBuilding.some((floor) => floor.id === selectedFloorId);
        if (!hasSelectedFloor) {
            setSelectedFloorId(floorsForBuilding[0].id);
        }
    }, [floorsForBuilding, selectedFloorId]);

    useEffect(() => {
        setRouteData(null);
        setError(null);
    }, [selectedBuildingId]);

    useEffect(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, [selectedBuildingId, selectedFloorId]);

    useEffect(() => {
        if (endpointValues.size === 0) {
            setFromEndpoint("");
            setToEndpoint("");
            return;
        }

        const defaultFrom = entranceOptions[0]?.value || roomOptions[0]?.value || "";
        const safeFrom = endpointValues.has(fromEndpoint) ? fromEndpoint : defaultFrom;
        if (safeFrom !== fromEndpoint) {
            setFromEndpoint(safeFrom);
        }

        const fallbackTo =
            roomOptions.find((option) => option.value !== safeFrom)?.value
            || entranceOptions.find((option) => option.value !== safeFrom)?.value
            || "";
        const safeTo = endpointValues.has(toEndpoint) && toEndpoint !== safeFrom ? toEndpoint : fallbackTo;
        if (safeTo !== toEndpoint) {
            setToEndpoint(safeTo);
        }
    }, [endpointValues, fromEndpoint, toEndpoint, entranceOptions, roomOptions]);

    const applyZoom = useCallback((nextZoom, anchor = { xRatio: 0.5, yRatio: 0.5 }) => {
        const safeZoom = clampNumber(nextZoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM);
        if (safeZoom === zoom) {
            return;
        }

        const currentWidth = mapBounds.width / zoom;
        const currentHeight = mapBounds.height / zoom;
        const currentX = mapBounds.x + ((mapBounds.width - currentWidth) / 2) + clampedPan.x;
        const currentY = mapBounds.y + ((mapBounds.height - currentHeight) / 2) + clampedPan.y;

        const focusX = currentX + (anchor.xRatio * currentWidth);
        const focusY = currentY + (anchor.yRatio * currentHeight);

        const nextWidth = mapBounds.width / safeZoom;
        const nextHeight = mapBounds.height / safeZoom;
        const nextX = focusX - (anchor.xRatio * nextWidth);
        const nextY = focusY - (anchor.yRatio * nextHeight);

        const centeredX = mapBounds.x + ((mapBounds.width - nextWidth) / 2);
        const centeredY = mapBounds.y + ((mapBounds.height - nextHeight) / 2);
        const nextPan = clampPanForZoom(
            {
                x: nextX - centeredX,
                y: nextY - centeredY,
            },
            safeZoom,
            mapBounds,
        );

        setZoom(safeZoom);
        setPan(nextPan);
    }, [clampedPan, mapBounds, zoom]);

    useEffect(() => {
        const container = mapAreaRef.current;
        if (!container) {
            return undefined;
        }

        const handleNativeWheel = (event) => {
            event.preventDefault();
            event.stopPropagation();

            const rect = container.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return;
            }

            const xRatio = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
            const yRatio = clampNumber((event.clientY - rect.top) / rect.height, 0, 1);
            const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
            applyZoom(zoom + delta, { xRatio, yRatio });
        };

        container.addEventListener("wheel", handleNativeWheel, { passive: false });

        return () => {
            container.removeEventListener("wheel", handleNativeWheel);
        };
    }, [applyZoom, zoom]);

    const handlePointerDown = useCallback((event) => {
        if (event.button !== 0) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        event.currentTarget.setPointerCapture(event.pointerId);
        panStateRef.current = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startPan: clampedPan,
        };
        setIsPanning(true);
    }, [clampedPan]);

    const handlePointerMove = useCallback((event) => {
        const panState = panStateRef.current;
        if (!panState || panState.pointerId !== event.pointerId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const container = mapAreaRef.current;
        if (!container) {
            return;
        }

        const rect = container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }

        const visibleWidth = mapBounds.width / zoom;
        const visibleHeight = mapBounds.height / zoom;
        const deltaX = event.clientX - panState.startClientX;
        const deltaY = event.clientY - panState.startClientY;

        const nextPan = clampPanForZoom(
            {
                x: panState.startPan.x - ((deltaX / rect.width) * visibleWidth),
                y: panState.startPan.y - ((deltaY / rect.height) * visibleHeight),
            },
            zoom,
            mapBounds,
        );

        setPan(nextPan);
    }, [mapBounds, zoom]);

    const handlePointerUp = useCallback((event) => {
        const panState = panStateRef.current;
        if (!panState || panState.pointerId !== event.pointerId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        panStateRef.current = null;
        setIsPanning(false);
    }, []);

    const resetMapView = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    const handleGetDirections = async () => {
        if (loadingMap) {
            showToast("Loading indoor data");
            return;
        }

        if (!fromEndpoint || !toEndpoint) {
            showToast("Pick start and destination");
            return;
        }

        if (fromEndpoint === toEndpoint) {
            showToast("Start and destination are the same");
            return;
        }

        const start = endpointToRequest(fromEndpoint, entranceMap);
        const destination = endpointToRequest(toEndpoint, entranceMap);

        if (!start || !destination) {
            setError("Invalid start or destination selection.");
            return;
        }

        setLoadingRoute(true);
        setError(null);

        try {
            const route = await fetchIndoorGraphRoute({
                start,
                destination,
                buildingId: selectedBuildingId,
                options: {
                    algorithm: INDOOR_ROUTING_ALGORITHM,
                },
            });

            setRouteData(route);

            const startNode = nodeMap.get(route.selectedStartNodeId);
            if (startNode?.floorId) {
                setSelectedFloorId(startNode.floorId);
            }

            showToast("Indoor route generated");
        } catch (err) {
            setRouteData(null);
            setError(err.message || "Failed to compute indoor route.");
            showToast("Could not compute route");
        } finally {
            setLoadingRoute(false);
        }
    };

    const selectedFloor = floorMap.get(selectedFloorId) || null;
    const routeStartPoint = routeData ? projectedNodeMap.get(routeData.selectedStartNodeId) : null;
    const routeEndPoint = routeData ? projectedNodeMap.get(routeData.selectedDestinationNodeId) : null;

    return (
        <div className="wrapper">
            <div className="sidebar">
                <div className="sidebarHeader">
                    <div className="logo">UMass Memorial Indoor Navigation</div>

                    <div className="routePanel">
                        <div className="controlBlock">
                            <label className="controlLabel" htmlFor="building-select">Building</label>
                            <select
                                id="building-select"
                                className="select"
                                value={selectedBuildingId}
                                disabled={loadingMap}
                                onChange={(event) => {
                                    setSelectedBuildingId(event.target.value);
                                    setFromEndpoint("");
                                    setToEndpoint("");
                                }}
                            >
                                {buildings.map((building) => (
                                    <option key={building.id} value={building.id}>{building.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="floorTabs">
                            {floorsForBuilding.map((floor) => (
                                <button
                                    key={floor.id}
                                    type="button"
                                    className={`floorTab${floor.id === selectedFloorId ? " floorTabActive" : ""}`}
                                    onClick={() => setSelectedFloorId(floor.id)}
                                >
                                    {floor.name}
                                </button>
                            ))}
                        </div>

                        <div className="routeRow">
                            <div className="routeDot routeDotStart" />
                            <select
                                className="select"
                                aria-label="Start point"
                                value={fromEndpoint}
                                disabled={loadingMap}
                                onChange={(event) => {
                                    setFromEndpoint(event.target.value);
                                    setRouteData(null);
                                }}
                            >
                                <option value="">Start point...</option>
                                {entranceOptions.length > 0 && (
                                    <optgroup label="Entrances">
                                        {entranceOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {roomOptions.length > 0 && (
                                    <optgroup label="Rooms">
                                        {roomOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        <div className="routeLine" />

                        <div className="routeRow">
                            <div className="routeDot routeDotEnd" />
                            <select
                                className="select"
                                aria-label="Destination"
                                value={toEndpoint}
                                disabled={loadingMap}
                                onChange={(event) => {
                                    setToEndpoint(event.target.value);
                                    setRouteData(null);
                                }}
                            >
                                <option value="">Destination...</option>
                                {entranceOptions.length > 0 && (
                                    <optgroup label="Entrances">
                                        {entranceOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {roomOptions.length > 0 && (
                                    <optgroup label="Rooms">
                                        {roomOptions.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        <button
                            className={`goBtn${loadingRoute ? " goBtnLoading" : ""}`}
                            onClick={handleGetDirections}
                            disabled={loadingRoute || loadingMap}
                        >
                            {loadingRoute ? "Routing..." : "Generate Indoor Route"}
                        </button>
                    </div>
                </div>

                {routeData && (
                    <div className="routeInfo">
                        <div className="routeMeta">
                            <div className="routeStat">
                                <strong className="routeStatNum">{routeData.totalDistance}</strong>
                                distance units
                            </div>
                            <div className="routeStat">
                                <strong className="routeStatNum">{routeData.steps.length}</strong>
                                instructions
                            </div>
                            <div className="routeStat">
                                <strong className="routeStatNum">{routeData.meta?.visitedNodeCount ?? 0}</strong>
                                nodes visited
                            </div>
                            <div className="routeStat">
                                <strong className="routeStatNum">{routeData.meta?.algorithm || "A*"}</strong>
                                algorithm
                            </div>
                        </div>
                        {routeFloors.length > 0 && (
                            <div className="routeFloors">Route floors: {routeFloors.join(" -> ")}</div>
                        )}
                    </div>
                )}

                {error && <div className="errorBanner">{error}</div>}

                <div className="stepsList">
                    {!routeData ? (
                        <StepItem
                            icon="i"
                            iconClassName="iconInfo"
                            title="Select indoor start and destination"
                            subtitle="Routes are generated from sampleCampus graph data"
                        />
                    ) : (
                        <>
                            <StepItem
                                icon="A"
                                iconClassName="iconNav"
                                title={endpointLabel(fromEndpoint, roomMap, entranceMap)}
                                subtitle="Start"
                            />
                            {routeData.steps.map((step, index) => (
                                <StepItem
                                    key={step.edgeId}
                                    icon={index + 1}
                                    iconClassName="iconNav"
                                    title={step.instruction}
                                    subtitle={`${step.distance} units on ${floorMap.get(step.toFloorId)?.name || step.toFloorId}`}
                                />
                            ))}
                            <StepItem
                                icon="B"
                                iconClassName="iconDest"
                                title={endpointLabel(toEndpoint, roomMap, entranceMap)}
                                subtitle="Destination"
                            />
                        </>
                    )}

                    <div className="metaSection">
                        <div className="metaTitle">Entrances</div>
                        {entrancesForBuilding.map(({ entrance, node }) => (
                            <div key={entrance.id} className="metaLine">
                                <span>{entrance.label}</span>
                                <span>{floorMap.get(node.floorId)?.name || node.floorId}</span>
                            </div>
                        ))}

                        <div className="metaTitle">Outdoor Points</div>
                        {outdoorPoints.map((point) => (
                            <div key={point.id} className="metaLine">
                                <span>{point.label}</span>
                                <span>{point.type}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mapArea">
                <div
                    ref={mapAreaRef}
                    className={`mapPanViewport${isPanning ? " mapPanViewportPanning" : ""}`}
                >
                <div className="mapLabel">
                    {selectedBuilding?.name || "Indoor Map"}
                    {selectedFloor ? ` - ${selectedFloor.name}` : ""}
                </div>

                <svg
                    viewBox={interactiveViewBox.value}
                    xmlns="http://www.w3.org/2000/svg"
                    className="mapSvg"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    <rect
                        x={mapBounds.x}
                        y={mapBounds.y}
                        width={mapBounds.width}
                        height={mapBounds.height}
                        fill={FLOOR_BG_COLORS[Math.max(0, floorIndex) % FLOOR_BG_COLORS.length]}
                        stroke="#d8e1eb"
                        strokeWidth={1.2}
                        rx={10}
                    />

                    {floorEdges.map((edge) => {
                        const fromNode = projectedNodeMap.get(edge.fromNodeId);
                        const toNode = projectedNodeMap.get(edge.toNodeId);
                        if (!fromNode || !toNode) {
                            return null;
                        }

                        const isRouteEdge = routeSegmentKeys.has(segmentKey(edge.fromNodeId, edge.toNodeId));
                        const stroke = isRouteEdge
                            ? EDGE_STYLE.route
                            : edge.accessibility?.stairsOnly
                                ? EDGE_STYLE.stairs
                                : edge.accessibility?.wheelchair
                                    ? EDGE_STYLE.elevator
                                    : EDGE_STYLE.base;

                        return (
                            <line
                                key={edge.id}
                                x1={fromNode.x}
                                y1={fromNode.y}
                                x2={toNode.x}
                                y2={toNode.y}
                                stroke={stroke}
                                strokeWidth={isRouteEdge ? 4.8 : 3}
                                strokeLinecap="round"
                                opacity={isRouteEdge ? 0.95 : 0.8}
                            />
                        );
                    })}

                    {routePolyline && (
                        <polyline
                            points={routePolyline}
                            fill="none"
                            stroke={EDGE_STYLE.route}
                            strokeWidth={5.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="8 5"
                            opacity={0.9}
                        />
                    )}

                    {floorNodes.map((node) => {
                        const point = projectedNodeMap.get(node.id);
                        if (!point) {
                            return null;
                        }

                        const style = getNodeStyle(node.type);
                        const onRoute = routeNodeIds.has(node.id);

                        return (
                            <g key={node.id}>
                                <circle
                                    cx={point.x}
                                    cy={point.y}
                                    r={onRoute ? style.radius + 1.3 : style.radius}
                                    fill={style.fill}
                                    stroke={style.stroke}
                                    strokeWidth={onRoute ? 2.2 : 1.6}
                                />

                                {(node.type === "room_entrance" || node.type === "exit" || node.type === "stairs" || node.type === "elevator") && (
                                    <text
                                        x={point.x + 9}
                                        y={point.y - 11}
                                        fontSize="8"
                                        fill="#1e293b"
                                        fontFamily="sans-serif"
                                        fontWeight="600"
                                    >
                                        {node.label}
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {floorEntrances.map(({ entrance, node }) => {
                        const point = projectedNodeMap.get(node.id);
                        if (!point) {
                            return null;
                        }

                        return (
                            <g key={entrance.id}>
                                <rect
                                    x={point.x - 9}
                                    y={point.y - 9}
                                    width={18}
                                    height={18}
                                    transform={`rotate(45 ${point.x} ${point.y})`}
                                    fill="#ffffff"
                                    stroke="#00a26d"
                                    strokeWidth={2}
                                />
                                <text
                                    x={point.x + 14}
                                    y={point.y + 18}
                                    fontSize="7"
                                    fill="#065f46"
                                    fontFamily="sans-serif"
                                    fontWeight="700"
                                >
                                    {entrance.label}
                                </text>
                            </g>
                        );
                    })}

                    {routeStartPoint && (
                        <circle cx={routeStartPoint.x} cy={routeStartPoint.y} r={11} fill="#1a73e8" opacity={0.25} />
                    )}
                    {routeEndPoint && (
                        <circle cx={routeEndPoint.x} cy={routeEndPoint.y} r={11} fill="#ea4335" opacity={0.25} />
                    )}
                </svg>

                <div className="legendBox">
                    {Object.entries(NODE_TYPE_STYLES)
                        .filter(([type]) => type !== "default")
                        .map(([type, style]) => (
                            <div key={type} className="legendRow">
                                <span className="legendSwatch" style={{ background: style.fill, borderColor: style.stroke }} />
                                <span>{style.legend}</span>
                            </div>
                        ))}
                </div>

                {!loadingMap && floorNodes.length === 0 && (
                    <div className="emptyState">No indoor nodes were found for this floor.</div>
                )}

                <div className="mapControls">
                    <button className="mapBtn" onClick={() => applyZoom(zoom + ZOOM_STEP)} title="Zoom in">+</button>
                    <button className="mapBtn" onClick={() => applyZoom(zoom - ZOOM_STEP)} title="Zoom out">-</button>
                    <button className="mapBtn" onClick={resetMapView} title="Reset view">o</button>
                    <div className="zoomValue">{Math.round(zoom * 100)}%</div>
                </div>

                {toast && <div className="toast">{toast}</div>}
                </div>
            </div>
        </div>
    );
}
