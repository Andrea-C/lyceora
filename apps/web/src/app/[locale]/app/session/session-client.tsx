"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { RouteDecision, SessionItem, SessionPlan } from "@lyceora/engine";
import { ExerciseCard, type RedactedExercise } from "@/components/ExerciseCard";
import { TeacherChat } from "@/components/TeacherChat";
import { VideoList, type VideoResource } from "@/components/VideoList";
import { BadgeToast } from "@/components/BadgeToast";

interface LessonContent {
  description: string;
  resources: VideoResource[];
}

export interface SessionClientProps {
  profileId: string;
  sessionId: string;
  plan: SessionPlan;
  topicNames: Record<string, string>;
  lessonContent: Record<string, LessonContent>;
  locale: string;
}

type GradeableItem = Extract<SessionItem, { kind: "review" | "exercise" | "assessment" }>;

type ExerciseStepState =
  | { phase: "loading" }
  | { phase: "answering"; servedExerciseId: string; exercise: RedactedExercise }
  | { phase: "feedback"; exercise: RedactedExercise; correct: boolean; feedback: string; routeDecision?: RouteDecision }
  | { phase: "error"; message: string };

export function SessionClient({ profileId, sessionId, plan, topicNames, lessonContent, locale }: SessionClientProps) {
  const t = useTranslations("session");
  const tCommon = useTranslations("common");

  const [index, setIndex] = useState(0);
  const [xpTotal, setXpTotal] = useState(0);
  const [exerciseState, setExerciseState] = useState<ExerciseStepState>({ phase: "loading" });
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const fetchedForIndex = useRef<number | null>(null);

  const item = plan.items[index];
  const done = index >= plan.items.length;

  async function fetchExercise(currentItem: GradeableItem) {
    setExerciseState({ phase: "loading" });
    try {
      const query = new URLSearchParams({
        profileId, sessionId, topicId: currentItem.topicId,
        difficulty: String(currentItem.difficulty), kind: currentItem.kind
      });
      const res = await fetch(`/api/activity/exercise?${query.toString()}`);
      if (!res.ok) { setExerciseState({ phase: "error", message: tCommon("genericError") }); return; }
      const data = await res.json();
      setExerciseState({ phase: "answering", servedExerciseId: data.servedExerciseId, exercise: data.exercise });
    } catch {
      setExerciseState({ phase: "error", message: tCommon("genericError") });
    }
  }

  useEffect(() => {
    if (done || !item || item.kind === "lesson") return;
    if (fetchedForIndex.current === index) return;
    fetchedForIndex.current = index;
    void fetchExercise(item as GradeableItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, done]);

  async function submitAnswer(answer: string) {
    if (exerciseState.phase !== "answering" || !item || item.kind === "lesson") return;
    const { servedExerciseId, exercise } = exerciseState;
    try {
      const res = await fetch("/api/activity", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, sessionId, item, servedExerciseId, answer })
      });
      if (res.status === 409) {
        // stale/consumed served exercise: fetch a fresh one for the same item — no progress lost.
        await fetchExercise(item as GradeableItem);
        return;
      }
      if (!res.ok) { setExerciseState({ phase: "error", message: tCommon("genericError") }); return; }
      const data = await res.json();
      setXpTotal((xp) => xp + (data.xp ?? 0));
      setNewBadges(data.newBadges ?? []);
      setExerciseState({
        phase: "feedback", exercise,
        correct: data.graded.correct, feedback: data.graded.feedback, routeDecision: data.routeDecision
      });
    } catch {
      setExerciseState({ phase: "error", message: tCommon("genericError") });
    }
  }

  async function completeLesson() {
    if (!item || item.kind !== "lesson") return;
    try {
      const res = await fetch("/api/activity", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, sessionId, item })
      });
      if (res.ok) {
        const data = await res.json();
        setXpTotal((xp) => xp + (data.xp ?? 0));
        setNewBadges(data.newBadges ?? []);
      }
    } finally {
      advance();
    }
  }

  function advance() {
    setExerciseState({ phase: "loading" });
    setIndex((i) => i + 1);
  }

  if (done) {
    return (
      <>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
          <h1 className="text-3xl font-semibold">🎉 {t("sessionDone", { xp: xpTotal })}</h1>
          <Link href={`/${locale}/app`} className="rounded-full bg-foreground px-8 py-4 text-xl text-background">
            {tCommon("backToDashboard")}
          </Link>
        </main>
        <BadgeToast badgeIds={newBadges} locale={locale as "it" | "en"} />
      </>
    );
  }
  if (!item) return null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t(item.kind)} · {index + 1}/{plan.items.length}
        </p>

        {item.kind === "lesson" ? (
          <div className="flex flex-col gap-8">
            <div>
              <h1 className="text-2xl font-semibold">{topicNames[item.topicId]}</h1>
              <p className="mt-2 text-lg">{lessonContent[item.topicId]?.description}</p>
            </div>
            <VideoList resources={lessonContent[item.topicId]?.resources ?? []} />
            <div>
              <h2 className="mb-2 text-lg font-semibold">{t("askTeacher")}</h2>
              <TeacherChat profileId={profileId} topicId={item.topicId} threadId={`${sessionId}-${item.topicId}`} />
            </div>
            <button
              type="button"
              data-testid="session-next"
              onClick={() => void completeLesson()}
              className="self-start rounded-full bg-foreground px-8 py-3 text-lg text-background"
            >
              {t("next")}
            </button>
          </div>
        ) : exerciseState.phase === "loading" ? (
          <p className="text-lg text-zinc-600 dark:text-zinc-400">{tCommon("loading")}</p>
        ) : exerciseState.phase === "error" ? (
          <div className="flex flex-col gap-4">
            <p role="alert">{exerciseState.message}</p>
            <button
              type="button"
              onClick={() => void fetchExercise(item as GradeableItem)}
              className="self-start rounded-full bg-foreground px-6 py-3 text-background"
            >
              {tCommon("retry")}
            </button>
          </div>
        ) : (
          <>
            <ExerciseCard
              key={exerciseState.exercise.id}
              exercise={exerciseState.exercise}
              state={
                exerciseState.phase === "feedback"
                  ? { phase: "feedback", correct: exerciseState.correct, feedback: exerciseState.feedback }
                  : { phase: "answering" }
              }
              onSubmit={(answer) => void submitAnswer(answer)}
              onNext={exerciseState.phase === "feedback" ? advance : undefined}
            />
            {exerciseState.phase === "feedback" && exerciseState.routeDecision && item.kind === "assessment" && (
              <p className="text-lg">{routeMessage(exerciseState.routeDecision, topicNames, t)}</p>
            )}
          </>
        )}
      </main>
      <BadgeToast badgeIds={newBadges} locale={locale as "it" | "en"} />
    </>
  );
}

function routeMessage(
  decision: RouteDecision,
  topicNames: Record<string, string>,
  t: (key: string, values?: Record<string, string | number | Date>) => string
): string {
  switch (decision.action) {
    case "advance": return t("routeAdvance");
    case "continue": return t("routeContinue");
    case "reteach": return t("routeReteach", { topic: topicNames[decision.topicId] ?? decision.topicId });
    case "remediate": return t("routeRemediate", { topic: topicNames[decision.remediationTopicId] ?? decision.remediationTopicId });
  }
}
