import type { Route } from "./framework/router.js";
import type { AppService } from "./service.js";
import {
	addProduct,
	removeProduct,
	listProducts,
	lowStock,
} from "./handlers.js";
export const routes: Route<AppService>[] = [
	{ method: "POST", pattern: "/products", handler: addProduct },
	{ method: "GET", pattern: "/products", handler: listProducts },
	{ method: "GET", pattern: "/products/low-stock", handler: lowStock },
	{ method: "DELETE", pattern: "/products/:id", handler: removeProduct },
];
