import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "@/components/Sparkline";

describe("Sparkline", () => {
  test("renders nothing for an empty values array", () => {
    const { container } = render(<Sparkline values={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders one point per value", () => {
    const { container } = render(<Sparkline values={[1, 5, 3]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(container.querySelector("polyline")).toBeInTheDocument();
  });

  test("widens the SVG for more data points", () => {
    const { container: small } = render(<Sparkline values={[1, 2]} />);
    const { container: large } = render(<Sparkline values={[1, 2, 3, 4, 5, 6, 7, 8]} />);

    const smallWidth = Number(small.querySelector("svg")!.getAttribute("width"));
    const largeWidth = Number(large.querySelector("svg")!.getAttribute("width"));
    expect(largeWidth).toBeGreaterThan(smallWidth);
  });
});
