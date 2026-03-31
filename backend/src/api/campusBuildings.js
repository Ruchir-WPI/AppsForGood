const campusBuildings = [
    { id: "ambulatory", label: "Ambulatory Care Center", cx: 280, cy: 417, type: "clinical" },
    { id: "albert-sherman", label: "Albert Sherman Center", cx: 180, cy: 417, type: "clinical" },
    { id: "medical-school", label: "Medical School Building", cx: 405, cy: 417, type: "academic" },
    { id: "lazare", label: "Lazare Research Building", cx: 500, cy: 417, type: "research" },
    { id: "paul-dimare", label: "Paul J. DiMare Center", cx: 175, cy: 332, type: "clinical" },
    { id: "leahy", label: "Paul T. Leahy Center", cx: 117, cy: 415, type: "clinical" },
    { id: "north-pavilion", label: "North Pavilion", cx: 400, cy: 222, type: "clinical" },
    { id: "shaw", label: "Shaw Building", cx: 495, cy: 332, type: "clinical" },
    { id: "anderson", label: "Anderson House", cx: 567, cy: 410, type: "admin" },
    { id: "benedict", label: "Benedict Building", cx: 482, cy: 139, type: "research" },
    { id: "biotech1", label: "Biotech 1", cx: 137, cy: 139, type: "research" },
    { id: "biotech2", label: "Biotech 2", cx: 202, cy: 139, type: "research" },
    { id: "biotech3", label: "Biotech 3", cx: 267, cy: 139, type: "research" },
    { id: "biotech4", label: "Biotech 4", cx: 332, cy: 139, type: "research" },
    { id: "biotech5", label: "Biotech 5", cx: 397, cy: 139, type: "research" },
    { id: "west-garage", label: "West Garage", cx: 130, cy: 469, type: "parking" },
    { id: "south-garage", label: "South Garage", cx: 390, cy: 469, type: "parking" },
    { id: "plantation-garage", label: "Plantation St. Garage", cx: 552, cy: 199, type: "parking" },
    { id: "va-building", label: "VA Building", cx: 567, cy: 320, type: "admin" },
];

function getBuildingById(id) {
    return campusBuildings.find((building) => building.id === id) || null;
}

module.exports = {
    campusBuildings,
    getBuildingById,
};