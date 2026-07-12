import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ActivityChart } from "../src/components/ActivityChart";

describe("ActivityChart", () => {
  it("renders one bar per day and marks goal-met days", () => {
    const days = [
      { date: "2026-07-10", xp: 10, goal: 30 },
      { date: "2026-07-11", xp: 35, goal: 30 }
    ];
    const { container } = render(<ActivityChart days={days} />);
    expect(container.querySelectorAll("rect")).toHaveLength(2);
    expect(container.querySelectorAll('[data-goal-met="true"]')).toHaveLength(1);
  });
});
