"use client";

import { useState, useEffect, useCallback } from "react";
import { loadGeocodingLibrary } from "@/lib/google-maps";

interface UserLocation {
  lat: number;
  lng: number;
  city: string;
  state: string;
}

interface UseUserLocationReturn {
  location: UserLocation | null;
  isLoading: boolean;
  hasPermission: boolean | null;
  requestLocation: () => void;
}

const CACHE_KEY = "ov_user_location";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedLocation(): UserLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return {
      lat: cached.lat,
      lng: cached.lng,
      city: cached.city,
      state: cached.state,
    };
  } catch {
    return null;
  }
}

function cacheLocation(loc: UserLocation) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ...loc, ts: Date.now() }));
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ city: string; state: string }> {
  const { Geocoder } = await loadGeocodingLibrary();
  const geocoder = new Geocoder();
  const result = await geocoder.geocode({ location: { lat, lng } });

  if (result.results.length === 0) return { city: "Unknown", state: "" };

  const components = result.results[0].address_components;
  let city = "";
  let state = "";

  for (const comp of components) {
    if (comp.types.includes("locality")) city = comp.long_name;
    if (comp.types.includes("administrative_area_level_1"))
      state = comp.short_name;
  }

  return { city: city || "Unknown", state };
}

export function useUserLocation(): UseUserLocationReturn {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const fetchLocation = useCallback(async () => {
    setIsLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 600000,
        });
      });

      const { latitude: lat, longitude: lng } = pos.coords;
      const { city, state } = await reverseGeocode(lat, lng);
      const loc = { lat, lng, city, state };

      cacheLocation(loc);
      setLocation(loc);
      setHasPermission(true);
    } catch {
      setHasPermission(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedLocation();
    if (cached) {
      setLocation(cached);
      setHasPermission(true);
      return;
    }

    if (!navigator.permissions) return;
    navigator.permissions.query({ name: "geolocation" }).then((status) => {
      if (status.state === "granted") {
        fetchLocation();
      } else if (status.state === "denied") {
        setHasPermission(false);
      }
    });
  }, [fetchLocation]);

  const requestLocation = useCallback(() => {
    fetchLocation();
  }, [fetchLocation]);

  return { location, isLoading, hasPermission, requestLocation };
}
