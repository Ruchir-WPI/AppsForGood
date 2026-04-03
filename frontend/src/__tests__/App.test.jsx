import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App.jsx";

vi.mock("../OutdoorMap.jsx", () => ({
    default: ({ onEnterBuilding }) => (
        <button type="button" onClick={onEnterBuilding}>
            Open indoor navigation
        </button>
    ),
}));

vi.mock("../MapNavigation.jsx", () => ({
    default: () => <div>Indoor map content</div>,
}));

describe("App", () => {
    it("switches between outdoor and indoor navigation modes", () => {
        render(<App />);

        fireEvent.click(screen.getByRole("button", { name: /open indoor navigation/i }));

        expect(screen.getByText(/indoor map content/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /back to directions/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /back to directions/i }));

        expect(screen.getByRole("button", { name: /open indoor navigation/i })).toBeInTheDocument();
        expect(screen.queryByText(/indoor map content/i)).not.toBeInTheDocument();
    });
});
