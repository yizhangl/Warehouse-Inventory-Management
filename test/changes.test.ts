import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, test } from "vitest";
import { Inventory } from "../src/inventory.js";
import { dispatch, type HttpResponse } from "../src/server/framework/router.js";
import { routes } from "../src/server/routes.js";
import { AppService, startService } from "../src/server/service.js";

const product = { id: "P1", name: "Tape", price: 2.5, stock: 5 };
let directory: string;
let file: string;
let service: AppService;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "inventory-phase3-"));
	file = join(directory, "inventory.json");
	service = await startService(file);
	await dispatch(routes, service, "POST", "/products", product);
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

function put(path: string, body: unknown): Promise<HttpResponse> {
	return dispatch(routes, service, "PUT", path, body);
}

async function products(): Promise<unknown> {
	return (await dispatch(routes, service, "GET", "/products", undefined)).body;
}

describe("Story 7: stock movements", () => {
	test("receives stock, saves it, then restores it through a fresh service", async () => {
		expect(
			await put("/products/P1/stock", { direction: "in", quantity: 3 }),
		).to.deep.equal({ status: 200, body: { ...product, stock: 8 } });
		service = await startService(file);
		expect(await products()).to.deep.equal([{ ...product, stock: 8 }]);
	});
	test("withdraws stock down to zero without changing the other fields", async () => {
		expect(
			await put("/products/P1/stock", { direction: "out", quantity: 5 }),
		).to.deep.equal({ status: 200, body: { ...product, stock: 0 } });
	});
	test("insufficient stock returns a 4xx error and leaves memory and disk unchanged", async () => {
		const before: string = await readFile(file, "utf8");
		expect(
			await put("/products/P1/stock", { direction: "out", quantity: 6 }),
		).to.deep.equal({ status: 400, body: { error: "INSUFFICIENT_STOCK" } });
		expect(await products()).to.deep.equal([product]);
		expect(await readFile(file, "utf8")).to.equal(before);
	});
	test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
		"refuses quantity %s",
		async (quantity) => {
			expect(
				await put("/products/P1/stock", { direction: "in", quantity }),
			).to.deep.equal({ status: 400, body: { error: "INVALID_ADJUSTMENT" } });
		},
	);
	test("refuses unknown direction", async () => {
		expect(
			await put("/products/P1/stock", { direction: "sideways", quantity: 1 }),
		).to.deep.equal({ status: 400, body: { error: "INVALID_ADJUSTMENT" } });
	});
	test("refuses a resulting unsafe integer", async () => {
		expect(
			await put("/products/P1/stock", {
				direction: "in",
				quantity: Number.MAX_SAFE_INTEGER,
			}),
		).to.deep.equal({ status: 400, body: { error: "INVALID_STOCK" } });
	});
	test.each([
		null,
		[],
		{},
		{ direction: "in", quantity: "2" },
		{ direction: 2, quantity: 1 },
	])("refuses malformed body %j", async (body) => {
		expect(await put("/products/P1/stock", body)).to.deep.equal({
			status: 400,
			body: { error: "INVALID_STOCK_BODY" },
		});
	});
	test("missing product returns 404", async () => {
		expect(
			await put("/products/missing/stock", { direction: "out", quantity: 1 }),
		).to.deep.equal({ status: 404, body: { error: "PRODUCT_NOT_FOUND" } });
	});
});

describe("Story 8: price changes", () => {
	test("saves a new price and restores it without changing other fields", async () => {
		expect(await put("/products/P1/price", { price: 3.75 })).to.deep.equal({
			status: 200,
			body: { ...product, price: 3.75 },
		});
		service = await startService(file);
		expect(await products()).to.deep.equal([{ ...product, price: 3.75 }]);
	});
	test("zero is a valid price", async () => {
		expect((await put("/products/P1/price", { price: 0 })).body).to.deep.equal({
			...product,
			price: 0,
		});
	});
	test.each([-1, NaN, Infinity])(
		"invalid price %s returns 4xx without changing memory or disk",
		async (price) => {
			const before: string = await readFile(file, "utf8");
			expect(await put("/products/P1/price", { price })).to.deep.equal({
				status: 400,
				body: { error: "INVALID_PRICE" },
			});
			expect(await products()).to.deep.equal([product]);
			expect(await readFile(file, "utf8")).to.equal(before);
		},
	);
	test.each([null, [], {}, { price: "2" }])(
		"refuses malformed price body %j",
		async (body) => {
			expect(await put("/products/P1/price", body)).to.deep.equal({
				status: 400,
				body: { error: "INVALID_PRICE_BODY" },
			});
		},
	);
	test("missing product returns 404", async () => {
		expect(await put("/products/missing/price", { price: 2 })).to.deep.equal({
			status: 404,
			body: { error: "PRODUCT_NOT_FOUND" },
		});
	});
	test("write failure returns 500 and both updates leave memory unchanged", async () => {
		const badPath: string = join(directory, "directory");
		await mkdir(badPath);
		const inventory: Inventory = new Inventory();
		inventory.addProduct(product);
		service = new AppService(inventory, badPath);
		expect(
			await put("/products/P1/stock", { direction: "in", quantity: 1 }),
		).to.deep.equal({ status: 500, body: { error: "SAVE_FAILED" } });
		expect(await put("/products/P1/price", { price: 8 })).to.deep.equal({
			status: 500,
			body: { error: "SAVE_FAILED" },
		});
		expect(await products()).to.deep.equal([product]);
	});
	test("concurrent adjustments and price updates retain all accepted changes", async () => {
		const responses = await Promise.all([
			put("/products/P1/stock", { direction: "in", quantity: 2 }),
			put("/products/P1/price", { price: 8 }),
			put("/products/P1/stock", { direction: "out", quantity: 1 }),
		]);
		expect(
			responses.map((response: HttpResponse): number => response.status),
		).to.deep.equal([200, 200, 200]);
		service = await startService(file);
		expect(await products()).to.deep.equal([
			{ ...product, price: 8, stock: 6 },
		]);
	});
});
