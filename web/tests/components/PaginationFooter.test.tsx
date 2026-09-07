import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaginationFooter } from "@/components/PaginationFooter";

describe("PaginationFooter", () => {
  test("renders the label and calls onPrev/onNext", async () => {
    const user = userEvent.setup();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <PaginationFooter
        label={<p>Showing 1–10 of 12</p>}
        page={1}
        totalPages={2}
        onPrev={onPrev}
        onNext={onNext}
      />
    );

    expect(screen.getByText("Showing 1–10 of 12")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Prev" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next →" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next →" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();
  });

  test("hides Prev/Next/Page X of Y — but keeps the label — at a single page", () => {
    render(
      <PaginationFooter
        label={<p>Showing 1–3 of 3</p>}
        page={1}
        totalPages={1}
        onPrev={() => {}}
        onNext={() => {}}
      />
    );

    expect(screen.getByText("Showing 1–3 of 3")).toBeInTheDocument();
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
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
        onPrev={() => {}}
        onNext={() => {}}
      />
    );

    expect(screen.queryByText("Showing 1–3 of 3")).not.toBeInTheDocument();
  });

  test("Prev disabled on the first page, Next disabled on the last", () => {
    const { rerender } = render(
      <PaginationFooter label={<p>x</p>} page={2} totalPages={3} onPrev={() => {}} onNext={() => {}} />
    );
    expect(screen.getByRole("button", { name: "← Prev" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Next →" })).not.toBeDisabled();

    rerender(<PaginationFooter label={<p>x</p>} page={3} totalPages={3} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
  });
});
