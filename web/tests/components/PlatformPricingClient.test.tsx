import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlatformPricingClient } from "@/components/PlatformPricingClient";
import { makeAuthUser } from "../mocks/fixtures";

const { fetchPlatformSettings } = vi.hoisted(() => ({ fetchPlatformSettings: vi.fn() }));
vi.mock("@/lib/db", () => ({ fetchPlatformSettings }));

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth }));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const originalFetch = global.fetch;

describe("PlatformPricingClient", () => {
  test("renders the current prices", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlatformSettings.mockResolvedValue({ playerProPriceAud: 9.99, coachProPriceAud: 29.99 });

    render(<PlatformPricingClient />);

    expect(await screen.findByDisplayValue("9.99")).toBeInTheDocument();
    expect(screen.getByDisplayValue("29.99")).toBeInTheDocument();
  });

  test("redirects a non-platform-admin away", async () => {
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "coach", coachId: "c1" }) });
    fetchPlatformSettings.mockResolvedValue({ playerProPriceAud: 9.99, coachProPriceAud: 29.99 });

    render(<PlatformPricingClient />);

    expect(replace).toHaveBeenCalledWith("/players");
  });

  test("saving posts the new prices and shows a confirmation", async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: makeAuthUser({ role: "platform_admin" }) });
    fetchPlatformSettings.mockResolvedValue({ playerProPriceAud: 9.99, coachProPriceAud: 29.99 });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as typeof fetch;

    render(<PlatformPricingClient />);
    const playerProInput = await screen.findByDisplayValue("9.99");
    await user.clear(playerProInput);
    await user.type(playerProInput, "14.99");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("button", { name: "✓ Saved" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/platform-settings/update",
      expect.objectContaining({ body: JSON.stringify({ playerProPriceAud: 14.99, coachProPriceAud: 29.99 }) }),
    );
    global.fetch = originalFetch;
  });
});
