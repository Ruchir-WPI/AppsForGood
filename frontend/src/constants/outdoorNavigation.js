export const UMASS_MEMORIAL = {
    lng: -71.76205491130239,
    lat: 42.27664395437456,
    label: "UMass Memorial Main Hospital",
    address: "55 Lake Ave N, Worcester, MA 01655",
};

export const MAIN_GARAGE = {
    lng: -71.76303308562642,
    lat: 42.27472812162177,
    label: "Main Garage",
};

export const ARRIVAL_PROMPT_DISTANCE_METERS = 120;
export const DESTINATION_COORD_MAX_DISTANCE_METERS = 800;

export const OUTDOOR_TRANSPORT_MODES = [
    { value: "walking", label: "Walking" },
    { value: "cycling", label: "Cycling" },
    { value: "driving", label: "Driving" },
];

export const TEST_LOCATION_PRESETS = [
    {
        id: "arrival",
        label: "At Main Entrance",
        lng: UMASS_MEMORIAL.lng,
        lat: UMASS_MEMORIAL.lat,
    },
    {
        id: "garage",
        label: "Main Garage",
        lng: MAIN_GARAGE.lng,
        lat: MAIN_GARAGE.lat,
    },
    {
        id: "downtown",
        label: "Downtown Worcester",
        lng: -71.8017,
        lat: 42.2626,
    },
];
