import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IndoorNavigation from "../IndoorNavigation.jsx";
import { INDOOR_ROUTING_ALGORITHM } from "../constants/indoorNavigation";
import { fetchIndoorGraphRoute, fetchIndoorMapData } from "../utils/navigationApi";

const indoorMapFixture = {
    buildings: [
        { id: "b1", name: "Main Hospital" },
    ],
    floors: [
        { id: "f1", buildingId: "b1", level: 1, name: "Floor 1" },
        { id: "f2", buildingId: "b1", level: 2, name: "Floor 2" },
    ],
    rooms: [
        { id: "r2", buildingId: "b1", floorId: "f2", name: "Radiology Check-In" },
        { id: "r1", buildingId: "b1", floorId: "f1", name: "Lab" },
    ],
    nodes: [
        { id: "n1", buildingId: "b1", floorId: "f1", x: 0, y: 0, type: "exit", label: "North Entrance" },
        { id: "n2", buildingId: "b1", floorId: "f1", x: 3, y: 0, type: "hallway", label: "Hallway A" },
        { id: "n3", buildingId: "b1", floorId: "f2", x: 3, y: 3, type: "room_entrance", label: "Radiology Check-In" },
    ],
    edges: [
        { id: "e1", fromNodeId: "n1", toNodeId: "n2", accessibility: {} },
        { id: "e2", fromNodeId: "n2", toNodeId: "n3", accessibility: { stairsOnly: true } },
    ],
    entrances: [
        { id: "ent1", buildingId: "b1", indoorNodeId: "n1", label: "North Entrance" },
    ],
    outdoorPoints: [
        { id: "out1", label: "Main Drop-Off", type: "dropoff" },
    ],
};

vi.mock("../utils/navigationApi", () => ({
    fetchIndoorMapData: vi.fn(),
    fetchIndoorGraphRoute: vi.fn(),
}));

describe("IndoorNavigation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchIndoorMapData.mockResolvedValue(indoorMapFixture);
    });

    it("loads the indoor map and generates a route from the default endpoints", async () => {
        fetchIndoorGraphRoute.mockResolvedValue({
            selectedStartNodeId: "n1",
            selectedDestinationNodeId: "n3",
            nodePath: ["n1", "n2", "n3"],
            totalDistance: 18,
            steps: [
                {
                    edgeId: "e1",
                    instruction: "Proceed down the hallway",
                    distance: 10,
                    toFloorId: "f1",
                },
                {
                    edgeId: "e2",
                    instruction: "Take the stairs to Floor 2",
                    distance: 8,
                    toFloorId: "f2",
                },
            ],
            meta: {
                algorithm: "Dijkstra",
                visitedNodeCount: 3,
            },
        });

        render(<IndoorNavigation />);

        const routeButton = screen.getByRole("button", { name: /generate indoor route/i });

        await waitFor(() => expect(routeButton).toBeEnabled());

        const fromSelect = screen.getByRole("combobox", { name: /start point/i });
        const toSelect = screen.getByRole("combobox", { name: /destination/i });

        await waitFor(() => {
            expect(fromSelect).toHaveValue("entrance:ent1");
            expect(toSelect).toHaveValue("room:r2");
        });

        fireEvent.click(routeButton);

        await waitFor(() => {
            expect(fetchIndoorGraphRoute).toHaveBeenCalledWith({
                start: { nodeId: "n1" },
                destination: { roomId: "r2" },
                buildingId: "b1",
                options: {
                    algorithm: INDOOR_ROUTING_ALGORITHM,
                },
            });
        });

        expect(await screen.findByText(/route floors: floor 1 -> floor 2/i)).toBeInTheDocument();
        expect(screen.getByText(/proceed down the hallway/i)).toBeInTheDocument();
        expect(screen.getByText(/take the stairs to floor 2/i)).toBeInTheDocument();
        expect(screen.getByText(/indoor route generated/i)).toBeInTheDocument();
    });

    it("uses the developer-configured algorithm for the indoor route request", async () => {
        fetchIndoorGraphRoute.mockResolvedValue({
            selectedStartNodeId: "n1",
            selectedDestinationNodeId: "n3",
            nodePath: ["n1", "n2", "n3"],
            totalDistance: 18,
            steps: [],
            meta: {
                algorithm: "Dijkstra",
                visitedNodeCount: 3,
            },
        });

        render(<IndoorNavigation />);

        const routeButton = screen.getByRole("button", { name: /generate indoor route/i });

        await waitFor(() => expect(routeButton).toBeEnabled());

        const fromSelect = screen.getByRole("combobox", { name: /start point/i });
        const toSelect = screen.getByRole("combobox", { name: /destination/i });

        await waitFor(() => {
            expect(fromSelect).toHaveValue("entrance:ent1");
            expect(toSelect).toHaveValue("room:r2");
        });

        fireEvent.click(routeButton);

        await waitFor(() => {
            expect(fetchIndoorGraphRoute).toHaveBeenCalledWith({
                start: { nodeId: "n1" },
                destination: { roomId: "r2" },
                buildingId: "b1",
                options: {
                    algorithm: INDOOR_ROUTING_ALGORITHM,
                },
            });
        });

        expect(screen.queryByLabelText(/algorithm/i)).not.toBeInTheDocument();
    });

    it("shows an error banner when route generation fails", async () => {
        fetchIndoorGraphRoute.mockRejectedValue(new Error("Route service unavailable"));

        render(<IndoorNavigation />);

        const routeButton = screen.getByRole("button", { name: /generate indoor route/i });

        await waitFor(() => expect(routeButton).toBeEnabled());

        const fromSelect = screen.getByRole("combobox", { name: /start point/i });
        const toSelect = screen.getByRole("combobox", { name: /destination/i });

        await waitFor(() => {
            expect(fromSelect).toHaveValue("entrance:ent1");
            expect(toSelect).toHaveValue("room:r2");
        });

        fireEvent.click(routeButton);

        expect(await screen.findByText(/route service unavailable/i)).toBeInTheDocument();
        expect(screen.getByText(/could not compute route/i)).toBeInTheDocument();
    });
});
