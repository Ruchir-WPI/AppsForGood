const { ValidationError, RouteNotFoundError } = require("../indoor-routing/utils/errors");
const { campusBuildings, getBuildingById } = require("./campusBuildings");

const FEET_PER_MAP_UNIT = 1.5;
const WALKING_FEET_PER_MINUTE = 80;

class IndoorUiRouteService {
    constructor({ buildings = campusBuildings } = {}) {
        if (!Array.isArray(buildings) || buildings.length === 0) {
            throw new ValidationError("IndoorUiRouteService requires a non-empty buildings array.");
        }

        this.buildings = buildings.map((building) => ({ ...building }));
        this.buildingMap = new Map(this.buildings.map((building) => [building.id, building]));
    }

    listBuildings() {
        return this.buildings.map((building) => ({ ...building }));
    }

    computeRoute(request) {
        if (!request || typeof request !== "object" || Array.isArray(request)) {
            throw new ValidationError("Route request must be an object.");
        }

        const from = this.#assertBuildingId(request.from, "from");
        const to = this.#assertBuildingId(request.to, "to");

        if (from === to) {
            throw new ValidationError("Start and destination must be different.");
        }

        const fromBuilding = this.buildingMap.get(from) || getBuildingById(from);
        const toBuilding = this.buildingMap.get(to) || getBuildingById(to);

        if (!fromBuilding) {
            throw new RouteNotFoundError(`Unknown start building \"${from}\".`);
        }

        if (!toBuilding) {
            throw new RouteNotFoundError(`Unknown destination building \"${to}\".`);
        }

        const waypoints = this.#buildWaypoints(fromBuilding, toBuilding);
        const { distanceFeet, walkMinutes } = this.#buildRouteStats(fromBuilding, toBuilding);
        const steps = this.#buildSteps(fromBuilding, toBuilding);

        return {
            from,
            to,
            steps,
            distanceFt: distanceFeet,
            walkMinutes,
            waypoints,
        };
    }

    #assertBuildingId(value, fieldName) {
        if (typeof value !== "string" || value.trim().length === 0) {
            throw new ValidationError(`${fieldName} must be a non-empty string.`);
        }

        return value.trim();
    }

    #buildWaypoints(fromBuilding, toBuilding) {
        const waypoints = [
            { x: fromBuilding.cx, y: fromBuilding.cy },
        ];

        // Add a simple dogleg so diagonal trips follow the campus grid more naturally.
        if (
            Math.abs(fromBuilding.cx - toBuilding.cx) > 40
            && Math.abs(fromBuilding.cy - toBuilding.cy) > 40
        ) {
            waypoints.push({ x: fromBuilding.cx, y: toBuilding.cy });
        }

        waypoints.push({ x: toBuilding.cx, y: toBuilding.cy });
        return waypoints;
    }

    #buildRouteStats(fromBuilding, toBuilding) {
        const dx = fromBuilding.cx - toBuilding.cx;
        const dy = fromBuilding.cy - toBuilding.cy;
        const straightLineUnits = Math.sqrt((dx ** 2) + (dy ** 2));
        // These are rough UI estimates derived from map pixels, not GIS-grade measurements.
        const distanceFeet = Math.round(straightLineUnits * FEET_PER_MAP_UNIT);
        const walkMinutes = Math.max(1, Math.round(distanceFeet / WALKING_FEET_PER_MINUTE));

        return {
            distanceFeet,
            walkMinutes,
        };
    }

    #buildSteps(fromBuilding, toBuilding) {
        const dx = toBuilding.cx - fromBuilding.cx;
        const dy = toBuilding.cy - fromBuilding.cy;
        const steps = [];

        // This service favors simple directional hints over exact pathfinding.
        if (Math.abs(dx) > Math.abs(dy)) {
            steps.push(`Head ${dx > 0 ? "east" : "west"} along the main corridor`);
            if (Math.abs(dy) > 30) {
                steps.push(`Turn ${dy > 0 ? "south" : "north"} at the next junction`);
            }
        } else {
            steps.push(`Head ${dy > 0 ? "south" : "north"} along the path`);
            if (Math.abs(dx) > 30) {
                steps.push(`Turn ${dx > 0 ? "east" : "west"} at the next junction`);
            }
        }

        steps.push(`Arrive at ${toBuilding.label}`);
        return steps;
    }
}

module.exports = IndoorUiRouteService;
