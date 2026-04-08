const { ConfigError } = require("../indoor-routing/utils/errors");

const DEFAULT_MAPBOX_DIRECTIONS_BASE_URL = "https://api.mapbox.com";

function getMapboxDirectionsBaseUrl() {
    // Allow tests or proxies to swap the upstream host without patching the service code.
    return process.env.MAPBOX_DIRECTIONS_BASE_URL || DEFAULT_MAPBOX_DIRECTIONS_BASE_URL;
}

function getMapboxAccessToken({ required = false } = {}) {
    const token = process.env.MAPBOX_ACCESS_TOKEN || "";

    if (required && !token) {
        throw new ConfigError(
            "MAPBOX_ACCESS_TOKEN is required for outdoor routing but is not set.",
            { envVar: "MAPBOX_ACCESS_TOKEN" },
        );
    }

    return token || null;
}

module.exports = {
    getMapboxAccessToken,
    getMapboxDirectionsBaseUrl,
    DEFAULT_MAPBOX_DIRECTIONS_BASE_URL,
};
