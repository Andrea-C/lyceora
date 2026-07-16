import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ImpersonationBanner } from "../src/components/ImpersonationBanner";

describe("ImpersonationBanner", () => {
  it("renders the label and posts the stop button to the route handler", () => {
    render(<ImpersonationBanner label="Stai impersonando parent@x.it" stopLabel="Torna admin" locale="it" />);

    expect(screen.getByText("Stai impersonando parent@x.it")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Torna admin" });
    expect(button).toHaveAttribute("type", "submit");

    // No client JS involved (see the component's own note): a plain form POST is what actually
    // clears the httpOnly lyceora_profile cookie and swaps the session back to the admin's.
    const form = button.closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/admin/stop-impersonating?locale=it");
  });
});
