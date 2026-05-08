// In-memory UMass Memorial sample campus used by local dev, tests, and demo API
// responses. It generates graph nodes/edges from templates, so identifiers and
// entrance coordinates must stay stable for frontend handoff tests.
const { NODE_TYPES } = require("../models/Node");

// AI acknowledgement: This sample campus seed dataset was drafted with AI assistance and reviewed by the project author.
// The active seed now uses the UMass main garage and main hospital entrance as the primary arrival anchors.
const BUILDING_ID = "building-main";
const MAIN_GARAGE_COORDINATES = Object.freeze({
    lat: 42.27472812162177,
    lng: -71.76303308562642,
});
const MAIN_HOSPITAL_ENTRANCE_COORDINATES = Object.freeze({
    lat: 42.27664395437456,
    lng: -71.76205491130239,
});
const EMERGENCY_ENTRANCE_COORDINATES = Object.freeze({
    lat: MAIN_HOSPITAL_ENTRANCE_COORDINATES.lat - 0.00018,
    lng: MAIN_HOSPITAL_ENTRANCE_COORDINATES.lng + 0.0002,
});
const GARAGE_LEVEL_OFFSETS = Object.freeze([
    { lat: 0, lng: 0 },
    { lat: 0.000018, lng: 0.000016 },
    { lat: 0.000012, lng: -0.00002 },
    { lat: -0.000017, lng: 0.000014 },
    { lat: -0.000022, lng: -0.000016 },
]);

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

function createFloorLayout({
    level,
    name,
    rooms,
    includeMainHospitalEntrance = false,
    includeEmergencyEntrance = false,
}) {
    const floorTag = `f${level}`;
    const floorId = `floor-${level}`;

    return {
        id: floorId,
        level,
        name,
        floorTag,
        nodeTypeOverrides: {
            "west-entry": NODE_TYPES.EXIT,
            ...(includeMainHospitalEntrance ? { "north-exit": NODE_TYPES.EXIT } : {}),
            ...(includeEmergencyEntrance ? { "east-exit": NODE_TYPES.EXIT } : {}),
        },
        nodeIdOverrides: {
            "west-entry": `node-${floorTag}-garage-entry`,
            lobby: `node-${floorTag}-lobby`,
            junction: `node-${floorTag}-junction`,
            stairs: `node-${floorTag}-stairs`,
            elevator: `node-${floorTag}-elevator`,
            ...(includeMainHospitalEntrance ? { "north-exit": `node-${floorTag}-main-entrance` } : {}),
            ...(includeEmergencyEntrance ? { "east-exit": `node-${floorTag}-emergency-entry` } : {}),
        },
        labelOverrides: {
            "west-entry": `Main Garage Walkway L${level}`,
            stairs: `Stairs L${level}`,
            elevator: `Elevator L${level}`,
            ...(includeMainHospitalEntrance ? { "north-exit": "Main Hospital Entrance" } : {}),
            ...(includeEmergencyEntrance ? { "east-exit": "Emergency Entrance" } : {}),
        },
        rooms,
    };
}

const FLOOR_LAYOUTS = [
    createFloorLayout({
        level: 1,
        name: "Level 1",
        includeMainHospitalEntrance: true,
        includeEmergencyEntrance: true,
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
    }),
    createFloorLayout({
        level: 2,
        name: "Level 2",
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
    }),
    createFloorLayout({
        level: 3,
        name: "Level 3",
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
    }),
    createFloorLayout({
        level: 4,
        name: "Level 4",
        rooms: [
            { id: "room-401", name: "Room 401 - Cardiac ICU", slotKey: "north-west" },
            { id: "room-402", name: "Room 402 - Cardiac Step-Down", slotKey: "north-mid" },
            { id: "room-403", name: "Room 403 - Cardiac Imaging", slotKey: "north-east" },
            { id: "room-404", name: "Room 404 - Electrophysiology Lab", slotKey: "north-far-east" },
            { id: "room-409", name: "Room 409 - Patient Education", slotKey: "north-end" },
            { id: "room-405", name: "Room 405 - Vascular Clinic", slotKey: "south-far-west" },
            { id: "room-406", name: "Room 406 - Heart Failure Clinic", slotKey: "south-west" },
            { id: "room-407", name: "Room 407 - Echo Suite", slotKey: "south-connector" },
            { id: "room-408", name: "Room 408 - Telemetry Unit", slotKey: "south-east" },
            { id: "room-410", name: "Room 410 - Family Lounge", slotKey: "south-end" },
        ],
    }),
    createFloorLayout({
        level: 5,
        name: "Level 5",
        rooms: [
            { id: "room-501", name: "Room 501 - Infusion Center", slotKey: "north-west" },
            { id: "room-502", name: "Room 502 - Bone Marrow Clinic", slotKey: "north-mid" },
            { id: "room-503", name: "Room 503 - Breast Center", slotKey: "north-east" },
            { id: "room-504", name: "Room 504 - Hematology", slotKey: "north-far-east" },
            { id: "room-509", name: "Room 509 - Integrative Care", slotKey: "north-end" },
            { id: "room-505", name: "Room 505 - Survivorship Clinic", slotKey: "south-far-west" },
            { id: "room-506", name: "Room 506 - Research Infusion", slotKey: "south-west" },
            { id: "room-507", name: "Room 507 - Clinical Trials", slotKey: "south-connector" },
            { id: "room-508", name: "Room 508 - Nutrition Services", slotKey: "south-east" },
            { id: "room-510", name: "Room 510 - Meditation Room", slotKey: "south-end" },
        ],
    }),
];

function offsetCoordinates(base, offset) {
    return {
        lat: base.lat + offset.lat,
        lng: base.lng + offset.lng,
    };
}

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

const interFloorEdges = [];

for (let level = 1; level < FLOOR_LAYOUTS.length; level += 1) {
    interFloorEdges.push(
        createEdge(
            floorNodes[`floor-${level}`].stairs,
            floorNodes[`floor-${level + 1}`].stairs,
            12,
            { wheelchair: false, stairsOnly: true },
        ),
        createEdge(
            floorNodes[`floor-${level}`].elevator,
            floorNodes[`floor-${level + 1}`].elevator,
            9,
            { wheelchair: true, stairsOnly: false },
        ),
    );
}

const allEdges = [
    ...builtFloors.flatMap((item) => item.edges),
    ...interFloorEdges,
].map((edge, index) => ({
    id: `edge-${index + 1}`,
    ...edge,
}));

const garageEntrances = FLOOR_LAYOUTS.map((floorLayout, index) => ({
    id: `entrance-garage-level-${floorLayout.level}`,
    buildingId: BUILDING_ID,
    label: `Main Garage Walkway L${floorLayout.level}`,
    outdoor: offsetCoordinates(MAIN_GARAGE_COORDINATES, GARAGE_LEVEL_OFFSETS[index]),
    indoorNodeId: floorNodes[floorLayout.id]["west-entry"],
    wheelchairAccessible: true,
}));

const garageOutdoorPoints = FLOOR_LAYOUTS.map((floorLayout, index) => ({
    id: `garage-main-level-${floorLayout.level}`,
    label: `Main Garage Level ${floorLayout.level}`,
    type: "parking_garage",
    location: offsetCoordinates(MAIN_GARAGE_COORDINATES, GARAGE_LEVEL_OFFSETS[index]),
}));

const campusData = {
    buildings: [
        {
            id: BUILDING_ID,
            name: "UMass Memorial Main Hospital",
            code: "UMMH",
            description: "Five-level indoor guide anchored to the main garage walkways and main hospital entrance.",
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
            label: "Main Hospital Entrance",
            outdoor: MAIN_HOSPITAL_ENTRANCE_COORDINATES,
            indoorNodeId: floorNodes["floor-1"]["north-exit"],
            wheelchairAccessible: true,
        },
        ...garageEntrances,
        {
            id: "entrance-emergency",
            buildingId: BUILDING_ID,
            label: "Emergency Entrance",
            outdoor: EMERGENCY_ENTRANCE_COORDINATES,
            indoorNodeId: floorNodes["floor-1"]["east-exit"],
            wheelchairAccessible: false,
        },
    ],
    outdoorPoints: [
        {
            id: "garage-main",
            label: "Main Garage Entrance",
            type: "parking_garage",
            location: MAIN_GARAGE_COORDINATES,
        },
        ...garageOutdoorPoints,
        {
            id: "dropoff-main",
            label: "Main Hospital Drop-off",
            type: "dropoff",
            location: MAIN_HOSPITAL_ENTRANCE_COORDINATES,
        },
        {
            id: "emergency-entrance",
            label: "Emergency Entrance",
            type: "emergency",
            location: EMERGENCY_ENTRANCE_COORDINATES,
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
