import { describe, expect, test } from "vitest";
import { Inventory } from "../src/inventory.js";
import { Product, type ProductData, type Result } from "../src/product.js";

function value<T, E>(result: Result<T, E>): T {
	if (!result.ok) throw new Error(String(result.error));
	return result.value;
}

const product = (id = "P001", name = "Apples", stock = 5): ProductData =>
	new Product(id, name, 2.5, stock).toJSON();
const list = (inventory: Inventory) =>
	value(inventory.listProducts("ascending"));

describe("product construction", () => {
	test("trims identifiers and names and accepts zero price and stock", () => {
		expect(new Product(" P1 ", " Apples ", 0, 0).toJSON()).to.deep.equal({
			id: "P1",
			name: "Apples",
			price: 0,
			stock: 0,
		});
	});
	test.each(["", "  "])("rejects empty ID %j", (id) => {
		expect(() => new Product(id, "A", 1, 1)).to.throw("INVALID_ID");
	});
	test.each(["", "  "])("rejects empty name %j", (name) => {
		expect(() => new Product("P1", name, 1, 1)).to.throw("INVALID_NAME");
	});
	test.each([-1, NaN, Infinity, -Infinity])(
		"rejects invalid price %s",
		(price) => {
			expect(() => new Product("P1", "A", price, 1)).to.throw("INVALID_PRICE");
		},
	);
	test.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid stock %s",
		(stock) => {
			expect(() => new Product("P1", "A", 1, stock)).to.throw("INVALID_STOCK");
		},
	);
});

describe("inventory operations and invariants", () => {
	test("new inventories are empty and independent", () => {
		const first = new Inventory();
		first.addProduct(product());
		expect(list(new Inventory())).to.deep.equal([]);
	});
	test("adds multiple products and preserves their complete information", () => {
		const inventory = new Inventory();
		const a = product();
		const b = product("P002", "Bananas", 12);
		expect(inventory.addProduct(a)).to.deep.equal({ ok: true, value: a });
		inventory.addProduct(b);
		expect(list(inventory)).to.deep.equal([a, b]);
	});
	test("rejects normalized duplicate IDs without changing existing data", () => {
		const inventory = new Inventory();
		inventory.addProduct(product());
		expect(
			inventory.addProduct({ ...product(), id: " P001 ", stock: 100 }),
		).to.deep.equal({ ok: false, error: "DUPLICATE_ID" });
		expect(list(inventory)).to.deep.equal([product()]);
	});
	test("revalidates caller-created records before insertion", () => {
		const inventory = new Inventory();
		inventory.addProduct(product());
		expect(inventory.addProduct({ ...product("P2"), stock: -1 })).to.deep.equal(
			{ ok: false, error: "INVALID_STOCK" },
		);
		expect(list(inventory)).to.deep.equal([product()]);
	});
	test("removes only the requested product and permits reusing the removed ID", () => {
		const inventory = new Inventory();
		const other = product("P002");
		inventory.addProduct(product());
		inventory.addProduct(other);
		expect(inventory.removeProduct(" P001 ")).to.deep.equal({
			ok: true,
			value: product(),
		});
		expect(list(inventory)).to.deep.equal([other]);
		expect(inventory.addProduct(product()).ok).to.be.true;
	});
	test("missing removals fail in both empty and nonempty inventories", () => {
		const inventory = new Inventory();
		expect(inventory.removeProduct("missing")).to.deep.equal({
			ok: false,
			error: "PRODUCT_NOT_FOUND",
		});
		inventory.addProduct(product());
		expect(inventory.removeProduct("missing")).to.deep.equal({
			ok: false,
			error: "PRODUCT_NOT_FOUND",
		});
		expect(list(inventory)).to.deep.equal([product()]);
	});
	test("sorts both directions with ascending ID ties without reordering storage", () => {
		const inventory = new Inventory();
		const items = [
			product("P3", "Bananas"),
			product("P2", "Apples"),
			product("P1", "Apples"),
			product("P4", "Apples"),
		];
		items.forEach((item) => inventory.addProduct(item));
		expect(list(inventory).map((item) => item.id)).to.deep.equal([
			"P1",
			"P2",
			"P4",
			"P3",
		]);
		expect(
			value(inventory.listProducts("descending")).map((item) => item.id),
		).to.deep.equal(["P3", "P1", "P2", "P4"]);
		expect(value(inventory.findLowStock(6)).products).to.deep.equal(items);
	});
	test("invalid sorting fails without mutation", () => {
		const inventory = new Inventory();
		inventory.addProduct(product());
		expect(inventory.listProducts("sideways")).to.deep.equal({
			ok: false,
			error: "INVALID_SORT_DIRECTION",
		});
		expect(list(inventory)).to.deep.equal([product()]);
	});
	test("filters multiple products strictly below the threshold and counts them", () => {
		const inventory = new Inventory();
		const items = [
			product("P0", "Empty", 0),
			product("P1", "Low", 9),
			product("P2", "Boundary", 10),
			product("P3", "High", 11),
		];
		items.forEach((item) => inventory.addProduct(item));
		const before = list(inventory);
		expect(value(inventory.findLowStock(10))).to.deep.equal({
			products: items.slice(0, 2),
			count: 2,
		});
		expect(value(inventory.findLowStock(0))).to.deep.equal({
			products: [],
			count: 0,
		});
		expect(list(inventory)).to.deep.equal(before);
		expect(value(new Inventory().findLowStock(10))).to.deep.equal({
			products: [],
			count: 0,
		});
	});
	test.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		"invalid threshold %s fails without mutation",
		(threshold) => {
			const inventory = new Inventory();
			inventory.addProduct(product());
			expect(inventory.findLowStock(threshold)).to.deep.equal({
				ok: false,
				error: "INVALID_THRESHOLD",
			});
			expect(list(inventory)).to.deep.equal([product()]);
		},
	);
	test("input aliases and query arrays cannot corrupt inventory state", () => {
		const inventory = new Inventory();
		const input = { ...product() };
		const added = value(inventory.addProduct(input));
		input.id = "changed";
		input.stock = -10;
		const result = list(inventory) as ProductData[];
		result.length = 0;
		const matches = value(inventory.findLowStock(10)).products as ProductData[];
		matches.length = 0;
		added.stock = -1; // Returned records are copies, not internal class state.
		expect(list(inventory)).to.deep.equal([product()]);
	});
});
