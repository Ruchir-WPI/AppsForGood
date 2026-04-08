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
const MAPBOX_GEOCODE_FEATURE_TYPES = "address,place,locality,neighborhood,poi";
const MAPBOX_INTERNAL_GEOCODE_LIMIT = 20;

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
        if (typeof query !== "string" || query.trim().length === 0) {
            throw new ValidationError("Geocode query must be a non-empty string.");
        }

        const normalizedQuery = query.trim();
        const safeLimit = this.#normalizeSuggestionLimit(limit);
        const primaryFeatures = await this.#fetchGeocodeFeatures({
            query: normalizedQuery,
            limit: MAPBOX_INTERNAL_GEOCODE_LIMIT,
            autocomplete: true,
        });

        let normalizedSuggestions = this.#normalizeMassachusettsFeatures(primaryFeatures);

        if (normalizedSuggestions.length < safeLimit) {
            const queryWithMassachusettsHint = this.#withMassachusettsHint(normalizedQuery);
            if (queryWithMassachusettsHint !== normalizedQuery) {
                const hintedFeatures = await this.#fetchGeocodeFeatures({
                    query: queryWithMassachusettsHint,
                    limit: MAPBOX_INTERNAL_GEOCODE_LIMIT,
                    autocomplete: true,
                });

                normalizedSuggestions = this.#normalizeMassachusettsFeatures([
                    ...primaryFeatures,
                    ...hintedFeatures,
                ]);
            }
        }

        return normalizedSuggestions.slice(0, safeLimit);
    }

    async geocodePlace(query) {
        const suggestions = await this.geocodeSuggestions({
            query,
            limit: MAPBOX_INTERNAL_GEOCODE_LIMIT,
        });
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

    async #fetchGeocodeFeatures({ query, limit, autocomplete }) {
        if (typeof this.fetchImpl !== "function") {
            throw new ConfigError("Global fetch is unavailable. Use Node.js 18+ or provide fetchImpl.");
        }

        const accessToken = this.accessToken || getMapboxAccessToken({ required: true });
        const encodedQuery = encodeURIComponent(query);
        const params = new URLSearchParams({
            autocomplete: autocomplete ? "true" : "false",
            fuzzyMatch: "true",
            country: "us",
            types: MAPBOX_GEOCODE_FEATURE_TYPES,
            bbox: MASSACHUSETTS_BBOX_PARAM,
            proximity: UMASS_MEMORIAL_PROXIMITY_PARAM,
            limit: String(limit),
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

        return Array.isArray(payload?.features) ? payload.features : [];
    }

    #normalizeMassachusettsFeatures(features) {
        const normalized = [];
        const seen = new Set();

        features.forEach((feature) => {
            if (!this.#isMassachusettsFeature(feature)) {
                return;
            }

            const lng = feature.center[0];
            const lat = feature.center[1];
            const fallbackKey = `${lng.toFixed(6)},${lat.toFixed(6)}:${feature.place_name || feature.text || ""}`;
            const key = feature.id || fallbackKey;
            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            normalized.push({
                id: feature.id || fallbackKey,
                text: feature.text || "",
                place_name: feature.place_name || feature.text || "",
                center: [lng, lat],
            });
        });

        return normalized;
    }

    #isMassachusettsFeature(feature) {
        if (!Array.isArray(feature?.center) || feature.center.length < 2) {
            return false;
        }

        const [lng, lat] = feature.center;
        if (this.#isMassachusettsCoordinate(lng, lat)) {
            return true;
        }

        const context = Array.isArray(feature?.context) ? feature.context : [];
        if (
            context.some(
                (entry) => typeof entry?.short_code === "string" && entry.short_code.toUpperCase() === "US-MA",
            )
        ) {
            return true;
        }

        const contextNames = context
            .map((entry) => entry?.text)
            .filter((value) => typeof value === "string");
        const tokens = [feature?.place_name, feature?.text, ...contextNames]
            .filter((value) => typeof value === "string")
            .join(" ")
            .toLowerCase();

        return tokens.includes("massachusetts");
    }

    #withMassachusettsHint(query) {
        if (/\b(ma|massachusetts)\b/i.test(query)) {
            return query;
        }

        return `${query}, Massachusetts`;
    }

    #normalizeSuggestionLimit(limit) {
        if (!Number.isInteger(limit)) {
            throw new ValidationError("Geocode limit must be an integer.");
        }

        if (limit < 1 || limit > MAPBOX_INTERNAL_GEOCODE_LIMIT) {
            throw new ValidationError(`Geocode limit must be between 1 and ${MAPBOX_INTERNAL_GEOCODE_LIMIT}.`);
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
