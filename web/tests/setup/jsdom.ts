import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's automatic afterEach(cleanup) only self-registers when it detects a
// global test framework hook; this project imports `test`/`afterEach`
// explicitly rather than using Vitest's `globals: true`, so register it here.
afterEach(cleanup);

// jsdom doesn't implement scrolling — components that call it (e.g. an
// auto-scroll-to-bottom chat log, or a form that scrolls itself into view when
// opened) throw "scrollTo/scrollIntoView is not a function" without this. A
// no-op is correct here: layout/scroll position isn't something a jsdom test
// can meaningfully assert on anyway.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
