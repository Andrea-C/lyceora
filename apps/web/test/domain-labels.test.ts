import { describe, it, expect } from "vitest";
import { domainLabel } from "../src/server/domain-labels";
import it_ from "../messages/it.json";
import en_ from "../messages/en.json";

function translatorFor(messages: { domains: Record<string, string> }) {
  return (key: string) => messages.domains[key] ?? key;
}

describe("domainLabel", () => {
  it("translates known taxonomy domains to natural Italian for the dashboard", () => {
    const t = translatorFor(it_);
    expect(domainLabel("Powers & Roots", t)).toBe("Potenze e radici");
    expect(domainLabel("Powers & Roots", t)).not.toBe("Powers & Roots");
    expect(domainLabel("Number Theory", t)).toBe("Teoria dei numeri");
    expect(domainLabel("Fractions", t)).toBe("Frazioni");
    expect(domainLabel("Measurement", t)).toBe("Misure");
    expect(domainLabel("Coordinate Geometry", t)).toBe("Geometria analitica");
    expect(domainLabel("Geometry", t)).toBe("Geometria");
  });

  it("falls back to the raw domain string for a domain with no mapped key, rather than crashing", () => {
    const t = translatorFor(it_);
    expect(domainLabel("Algebra", t)).toBe("Algebra");
  });

  it("keeps English labels in English", () => {
    const t = translatorFor(en_);
    expect(domainLabel("Powers & Roots", t)).toBe("Powers & Roots");
  });
});
