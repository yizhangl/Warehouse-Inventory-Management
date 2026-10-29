import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, test } from "vitest";
import {
	dispatch,
	type HttpMethod,
	type HttpResponse,
} from "../src/server/framework/router.js";
import { routes } from "../src/server/routes.js";
import { startService, AppService } from "../src/server/service.js";
import { readJsonFile, writeJsonFile } from "../src/server/persistence.js";
import { Inventory } from "../src/inventory.js";
import { Product } from "../src/product.js";

const apple = { id: "P1", name: "Apple", price: 2.5, stock: 5 };
let directory: string;
let file: string;
let service: AppService;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "warehouse-test-"));
	file = join(directory, "inventory.json");
	service = await startService(file);
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

function request(
	method: HttpMethod,
	path: string,
	body: unknown = undefined,
): Promise<HttpResponse> {
	return dispatch(routes, service, method, path, body);
}

/** Converts a rejected startup into an observable message for Chai assertions. */
async function startupError(path: string): Promise<string> {
	try {
		await startService(path);
		return "NO_ERROR";
	} catch (error) {
		return String(error);
	}
}

describe("Stories 1–4: REST contracts", () => {
	test("Story 1: adds a product and returns its normalized data", async () => {
		expect(
			await request("POST", "/products", { ...apple, id: " P1 " }),
		).to.deep.equal({ status: 201, body: apple });
	});
	test("Story 1: duplicate ID is a 409 and does not overwrite the product", async () => {
		await request("POST", "/products", apple);
		expect(
			await request("POST", "/products", { ...apple, stock: 99 }),
		).to.deep.equal({ status: 409, body: { error: "DUPLICATE_ID" } });
		expect((await request("GET", "/products")).body).to.deep.equal([apple]);
	});
	test("Story 2: returns all products in requested order", async () => {
		const pear = { ...apple, id: "P2", name: "Pear" };
		await request("POST", "/products", apple);
		await request("POST", "/products", pear);
		expect(
			await request("GET", "/products?direction=descending"),
		).to.deep.equal({ status: 200, body: [pear, apple] });
	});
	test("Story 2: rejects invalid sort direction", async () => {
		expect(await request("GET", "/products?direction=wrong")).to.deep.equal({
			status: 400,
			body: { error: "INVALID_SORT_DIRECTION" },
		});
	});
	test("Story 3: filters and counts products below the threshold", async () => {
		await request("POST", "/products", apple);
		await request("POST", "/products", { ...apple, id: "P2", stock: 10 });
		expect(
			await request("GET", "/products/low-stock?threshold=10"),
		).to.deep.equal({ status: 200, body: { products: [apple], count: 1 } });
	});
	test.each([
		"",
		"?threshold=",
		"?threshold=%20",
		"?threshold=-1",
		"?threshold=abc",
		"?threshold=1.5",
		"?threshold=Infinity",
	])("Story 3: rejects threshold %s", async (query) => {
		expect(await request("GET", "/products/low-stock" + query)).to.deep.equal({
			status: 400,
			body: { error: "INVALID_THRESHOLD" },
		});
	});
	test("Story 4: removes only the selected product", async () => {
		await request("POST", "/products", apple);
		expect(await request("DELETE", "/products/P1")).to.deep.equal({
			status: 200,
			body: apple,
		});
		expect((await request("GET", "/products")).body).to.deep.equal([]);
	});
	test("Story 4: missing product is a 404", async () => {
		expect(await request("DELETE", "/products/missing")).to.deep.equal({
			status: 404,
			body: { error: "PRODUCT_NOT_FOUND" },
		});
	});
	test.each([
		null,
		[],
		{},
		{ ...apple, stock: "5" },
		{ ...apple, name: 2 },
		{ ...apple, id: 4 },
		{ ...apple, price: "2" },
	])("wrong POST shape returns 400: %j", async (body) => {
		expect(await request("POST", "/products", body)).to.deep.equal({
			status: 400,
			body: { error: "INVALID_PRODUCT_BODY" },
		});
	});
	test("negative stock is a model error exposed as 400", async () => {
		expect(
			await request("POST", "/products", { ...apple, stock: -1 }),
		).to.deep.equal({ status: 400, body: { error: "INVALID_STOCK" } });
	});
});

describe("Stories 5–6: persistence and restart", () => {
	test("Story 5: accepted POST saves the complete collection", async () => {
		expect((await request("POST", "/products", apple)).status).to.equal(201);
		expect(JSON.parse(await readFile(file, "utf8"))).to.deep.equal({
			products: [apple],
		});
	});
	test("Story 5: save failure is 500 and memory remains unchanged", async () => {
		await mkdir(file); // A directory cannot be overwritten with the JSON file.
		expect(await request("POST", "/products", apple)).to.deep.equal({
			status: 500,
			body: { error: "SAVE_FAILED" },
		});
		expect((await request("GET", "/products")).body).to.deep.equal([]);
	});
	test("Story 5: rejected mutation does not rewrite the save file", async () => {
		await request("POST", "/products", apple);
		const before = await readFile(file, "utf8");
		expect((await request("POST", "/products", apple)).status).to.equal(409);
		expect(await readFile(file, "utf8")).to.equal(before);
	});
	test("Story 6: fresh service restores products and answers dispatch queries", async () => {
		await request("POST", "/products", apple);
		service = await startService(file);
		expect(await request("GET", "/products")).to.deep.equal({
			status: 200,
			body: [apple],
		});
		expect(await request("POST", "/products", apple)).to.deep.equal({
			status: 409,
			body: { error: "DUPLICATE_ID" },
		});
	});
	test("Story 6: missing file starts with an empty collection", async () => {
		expect(await request("GET", "/products")).to.deep.equal({
			status: 200,
			body: [],
		});
	});
	test("Story 6: malformed JSON rejects startup and preserves the file", async () => {
		await writeFile(file, "{broken");
		expect(await startupError(file)).to.include("not valid JSON");
		expect(await readFile(file, "utf8")).to.equal("{broken");
	});
	test.each([
		null,
		[],
		{},
		{ products: "wrong" },
		{ products: [apple, apple] },
		{ products: [{ ...apple, stock: -1 }] },
		{ products: [null] },
	])("Story 6: refuses invalid saved data %j", async (saved) => {
		await writeFile(file, JSON.stringify(saved));
		expect(await startupError(file)).to.include("LOAD_FAILED");
		expect(JSON.parse(await readFile(file, "utf8"))).to.deep.equal(saved);
	});
	test("unreadable file rejects startup", async () => {
		await mkdir(file);
		expect(await startupError(file)).to.include("could not read");
	});
	test("deletions remain deleted after restart", async () => {
		await request("POST", "/products", apple);
		await request("DELETE", "/products/P1");
		service = await startService(file);
		expect((await request("GET", "/products")).body).to.deep.equal([]);
	});
	test("overlapping additions save without losing either product", async () => {
		const pear = { ...apple, id: "P2", name: "Pear" };
		const results = await Promise.all([
			request("POST", "/products", apple),
			request("POST", "/products", pear),
		]);
		expect(results.map((result) => result.status)).to.deep.equal([201, 201]);
		service = await startService(file);
		expect((await request("GET", "/products")).body).to.deep.equal([
			apple,
			pear,
		]);
	});
	test("file helpers create nested directories and read the value", async () => {
		const nested = join(directory, "nested", "data.json");
		expect((await writeJsonFile(nested, { products: [] })).ok).to.be.true;
		expect(await readJsonFile(nested)).to.deep.equal({
			ok: true,
			value: { products: [] },
		});
	});
	test("service exposes an invalid mutation as 400 even without a handler", async () => {
		expect(
			await service.change({ kind: "add", product: { ...apple, stock: -1 } }),
		).to.deep.equal({ status: 400, body: { error: "INVALID_STOCK" } });
	});
	test("Product queries and serialization do not expose stored fields", () => {
		const product = new Product("P1", "Apple", 2.5, 5);
		expect([
			product.id,
			product.name,
			product.price,
			product.stock,
		]).to.deep.equal(["P1", "Apple", 2.5, 5]);
		const data = product.toJSON();
		data.stock = -1;
		expect(product.stock).to.equal(5);
		expect(Inventory.fromJSON({ products: [] }).ok).to.be.true;
	});
});
