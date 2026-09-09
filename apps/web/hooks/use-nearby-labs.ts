"use client";

import { useState, useEffect, useRef } from "react";
import { loadMapsLibrary, loadPlacesLibrary } from "@/lib/google-maps";

export interface NearbyPlace {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  lat: number;
  lng: number;
  openNow: boolean | null;
}

interface UseNearbyLabsReturn {
  places: NearbyPlace[];
  isLoading: boolean;
  error: string | null;
}

export function useNearbyLabs(
  placeSearchQuery: string | null,
  userLocation: { lat: number; lng: number } | null,
  enabled: boolean,
): UseNearbyLabsReturn {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !placeSearchQuery || !userLocation) return;

    let cancelled = false;

    async function search() {
      setIsLoading(true);
      setError(null);

      try {
        const { Map } = await loadMapsLibrary();
        const { PlacesService } = await loadPlacesLibrary();

        // Create off-screen map div for PlacesService
        if (!mapDivRef.current) {
          mapDivRef.current = document.createElement("div");
          mapDivRef.current.style.display = "none";
          document.body.appendChild(mapDivRef.current);
        }

        const map = new Map(mapDivRef.current, {
          center: userLocation,
          zoom: 10,
        });

        const service = new PlacesService(map);

        const results = await new Promise<google.maps.places.PlaceResult[]>(
          (resolve, reject) => {
            service.nearbySearch(
              {
                location: userLocation!,
                radius: 40000,
                keyword: placeSearchQuery!,
                type: "health",
              },
              (
                results: google.maps.places.PlaceResult[] | null,
                status: google.maps.places.PlacesServiceStatus,
              ) => {
                if (
                  status === google.maps.places.PlacesServiceStatus.OK &&
                  results
                ) {
                  resolve(results);
                } else if (
                  status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS
                ) {
                  resolve([]);
                } else {
                  reject(new Error(`Places search failed: ${status}`));
                }
              },
            );
          },
        );

        if (cancelled) return;

        const mapped: NearbyPlace[] = results.slice(0, 10).map((r) => ({
          placeId: r.place_id ?? "",
          name: r.name ?? "",
          address: r.vicinity ?? "",
          rating: r.rating ?? null,
          lat: r.geometry?.location?.lat() ?? 0,
          lng: r.geometry?.location?.lng() ?? 0,
          openNow: r.opening_hours?.isOpen?.() ?? null,
        }));

        setPlaces(mapped);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Search failed");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    search();

    return () => {
      cancelled = true;
    };
  }, [enabled, placeSearchQuery, userLocation]);

  return { places, isLoading, error };
}
