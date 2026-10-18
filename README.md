# Warehouse Inventory Management

A TypeScript inventory model for small warehouses. It helps warehouse staff maintain a product catalog, view products in a predictable order, identify items that may need restocking, and remove products that are no longer tracked.

Each product records:

- A unique ID
- A name
- A unit price
- A quantity in stock

## Project Status

### Phase 1 — Implemented

Phase 1 provides a fully tested TypeScript domain model with the following operations:

- Add a product
- List products by name in ascending or descending order
- Find and count products below a stock threshold
- Remove a product by ID

This phase contains no file access, console output, user interface, REST API, or persistence layer.

### Phase 2 — Planned

- Refactor the product and inventory models into classes
- Expose the model through a REST API
- Add data persistence
- Preserve the existing model behavior and test coverage

### Phase 3 — Planned

- Build a TypeScript browser frontend for the four inventory workflows

## Requirements

- Node.js 22 or later
- pnpm

## Getting Started

Install dependencies, build the project, run the tests, and generate the coverage report:

```sh
pnpm install
pnpm build
pnpm test
pnpm test:cover
```

## User Stories

The stories are ordered to establish inventory records first, make them discoverable, identify restocking needs, and finally remove records that are no longer needed.

### 1. Add a Product

As a warehouse worker, I want to add a product to the warehouse inventory so that I can track its price and stock quantity.

- **Given** no product uses the supplied ID, **when** I add a product whose ID and name are non-empty, whose price is a finite non-negative number, and whose quantity is a non-negative safe integer, **then** the product is added with the supplied information after leading and trailing whitespace is removed from its ID and name.
- **Given** the trimmed ID already exists, **when** I add another product with that ID, **then** a duplicate-ID error is returned and the inventory remains unchanged.
- **Given** the product data violates a validation rule, **when** I try to create or add the product, **then** a validation error is returned and the existing inventory remains unchanged.

### 2. View Products

As a warehouse worker, I want to view products sorted by name so that I can find a product and check its price and stock quantity.

- **Given** the inventory contains products, **when** I request ascending or descending name order, **then** every product's ID, name, price, and quantity is returned in the requested order. Products with the same name are ordered by ID in ascending order.
- **Given** the inventory is empty, **when** I provide a valid sort direction, **then** an empty list is returned.
- **Given** the direction is neither `ascending` nor `descending`, **when** I request the product list, **then** an invalid-sort-direction error is returned.
- **Given** any inventory state, **when** I request the product list, **then** the stored data and its insertion order remain unchanged.

### 3. Find Low-Stock Products

As a warehouse worker, I want to filter products by a stock threshold and see how many match so that I can identify products that may need restocking.

- **Given** a non-negative safe-integer threshold, **when** I query for low-stock products, **then** the result contains exactly the products whose quantity is strictly below the threshold, preserves their insertion order, and includes the number of matching products.
- **Given** no products match, or the inventory is empty, **when** I provide a valid threshold, **then** the result contains an empty list and a count of zero.
- **Given** an invalid threshold, **when** I query for low-stock products, **then** an invalid-threshold error is returned.
- **Given** any inventory state, **when** I query for low-stock products, **then** the inventory remains unchanged.

### 4. Remove a Product

As a warehouse worker, I want to remove a product by ID so that the inventory no longer contains a product we have stopped tracking.

- **Given** a product with the supplied ID exists, **when** I remove it, **then** that product is returned and removed while every other product remains unchanged.
- **Given** no product has the supplied ID, **when** I try to remove it, **then** a product-not-found error is returned and the inventory remains unchanged.

## Model Design

`src/product.ts` declares:

- `Product`, the product record type
- `Result`, a union type representing either success or failure
- `makeProduct`, the product factory

`src/inventory.ts` declares:

- `Inventory`, the inventory model type
- `makeInventory`, the inventory factory

Phase 1 uses functions and closures rather than classes. The collection is stored as a private array inside a closure and can contain any number of products.

### Inventory Invariants

The model maintains two invariants:

1. Every stored product is valid.
2. No two products have the same trimmed ID.

Product IDs are case-sensitive. Leading and trailing whitespace is removed before an ID is stored or used for lookup. Creating an empty inventory establishes the invariants; adding a product validates and copies the input before checking ID uniqueness; removing a product preserves the invariants; and query operations work with separate arrays.

Stored products are frozen records, preventing callers from changing their fields through returned references.

### Validation Rules

- Product IDs must be non-empty after trimming.
- Product names must be non-empty after trimming.
- Prices must be finite, non-negative numbers.
- Stock quantities must be non-negative safe integers.
- Low-stock thresholds must be non-negative safe integers.
- A product whose quantity equals the threshold is **not** considered low stock; the quantity must be strictly lower.

Text sorting uses JavaScript's case-sensitive string ordering rather than locale-specific collation.

### Result Handling

Expected failures are represented as:

```ts
{ ok: false, error: ... }
```

Successful operations are represented as:

```ts
{ ok: true, value: ... }
```

The Phase 1 functions accept values that conform to their declared TypeScript parameter types. Validation of arbitrary JSON received through HTTP will be handled at the backend input boundary in the planned Phase 2 work.

## Testing

The test suite covers:

- Product construction and validation
- Inventories containing multiple products
- Duplicate IDs after trimming
- Product removal
- Ascending and descending sorting
- Products with equal sort values
- Low-stock threshold boundaries
- Invalid operations
- State preservation after failed operations
- Protection against external mutation


The tested design includes a four-property `Product` type, trimmed-ID uniqueness and product-validity invariants, sorted-list and low-stock derived operations, and explicit failures for duplicate IDs, missing products, and invalid input.
