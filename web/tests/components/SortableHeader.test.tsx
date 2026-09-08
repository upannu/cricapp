import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortableHeader } from "@/components/SortableHeader";

describe("SortableHeader", () => {
  test("clicking the label sorts by its own key", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <table><thead><tr>
        <SortableHeader label="Name" sortKey="name" activeKey="name" direction="asc" onSort={onSort} />
      </tr></thead></table>
    );

    await user.click(screen.getByRole("button", { name: /Name/ }));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  test("shows the sort direction only for the active column", () => {
    render(
      <table><thead><tr>
        <SortableHeader label="Name" sortKey="name" activeKey="name" direction="desc" onSort={() => {}} />
        <SortableHeader label="Coach" sortKey="coach" activeKey="name" direction="desc" onSort={() => {}} />
      </tr></thead></table>
    );

    expect(screen.getByRole("button", { name: /Name/ })).toHaveTextContent("▼");
    expect(screen.getByRole("button", { name: /Coach/ })).toHaveTextContent("↕");
  });

  test("renders filterSlot content next to the sort button, and nothing extra when omitted", () => {
    const { rerender } = render(
      <table><thead><tr>
        <SortableHeader
          label="Coach" sortKey="coach" activeKey="name" direction="asc" onSort={() => {}}
          filterSlot={<button type="button">Funnel</button>}
        />
      </tr></thead></table>
    );
    expect(screen.getByRole("button", { name: "Funnel" })).toBeInTheDocument();

    rerender(
      <table><thead><tr>
        <SortableHeader label="Coach" sortKey="coach" activeKey="name" direction="asc" onSort={() => {}} />
      </tr></thead></table>
    );
    expect(screen.queryByRole("button", { name: "Funnel" })).not.toBeInTheDocument();
  });

  // Tailwind's preflight resets a <button>'s own text-transform to `none`, which silently defeats
  // an `uppercase` utility inherited from the <th> around it — confirmed via a live computed-style
  // check against a real page (the button rendered `none` despite its <th> ancestor being
  // `uppercase`). The fix repeats `uppercase` directly on the button; this locks that in structurally
  // since jsdom doesn't apply Tailwind's real cascade/layers to make the visual regression itself
  // assertable here.
  test("repeats uppercase directly on the button, not just the inherited-from <th> — a Tailwind reset defeats inheritance otherwise", () => {
    render(
      <table><thead><tr>
        <SortableHeader label="Coach" sortKey="coach" activeKey="name" direction="asc" onSort={() => {}} />
      </tr></thead></table>
    );
    expect(screen.getByRole("button", { name: /Coach/ })).toHaveClass("uppercase");
  });
});
