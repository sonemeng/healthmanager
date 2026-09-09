import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { getDb } from '@openvitals/database/client';
import { auth } from '../auth';
import { headers } from 'next/headers';

export async function createContext(opts?: FetchCreateContextFnOptions) {
  const db = getDb();

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return {
    db,
    session,
    userId: session?.user?.id ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
