import { useState } from "react";
import OutdoorMap from "./OutdoorMap.jsx";
import MapNavigation from "./MapNavigation.jsx";

/**
 * Two-mode app:
 *   "outdoor" — Mapbox walking directions to UMass Memorial
 *   "indoor"  — SVG campus map for navigating within the building
 *
 * Swap the mode by calling setMode() from either child component.
 */
export default function App() {
    const [mode, setMode] = useState("outdoor");

    return mode === "outdoor" ? (
        <OutdoorMap onEnterBuilding={() => setMode("indoor")} />
    ) : (
        <div style={{ position: "relative", height: "100vh" }}>
            <MapNavigation />

            {/* Back to outdoor map */}
            <button
                onClick={() => setMode("outdoor")}
                style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    padding: "8px 14px",
                    background: "#fff",
                    border: "1px solid #e0e0e0",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    zIndex: 20,
                }}
            >
                ← Back to Directions
            </button>
        </div>
    );
}