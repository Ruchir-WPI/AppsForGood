// Environment accessors for backend integrations. Centralizes Mapbox token/base
// URL resolution so services, diagnostics, and tests use the same fallback rules.
const { ConfigError } = require("../indoor-routing/utils/errors");

const DEFAULT_MAPBOX_DIRECTIONS_BASE_URL = "https://api.mapbox.com";

function resolveMapboxAccessToken() {
    const explicitBackendToken = process.env.MAPBOX_ACCESS_TOKEN || "";
    if (explicitBackendToken) {
        return {
            value: explicitBackendToken,
            source: "MAPBOX_ACCESS_TOKEN",
        };
    }

    const viteTokenFallback = process.env.VITE_MAPBOX_TOKEN || "";
    if (viteTokenFallback) {
        return {
            value: viteTokenFallback,
            source: "VITE_MAPBOX_TOKEN",
        };
    }

    return {
        value: "",
        source: null,
    };
}

function getMapboxDirectionsBaseUrl() {
    // Allow tests or proxies to swap the upstream host without patching the service code.
    return process.env.MAPBOX_DIRECTIONS_BASE_URL || DEFAULT_MAPBOX_DIRECTIONS_BASE_URL;
}

function getMapboxAccessToken({ required = false } = {}) {
    const { value: token } = resolveMapboxAccessToken();

    if (required && !token) {
        throw new ConfigError(
            "A Mapbox access token is required for outdoor routing, but neither MAPBOX_ACCESS_TOKEN nor VITE_MAPBOX_TOKEN is set.",
            { envVars: ["MAPBOX_ACCESS_TOKEN", "VITE_MAPBOX_TOKEN"] },
        );
    }

    return token || null;
}

function getEnvironmentDiagnostics() {
    const { source } = resolveMapboxAccessToken();

    return {
        mapboxAccessTokenConfigured: Boolean(source),
        mapboxAccessTokenSource: source,
        mapboxDirectionsBaseUrl: getMapboxDirectionsBaseUrl(),
    };
}

module.exports = {
    getMapboxAccessToken,
    getMapboxDirectionsBaseUrl,
    getEnvironmentDiagnostics,
    DEFAULT_MAPBOX_DIRECTIONS_BASE_URL,
};
