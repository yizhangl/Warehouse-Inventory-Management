import { Product, parseProduct, type ProductData } from "./product.js";
import { ok, err, type Result } from "./result.js";
export type LowStockReport = { products: ProductData[]; count: number };

/** INVARIANT: valid products with unique case-sensitive normalized IDs.
 * Empty construction establishes it; insertion checks it; queries return copies. */
export class Inventory {
	private readonly products: Product[] = [];
	/** Invalid or duplicate products return an error without changing state. */
	public addProduct(input: ProductData): Result<ProductData, string> {
		let product: Product;
		try {
			product = parseProduct(input);
		} catch (e) {
			return err((e as Error).message);
		}
		if (this.products.some((p: Product): boolean => p.id === product.id)) {
			return err("DUPLICATE_ID");
		}
		this.products.push(product);
		return ok(product.toJSON());
	}
	/** Missing ID returns PRODUCT_NOT_FOUND without changing state. */
	public removeProduct(id: string): Result<ProductData, string> {
		const index: number = this.products.findIndex(
			(p: Product): boolean => p.id === id.trim(),
		);
		if (index < 0) {
			return err("PRODUCT_NOT_FOUND");
		}
		return ok(this.products.splice(index, 1)[0].toJSON());
	}
	/** Derived operation 1: name ordering, ascending ID ties; invalid direction is an error. */
	public listProducts(direction: string): Result<ProductData[], string> {
		if (direction !== "ascending" && direction !== "descending") {
			return err("INVALID_SORT_DIRECTION");
		}
		const result: Product[] = [...this.products].sort(
			(a: Product, b: Product): number => {
				if (a.name === b.name) {
					return a.id < b.id ? -1 : 1;
				}
				const order: number = a.name < b.name ? -1 : 1;
				return direction === "ascending" ? order : -order;
			},
		);
		return ok(result.map((p: Product): ProductData => p.toJSON()));
	}
	/** Derived operation 2: strict stock < threshold, insertion order and count.
	 * Invalid threshold returns INVALID_THRESHOLD; inventory is never modified. */
	public findLowStock(threshold: number): Result<LowStockReport, string> {
		if (!Number.isSafeInteger(threshold) || threshold < 0) {
			return err("INVALID_THRESHOLD");
		}
		const products: ProductData[] = this.products
			.filter((p: Product): boolean => p.stock < threshold)
			.map((p: Product): ProductData => p.toJSON());
		return ok({ products, count: products.length });
	}
	/** Returns a detached, insertion-ordered snapshot suitable for JSON storage. */
	public toJSON(): { products: ProductData[] } {
		return {
			products: this.products.map((p: Product): ProductData => p.toJSON()),
		};
	}
	/** Rejects malformed data and duplicate/invalid products; never partially restores. */
	public static fromJSON(input: unknown): Result<Inventory, string> {
		if (
			typeof input !== "object" ||
			input === null ||
			!("products" in input) ||
			!Array.isArray(input.products)
		) {
			return err("INVALID_SAVE_FORMAT");
		}
		const inventory: Inventory = new Inventory();
		for (const item of input.products) {
			try {
				const added: Result<ProductData, string> = inventory.addProduct(
					parseProduct(item).toJSON(),
				);
				if (!added.ok) {
					return added;
				}
			} catch (e) {
				return err((e as Error).message);
			}
		}
		return ok(inventory);
	}
}
