import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import it_ from "../messages/it.json";
import { LessonBrowser } from "../src/components/LessonBrowser";
import type { ResourceItem } from "../src/components/ResourceList";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="it" messages={it_}>{ui}</NextIntlClientProvider>);

const resources: ResourceItem[] = [
  { id: "r1", title: "Video IT", provider: "Khan Academy", lang: "it", url: "https://example.com/it", kind: "video", suggested: true },
  { id: "r2", title: "Video EN", provider: "Khan Academy", lang: "en", url: "https://example.com/en", kind: "video", suggested: false }
];

function fetchMock() {
  return vi.fn(async () => new Response(null, { status: 204 }));
}

describe("LessonBrowser", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock());
  });

  it("fires exactly one topic-view POST on mount, even across a rerender", () => {
    const { rerender } = wrap(<LessonBrowser profileId="p1" topicId="t1" locale="it" resources={resources} />);
    rerender(
      <NextIntlClientProvider locale="it" messages={it_}>
        <LessonBrowser profileId="p1" topicId="t1" locale="it" resources={resources} />
      </NextIntlClientProvider>
    );

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const topicOnlyCalls = calls.filter(([, init]: [string, RequestInit]) => {
      const body = JSON.parse(init!.body as string);
      return body.resourceId === undefined;
    });
    expect(topicOnlyCalls).toHaveLength(1);
    expect(JSON.parse(topicOnlyCalls[0][1].body as string)).toEqual({ profileId: "p1", topicId: "t1" });
  });

  it("defaults to the local-language filter, hiding the other-language resource until 'Tutte' is chosen", () => {
    wrap(<LessonBrowser profileId="p1" topicId="t1" locale="it" resources={resources} />);
    expect(screen.getByText("Video IT")).toBeInTheDocument();
    expect(screen.queryByText("Video EN")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: it_.browse.langAll }));
    expect(screen.getByText("Video EN")).toBeInTheDocument();
  });

  it("shows the empty-language message when the filtered list is empty", () => {
    wrap(<LessonBrowser profileId="p1" topicId="t1" locale="it" resources={[resources[1]]} />);
    expect(screen.getByText(it_.browse.langEmpty)).toBeInTheDocument();
  });

  it("fires a resource-view POST and adds the Visto chip when a resource is clicked", () => {
    wrap(<LessonBrowser profileId="p1" topicId="t1" locale="it" resources={resources} />);
    const link = screen.getByRole("link", { name: /^Video IT/ });
    fireEvent.click(link);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const resourceCalls = calls.filter(([, init]: [string, RequestInit]) => JSON.parse(init!.body as string).resourceId === "r1");
    expect(resourceCalls).toHaveLength(1);
    expect(screen.getByText(it_.session.viewed)).toBeInTheDocument();
  });
});
