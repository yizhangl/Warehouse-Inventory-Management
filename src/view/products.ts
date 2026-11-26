import type { ProductData } from "../product.js";

/** Pure formatting: no network access or DOM state. Prices are displayed as supplied. */
export function formatPrice(price: number): string {
	return (
		"$" +
		price.toLocaleString("en-CA", {
			maximumFractionDigits: 20,
			minimumFractionDigits: 2,
		})
	);
}

export function sortProducts(
	products: readonly ProductData[],
	direction: string,
): ProductData[] {
	return [...products].sort((a: ProductData, b: ProductData): number => {
		if (a.name === b.name) {
			return a.id < b.id ? -1 : 1;
		}
		const order: number = a.name < b.name ? -1 : 1;
		return direction === "ascending" ? order : -order;
	});
}

/** Turns stable domain error codes into actionable messages for warehouse staff. */
export function errorMessage(error: string): string {
	const messages: Record<string, string> = {
		DUPLICATE_ID: "That product ID already exists. Use a different ID.",
		INVALID_ID: "Enter a product ID.",
		INVALID_NAME: "Enter a product name.",
		INVALID_PRICE: "Enter a finite price of zero or more.",
		INVALID_STOCK:
			"Stock must be a non-negative safe whole number. The resulting stock may be too large.",
		INVALID_PRODUCT_BODY: "Complete all four product fields with valid values.",
		PRODUCT_NOT_FOUND:
			"This product no longer exists. Reload inventory and select another product.",
		INVALID_THRESHOLD:
			"Enter a non-negative safe whole number for the stock threshold.",
		INVALID_SORT_DIRECTION: "Choose name A–Z or name Z–A.",
		INVALID_ADJUSTMENT:
			"Choose stock in or stock out and enter a positive safe whole number.",
		INVALID_STOCK_BODY: "Enter a direction and a quantity to adjust stock.",
		INSUFFICIENT_STOCK:
			"Not enough stock for this withdrawal. Reduce the quantity.",
		INVALID_PRICE_BODY: "Enter a numeric unit price.",
		SAVE_FAILED:
			"Could not save this change. The recorded inventory was not changed. Check the server's save location before retrying.",
		INTERNAL_MODEL_ERROR:
			"The inventory could not be processed. Please contact the server operator.",
	};
	return messages[error] ?? error;
}
