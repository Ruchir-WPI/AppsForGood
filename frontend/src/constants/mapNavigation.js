export const MAP_SCALE = 28;
export const MAP_PADDING = 20;
export const PAN_OVERSCROLL_RATIO = 0.4;
export const MIN_MAP_ZOOM = 0.7;
export const MAX_MAP_ZOOM = 4;
export const ZOOM_STEP = 0.2;
export const INDOOR_ROUTING_ALGORITHM = "dijkstra"; // "a_star" or "dijkstra"

export const FLOOR_BG_COLORS = ["#f7fbff", "#f7fff8", "#fffaf2", "#fff5f9"];

export const EDGE_STYLE = {
    base: "#bfcbda",
    route: "#1a73e8",
    stairs: "#8e24aa",
    elevator: "#ef6c00",
};

export const NODE_TYPE_STYLES = {
    exit: { fill: "#00a26d", stroke: "#047857", radius: 8.5, legend: "Entrance / Exit" },
    hallway: { fill: "#8fa2b9", stroke: "#4b5f75", radius: 6.8, legend: "Hallway" },
    room_entrance: { fill: "#3f51b5", stroke: "#283593", radius: 8, legend: "Room Entrance" },
    intersection: { fill: "#607d8b", stroke: "#32424a", radius: 6.8, legend: "Intersection" },
    stairs: { fill: "#8e24aa", stroke: "#5e1580", radius: 8, legend: "Stairs" },
    elevator: { fill: "#ef6c00", stroke: "#b34d00", radius: 8, legend: "Elevator" },
    default: { fill: "#607d8b", stroke: "#32424a", radius: 6.8, legend: "Node" },
};
