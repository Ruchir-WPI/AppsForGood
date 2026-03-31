import {
    API_BASE,
    DEFAULT_GEOCODE_LIMIT,
    MIN_GEOCODE_QUERY_LENGTH,
} from "../constants/api";

async function parseJson(response) {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });

    const payload = await parseJson(response);

    if (!response.ok) {
        let message = payload?.message || `Request failed with status ${response.status}.`;
        if (!payload?.message && response.status === 502) {
            message = "Cannot reach the backend API. Start the backend server on http://localhost:3001 and try again.";
        }
        const error = new Error(message);
        error.status = response.status;
        error.code = payload?.error || "HTTP_ERROR";
        error.details = payload?.details || null;
        throw error;
    }

    return payload;
}

export async function fetchIndoorBuildings() {
    const payload = await requestJson("/campus/buildings", { method: "GET" });
    return Array.isArray(payload?.buildings) ? payload.buildings : [];
}

export async function fetchIndoorRoute({ from, to }) {
    return requestJson("/route/indoor-ui", {
        method: "POST",
        body: JSON.stringify({ from, to }),
    });
}

export async function fetchOutdoorRoute({ start, destination }) {
    return requestJson("/route/outdoor", {
        method: "POST",
        body: JSON.stringify({ start, destination }),
    });
}

export async function fetchGeocodeSuggestions(query, { limit = DEFAULT_GEOCODE_LIMIT } = {}) {
    const normalizedQuery = typeof query === "string" ? query.trim() : "";
    if (normalizedQuery.length < MIN_GEOCODE_QUERY_LENGTH) {
        return [];
    }

    const params = new URLSearchParams({
        q: normalizedQuery,
        limit: String(limit),
    });

    const payload = await requestJson(`/geocode/suggestions?${params.toString()}`, {
        method: "GET",
    });

    return Array.isArray(payload?.suggestions) ? payload.suggestions : [];
}