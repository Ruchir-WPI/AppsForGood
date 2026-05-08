// Orchestrates outdoor-to-indoor routing by trying candidate building entrances
// and selecting the cheapest Mapbox walking route plus indoor graph path. It also
// preserves legacy pure-indoor request support for older clients.
const { ValidationError, RouteNotFoundError } = require("../../indoor-routing/utils/errors");

const INDOOR_DISTANCE_UNIT_METERS = 1; // TODO: Calibrate this conversion against measured indoor distances.

function round(value) {
    return Math.round(value * 100) / 100;
}

class HybridRouteService {
    constructor({ indoorRouteService, mapboxService, campusData }) {
        if (!indoorRouteService) {
            throw new ValidationError("HybridRouteService requires indoorRouteService.");
        }

        if (!mapboxService) {
            throw new ValidationError("HybridRouteService requires mapboxService.");
        }

        if (!campusData) {
            throw new ValidationError("HybridRouteService requires campusData.");
        }

        this.indoorRouteService = indoorRouteService;
        this.mapboxService = mapboxService;
        this.campusData = campusData;
    }

    async computeRoute(request) {
        if (!request || typeof request !== "object" || Array.isArray(request)) {
            throw new ValidationError("Route request must be an object.");
        }

        const normalized = this.#normalizeRequest(request);
        if (normalized.mode === "indoor") {
            return this.indoorRouteService.computeRoute(normalized.indoorRequest);
        }

        return this.#computeHybridRoute(normalized.hybridRequest);
    }

    #normalizeRequest(request) {
        // Preserve the older flat request shape while newer clients send nested endpoints.
        const start =
            request.start ||
            this.#endpointFromLegacyFields({
                nodeId: request.startNodeId,
                roomId: request.startRoomId,
            });
        const destination =
            request.destination ||
            this.#endpointFromLegacyFields({
                nodeId: request.destinationNodeId,
                roomId: request.destinationRoomId,
            });

        if (!start || !destination) {
            throw new ValidationError("Request must include start and destination.");
        }

        const hasOutdoorStart = Boolean(start.coordinates || start.parkingGarageId);
        // No outdoor locator means this is still a pure indoor route request.
        if (!hasOutdoorStart) {
            return {
                mode: "indoor",
                indoorRequest: request,
            };
        }

        this.#assertNoIndoorLocator(start, "start");
        const outdoorStart = this.#resolveOutdoorStart(start);
        const normalizedDestination = this.#normalizeHybridDestination(destination);
        const requestOptions =
            request.options && typeof request.options === "object" && !Array.isArray(request.options)
                ? request.options
                : {};
        const wheelchairRequired = Boolean(requestOptions.wheelchairRequired);

        return {
            mode: "hybrid",
            hybridRequest: {
                start: outdoorStart,
                destination: normalizedDestination,
                options: {
                    ...requestOptions,
                    wheelchairRequired,
                },
            },
        };
    }

    async #computeHybridRoute(request) {
        const candidateEntrances = this.#resolveCandidateEntrances(
            request.destination,
            request.options.wheelchairRequired,
        );

        let bestRoute = null;

        // Try each valid entrance and keep the cheapest outdoor + indoor combination.
        for (const entrance of candidateEntrances) {
            let outdoorRoute = null;
            try {
                outdoorRoute = await this.mapboxService.getWalkingRoute({
                    startLng: request.start.coordinates.lng,
                    startLat: request.start.coordinates.lat,
                    endLng: entrance.outdoor.lng,
                    endLat: entrance.outdoor.lat,
                    wheelchairRequired: request.options.wheelchairRequired,
                });
            } catch (error) {
                if (error?.code === "ROUTE_NOT_FOUND") {
                    continue;
                }
                throw error;
            }

            let indoorRoute = null;
            try {
                if (typeof this.indoorRouteService.computeIndoorRoute === "function") {
                    indoorRoute = this.indoorRouteService.computeIndoorRoute({
                        start: { nodeId: entrance.indoorNodeId },
                        destination: request.destination.indoorTarget,
                        buildingId: request.destination.buildingId,
                        options: request.options,
                    });
                } else {
                    indoorRoute = this.indoorRouteService.computeRoute({
                        start: { nodeId: entrance.indoorNodeId },
                        destination: request.destination.indoorTarget,
                        buildingId: request.destination.buildingId,
                        options: request.options,
                    });
                }
            } catch (error) {
                if (error?.code === "ROUTE_NOT_FOUND") {
                    continue;
                }
                throw error;
            }

            const indoorDistanceMetersApprox = indoorRoute.totalDistance * INDOOR_DISTANCE_UNIT_METERS;
            const score = outdoorRoute.distanceMeters + indoorDistanceMetersApprox;
            if (!bestRoute || score < bestRoute.score) {
                bestRoute = {
                    entrance,
                    outdoorRoute,
                    indoorRoute,
                    score,
                    indoorDistanceMetersApprox,
                };
            }
        }

        if (!bestRoute) {
            throw new RouteNotFoundError("No hybrid route found for the provided start and destination.");
        }

        return this.#buildHybridResponse(request, bestRoute);
    }

    #buildHybridResponse(request, bestRoute) {
        const outdoorLeg = {
            type: "outdoor",
            provider: bestRoute.outdoorRoute.provider,
            profile: bestRoute.outdoorRoute.profile,
            distanceMeters: bestRoute.outdoorRoute.distanceMeters,
            durationSeconds: bestRoute.outdoorRoute.durationSeconds,
            geometry: bestRoute.outdoorRoute.geometry,
            steps: bestRoute.outdoorRoute.steps.map((step) => ({
                instruction: step.instruction,
                distanceMeters: step.distanceMeters,
                durationSeconds: step.durationSeconds,
                maneuverType: step.maneuverType,
                maneuverModifier: step.maneuverModifier,
                location: step.location,
                source: "mapbox",
            })),
        };

        const indoorLeg = {
            type: "indoor",
            provider: "internal",
            algorithm: bestRoute.indoorRoute.meta?.algorithm || "A*",
            distance: bestRoute.indoorRoute.totalDistance,
            distanceMetersApprox: round(bestRoute.indoorDistanceMetersApprox),
            nodePath: bestRoute.indoorRoute.nodePath,
            steps: bestRoute.indoorRoute.steps.map((step) => ({
                instruction: step.instruction,
                fromNodeId: step.fromNodeId,
                toNodeId: step.toNodeId,
                distance: step.distance,
                source: "indoor",
            })),
        };

        const transitionStep = {
            legType: "indoor",
            instruction: `Enter through ${bestRoute.entrance.label} and continue inside.`,
            source: "system",
        };
        // Flatten both legs into one instruction list for clients that render a single timeline.
        const stitchedSteps = [
            ...outdoorLeg.steps.map((step) => ({
                legType: "outdoor",
                instruction: step.instruction,
                source: "mapbox",
            })),
            transitionStep,
            ...indoorLeg.steps.map((step) => ({
                legType: "indoor",
                instruction: step.instruction,
                source: "indoor",
            })),
        ];

        return {
            mode: "hybrid",
            start: request.start,
            destination: request.destination.normalizedDestination,
            selectedEntrance: {
                id: bestRoute.entrance.id,
                label: bestRoute.entrance.label,
                outdoor: bestRoute.entrance.outdoor,
                indoorNodeId: bestRoute.entrance.indoorNodeId,
            },
            legs: [outdoorLeg, indoorLeg],
            summary: {
                totalDistanceMetersApprox: round(
                    bestRoute.outdoorRoute.distanceMeters + bestRoute.indoorDistanceMetersApprox,
                ),
                totalDurationSecondsApprox: bestRoute.outdoorRoute.durationSeconds,
                indoorDistance: bestRoute.indoorRoute.totalDistance,
                outdoorDistanceMeters: bestRoute.outdoorRoute.distanceMeters,
            },
            steps: stitchedSteps,
            metadata: {
                indoorAlgorithm: bestRoute.indoorRoute.meta?.algorithm || "A*",
                outdoorProvider: "mapbox",
                visited: bestRoute.indoorRoute.meta?.visitedNodeCount || null,
                wheelchairRequired: Boolean(request.options.wheelchairRequired),
                notes: [
                    "Outdoor leg uses pedestrian walking directions from Mapbox.",
                    "Wheelchair accessibility filtering is enforced on indoor graph edges and entrance selection.",
                ],
            },
        };
    }

    #resolveCandidateEntrances(destination, wheelchairRequired) {
        let entrances = [];
        // A requested entrance bypasses scoring across the full building entrance list.
        if (destination.entranceId) {
            const entrance = this.campusData.getEntranceById(destination.entranceId);
            if (!entrance) {
                throw new ValidationError(`Unknown destination.entranceId "${destination.entranceId}".`);
            }

            if (entrance.buildingId !== destination.buildingId) {
                throw new ValidationError(
                    `Entrance "${entrance.id}" does not belong to destination building "${destination.buildingId}".`,
                );
            }

            entrances = [entrance];
        } else {
            entrances = this.campusData.getBuildingEntrances(destination.buildingId);
        }

        if (wheelchairRequired) {
            entrances = entrances.filter((entrance) => entrance.wheelchairAccessible);
        }

        if (entrances.length === 0) {
            throw new RouteNotFoundError(
                `No building entrances available for building "${destination.buildingId}" and selected options.`,
            );
        }

        return entrances;
    }

    #resolveOutdoorStart(start) {
        if (start.coordinates && start.parkingGarageId) {
            throw new ValidationError("start must include either coordinates or parkingGarageId, not both.");
        }

        if (start.coordinates) {
            this.#validateCoordinates(start.coordinates, "start.coordinates");
            return {
                type: "coordinates",
                coordinates: {
                    lng: start.coordinates.lng,
                    lat: start.coordinates.lat,
                },
            };
        }

        if (!start.parkingGarageId) {
            throw new ValidationError("Hybrid start must include coordinates or parkingGarageId.");
        }

        const outdoorPoint = this.campusData.getOutdoorPointById(start.parkingGarageId);
        if (!outdoorPoint) {
            throw new ValidationError(`Unknown start.parkingGarageId "${start.parkingGarageId}".`);
        }

        return {
            type: "parking_garage",
            parkingGarageId: outdoorPoint.id,
            label: outdoorPoint.label,
            coordinates: {
                lng: outdoorPoint.location.lng,
                lat: outdoorPoint.location.lat,
            },
        };
    }

    #normalizeHybridDestination(destination) {
        const hasNodeId = Boolean(destination.nodeId);
        const hasRoomId = Boolean(destination.roomId);
        if (hasNodeId === hasRoomId) {
            throw new ValidationError("destination must include exactly one of nodeId or roomId for hybrid routing.");
        }

        const graph = this.indoorRouteService.graph;
        let buildingId;
        const indoorTarget = {};

        // Normalize mixed room/node inputs into the shape expected by the indoor router.
        if (hasNodeId) {
            const node = graph.getNode(destination.nodeId);
            buildingId = node.buildingId;
            indoorTarget.nodeId = node.id;
        } else {
            const room = graph.getRoom(destination.roomId);
            buildingId = room.buildingId;
            indoorTarget.roomId = room.id;
        }

        if (destination.buildingId && destination.buildingId !== buildingId) {
            throw new ValidationError(
                `destination.buildingId "${destination.buildingId}" does not match indoor target building "${buildingId}".`,
            );
        }

        return {
            buildingId,
            entranceId: destination.entranceId || null,
            indoorTarget,
            normalizedDestination: {
                ...indoorTarget,
                buildingId,
                ...(destination.entranceId ? { entranceId: destination.entranceId } : {}),
            },
        };
    }

    #validateCoordinates(coordinates, fieldName) {
        if (!coordinates || typeof coordinates !== "object" || Array.isArray(coordinates)) {
            throw new ValidationError(`${fieldName} must be an object with lng and lat.`);
        }

        if (typeof coordinates.lng !== "number" || !Number.isFinite(coordinates.lng)) {
            throw new ValidationError(`${fieldName}.lng must be a finite number.`);
        }

        if (typeof coordinates.lat !== "number" || !Number.isFinite(coordinates.lat)) {
            throw new ValidationError(`${fieldName}.lat must be a finite number.`);
        }
    }

    #assertNoIndoorLocator(endpoint, fieldName) {
        const hasNodeId = Boolean(endpoint.nodeId);
        const hasRoomId = Boolean(endpoint.roomId);

        if (hasNodeId || hasRoomId) {
            throw new ValidationError(
                `${fieldName} cannot include nodeId/roomId when coordinates or parkingGarageId are provided.`,
            );
        }
    }

    #endpointFromLegacyFields({ nodeId, roomId }) {
        if (!nodeId && !roomId) {
            return null;
        }

        return {
            ...(nodeId ? { nodeId } : {}),
            ...(roomId ? { roomId } : {}),
        };
    }
}

module.exports = {
    HybridRouteService,
    INDOOR_DISTANCE_UNIT_METERS,
};
