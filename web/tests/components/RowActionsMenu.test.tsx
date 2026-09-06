import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RowActionsMenu } from "@/components/RowActionsMenu";

describe("RowActionsMenu", () => {
  test("renders nothing for an empty item list", () => {
    const { container } = render(<RowActionsMenu items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("opens on click, shows every item, and closes after selecting one", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<RowActionsMenu items={[{ label: "Edit", onClick }]} />);

    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Edit")).toBeInTheDocument();

    await user.click(screen.getByText("Edit"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  test("closes on an outside click without firing any item", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <div>
        <button type="button">Outside</button>
        <RowActionsMenu items={[{ label: "Delete", onClick }]} />
      </div>
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Delete")).toBeInTheDocument();

    await user.click(screen.getByText("Outside"));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  test("a disabled item doesn't fire its callback", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<RowActionsMenu items={[{ label: "Deactivate", onClick, disabled: true }]} />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByText("Deactivate"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("keeping only one menu open at a time across multiple instances, with no shared state", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <RowActionsMenu items={[{ label: "Row 1 action", onClick: () => {} }]} />
        <RowActionsMenu items={[{ label: "Row 2 action", onClick: () => {} }]} />
      </div>
    );

    const [trigger1, trigger2] = screen.getAllByRole("button", { name: "More actions" });
    await user.click(trigger1);
    expect(screen.getByText("Row 1 action")).toBeInTheDocument();

    await user.click(trigger2);
    expect(screen.queryByText("Row 1 action")).not.toBeInTheDocument();
    expect(screen.getByText("Row 2 action")).toBeInTheDocument();
  });
});
