import { useState } from "react";
import OutdoorMap from "./OutdoorMap.jsx";
import MapNavigation from "./MapNavigation.jsx";
import "./App.css";

export default function App() {
    const [mode, setMode] = useState("outdoor");
    const [indoorSelection, setIndoorSelection] = useState(null);

    return (
        <div className="appShell">
            {mode === "outdoor" ? (
                <OutdoorMap
                    onEnterBuilding={(selection) => {
                        setIndoorSelection(selection || null);
                        setMode("indoor");
                    }}
                />
            ) : (
                <div className="appModeFrame">
                    <MapNavigation initialSelection={indoorSelection} />

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
