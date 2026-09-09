'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ModalProvider } from '@/components/modal/provider';
import { trpc } from '@/lib/trpc/client';
import { Analytics } from "@vercel/analytics/next"
function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <TooltipPrimitive.Provider delayDuration={150}>
          <ModalProvider>
            {children}
            <Toaster position="bottom-right" />
            <Analytics />
          </ModalProvider>
        </TooltipPrimitive.Provider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
