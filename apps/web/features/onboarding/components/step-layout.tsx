'use client';

import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

interface StepLayoutProps {
  title: string;
  subtitle?: string;
  why?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  direction?: 1 | -1;
  stepKey: string;
  wide?: boolean;
}

export function StepLayout({ title, subtitle, why, children, footer, direction = 1, stepKey, wide }: StepLayoutProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-10 md:items-center md:py-16">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={stepKey}
            custom={direction}
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -30 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={cn('w-full', wide ? 'max-w-2xl' : 'max-w-md')}
          >
            {/* Header */}
            <div className="mb-8">
              <h1
                className="text-[24px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.25] font-display"
              >
                {title}
              </h1>
              {subtitle && (
                <p
                  className="mt-2 text-[14px] leading-[1.65] text-neutral-500 font-body"
                >
                  {subtitle}
                </p>
              )}
              {why && (
                <p
                  className="mt-3 text-[11px] tracking-[0.01em] text-neutral-400 font-mono"
                >
                  {why}
                </p>
              )}
            </div>

            {/* Content */}
            <div>{children}</div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-neutral-200/60 bg-white px-6 py-4">
        <div className={cn('mx-auto flex items-center', wide ? 'max-w-2xl' : 'max-w-md')}>
          {footer}
        </div>
      </div>
    </div>
  );
}
