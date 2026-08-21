import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL's automatic afterEach(cleanup) only self-registers when it detects a
// global test framework hook; this project imports `test`/`afterEach`
// explicitly rather than using Vitest's `globals: true`, so register it here.
afterEach(cleanup);
