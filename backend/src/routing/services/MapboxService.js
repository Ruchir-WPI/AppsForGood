// Mapbox API adapter for outdoor directions and Massachusetts-scoped geocoding.
// Converts upstream failures into AppError subclasses and returns frontend-safe
// route/suggestion payloads instead of leaking raw Mapbox response shapes.
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
const MAPBOX_SEARCHBOX_RESULT_TYPES = "address,street,place,city,locality,neighborhood,poi";
const MAPBOX_SEARCHBOX_MAX_LIMIT = 10;
const MAPBOX_DIRECTIONS_PROFILES = new Set(["walking", "cycling", "driving"]);

function round(value) {
    return Math.round(value * 100) / 100;
}

// AI acknowledgement: This Mapbox integration service was drafted with AI assistance and reviewed by the project author.
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

    async getRoute({ startLng, startLat, endLng, endLat, profile = "walking" }) {
        this.#assertCoordinate(startLng, "startLng");
        this.#assertCoordinate(startLat, "startLat");
        this.#assertCoordinate(endLng, "endLng");
        this.#assertCoordinate(endLat, "endLat");
        const normalizedProfile = this.#normalizeDirectionsProfile(profile);

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
        const url = `${this.directionsBaseUrl}/directions/v5/mapbox/${normalizedProfile}/${coordinates}?${params.toString()}`;

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
            profile: normalizedProfile,
            distanceMeters: round(route.distance || 0),
            durationSeconds: round(route.duration || 0),
            geometry: route.geometry || null,
            steps,
        };
    }

    async getWalkingRoute({ startLng, startLat, endLng, endLat }) {
        return this.getRoute({
            startLng,
            startLat,
            endLng,
            endLat,
            profile: "walking",
        });
    }

    async geocodeSuggestions({ query, limit = 5 } = {}) {
        if (typeof query !== "string" || query.trim().length === 0) {
            throw new ValidationError("Geocode query must be a non-empty string.");
        }

        const normalizedQuery = query.trim();
        const safeLimit = this.#normalizeSuggestionLimit(limit);
        const searchFeatures = await this.#fetchSearchBoxFeatures({
            query: normalizedQuery,
            limit: safeLimit,
            autoComplete: true,
        });

        return this.#normalizeSearchBoxFeatures(searchFeatures).slice(0, safeLimit);
    }

    async geocodePlace(query) {
        if (typeof query !== "string" || query.trim().length === 0) {
            throw new ValidationError("Geocode query must be a non-empty string.");
        }

        const searchFeatures = await this.#fetchSearchBoxFeatures({
            query: query.trim(),
            limit: 1,
            autoComplete: false,
        });
        const suggestions = this.#normalizeSearchBoxFeatures(searchFeatures);
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

    async #fetchSearchBoxFeatures({ query, limit, autoComplete }) {
        if (typeof this.fetchImpl !== "function") {
            throw new ConfigError("Global fetch is unavailable. Use Node.js 18+ or provide fetchImpl.");
        }

        const accessToken = this.accessToken || getMapboxAccessToken({ required: true });
        const params = new URLSearchParams({
            q: query,
            language: "en",
            country: "US",
            types: MAPBOX_SEARCHBOX_RESULT_TYPES,
            bbox: MASSACHUSETTS_BBOX_PARAM,
            proximity: UMASS_MEMORIAL_PROXIMITY_PARAM,
            limit: String(limit),
            auto_complete: autoComplete ? "true" : "false",
            access_token: accessToken,
        });
        const url = `${this.directionsBaseUrl}/search/searchbox/v1/forward?${params.toString()}`;

        let response;
        try {
            response = await this.fetchImpl(url);
        } catch (error) {
            throw new UpstreamApiError("Mapbox Search Box request failed.", {
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
            throw new UpstreamApiError("Mapbox Search Box returned an error response.", {
                provider: "mapbox",
                upstreamStatus: response.status,
                upstreamCode: payload?.code || null,
                message: payload?.message || null,
            }, response.status >= 500 ? 503 : 502);
        }

        return Array.isArray(payload?.features) ? payload.features : [];
    }

    #normalizeSearchBoxFeatures(features) {
        const normalized = [];
        const seen = new Set();

        features.forEach((feature) => {
            const coords = this.#extractFeatureCoordinates(feature);
            if (!coords) {
                return;
            }

            const [lng, lat] = coords;
            if (!this.#isMassachusettsCoordinate(lng, lat)) {
                return;
            }

            const properties = feature?.properties || {};
            const text = properties.name || properties.name_preferred || feature?.text || "";
            const address = properties.address || "";
            const placeContext = properties.place_formatted || "";
            const placeName = properties.full_address
                || [address, placeContext].filter(Boolean).join(", ")
                || feature?.place_name
                || text;
            const fallbackKey = `${lng.toFixed(6)},${lat.toFixed(6)}:${placeName || text}`;
            const key = properties.mapbox_id || feature.id || fallbackKey;
            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            normalized.push({
                id: key,
                text,
                place_name: placeName,
                address,
                place_context: placeContext,
                center: [lng, lat],
            });
        });

        return normalized;
    }

    #extractFeatureCoordinates(feature) {
        if (Array.isArray(feature?.center) && feature.center.length >= 2) {
            return [feature.center[0], feature.center[1]];
        }

        const geometryCoordinates = feature?.geometry?.coordinates;
        if (Array.isArray(geometryCoordinates) && geometryCoordinates.length >= 2) {
            return [geometryCoordinates[0], geometryCoordinates[1]];
        }

        return null;
    }

    #normalizeSuggestionLimit(limit) {
        if (!Number.isInteger(limit)) {
            throw new ValidationError("Geocode limit must be an integer.");
        }

        if (limit < 1 || limit > MAPBOX_SEARCHBOX_MAX_LIMIT) {
            throw new ValidationError(`Geocode limit must be between 1 and ${MAPBOX_SEARCHBOX_MAX_LIMIT}.`);
        }

        return limit;
    }

    #normalizeDirectionsProfile(profile) {
        if (typeof profile !== "string" || profile.trim().length === 0) {
            throw new ValidationError("Route mode must be a non-empty string.");
        }

        const normalized = profile.trim().toLowerCase();
        if (!MAPBOX_DIRECTIONS_PROFILES.has(normalized)) {
            throw new ValidationError(
                `Route mode must be one of: ${Array.from(MAPBOX_DIRECTIONS_PROFILES).join(", ")}.`,
            );
        }

        return normalized;
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
