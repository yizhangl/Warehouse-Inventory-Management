# Warehouse Inventory Management

A TypeScript application for small-warehouse staff to manage product records, view stock, identify replenishment needs, and remove products they no longer track. Each product has a unique ID, name, unit price, and stock quantity.

Phase 2 builds on the Phase 1 model with classes, a REST backend, and JSON persistence. Stories 1–6 are implemented. Stories 7–8 are planned for Phase 3, together with a browser frontend.

## Getting Started

Use Node.js 22 or later and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm test:cover
pnpm start
```

The backend listens on port 3000 and saves to `data/inventory.json` by default. Set `PORT` and `INVENTORY_FILE` to override these values. Relative file paths are resolved from the working directory. There is no browser interface yet.

```sh
curl -X POST http://localhost:3000/products \
  -H 'Content-Type: application/json' \
  -d '{"id":"P1","name":"Apple","price":2.5,"stock":5}'

curl 'http://localhost:3000/products?direction=ascending'
curl 'http://localhost:3000/products/low-stock?threshold=10'
curl -X DELETE http://localhost:3000/products/P1
```

See [API.md](API.md) for request bodies, query parameters, responses, and errors.

## User Interview

Not completed. This teaching example does not claim a user interview or interview feedback. Students should develop their own project ideas and document their own interviews.

## User Stories

The priority order establishes product records, makes them visible, identifies replenishment needs, enables removal, and then preserves accepted changes across restarts.

### Story 1: Add a Product

#### Statement

As a warehouse worker, I want to add a product to the inventory, so that I can track its price and stock quantity.

#### Success Criteria

- **Given** no product uses the supplied ID, **when** I add a product with a nonempty ID and name, a finite nonnegative price, and a nonnegative safe-integer stock quantity, **then** the product is added with that information, after surrounding whitespace is removed from its ID and name.

#### Error Criteria

- **Given** the normalized ID already exists, **when** I add another product with that ID, **then** a duplicate-ID error is returned and the inventory remains unchanged.
- **Given** product information violates a validation rule, **when** I try to create or add it, **then** a validation error is returned and existing inventory data remains unchanged.

### Story 2: View Products

#### Statement

As a warehouse worker, I want to view products sorted by name, so that I can locate products and check their prices and stock quantities.

#### Success Criteria

- **Given** products exist, **when** I request ascending or descending name order, **then** all products and their four fields are returned in that order; equal names use ascending ID order in either direction.
- **Given** an empty inventory, **when** I request a valid sort direction, **then** an empty list is returned.
- **Given** any inventory, **when** I request a list, **then** stored data and insertion order remain unchanged.

#### Error Criteria

- **Given** a direction other than `ascending` or `descending`, **when** I request the list, **then** an invalid-sort-direction error is returned.

### Story 3: Identify Low-Stock Products

#### Statement

As a warehouse worker, I want to filter products by a stock threshold and see the matching count, so that I can identify products that may need replenishment.

#### Success Criteria

- **Given** a nonnegative safe-integer threshold, **when** I request low-stock products, **then** exactly the products with stock strictly below that threshold are returned in insertion order, together with their count.
- **Given** no matching products or an empty inventory, **when** I supply a valid threshold, **then** an empty list and a count of zero are returned.
- **Given** any inventory, **when** I request low-stock products, **then** the inventory remains unchanged.

#### Error Criteria

- **Given** an invalid threshold, **when** I request low-stock products, **then** an invalid-threshold error is returned.

### Story 4: Remove a Product

#### Statement

As a warehouse worker, I want to remove a product by ID, so that the inventory no longer contains products we have stopped tracking.

#### Success Criteria

- **Given** the product exists, **when** I remove it, **then** it is returned and removed while all other products remain unchanged.

#### Error Criteria

- **Given** the product does not exist, **when** I try to remove it, **then** a product-not-found error is returned and the inventory remains unchanged.

### Story 5: Save Inventory Automatically

#### Statement

As a warehouse worker, I want accepted additions and removals saved automatically, so that confirmed changes survive a normal server restart.

#### Success Criteria

- **Given** a writable save path, **when** an addition or removal passes model validation, **then** the entire collection is saved in one JSON file before a success response is returned.
- **Given** a request violates a model rule, **when** it returns a 4xx response, **then** neither memory nor the existing save file is changed by that request.

#### Error Criteria

- **Given** the file cannot be written, **when** a valid change is requested, **then** the server returns `500 { error: "SAVE_FAILED" }`, leaves the in-memory inventory unchanged, and does not report success.

### Story 6: Restore Inventory at Startup

#### Statement

As a warehouse worker, I want saved inventory restored at startup, so that I can continue working with previously recorded products.

#### Success Criteria

- **Given** a valid file containing unique product IDs, **when** the server restarts, **then** it loads the file once, GET returns the restored products, and duplicate IDs are still refused.
- **Given** no save file exists, **when** the server starts, **then** it starts empty and GET returns an empty list.

#### Error Criteria

- **Given** an unreadable file, malformed JSON, invalid structure, or an invariant violation, **when** startup is attempted, **then** startup fails with an error before the HTTP listener starts, and the original file is not overwritten.

### Story 7: Adjust Stock — Planned for Phase 3

#### Statement

As a warehouse worker, I want to record incoming and outgoing stock, so that recorded quantities reflect actual stock movements.

#### Success Criteria

- **Given** stock is 5, **when** 3 units arrive, **then** stock becomes 8 and is saved automatically.
- **Given** stock is 5, **when** 2 units leave, **then** stock becomes 3 and is saved automatically.

#### Error Criteria

- **Given** stock is 5, **when** 6 units are requested for removal, **then** an error is returned and memory and saved data remain unchanged.
- **Given** an unknown product or an adjustment quantity that is not a positive safe integer, **when** an adjustment is requested, **then** an error is returned without changing inventory.

### Story 8: Update Unit Price — Planned for Phase 3

#### Statement

As a warehouse worker, I want to update an existing product's unit price, so that its record reflects current pricing.

#### Success Criteria

- **Given** a product exists, **when** a finite nonnegative new price is supplied, **then** only its price changes and is saved automatically; its ID, name, and stock remain unchanged.

#### Error Criteria

- **Given** an unknown product or a price that is not finite and nonnegative, **when** a price change is requested, **then** an error is returned and memory and saved data remain unchanged.

## Design

- `src/product.ts`: immutable `Product` class with private state, constructor validation, and detached data records.
- `src/inventory.ts`: `Inventory` class with a private product array, mutation methods, sorted listing, low-stock reports, and validated restoration.
- `src/result.ts`: success/error union and helper functions.
- `src/server/service.ts`: `AppService` coordinates inventory changes, persistence, and startup restoration.
- `src/server/handlers.ts` and `routes.ts`: translate HTTP requests into operations and responses.
- `src/server/persistence.ts`: JSON file helpers supplied with the Phase 2 instructions.
- `src/server/framework/`: course-provided router and HTTP listener.
- `src/start.ts`: starts the service and listener.

The collection invariant is that all products are valid and no two share the same normalized, case-sensitive ID. IDs and names are trimmed. Stock and thresholds must be nonnegative safe integers, and prices must be finite and nonnegative. Sorting uses case-sensitive string order rather than locale-specific collation. Stock equal to the threshold is not low stock.

The two derived operations are sorted listing and low-stock filtering/counting. The model documents and tests errors such as duplicate IDs, missing products, invalid sorting, invalid thresholds, and invalid saved data. Constructors establish invariants, methods preserve them, and query results do not expose internal state. Tests use the textbook's Chai assertion style.

## Persistence

The save file contains the complete collection:

```json
{
  "products": [
    { "id": "P1", "name": "Apple", "price": 2.5, "stock": 5 }
  ]
}
```

There are no save or load endpoints. Successful additions and removals save automatically. Startup reads the file once, checks its shape, and rebuilds through constructors and collection operations rather than assigning untrusted data directly into private fields.

State-changing requests are processed sequentially within one server process. Each change is validated on a separate candidate collection, saved, and only then published as current state. A save failure leaves in-memory state unchanged. Reads during a save see the last committed state. Run only one server process per save file.

The supplied file helper writes directly to the file and is not crash-atomic. An interrupted write can leave damaged data; startup refuses such data rather than silently clearing it. This is a teaching backend, not a transactional database.

Persistence failure responses follow the specific Phase 2 rules: request errors return 4xx, save failures return 500, and invalid startup files prevent startup. A startup failure has no HTTP response because the listener has not started.

## Testing

```sh
pnpm build
pnpm test:cover
```

Model tests cover construction, validation, uniqueness, sorting, removal, low-stock boundaries, failure state preservation, and detached query results. Backend tests call `dispatch` directly and use an independent temporary directory for each test. They cover the six implemented stories, restarts, invalid saved data, write failures, and overlapping requests.

Coverage excludes the supplied framework and the startup entry point. The HTML report is generated in `coverage/index.html`. Dependencies, build output, coverage reports, and runtime inventory files are ignored by Git.

## Framework Attribution

The router and HTTP listener are the course framework supplied in Lab 4. Relative imports use `.js` extensions for NodeNext compatibility. No Lab 4 business model or business handler is included. [FRAMEWORK.md](FRAMEWORK.md) documents the framework and includes its original tide-service examples; this project's tests call `dispatch` directly. The persistence helpers follow the Phase 2 handout.
