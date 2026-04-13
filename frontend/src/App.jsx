import { useState } from "react";
import OutdoorNavigation from "./OutdoorNavigation.jsx";
import IndoorNavigation from "./IndoorNavigation.jsx";
import "./App.css";

// AI acknowledgement: This top-level mode switch that carries outdoor destination context into indoor navigation was drafted with AI assistance and reviewed by the project author.
export default function App() {
    const [mode, setMode] = useState("outdoor");
    const [indoorSelection, setIndoorSelection] = useState(null);

    return (
        <div className="appShell">
            {mode === "outdoor" ? (
                <OutdoorNavigation
                    onEnterBuilding={(selection) => {
                        setIndoorSelection(selection || null);
                        setMode("indoor");
                    }}
                />
            ) : (
                <div className="appModeFrame">
                    <IndoorNavigation initialSelection={indoorSelection} />

                    <button
                        className="appBackButton"
                        onClick={() => setMode("outdoor")}
                        type="button"
                    >
                        Back to Directions
                    </button>
                </div>
            )}
        </div>
    );
}
