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
  if (!match?.[1]) return null;
  const profileId = decodeURIComponent(match[1]);
  const db = getDb();
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1);
  // 校验归属，防伪造 cookie 越权
  return row?.id ?? null;
}
