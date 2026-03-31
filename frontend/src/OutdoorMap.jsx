import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./OutdoorMap.css";
import { fetchGeocodeSuggestions, fetchOutdoorRoute } from "./utils/navigationApi";
import { ARRIVAL_ZOOM_THRESHOLD, UMASS_MEMORIAL } from "./constants/outdoorMap";

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
    const [showEnterBuilding, setShowEnterBuilding] = useState(false);

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
        setUserLocation(coords);
        setAddressInput(feature.place_name);
        setSuggestions([]);
        setShowSuggestions(false);
        placeUserMarker(coords);
    }, [placeUserMarker]);

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

                {showEnterBuilding && onEnterBuilding && (
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