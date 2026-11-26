import type { Route } from "./framework/router.js";
import type { AppService } from "./service.js";
import {
	addProduct,
	removeProduct,
	listProducts,
	lowStock,
	adjustStock,
	updatePrice,
} from "./handlers.js";
export const routes: Route<AppService>[] = [
	{ method: "PUT", pattern: "/products/:id/stock", handler: adjustStock },
	{ method: "PUT", pattern: "/products/:id/price", handler: updatePrice },
	{ method: "POST", pattern: "/products", handler: addProduct },
	{ method: "GET", pattern: "/products", handler: listProducts },
	{ method: "GET", pattern: "/products/low-stock", handler: lowStock },
	{ method: "DELETE", pattern: "/products/:id", handler: removeProduct },
];
