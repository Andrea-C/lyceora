import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import it_ from "../messages/it.json";
import { TopicMap, type TopicMapGroup } from "../src/components/TopicMap";

afterEach(() => cleanup());

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="it" messages={it_}>{ui}</NextIntlClientProvider>);

const groups: TopicMapGroup[] = [
  {
    domain: "Frazioni",
    mastered: 1,
    total: 3,
    topics: [
      { id: "t1", name: "Frazioni equivalenti", status: "mastered", viewed: false, completed: false, href: "/it/app/browse/t1" },
      { id: "t2", name: "Somma di frazioni", status: "needsReview", viewed: true, completed: false, href: "/it/app/browse/t2" },
      { id: "t3", name: "Frazioni improprie", status: "unknown", viewed: false, completed: true, href: "/it/app/browse/t3" }
    ]
  }
];

describe("TopicMap", () => {
  it("renders a mastered topic as a link with reduced opacity and the mastered chip", () => {
    wrap(<TopicMap groups={groups} />);
    const link = screen.getByRole("link", { name: /^Frazioni equivalenti/ });
    expect(link).toHaveAttribute("href", "/it/app/browse/t1");
    expect(link.className).toContain("opacity-60");
    expect(screen.getByText(it_.browse.statusMastered)).toBeInTheDocument();
  });

  it("shows the needsReview chip together with the viewed chip", () => {
    wrap(<TopicMap groups={groups} />);
    expect(screen.getByText(it_.browse.statusNeedsReview)).toBeInTheDocument();
    expect(screen.getByText(it_.session.viewed)).toBeInTheDocument();
  });

  it("shows the doneInSession chip for a completed topic, and the toLearn chip for unknown status", () => {
    wrap(<TopicMap groups={groups} />);
    expect(screen.getByText(new RegExp(it_.browse.doneInSession))).toBeInTheDocument();
    expect(screen.getByText(it_.browse.statusToLearn)).toBeInTheDocument();
  });
});
