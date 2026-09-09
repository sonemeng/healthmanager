import type { DataCategory, AccessLevel } from '@openvitals/common';

export interface SharePolicy {
  id: string;
  userId: string;
  categories: DataCategory[];
  accessLevel: AccessLevel;
  dateFrom: Date | null;
  dateTo: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
}

export interface AccessGrant {
  id: string;
  sharePolicyId: string;
  recipientEmail: string | null;
  recipientUserId: string | null;
  token: string;
  isActive: boolean;
  revokedAt: Date | null;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason: string;
  policy?: SharePolicy;
  grant?: AccessGrant;
}

export function checkAccess(
  grant: AccessGrant,
  policy: SharePolicy,
  requestedCategory: DataCategory,
  now: Date = new Date()
): AccessCheckResult {
  if (!grant.isActive || grant.revokedAt) {
    return { allowed: false, reason: 'Grant is revoked or inactive' };
  }

  if (!policy.isActive) {
    return { allowed: false, reason: 'Share policy is inactive' };
  }

  if (policy.expiresAt && policy.expiresAt < now) {
    return { allowed: false, reason: 'Share policy has expired' };
  }

  if (!policy.categories.includes(requestedCategory)) {
    return { allowed: false, reason: `Category ${requestedCategory} not included in share policy` };
  }

  return { allowed: true, reason: 'Access granted', policy, grant };
}

export function filterCategoriesForGrant(
  policy: SharePolicy,
  allCategories: DataCategory[]
): DataCategory[] {
  return allCategories.filter(cat => policy.categories.includes(cat));
}
