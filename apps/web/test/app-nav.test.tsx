import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import it_ from "../messages/it.json";
import { AppNav } from "../src/components/AppNav";

// AppNav renders LocaleSwitch (a "use client" component that calls next/navigation's
// usePathname/useRouter), and outside a real Next app-router mount those hooks have no
// AppRouterContext to read from — useRouter() throws "invariant expected app router to be
// mounted". Stubbing the module lets AppNav render standalone in RTL like every other
// component test here.
vi.mock("next/navigation", () => ({
  usePathname: () => "/it/app",
  useRouter: () => ({ push: vi.fn() })
}));

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="it" messages={it_}>{ui}</NextIntlClientProvider>);

describe("AppNav", () => {
  it("shows Dashboard only for admins and the child chip only with an active profile", () => {
    const logout = async () => {};
    wrap(<AppNav locale="it" isAdminUser={false} activeProfileName={null} logoutAction={logout} />);
    expect(screen.queryByText(it_.nav.dashboard)).toBeNull();
    expect(screen.getByText(it_.nav.parent)).toBeInTheDocument();

    wrap(<AppNav locale="it" isAdminUser={true} activeProfileName="Test Studente" logoutAction={logout} />);
    expect(screen.getByText(it_.nav.dashboard)).toBeInTheDocument();
    expect(screen.getByText("Test Studente")).toBeInTheDocument();
    expect(screen.getByText(it_.nav.home)).toBeInTheDocument();
  });
});
