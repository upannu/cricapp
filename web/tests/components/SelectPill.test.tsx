import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectPill } from "@/components/SelectPill";

const options = [
  { value: "none", label: "Group by" },
  { value: "age", label: "Age Group" },
  { value: "level", label: "Playing Level" },
];

describe("SelectPill", () => {
  test("trigger shows the selected option's label, findable by its fixed aria-label", () => {
    render(<SelectPill value="age" options={options} onChange={() => {}} ariaLabel="Group by" />);
    const trigger = screen.getByRole("button", { name: "Group by" });
    expect(trigger).toHaveTextContent("Age Group");
  });

  test("opens on click, shows every option, and closes after selecting one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectPill value="none" options={options} onChange={onChange} ariaLabel="Group by" />);

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Group by" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await user.click(screen.getByRole("option", { name: "Age Group" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("age");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  test("marks the currently-selected option with a checkmark", async () => {
    const user = userEvent.setup();
    render(<SelectPill value="level" options={options} onChange={() => {}} ariaLabel="Group by" />);
    await user.click(screen.getByRole("button", { name: "Group by" }));

    // The checkmark is aria-hidden, so it doesn't affect the option's accessible name — only
    // its visible textContent, which is exactly why PlayersClient's own tests assert against
    // textContent ("Group by✓") rather than an accessible-name query for this same element.
    const selected = screen.getByRole("option", { name: "Playing Level" });
    expect(selected).toHaveTextContent("Playing Level✓");
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Age Group" })).toHaveAttribute("aria-selected", "false");
  });

  test("closes on an outside click without firing onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <button type="button">Outside</button>
        <SelectPill value="none" options={options} onChange={onChange} ariaLabel="Group by" />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Group by" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await user.click(screen.getByText("Outside"));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("active highlights the closed trigger as having a filter applied, separately from the open state", () => {
    const { rerender } = render(<SelectPill value="none" options={options} onChange={() => {}} ariaLabel="Group by" />);
    const trigger = screen.getByRole("button", { name: "Group by" });
    // Not selected, not applied — the plain default styling.
    expect(trigger.className).not.toContain("border-pace-green");

    rerender(<SelectPill value="age" options={options} onChange={() => {}} ariaLabel="Group by" active />);
    expect(trigger.className).toContain("border-pace-green/50");
  });

  test("keeping only one popover open at a time across multiple instances, with no shared state", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SelectPill value="none" options={options} onChange={() => {}} ariaLabel="Group by" />
        <SelectPill value="none" options={options} onChange={() => {}} ariaLabel="Sort by" />
      </div>
    );

    const [trigger1, trigger2] = [
      screen.getByRole("button", { name: "Group by" }),
      screen.getByRole("button", { name: "Sort by" }),
    ];
    await user.click(trigger1);
    expect(screen.getAllByRole("option")).toHaveLength(3);

    await user.click(trigger2);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(trigger1).toHaveAttribute("aria-expanded", "false");
  });
});
