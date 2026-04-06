const {
    RouteNotFoundError,
    UpstreamApiError,
    ValidationError,
    ConfigError,
} = require("../../indoor-routing/utils/errors");
const { getMapboxAccessToken, getMapboxDirectionsBaseUrl } = require("../../config/env");

const MASSACHUSETTS_BOUNDS = Object.freeze({
    westLng: -73.50814,
    southLat: 41.18706,
    eastLng: -69.85886,
    northLat: 42.88679,
});
const MASSACHUSETTS_BBOX_PARAM = [
    MASSACHUSETTS_BOUNDS.westLng,
    MASSACHUSETTS_BOUNDS.southLat,
    MASSACHUSETTS_BOUNDS.eastLng,
    MASSACHUSETTS_BOUNDS.northLat,
].join(",");
const UMASS_MEMORIAL_PROXIMITY_PARAM = "-71.7654,42.2776";

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
        const params = new URLSearchParams({
            autocomplete: "true",
            country: "us",
            types: "address,place,poi",
            bbox: MASSACHUSETTS_BBOX_PARAM,
            proximity: UMASS_MEMORIAL_PROXIMITY_PARAM,
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
            .filter((feature) => this.#isMassachusettsCoordinate(feature.center[0], feature.center[1]))
            .map((feature) => ({
                id: feature.id,
                text: feature.text || "",
                place_name: feature.place_name || feature.text || "",
                center: [feature.center[0], feature.center[1]],
            }));
    }

    async geocodePlace(query) {
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

    #isMassachusettsCoordinate(lng, lat) {
        if (typeof lng !== "number" || !Number.isFinite(lng)) {
            return false;
        }

        if (typeof lat !== "number" || !Number.isFinite(lat)) {
            return false;
        }

        return lng >= MASSACHUSETTS_BOUNDS.westLng
            && lng <= MASSACHUSETTS_BOUNDS.eastLng
            && lat >= MASSACHUSETTS_BOUNDS.southLat
            && lat <= MASSACHUSETTS_BOUNDS.northLat;
    }
}

module.exports = MapboxService;
