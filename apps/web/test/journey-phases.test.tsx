import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import it_ from "../messages/it.json";
import { JourneyPhases, type JourneyPhase } from "../src/components/JourneyPhases";

afterEach(() => cleanup());

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="it" messages={it_}>{ui}</NextIntlClientProvider>);

const phases: JourneyPhase[] = [
  { key: "subject", state: "done", href: "/it/app/journey/subject" },
  { key: "assessment", state: "current", href: "/it/app/diagnostic" },
  { key: "path", state: "upcoming" },
  { key: "final", state: "locked" },
  { key: "certificate", state: "locked" }
];

describe("JourneyPhases", () => {
  it("renders done and current phases as links to their href, with the right state chips", () => {
    wrap(<JourneyPhases phases={phases} />);

    const doneLink = screen.getByRole("link", { name: new RegExp(it_.journey.phaseSubject) });
    expect(doneLink).toHaveAttribute("href", "/it/app/journey/subject");
    const currentLink = screen.getByRole("link", { name: new RegExp(it_.journey.phaseAssessment) });
    expect(currentLink).toHaveAttribute("href", "/it/app/diagnostic");

    expect(screen.getByText(it_.journey.stateDone)).toBeInTheDocument();
    expect(screen.getByText(it_.journey.stateCurrent)).toBeInTheDocument();
  });

  it("renders upcoming and locked phases as non-links with aria-disabled", () => {
    wrap(<JourneyPhases phases={phases} />);

    expect(screen.queryByRole("link", { name: new RegExp(it_.journey.phasePath) })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: new RegExp(it_.journey.phaseFinal) })).not.toBeInTheDocument();

    expect(screen.getByText(it_.journey.phasePath).closest("div")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(it_.journey.phaseFinal).closest("div")).toHaveAttribute("aria-disabled", "true");

    expect(screen.getByText(it_.journey.stateUpcoming)).toBeInTheDocument();
    expect(screen.getAllByText(it_.journey.stateLocked)).toHaveLength(2);
  });
});
