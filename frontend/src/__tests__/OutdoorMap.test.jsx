import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OutdoorMap from "../OutdoorMap.jsx";
import { UMASS_MEMORIAL } from "../constants/outdoorMap";
import {
    fetchGeocodePlace,
    fetchGeocodeSuggestions,
    fetchIndoorMapData,
    fetchOutdoorRoute,
} from "../utils/navigationApi";

const mapboxMocks = vi.hoisted(() => {
    const mapInstance = {
        addControl: vi.fn(),
        on: vi.fn((eventName, handler) => {
            if (eventName === "load") {
                handler();
            }
        }),
        remove: vi.fn(),
        getLayer: vi.fn(() => undefined),
        removeLayer: vi.fn(),
        getSource: vi.fn(() => undefined),
        removeSource: vi.fn(),
        addSource: vi.fn(),
        addLayer: vi.fn(),
        fitBounds: vi.fn(),
        flyTo: vi.fn(),
    };

    return {
        Map: vi.fn(function Map() {
            return mapInstance;
        }),
        NavigationControl: vi.fn(function NavigationControl() {
            return {};
        }),
        Marker: vi.fn(function Marker() {
            return {
            setLngLat: vi.fn().mockReturnThis(),
            setPopup: vi.fn().mockReturnThis(),
            addTo: vi.fn().mockReturnThis(),
            };
        }),
        Popup: vi.fn(function Popup() {
            return {
                setHTML: vi.fn().mockReturnThis(),
            };
        }),
        LngLatBounds: vi.fn(function LngLatBounds() {
            return {
                extend: vi.fn().mockReturnThis(),
            };
        }),
        mapInstance,
    };
});

vi.mock("mapbox-gl", () => ({
    default: {
        accessToken: "",
        Map: mapboxMocks.Map,
        NavigationControl: mapboxMocks.NavigationControl,
        Marker: mapboxMocks.Marker,
        Popup: mapboxMocks.Popup,
        LngLatBounds: mapboxMocks.LngLatBounds,
    },
}));

vi.mock("../utils/navigationApi", () => ({
    fetchGeocodeSuggestions: vi.fn(),
    fetchGeocodePlace: vi.fn(),
    fetchIndoorMapData: vi.fn(),
    fetchOutdoorRoute: vi.fn(),
}));

describe("OutdoorMap", () => {
    const indoorMapFixture = {
        buildings: [
            { id: "hospital", name: "Hospital" },
        ],
        floors: [],
        rooms: [],
        entrances: [
            {
                id: "main-entrance",
                buildingId: "hospital",
                label: "Main",
                outdoor: {
                    lng: UMASS_MEMORIAL.lng,
                    lat: UMASS_MEMORIAL.lat,
                },
            },
        ],
        nodes: [],
        edges: [],
        outdoorPoints: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        fetchIndoorMapData.mockResolvedValue(indoorMapFixture);
        fetchGeocodeSuggestions.mockResolvedValue([]);
        fetchGeocodePlace.mockResolvedValue({
            name: "Downtown Worcester",
            location: {
                lng: -71.8017,
                lat: 42.2626,
            },
        });

        Object.defineProperty(window.navigator, "geolocation", {
            configurable: true,
            value: {
                getCurrentPosition: vi.fn(),
            },
        });
    });

    it("shows the indoor handoff CTA when the user is at the hospital", async () => {
        const onEnterBuilding = vi.fn();

        render(<OutdoorMap onEnterBuilding={onEnterBuilding} />);

        await waitFor(() => {
            expect(screen.getByDisplayValue("Hospital")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /show admin location tools/i }));
        fireEvent.click(screen.getByRole("button", { name: /at main entrance/i }));

        expect(
            await screen.findByText(/you are at hospital\. switch to indoor navigation when you are ready\./i),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /enter building/i }));

        expect(onEnterBuilding).toHaveBeenCalledTimes(1);
    });

    it("requests and renders walking directions for a mocked outdoor start", async () => {
        fetchOutdoorRoute.mockResolvedValue({
            route: {
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [-71.8017, 42.2626],
                        [UMASS_MEMORIAL.lng, UMASS_MEMORIAL.lat],
                    ],
                },
                distanceMeters: 160,
                durationSeconds: 180,
            },
            steps: [
                {
                    instruction: "Head toward the main entrance",
                    distanceMeters: 160,
                    maneuverType: "depart",
                    location: {
                        lng: -71.79,
                        lat: 42.27,
                    },
                },
            ],
        });

        render(<OutdoorMap onEnterBuilding={() => {}} />);

        await waitFor(() => {
            expect(screen.getByDisplayValue("Hospital")).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole("button", { name: /show admin location tools/i }));
        fireEvent.click(screen.getByRole("button", { name: /downtown worcester/i }));

        const getDirectionsButton = screen.getByRole("button", { name: /get walking directions/i });
        await waitFor(() => {
            expect(getDirectionsButton).toBeEnabled();
        });

        fireEvent.click(getDirectionsButton);

        await waitFor(() => {
            expect(fetchOutdoorRoute).toHaveBeenCalledWith({
                start: { lng: -71.8017, lat: 42.2626 },
                destination: { lng: UMASS_MEMORIAL.lng, lat: UMASS_MEMORIAL.lat },
            });
        });

        expect(await screen.findByText(/head toward the main entrance/i)).toBeInTheDocument();
        expect(screen.getByText(/3 min/i)).toBeInTheDocument();
        expect(screen.getAllByText(/525 ft/i)).toHaveLength(2);
    });

    it("opens the expanded location results as an accessible dialog and keeps focus contained", async () => {
        fetchGeocodeSuggestions
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    id: "worcester-common",
                    text: "Worcester Common",
                    place_name: "Worcester Common, Worcester, Massachusetts",
                    center: [-71.8023, 42.2621],
                },
                {
                    id: "worcester-library",
                    text: "Worcester Public Library",
                    place_name: "Worcester Public Library, Worcester, Massachusetts",
                    center: [-71.8042, 42.2682],
                },
            ]);

        render(<OutdoorMap onEnterBuilding={() => {}} />);

        const startLocationInput = screen.getByPlaceholderText(/enter your address/i);

        fireEvent.focus(startLocationInput);
        fireEvent.change(startLocationInput, { target: { value: "worc" } });

        const viewMoreResultsButton = await screen.findByRole("button", { name: /view more results/i });
        viewMoreResultsButton.focus();

        fireEvent.click(viewMoreResultsButton);

        const dialog = await screen.findByRole("dialog", { name: /more location results/i });
        const closeButton = screen.getByRole("button", { name: /^close$/i });
        const lastResultButton = await screen.findByRole("button", { name: /worcester public library/i });

        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAccessibleDescription(
            'Showing up to 10 Massachusetts matches for "worc"'
        );
        expect(closeButton).toHaveFocus();

        fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
        expect(lastResultButton).toHaveFocus();

        fireEvent.keyDown(lastResultButton, { key: "Tab" });
        expect(closeButton).toHaveFocus();

        fireEvent.keyDown(closeButton, { key: "Escape" });

        await waitFor(() => {
            expect(screen.queryByRole("dialog", { name: /more location results/i })).not.toBeInTheDocument();
        });

        expect(startLocationInput).toHaveFocus();
    });
});
