import { useState } from "react";
import OutdoorMap from "./OutdoorMap.jsx";
import MapNavigation from "./MapNavigation.jsx";

// AI acknowledgement: This top-level mode switch that carries outdoor destination context into indoor navigation was drafted with AI assistance and reviewed by the project author.
export default function App() {
    const [mode, setMode] = useState("outdoor");
    const [indoorSelection, setIndoorSelection] = useState(null);

    return mode === "outdoor" ? (
        <OutdoorMap
            onEnterBuilding={(selection) => {
                setIndoorSelection(selection || null);
                setMode("indoor");
            }}
        />
    ) : (
        <div style={{ position: "relative", height: "100vh" }}>
            <MapNavigation initialSelection={indoorSelection} />

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