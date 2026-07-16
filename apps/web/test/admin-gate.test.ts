import { describe, it, expect } from "vitest";
import { isAdmin } from "../src/lib/session";

describe("admin gate", () => {
  it("isAdmin accepts only the admin role", () => {
    expect(isAdmin({ role: "admin" })).toBe(true);
    expect(isAdmin({ role: "parent" })).toBe(false);
    expect(isAdmin({ role: null })).toBe(false);
    expect(isAdmin({})).toBe(false);
  });
});
