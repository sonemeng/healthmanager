import type { DataCategory, AccessLevel } from '@openvitals/common';

export interface ShareTemplate {
  id: string;
  name: string;
  description: string | null;
  categories: DataCategory[];
  defaultAccessLevel: AccessLevel;
}

export function applyTemplate(
  template: ShareTemplate,
  overrides?: {
    categories?: DataCategory[];
    accessLevel?: AccessLevel;
    dateFrom?: Date;
    dateTo?: Date;
    expiresAt?: Date;
  }
) {
  return {
    templateId: template.id,
    name: template.name,
    categories: overrides?.categories ?? template.categories,
    accessLevel: overrides?.accessLevel ?? template.defaultAccessLevel,
    dateFrom: overrides?.dateFrom ?? null,
    dateTo: overrides?.dateTo ?? null,
    expiresAt: overrides?.expiresAt ?? null,
  };
}
