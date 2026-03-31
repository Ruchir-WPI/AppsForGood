import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./OutdoorMap.css";

// ── Config ────────────────────────────────────────────────────────────────────

// Replace with your actual Mapbox public token from https://account.mapbox.com
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// UMass Memorial Medical Center — main entrance
const UMASS_MEMORIAL = {
    lng: -71.7654,
    lat: 42.2776,
    label: "UMass Memorial Medical Center",
    address: "55 Lake Ave N, Worcester, MA 01655",
};

// Zoom in past this threshold to show the "Enter Building" button
const ARRIVAL_ZOOM_THRESHOLD = 17;

// ── Mapbox Directions API ─────────────────────────────────────────────────────

/**
 * Fetches a walking route from the Mapbox Directions API.
 *
 * Docs: https://docs.mapbox.com/api/navigation/directions/
 *
 * @param {[number, number]} origin  - [lng, lat]
 * @param {[number, number]} dest    - [lng, lat]
 * @returns {{ route: object, steps: object[] } | null}
 */
async function fetchDirections(origin, dest) {
    const coords = `${origin[0]},${origin[1]};${dest[0]},${dest[1]}`;
    const url = new URL(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}`
    );
    url.searchParams.set("access_token", mapboxgl.accessToken);
    url.searchParams.set("steps", "true");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("overview", "full");
    url.searchParams.set("language", "en");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions API error: ${res.status}`);
    const data = await res.json();

    if (!data.routes?.length) return null;

    const route = data.routes[0];
    // Flatten all steps from all legs into a single list
    const steps = route.legs.flatMap((leg) => leg.steps);
    return { route, steps };
}

/**
 * Fetches address suggestions from the Mapbox Geocoding API.
 *
 * Docs: https://docs.mapbox.com/api/search/geocoding/
 *
 * @param {string} query
 * @returns {object[]} - Array of feature suggestions
 */
async function fetchGeocodeSuggestions(query) {
    if (!query || query.length < 3) return [];
    const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
    );
    url.searchParams.set("access_token", mapboxgl.accessToken);
    url.searchParams.set("autocomplete", "true");
    url.searchParams.set("country", "us");
    url.searchParams.set("types", "address,place,poi");
    url.searchParams.set("limit", "5");

    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.features ?? [];
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatDistance(meters) {
    const feet = meters * 3.281;
    return feet < 1000
        ? `${Math.round(feet)} ft`
        : `${(feet / 5280).toFixed(1)} mi`;
}

function formatDuration(seconds) {
    if (seconds < 60) return `${Math.round(seconds)} sec`;
    const mins = Math.round(seconds / 60);
    return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * OutdoorMap
 *
 * Props:
 *   onEnterBuilding: () => void   — called when the user taps "Enter Building",
 *                                   use this to swap in your <MapNavigation /> component
 */
export default function OutdoorMap({ onEnterBuilding }) {
    const mapContainerRef = useRef(null);
    const mapRef          = useRef(null);
    const mapLoadedRef    = useRef(false); // true once the style's "load" event fires
    const userMarkerRef   = useRef(null);
    const destMarkerRef   = useRef(null);

    const [userLocation, setUserLocation]           = useState(null); // [lng, lat]
    const [addressInput, setAddressInput]           = useState("");
    const [suggestions, setSuggestions]             = useState([]);
    const [showSuggestions, setShowSuggestions]     = useState(false);
    const [routeInfo, setRouteInfo]                 = useState(null);
    const [steps, setSteps]                         = useState([]);
    const [activeStep, setActiveStep]               = useState(0);
    const [loading, setLoading]                     = useState(false);
    const [error, setError]                         = useState(null);
    const [geoStatus, setGeoStatus]                 = useState("idle"); // idle | locating | found | denied
    const [showEnterBuilding, setShowEnterBuilding] = useState(false);

    // ── Map init ──────────────────────────────────────────────────────────────

    useEffect(() => {
        if (mapRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [UMASS_MEMORIAL.lng, UMASS_MEMORIAL.lat],
            zoom: 14,
        });

        console.log(document.querySelector('.outdoorMapCanvas').getBoundingClientRect());

        map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

        // Wait for the style to fully load before adding sources, layers, or markers.
        // Touching the map before this fires causes "getOwnLayer" / "appendChild" errors.
        map.on("load", () => {
            mapLoadedRef.current = true;

            const destEl = document.createElement("div");
            destEl.className = "markerDest";
            destMarkerRef.current = new mapboxgl.Marker({ element: destEl })
                .setLngLat([UMASS_MEMORIAL.lng, UMASS_MEMORIAL.lat])
                .setPopup(
                    new mapboxgl.Popup({ offset: 25 }).setHTML(
                        `<strong>${UMASS_MEMORIAL.label}</strong><br/>${UMASS_MEMORIAL.address}`
                    )
                )
                .addTo(map);
        });

        map.on("zoomend", () => {
            setShowEnterBuilding(map.getZoom() >= ARRIVAL_ZOOM_THRESHOLD);
        });

        mapRef.current = map;
            return () => {
            mapLoadedRef.current = false;
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // ── Route layer helpers ───────────────────────────────────────────────────

    const drawRoute = useCallback((geojsonGeometry) => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current) return;

        if (map.getLayer("route")) map.removeLayer("route");
        if (map.getSource("route")) map.removeSource("route");

        map.addSource("route", {
            type: "geojson",
            data: { type: "Feature", geometry: geojsonGeometry },
        });

        map.addLayer({
            id: "route",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
                "line-color": "#1a73e8",
                "line-width": 5,
                "line-opacity": 0.85,
            },
        });
    }, []);

    const clearRoute = useCallback(() => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current) return;
        if (map.getLayer("route")) map.removeLayer("route");
        if (map.getSource("route")) map.removeSource("route");
        setRouteInfo(null);
        setSteps([]);
        setActiveStep(0);
    }, []);

    // ── Helpers: place or move the user marker ────────────────────────────────

    const placeUserMarker = useCallback((coords) => {
        const map = mapRef.current;
        if (!map || !mapLoadedRef.current) return;

        if (userMarkerRef.current) {
            userMarkerRef.current.setLngLat(coords);
        } else {
            const el = document.createElement("div");
            el.className = "markerUser";
            userMarkerRef.current = new mapboxgl.Marker({ element: el })
                .setLngLat(coords)
                .addTo(map);
        }
    }, []);

    // ── Geolocation ───────────────────────────────────────────────────────────

    const locateUser = useCallback(() => {
        if (!navigator.geolocation) {
            setError("Geolocation is not supported by your browser.");
            return;
        }
        setGeoStatus("locating");
        setError(null);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const coords = [pos.coords.longitude, pos.coords.latitude];
                setUserLocation(coords);
                setGeoStatus("found");
                setAddressInput("My current location");
                setSuggestions([]);
                placeUserMarker(coords);
            },
            (err) => {
                setGeoStatus("denied");
                setError("Location access denied. Please enter your address instead.");
                console.warn("Geolocation error:", err.message);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, [placeUserMarker]);

    // ── Address search ────────────────────────────────────────────────────────

    const handleAddressChange = useCallback(async (value) => {
        setAddressInput(value);
        if (value === "My current location") return;
        setGeoStatus("idle");
        const results = await fetchGeocodeSuggestions(value);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
    }, []);

    const handleSelectSuggestion = useCallback((feature) => {
        const [lng, lat] = feature.center;
        const coords = [lng, lat];
        setUserLocation(coords);
        setAddressInput(feature.place_name);
        setSuggestions([]);
        setShowSuggestions(false);
        placeUserMarker(coords);
    }, [placeUserMarker]);

    // ── Get Directions ────────────────────────────────────────────────────────

    const handleGetDirections = useCallback(async () => {
        if (!userLocation) {
            setError("Please set your starting location first.");
            return;
        }
        setLoading(true);
        setError(null);
        clearRoute();

        try {
            const dest = [UMASS_MEMORIAL.lng, UMASS_MEMORIAL.lat];
            const result = await fetchDirections(userLocation, dest);
            if (!result) {
                setError("No route found. Please try a different starting location.");
                return;
            }

            const { route, steps: routeSteps } = result;
            drawRoute(route.geometry);
            setRouteInfo({
                distanceM: route.distance,
                durationS: route.duration,
            });
            setSteps(routeSteps);
            setActiveStep(0);

            // Fit map to route bounds
            const coords = route.geometry.coordinates;
            const bounds = coords.reduce(
                (b, c) => b.extend(c),
                new mapboxgl.LngLatBounds(coords[0], coords[0])
            );
            mapRef.current.fitBounds(bounds, { padding: 60 });
        } catch (err) {
            setError("Failed to fetch directions. Please check your connection.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [userLocation, drawRoute, clearRoute]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="outdoorWrapper">
            {/* ── Sidebar ── */}
            <div className="outdoorSidebar">
                <div className="outdoorSidebarHeader">
                    <div className="outdoorLogo">Navigate to UMass Memorial</div>

                    {/* Starting location */}
                    <div className="locationSection">
                        <div className="locationLabel">Your starting location</div>
                        <div className="locationInputRow">
                            <div className="locationInputWrap">
                                <input
                                    className="locationInput"
                                    type="text"
                                    placeholder="Enter your address…"
                                    value={addressInput}
                                    onChange={(e) => handleAddressChange(e.target.value)}
                                    onFocus={() => setShowSuggestions(suggestions.length > 0)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                />
                                {showSuggestions && (
                                    <ul className="suggestionsList">
                                        {suggestions.map((f) => (
                                            <li
                                                key={f.id}
                                                className="suggestionItem"
                                                onMouseDown={() => handleSelectSuggestion(f)}
                                            >
                                                <span className="suggestionName">
                                                    {f.text}
                                                </span>
                                                <span className="suggestionPlace">
                                                    {f.place_name.split(",").slice(1).join(",").trim()}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <button
                                className={`geoBtn${geoStatus === "locating" ? " geoBtnActive" : ""}`}
                                onClick={locateUser}
                                title="Use my current location"
                            >
                                {geoStatus === "locating" ? "…" : "⦿"}
                            </button>
                        </div>
                    </div>

                    {/* Destination (fixed) */}
                    <div className="destRow">
                        <div className="destDot" />
                        <div className="destInfo">
                            <div className="destName">{UMASS_MEMORIAL.label}</div>
                            <div className="destAddress">{UMASS_MEMORIAL.address}</div>
                        </div>
                    </div>

                    <button
                        className={`directionsBtn${loading ? " directionsBtnLoading" : ""}`}
                        onClick={handleGetDirections}
                        disabled={loading || !userLocation}
                    >
                        {loading ? "Getting directions…" : "Get Walking Directions"}
                    </button>

                    {error && <div className="errorBanner">{error}</div>}
                </div>

                {/* Route summary */}
                {routeInfo && (
                    <div className="routeSummary">
                        <div className="routeStat">
                            <strong className="routeStatNum">
                                {formatDuration(routeInfo.durationS)}
                            </strong>
                            walk
                        </div>
                        <div className="routeStat">
                            <strong className="routeStatNum">
                                {formatDistance(routeInfo.distanceM)}
                            </strong>
                            distance
                        </div>
                    </div>
                )}

                {/* Turn-by-turn steps */}
                {steps.length > 0 && (
                    <div className="stepsList">
                        {steps.map((step, i) => (
                            <div
                                key={i}
                                className={`stepItem${i === activeStep ? " stepItemActive" : ""}`}
                                onClick={() => {
                                    setActiveStep(i);
                                    mapRef.current?.flyTo({
                                        center: step.maneuver.location,
                                        zoom: 17,
                                    });
                                }}
                            >
                                <div className="stepIcon">
                                    {i === steps.length - 1 ? "⚑" : i + 1}
                                </div>
                                <div className="stepText">
                                    <div className="stepInstruction">
                                        {step.maneuver.instruction}
                                    </div>
                                    <div className="stepMeta">
                                        {formatDistance(step.distance)}
                                        {step.name ? ` · ${step.name}` : ""}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Enter Building button — shown when zoomed in close */}
                {showEnterBuilding && onEnterBuilding && (
                    <div className="enterBuildingWrap">
                        <button className="enterBuildingBtn" onClick={onEnterBuilding}>
                            Enter Building — Switch to Indoor Map
                        </button>
                    </div>
                )}
            </div>

            {/* ── Map canvas ── */}
            <div className="outdoorMapCanvas" ref={mapContainerRef} />
        </div>
    );
}