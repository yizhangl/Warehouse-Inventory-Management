import { describe, test, expect } from "vitest";
import { HttpInventoryApi, type FetchLike } from "../src/client/api.js";
import {
	formatPrice,
	sortProducts,
	errorMessage,
} from "../src/view/products.js";

const product = { id: "P/ 1", name: "Tape", price: 2.5, stock: 5 };

function responding(value: unknown, status: number = 200): FetchLike {
	return async (): Promise<Response> =>
		new Response(JSON.stringify(value), { status });
}

describe("browser API boundary", () => {
	test("builds relative paths and encodes identifiers", async () => {
		const calls: { path: string; init?: RequestInit }[] = [];
		const api = new HttpInventoryApi(
			async (path: string, init?: RequestInit): Promise<Response> => {
				calls.push({ path, init });
				return new Response(JSON.stringify(product));
			},
		);
		expect(await api.updatePrice(product.id, 3)).to.deep.equal({
			ok: true,
			value: product,
		});
		expect(calls[0].path).to.equal("products/P%2F%201/price");
		expect(calls[0].init?.method).to.equal("PUT");
		expect(JSON.parse(calls[0].init?.body as string)).to.deep.equal({
			price: 3,
		});
	});
	test("retains the server's error message", async () => {
		const api = new HttpInventoryApi(
			responding({ error: "INSUFFICIENT_STOCK" }, 400),
		);
		expect(await api.adjustStock(product.id, "out", 6)).to.deep.equal({
			ok: false,
			error: "INSUFFICIENT_STOCK",
		});
	});
	test.each([
		null,
		{},
		[{ ...product, stock: -1 }],
		[product, product],
		[{ ...product, price: "2" }],
	])("rejects malformed list %j", async (body) => {
		const result = await new HttpInventoryApi(responding(body)).listProducts(
			"ascending",
		);
		expect(result.ok).to.be.false;
	});
	test("rejects an inconsistent low-stock count", async () => {
		const api = new HttpInventoryApi(
			responding({ products: [product], count: 2 }),
		);
		expect((await api.lowStock(10)).ok).to.be.false;
	});
	test("accepts empty and valid report bodies", async () => {
		expect(
			await new HttpInventoryApi(responding([])).listProducts("ascending"),
		).to.deep.equal({ ok: true, value: [] });
		expect(
			await new HttpInventoryApi(
				responding({ products: [product], count: 1 }),
			).lowStock(10),
		).to.deep.equal({ ok: true, value: { products: [product], count: 1 } });
	});
	test("turns network and non-JSON failures into results", async () => {
		const offline = new HttpInventoryApi(async (): Promise<Response> => {
			throw new Error("offline");
		});
		expect((await offline.removeProduct("P1")).ok).to.be.false;
		const html = new HttpInventoryApi(
			async (): Promise<Response> => new Response("<html>error</html>"),
		);
		expect((await html.addProduct(product)).ok).to.be.false;
	});
	test("views format data without modifying it", () => {
		const items = [product, { ...product, id: "P2", name: "Box" }];
		expect(
			sortProducts(items, "ascending").map((item) => item.name),
		).to.deep.equal(["Box", "Tape"]);
		expect(items[0]).to.equal(product);
		expect(formatPrice(2.5)).to.equal("$2.50");
		expect(errorMessage("DUPLICATE_ID")).to.include("already exists");
	});
});
