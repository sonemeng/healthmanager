import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { getDb } from '@openvitals/database/client';
import { profiles } from '@openvitals/database';

export const ACTIVE_PROFILE_COOKIE = 'hm_profile';

export async function getActiveProfileId(
  userId: string,
): Promise<string | null> {
  const h = await headers();
  const raw = h.get('cookie') ?? '';
  const match = raw.match(/(?:^|;\s*)hm_profile=([^;]+)/);
  const db = getDb();
  if (!match?.[1]) {
    const [ownerProfile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.userId, userId), eq(profiles.isDefault, true)))
      .limit(1);
    return ownerProfile?.id ?? null;
  }

  const profileId = decodeURIComponent(match[1]);
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1);
  // Invalid or stale cookies safely fall back to the account owner's profile.
  if (row?.id) return row.id;
  const [ownerProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.isDefault, true)))
    .limit(1);
  return ownerProfile?.id ?? null;
}
