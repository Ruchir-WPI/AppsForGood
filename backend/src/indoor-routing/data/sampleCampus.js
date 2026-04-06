const { NODE_TYPES } = require("../models/Node");

// This seed includes both stairs and elevator paths so accessibility routing can be exercised.
const campusData = {
    buildings: [
        {
            id: "building-main",
            name: "Main Hospital Building",
            code: "MHB",
            description: "Primary care and diagnostics building.",
        },
    ],
    floors: [
        { id: "floor-1", buildingId: "building-main", level: 1, name: "First Floor" },
        { id: "floor-2", buildingId: "building-main", level: 2, name: "Second Floor" },
    ],
    rooms: [
        {
            id: "room-101",
            buildingId: "building-main",
            floorId: "floor-1",
            name: "Room 101 - Registration",
            nodeIds: ["node-f1-room-101"],
        },
        {
            id: "room-102",
            buildingId: "building-main",
            floorId: "floor-1",
            name: "Room 102 - Pharmacy",
            nodeIds: ["node-f1-room-102"],
        },
        {
            id: "room-201",
            buildingId: "building-main",
            floorId: "floor-2",
            name: "Room 201 - Radiology",
            nodeIds: ["node-f2-room-201"],
        },
        {
            id: "room-202",
            buildingId: "building-main",
            floorId: "floor-2",
            name: "Room 202 - Cardiology",
            nodeIds: ["node-f2-room-202"],
        },
    ],
    nodes: [
        {
            id: "node-f1-entrance",
            buildingId: "building-main",
            floorId: "floor-1",
            x: 0,
            y: 0,
            label: "Main Entrance",
            type: NODE_TYPES.EXIT,
        },
        {
            id: "node-f1-lobby",
            buildingId: "building-main",
            floorId: "floor-1",
            x: 10,
            y: 0,
            label: "Lobby",
            type: NODE_TYPES.HALLWAY,
        },
        {
            id: "node-f1-room-101",
            buildingId: "building-main",
            floorId: "floor-1",
            x: 20,
            y: 0,
            roomId: "room-101",
            label: "Room 101 Entrance",
            type: NODE_TYPES.ROOM_ENTRANCE,
        },
        {
            id: "node-f1-room-102",
            buildingId: "building-main",
            floorId: "floor-1",
            x: 30,
            y: 0,
            roomId: "room-102",
            label: "Room 102 Entrance",
            type: NODE_TYPES.ROOM_ENTRANCE,
        },
        {
            id: "node-f1-junction",
            buildingId: "building-main",
            floorId: "floor-1",
            x: 10,
            y: 10,
            label: "North Hall Junction",
            type: NODE_TYPES.INTERSECTION,
        },
        {
            id: "node-f1-stairs",
            buildingId: "building-main",
            floorId: "floor-1",
            x: 0,
            y: 10,
            label: "Stairs F1",
            type: NODE_TYPES.STAIRS,
        },
        {
            id: "node-f1-elevator",
            buildingId: "building-main",
            floorId: "floor-1",
            x: 20,
            y: 10,
            label: "Elevator F1",
            type: NODE_TYPES.ELEVATOR,
        },
        {
            id: "node-f2-stairs",
            buildingId: "building-main",
            floorId: "floor-2",
            x: 0,
            y: 10,
            label: "Stairs F2",
            type: NODE_TYPES.STAIRS,
        },
        {
            id: "node-f2-elevator",
            buildingId: "building-main",
            floorId: "floor-2",
            x: 20,
            y: 10,
            label: "Elevator F2",
            type: NODE_TYPES.ELEVATOR,
        },
        {
            id: "node-f2-junction",
            buildingId: "building-main",
            floorId: "floor-2",
            x: 10,
            y: 10,
            label: "Second Floor Junction",
            type: NODE_TYPES.INTERSECTION,
        },
        {
            id: "node-f2-room-201",
            buildingId: "building-main",
            floorId: "floor-2",
            x: 10,
            y: 0,
            roomId: "room-201",
            label: "Room 201 Entrance",
            type: NODE_TYPES.ROOM_ENTRANCE,
        },
        {
            id: "node-f2-room-202",
            buildingId: "building-main",
            floorId: "floor-2",
            x: 20,
            y: 0,
            roomId: "room-202",
            label: "Room 202 Entrance",
            type: NODE_TYPES.ROOM_ENTRANCE,
        },
    ],
    edges: [
        { id: "edge-1", fromNodeId: "node-f1-entrance", toNodeId: "node-f1-lobby", distance: 10 },
        { id: "edge-2", fromNodeId: "node-f1-lobby", toNodeId: "node-f1-room-101", distance: 10 },
        { id: "edge-3", fromNodeId: "node-f1-room-101", toNodeId: "node-f1-room-102", distance: 10 },
        { id: "edge-4", fromNodeId: "node-f1-lobby", toNodeId: "node-f1-junction", distance: 10 },
        { id: "edge-5", fromNodeId: "node-f1-junction", toNodeId: "node-f1-stairs", distance: 10 },
        { id: "edge-6", fromNodeId: "node-f1-junction", toNodeId: "node-f1-elevator", distance: 10 },
        {
            id: "edge-7",
            fromNodeId: "node-f1-stairs",
            toNodeId: "node-f2-stairs",
            distance: 12,
            accessibility: { wheelchair: false, stairsOnly: true },
        },
        {
            id: "edge-8",
            fromNodeId: "node-f1-elevator",
            toNodeId: "node-f2-elevator",
            distance: 8,
            accessibility: { wheelchair: true, stairsOnly: false },
        },
        { id: "edge-9", fromNodeId: "node-f2-stairs", toNodeId: "node-f2-junction", distance: 10 },
        { id: "edge-10", fromNodeId: "node-f2-elevator", toNodeId: "node-f2-junction", distance: 10 },
        { id: "edge-11", fromNodeId: "node-f2-junction", toNodeId: "node-f2-room-201", distance: 10 },
        { id: "edge-12", fromNodeId: "node-f2-junction", toNodeId: "node-f2-room-202", distance: 10 },
    ],
    entrances: [
        {
            id: "entrance-main",
            buildingId: "building-main",
            label: "Main Entrance",
            outdoor: { lng: -71.7601, lat: 42.2621 },
            indoorNodeId: "node-f1-entrance",
            wheelchairAccessible: true,
        },
        {
            id: "entrance-north",
            buildingId: "building-main",
            label: "North Entrance",
            outdoor: { lng: -71.7597, lat: 42.2625 },
            indoorNodeId: "node-f1-stairs",
            wheelchairAccessible: false,
        },
        {
            id: "entrance-east",
            buildingId: "building-main",
            label: "East Entrance",
            outdoor: { lng: -71.7595, lat: 42.2621 },
            indoorNodeId: "node-f1-elevator",
            wheelchairAccessible: true,
        },
    ],
    outdoorPoints: [
        {
            id: "garage-east",
            label: "East Parking Garage",
            type: "parking_garage",
            location: { lng: -71.7588, lat: 42.2623 },
        },
        {
            id: "garage-west",
            label: "West Parking Garage",
            type: "parking_garage",
            location: { lng: -71.7612, lat: 42.2622 },
        },
        {
            id: "dropoff-main",
            label: "Main Drop-off",
            type: "dropoff",
            location: { lng: -71.7603, lat: 42.2620 },
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
