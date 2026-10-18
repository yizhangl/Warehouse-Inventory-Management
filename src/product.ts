/** An operation either succeeds with a value or reports an expected domain error. */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * A warehouse product.
 * INVARIANTS: id and name contain non-whitespace characters; price is finite
 * and non-negative; stock is a non-negative safe integer.
 * IDs are case-sensitive. Leading/trailing whitespace is removed at creation.
 */
export type Product = Readonly<{
  id: string;
  name: string;
  price: number;
  stock: number;
}>;

export type ProductError = "INVALID_ID" | "INVALID_NAME" | "INVALID_PRICE" | "INVALID_STOCK";

/**
 * Establishes the Product invariants and returns a frozen record.
 * Returns the corresponding validation error on invalid input.
 * No input or existing product is mutated.
 */
export function makeProduct(
  id: string, name: string, price: number, stock: number
): Result<Product, ProductError> {
  if (id.trim().length === 0) return { ok: false, error: "INVALID_ID" };
  if (name.trim().length === 0) return { ok: false, error: "INVALID_NAME" };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "INVALID_PRICE" };
  if (!Number.isSafeInteger(stock) || stock < 0) return { ok: false, error: "INVALID_STOCK" };
  return { ok: true, value: Object.freeze({ id: id.trim(), name: name.trim(), price, stock }) };
}
