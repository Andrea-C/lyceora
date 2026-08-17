import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import it_ from "../messages/it.json";
import { ResourceList, type ResourceItem } from "../src/components/ResourceList";

// this suite renders once per test, unlike exercise-card.test.tsx's single multi-render test —
// explicit cleanup keeps each test's queries scoped to its own render.
afterEach(() => cleanup());

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="it" messages={it_}>{ui}</NextIntlClientProvider>);

const mixedResources: ResourceItem[] = [
  { title: "Frazioni in video", provider: "Khan Academy", lang: "it", url: "https://example.com/video", kind: "video", summary: "Una breve introduzione alle frazioni." },
  { title: "Scheda di esercizi", provider: "RaiScuola", lang: "it", url: "https://example.com/exercises-1", kind: "exercises", summary: "Dieci esercizi guidati." },
  { title: "Esercizi senza riassunto", provider: "RaiScuola", lang: "it", url: "https://example.com/exercises-2", kind: "exercises" },
  { title: "Verifica finale", provider: "Redooc", lang: "it", url: "https://example.com/assessment", kind: "assessment", summary: "Mettiti alla prova con 5 domande." }
];

describe("ResourceList", () => {
  it("groups mixed resources by kind, in video -> exercises -> assessment order, with summaries", () => {
    wrap(<ResourceList resources={mixedResources} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Video lezioni", "Esercizi e schede", "Mettiti alla prova"]);

    // summary text is visible for resources that have one
    expect(screen.getByText("Una breve introduzione alle frazioni.")).toBeInTheDocument();
    expect(screen.getByText("Dieci esercizi guidati.")).toBeInTheDocument();
    expect(screen.getByText("Mettiti alla prova con 5 domande.")).toBeInTheDocument();

    // the summary-less card still renders its title, without a summary node
    const noSummaryLink = screen.getByRole("link", { name: /^Esercizi senza riassunto/ });
    expect(noSummaryLink).toBeInTheDocument();
    expect(noSummaryLink.querySelector("span.text-sm")).toBeNull();
  });

  it("omits empty groups — only-exercises fixture has no video header", () => {
    wrap(
      <ResourceList
        resources={[{ title: "Solo esercizi", provider: "RaiScuola", lang: "it", url: "https://example.com/only-exercises", kind: "exercises" }]}
      />
    );

    expect(screen.queryByText("Video lezioni")).not.toBeInTheDocument();
    expect(screen.getByText("Esercizi e schede")).toBeInTheDocument();
  });

  it("shows the no-resources message and no headers when there are no resources", () => {
    wrap(<ResourceList resources={[]} />);

    expect(screen.getByText("Nessun materiale per questo argomento, per ora.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("renders each resource as a new-tab, no-referrer link to the correct url", () => {
    wrap(<ResourceList resources={mixedResources} />);

    const link = screen.getByRole("link", { name: /^Frazioni in video/ });
    expect(link).toHaveAttribute("href", "https://example.com/video");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("shows the suggested chip when true, the alternative chip when false, and neither when undefined", () => {
    wrap(
      <ResourceList
        resources={[
          { title: "Consigliato", provider: "Khan Academy", lang: "it", url: "https://example.com/sug", kind: "video", suggested: true },
          { title: "In alternativa", provider: "Khan Academy", lang: "it", url: "https://example.com/alt", kind: "video", suggested: false },
          { title: "Neutro", provider: "Khan Academy", lang: "it", url: "https://example.com/neutral", kind: "video" }
        ]}
      />
    );
    expect(screen.getByText(it_.session.suggested)).toBeInTheDocument();
    expect(screen.getByText(it_.session.alternative)).toBeInTheDocument();
    expect(screen.queryAllByText(it_.session.suggested)).toHaveLength(1);
  });

  it("shows the viewed chip when viewed is true", () => {
    wrap(
      <ResourceList resources={[{ title: "Già visto", provider: "Khan Academy", lang: "it", url: "https://example.com/viewed", kind: "video", viewed: true }]} />
    );
    expect(screen.getByText(it_.session.viewed)).toBeInTheDocument();
  });

  it("fires onOpen with the clicked item without blocking the default link navigation", () => {
    const onOpen = vi.fn();
    wrap(<ResourceList resources={mixedResources} onOpen={onOpen} />);
    const link = screen.getByRole("link", { name: /^Frazioni in video/ });
    const event = fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith(mixedResources[0]);
    expect(event).toBe(true); // fireEvent.click returns false only if preventDefault was called
  });

  it("renders with no chips when used the way session-client does (no new props)", () => {
    wrap(<ResourceList resources={mixedResources} />);
    expect(screen.queryByText(it_.session.suggested)).not.toBeInTheDocument();
    expect(screen.queryByText(it_.session.alternative)).not.toBeInTheDocument();
    expect(screen.queryByText(it_.session.viewed)).not.toBeInTheDocument();
  });
});
