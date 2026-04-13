import { useEffect, useRef, useState, useCallback, useMemo, useId } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./OutdoorNavigation.css";
import {
    fetchGeocodePlace,
    fetchGeocodeSuggestions,
    fetchIndoorMapData,
    fetchOutdoorRoute,
} from "./utils/navigationApi";
import {
    ARRIVAL_PROMPT_DISTANCE_METERS,
    DESTINATION_COORD_MAX_DISTANCE_METERS,
    OUTDOOR_TRANSPORT_MODES,
    TEST_LOCATION_PRESETS,
    UMASS_MEMORIAL,
} from "./constants/outdoorNavigation";
import { EXPANDED_GEOCODE_LIMIT } from "./constants/api";

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

function transportVerb(mode) {
    if (mode === "driving") {
        return "drive";
    }

    if (mode === "cycling") {
        return "ride";
    }

    return "walk";
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

function normalizeSearchText(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getSuggestionAddressLine(feature) {
    const explicitAddress = typeof feature?.address === "string" ? feature.address.trim() : "";
    if (explicitAddress) {
        return explicitAddress;
    }

    const placeName = typeof feature?.place_name === "string" ? feature.place_name : "";
    const firstSegment = placeName.split(",")[0]?.trim() || "";
    if (!firstSegment) {
        return "";
    }

    if (normalizeSearchText(firstSegment) === normalizeSearchText(feature?.text || "")) {
        return "";
    }

    return firstSegment;
}

function getSuggestionContextLine(feature) {
    const explicitContext = typeof feature?.place_context === "string" ? feature.place_context.trim() : "";
    if (explicitContext) {
        return explicitContext;
    }

    const placeName = typeof feature?.place_name === "string" ? feature.place_name : "";
    const segments = placeName
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    if (segments.length <= 1) {
        return "";
    }

    return segments.slice(1).join(", ");
}

function fuzzyScore(query, target) {
    const normalizedQuery = normalizeSearchText(query);
    const normalizedTarget = normalizeSearchText(target);

    if (!normalizedQuery) {
        return 1;
    }

    if (!normalizedTarget) {
        return -1;
    }

    const containsIndex = normalizedTarget.indexOf(normalizedQuery);
    if (containsIndex >= 0) {
        return 100 - containsIndex;
    }

    let queryIndex = 0;
    let score = 0;

    for (let i = 0; i < normalizedTarget.length && queryIndex < normalizedQuery.length; i += 1) {
        if (normalizedTarget[i] === normalizedQuery[queryIndex]) {
            score += 2;
            if (queryIndex > 0 && normalizedTarget[i - 1] === normalizedQuery[queryIndex - 1]) {
                score += 1;
            }
            queryIndex += 1;
        }
    }

    return queryIndex === normalizedQuery.length ? score : -1;
}

function fuzzyFilter(items, query, labelForItem, limit = 8) {
    return items
        .map((item) => ({
            item,
            score: fuzzyScore(query, labelForItem(item)),
        }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            return labelForItem(a.item).localeCompare(labelForItem(b.item));
        })
        .slice(0, limit)
        .map((entry) => entry.item);
}

function pickPrimaryEntrance(entrances) {
    if (!Array.isArray(entrances) || entrances.length === 0) {
        return null;
    }

    const mainEntrance = entrances.find(
        (entrance) => typeof entrance.label === "string" && entrance.label.toLowerCase().includes("main")
    );
    if (mainEntrance) {
        return mainEntrance;
    }

    const accessibleEntrance = entrances.find((entrance) => entrance.wheelchairAccessible);
    if (accessibleEntrance) {
        return accessibleEntrance;
    }

    return entrances[0];
}

function pickClosestEntrance(entrances, userLocation) {
    const fallbackEntrance = pickPrimaryEntrance(entrances);
    if (!fallbackEntrance) {
        return null;
    }

    if (!Array.isArray(userLocation) || userLocation.length < 2) {
        return fallbackEntrance;
    }

    const [userLng, userLat] = userLocation;
    if (!isValidCoordinatePair(userLng, userLat)) {
        return fallbackEntrance;
    }

    const userPoint = { lng: userLng, lat: userLat };
    let closestEntrance = null;
    let closestDistanceMeters = Number.POSITIVE_INFINITY;

    entrances.forEach((entrance) => {
        const lng = entrance?.outdoor?.lng;
        const lat = entrance?.outdoor?.lat;
        if (!isValidCoordinatePair(lng, lat)) {
            return;
        }

        const distanceMeters = distanceBetweenMeters(userPoint, { lng, lat });
        if (distanceMeters < closestDistanceMeters) {
            closestDistanceMeters = distanceMeters;
            closestEntrance = entrance;
        }
    });

    return closestEntrance || fallbackEntrance;
}

function isWithinCampusBounds(lng, lat) {
    if (!isValidCoordinatePair(lng, lat)) {
        return false;
    }

    return distanceBetweenMeters(
        { lng, lat },
        { lng: UMASS_MEMORIAL.lng, lat: UMASS_MEMORIAL.lat }
    ) <= DESTINATION_COORD_MAX_DISTANCE_METERS;
}

// AI acknowledgement: This outdoor map flow for geocoded start input, destination handoff, and transport-mode routing was drafted with AI assistance and reviewed by the project author.
export default function OutdoorNavigation({ onEnterBuilding }) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const mapLoadedRef = useRef(false);
    const userMarkerRef = useRef(null);
    const destMarkerRef = useRef(null);
    const startLocationInputRef = useRef(null);
    const locationSearchModalRef = useRef(null);
    const locationSearchModalCloseButtonRef = useRef(null);
    const locationSearchModalReturnFocusRef = useRef(null);

    const [userLocation, setUserLocation] = useState(null);
    const [addressInput, setAddressInput] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showLocationSearchModal, setShowLocationSearchModal] = useState(false);
    const [expandedSuggestions, setExpandedSuggestions] = useState([]);
    const [expandedSuggestionsLoading, setExpandedSuggestionsLoading] = useState(false);
    const [expandedSuggestionsError, setExpandedSuggestionsError] = useState("");
    const [routeInfo, setRouteInfo] = useState(null);
    const [steps, setSteps] = useState([]);
    const [activeStep, setActiveStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [transportMode, setTransportMode] = useState("walking");
    const [geoStatus, setGeoStatus] = useState("idle");
    const [showAdminTools, setShowAdminTools] = useState(false);
    const [adminLngInput, setAdminLngInput] = useState(String(UMASS_MEMORIAL.lng));
    const [adminLatInput, setAdminLatInput] = useState(String(UMASS_MEMORIAL.lat));
    const [isMapReady, setIsMapReady] = useState(false);

    const [campusMapData, setCampusMapData] = useState({
        buildings: [],
        floors: [],
        rooms: [],
        entrances: [],
    });
    const [loadingDestinations, setLoadingDestinations] = useState(true);
    const [selectedBuildingId, setSelectedBuildingId] = useState("");
    const [selectedRoomId, setSelectedRoomId] = useState("");
    const [buildingQuery, setBuildingQuery] = useState("");
    const [roomQuery, setRoomQuery] = useState("");
    const [showBuildingSuggestions, setShowBuildingSuggestions] = useState(false);
    const [showRoomSuggestions, setShowRoomSuggestions] = useState(false);

    const buildingEntrancesMap = useMemo(() => {
        const entranceMap = new Map();

        campusMapData.entrances.forEach((entrance) => {
            if (!isValidCoordinatePair(entrance?.outdoor?.lng, entrance?.outdoor?.lat)) {
                return;
            }

            const current = entranceMap.get(entrance.buildingId) || [];
            current.push(entrance);
            entranceMap.set(entrance.buildingId, current);
        });

        return entranceMap;
    }, [campusMapData.entrances]);

    const availableBuildings = useMemo(
        () => campusMapData.buildings.filter((building) => buildingEntrancesMap.has(building.id)),
        [campusMapData.buildings, buildingEntrancesMap]
    );

    const selectedBuilding = useMemo(
        () => availableBuildings.find((building) => building.id === selectedBuildingId) || null,
        [availableBuildings, selectedBuildingId]
    );

    const roomsForSelectedBuilding = useMemo(
        () => {
            const floorLevelById = new Map(
                campusMapData.floors.map((floor) => [floor.id, floor.level])
            );

            return campusMapData.rooms
                .filter((room) => room.buildingId === selectedBuildingId)
                .sort((a, b) => {
                    const levelA = floorLevelById.get(a.floorId) ?? Number.MAX_SAFE_INTEGER;
                    const levelB = floorLevelById.get(b.floorId) ?? Number.MAX_SAFE_INTEGER;

                    if (levelA !== levelB) {
                        return levelA - levelB;
                    }

                    return a.name.localeCompare(b.name, undefined, { numeric: true });
                });
        },
        [campusMapData.rooms, campusMapData.floors, selectedBuildingId]
    );

    const floorNameById = useMemo(
        () => new Map(campusMapData.floors.map((floor) => [floor.id, floor.name])),
        [campusMapData.floors]
    );

    const selectedRoom = useMemo(
        () => roomsForSelectedBuilding.find((room) => room.id === selectedRoomId) || null,
        [roomsForSelectedBuilding, selectedRoomId]
    );

    const destinationEntrance = useMemo(
        () => pickClosestEntrance(buildingEntrancesMap.get(selectedBuildingId) || [], userLocation),
        [buildingEntrancesMap, selectedBuildingId, userLocation]
    );

    const destinationTarget = useMemo(() => {
        if (destinationEntrance && isWithinCampusBounds(destinationEntrance.outdoor.lng, destinationEntrance.outdoor.lat)) {
            return {
                lng: destinationEntrance.outdoor.lng,
                lat: destinationEntrance.outdoor.lat,
                label: selectedBuilding?.name || UMASS_MEMORIAL.label,
                address: UMASS_MEMORIAL.address,
            };
        }

        return UMASS_MEMORIAL;
    }, [destinationEntrance, selectedBuilding]);

    const buildingSuggestions = useMemo(
        () => fuzzyFilter(
            availableBuildings,
            buildingQuery,
            (building) => `${building.name} ${building.code || ""} ${building.description || ""}`
        ),
        [availableBuildings, buildingQuery]
    );

    const roomSuggestions = useMemo(
        () => fuzzyFilter(
            roomsForSelectedBuilding,
            roomQuery,
            (room) => `${room.name} ${room.id || ""} ${floorNameById.get(room.floorId) || room.floorId || ""}`,
            Math.max(roomsForSelectedBuilding.length, 12)
        ),
        [roomsForSelectedBuilding, roomQuery, floorNameById]
    );

    const distanceToDestinationMeters = useMemo(() => {
        if (!userLocation || !selectedBuildingId) {
            return null;
        }

        return distanceBetweenMeters(
            { lng: userLocation[0], lat: userLocation[1] },
            { lng: destinationTarget.lng, lat: destinationTarget.lat }
        );
    }, [userLocation, selectedBuildingId, destinationTarget]);

    const canEnterBuilding = Boolean(selectedBuildingId)
        && typeof distanceToDestinationMeters === "number"
        && distanceToDestinationMeters <= ARRIVAL_PROMPT_DISTANCE_METERS;
    const hasTypedStartLocation = normalizeSearchText(addressInput).length >= 3;
    const locationSearchModalTitleId = useId();
    const locationSearchModalDescriptionId = useId();

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
            setIsMapReady(true);

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
            setIsMapReady(false);
            map.remove();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadDestinationData() {
            setLoadingDestinations(true);

            try {
                const payload = await fetchIndoorMapData();
                if (cancelled) {
                    return;
                }

                const safeEntrances = Array.isArray(payload.entrances)
                    ? payload.entrances.filter((entrance) => isWithinCampusBounds(entrance?.outdoor?.lng, entrance?.outdoor?.lat))
                    : [];
                const safeBuildings = Array.isArray(payload.buildings) ? payload.buildings : [];
                const safeFloors = Array.isArray(payload.floors) ? payload.floors : [];
                const safeRooms = Array.isArray(payload.rooms) ? payload.rooms : [];

                setCampusMapData({
                    buildings: safeBuildings,
                    floors: safeFloors,
                    rooms: safeRooms,
                    entrances: safeEntrances,
                });

                const defaultBuilding = safeBuildings.find((building) => (
                    safeEntrances.some((entrance) => entrance.buildingId === building.id)
                )) || null;

                if (defaultBuilding) {
                    setSelectedBuildingId(defaultBuilding.id);
                    setBuildingQuery(defaultBuilding.name);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.message || "Failed to load destination building data.");
                }
            } finally {
                if (!cancelled) {
                    setLoadingDestinations(false);
                }
            }
        }

        loadDestinationData();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!isMapReady || !destMarkerRef.current) {
            return;
        }

        const popupSuffix = destinationTarget.address
            ? `<br/>${destinationTarget.address}`
            : "";

        destMarkerRef.current
            .setLngLat([destinationTarget.lng, destinationTarget.lat])
            .setPopup(
                new mapboxgl.Popup({ offset: 25 }).setHTML(
                    `<strong>${destinationTarget.label}</strong>${popupSuffix}`
                )
            );
    }, [destinationTarget, isMapReady]);

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
        const normalizedValue = normalizeSearchText(value);

        try {
            const results = await fetchGeocodeSuggestions(value);
            setSuggestions(results);
            setShowSuggestions(normalizedValue.length >= 3);
        } catch (err) {
            setSuggestions([]);
            setShowSuggestions(normalizedValue.length >= 3);
            setError(err.message || "Failed to load address suggestions.");
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadExpandedSuggestions() {
            const normalizedQuery = typeof addressInput === "string" ? addressInput.trim() : "";
            if (!showLocationSearchModal || normalizedQuery.length < 3) {
                setExpandedSuggestions([]);
                setExpandedSuggestionsError("");
                setExpandedSuggestionsLoading(false);
                return;
            }

            setExpandedSuggestionsLoading(true);
            setExpandedSuggestionsError("");

            try {
                const results = await fetchGeocodeSuggestions(normalizedQuery, {
                    limit: EXPANDED_GEOCODE_LIMIT,
                });

                if (!cancelled) {
                    setExpandedSuggestions(results);
                }
            } catch (err) {
                if (!cancelled) {
                    setExpandedSuggestions([]);
                    setExpandedSuggestionsError(
                        err?.message || "Failed to load expanded location suggestions."
                    );
                }
            } finally {
                if (!cancelled) {
                    setExpandedSuggestionsLoading(false);
                }
            }
        }

        loadExpandedSuggestions();

        return () => {
            cancelled = true;
        };
    }, [showLocationSearchModal, addressInput]);

    const getLocationSearchModalFocusableElements = useCallback(() => {
        if (!locationSearchModalRef.current) {
            return [];
        }

        return Array.from(locationSearchModalRef.current.querySelectorAll(
            [
                "button:not([disabled])",
                "[href]",
                "input:not([disabled])",
                "select:not([disabled])",
                "textarea:not([disabled])",
                "[tabindex]:not([tabindex=\"-1\"])",
            ].join(", ")
        ));
    }, []);

    const closeLocationSearchModal = useCallback(() => {
        setShowLocationSearchModal(false);
    }, []);

    useEffect(() => {
        if (showLocationSearchModal) {
            const focusTarget = locationSearchModalCloseButtonRef.current
                || getLocationSearchModalFocusableElements()[0]
                || locationSearchModalRef.current;
            focusTarget?.focus();
            return;
        }

        if (!locationSearchModalReturnFocusRef.current) {
            return;
        }

        const returnFocusTarget = locationSearchModalReturnFocusRef.current.isConnected
            ? locationSearchModalReturnFocusRef.current
            : startLocationInputRef.current;

        returnFocusTarget?.focus();
        locationSearchModalReturnFocusRef.current = null;
    }, [showLocationSearchModal, getLocationSearchModalFocusableElements]);

    const handleSelectSuggestion = useCallback((feature) => {
        const [lng, lat] = feature.center;
        const coords = [lng, lat];
        setCurrentLocation(coords, feature.place_name, "idle");
    }, [setCurrentLocation]);

    const resolveTypedStartLocation = useCallback(async (rawQuery) => {
        const normalizedQuery = typeof rawQuery === "string" ? rawQuery.trim() : "";
        if (!normalizedQuery) {
            setError("Please set your starting location first.");
            return null;
        }

        try {
            const place = await fetchGeocodePlace(normalizedQuery);
            const lng = place?.location?.lng;
            const lat = place?.location?.lat;
            if (!isValidCoordinatePair(lng, lat)) {
                setError("Could not determine coordinates for that location. Try a more specific Massachusetts place name or address.");
                return null;
            }

            const coords = [lng, lat];
            setCurrentLocation(coords, place.name || normalizedQuery, "found");
            mapRef.current?.flyTo({ center: coords, zoom: 15 });
            return coords;
        } catch (err) {
            setError(err?.message || "Could not find that location in Massachusetts. Try a more specific place name.");
            return null;
        }
    }, [setCurrentLocation]);

    const handleStartLocationKeyDown = useCallback((event) => {
        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();
        if (suggestions.length > 0) {
            handleSelectSuggestion(suggestions[0]);
            return;
        }

        void resolveTypedStartLocation(addressInput);
    }, [suggestions, handleSelectSuggestion, resolveTypedStartLocation, addressInput]);

    const handleOpenLocationSearchModal = useCallback((event) => {
        if (event) {
            event.preventDefault();
            if (event.currentTarget instanceof HTMLElement) {
                locationSearchModalReturnFocusRef.current = event.currentTarget;
            }
        } else if (document.activeElement instanceof HTMLElement) {
            locationSearchModalReturnFocusRef.current = document.activeElement;
        }

        setShowSuggestions(false);
        setExpandedSuggestions([]);
        setExpandedSuggestionsError("");
        setShowLocationSearchModal(true);
    }, []);

    const handleSelectExpandedSuggestion = useCallback((feature) => {
        handleSelectSuggestion(feature);
        closeLocationSearchModal();
    }, [closeLocationSearchModal, handleSelectSuggestion]);

    const handleLocationSearchModalKeyDown = useCallback((event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeLocationSearchModal();
            return;
        }

        if (event.key !== "Tab") {
            return;
        }

        const focusableElements = getLocationSearchModalFocusableElements();
        if (focusableElements.length === 0) {
            event.preventDefault();
            locationSearchModalRef.current?.focus();
            return;
        }

        const firstFocusableElement = focusableElements[0];
        const lastFocusableElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (!locationSearchModalRef.current?.contains(activeElement)) {
            event.preventDefault();
            (event.shiftKey ? lastFocusableElement : firstFocusableElement).focus();
            return;
        }

        if (event.shiftKey && activeElement === firstFocusableElement) {
            event.preventDefault();
            lastFocusableElement.focus();
            return;
        }

        if (!event.shiftKey && activeElement === lastFocusableElement) {
            event.preventDefault();
            firstFocusableElement.focus();
        }
    }, [closeLocationSearchModal, getLocationSearchModalFocusableElements]);

    const handleBuildingQueryChange = useCallback((value) => {
        setBuildingQuery(value);
        setShowBuildingSuggestions(true);

        if (selectedBuilding && normalizeSearchText(value) !== normalizeSearchText(selectedBuilding.name)) {
            setSelectedBuildingId("");
            setSelectedRoomId("");
            setRoomQuery("");
        }
    }, [selectedBuilding]);

    const handleSelectBuilding = useCallback((building) => {
        setSelectedBuildingId(building.id);
        setBuildingQuery(building.name);
        setSelectedRoomId("");
        setRoomQuery("");
        setShowBuildingSuggestions(false);
        setShowRoomSuggestions(false);
        clearRoute();
        setError(null);
    }, [clearRoute]);

    const handleRoomQueryChange = useCallback((value) => {
        setRoomQuery(value);
        setShowRoomSuggestions(true);

        if (selectedRoom && normalizeSearchText(value) !== normalizeSearchText(selectedRoom.name)) {
            setSelectedRoomId("");
        }
    }, [selectedRoom]);

    const handleSelectRoom = useCallback((room) => {
        setSelectedRoomId(room.id);
        setRoomQuery(room.name);
        setShowRoomSuggestions(false);
    }, []);

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
        if (!selectedBuildingId) {
            setError("Please choose a destination building.");
            return;
        }

        if (!destinationEntrance) {
            setError("Selected building does not have a mapped outdoor entrance yet.");
            return;
        }

        setLoading(true);
        setError(null);
        clearRoute();

        try {
            let startCoords = userLocation;

            if (!startCoords) {
                startCoords = await resolveTypedStartLocation(addressInput);
                if (!startCoords) {
                    return;
                }
            }

            const result = await fetchOutdoorRoute({
                start: { lng: startCoords[0], lat: startCoords[1] },
                destination: { lng: destinationTarget.lng, lat: destinationTarget.lat },
                mode: transportMode,
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
                profile: route.profile || transportMode,
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
    }, [
        userLocation,
        addressInput,
        selectedBuildingId,
        destinationEntrance,
        destinationTarget,
        transportMode,
        drawRoute,
        clearRoute,
        resolveTypedStartLocation,
    ]);

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
                                    ref={startLocationInputRef}
                                    className="locationInput"
                                    type="text"
                                    placeholder="Enter your address…"
                                    value={addressInput}
                                    onChange={(e) => handleAddressChange(e.target.value)}
                                    onFocus={() => setShowSuggestions(normalizeSearchText(addressInput).length >= 3)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                    onKeyDown={handleStartLocationKeyDown}
                                />
                                {showSuggestions && (
                                    <ul className="suggestionsList">
                                        {suggestions.length > 0 ? (
                                            suggestions.map((f) => (
                                                <li
                                                    key={f.id}
                                                    className="suggestionItem"
                                                    onMouseDown={() => handleSelectSuggestion(f)}
                                                >
                                                    <span className="suggestionName">
                                                        {f.text}
                                                    </span>
                                                    {getSuggestionAddressLine(f) && (
                                                        <span className="suggestionAddress">
                                                            {getSuggestionAddressLine(f)}
                                                        </span>
                                                    )}
                                                    {getSuggestionContextLine(f) && (
                                                        <span className="suggestionPlace">
                                                            {getSuggestionContextLine(f)}
                                                        </span>
                                                    )}
                                                </li>
                                            ))
                                        ) : (
                                            <li className="suggestionEmpty">
                                                No Massachusetts matches yet. Press Enter to try the best place-name match.
                                            </li>
                                        )}
                                        {hasTypedStartLocation && (
                                            <li className="suggestionMoreRow">
                                                <button
                                                    type="button"
                                                    className="suggestionMoreBtn"
                                                    onMouseDown={(event) => event.preventDefault()}
                                                    onClick={handleOpenLocationSearchModal}
                                                >
                                                    View More Results
                                                </button>
                                            </li>
                                        )}
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

                    <div className="locationSection">
                        <div className="locationLabel">Destination building</div>
                        <div className="locationInputWrap">
                            <input
                                className="locationInput"
                                type="text"
                                placeholder={loadingDestinations ? "Loading buildings..." : "Search buildings..."}
                                value={buildingQuery}
                                disabled={loadingDestinations}
                                onChange={(e) => handleBuildingQueryChange(e.target.value)}
                                onFocus={() => setShowBuildingSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowBuildingSuggestions(false), 150)}
                            />

                            {showBuildingSuggestions && !loadingDestinations && (
                                <ul className="suggestionsList">
                                    {buildingSuggestions.length > 0 ? (
                                        buildingSuggestions.map((building) => (
                                            <li
                                                key={building.id}
                                                className="suggestionItem"
                                                onMouseDown={() => handleSelectBuilding(building)}
                                            >
                                                <span className="suggestionName">{building.name}</span>
                                                <span className="suggestionPlace">
                                                    {building.code || "Building"}
                                                    {building.description ? ` · ${building.description}` : ""}
                                                </span>
                                            </li>
                                        ))
                                    ) : (
                                        <li className="suggestionEmpty">No building matches your search.</li>
                                    )}
                                </ul>
                            )}
                        </div>
                    </div>

                    {selectedBuildingId && (
                        <div className="locationSection">
                            <div className="locationLabel">Destination room (optional)</div>
                            <div className="locationInputWrap">
                                <input
                                    className="locationInput"
                                    type="text"
                                    placeholder="Search rooms..."
                                    value={roomQuery}
                                    onChange={(e) => handleRoomQueryChange(e.target.value)}
                                    onFocus={() => setShowRoomSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowRoomSuggestions(false), 150)}
                                />

                                {showRoomSuggestions && (
                                    <ul className="suggestionsList">
                                        {roomSuggestions.length > 0 ? (
                                            roomSuggestions.map((room) => (
                                                <li
                                                    key={room.id}
                                                    className="suggestionItem"
                                                    onMouseDown={() => handleSelectRoom(room)}
                                                >
                                                    <span className="suggestionName">{room.name}</span>
                                                    <span className="suggestionPlace">
                                                        {floorNameById.get(room.floorId) || room.floorId}
                                                        {room.id ? ` · ${room.id}` : ""}
                                                    </span>
                                                </li>
                                            ))
                                        ) : (
                                            <li className="suggestionEmpty">No room matches your search.</li>
                                        )}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="locationSection">
                        <div className="locationLabel">Transportation mode</div>
                        <select
                            className="locationInput"
                            value={transportMode}
                            onChange={(event) => setTransportMode(event.target.value)}
                        >
                            {OUTDOOR_TRANSPORT_MODES.map((modeOption) => (
                                <option key={modeOption.value} value={modeOption.value}>
                                    {modeOption.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="destRow">
                        <div className="destDot" />
                        <div className="destInfo">
                            <div className="destName">{selectedBuilding?.name || "Choose a destination building"}</div>
                            <div className="destAddress">
                                {destinationEntrance
                                    ? `${destinationEntrance.label} entrance`
                                    : "No mapped entrance for selected building."}
                                {selectedRoom ? ` · Room: ${selectedRoom.name}` : ""}
                            </div>
                        </div>
                    </div>

                    {distanceToDestinationMeters !== null && (
                        <div className={`arrivalStatus${canEnterBuilding ? " arrivalStatusReady" : ""}`}>
                            {canEnterBuilding
                                ? `You are at ${selectedBuilding?.name || destinationTarget.label}. Switch to indoor navigation when you are ready.`
                                : `${formatDistance(distanceToDestinationMeters)} from ${selectedBuilding?.name || destinationTarget.label}.`}
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
                        disabled={loading || (!userLocation && !hasTypedStartLocation) || !selectedBuildingId || loadingDestinations}
                    >
                        {loading ? "Getting directions…" : "Get Directions"}
                    </button>

                    {error && <div className="errorBanner">{error}</div>}
                </div>

                {routeInfo && (
                    <div className="routeSummary">
                        <div className="routeStat">
                            <strong className="routeStatNum">
                                {formatDuration(routeInfo.durationS)}
                            </strong>
                            {transportVerb(routeInfo.profile)}
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
                        <button
                            className="enterBuildingBtn"
                            onClick={() => onEnterBuilding({
                                buildingId: selectedBuildingId,
                                roomId: selectedRoomId || null,
                                entranceId: destinationEntrance?.id || null,
                            })}
                        >
                            Enter Building — Switch to Indoor Map
                        </button>
                    </div>
                )}
            </div>

            <div className="outdoorNavigationCanvas" ref={mapContainerRef} />

            {showLocationSearchModal && (
                <div
                    className="locationModalBackdrop"
                    onMouseDown={closeLocationSearchModal}
                >
                    <div
                        ref={locationSearchModalRef}
                        className="locationModal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={locationSearchModalTitleId}
                        aria-describedby={locationSearchModalDescriptionId}
                        tabIndex={-1}
                        onKeyDown={handleLocationSearchModalKeyDown}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="locationModalHeader">
                            <h2 id={locationSearchModalTitleId} className="locationModalTitle">
                                More Location Results
                            </h2>
                            <button
                                ref={locationSearchModalCloseButtonRef}
                                type="button"
                                className="locationModalCloseBtn"
                                onClick={closeLocationSearchModal}
                            >
                                Close
                            </button>
                        </div>
                        <div id={locationSearchModalDescriptionId} className="locationModalSubtitle">
                            Showing up to {EXPANDED_GEOCODE_LIMIT} Massachusetts matches for "{addressInput.trim()}"
                        </div>

                        <div className="locationModalBody" aria-busy={expandedSuggestionsLoading}>
                            {expandedSuggestionsLoading && (
                                <div className="locationModalState" role="status">
                                    Loading locations...
                                </div>
                            )}

                            {!expandedSuggestionsLoading && expandedSuggestionsError && (
                                <div className="locationModalState locationModalStateError" role="alert">
                                    {expandedSuggestionsError}
                                </div>
                            )}

                            {!expandedSuggestionsLoading && !expandedSuggestionsError && expandedSuggestions.length === 0 && (
                                <div className="locationModalState" role="status">
                                    No additional matches found. Try adding city or landmark details.
                                </div>
                            )}

                            {!expandedSuggestionsLoading && !expandedSuggestionsError && expandedSuggestions.length > 0 && (
                                <ul className="locationModalList">
                                    {expandedSuggestions.map((feature) => (
                                        <li key={feature.id}>
                                            <button
                                                type="button"
                                                className="locationModalItem"
                                                onClick={() => handleSelectExpandedSuggestion(feature)}
                                            >
                                                <span className="suggestionName">{feature.text}</span>
                                                {getSuggestionAddressLine(feature) && (
                                                    <span className="suggestionAddress">
                                                        {getSuggestionAddressLine(feature)}
                                                    </span>
                                                )}
                                                {getSuggestionContextLine(feature) && (
                                                    <span className="suggestionPlace">
                                                        {getSuggestionContextLine(feature)}
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
