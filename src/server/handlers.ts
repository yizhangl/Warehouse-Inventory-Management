import { parseProduct, type ProductData } from "../product.js";
import type { LowStockReport } from "../inventory.js";
import type { Result } from "../result.js";
import {
	fail,
	respond,
	type HttpRequest,
	type HttpResponse,
} from "./framework/router.js";
import type { AppService } from "./service.js";

/** POST /products. Validates the unknown body; successful additions are persisted.
 * Returns 400 for invalid product data, 409 for duplicates, or 500 for save failure. */
export function addProduct(
	request: HttpRequest,
	service: AppService,
): HttpResponse | Promise<HttpResponse> {
	try {
		const product: ProductData = parseProduct(request.body).toJSON();
		return service.change({ kind: "add", product });
	} catch (error) {
		// parseProduct throws Error instances for invalid data.
		return fail(400, (error as Error).message);
	}
}

/** DELETE /products/:id. Returns the deleted product or a 404/500 error response. */
export function removeProduct(
	request: HttpRequest,
	service: AppService,
): Promise<HttpResponse> {
	return service.change({ kind: "remove", id: request.params.id });
}

/** GET /products. Defaults to ascending; invalid direction returns 400. */
export function listProducts(
	request: HttpRequest,
	service: AppService,
): HttpResponse {
	const result: Result<ProductData[], string> = service.list(
		request.query.direction ?? "ascending",
	);
	if (!result.ok) {
		return fail(400, result.error);
	}
	return respond(200, result.value);
}

/** GET /products/low-stock. Missing, blank or invalid thresholds return 400. */
export function lowStock(
	request: HttpRequest,
	service: AppService,
): HttpResponse {
	const text: string | undefined = request.query.threshold;
	if (text === undefined || text.trim() === "") {
		return fail(400, "INVALID_THRESHOLD");
	}
	const result: Result<LowStockReport, string> = service.lowStock(Number(text));
	if (!result.ok) {
		return fail(400, result.error);
	}
	return respond(200, result.value);
}
