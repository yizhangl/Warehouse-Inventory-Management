# Warehouse Inventory REST API

Base URL: `http://localhost:3000` by default. Bodies and responses are JSON.
All error responses have `{ error: string }`. IDs are case-sensitive and trimmed.
A product is `{ id: string, name: string, price: number, stock: number }`.
Names/IDs must contain non-whitespace characters; prices must be finite and
nonnegative; stock must be a nonnegative safe integer. Extra product properties
are ignored. Successful replies contain normalized IDs/names.

### POST /products

Adds a product and automatically saves the entire collection.

- Body: a product record with all four properties and the types above.
- Success: `201` with the added product record.
- Errors:
  - `400 { error: "INVALID_PRODUCT_BODY" }`: absent body, array, null, missing field, or wrong field type.
  - `400 { error: "INVALID_ID" }`: empty or whitespace-only ID.
  - `400 { error: "INVALID_NAME" }`: empty or whitespace-only name.
  - `400 { error: "INVALID_PRICE" }`: nonfinite or negative price.
  - `400 { error: "INVALID_STOCK" }`: negative, fractional, nonfinite, or unsafe stock count.
  - `409 { error: "DUPLICATE_ID" }`: normalized ID already exists.
  - `500 { error: "SAVE_FAILED" }`: file cannot be saved; in-memory state is unchanged.
  - `500 { error: "INTERNAL_MODEL_ERROR" }`: internal snapshot unexpectedly fails validation.

Validation proceeds in the order shape, ID, name, price, stock, uniqueness. Only
one error is returned. Successful POST persists before sending its response.

### GET /products

Returns every product ordered by name.

- Query: optional `direction=ascending` (default) or `direction=descending`.
- Body: none required.
- Success: `200` with a product array; empty inventory returns `[]`.
- Equal names are ordered by ascending ID in both directions. Sorting is
  case-sensitive string ordering, not locale-specific dictionary ordering.
- Errors: `400 { error: "INVALID_SORT_DIRECTION" }` for any other direction,
  including an explicitly empty value.
- Does not change stored data or insertion order.

### GET /products/low-stock

Filters stock strictly below a threshold and counts the matching products.

- Query: required `threshold`, parsed as a number after rejecting a blank value.
  It must be a nonnegative safe integer. Scientific notation such as `1e1`
  is accepted as 10. Repeated query parameters use their last value.
- Success: `200 { products: Product[], count: number }` in insertion order.
  No matches returns `{ products: [], count: 0 }`; equality to threshold is excluded.
- Errors: `400 { error: "INVALID_THRESHOLD" }` for missing, blank, nonnumeric,
  negative, fractional, nonfinite, or unsafe values.
- Does not modify or save the collection.

### DELETE /products/:id

Removes one product and saves the remaining collection.

- Path: `id`, URL-encoded when necessary. The framework URL-decodes it once.
- Body: none required.
- Success: `200` with the removed product record.
- Errors:
  - `404 { error: "PRODUCT_NOT_FOUND" }`: normalized ID does not exist.
  - `500 { error: "SAVE_FAILED" }`: cannot save; in-memory product remains present.
  - `500 { error: "INTERNAL_MODEL_ERROR" }`: internal snapshot unexpectedly fails validation.

## Shared framework behaviour

- Invalid JSON text: `400 { error: "request body is not valid JSON" }`.
- Unmatched supported method/path: `404 { error: "no route matches <METHOD> <PATH>" }`.
- Unsupported HTTP method: `405 { error: "unsupported method <METHOD>" }`.
- OPTIONS: `204` with no body, handled by the framework's CORS support.
- Unexpected handler exception: `500 { error: "handler threw: <message>" }`.
- Other listener errors (for example malformed URL escapes): `500 { error: "<error text>" }`.
- The framework accepts trailing/repeated slashes and uses the last repeated query value.

## Saving and startup

There are no save/load routes. Successful POST/DELETE automatically write the
whole collection. Startup loads the configured file once. Missing file means an
empty collection. Unreadable, malformed, or invariant-breaking files prevent the
server from starting; this is a startup error, not an HTTP response. The original
file is retained. Restarting with a valid file restores the same product data.

The default file is `data/inventory.json`; `INVENTORY_FILE` overrides it. `PORT`
overrides port 3000. Run only one server process per file. File writes use the
course-supplied helper and are not crash-atomic.
