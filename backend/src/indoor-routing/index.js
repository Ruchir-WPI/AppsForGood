// Public indoor-routing module surface. Exports graph entities, algorithms,
// repository/service classes, sample seed data, and a convenience factory for
// the in-memory sample campus used by the API and tests.
const Building = require("./models/Building");
const Floor = require("./models/Floor");
const Room = require("./models/Room");
const { Node, NODE_TYPES } = require("./models/Node");
const Edge = require("./models/Edge");
const Graph = require("./models/Graph");
const { aStar, defaultHeuristic } = require("./algorithms/aStar");
const { dijkstra } = require("./algorithms/dijkstra");
const RouteService = require("./services/RouteService");
const InMemoryMapRepository = require("./repositories/InMemoryMapRepository");
const sampleCampus = require("./data/sampleCampus");

// AI acknowledgement: This sample-campus bootstrap for the in-memory route repository was drafted with AI assistance and reviewed by the project author.
// AI used: GPT-5.3-Codex
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
    dijkstra,
    RouteService,
    InMemoryMapRepository,
    sampleCampus,
    createSampleRouteService,
};
