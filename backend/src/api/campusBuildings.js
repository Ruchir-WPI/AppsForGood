// Static screen-space building anchors for the legacy indoor UI preview. These
// are intentionally coarse display coordinates rather than GIS or graph nodes.
// Coarse campus-map coordinates used by the lightweight indoor-ui preview service.
// These are intentionally simple screen-space anchors, aligned to the main visitor arrival path.
const campusBuildings = [
    { id: "main-garage", label: "Main Garage", cx: 148, cy: 358, type: "parking" },
    { id: "main-hospital", label: "Main Hospital Entrance", cx: 286, cy: 188, type: "clinical" },
    { id: "emergency", label: "Emergency Entrance", cx: 348, cy: 206, type: "clinical" },
    { id: "cancer-center", label: "Cancer Center", cx: 328, cy: 130, type: "clinical" },
    { id: "outpatient-clinic", label: "Outpatient Clinic", cx: 222, cy: 256, type: "clinical" },
];

function getBuildingById(id) {
    return campusBuildings.find((building) => building.id === id) || null;
}

module.exports = {
    campusBuildings,
    getBuildingById,
};
