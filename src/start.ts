import { startService } from "./server/service.js";
import { startServer } from "./server/framework/server.js";
import { routes } from "./server/routes.js";
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535)
	throw new Error("Invalid PORT");
try {
	const service = await startService(
		process.env.INVENTORY_FILE ?? "data/inventory.json",
	);
	const server = startServer(routes, service, port);
	server.on("listening", () =>
		console.log("Inventory backend listening on", server.address()),
	);
	server.on("error", (error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
} catch (error) {
	console.error("Startup failed:", String(error));
	process.exitCode = 1;
}

