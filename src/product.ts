export type { Result } from "./result.js";
export type ProductData = {
	id: string;
	name: string;
	price: number;
	stock: number;
};
/** Immutable product. Nonempty trimmed ID/name, finite nonnegative price,
 * and nonnegative safe-integer stock. Constructor throws on invalid data. */
export class Product {
	private readonly data: Readonly<ProductData>;
	/** Establishes the product invariant.
	 * @param id Nonempty identifier; surrounding whitespace is removed.
	 * @param name Nonempty display name; surrounding whitespace is removed.
	 * @param price Finite nonnegative unit price.
	 * @param stock Nonnegative safe integer quantity.
	 * @throws Error naming the first invalid field.
	 */
	public constructor(id: string, name: string, price: number, stock: number) {
		if (!id.trim()) {
			throw new Error("INVALID_ID");
		}
		if (!name.trim()) {
			throw new Error("INVALID_NAME");
		}
		if (!Number.isFinite(price) || price < 0) {
			throw new Error("INVALID_PRICE");
		}
		if (!Number.isSafeInteger(stock) || stock < 0) {
			throw new Error("INVALID_STOCK");
		}
		this.data = Object.freeze({
			id: id.trim(),
			name: name.trim(),
			price,
			stock,
		});
	}
	public get id(): string {
		return this.data.id;
	}
	public get name(): string {
		return this.data.name;
	}
	public get price(): number {
		return this.data.price;
	}
	public get stock(): number {
		return this.data.stock;
	}
	/** Returns a detached record; changes to it cannot affect this product. */
	public toJSON(): ProductData {
		return { ...this.data };
	}
}
/** Checks untrusted HTTP/file data, then uses the constructor's invariants. */
export function parseProduct(input: unknown): Product {
	if (
		typeof input !== "object" ||
		input === null ||
		Array.isArray(input) ||
		!("id" in input) ||
		typeof input.id !== "string" ||
		!("name" in input) ||
		typeof input.name !== "string" ||
		!("price" in input) ||
		typeof input.price !== "number" ||
		!("stock" in input) ||
		typeof input.stock !== "number"
	) {
		throw new Error("INVALID_PRODUCT_BODY");
	}
	return new Product(input.id, input.name, input.price, input.stock);
}
