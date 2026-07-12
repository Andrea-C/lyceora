"use client";

import { useEffect, useState } from "react";
import { BADGE_DEFINITIONS } from "@lyceora/engine";

export interface BadgeToastProps {
  badgeIds: string[];
  locale: "it" | "en";
}

/** Celebratory toast for newly-awarded badges — renders nothing when empty, auto-dismisses after
 * 5s so it never blocks the session flow. */
export function BadgeToast({ badgeIds, locale }: BadgeToastProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
    if (badgeIds.length === 0) return;
    const timer = setTimeout(() => setDismissed(true), 5000);
    return () => clearTimeout(timer);
  }, [badgeIds]);

  if (dismissed || badgeIds.length === 0) return null;

  const badges = BADGE_DEFINITIONS.filter((b) => badgeIds.includes(b.id));

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-background p-4 shadow-lg dark:border-white/[.15]">
      {badges.map((b) => (
        <p key={b.id} className="font-semibold">🏅 {b.name[locale]}</p>
      ))}
    </div>
  );
}
