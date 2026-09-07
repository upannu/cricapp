import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaginationFooter } from "@/components/PaginationFooter";

describe("PaginationFooter", () => {
  test("renders the label and calls onPageChange for Prev/Next", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <PaginationFooter
        label={<p>Showing 1–10 of 12</p>}
        page={1}
        totalPages={2}
        onPageChange={onPageChange}
      />
    );

    expect(screen.getByText("Showing 1–10 of 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next →" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next →" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  test("hides the whole pagination nav — but keeps the label — at a single page", () => {
    render(
      <PaginationFooter
        label={<p>Showing 1–3 of 3</p>}
        page={1}
        totalPages={1}
        onPageChange={() => {}}
      />
    );

    expect(screen.getByText("Showing 1–3 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "← Prev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next →" })).not.toBeInTheDocument();
  });

  test("show=false renders nothing at all, label included", () => {
    render(
      <PaginationFooter
        show={false}
        label={<p>Showing 1–3 of 3</p>}
        page={1}
        totalPages={1}
        onPageChange={() => {}}
      />
    );

    expect(screen.queryByText("Showing 1–3 of 3")).not.toBeInTheDocument();
  });

  test("Prev disabled on the first page, Next disabled on the last", () => {
    const { rerender } = render(
      <PaginationFooter label={<p>x</p>} page={2} totalPages={3} onPageChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: "← Prev" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Next →" })).not.toBeDisabled();

    rerender(<PaginationFooter label={<p>x</p>} page={3} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
  });

  test("shows a numbered button per page below the truncation threshold, and clicking one jumps straight there", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<PaginationFooter label={<p>x</p>} page={1} totalPages={4} onPageChange={onPageChange} />);

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByRole("button", { name: String(n) })).toBeInTheDocument();
    }
    expect(nav).not.toHaveTextContent("…");

    await user.click(screen.getByRole("button", { name: "3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  test("marks the current page with aria-current, and collapses a large page count with an ellipsis", () => {
    render(<PaginationFooter label={<p>x</p>} page={10} totalPages={20} onPageChange={() => {}} />);

    const current = screen.getByRole("button", { name: "10" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "1" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("navigation")).toHaveTextContent("…");
    // Far pages collapsed away shouldn't render as clickable buttons at all.
    expect(screen.queryByRole("button", { name: "15" })).not.toBeInTheDocument();
  });

  test("the rows-per-page selector is opt-in — omitted unless both itemsPerPage and onItemsPerPageChange are given", async () => {
    const user = userEvent.setup();
    const onItemsPerPageChange = vi.fn();
    const { rerender } = render(<PaginationFooter label={<p>x</p>} page={1} totalPages={2} onPageChange={() => {}} />);
    expect(screen.queryByText("Rows per page")).not.toBeInTheDocument();

    rerender(
      <PaginationFooter
        label={<p>x</p>} page={1} totalPages={2} onPageChange={() => {}}
        itemsPerPage={10} onItemsPerPageChange={onItemsPerPageChange}
      />
    );
    expect(screen.getByText("Rows per page")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Rows per page"), "50");
    expect(onItemsPerPageChange).toHaveBeenCalledWith(50);
  });
});
