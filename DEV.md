# Development

Run from this directory with Node.js 22+ and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm start
```

Open the printed `http://localhost:3000/` URL with its trailing slash. The same
server serves `public/` and the API. Browser URLs (`styles.css`, `app.js`,
`products/...`) are relative, suitable for a workspace reverse proxy. The
framework receives paths after the proxy removes its prefix.

`pnpm start` compiles TypeScript, then starts the esbuild watcher and server.
Browser edits rebuild `public/app.js`; reload the page to see them. Restart
for server changes. Ctrl+C stops the listener and disposes the watcher.
Generated JS is build output; all authored application code is TypeScript.

```sh
PORT=3100 INVENTORY_FILE=data/demo.json pnpm start
```

The default `data/inventory.json` is intentionally ignored by Git. Each process
must own its save file. Back up important data before experimenting with file
permissions or broken JSON. A missing file starts empty; an invalid existing
file refuses startup. There is no load/save button or endpoint.

## Verification

```sh
pnpm build
pnpm test
pnpm test:cover
```

Backend tests call dispatch without sockets and use isolated temporary files.
Browser tests use jsdom; dashboard tests run against a fake fetch connected to
the real handlers. The optional client/view layer has separate tests and is
excluded from backend coverage thresholds.

## Story 5: demonstrate a save failure

Use a separate terminal and an isolated path. Start the service while the path
does not exist, then create a directory at that exact path:

```sh
PORT=3101 INVENTORY_FILE=data/save-error.json pnpm start
```

After the page loads, in another terminal in this directory:

```sh
mkdir -p data/save-error.json
```

Add a valid product through that page. The write fails, the dialog shows an
error, and the visible inventory remains unchanged. Stop the test service,
then remove this empty directory with `rmdir data/save-error.json` before the
next run. Never do this with your normal inventory file.

## Demo

Follow [docs/DEMO.md](docs/DEMO.md). No video is included. Use a separate demo data file if recording later, so ordinary inventory records are not changed.
The real user interview and any course submission remain the user's work.
