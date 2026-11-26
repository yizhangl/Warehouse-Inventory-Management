import type { InventoryApi } from "./client/api.js";
import type { ProductData } from "./product.js";
import type { Result } from "./result.js";
import { errorMessage, formatPrice, sortProducts } from "./view/products.js";

/** Owns the page and its event handlers. Depends on InventoryApi rather than
 * HTTP or AppService. Invariant: at most one UI operation runs at a time.
 */
export class InventoryDashboard {
	private readonly root: Document;
	private readonly api: InventoryApi;
	private products: ProductData[] = [];
	private threshold: number | undefined;
	private busy: boolean = false;

	public constructor(root: Document, api: InventoryApi) {
		this.root = root;
		this.api = api;
		this.bindEvents();
	}

	/** Initial data always comes from the server, including restored records. */
	public async start(): Promise<void> {
		await this.run(async (): Promise<void> => {
			if (await this.refresh()) {
				this.notice(
					"Inventory loaded from the server. Successful changes are saved automatically.",
				);
				this.text(
					"save-status",
					"Inventory loaded. Every successful change is saved.",
				);
			}
		});
	}

	private element<T extends HTMLElement>(id: string): T {
		const found: HTMLElement | null = this.root.getElementById(id);
		if (found === null) {
			throw new Error("Missing page element: " + id);
		}
		return found as T;
	}

	private input(id: string): string {
		return this.element<HTMLInputElement | HTMLSelectElement>(id).value;
	}

	private text(id: string, value: string): void {
		this.element(id).textContent = value;
	}

	private notice(message: string, kind: string = ""): void {
		this.text("notice", message);
		this.element("notice").className = "notice " + kind;
	}

	private bindEvents(): void {
		this.element("open-add").addEventListener("click", (): void => {
			this.element<HTMLFormElement>("add-form").reset();
			this.open("add");
		});
		for (const button of this.root.querySelectorAll<HTMLButtonElement>(
			"[data-close]",
		)) {
			button.addEventListener("click", (): void => {
				this.element<HTMLDialogElement>(button.dataset.close!).close();
			});
		}
		// Do not let Escape close a dialog while its save is still in flight.
		for (const dialog of this.root.querySelectorAll<HTMLDialogElement>(
			"dialog",
		)) {
			dialog.addEventListener("cancel", (event: Event): void => {
				if (this.busy) event.preventDefault();
			});
		}
		this.submit("filter-form", async (): Promise<void> => {
			const value: number = Number(this.input("threshold"));
			if (!Number.isSafeInteger(value) || value < 0) {
				this.notice(errorMessage("INVALID_THRESHOLD"), "error");
				return;
			}
			this.threshold = value;
			await this.refresh();
		});
		this.element("show-all").addEventListener("click", (): void => {
			void this.run(async (): Promise<void> => {
				this.threshold = undefined;
				await this.refresh();
			});
		});
		this.element("reload").addEventListener("click", (): void => {
			void this.start();
		});
		this.element("sort").addEventListener("change", (): void => {
			void this.run(async (): Promise<void> => {
				await this.refresh();
			});
		});
		this.submit("add-form", async (): Promise<void> => {
			const product: ProductData = {
				id: this.input("product-id"),
				name: this.input("product-name"),
				price: Number(this.input("product-price")),
				stock: Number(this.input("product-stock")),
			};
			await this.mutate(
				"add",
				this.api.addProduct(product),
				"Product added and saved.",
			);
		});
		this.submit("stock-form", async (): Promise<void> => {
			await this.mutate(
				"stock",
				this.api.adjustStock(
					this.input("stock-id"),
					this.input("stock-direction"),
					Number(this.input("stock-quantity")),
				),
				"Stock updated and saved.",
			);
		});
		this.submit("price-form", async (): Promise<void> => {
			await this.mutate(
				"price",
				this.api.updatePrice(
					this.input("price-id"),
					Number(this.input("new-price")),
				),
				"Unit price updated and saved.",
			);
		});
		this.submit("remove-form", async (): Promise<void> => {
			await this.mutate(
				"remove",
				this.api.removeProduct(this.input("remove-id")),
				"Product removed and saved.",
			);
		});
		this.element("product-rows").addEventListener(
			"click",
			(event: MouseEvent): void => {
				const target: HTMLElement = event.target as HTMLElement;
				const button: HTMLButtonElement | null = target.closest(
					"button[data-action]",
				);
				if (button === null || this.busy) return;
				const product: ProductData | undefined = this.products.find(
					(item: ProductData): boolean => item.id === button.dataset.id,
				);
				if (product !== undefined)
					this.openProduct(button.dataset.action!, product);
			},
		);
	}

	private submit(id: string, action: () => Promise<void>): void {
		this.element<HTMLFormElement>(id).addEventListener(
			"submit",
			(event: SubmitEvent): void => {
				event.preventDefault();
				void this.run(action);
			},
		);
	}

	private open(kind: string): void {
		this.element(kind + "-error").hidden = true;
		this.element<HTMLDialogElement>(kind + "-dialog").showModal();
	}

	private openProduct(kind: string, product: ProductData): void {
		this.element<HTMLInputElement>(kind + "-id").value = product.id;
		this.text(
			kind + "-context",
			product.name +
				" · " +
				product.id +
				" · " +
				product.stock +
				" units in stock",
		);
		if (kind === "stock") {
			this.element<HTMLSelectElement>("stock-direction").value = "in";
			this.element<HTMLInputElement>("stock-quantity").value = "1";
		}
		if (kind === "price")
			this.element<HTMLInputElement>("new-price").value = String(product.price);
		this.open(kind);
	}

	/** Busy state also prevents stale filters or overlapping UI submissions. */
	private async run(action: () => Promise<void>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.setBusy(true);
		try {
			await action();
		} catch {
			this.notice(
				"Something went wrong. Reload inventory before trying again.",
				"error",
			);
		} finally {
			this.busy = false;
			this.setBusy(false);
		}
	}

	private setBusy(value: boolean): void {
		this.element("app").setAttribute("aria-busy", String(value));
		for (const control of this.root.querySelectorAll<
			HTMLButtonElement | HTMLInputElement | HTMLSelectElement
		>("button, input, select")) {
			control.disabled = value;
		}
	}

	/** A successful mutation is already saved. Refresh failure must not be
	 * misreported as a failed mutation (which could provoke a duplicate retry). */
	private async mutate(
		kind: string,
		pending: Promise<Result<ProductData, string>>,
		message: string,
	): Promise<void> {
		const result: Result<ProductData, string> = await pending;
		if (!result.ok) {
			this.text(kind + "-error", errorMessage(result.error));
			this.element(kind + "-error").hidden = false;
			return;
		}
		this.element<HTMLDialogElement>(kind + "-dialog").close();
		this.text(
			"save-status",
			"Last change saved at " + new Date().toLocaleTimeString(),
		);
		if (await this.refresh()) this.notice(message);
		else
			this.notice(
				message +
					" The list could not be refreshed; reload inventory to see the latest data.",
				"warning",
			);
	}

	private async refresh(): Promise<boolean> {
		const direction: string = this.input("sort");
		const all: Result<ProductData[], string> =
			await this.api.listProducts(direction);
		if (!all.ok) {
			this.notice(errorMessage(all.error), "error");
			return false;
		}
		let visible: ProductData[] = all.value;
		if (this.threshold !== undefined) {
			const filtered = await this.api.lowStock(this.threshold);
			if (!filtered.ok) {
				this.notice(errorMessage(filtered.error), "error");
				return false;
			}
			visible = sortProducts(filtered.value.products, direction);
		}
		this.products = visible;
		this.text("total-products", String(all.value.length));
		this.text(
			"total-units",
			all.value
				.reduce(
					(sum: bigint, product: ProductData): bigint =>
						sum + BigInt(product.stock),
					0n,
				)
				.toLocaleString(),
		);
		this.render(visible);
		this.notice(
			this.threshold === undefined
				? "Showing all products."
				: "Showing " +
						visible.length +
						" products with stock below " +
						this.threshold +
						".",
		);
		return true;
	}

	private render(products: ProductData[]): void {
		const rows: HTMLElement = this.element("product-rows");
		rows.replaceChildren();
		for (const product of products) rows.append(this.row(product));
		const filtering: boolean = this.threshold !== undefined;
		this.text("result-count", String(products.length));
		this.text(
			"list-description",
			filtering
				? "Products with stock strictly below " + this.threshold + "."
				: "All products in your warehouse.",
		);
		this.text(
			"view-note",
			filtering
				? products.length + " low-stock products"
				: products.length + " products",
		);
		this.element("empty-state").hidden = products.length !== 0;
		this.text(
			"empty-title",
			filtering ? "Nothing below this threshold." : "Your shelves start here.",
		);
		this.text(
			"empty-description",
			filtering
				? "Try a higher threshold, or choose Show all."
				: "Add your first product to begin tracking inventory.",
		);
	}

	private row(product: ProductData): HTMLTableRowElement {
		const row: HTMLTableRowElement = this.root.createElement("tr");
		const values: string[] = [
			product.name,
			product.id,
			formatPrice(product.price),
		];
		for (const [index, value] of values.entries()) {
			const cell: HTMLTableCellElement = row.insertCell();
			cell.textContent = value;
			cell.dataset.label = ["Product", "Product ID", "Unit price"][index];
			cell.className =
				index === 1 ? "product-code" : index === 2 ? "number" : "";
		}
		const stock: HTMLTableCellElement = row.insertCell();
		stock.className = "number";
		stock.dataset.label = "Stock";
		const badge: HTMLSpanElement = this.root.createElement("span");
		const low: boolean =
			this.threshold !== undefined && product.stock < this.threshold;
		badge.className =
			"stock-badge" + (product.stock === 0 ? " zero" : low ? " low" : "");
		badge.textContent = product.stock.toLocaleString();
		stock.append(badge);
		const actions: HTMLTableCellElement = row.insertCell();
		actions.className = "actions-cell";
		const group: HTMLDivElement = this.root.createElement("div");
		group.className = "row-actions";
		for (const [action, label] of [
			["stock", "Adjust stock"],
			["price", "Edit price"],
			["remove", "Remove"],
		]) {
			const button: HTMLButtonElement = this.root.createElement("button");
			button.type = "button";
			button.textContent = label;
			button.dataset.id = product.id;
			button.dataset.action = action;
			button.className = action === "remove" ? "remove-button" : "";
			button.setAttribute("aria-label", label + " for " + product.name);
			button.disabled = this.busy;
			group.append(button);
		}
		actions.append(group);
		return row;
	}
}
