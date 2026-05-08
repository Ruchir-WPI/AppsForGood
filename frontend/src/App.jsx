import { useState } from "react";
import OutdoorNavigation from "./OutdoorNavigation.jsx";
import IndoorNavigation from "./IndoorNavigation.jsx";
import "./App.css";

// Root app shell that switches between outdoor arrival planning and indoor routing,
// carrying selected building/room/entrance context across that handoff.
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
