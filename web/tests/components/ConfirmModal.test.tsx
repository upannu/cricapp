import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmModal } from "@/components/ConfirmModal";

describe("ConfirmModal", () => {
  test("renders the title and message, and fires onConfirm/onCancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmModal
        icon={<span />}
        iconBg="bg-amber/20"
        title="Deactivate Coach?"
        message="They'll no longer be assignable to new players."
        confirmLabel="Yes, Deactivate"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText("Deactivate Coach?")).toBeInTheDocument();
    expect(screen.getByText("They'll no longer be assignable to new players.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Yes, Deactivate" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("clicking the backdrop cancels", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    const { container } = render(
      <ConfirmModal
        icon={<span />}
        iconBg="bg-amber/20"
        title="Deactivate Coach?"
        message="Are you sure?"
        confirmLabel="Yes"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );

    await user.click(container.querySelector(".bg-black\\/70")!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("shows the busy label and disables both buttons while loading", () => {
    render(
      <ConfirmModal
        icon={<span />}
        iconBg="bg-amber/20"
        title="Deactivate Coach?"
        message="Are you sure?"
        confirmLabel="Yes, Deactivate"
        confirmBusyLabel="Deactivating…"
        loading
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    const confirmButton = screen.getByRole("button", { name: "Deactivating…" });
    expect(confirmButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
