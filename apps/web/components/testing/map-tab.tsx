"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Search,
  MapPin,
  Star,
  Loader2,
  ExternalLink,
  Navigation,
  MapIcon,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { useUserLocation } from "@/hooks/use-user-location";
import { useMapLabs, type MapPlace } from "@/hooks/use-map-labs";
import { loadMapsLibrary, loadMarkerLibrary } from "@/lib/google-maps";
import { trpc } from "@/lib/trpc/client";

import questIcon from "@/assets/marketing/brand-logos/quest-icon.png";
import labcorpIcon from "@/assets/marketing/brand-logos/labcorp-icon.png";

const brandIcons: Record<string, string> = {
  quest: questIcon.src,
  labcorp: labcorpIcon.src,
};

// Provider accent colors for map pins
const providerColors: Record<string, string> = {
  quest: "#c0392b",
  labcorp: "#2980b9",
  life_extension: "#27ae60",
  any_lab_test_now: "#e67e22",
};

const defaultPinColor = "#c0392b";

export function MapTab() {
  const { data: providers, isLoading: providersLoading } =
    trpc.testing["providers.list"].useQuery();
  const {
    location,
    isLoading: locationLoading,
    requestLocation,
  } = useUserLocation();

  const {
    places,
    isLoading: placesLoading,
    searchAt,
  } = useMapLabs(providers ?? [], location);

  const [search, setSearch] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);

  // Track which place the map pin hover triggered (for auto-scroll)
  const [mapTriggeredSelect, setMapTriggeredSelect] = useState(false);

  const filteredPlaces = useMemo(() => {
    if (!search) return places;
    const q = search.toLowerCase();
    return places.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.providerName.toLowerCase().includes(q),
    );
  }, [places, search]);

  // Group by provider for the list
  const groupedPlaces = useMemo(() => {
    const groups: Record<
      string,
      { providerName: string; providerId: string; places: MapPlace[] }
    > = {};
    for (const place of filteredPlaces) {
      if (!groups[place.providerId]) {
        groups[place.providerId] = {
          providerName: place.providerName,
          providerId: place.providerId,
          places: [],
        };
      }
      groups[place.providerId].places.push(place);
    }
    return Object.values(groups);
  }, [filteredPlaces]);

  const isLoading = providersLoading || locationLoading || placesLoading;
  const venueCount = filteredPlaces.length;

  function handleMapSelect(placeId: string | null) {
    setSelectedPlaceId(placeId);
    if (placeId) {
      setMapTriggeredSelect(true);
    }
  }

  function handleListSelect(placeId: string) {
    setSelectedPlaceId(selectedPlaceId === placeId ? null : placeId);
    setMapTriggeredSelect(false);
  }

  return (
    <div
      className="-mx-3 -mb-6 md:-mx-6 md:-mb-8 flex"
      style={{ height: "calc(100vh - 11rem)" }}
    >
      {/* Left panel — scrollable list */}
      <div className="w-full shrink-0 overflow-y-auto border-r border-neutral-200 bg-white md:w-[440px] lg:w-[520px]">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white px-5 pb-4 pt-5">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[var(--color-accent-500)]" />
            {location ? (
              <h2 className="text-lg font-semibold text-neutral-900">
                Labs near {location.city}, {location.state}
              </h2>
            ) : (
              <h2 className="text-lg font-semibold text-neutral-900">
                Find labs near you
              </h2>
            )}
          </div>

          {location && !isLoading && (
            <p className="mt-0.5 text-xs text-neutral-500">
              {venueCount} location{venueCount !== 1 ? "s" : ""}
            </p>
          )}

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search labs, addresses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
            />
          </div>

          {/* Provider legend */}
          {places.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {groupedPlaces.map((group) => (
                <span
                  key={group.providerId}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-600"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        providerColors[group.providerId] ?? defaultPinColor,
                    }}
                  />
                  {group.providerName}
                  <span className="text-neutral-400">
                    ({group.places.length})
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* No location state */}
        {!location && !locationLoading && (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-20 text-center">
            <div className="rounded-full bg-neutral-100 p-4">
              <MapIcon className="h-6 w-6 text-neutral-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-700">
                Enable location to discover labs
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                We&apos;ll find walk-in lab locations near you
              </p>
            </div>
            <button
              onClick={requestLocation}
              className={cn(
                "mt-1 rounded-lg px-4 py-2 text-sm font-medium",
                "bg-[var(--color-accent-500)] text-white",
                "transition-colors hover:bg-[var(--color-accent-600)]",
              )}
            >
              Enable Location
            </button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Finding nearby labs...
          </div>
        )}

        {/* Place list */}
        {!isLoading && location && (
          <div>
            {groupedPlaces.map((group) => (
              <div key={group.providerId}>
                <div className="sticky top-[145px] z-[5] border-b border-neutral-100 bg-neutral-50/90 px-5 py-2 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={brandIcons[group.providerId] ?? null}
                      name={group.providerName}
                      className="size-5 rounded-md"
                    />
                    <span className="text-xs font-semibold text-neutral-700">
                      {group.providerName}
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      {group.places.length} location
                      {group.places.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                {group.places.map((place, idx) => (
                  <PlaceListItem
                    key={place.placeId}
                    place={place}
                    index={idx + 1}
                    isSelected={selectedPlaceId === place.placeId}
                    isHovered={hoveredPlaceId === place.placeId}
                    scrollOnSelect={mapTriggeredSelect}
                    onSelect={() => handleListSelect(place.placeId)}
                    onHover={() => setHoveredPlaceId(place.placeId)}
                    onLeave={() => setHoveredPlaceId(null)}
                  />
                ))}
              </div>
            ))}

            {filteredPlaces.length === 0 && places.length > 0 && (
              <p className="px-5 py-12 text-center text-sm text-neutral-500">
                No locations match your search.
              </p>
            )}

            {places.length === 0 && !isLoading && (
              <p className="px-5 py-12 text-center text-sm text-neutral-500">
                No walk-in lab locations found nearby.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right panel — Google Map */}
      <div className="hidden flex-1 md:block">
        <LabsMap
          places={filteredPlaces}
          userLocation={location}
          selectedPlaceId={selectedPlaceId}
          hoveredPlaceId={hoveredPlaceId}
          onSelectPlace={handleMapSelect}
          onHoverPlace={setHoveredPlaceId}
          onSearchHere={searchAt}
          isSearching={placesLoading}
        />
      </div>
    </div>
  );
}

// ── Place List Item ──────────────────────────────────────────────────────────

interface PlaceListItemProps {
  place: MapPlace;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  scrollOnSelect: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function PlaceListItem({
  place,
  index,
  isSelected,
  isHovered,
  scrollOnSelect,
  onSelect,
  onHover,
  onLeave,
}: PlaceListItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected && scrollOnSelect && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isSelected, scrollOnSelect]);

  return (
    <div
      ref={itemRef}
      onClick={onSelect}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        "cursor-pointer border-b border-neutral-100 px-5 py-4 transition-colors",
        isSelected
          ? "bg-[var(--color-accent-50)]"
          : isHovered
            ? "bg-neutral-50"
            : "bg-white",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Index number */}
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
            isSelected
              ? "bg-[var(--color-accent-500)] text-white"
              : "bg-neutral-100 text-neutral-500",
          )}
        >
          {index}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-900">
              {place.name}
            </h3>
            {place.rating !== null && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-neutral-700">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {place.rating.toFixed(1)}
              </span>
            )}
          </div>

          <div className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{place.address}</span>
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor:
                  (providerColors[place.providerId] ?? defaultPinColor) + "15",
                color: providerColors[place.providerId] ?? defaultPinColor,
              }}
            >
              {place.providerName}
            </span>

            {place.openNow !== null && (
              <span
                className={cn(
                  "text-[11px] font-medium",
                  place.openNow ? "text-green-600" : "text-neutral-400",
                )}
              >
                {place.openNow ? "Open now" : "Closed"}
              </span>
            )}
          </div>

          {/* Expanded detail on selection */}
          {isSelected && (
            <div className="mt-3 flex items-center gap-2">
              <a
                href={`https://www.google.com/maps/place/?q=place_id:${place.placeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5",
                  "bg-[var(--color-accent-500)] text-white text-xs font-medium",
                  "transition-colors hover:bg-[var(--color-accent-600)]",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <Navigation className="h-3 w-3" />
                Get Directions
              </a>
              <a
                href={`https://www.google.com/maps/place/?q=place_id:${place.placeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
                onClick={(e) => e.stopPropagation()}
              >
                View on Google Maps
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Map Pin Hover Card (floating overlay) ────────────────────────────────────

interface PinHoverCardProps {
  place: MapPlace;
  position: { x: number; y: number };
}

function PinHoverCard({ place, position }: PinHoverCardProps) {
  const color = providerColors[place.providerId] ?? defaultPinColor;

  return (
    <div
      className="pointer-events-none absolute z-50"
      style={{
        left: position.x,
        top: position.y,
        transform: "translate(-50%, -100%) translateY(-16px)",
      }}
    >
      <div className="pointer-events-auto w-64 rounded-lg border border-neutral-200 bg-white shadow-lg">
        <div className="p-3">
          {/* Name + rating */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="truncate text-sm font-semibold text-neutral-900">
              {place.name}
            </h4>
            {place.rating !== null && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-neutral-700">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {place.rating.toFixed(1)}
              </span>
            )}
          </div>

          {/* Provider + open status */}
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: color + "15",
                color,
              }}
            >
              {place.providerName}
            </span>
            {place.openNow !== null && (
              <span
                className={cn(
                  "text-[11px] font-medium",
                  place.openNow ? "text-green-600" : "text-neutral-400",
                )}
              >
                {place.openNow ? "Open now" : "Closed"}
              </span>
            )}
          </div>

          {/* Address */}
          <div className="mt-2 flex items-center gap-1 text-xs text-neutral-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{place.address}</span>
          </div>

          {/* Quick action */}
          <div className="mt-2.5 flex items-center gap-2">
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${place.placeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1",
                "bg-[var(--color-accent-500)] text-white text-[11px] font-medium",
                "transition-colors hover:bg-[var(--color-accent-600)]",
              )}
            >
              <Navigation className="h-2.5 w-2.5" />
              Directions
            </a>
            <span className="text-[11px] text-neutral-400">
              Click pin to select
            </span>
          </div>
        </div>

        {/* Bottom arrow */}
        <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2">
          <div className="h-3 w-3 rotate-45 border-b border-r border-neutral-200 bg-white" />
        </div>
      </div>
    </div>
  );
}

// ── Google Map ───────────────────────────────────────────────────────────────

interface LabsMapProps {
  places: MapPlace[];
  userLocation: { lat: number; lng: number } | null;
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  onSelectPlace: (id: string | null) => void;
  onHoverPlace: (id: string | null) => void;
  onSearchHere: (center: { lat: number; lng: number }) => void;
  isSearching: boolean;
}

function LabsMap({
  places,
  userLocation,
  selectedPlaceId,
  hoveredPlaceId,
  onSelectPlace,
  onHoverPlace,
  onSearchHere,
  isSearching,
}: LabsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<
    Map<string, google.maps.marker.AdvancedMarkerElement>
  >(new Map());

  // Hover card state — position relative to map container
  const [hoverCard, setHoverCard] = useState<{
    place: MapPlace;
    x: number;
    y: number;
  } | null>(null);

  // Show "Search Here" after user pans/zooms the map
  const [mapMoved, setMapMoved] = useState(false);
  const initialBoundsSetRef = useRef(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let cancelled = false;

    async function init() {
      const { Map } = await loadMapsLibrary();

      if (cancelled || !mapContainerRef.current) return;

      const center = userLocation ?? { lat: 39.8283, lng: -98.5795 };

      mapRef.current = new Map(mapContainerRef.current, {
        center,
        zoom: userLocation ? 11 : 4,
        mapId: "labs-map",
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        clickableIcons: false,
        gestureHandling: "greedy",
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
          {
            featureType: "transit",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
      });

      // Dismiss hover card on map interaction
      mapRef.current.addListener("drag", () => setHoverCard(null));
      mapRef.current.addListener("zoom_changed", () => setHoverCard(null));

      // Show "Search Here" after user moves the map
      mapRef.current.addListener("dragend", () => {
        if (initialBoundsSetRef.current) {
          setMapMoved(true);
        }
      });
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [userLocation]);

  // Stable refs for callbacks so marker event handlers don't go stale
  const onSelectPlaceRef = useRef(onSelectPlace);
  const onHoverPlaceRef = useRef(onHoverPlace);
  onSelectPlaceRef.current = onSelectPlace;
  onHoverPlaceRef.current = onHoverPlace;

  // Create/remove markers when the places array changes (NOT on hover/select)
  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

    async function syncMarkers() {
      const { AdvancedMarkerElement, PinElement } = await loadMarkerLibrary();

      if (cancelled || !mapRef.current) return;

      // Remove stale markers
      const currentIds = new Set(places.map((p) => p.placeId));
      for (const [id, marker] of markersRef.current) {
        if (!currentIds.has(id)) {
          marker.map = null;
          const cleanup = (marker as any).__cleanup;
          if (cleanup) cleanup();
          markersRef.current.delete(id);
        }
      }

      // Add new markers
      const bounds = new google.maps.LatLngBounds();
      let hasPoints = false;

      for (const place of places) {
        const color = providerColors[place.providerId] ?? defaultPinColor;

        if (!markersRef.current.has(place.placeId)) {
          const pin = new PinElement({
            background: color,
            borderColor: color,
            glyphColor: "#fff",
            scale: 1,
          });

          const marker = new AdvancedMarkerElement({
            map: mapRef.current,
            position: { lat: place.lat, lng: place.lng },
            content: pin.element,
            title: place.name,
          });

          // Hover events
          const contentEl = marker.content as HTMLElement;

          const enterHandler = () => {
            onHoverPlaceRef.current(place.placeId);

            if (mapContainerRef.current && contentEl) {
              const markerRect = contentEl.getBoundingClientRect();
              const containerRect =
                mapContainerRef.current.getBoundingClientRect();
              setHoverCard({
                place,
                x: markerRect.left - containerRect.left + markerRect.width / 2,
                y: markerRect.top - containerRect.top,
              });
            }
          };

          const leaveHandler = () => {
            onHoverPlaceRef.current(null);
            setHoverCard(null);
          };

          const clickHandler = () => {
            onSelectPlaceRef.current(place.placeId);
            setHoverCard(null);
          };

          contentEl.addEventListener("mouseenter", enterHandler);
          contentEl.addEventListener("mouseleave", leaveHandler);
          contentEl.addEventListener("click", clickHandler);

          (marker as any).__cleanup = () => {
            contentEl.removeEventListener("mouseenter", enterHandler);
            contentEl.removeEventListener("mouseleave", leaveHandler);
            contentEl.removeEventListener("click", clickHandler);
          };

          markersRef.current.set(place.placeId, marker);
        }

        bounds.extend({ lat: place.lat, lng: place.lng });
        hasPoints = true;
      }

      if (userLocation) {
        bounds.extend(userLocation);
      }

      if (hasPoints && mapRef.current) {
        mapRef.current.fitBounds(bounds, {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50,
        });
        // Allow a tick for fitBounds to settle before tracking user moves
        setTimeout(() => {
          initialBoundsSetRef.current = true;
        }, 500);
      }

      setMapMoved(false);
    }

    syncMarkers();

    return () => {
      cancelled = true;
    };
    // Only re-run when the set of places changes, NOT on hover/select
  }, [places, userLocation]);

  // Update pin styles on hover/select changes (no fitBounds, no marker creation)
  useEffect(() => {
    let cancelled = false;

    async function updateStyles() {
      const { PinElement } = await loadMarkerLibrary();
      if (cancelled) return;

      for (const place of places) {
        const marker = markersRef.current.get(place.placeId);
        if (!marker) continue;

        const color = providerColors[place.providerId] ?? defaultPinColor;
        const isActive =
          selectedPlaceId === place.placeId || hoveredPlaceId === place.placeId;

        const pin = new PinElement({
          background: isActive ? "#1a1a1a" : color,
          borderColor: isActive ? "#1a1a1a" : color,
          glyphColor: "#fff",
          scale: isActive ? 1.3 : 1,
        });

        // Re-attach hover events to the new content element
        const oldCleanup = (marker as any).__cleanup;
        if (oldCleanup) oldCleanup();

        marker.content = pin.element;
        marker.zIndex = isActive ? 1000 : undefined;

        const contentEl = marker.content as HTMLElement;

        const enterHandler = () => {
          onHoverPlaceRef.current(place.placeId);
          if (mapContainerRef.current && contentEl) {
            const markerRect = contentEl.getBoundingClientRect();
            const containerRect =
              mapContainerRef.current.getBoundingClientRect();
            setHoverCard({
              place,
              x: markerRect.left - containerRect.left + markerRect.width / 2,
              y: markerRect.top - containerRect.top,
            });
          }
        };

        const leaveHandler = () => {
          onHoverPlaceRef.current(null);
          setHoverCard(null);
        };

        const clickHandler = () => {
          onSelectPlaceRef.current(place.placeId);
          setHoverCard(null);
        };

        contentEl.addEventListener("mouseenter", enterHandler);
        contentEl.addEventListener("mouseleave", leaveHandler);
        contentEl.addEventListener("click", clickHandler);

        (marker as any).__cleanup = () => {
          contentEl.removeEventListener("mouseenter", enterHandler);
          contentEl.removeEventListener("mouseleave", leaveHandler);
          contentEl.removeEventListener("click", clickHandler);
        };
      }
    }

    updateStyles();

    return () => {
      cancelled = true;
    };
  }, [selectedPlaceId, hoveredPlaceId, places]);

  // Pan to selected place (keep current zoom)
  useEffect(() => {
    if (!mapRef.current || !selectedPlaceId) return;
    const place = places.find((p) => p.placeId === selectedPlaceId);
    if (place) {
      mapRef.current.panTo({ lat: place.lat, lng: place.lng });
    }
  }, [selectedPlaceId, places]);

  function handleSearchHere() {
    if (!mapRef.current) return;
    const center = mapRef.current.getCenter();
    if (center) {
      onSearchHere({ lat: center.lat(), lng: center.lng() });
      setMapMoved(false);
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Search Here button */}
      {(mapMoved || isSearching) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
          <Button
            text={isSearching ? "Searching..." : "Search Here"}
            icon={<Search className="h-3.5 w-3.5" />}
            loading={isSearching}
            variant="outline"
            onClick={handleSearchHere}
            className="rounded-full shadow-lg bg-white disabled:opacity-100"
          />
        </div>
      )}

      {/* Hover card overlay */}
      {hoverCard && (
        <PinHoverCard place={hoverCard.place} position={hoverCard} />
      )}
    </div>
  );
}
