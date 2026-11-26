import { resolve } from "node:path";
import type { Server } from "node:http";
import { context, type BuildContext } from "esbuild";
import { startService, type AppService } from "./server/service.js";
import { startServer } from "./server/framework/server.js";
import { routes } from "./server/routes.js";

/** Starts one listener for the API and page, and watches the TypeScript bundle.
 * Unusable saved data prevents startup before the listener or watcher is created.
 */
async function main(): Promise<void> {
	let bundler: BuildContext | undefined;
	try {
		const port: number = Number(process.env.PORT ?? 3000);
		if (!Number.isInteger(port) || port < 0 || port > 65535) {
			throw new Error("Invalid PORT");
		}
		const service: AppService = await startService(
			process.env.INVENTORY_FILE ?? "data/inventory.json",
		);
		bundler = await context({
			entryPoints: ["src/browser.ts"],
			bundle: true,
			outfile: "public/app.js",
			sourcemap: true,
			format: "iife",
			target: "es2022",
			logLevel: "warning",
		});
		await bundler.rebuild();
		await bundler.watch();
		const server: Server = startServer(routes, service, port, {
			staticDir: resolve("public"),
		});
		const stop = async (): Promise<void> => {
			server.close();
			server.closeAllConnections();
			await bundler?.dispose();
		};
		process.once("SIGINT", (): void => {
			void stop();
		});
		process.once("SIGTERM", (): void => {
			void stop();
		});
		server.once("error", (error: Error): void => {
			console.error("Server failed:", error.message);
			process.exitCode = 1;
			void stop();
		});
		server.on("listening", (): void => {
			const address = server.address();
			const activePort: number =
				typeof address === "object" && address !== null ? address.port : port;
			console.log("Stockroom: http://localhost:" + activePort + "/");
			console.log(
				"Watching browser TypeScript. Reload the page after editing.",
			);
		});
	} catch (error) {
		await bundler?.dispose();
		console.error("Startup failed:", String(error));
		process.exitCode = 1;
	}
}

void main();
