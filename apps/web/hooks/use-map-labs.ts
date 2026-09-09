"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { loadMapsLibrary, loadPlacesLibrary } from "@/lib/google-maps";

export interface MapPlace {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  lat: number;
  lng: number;
  openNow: boolean | null;
  providerId: string;
  providerName: string;
}

interface Provider {
  id: string;
  name: string;
  placeSearchQuery: string | null;
}

interface UseMapLabsReturn {
  places: MapPlace[];
  isLoading: boolean;
  error: string | null;
  searchAt: (center: { lat: number; lng: number }) => void;
}

export function useMapLabs(
  providers: Provider[],
  userLocation: { lat: number; lng: number } | null,
): UseMapLabsReturn {
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const searchedRef = useRef(false);
  const providersRef = useRef(providers);
  providersRef.current = providers;

  const doSearch = useCallback(async (center: { lat: number; lng: number }) => {
    const searchable = providersRef.current.filter((p) => p.placeSearchQuery);
    if (searchable.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const { Map } = await loadMapsLibrary();
      const { PlacesService } = await loadPlacesLibrary();

      if (!mapDivRef.current) {
        mapDivRef.current = document.createElement("div");
        mapDivRef.current.style.display = "none";
        document.body.appendChild(mapDivRef.current);
      }

      const map = new Map(mapDivRef.current, {
        center,
        zoom: 10,
      });

      const service = new PlacesService(map);
      const allPlaces: MapPlace[] = [];

      for (const provider of searchable) {
        try {
          const results = await new Promise<google.maps.places.PlaceResult[]>(
            (resolve, reject) => {
              service.nearbySearch(
                {
                  location: center,
                  radius: 40000,
                  keyword: provider.placeSearchQuery!,
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
                    status ===
                    google.maps.places.PlacesServiceStatus.ZERO_RESULTS
                  ) {
                    resolve([]);
                  } else {
                    reject(new Error(`Places search failed: ${status}`));
                  }
                },
              );
            },
          );

          const mapped = results.slice(0, 8).map((r) => ({
            placeId: r.place_id ?? "",
            name: r.name ?? "",
            address: r.vicinity ?? "",
            rating: r.rating ?? null,
            lat: r.geometry?.location?.lat() ?? 0,
            lng: r.geometry?.location?.lng() ?? 0,
            openNow: r.opening_hours?.isOpen?.() ?? null,
            providerId: provider.id,
            providerName: provider.name,
          }));

          allPlaces.push(...mapped);
        } catch {
          // Continue searching other providers even if one fails
        }
      }

      allPlaces.sort((a, b) => {
        const distA = Math.hypot(a.lat - center.lat, a.lng - center.lng);
        const distB = Math.hypot(b.lat - center.lat, b.lng - center.lng);
        return distA - distB;
      });
      setPlaces(allPlaces);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-search on first load when location + providers are available
  const searchableCount = providers.filter((p) => p.placeSearchQuery).length;

  useEffect(() => {
    if (!userLocation || searchedRef.current || searchableCount === 0) return;

    searchedRef.current = true;
    doSearch(userLocation);
  }, [userLocation, searchableCount, doSearch]);

  return { places, isLoading, error, searchAt: doSearch };
}
