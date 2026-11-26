# Three-minute demonstration

Use the actual page. Start with a separate empty demo inventory:

```sh
PORT=3000 INVENTORY_FILE=data/demo-inventory.json pnpm start
```

Open `http://localhost:3000/`. Keep an existing demo file only if you deliberately
want to show restored data. Use the following order; save and restore are
implicit behaviours, with no additional routes or buttons.

| Time | Story | Show |
| --- | --- | --- |
| 0:00–0:15 | Introduction | Warehouse worker, product table, automatic saving |
| 0:15–0:35 | 1 — Add | Add P001 Packing tape, price 3.50, stock 5, and P002 Shipping boxes, price 1.25, stock 24 |
| 0:35–0:50 | 2 — View | Switch A–Z to Z–A; both products and their fields remain visible |
| 0:50–1:05 | 3 — Low stock | Filter below 10: Packing tape only; choose Show all |
| 1:05–1:25 | 7 — Adjust stock | Receive 3 tape units, then withdraw 2; demonstrate excessive withdrawal error |
| 1:25–1:40 | 8 — Price | Update tape price to 4.25 |
| 1:40–1:50 | 5 — Save | Point to the saved confirmation; no manual save action |
| 1:50–2:15 | 6 — Restore | Stop and restart the same server with the same file; reload and show persisted values |
| 2:15–2:35 | 4 — Remove | Confirm removal of Shipping boxes; tape remains |
| 2:35–2:45 | Wrap up | All eight stories available through the page |

No demo video is included. Recording was stopped at the user's request; this walkthrough is optional reference material only.
