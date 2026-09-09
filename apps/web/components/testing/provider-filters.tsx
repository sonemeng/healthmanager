"use client";

import { cn } from "@/lib/utils";
import { LayoutGrid, Building2, Globe, Store, Crown } from "lucide-react";

export interface FilterState {
  serviceType: string | null;
  features: Set<string>;
  priceRange: string | null;
}

interface ProviderFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

const categoryChips = [
  { value: null, label: "All", icon: LayoutGrid },
  { value: "national_lab", label: "National Labs", icon: Building2 },
  { value: "online_ordering", label: "Online", icon: Globe },
  { value: "franchise", label: "Franchise", icon: Store },
  { value: "membership", label: "Membership", icon: Crown },
] as const;

const featureChips = [
  { key: "supportsWalkIn", label: "Walk-In" },
  { key: "supportsInsurance", label: "Insurance" },
  { key: "supportsDirectAccess", label: "Direct Access" },
] as const;

const priceChips = [
  { value: "$", label: "$" },
  { value: "$$", label: "$$" },
  { value: "$$$", label: "$$$" },
] as const;

export function ProviderFilters({ filters, onChange }: ProviderFiltersProps) {
  function setServiceType(value: string | null) {
    onChange({ ...filters, serviceType: value });
  }

  function toggleFeature(key: string) {
    const next = new Set(filters.features);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange({ ...filters, features: next });
  }

  function togglePrice(value: string) {
    onChange({
      ...filters,
      priceRange: filters.priceRange === value ? null : value,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Category chips */}
      {categoryChips.map((chip) => {
        const active = filters.serviceType === chip.value;
        const Icon = chip.icon;
        return (
          <button
            key={chip.label}
            onClick={() => setServiceType(chip.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
            )}
          >
            <Icon className="h-3 w-3" />
            {chip.label}
          </button>
        );
      })}

      <div className="mx-1 h-4 w-px bg-neutral-200" />

      {/* Feature chips */}
      {featureChips.map((chip) => {
        const active = filters.features.has(chip.key);
        return (
          <button
            key={chip.key}
            onClick={() => toggleFeature(chip.key)}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
            )}
          >
            {chip.label}
          </button>
        );
      })}

      <div className="mx-1 h-4 w-px bg-neutral-200" />

      {/* Price chips */}
      {priceChips.map((chip) => {
        const active = filters.priceRange === chip.value;
        return (
          <button
            key={chip.value}
            onClick={() => togglePrice(chip.value)}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
