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

There are no save/load routes. Successful POST/DELETE and stock/price PUT requests automatically write the
whole collection. Startup loads the configured file once. Missing file means an
empty collection. Unreadable, malformed, or invariant-breaking files prevent the
server from starting; this is a startup error, not an HTTP response. The original
file is retained. Restarting with a valid file restores the same product data.

The default file is `data/inventory.json`; `INVENTORY_FILE` overrides it. `PORT`
overrides port 3000. Run only one server process per file. File writes use the
course-supplied helper and are not crash-atomic.

## Phase 3 endpoints

### PUT /products/:id/stock

Records an incoming or outgoing stock movement and saves the collection.

- Path: `id`, URL-encoded, URL-decoded once by the router and trimmed by the model.
- Body: `{ direction: "in" | "out", quantity: number }`. Quantity must be a
  positive safe integer. Extra fields are ignored.
- Success: `200` with the complete updated product. ID, name and price are
  unchanged. `in` increases stock; `out` decreases stock; withdrawing exactly
  the current stock leaves zero units.
- Errors:
  - `400 { error: "INVALID_STOCK_BODY" }`: missing/wrongly typed fields,
    null, array, or absent body.
  - `404 { error: "PRODUCT_NOT_FOUND" }`: no product with that normalized ID.
  - `400 { error: "INVALID_ADJUSTMENT" }`: unknown direction, nonpositive,
    fractional, nonfinite or unsafe quantity.
  - `400 { error: "INSUFFICIENT_STOCK" }`: withdrawal exceeds available stock.
  - `400 { error: "INVALID_STOCK" }`: resulting stock would exceed the safe integer range.
  - `500 { error: "SAVE_FAILED" }`: save failed; in-memory state is unchanged.
  - `500 { error: "INTERNAL_MODEL_ERROR" }`: internal snapshot fails validation.
- Validation order: body shape, product existence, direction/quantity, resulting
  stock. Model errors do not modify memory or the save file.

### PUT /products/:id/price

Changes one product's unit price and saves the collection.

- Path: `id`, URL-encoded and normalized as above.
- Body: `{ price: number }`. A finite nonnegative number; zero is allowed.
  Extra fields are ignored. No currency conversion or cent rounding is applied.
- Success: `200` with the complete updated product; ID, name and stock unchanged.
- Errors:
  - `400 { error: "INVALID_PRICE_BODY" }`: missing or nonnumeric price, null,
    array, or absent body.
  - `404 { error: "PRODUCT_NOT_FOUND" }`: no matching product.
  - `400 { error: "INVALID_PRICE" }`: negative or nonfinite price.
  - `500 { error: "SAVE_FAILED" }`: save failed; in-memory state is unchanged.
  - `500 { error: "INTERNAL_MODEL_ERROR" }`: internal snapshot fails validation.
- Validation order: body shape, product existence, price. Failed validation leaves
  memory and disk unchanged.

## Browser frontend

GET `/` serves `public/index.html`; relative `styles.css` and `app.js` are
served by the same listener. Browser requests use `products/...`, without a
leading slash, so a reverse proxy may mount the app below a path prefix.
Run `pnpm start`, then open the printed URL with its final slash. The page
supports all eight stories, including automatic save and startup restoration.
The API still uses the leading-slash paths documented above at the server edge.
