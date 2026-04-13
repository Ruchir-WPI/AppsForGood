import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import "./IndoorNavigation.css";
import { fetchIndoorGraphRoute, fetchIndoorMapData } from "./utils/navigationApi";
import {
    CORRIDOR_BASE_WIDTH,
    CORRIDOR_CONNECTOR_WIDTH,
    EDGE_STYLE,
    EDGE_VISUAL_INSET_RATIO,
    FLOOR_BG_COLORS,
    INITIAL_MAP_ZOOM,
    INDOOR_ROUTING_ALGORITHM,
    MAX_MAP_ZOOM,
    MAP_PADDING,
    MAP_SCALE,
    MIN_MAP_ZOOM,
    PAN_OVERSCROLL_RATIO,
    NODE_TYPE_STYLES,
    ROOM_BLOCK_LONG_SIZE,
    ROOM_BLOCK_SHORT_SIZE,
    ROOM_LABEL_FONT_SIZE,
    ROOM_AREA_OPACITY,
    SPECIAL_AREA_OPACITY,
    ZOOM_STEP,
} from "./constants/indoorNavigation";

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

function formatIndoorDistance(distanceUnits) {
    const feet = Math.max(0, Number(distanceUnits) || 0) * 3.281;
    if (feet < 1000) {
        return `${Math.round(feet)} ft`;
    }

    return `${(feet / 5280).toFixed(1)} mi`;
}

function estimateIndoorDuration(distanceUnits) {
    const feet = Math.max(0, Number(distanceUnits) || 0) * 3.281;
    const minutes = feet / 250;

    if (minutes < 1) {
        return "< 1 min";
    }

    if (minutes < 60) {
        return `${Math.round(minutes)} min`;
    }

    const roundedMinutes = Math.round(minutes);
    return `${Math.floor(roundedMinutes / 60)}h ${roundedMinutes % 60}m`;
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

function shortenSegment(fromPoint, toPoint, insetRatio = EDGE_VISUAL_INSET_RATIO) {
    const dx = toPoint.x - fromPoint.x;
    const dy = toPoint.y - fromPoint.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= 0.0001) {
        return {
            x1: fromPoint.x,
            y1: fromPoint.y,
            x2: toPoint.x,
            y2: toPoint.y,
        };
    }

    const ratio = clampNumber(insetRatio, 0, 0.48);
    const insetDistance = distance * ratio;
    const unitX = dx / distance;
    const unitY = dy / distance;

    return {
        x1: fromPoint.x + (unitX * insetDistance),
        y1: fromPoint.y + (unitY * insetDistance),
        x2: toPoint.x - (unitX * insetDistance),
        y2: toPoint.y - (unitY * insetDistance),
    };
}

function buildRoomArea(roomNode, anchorPoint) {
    const defaultWidth = ROOM_BLOCK_SHORT_SIZE;
    const defaultHeight = ROOM_BLOCK_SHORT_SIZE;

    if (!anchorPoint) {
        return {
            x: roomNode.x - (defaultWidth / 2),
            y: roomNode.y - (defaultHeight / 2),
            width: defaultWidth,
            height: defaultHeight,
            rx: 3,
            doorwayEdge: "bottom",
        };
    }

    const dx = roomNode.x - anchorPoint.x;
    const dy = roomNode.y - anchorPoint.y;

    if (Math.abs(dy) >= Math.abs(dx)) {
        const height = ROOM_BLOCK_LONG_SIZE;
        const width = ROOM_BLOCK_SHORT_SIZE;
        const y = dy < 0 ? roomNode.y - height + 3 : roomNode.y - 3;
        return {
            x: roomNode.x - (width / 2),
            y,
            width,
            height,
            rx: 3,
            doorwayEdge: dy < 0 ? "bottom" : "top",
        };
    }

    const width = ROOM_BLOCK_LONG_SIZE;
    const height = ROOM_BLOCK_SHORT_SIZE;
    const x = dx < 0 ? roomNode.x - width + 3 : roomNode.x - 3;
    return {
        x,
        y: roomNode.y - (height / 2),
        width,
        height,
        rx: 3,
        doorwayEdge: dx < 0 ? "right" : "left",
    };
}

function buildCorridorBlock(fromPoint, toPoint, width) {
    const segment = shortenSegment(fromPoint, toPoint);
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const horizontal = Math.abs(dx) >= Math.abs(dy);

    if (horizontal) {
        const x = Math.min(segment.x1, segment.x2);
        const corridorWidth = Math.max(1.5, Math.abs(dx));
        const y = ((segment.y1 + segment.y2) / 2) - (width / 2);
        return {
            segment,
            x,
            y,
            width: corridorWidth,
            height: width,
            rx: Math.max(2, width * 0.25),
        };
    }

    const y = Math.min(segment.y1, segment.y2);
    const corridorHeight = Math.max(1.5, Math.abs(dy));
    const x = ((segment.x1 + segment.x2) / 2) - (width / 2);
    return {
        segment,
        x,
        y,
        width,
        height: corridorHeight,
        rx: Math.max(2, width * 0.25),
    };
}

function createRoomLabelLines(roomName, fallbackId) {
    const label = (roomName || fallbackId || "Room").trim();
    const segments = label.split(" - ");

    const truncate = (value, maxChars) => {
        if (!value) {
            return "";
        }

        if (value.length <= maxChars) {
            return value;
        }

        return `${value.slice(0, maxChars - 1).trim()}...`;
    };

    if (segments.length >= 2) {
        const roomId = truncate(segments[0], 12);
        const department = truncate(segments.slice(1).join(" - "), 14);
        return [roomId, department];
    }

    if (label.length > 18) {
        return [truncate(label.slice(0, 18).trim(), 18), truncate(label.slice(18).trim(), 14)];
    }

    return [truncate(label, 14)];
}

function buildDoorGapSegment(box, doorwayEdge) {
    const safeEdge = doorwayEdge || "bottom";

    if (safeEdge === "top" || safeEdge === "bottom") {
        const y = safeEdge === "top" ? box.y : box.y + box.height;
        const halfGap = Math.min(8, box.width * 0.22);
        const centerX = box.x + (box.width / 2);
        return {
            x1: centerX - halfGap,
            y1: y,
            x2: centerX + halfGap,
            y2: y,
        };
    }

    const x = safeEdge === "left" ? box.x : box.x + box.width;
    const halfGap = Math.min(8, box.height * 0.22);
    const centerY = box.y + (box.height / 2);
    return {
        x1: x,
        y1: centerY - halfGap,
        x2: x,
        y2: centerY + halfGap,
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

// AI acknowledgement: This indoor navigation composition for floor-aware rendering, endpoint controls, and route visualization was drafted with AI assistance and reviewed by the project author.
export default function IndoorNavigation({ initialSelection = null }) {
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
    const [zoom, setZoom] = useState(INITIAL_MAP_ZOOM);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const mapAreaRef = useRef(null);
    const panStateRef = useRef(null);
    const toastTimer = useRef(null);
    const initialBuildingAppliedRef = useRef(false);
    const initialEndpointsAppliedRef = useRef(false);

    const showToast = useCallback((message) => {
        setToast(message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2500);
    }, []);

    useEffect(() => () => clearTimeout(toastTimer.current), []);

    useEffect(() => {
        initialBuildingAppliedRef.current = false;
        initialEndpointsAppliedRef.current = false;
    }, [initialSelection]);

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

    useEffect(() => {
        const availableBuildings = Array.isArray(mapData?.buildings) ? mapData.buildings : [];

        if (initialBuildingAppliedRef.current || loadingMap || availableBuildings.length === 0) {
            return;
        }

        if (initialSelection?.buildingId && availableBuildings.some((building) => building.id === initialSelection.buildingId)) {
            setSelectedBuildingId(initialSelection.buildingId);
        }

        initialBuildingAppliedRef.current = true;
    }, [initialSelection, loadingMap, mapData]);

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

    const floorAdjacency = useMemo(() => {
        const adjacency = new Map();

        floorEdges.forEach((edge) => {
            const fromList = adjacency.get(edge.fromNodeId) || [];
            fromList.push(edge.toNodeId);
            adjacency.set(edge.fromNodeId, fromList);

            const toList = adjacency.get(edge.toNodeId) || [];
            toList.push(edge.fromNodeId);
            adjacency.set(edge.toNodeId, toList);
        });

        return adjacency;
    }, [floorEdges]);

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

    const roomAreas = useMemo(() => {
        const roomStyle = getNodeStyle("room_entrance");

        return floorNodes
            .filter((node) => node.type === "room_entrance" && node.roomId)
            .map((node) => {
                const roomPoint = projectedNodeMap.get(node.id);
                if (!roomPoint) {
                    return null;
                }

                const neighborIds = floorAdjacency.get(node.id) || [];
                const anchorNeighbor = neighborIds
                    .map((neighborId) => nodeMap.get(neighborId))
                    .find((neighborNode) => neighborNode && neighborNode.type !== "room_entrance") || null;
                const anchorPoint = anchorNeighbor ? projectedNodeMap.get(anchorNeighbor.id) || null : null;
                const box = buildRoomArea(roomPoint, anchorPoint);
                const room = roomMap.get(node.roomId);
                const labelLines = createRoomLabelLines(room?.name, node.roomId);

                return {
                    id: node.id,
                    roomId: node.roomId,
                    box,
                    labelLines,
                    fill: roomStyle.fill,
                    stroke: roomStyle.stroke,
                };
            })
            .filter(Boolean);
    }, [floorNodes, floorAdjacency, nodeMap, projectedNodeMap, roomMap]);

    const corridorBlocks = useMemo(() => {
        const hallwayStyle = getNodeStyle("hallway");

        return floorEdges
            .map((edge) => {
                const fromNode = nodeMap.get(edge.fromNodeId);
                const toNode = nodeMap.get(edge.toNodeId);
                const fromPoint = projectedNodeMap.get(edge.fromNodeId);
                const toPoint = projectedNodeMap.get(edge.toNodeId);

                if (!fromNode || !toNode || !fromPoint || !toPoint) {
                    return null;
                }

                const isRoomConnector = fromNode.type === "room_entrance" || toNode.type === "room_entrance";
                const blockWidth = isRoomConnector ? CORRIDOR_CONNECTOR_WIDTH : CORRIDOR_BASE_WIDTH;
                const block = buildCorridorBlock(fromPoint, toPoint, blockWidth);
                const isRouteEdge = routeSegmentKeys.has(segmentKey(edge.fromNodeId, edge.toNodeId));

                return {
                    id: edge.id,
                    isRouteEdge,
                    isRoomConnector,
                    fill: hallwayStyle.fill,
                    stroke: hallwayStyle.stroke,
                    block,
                };
            })
            .filter(Boolean);
    }, [floorEdges, nodeMap, projectedNodeMap, routeSegmentKeys]);

    const structuralNodeAreas = useMemo(
        () => floorNodes
            .filter((node) => node.type !== "room_entrance")
            .map((node) => {
                const point = projectedNodeMap.get(node.id);
                if (!point) {
                    return null;
                }

                const isSpecial = ["stairs", "elevator", "exit"].includes(node.type);
                const style = isSpecial ? getNodeStyle(node.type) : getNodeStyle("hallway");
                const size = isSpecial ? CORRIDOR_BASE_WIDTH + 10 : CORRIDOR_BASE_WIDTH + 2;
                const label = isSpecial ? (node.type === "elevator" ? "Elev" : node.type === "stairs" ? "Stairs" : "Exit") : "";

                return {
                    id: node.id,
                    x: point.x - (size / 2),
                    y: point.y - (size / 2),
                    size,
                    fill: style.fill,
                    stroke: style.stroke,
                    isSpecial,
                    label,
                };
            })
            .filter(Boolean),
        [floorNodes, projectedNodeMap],
    );

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

    useEffect(() => {
        if (initialEndpointsAppliedRef.current || !initialBuildingAppliedRef.current) {
            return;
        }

        if (!initialSelection) {
            initialEndpointsAppliedRef.current = true;
            return;
        }

        if (initialSelection.buildingId && selectedBuildingId !== initialSelection.buildingId) {
            return;
        }

        let hasAppliedSelection = false;

        if (initialSelection.entranceId) {
            const initialFrom = `entrance:${initialSelection.entranceId}`;
            if (endpointValues.has(initialFrom)) {
                setFromEndpoint(initialFrom);
                hasAppliedSelection = true;
            }
        }

        if (initialSelection.roomId) {
            const initialTo = `room:${initialSelection.roomId}`;
            if (endpointValues.has(initialTo)) {
                setToEndpoint(initialTo);
                hasAppliedSelection = true;
            }
        }

        if (hasAppliedSelection) {
            showToast("Indoor destination preselected");
        }

        initialEndpointsAppliedRef.current = true;
    }, [initialSelection, selectedBuildingId, endpointValues, showToast]);

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
        setZoom(INITIAL_MAP_ZOOM);
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
    const floorColor = FLOOR_BG_COLORS[Math.max(0, floorIndex) % FLOOR_BG_COLORS.length];
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
                                <strong className="routeStatNum">{formatIndoorDistance(routeData.totalDistance)}</strong>
                                estimated distance
                            </div>
                            <div className="routeStat">
                                <strong className="routeStatNum">{estimateIndoorDuration(routeData.totalDistance)}</strong>
                                est. walk time
                            </div>
                            <div className="routeStat">
                                <strong className="routeStatNum">{routeData.steps.length}</strong>
                                directions
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
                            subtitle="Choose where you are and where you want to go"
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
                                    subtitle={`${formatIndoorDistance(step.distance)} on ${floorMap.get(step.toFloorId)?.name || step.toFloorId}`}
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

            <div className="mapArea" style={{ backgroundColor: floorColor }}>
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
                        fill={floorColor}
                        stroke={floorColor}
                        strokeWidth={1.2}
                        rx={10}
                    />

                    {corridorBlocks.map((corridor) => (
                        <rect
                            key={`${corridor.id}-corridor`}
                            x={corridor.block.x}
                            y={corridor.block.y}
                            width={corridor.block.width}
                            height={corridor.block.height}
                            rx={corridor.block.rx}
                            fill={corridor.fill}
                            fillOpacity={corridor.isRoomConnector ? 0.3 : 0.58}
                            stroke={corridor.stroke}
                            strokeOpacity={corridor.isRoomConnector ? 0.45 : 0.62}
                            strokeWidth={corridor.isRoomConnector ? 0.9 : 1.3}
                        />
                    ))}

                    {structuralNodeAreas.map((area) => (
                        <g key={`${area.id}-node-area`}>
                            <rect
                                x={area.x}
                                y={area.y}
                                width={area.size}
                                height={area.size}
                                rx={4}
                                fill={area.fill}
                                fillOpacity={area.isSpecial ? SPECIAL_AREA_OPACITY + 0.16 : 0.6}
                                stroke={area.stroke}
                                strokeOpacity={0.82}
                                strokeWidth={1.2}
                            />
                            {area.isSpecial && (
                                <text
                                    x={area.x + (area.size / 2)}
                                    y={area.y + (area.size / 2) + 1.7}
                                    fontSize="6.4"
                                    fill="#1f2937"
                                    fontFamily="sans-serif"
                                    fontWeight="700"
                                    textAnchor="middle"
                                >
                                    {area.label}
                                </text>
                            )}
                        </g>
                    ))}

                    {roomAreas.map((area) => {
                        const centerX = area.box.x + (area.box.width / 2);
                        const centerY = area.box.y + (area.box.height / 2);
                        const maxTextWidth = Math.max(14, area.box.width - 7);
                        const lineSpacing = Math.min(
                            ROOM_LABEL_FONT_SIZE + 0.6,
                            Math.max(ROOM_LABEL_FONT_SIZE, (area.box.height - 8) / Math.max(1, area.labelLines.length)),
                        );
                        const firstLineY = centerY - (((area.labelLines.length - 1) * lineSpacing) / 2);
                        const doorway = buildDoorGapSegment(area.box, area.box.doorwayEdge);

                        return (
                            <g key={`${area.id}-room-area`}>
                                <rect
                                    x={area.box.x}
                                    y={area.box.y}
                                    width={area.box.width}
                                    height={area.box.height}
                                    rx={area.box.rx}
                                    fill={area.fill}
                                    fillOpacity={ROOM_AREA_OPACITY + 0.14}
                                    stroke={area.stroke}
                                    strokeOpacity={0.9}
                                    strokeWidth={1.6}
                                />

                                <line
                                    x1={doorway.x1}
                                    y1={doorway.y1}
                                    x2={doorway.x2}
                                    y2={doorway.y2}
                                    stroke={floorColor}
                                    strokeWidth={3.1}
                                    strokeLinecap="round"
                                />

                                {area.labelLines.map((line, index) => (
                                    <text
                                        key={`${area.id}-label-${index}`}
                                        x={centerX}
                                        y={firstLineY + (index * lineSpacing)}
                                        fontSize={ROOM_LABEL_FONT_SIZE}
                                        fill="#0f172a"
                                        fontFamily="sans-serif"
                                        fontWeight={index === 0 ? "700" : "600"}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        textLength={line.length > 7 ? maxTextWidth : undefined}
                                        lengthAdjust={line.length > 7 ? "spacingAndGlyphs" : undefined}
                                    >
                                        {line}
                                    </text>
                                ))}
                            </g>
                        );
                    })}

                    {corridorBlocks
                        .filter((corridor) => corridor.isRouteEdge)
                        .map((corridor) => {
                            const isHorizontal = corridor.block.width >= corridor.block.height;
                            const x1 = isHorizontal ? corridor.block.x : corridor.block.x + (corridor.block.width / 2);
                            const y1 = isHorizontal ? corridor.block.y + (corridor.block.height / 2) : corridor.block.y;
                            const x2 = isHorizontal
                                ? corridor.block.x + corridor.block.width
                                : corridor.block.x + (corridor.block.width / 2);
                            const y2 = isHorizontal
                                ? corridor.block.y + (corridor.block.height / 2)
                                : corridor.block.y + corridor.block.height;

                            return (
                                <line
                                    key={`${corridor.id}-route-segment`}
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                    stroke={EDGE_STYLE.route}
                                    strokeWidth={corridor.isRoomConnector ? 3.5 : 5.3}
                                    strokeLinecap="round"
                                    opacity={0.9}
                                />
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
                                    fontSize="9"
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
