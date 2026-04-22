const DEFAULT_API_BASE = import.meta.env.DEV ? "/api" : "/_/backend/api";

export const API_BASE = import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;
export const MIN_GEOCODE_QUERY_LENGTH = 3;
export const DEFAULT_GEOCODE_LIMIT = 5;
export const EXPANDED_GEOCODE_LIMIT = 10;