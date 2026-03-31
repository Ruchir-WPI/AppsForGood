import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./OutdoorMap.css";
import { fetchGeocodeSuggestions, fetchOutdoorRoute } from "./utils/navigationApi";
import {
    ARRIVAL_PROMPT_DISTANCE_METERS,
    TEST_LOCATION_PRESETS,
    UMASS_MEMORIAL,
} from "./constants/outdoorMap";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

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

function isValidCoordinatePair(lng, lat) {
    return Number.isFinite(lng)
        && Number.isFinite(lat)
        && lng >= -180
        && lng <= 180
        && lat >= -90
        && lat <= 90;
}

function distanceBetweenMeters(from, to) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusMeters = 6371000;

    const deltaLat = toRadians(to.lat - from.lat);
    const deltaLng = toRadians(to.lng - from.lng);
    const fromLatRad = toRadians(from.lat);
    const toLatRad = toRadians(to.lat);

    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMeters * c;
}

export default function OutdoorMap({ onEnterBuilding }) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const mapLoadedRef = useRef(false);
    const userMarkerRef = useRef(null);
    const destMarkerRef = useRef(null);

    const [userLocation, setUserLocation] = useState(null);
    const [addressInput, setAddressInput] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [routeInfo, setRouteInfo] = useState(null);
    const [steps, setSteps] = useState([]);
    const [activeStep, setActiveStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [geoStatus, setGeoStatus] = useState("idle");
    const [showAdminTools, setShowAdminTools] = useState(false);
    const [adminLngInput, setAdminLngInput] = useState(String(UMASS_MEMORIAL.lng));
    const [adminLatInput, setAdminLatInput] = useState(String(UMASS_MEMORIAL.lat));

    const distanceToDestinationMeters = useMemo(() => {
        if (!userLocation) {
            return null;
        }

        return distanceBetweenMeters(
            { lng: userLocation[0], lat: userLocation[1] },
            { lng: UMASS_MEMORIAL.lng, lat: UMASS_MEMORIAL.lat }
        );
    }, [userLocation]);

    const canEnterBuilding = typeof distanceToDestinationMeters === "number"
        && distanceToDestinationMeters <= ARRIVAL_PROMPT_DISTANCE_METERS;

    useEffect(() => {
        if (mapRef.current) return;

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [UMASS_MEMORIAL.lng, UMASS_MEMORIAL.lat],
            zoom: 14,
        });

        map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

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

        mapRef.current = map;
        return () => {
            mapLoadedRef.current = false;
            map.remove();
            mapRef.current = null;
        };
    }, []);

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

    const setCurrentLocation = useCallback((coords, label, status = "found") => {
        setUserLocation(coords);
        setAddressInput(label);
        setSuggestions([]);
        setShowSuggestions(false);
        setGeoStatus(status);
        setError(null);
        placeUserMarker(coords);
    }, [placeUserMarker]);

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
                setCurrentLocation(coords, "My current location", "found");
            },
            (err) => {
                setGeoStatus("denied");
                setError("Location access denied. Please enter your address instead.");
                console.warn("Geolocation error:", err.message);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }, [setCurrentLocation]);

    const handleAddressChange = useCallback(async (value) => {
        setAddressInput(value);
        if (value === "My current location") return;
        setGeoStatus("idle");

        try {
            const results = await fetchGeocodeSuggestions(value);
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
        } catch (err) {
            setSuggestions([]);
            setShowSuggestions(false);
            setError(err.message || "Failed to load address suggestions.");
        }
    }, []);

    const handleSelectSuggestion = useCallback((feature) => {
        const [lng, lat] = feature.center;
        const coords = [lng, lat];
        setCurrentLocation(coords, feature.place_name, "idle");
    }, [setCurrentLocation]);

    const applyAdminLocation = useCallback((lng, lat, label) => {
        if (!isValidCoordinatePair(lng, lat)) {
            setError("Admin location must include a valid longitude and latitude.");
            return;
        }

        const coords = [lng, lat];
        const defaultLabel = `Test location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        setCurrentLocation(coords, label || defaultLabel, "mocked");
        mapRef.current?.flyTo({ center: coords, zoom: 16 });
    }, [setCurrentLocation]);

    const handleApplyAdminLocation = useCallback(() => {
        const lng = Number(adminLngInput);
        const lat = Number(adminLatInput);
        applyAdminLocation(lng, lat);
    }, [adminLngInput, adminLatInput, applyAdminLocation]);

    const handleUsePresetLocation = useCallback((preset) => {
        setAdminLngInput(String(preset.lng));
        setAdminLatInput(String(preset.lat));
        applyAdminLocation(preset.lng, preset.lat, preset.label);
    }, [applyAdminLocation]);

    const handleGetDirections = useCallback(async () => {
        if (!userLocation) {
            setError("Please set your starting location first.");
            return;
        }
        setLoading(true);
        setError(null);
        clearRoute();

        try {
            const result = await fetchOutdoorRoute({
                start: { lng: userLocation[0], lat: userLocation[1] },
                destination: { lng: UMASS_MEMORIAL.lng, lat: UMASS_MEMORIAL.lat },
            });

            if (!result?.route?.geometry) {
                setError("No route found. Please try a different starting location.");
                return;
            }

            const { route, steps: routeSteps } = result;
            drawRoute(route.geometry);
            setRouteInfo({
                distanceM: route.distanceMeters,
                durationS: route.durationSeconds,
            });
            setSteps(routeSteps);
            setActiveStep(0);

            const coords = route.geometry.coordinates;
            const bounds = coords.reduce(
                (b, c) => b.extend(c),
                new mapboxgl.LngLatBounds(coords[0], coords[0])
            );
            mapRef.current.fitBounds(bounds, { padding: 60 });
        } catch (err) {
            setError(err?.message || "Failed to fetch directions. Please check your connection.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [userLocation, drawRoute, clearRoute]);

    return (
        <div className="outdoorWrapper">
            <div className="outdoorSidebar">
                <div className="outdoorSidebarHeader">
                    <div className="outdoorLogo">Navigate to UMass Memorial</div>

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

                    <div className="destRow">
                        <div className="destDot" />
                        <div className="destInfo">
                            <div className="destName">{UMASS_MEMORIAL.label}</div>
                            <div className="destAddress">{UMASS_MEMORIAL.address}</div>
                        </div>
                    </div>

                    {distanceToDestinationMeters !== null && (
                        <div className={`arrivalStatus${canEnterBuilding ? " arrivalStatusReady" : ""}`}>
                            {canEnterBuilding
                                ? "You are at the hospital. Switch to indoor navigation when you are ready."
                                : `${formatDistance(distanceToDestinationMeters)} from UMass Memorial.`}
                        </div>
                    )}

                    <div className="adminTools">
                        <button
                            className="adminToggleBtn"
                            onClick={() => setShowAdminTools((prev) => !prev)}
                            type="button"
                        >
                            {showAdminTools ? "Hide Admin Location Tools" : "Show Admin Location Tools"}
                        </button>

                        {showAdminTools && (
                            <div className="adminToolsPanel">
                                <div className="adminToolsLabel">Testing controls: set user location</div>

                                <div className="adminPresetRow">
                                    {TEST_LOCATION_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            className="adminPresetBtn"
                                            onClick={() => handleUsePresetLocation(preset)}
                                            type="button"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="adminCoordRow">
                                    <input
                                        className="adminCoordInput"
                                        type="number"
                                        step="0.000001"
                                        value={adminLngInput}
                                        onChange={(e) => setAdminLngInput(e.target.value)}
                                        placeholder="Longitude"
                                    />
                                    <input
                                        className="adminCoordInput"
                                        type="number"
                                        step="0.000001"
                                        value={adminLatInput}
                                        onChange={(e) => setAdminLatInput(e.target.value)}
                                        placeholder="Latitude"
                                    />
                                </div>

                                <div className="adminActionRow">
                                    <button className="adminApplyBtn" onClick={handleApplyAdminLocation} type="button">
                                        Set Test Location
                                    </button>
                                    <button className="adminResetBtn" onClick={locateUser} type="button">
                                        Use Device GPS
                                    </button>
                                </div>
                            </div>
                        )}
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

                {steps.length > 0 && (
                    <div className="stepsList">
                        {steps.map((step, i) => (
                            <div
                                key={i}
                                className={`stepItem${i === activeStep ? " stepItemActive" : ""}`}
                                onClick={() => {
                                    if (
                                        typeof step.location?.lng !== "number"
                                        || typeof step.location?.lat !== "number"
                                    ) {
                                        return;
                                    }

                                    setActiveStep(i);
                                    mapRef.current?.flyTo({
                                        center: [step.location.lng, step.location.lat],
                                        zoom: 17,
                                    });
                                }}
                            >
                                <div className="stepIcon">
                                    {i === steps.length - 1 ? "⚑" : i + 1}
                                </div>
                                <div className="stepText">
                                    <div className="stepInstruction">
                                        {step.instruction}
                                    </div>
                                    <div className="stepMeta">
                                        {formatDistance(step.distanceMeters)}
                                        {step.maneuverType ? ` · ${step.maneuverType}` : ""}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {canEnterBuilding && onEnterBuilding && (
                    <div className="enterBuildingWrap">
                        <button className="enterBuildingBtn" onClick={onEnterBuilding}>
                            Enter Building — Switch to Indoor Map
                        </button>
                    </div>
                )}
            </div>

            <div className="outdoorMapCanvas" ref={mapContainerRef} />
        </div>
    );
}