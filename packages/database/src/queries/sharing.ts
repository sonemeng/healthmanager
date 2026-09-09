import { and, eq, isNull, gt, sql } from 'drizzle-orm';
import { accessGrants, sharePolicies } from '../schema/sharing';
import type { Database } from '../client';

export async function checkCategoryAccess(
  db: Database,
  params: {
    token: string;
    category: string;
  },
) {
  const grant = await db
    .select({
      sharePolicyId: accessGrants.sharePolicyId,
      isActive: accessGrants.isActive,
      policyUserId: sharePolicies.userId,
      categories: sharePolicies.categories,
      expiresAt: sharePolicies.expiresAt,
      policyIsActive: sharePolicies.isActive,
    })
    .from(accessGrants)
    .innerJoin(sharePolicies, eq(accessGrants.sharePolicyId, sharePolicies.id))
    .where(eq(accessGrants.token, params.token))
    .limit(1);

  if (!grant.length) return { allowed: false, userId: null as string | null };

  const row = grant[0]!;
  if (!row.isActive || !row.policyIsActive) return { allowed: false, userId: null as string | null };
  if (row.expiresAt && row.expiresAt < new Date()) return { allowed: false, userId: null as string | null };

  const categories = row.categories as string[];
  if (!categories.includes(params.category)) return { allowed: false, userId: null as string | null };

  return { allowed: true, userId: row.policyUserId };
}

export async function getActiveGrants(
  db: Database,
  params: {
    userId: string;
  },
) {
  return db.query.sharePolicies.findMany({
    where: and(
      eq(sharePolicies.userId, params.userId),
      eq(sharePolicies.isActive, true),
    ),
    with: {
      accessGrants: true,
    },
    orderBy: (policies, { desc }) => [desc(policies.createdAt)],
  });
}
