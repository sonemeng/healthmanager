import type { DataCategory } from '@openvitals/common';

// Utility to build WHERE clause additions for scoped queries
export interface SharingScope {
  ownerId: string;
  allowedCategories: DataCategory[];
  dateFrom: Date | null;
  dateTo: Date | null;
}

export function buildScopeFilter(scope: SharingScope) {
  return {
    userId: scope.ownerId,
    categories: scope.allowedCategories,
    dateRange: {
      start: scope.dateFrom,
      end: scope.dateTo,
    },
  };
}
