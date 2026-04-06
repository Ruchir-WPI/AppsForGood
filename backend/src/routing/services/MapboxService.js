const {
    RouteNotFoundError,
    UpstreamApiError,
    ValidationError,
    ConfigError,
} = require("../../indoor-routing/utils/errors");
const { getMapboxAccessToken, getMapboxDirectionsBaseUrl } = require("../../config/env");

function round(value) {
    return Math.round(value * 100) / 100;
}

class MapboxService {
    constructor({
                    fetchImpl = global.fetch,
                    directionsBaseUrl = getMapboxDirectionsBaseUrl(),
                    accessToken = null,
                } = {}) {
        this.fetchImpl = fetchImpl;
        this.directionsBaseUrl = directionsBaseUrl;
        this.accessToken = accessToken;
    }

    async getWalkingRoute({ startLng, startLat, endLng, endLat }) {
        this.#assertCoordinate(startLng, "startLng");
        this.#assertCoordinate(startLat, "startLat");
        this.#assertCoordinate(endLng, "endLng");
        this.#assertCoordinate(endLat, "endLat");

        if (typeof this.fetchImpl !== "function") {
            throw new ConfigError("Global fetch is unavailable. Use Node.js 18+ or provide fetchImpl.");
        }

        const accessToken = this.accessToken || getMapboxAccessToken({ required: true });
        const coordinates = `${startLng},${startLat};${endLng},${endLat}`;
        // Ask Mapbox for full line geometry plus turn-by-turn maneuvers in one call.
        const params = new URLSearchParams({
            alternatives: "false",
            geometries: "geojson",
            overview: "full",
            steps: "true",
            access_token: accessToken,
        });
        const url = `${this.directionsBaseUrl}/directions/v5/mapbox/walking/${coordinates}?${params.toString()}`;

        let response;
        try {
            response = await this.fetchImpl(url);
        } catch (error) {
            throw new UpstreamApiError("Mapbox Directions request failed.", {
                provider: "mapbox",
                reason: "NETWORK_FAILURE",
                cause: error?.message || String(error),
            }, 503);
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch (_error) {
            payload = null;
        }

        if (!response.ok) {
            throw new UpstreamApiError("Mapbox Directions returned an error response.", {
                provider: "mapbox",
                upstreamStatus: response.status,
                upstreamCode: payload?.code || null,
                message: payload?.message || null,
            }, response.status >= 500 ? 503 : 502);
        }

        const route = payload?.routes?.[0];
        if (!route) {
            throw new RouteNotFoundError("No outdoor route found from origin to entrance.", {
                provider: "mapbox",
                upstreamCode: payload?.code || null,
                message: payload?.message || null,
            });
        }

        // Mapbox nests maneuver steps under legs; flatten them for the API response.
        const steps = (route.legs || []).flatMap((leg) => leg.steps || []).map((step) => ({
            instruction: step?.maneuver?.instruction || step?.name || "Continue",
            distanceMeters: round(step?.distance || 0),
            durationSeconds: round(step?.duration || 0),
            maneuverType: step?.maneuver?.type || null,
            maneuverModifier: step?.maneuver?.modifier || null,
            location: {
                lng: step?.maneuver?.location?.[0] || null,
                lat: step?.maneuver?.location?.[1] || null,
            },
            source: "mapbox",
        }));

        return {
            provider: "mapbox",
            profile: "walking",
            distanceMeters: round(route.distance || 0),
            durationSeconds: round(route.duration || 0),
            geometry: route.geometry || null,
            steps,
        };
    }

    async geocodeSuggestions({ query, limit = 5 } = {}) {
        if (typeof this.fetchImpl !== "function") {
            throw new ConfigError("Global fetch is unavailable. Use Node.js 18+ or provide fetchImpl.");
        }

        if (typeof query !== "string" || query.trim().length === 0) {
            throw new ValidationError("Geocode query must be a non-empty string.");
        }

        const safeLimit = this.#normalizeSuggestionLimit(limit);
        const accessToken = this.accessToken || getMapboxAccessToken({ required: true });
        const encodedQuery = encodeURIComponent(query.trim());
        // Keep autocomplete results small and predictable for the frontend selector.
        const params = new URLSearchParams({
            autocomplete: "true",
            country: "us",
            types: "address,place,poi",
            limit: String(safeLimit),
            access_token: accessToken,
        });
        const url = `${this.directionsBaseUrl}/geocoding/v5/mapbox.places/${encodedQuery}.json?${params.toString()}`;

        let response;
        try {
            response = await this.fetchImpl(url);
        } catch (error) {
            throw new UpstreamApiError("Mapbox Geocoding request failed.", {
                provider: "mapbox",
                reason: "NETWORK_FAILURE",
                cause: error?.message || String(error),
            }, 503);
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch (_error) {
            payload = null;
        }

        if (!response.ok) {
            throw new UpstreamApiError("Mapbox Geocoding returned an error response.", {
                provider: "mapbox",
                upstreamStatus: response.status,
                upstreamCode: payload?.code || null,
                message: payload?.message || null,
            }, response.status >= 500 ? 503 : 502);
        }

        const features = Array.isArray(payload?.features) ? payload.features : [];

        return features
            .filter((feature) => Array.isArray(feature?.center) && feature.center.length >= 2)
            .map((feature) => ({
                id: feature.id,
                text: feature.text || "",
                place_name: feature.place_name || feature.text || "",
                center: [feature.center[0], feature.center[1]],
            }));
    }

    async geocodePlace(query) {
        // Reuse suggestion parsing so one-off geocodes and autocomplete stay aligned.
        const suggestions = await this.geocodeSuggestions({ query, limit: 1 });
        const feature = suggestions[0];
        if (!feature?.center) {
            throw new RouteNotFoundError(`No geocoding result found for "${query}".`, {
                provider: "mapbox",
            });
        }

        return {
            query,
            name: feature.place_name || query,
            location: {
                lng: feature.center[0],
                lat: feature.center[1],
            },
        };
    }

    #normalizeSuggestionLimit(limit) {
        if (!Number.isInteger(limit)) {
            throw new ValidationError("Geocode limit must be an integer.");
        }

        if (limit < 1 || limit > 10) {
            throw new ValidationError("Geocode limit must be between 1 and 10.");
        }

        return limit;
    }

    #assertCoordinate(value, fieldName) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            throw new ValidationError(`${fieldName} must be a finite number.`);
        }
    }
}

module.exports = MapboxService;
