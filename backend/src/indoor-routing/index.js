const Building = require("./models/Building");
const Floor = require("./models/Floor");
const Room = require("./models/Room");
const { Node, NODE_TYPES } = require("./models/Node");
const Edge = require("./models/Edge");
const Graph = require("./models/Graph");
const { aStar, defaultHeuristic } = require("./algorithms/aStar");
const RouteService = require("./services/RouteService");
const InMemoryMapRepository = require("./repositories/InMemoryMapRepository");
const sampleCampus = require("./data/sampleCampus");

function createSampleRouteService() {
    const repository = new InMemoryMapRepository(sampleCampus);
    return new RouteService({ mapRepository: repository });
}

module.exports = {
    Building,
    Floor,
    Room,
    Node,
    NODE_TYPES,
    Edge,
    Graph,
    aStar,
    defaultHeuristic,
    RouteService,
    InMemoryMapRepository,
    sampleCampus,
    createSampleRouteService,
};
