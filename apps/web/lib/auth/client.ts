import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // Browser requests must target the current desktop-hosted web server. Public
  // environment variables are substituted at build time and otherwise retain
  // the development URL in the packaged application.
  baseURL: typeof window === 'undefined' ? undefined : window.location.origin,
});

export const { useSession, signIn, signOut, signUp } = authClient;
