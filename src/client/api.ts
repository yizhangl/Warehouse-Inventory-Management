import type { ProductData } from "../product.js";
import type { LowStockReport } from "../inventory.js";
import { err, ok, type Result } from "../result.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The page's contract, independent of HTTP and the concrete service class. */
export interface InventoryApi {
	listProducts(direction: string): Promise<Result<ProductData[], string>>;
	lowStock(threshold: number): Promise<Result<LowStockReport, string>>;
	addProduct(product: ProductData): Promise<Result<ProductData, string>>;
	removeProduct(id: string): Promise<Result<ProductData, string>>;
	adjustStock(
		id: string,
		direction: string,
		quantity: number,
	): Promise<Result<ProductData, string>>;
	updatePrice(id: string, price: number): Promise<Result<ProductData, string>>;
}

/** Checks unknown JSON at the browser boundary; no unchecked data reaches the page. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isProduct(value: unknown): value is ProductData {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		value.id.trim().length > 0 &&
		typeof value.name === "string" &&
		value.name.trim().length > 0 &&
		typeof value.price === "number" &&
		Number.isFinite(value.price) &&
		value.price >= 0 &&
		typeof value.stock === "number" &&
		Number.isSafeInteger(value.stock) &&
		value.stock >= 0
	);
}

function isProductList(value: unknown): value is ProductData[] {
	if (!Array.isArray(value) || !value.every(isProduct)) {
		return false;
	}
	return (
		new Set(value.map((product: ProductData): string => product.id.trim()))
			.size === value.length
	);
}

function isReport(value: unknown): value is LowStockReport {
	return (
		isRecord(value) &&
		isProductList(value.products) &&
		Number.isSafeInteger(value.count) &&
		value.count === value.products.length
	);
}

/** Only this class calls fetch. URLs deliberately have no leading slash, so
 * the page also works behind a workspace's path prefix. A failed HTTP status,
 * network failure or malformed response becomes a Result error, never a cast.
 */
export class HttpInventoryApi implements InventoryApi {
	private readonly fetchLike: FetchLike;

	public constructor(fetchLike: FetchLike) {
		this.fetchLike = fetchLike;
	}

	public listProducts(
		direction: string,
	): Promise<Result<ProductData[], string>> {
		return this.request(
			"products?direction=" + encodeURIComponent(direction),
			"GET",
			undefined,
			isProductList,
		);
	}

	public lowStock(threshold: number): Promise<Result<LowStockReport, string>> {
		return this.request(
			"products/low-stock?threshold=" + encodeURIComponent(String(threshold)),
			"GET",
			undefined,
			isReport,
		);
	}

	public addProduct(
		product: ProductData,
	): Promise<Result<ProductData, string>> {
		return this.request("products", "POST", product, isProduct);
	}

	public removeProduct(id: string): Promise<Result<ProductData, string>> {
		return this.request(
			"products/" + encodeURIComponent(id),
			"DELETE",
			undefined,
			isProduct,
		);
	}

	public adjustStock(
		id: string,
		direction: string,
		quantity: number,
	): Promise<Result<ProductData, string>> {
		return this.request(
			"products/" + encodeURIComponent(id) + "/stock",
			"PUT",
			{ direction, quantity },
			isProduct,
		);
	}

	public updatePrice(
		id: string,
		price: number,
	): Promise<Result<ProductData, string>> {
		return this.request(
			"products/" + encodeURIComponent(id) + "/price",
			"PUT",
			{ price },
			isProduct,
		);
	}

	private async request<T>(
		path: string,
		method: string,
		body: unknown,
		valid: (value: unknown) => value is T,
	): Promise<Result<T, string>> {
		try {
			const init: RequestInit = { method };
			if (body !== undefined) {
				init.headers = { "Content-Type": "application/json" };
				init.body = JSON.stringify(body);
			}
			const response: Response = await this.fetchLike(path, init);
			const value: unknown = await response.json();
			if (!response.ok) {
				if (isRecord(value) && typeof value.error === "string") {
					return err(value.error);
				}
				return err(
					"The server refused the request (HTTP " + response.status + ").",
				);
			}
			if (!valid(value)) {
				return err(
					"The server returned an invalid response. Please reload and try again.",
				);
			}
			return ok(value);
		} catch {
			return err(
				"Cannot reach the server or read its response. Check the connection, then reload inventory before retrying a change.",
			);
		}
	}
}
