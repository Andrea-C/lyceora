"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { runAgent } from "@/lib/agui-client";
import { capture } from "@/lib/capture";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Only set on assistant messages — correlates thumbs-up/down and "explain differently" back
   * to the run that produced this message. */
  runId?: string;
  pending?: boolean;
}

export interface TeacherChatProps {
  profileId: string;
  topicId: string;
  threadId: string;
}

/** Message list + input, streaming via runAgent; thumbs-up/down and "explain differently"
 * feed the HITL learning-signal capture surface. */
export function TeacherChat({ profileId, topicId, threadId }: TeacherChatProps) {
  const t = useTranslations("session");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // React state, not a ref — whether feedback was given affects render output (disabling the
  // thumbs buttons), and ref values must never be read during render.
  const [feedbackGivenIds, setFeedbackGivenIds] = useState<ReadonlySet<string>>(new Set());

  async function send(userText: string) {
    const trimmed = userText.trim();
    if (!trimmed || sending) return;
    setError(null);
    setSending(true);
    setInput("");

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const runId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const history = [...messages, userMessage];
    setMessages([...history, { id: assistantId, role: "assistant", content: "", runId, pending: true }]);

    // A run that finishes with zero deltas (no provider configured, or the model genuinely
    // returned nothing) must not leave a permanent "…" placeholder bubble with no explanation —
    // treated the same as a stream error.
    let receivedAnyContent = false;

    await runAgent(
      {
        threadId, runId, profileId, topicId,
        messages: history.slice(-60).map((m) => ({ role: m.role, content: m.content }))
      },
      {
        onDelta(text) {
          receivedAnyContent = true;
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m)));
        },
        onDone() {
          if (receivedAnyContent) {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false } : m)));
          } else {
            setError(t("teacherUnavailable"));
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          }
          setSending(false);
        },
        onError(message) {
          setError(message);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setSending(false);
        }
      }
    );
  }

  function handleFeedback(message: ChatMessage, positive: boolean) {
    if (!message.runId || feedbackGivenIds.has(message.id)) return;
    setFeedbackGivenIds((prev) => new Set(prev).add(message.id));
    const ids = { threadId, runId: message.runId };
    if (positive) void capture.approval(ids, message.content);
    else void capture.rejection(ids, message.content);
  }

  function explainDifferently(message: ChatMessage) {
    if (!message.runId) return;
    void capture.correction({ threadId, runId: message.runId }, message.content, "", t("explainDifferently"));
    void send(t("explainDifferently"));
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.15]">
      <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
        {messages.map((m) => {
          const feedbackDone = feedbackGivenIds.has(m.id);
          return (
            <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                  m.role === "user" ? "bg-foreground text-background" : "bg-black/[.05] dark:bg-white/[.08]"
                }`}
              >
                {m.content || "…"}
              </p>
              {m.role === "assistant" && !m.pending && m.content && (
                <div className="flex gap-3 text-sm">
                  <button type="button" disabled={feedbackDone} onClick={() => handleFeedback(m, true)} aria-label={t("helpful")} className="disabled:opacity-40">
                    👍
                  </button>
                  <button type="button" disabled={feedbackDone} onClick={() => handleFeedback(m, false)} aria-label={t("notHelpful")} className="disabled:opacity-40">
                    👎
                  </button>
                  <button type="button" onClick={() => explainDifferently(m)} className="underline">
                    {t("explainDifferently")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2">
        <input
          data-testid="teacher-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("askTeacher")}
          className="flex-1 rounded-full border border-black/[.1] px-4 py-2 dark:border-white/[.15] dark:bg-black"
        />
        <button
          type="submit"
          data-testid="teacher-send"
          disabled={sending || !input.trim()}
          className="rounded-full bg-foreground px-5 py-2 text-background disabled:opacity-40"
        >
          {t("send")}
        </button>
      </form>
    </div>
  );
}
