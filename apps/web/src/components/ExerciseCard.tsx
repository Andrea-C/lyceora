"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Exercise } from "@lyceora/agents";

/**
 * The client never receives correctAnswer/explanation — the server redacts every exercise
 * before it crosses the wire (see apps/web/src/server/exercise.ts's redactExercise). Grading
 * happens server-side; this component only ever renders a prompt and collects an answer.
 */
export type RedactedExercise = Omit<Exercise, "correctAnswer" | "explanation">;

export type ExerciseCardState =
  | { phase: "answering" }
  | { phase: "feedback"; correct: boolean; feedback: string };

export interface ExerciseCardProps {
  exercise: RedactedExercise;
  state: ExerciseCardState;
  onSubmit: (answer: string) => void;
  /** Present once feedback is showing and there's somewhere to go next. */
  onNext?: () => void;
}

/**
 * NOTE: the caller must render this with `key={exercise.id}` — a fresh exercise remounts the
 * component from scratch (React's own recommended pattern for "reset all state when a prop
 * changes"), rather than an Effect that resets state after the fact.
 */
export function ExerciseCard({ exercise, state, onSubmit, onNext }: ExerciseCardProps) {
  const t = useTranslations("session");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");

  const answering = state.phase === "answering";
  const canSubmit = exercise.kind === "mcq" ? selectedIndex !== null : textAnswer.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(exercise.kind === "mcq" ? String(selectedIndex) : textAnswer);
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-black/[.08] p-6 dark:border-white/[.15]">
      <p className="text-xl font-medium">{exercise.prompt}</p>

      {answering && exercise.kind === "mcq" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {exercise.choices?.map((choice, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedIndex(i)}
              className={`rounded-xl border-2 px-6 py-5 text-lg font-medium transition-colors ${
                selectedIndex === i
                  ? "border-foreground bg-foreground text-background"
                  : "border-black/[.1] hover:bg-black/[.03] dark:border-white/[.15] dark:hover:bg-white/[.05]"
              }`}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {answering && exercise.kind === "numeric" && (
        <input
          data-testid="exercise-input"
          inputMode="decimal"
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          autoFocus
          className="rounded-xl border-2 border-black/[.1] px-6 py-5 text-center text-2xl dark:border-white/[.15] dark:bg-black"
        />
      )}

      {answering && exercise.kind === "open" && (
        <textarea
          data-testid="exercise-input"
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          rows={4}
          className="rounded-xl border-2 border-black/[.1] px-4 py-3 text-lg dark:border-white/[.15] dark:bg-black"
        />
      )}

      {answering && (
        <button
          type="button"
          data-testid="exercise-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="self-start rounded-full bg-foreground px-8 py-3 text-lg text-background transition-colors disabled:opacity-40"
        >
          {t("check")}
        </button>
      )}

      {state.phase === "feedback" && (
        <div data-testid="exercise-feedback" className="flex flex-col gap-3">
          <p className={`text-xl font-semibold ${state.correct ? "text-green-600" : "text-amber-600"}`}>
            {state.correct ? t("correct") : t("incorrect")}
          </p>
          <p className="text-lg">{state.feedback}</p>
          {onNext && (
            <button
              type="button"
              data-testid="session-next"
              onClick={onNext}
              className="self-start rounded-full bg-foreground px-8 py-3 text-lg text-background"
            >
              {t("next")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
