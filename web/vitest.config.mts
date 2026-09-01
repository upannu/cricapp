import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "api",
          environment: "node",
          include: ["tests/api/**/*.test.ts"],
          setupFiles: ["./tests/setup/api.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["./tests/setup/jsdom.ts"],
        },
      },
    ],
  },
});
