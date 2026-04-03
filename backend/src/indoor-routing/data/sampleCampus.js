const { NODE_TYPES } = require("../models/Node");

const BUILDING_ID = "building-main";

const CORRIDOR_TEMPLATE = [
    { key: "west-entry", x: 0, y: 50, label: "West Hall Entry", type: NODE_TYPES.HALLWAY },
    { key: "lobby", x: 20, y: 50, label: "Lobby", type: NODE_TYPES.HALLWAY },
    { key: "junction", x: 40, y: 50, label: "Central Junction", type: NODE_TYPES.INTERSECTION },
    { key: "stairs", x: 60, y: 50, label: "Stairwell", type: NODE_TYPES.STAIRS },
    { key: "elevator", x: 70, y: 50, label: "Elevator Lobby", type: NODE_TYPES.ELEVATOR },
    { key: "east-hall", x: 90, y: 50, label: "East Hall", type: NODE_TYPES.HALLWAY },
    { key: "east-exit", x: 110, y: 50, label: "East Exit", type: NODE_TYPES.HALLWAY },
    { key: "north-exit", x: 20, y: 35, label: "North Hall Entry", type: NODE_TYPES.HALLWAY },
    { key: "north-west", x: 30, y: 35, label: "North Hall West", type: NODE_TYPES.HALLWAY },
    { key: "north-mid", x: 50, y: 35, label: "North Hall Mid", type: NODE_TYPES.INTERSECTION },
    { key: "north-east", x: 70, y: 35, label: "North Hall East", type: NODE_TYPES.HALLWAY },
    { key: "north-far-east", x: 90, y: 35, label: "North Hall Far East", type: NODE_TYPES.HALLWAY },
    { key: "north-end", x: 110, y: 35, label: "North Hall End", type: NODE_TYPES.HALLWAY },
    { key: "south-far-west", x: 30, y: 65, label: "South Hall Far West", type: NODE_TYPES.HALLWAY },
    { key: "south-west", x: 50, y: 65, label: "South Hall West", type: NODE_TYPES.HALLWAY },
    { key: "south-connector", x: 70, y: 65, label: "South Connector", type: NODE_TYPES.INTERSECTION },
    { key: "south-east", x: 90, y: 65, label: "South Hall East", type: NODE_TYPES.HALLWAY },
    { key: "south-end", x: 110, y: 65, label: "South Hall End", type: NODE_TYPES.HALLWAY },
];

const CORRIDOR_CONNECTIONS = [
    ["west-entry", "lobby", 20],
    ["lobby", "junction", 20],
    ["junction", "stairs", 20],
    ["stairs", "elevator", 10],
    ["elevator", "east-hall", 20],
    ["east-hall", "east-exit", 20],
    ["lobby", "north-exit", 15],
    ["north-exit", "north-west", 10],
    ["north-west", "north-mid", 20],
    ["north-mid", "north-east", 20],
    ["north-east", "north-far-east", 20],
    ["north-far-east", "north-end", 20],
    ["junction", "north-mid", 15],
    ["junction", "south-west", 20],
    ["elevator", "south-connector", 15],
    ["south-far-west", "south-west", 20],
    ["south-west", "south-connector", 20],
    ["south-connector", "south-east", 20],
    ["south-east", "south-end", 20],
    ["east-hall", "south-east", 15],
];

const ROOM_SLOT_TEMPLATE = {
    "north-west": { x: 30, y: 25, anchor: "north-west" },
    "north-mid": { x: 50, y: 25, anchor: "north-mid" },
    "north-east": { x: 70, y: 25, anchor: "north-east" },
    "north-far-east": { x: 90, y: 25, anchor: "north-far-east" },
    "north-end": { x: 110, y: 25, anchor: "north-end" },
    "south-far-west": { x: 30, y: 75, anchor: "south-far-west" },
    "south-west": { x: 50, y: 75, anchor: "south-west" },
    "south-connector": { x: 70, y: 75, anchor: "south-connector" },
    "south-east": { x: 90, y: 75, anchor: "south-east" },
    "south-end": { x: 110, y: 75, anchor: "south-end" },
};

const FLOOR_LAYOUTS = [
    {
        id: "floor-1",
        level: 1,
        name: "First Floor",
        floorTag: "f1",
        nodeTypeOverrides: {
            "west-entry": NODE_TYPES.EXIT,
            "north-exit": NODE_TYPES.EXIT,
            "east-exit": NODE_TYPES.EXIT,
        },
        nodeIdOverrides: {
            "west-entry": "node-f1-entrance",
            lobby: "node-f1-lobby",
            junction: "node-f1-junction",
            stairs: "node-f1-stairs",
            elevator: "node-f1-elevator",
            "north-exit": "node-f1-north-exit",
            "east-exit": "node-f1-east-exit",
        },
        labelOverrides: {
            "west-entry": "Main Entrance",
            stairs: "Stairs F1",
            elevator: "Elevator F1",
            "north-exit": "North Entrance",
            "east-exit": "East Entrance",
        },
        rooms: [
            {
                id: "room-101",
                name: "Room 101 - Registration",
                slotKey: "north-west",
                nodeId: "node-f1-room-101",
            },
            {
                id: "room-102",
                name: "Room 102 - Pharmacy",
                slotKey: "north-mid",
                nodeId: "node-f1-room-102",
            },
            { id: "room-103", name: "Room 103 - Family Medicine", slotKey: "north-east" },
            { id: "room-104", name: "Room 104 - Outpatient Imaging", slotKey: "north-far-east" },
            { id: "room-109", name: "Room 109 - Blood Draw", slotKey: "north-end" },
            { id: "room-105", name: "Room 105 - Urgent Care Intake", slotKey: "south-far-west" },
            { id: "room-106", name: "Room 106 - Pediatrics", slotKey: "south-west" },
            { id: "room-107", name: "Room 107 - Orthopedics", slotKey: "south-connector" },
            { id: "room-108", name: "Room 108 - Physical Therapy", slotKey: "south-east" },
            { id: "room-110", name: "Room 110 - Cafe Seating", slotKey: "south-end" },
        ],
    },
    {
        id: "floor-2",
        level: 2,
        name: "Second Floor",
        floorTag: "f2",
        nodeIdOverrides: {
            junction: "node-f2-junction",
            stairs: "node-f2-stairs",
            elevator: "node-f2-elevator",
        },
        labelOverrides: {
            stairs: "Stairs F2",
            elevator: "Elevator F2",
        },
        rooms: [
            {
                id: "room-201",
                name: "Room 201 - Radiology",
                slotKey: "north-mid",
                nodeId: "node-f2-room-201",
            },
            {
                id: "room-202",
                name: "Room 202 - Cardiology",
                slotKey: "north-east",
                nodeId: "node-f2-room-202",
            },
            { id: "room-203", name: "Room 203 - Neurology", slotKey: "north-west" },
            { id: "room-204", name: "Room 204 - Oncology", slotKey: "north-far-east" },
            { id: "room-209", name: "Room 209 - Pulmonology", slotKey: "north-end" },
            { id: "room-205", name: "Room 205 - Infusion Suite", slotKey: "south-far-west" },
            { id: "room-206", name: "Room 206 - Dialysis", slotKey: "south-west" },
            { id: "room-207", name: "Room 207 - Endoscopy", slotKey: "south-connector" },
            { id: "room-208", name: "Room 208 - GI Clinic", slotKey: "south-east" },
            { id: "room-210", name: "Room 210 - Staff Lounge", slotKey: "south-end" },
        ],
    },
    {
        id: "floor-3",
        level: 3,
        name: "Third Floor",
        floorTag: "f3",
        labelOverrides: {
            stairs: "Stairs F3",
            elevator: "Elevator F3",
        },
        rooms: [
            { id: "room-301", name: "Room 301 - ICU West", slotKey: "north-west" },
            { id: "room-302", name: "Room 302 - ICU East", slotKey: "north-mid" },
            { id: "room-303", name: "Room 303 - Surgical Prep", slotKey: "north-east" },
            { id: "room-304", name: "Room 304 - Operating Room 1", slotKey: "north-far-east" },
            { id: "room-309", name: "Room 309 - Operating Room 2", slotKey: "north-end" },
            { id: "room-305", name: "Room 305 - Recovery Bay A", slotKey: "south-far-west" },
            { id: "room-306", name: "Room 306 - Recovery Bay B", slotKey: "south-west" },
            { id: "room-307", name: "Room 307 - Maternal Care", slotKey: "south-connector" },
            { id: "room-308", name: "Room 308 - Neonatal Unit", slotKey: "south-east" },
            { id: "room-310", name: "Room 310 - Pharmacy Satellite", slotKey: "south-end" },
        ],
    },
];

function createNodeId(floorTag, key) {
    return `node-${floorTag}-${key}`;
}

function createRoomNodeId(floorTag, roomId) {
    return `node-${floorTag}-room-${roomId.split("-")[1]}`;
}

function buildFloorLayout(floorLayout) {
    const nodes = [];
    const rooms = [];
    const edges = [];
    const nodeIdsByKey = {};

    for (const corridorNode of CORRIDOR_TEMPLATE) {
        const nodeId = floorLayout.nodeIdOverrides?.[corridorNode.key] || createNodeId(floorLayout.floorTag, corridorNode.key);
        const nodeType = floorLayout.nodeTypeOverrides?.[corridorNode.key] || corridorNode.type;
        const nodeLabel = floorLayout.labelOverrides?.[corridorNode.key] || corridorNode.label;

        nodeIdsByKey[corridorNode.key] = nodeId;
        nodes.push({
            id: nodeId,
            buildingId: BUILDING_ID,
            floorId: floorLayout.id,
            x: corridorNode.x,
            y: corridorNode.y,
            label: nodeLabel,
            type: nodeType,
        });
    }

    for (const [fromKey, toKey, distance] of CORRIDOR_CONNECTIONS) {
        edges.push({
            fromNodeId: nodeIdsByKey[fromKey],
            toNodeId: nodeIdsByKey[toKey],
            distance,
        });
    }

    for (const roomDefinition of floorLayout.rooms) {
        const slot = ROOM_SLOT_TEMPLATE[roomDefinition.slotKey];
        const roomNodeId = roomDefinition.nodeId || createRoomNodeId(floorLayout.floorTag, roomDefinition.id);

        rooms.push({
            id: roomDefinition.id,
            buildingId: BUILDING_ID,
            floorId: floorLayout.id,
            name: roomDefinition.name,
            nodeIds: [roomNodeId],
        });

        nodes.push({
            id: roomNodeId,
            buildingId: BUILDING_ID,
            floorId: floorLayout.id,
            x: slot.x,
            y: slot.y,
            roomId: roomDefinition.id,
            label: `${roomDefinition.name} Entrance`,
            type: NODE_TYPES.ROOM_ENTRANCE,
        });

        edges.push({
            fromNodeId: roomNodeId,
            toNodeId: nodeIdsByKey[slot.anchor],
            distance: 8,
        });
    }

    return {
        nodes,
        rooms,
        edges,
        nodeIdsByKey,
    };
}

function createEdge(fromNodeId, toNodeId, distance, accessibility = null) {
    const base = {
        fromNodeId,
        toNodeId,
        distance,
    };

    if (accessibility) {
        base.accessibility = accessibility;
    }

    return base;
}

const builtFloors = FLOOR_LAYOUTS.map((floorLayout) => {
    const graphData = buildFloorLayout(floorLayout);
    return {
        floor: {
            id: floorLayout.id,
            buildingId: BUILDING_ID,
            level: floorLayout.level,
            name: floorLayout.name,
        },
        ...graphData,
    };
});

const floorNodes = Object.fromEntries(
    builtFloors.map((item) => [item.floor.id, item.nodeIdsByKey]),
);

const interFloorEdges = [
    createEdge(
        floorNodes["floor-1"].stairs,
        floorNodes["floor-2"].stairs,
        12,
        { wheelchair: false, stairsOnly: true },
    ),
    createEdge(
        floorNodes["floor-2"].stairs,
        floorNodes["floor-3"].stairs,
        12,
        { wheelchair: false, stairsOnly: true },
    ),
    createEdge(
        floorNodes["floor-1"].elevator,
        floorNodes["floor-2"].elevator,
        9,
        { wheelchair: true, stairsOnly: false },
    ),
    createEdge(
        floorNodes["floor-2"].elevator,
        floorNodes["floor-3"].elevator,
        9,
        { wheelchair: true, stairsOnly: false },
    ),
];

const allEdges = [
    ...builtFloors.flatMap((item) => item.edges),
    ...interFloorEdges,
].map((edge, index) => ({
    id: `edge-${index + 1}`,
    ...edge,
}));

const campusData = {
    buildings: [
        {
            id: BUILDING_ID,
            name: "Main Hospital Building",
            code: "MHB",
            description: "Multi-floor inpatient and outpatient services building.",
        },
    ],
    floors: builtFloors.map((item) => item.floor),
    rooms: builtFloors.flatMap((item) => item.rooms),
    nodes: builtFloors.flatMap((item) => item.nodes),
    edges: allEdges,
    entrances: [
        {
            id: "entrance-main",
            buildingId: BUILDING_ID,
            label: "Main Entrance",
            outdoor: { lng: -71.76535, lat: 42.27758 },
            indoorNodeId: "node-f1-entrance",
            wheelchairAccessible: true,
        },
        {
            id: "entrance-north",
            buildingId: BUILDING_ID,
            label: "North Entrance",
            outdoor: { lng: -71.76555, lat: 42.27778 },
            indoorNodeId: "node-f1-north-exit",
            wheelchairAccessible: false,
        },
        {
            id: "entrance-east",
            buildingId: BUILDING_ID,
            label: "East Entrance",
            outdoor: { lng: -71.76515, lat: 42.27755 },
            indoorNodeId: "node-f1-east-exit",
            wheelchairAccessible: true,
        },
    ],
    outdoorPoints: [
        {
            id: "garage-east",
            label: "East Parking Garage",
            type: "parking_garage",
            location: { lng: -71.76495, lat: 42.27762 },
        },
        {
            id: "garage-west",
            label: "West Parking Garage",
            type: "parking_garage",
            location: { lng: -71.76582, lat: 42.27759 },
        },
        {
            id: "garage-south",
            label: "South Parking Garage",
            type: "parking_garage",
            location: { lng: -71.76534, lat: 42.27733 },
        },
        {
            id: "dropoff-main",
            label: "Main Drop-off",
            type: "dropoff",
            location: { lng: -71.76540, lat: 42.27747 },
        },
        {
            id: "dropoff-east",
            label: "East Drop-off",
            type: "dropoff",
            location: { lng: -71.76518, lat: 42.27752 },
        },
        {
            id: "emergency-entrance",
            label: "Emergency Entrance",
            type: "emergency",
            location: { lng: -71.76568, lat: 42.27743 },
        },
    ],
};

function getEntranceById(id) {
    return campusData.entrances.find((entrance) => entrance.id === id) || null;
}

function getBuildingEntrances(buildingId) {
    return campusData.entrances.filter((entrance) => entrance.buildingId === buildingId);
}

function getOutdoorPointById(id) {
    return campusData.outdoorPoints.find((point) => point.id === id) || null;
}

module.exports = {
    ...campusData,
    getEntranceById,
    getBuildingEntrances,
    getOutdoorPointById,
};
