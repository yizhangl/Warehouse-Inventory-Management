import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/server/framework/**", "src/start.ts", "src/browser.ts", "src/dashboard.ts", "src/client/**", "src/view/**"],
			reporter: ["text", "html"],
			thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 },
		},
	},
});
