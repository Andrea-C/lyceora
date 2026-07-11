"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExerciseCard, type RedactedExercise } from "@/components/ExerciseCard";

interface Props {
  profileId: string;
  locale: string;
}

type Phase = "loading" | "asking" | "error" | "done";

/**
 * The diagnostic is silent about right/wrong per question ("niente voti!" — no grades): the API
 * only ever hands back the next question or the final result, never per-answer correctness. So
 * unlike the daily session, ExerciseCard here only ever runs in "answering" phase.
 */
export function DiagnosticClient({ profileId, locale }: Props) {
  const t = useTranslations("diagnostic");
  const tCommon = useTranslations("common");

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exercise, setExercise] = useState<RedactedExercise | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hasStarted = useRef(false);

  // The initial "loading"/null state is already correct for the on-mount call, so nothing needs
  // resetting here. `retry()` (an event handler, not an Effect) resets state before re-invoking
  // this after an error.
  async function runStart() {
    try {
      const res = await fetch("/api/diagnostic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", profileId })
      });
      if (!res.ok) { setPhase("error"); setMessage(t("error")); return; }
      const data = await res.json();
      setSessionId(data.sessionId);
      if (data.done) {
        setPhase("done");
      } else {
        setExercise(data.question.exercise);
        setQuestionNumber(1);
        setPhase("asking");
      }
    } catch {
      setPhase("error");
      setMessage(t("error"));
    }
  }

  useEffect(() => {
    // guards against React StrictMode's dev double-invoke of Effects, which would otherwise
    // start two diagnostic sessions on a single mount.
    if (hasStarted.current) return;
    hasStarted.current = true;
    void runStart();
    // intentionally run once on mount — profileId doesn't change for a mounted diagnostic run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    setPhase("loading");
    setMessage(null);
    void runStart();
  }

  async function handleSubmit(answer: string) {
    if (!sessionId || !exercise || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/diagnostic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer", profileId, sessionId, exerciseId: exercise.id, answer })
      });
      if (res.status === 409) {
        // stale nonce (replayed/duplicate submit) — never restart the run, just let the student
        // try the SAME still-displayed question again.
        setMessage(t("retry"));
        setSubmitting(false);
        return;
      }
      if (!res.ok) { setPhase("error"); setMessage(t("error")); setSubmitting(false); return; }
      const data = await res.json();
      setMessage(null);
      if (data.done) {
        setPhase("done");
      } else {
        setExercise(data.question.exercise);
        setQuestionNumber((n) => n + 1);
      }
    } catch {
      setMessage(t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16">
        <p className="text-lg text-zinc-600 dark:text-zinc-400">{tCommon("loading")}</p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <p className="text-lg">{message}</p>
        <button
          type="button"
          data-testid="start-diagnostic"
          onClick={retry}
          className="rounded-full bg-foreground px-8 py-4 text-xl text-background"
        >
          {tCommon("retry")}
        </button>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">🎉 {t("done")}</h1>
        <Link href={`/${locale}/app`} className="rounded-full bg-foreground px-8 py-4 text-xl text-background">
          {tCommon("backToDashboard")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">{t("intro")}</p>
      </div>
      <div data-testid="diagnostic-answer" className="flex flex-col gap-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("question", { n: questionNumber })}</p>
        {message && <p role="alert" className="text-amber-600">{message}</p>}
        {exercise && (
          <ExerciseCard key={exercise.id} exercise={exercise} state={{ phase: "answering" }} onSubmit={(answer) => void handleSubmit(answer)} />
        )}
      </div>
    </main>
  );
}
