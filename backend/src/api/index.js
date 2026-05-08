// Public API-module barrel for lightweight campus preview routing data and the
// legacy indoor UI route service used by older frontend flows.
const IndoorUiRouteService = require("./IndoorUiRouteService");
const { campusBuildings } = require("./campusBuildings");

module.exports = {
    IndoorUiRouteService,
    campusBuildings,
};
