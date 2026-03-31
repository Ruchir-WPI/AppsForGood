export const UMASS_MEMORIAL = {
    lng: -71.7654,
    lat: 42.2776,
    label: "UMass Memorial Medical Center",
    address: "55 Lake Ave N, Worcester, MA 01655",
};

export const ARRIVAL_PROMPT_DISTANCE_METERS = 120;

export const TEST_LOCATION_PRESETS = [
    {
        id: "arrival",
        label: "At Main Entrance",
        lng: UMASS_MEMORIAL.lng,
        lat: UMASS_MEMORIAL.lat,
    },
    {
        id: "nearby",
        label: "Nearby Parking",
        lng: -71.7662,
        lat: 42.2781,
    },
    {
        id: "downtown",
        label: "Downtown Worcester",
        lng: -71.8017,
        lat: 42.2626,
    },
];