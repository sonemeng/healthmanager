import type { DataCategory } from '@openvitals/common';

export interface ViewPlugin {
  id: string;
  version: string;
  displayName: string;
  description?: string;

  // Which data categories this view needs access to
  requiredCategories: DataCategory[];

  // Entry point component path (relative to plugin root)
  componentPath: string;

  // Where this view appears in the dashboard
  placement: 'sidebar' | 'tab' | 'card';
}
