import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import it_ from "../messages/it.json";
import { ExerciseCard } from "../src/components/ExerciseCard";

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="it" messages={it_}>{ui}</NextIntlClientProvider>);

describe("ExerciseCard", () => {
  it("renders mcq choices and submits the chosen index", () => {
    const onSubmit = vi.fn();
    // exercise arrives redacted from the server (no correctAnswer/explanation) — grading now
    // happens server-side, so ExerciseCard's props never carry those fields.
    wrap(<ExerciseCard exercise={{ id: "e1", kind: "mcq", prompt: "2^3?", choices: ["6", "8"], difficulty: 2 }} onSubmit={onSubmit} state={{ phase: "answering" }} />);
    fireEvent.click(screen.getByText("8"));
    fireEvent.click(screen.getByRole("button", { name: "Controlla" }));
    expect(onSubmit).toHaveBeenCalledWith("1");
  });
  it("shows warm feedback with the explanation when wrong", () => {
    // feedback (correct + explanation text) is driven externally by the page, from POST
    // /api/activity's response — never computed locally.
    wrap(<ExerciseCard exercise={{ id: "e1", kind: "numeric", prompt: "?", difficulty: 2 }} onSubmit={() => {}} state={{ phase: "feedback", correct: false, feedback: "2·2·2 = 8" }} />);
    expect(screen.getByText(/Non ancora/)).toBeInTheDocument();
    expect(screen.getByText(/2·2·2 = 8/)).toBeInTheDocument();
  });
});
