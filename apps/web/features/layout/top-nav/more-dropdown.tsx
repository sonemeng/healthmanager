"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { secondaryNav } from "./nav-config";

interface MoreDropdownProps {
  pathname: string;
}

export function MoreDropdown({ pathname }: MoreDropdownProps) {
  const [open, setOpen] = useState(false);

  const isActive = secondaryNav.some(
    (item) => pathname === item.href || pathname.startsWith(item.href),
  );

  // Find the active item name to show in the button
  const activeItem = secondaryNav.find(
    (item) => pathname === item.href || pathname.startsWith(item.href),
  );

  return (
    <div className="relative hidden md:block">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors cursor-pointer rounded",
          isActive
            ? "text-accent-700 bg-accent-50"
            : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50",
        )}
      >
        {activeItem ? activeItem.name : "更多"}
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1 w-52 card z-50 py-1">
            {secondaryNav.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-[12px] font-body transition-colors",
                  pathname === item.href || pathname.startsWith(item.href)
                    ? "text-accent-700 bg-accent-50"
                    : "text-neutral-600 hover:bg-neutral-50",
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {item.name}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
