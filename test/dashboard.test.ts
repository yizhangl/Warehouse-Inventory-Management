// @vitest-environment jsdom
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, test, expect, vi } from "vitest";
import { InventoryDashboard } from "../src/dashboard.js";
import { HttpInventoryApi } from "../src/client/api.js";
import { startService, type AppService } from "../src/server/service.js";
import { routes } from "../src/server/routes.js";
import { dispatch, type HttpMethod } from "../src/server/framework/router.js";

let directory: string;
let file: string;
let service: AppService;

function input(id: string, value: string): void {
	(document.getElementById(id) as HTMLInputElement).value = value;
}
function click(selector: string): void {
	const button = document.querySelector<HTMLButtonElement>(selector);
	if (button === null) throw new Error("Missing button: " + selector);
	button.click();
}
async function settled(): Promise<void> {
	await vi.waitFor(() =>
		expect(document.getElementById("app")?.getAttribute("aria-busy")).to.equal(
			"false",
		),
	);
}
async function submit(id: string): Promise<void> {
	document
		.getElementById(id)!
		.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
	await settled();
}
async function add(id: string, name: string): Promise<void> {
	click("#open-add");
	input("product-id", id);
	input("product-name", name);
	input("product-price", "2.5");
	input("product-stock", "5");
	await submit("add-form");
}

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), "inventory-page-"));
	file = join(directory, "inventory.json");
	service = await startService(file);
	const html: string = await readFile(
		join(process.cwd(), "public/index.html"),
		"utf8",
	);
	document.documentElement.innerHTML = html;
	// jsdom has no modal presentation; retain the same open/close state for tests.
	HTMLDialogElement.prototype.showModal = function (): void {
		this.open = true;
	};
	HTMLDialogElement.prototype.close = function (): void {
		this.open = false;
	};
	const api = new HttpInventoryApi(
		async (path: string, init?: RequestInit): Promise<Response> => {
			const result = await dispatch(
				routes,
				service,
				(init?.method ?? "GET") as HttpMethod,
				"/" + path,
				init?.body ? JSON.parse(String(init.body)) : undefined,
			);
			return new Response(JSON.stringify(result.body), {
				status: result.status,
			});
		},
	);
	await new InventoryDashboard(document, api).start();
});
afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe("page-to-backend workflows", () => {
	test("adds, sorts, filters, edits, restores and removes through page controls", async () => {
		await add("P1", "Tape");
		expect(document.querySelector("#product-rows")?.textContent).to.include(
			"Tape",
		);
		await add("P2", "Box");
		expect(document.querySelector("#product-rows tr td")?.textContent).to.equal(
			"Box",
		);
		input("sort", "descending");
		document.getElementById("sort")!.dispatchEvent(new Event("change"));
		await settled();
		expect(document.querySelector("#product-rows tr td")?.textContent).to.equal(
			"Tape",
		);
		input("threshold", "5");
		await submit("filter-form");
		expect(document.getElementById("result-count")?.textContent).to.equal("0");
		expect(document.getElementById("empty-state")?.hidden).to.be.false;
		click("#show-all");
		await settled();
		click('[data-action="stock"][data-id="P1"]');
		input("stock-quantity", "3");
		await submit("stock-form");
		expect(
			document.querySelector('[data-id="P1"]')?.closest("tr")?.textContent,
		).to.include("8");
		click('[data-action="price"][data-id="P1"]');
		input("new-price", "3.75");
		await submit("price-form");
		expect(
			document.querySelector('[data-id="P1"]')?.closest("tr")?.textContent,
		).to.include("$3.75");
		service = await startService(file);
		click("#reload");
		await settled();
		expect(
			document.querySelector('[data-id="P1"]')?.closest("tr")?.textContent,
		).to.include("$3.75");
		click('[data-action="remove"][data-id="P1"]');
		await submit("remove-form");
		expect(document.querySelector('[data-id="P1"]')).to.equal(null);
		expect(document.querySelector("#product-rows")?.textContent).to.include(
			"Box",
		);
	});
	test("shows duplicate and insufficient-stock messages while keeping records unchanged", async () => {
		await add("P1", "Tape");
		await add("P1", "Duplicate");
		expect(document.getElementById("add-error")?.textContent).to.include(
			"already exists",
		);
		click('[data-close="add-dialog"]');
		click('[data-action="stock"][data-id="P1"]');
		input("stock-direction", "out");
		input("stock-quantity", "6");
		await submit("stock-form");
		expect(document.getElementById("stock-error")?.textContent).to.include(
			"Not enough stock",
		);
		expect(document.getElementById("total-units")?.textContent).to.equal("5");
	});
	test("renders product names as text, not executable HTML", async () => {
		await add("P1", '<img src=x onerror="alert(1)">');
		expect(document.querySelector("#product-rows img")).to.equal(null);
		expect(document.querySelector("#product-rows")?.textContent).to.include(
			"<img",
		);
	});
});
