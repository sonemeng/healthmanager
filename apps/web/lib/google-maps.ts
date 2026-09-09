import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let initialized = false;

function ensureInitialized() {
  if (!initialized) {
    setOptions({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      libraries: ["places", "marker"],
    });
    initialized = true;
  }
}

export async function loadMapsLibrary() {
  ensureInitialized();
  return importLibrary("maps");
}

export async function loadPlacesLibrary() {
  ensureInitialized();
  return importLibrary("places");
}

export async function loadGeocodingLibrary() {
  ensureInitialized();
  return importLibrary("geocoding");
}

export async function loadMarkerLibrary() {
  ensureInitialized();
  return importLibrary("marker");
}
