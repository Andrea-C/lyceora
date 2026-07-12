import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BadgeCase } from "../src/components/BadgeCase";

describe("BadgeCase", () => {
  it("renders earned badges full-color and unearned muted, names localized", () => {
    render(<BadgeCase earnedIds={["primi-passi"]} locale="it" />);
    const earned = screen.getByText("Primi passi").closest("li")!;
    expect(earned.className).not.toMatch(/opacity-40/);
    const unearned = screen.getByText("Tre di fila").closest("li")!;
    expect(unearned.className).toMatch(/opacity-40/);
  });
});
