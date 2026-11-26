import { HttpInventoryApi } from "./client/api.js";
import { InventoryDashboard } from "./dashboard.js";

const api: HttpInventoryApi = new HttpInventoryApi(window.fetch.bind(window));
const dashboard: InventoryDashboard = new InventoryDashboard(document, api);
void dashboard.start();
