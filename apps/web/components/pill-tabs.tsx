"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PillTabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ElementType;
  /** Extra content rendered after the label (e.g. a count badge). */
  right?: ReactNode;
}

interface PillTabsProps<T extends string = string> {
  items: PillTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PillTabs<T extends string = string>({
  items,
  value,
  onChange,
  className,
}: PillTabsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlight, setHighlight] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const activeIndex = items.findIndex((item) => item.id === value);

  const measure = useCallback(() => {
    if (!containerRef.current || activeIndex === -1) return;
    const buttons =
      containerRef.current.querySelectorAll<HTMLElement>("[data-pill-tab]");
    const active = buttons[activeIndex];
    if (active) {
      setHighlight({ left: active.offsetLeft, width: active.offsetWidth });
      setReady(true);
    }
  }, [activeIndex]);

  useEffect(() => {
    measure();
  }, [measure]);

  // Re-measure on resize so the highlight stays aligned.
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className="flex">
      <div
        ref={containerRef}
        className={cn(
          "relative flex items-center p-0.5 border rounded bg-neutral-100",
          className,
        )}
      >
        {/* Animated highlight */}
        {ready && activeIndex !== -1 && highlight.width > 0 && (
          <motion.div
            className="absolute h-[30px] bg-neutral-900 rounded"
            initial={false}
            animate={{ left: highlight.left, width: highlight.width }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}

        {items.map((item) => {
          const isActive = item.id === value;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              data-pill-tab
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex h-[30px] items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors z-10",
                isActive
                  ? "text-white"
                  : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              {Icon && (
                <Icon
                  className={cn("h-3.5 w-3.5", isActive && "text-accent-600")}
                />
              )}
              {item.label}
              {item.right}
            </button>
          );
        })}
      </div>
    </div>
  );
}
