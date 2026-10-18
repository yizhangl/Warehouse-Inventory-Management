import { makeProduct, type Product, type ProductError, type Result } from "./product.js";

export type InventoryError = ProductError | "DUPLICATE_ID";
export type LowStockReport = { products: readonly Product[]; count: number };

/**
 * A collection of arbitrary size with unique, case-sensitive product IDs.
 * Every stored product satisfies the Product invariants.
 * The backing array is private to makeInventory's closure. Query results are
 * separate arrays containing frozen products, so callers cannot alter storage.
 */
export type Inventory = {
  /** Adds a validated copy. Validation/duplicate errors leave the inventory unchanged. */
  addProduct(product: Product): Result<Product, InventoryError>;
  /** Removes the matching trimmed ID, or returns PRODUCT_NOT_FOUND without mutation. */
  removeProduct(id: string): Result<Product, "PRODUCT_NOT_FOUND">;
  /**
   * Returns all products ordered by name using case-sensitive string comparison.
   * Equal names use ascending ID order in either direction. Does not mutate storage.
   * A direction other than ascending/descending returns INVALID_SORT_DIRECTION.
   */
  listProducts(direction: string): Result<readonly Product[], "INVALID_SORT_DIRECTION">;
  /**
   * Filters stock < threshold, retaining insertion order, and counts matches.
   * Threshold must be a non-negative safe integer; otherwise returns
   * INVALID_THRESHOLD. Empty results succeed. Never mutates the inventory.
   */
  findLowStock(threshold: number): Result<LowStockReport, "INVALID_THRESHOLD">;
};

/** Creates an empty inventory, establishing unique IDs and valid items vacuously. */
export function makeInventory(): Inventory {
  const products: Product[] = [];
  return {
    addProduct(product) {
      // Structural typing alone does not prove a caller's record is valid.
      const checked = makeProduct(product.id, product.name, product.price, product.stock);
      if (!checked.ok) return checked;
      if (products.some((existing) => existing.id === checked.value.id)) {
        return { ok: false, error: "DUPLICATE_ID" };
      }
      products.push(checked.value);
      return { ok: true, value: checked.value };
    },
    removeProduct(id) {
      const index = products.findIndex((product) => product.id === id.trim());
      if (index === -1) return { ok: false, error: "PRODUCT_NOT_FOUND" };
      const removed = products.splice(index, 1)[0]!;
      return { ok: true, value: removed };
    },
    listProducts(direction) {
      if (direction !== "ascending" && direction !== "descending") {
        return { ok: false, error: "INVALID_SORT_DIRECTION" };
      }
      const sorted = [...products].sort((a, b) => {
        if (a.name === b.name) return compareText(a.id, b.id);
        const order = compareText(a.name, b.name);
        return direction === "ascending" ? order : -order;
      });
      return { ok: true, value: sorted };
    },
    findLowStock(threshold) {
      if (!Number.isSafeInteger(threshold) || threshold < 0) {
        return { ok: false, error: "INVALID_THRESHOLD" };
      }
      const matches = products.filter((product) => product.stock < threshold);
      return { ok: true, value: { products: matches, count: matches.length } };
    }
  };
}


function compareText(a: string, b: string): number {
  // Callers compare distinct names or unique IDs, so equality is excluded.
  return a < b ? -1 : 1;
}
