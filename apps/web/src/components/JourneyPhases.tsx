import Link from "next/link";
import { useTranslations } from "next-intl";

export type JourneyPhaseKey = "subject" | "assessment" | "path" | "final" | "certificate";
export type JourneyPhaseState = "done" | "current" | "upcoming" | "locked";

export interface JourneyPhase {
  key: JourneyPhaseKey;
  state: JourneyPhaseState;
  href?: string;
}

export interface JourneyPhasesProps {
  phases: JourneyPhase[];
}

/** Vertical stepper for the five journey phases. Server-safe (no "use client"), same idiom as
 * AppNav/PathProgress. Rows with an href AND a done/current state are Links; upcoming/locked
 * rows are plain divs with aria-disabled — the phase isn't reachable yet. */
export function JourneyPhases({ phases }: JourneyPhasesProps) {
  const t = useTranslations("journey");

  const phaseLabels: Record<JourneyPhaseKey, string> = {
    subject: t("phaseSubject"),
    assessment: t("phaseAssessment"),
    path: t("phasePath"),
    final: t("phaseFinal"),
    certificate: t("phaseCertificate")
  };
  const stateLabels: Record<JourneyPhaseState, string> = {
    done: t("stateDone"),
    current: t("stateCurrent"),
    upcoming: t("stateUpcoming"),
    locked: t("stateLocked")
  };

  return (
    <ul className="flex flex-col gap-3">
      {phases.map((phase) => {
        const content = (
          <>
            <span
              aria-hidden="true"
              className={
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs " +
                (phase.state === "done"
                  ? "bg-foreground text-background"
                  : phase.state === "current"
                    ? "ring-2 ring-foreground"
                    : "border border-black/[.15] text-zinc-500 dark:border-white/[.2] dark:text-zinc-400")
              }
            >
              {phase.state === "done" ? "✓" : phase.state === "locked" ? "🔒" : ""}
            </span>
            <span className="flex-1">{phaseLabels[phase.key]}</span>
            <span className="rounded-full bg-black/[.06] px-2 py-1 text-xs dark:bg-white/[.1]">
              {stateLabels[phase.state]}
            </span>
          </>
        );
        const rowClass = "flex items-center gap-3 rounded-xl border border-black/[.08] px-4 py-3 dark:border-white/[.15]";

        if (phase.href && (phase.state === "done" || phase.state === "current")) {
          return (
            <li key={phase.key}>
              <Link href={phase.href} className={`${rowClass} hover:bg-black/[.03] dark:hover:bg-white/[.05]`}>
                {content}
              </Link>
            </li>
          );
        }
        return (
          <li key={phase.key}>
            <div aria-disabled="true" className={`${rowClass} text-zinc-500 dark:text-zinc-400`}>
              {content}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
