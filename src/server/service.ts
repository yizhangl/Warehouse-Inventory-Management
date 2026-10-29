import { Inventory, type LowStockReport } from "../inventory.js";
import type { ProductData } from "../product.js";
import type { Result } from "../result.js";
import { readJsonFile, writeJsonFile } from "./persistence.js";
import { fail, respond, type HttpResponse } from "./framework/router.js";

type Change =
	| { kind: "add"; product: ProductData }
	| { kind: "remove"; id: string };

/** Coordinates the inventory and its file. Only committed changes are visible.
 * The promise queue prevents overlapping writes in this server process. */
export class AppService {
	private inventory: Inventory;
	private readonly savePath: string;
	private pending: Promise<unknown> = Promise.resolve();

	/** Creates a service with an already validated inventory and its save path. */
	public constructor(inventory: Inventory, savePath: string) {
		this.inventory = inventory;
		this.savePath = savePath;
	}

	/** Returns a sorted snapshot, or INVALID_SORT_DIRECTION; does not mutate state. */
	public list(direction: string): Result<ProductData[], string> {
		return this.inventory.listProducts(direction);
	}

	/** Returns a filtered report, or INVALID_THRESHOLD; does not mutate state. */
	public lowStock(threshold: number): Result<LowStockReport, string> {
		return this.inventory.findLowStock(threshold);
	}

	/** Queues one change. Domain errors return 4xx; saving errors return 500.
	 * Postcondition: only a successfully saved candidate replaces current state. */
	public change(action: Change): Promise<HttpResponse> {
		const task: Promise<HttpResponse> = this.pending.then(
			(): Promise<HttpResponse> => this.saveChange(action),
		);
		// Even an unexpected exception must not permanently block later requests.
		this.pending = task.catch((): void => undefined);
		return task;
	}

	/** Validates on a separate collection, writes it, then publishes it. */
	private async saveChange(action: Change): Promise<HttpResponse> {
		const restored: Result<Inventory, string> = Inventory.fromJSON(
			this.inventory.toJSON(),
		);
		if (!restored.ok) {
			return fail(500, "INTERNAL_MODEL_ERROR");
		}
		const candidate: Inventory = restored.value;
		const result: Result<ProductData, string> =
			action.kind === "add"
				? candidate.addProduct(action.product)
				: candidate.removeProduct(action.id);
		if (!result.ok) {
			return fail(errorStatus(result.error), result.error);
		}
		const saved: Result<void, string> = await writeJsonFile(
			this.savePath,
			candidate.toJSON(),
		);
		if (!saved.ok) {
			return fail(500, "SAVE_FAILED");
		}
		this.inventory = candidate;
		return respond(action.kind === "add" ? 201 : 200, result.value);
	}
}

/** Maps expected model failures to client-error status codes. */
function errorStatus(error: string): number {
	if (error === "DUPLICATE_ID") {
		return 409;
	}
	if (error === "PRODUCT_NOT_FOUND") {
		return 404;
	}
	return 400;
}

/** Loads once before the listener starts.
 * @param savePath JSON file holding the entire collection.
 * @returns An empty service if absent, otherwise a completely restored service.
 * @throws Error if the file is unreadable, malformed, or violates an invariant.
 * Postcondition: a failed load never overwrites the original file.
 */
export async function startService(savePath: string): Promise<AppService> {
	const file: Result<unknown, string> = await readJsonFile(savePath);
	if (!file.ok) {
		throw new Error(file.error);
	}
	if (file.value === undefined) {
		return new AppService(new Inventory(), savePath);
	}
	const loaded: Result<Inventory, string> = Inventory.fromJSON(file.value);
	if (!loaded.ok) {
		throw new Error("LOAD_FAILED: " + loaded.error);
	}
	return new AppService(loaded.value, savePath);
}
