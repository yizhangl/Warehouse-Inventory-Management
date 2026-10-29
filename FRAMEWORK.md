# The REST Framework

The reference for the REST framework in `src/server/framework/`, the same one you used in LA07 and Lab 3, and the one Phase 2 of the project uses. Three files, no dependencies beyond Node:

| File | What it does |
|---|---|
| `router.ts` | The request and response types, route matching, and `dispatch`, which turns a URL into a handler call. |
| `server.ts` | The HTTP listener: reads real requests, calls `dispatch`, writes JSON back. Also CORS and static files. |
| `testClient.ts` | Runs a service in-process on test stations so tests call handlers directly, with no socket. |

Every code sample below is taken from a test in the course's framework examples and runs as written.

```
   HTTP request ──► server.ts ──► dispatch(routes, toyService, method, url, body)
                                      │  finds the route, fills in params and query
                                      ▼
                                 handler(request, service) ──► { status, body }
                                      ▲
   your tests ──► testClient.ts ──────┘   (same dispatch, no HTTP)
```

## Types

### `HttpRequest`

What a handler receives. The framework has already taken the request apart, so a handler never reads a URL itself; it reads these fields.

```ts
type HttpRequest = {
  method: HttpMethod;                          // "GET" | "POST" | "PUT" | "DELETE"
  path: string;                                // "/stations/tofino/readings", without the query string
  params: Record<string, string>;              // one entry per :name in the matched pattern
  query: Partial<Record<string, string>>;      // query-string parameters, as strings
  body: unknown;                               // the parsed JSON body, or undefined
};
```

Two requests, as a handler for the pattern `/stations/:id/readings` sees them:

| Field | `GET /stations/tofino/readings?day=12` | `POST /stations/tofino/readings` with body `{"day":31,"hour":0,"height":2.5,"phase":"new"}` |
|---|---|---|
| `method` | `"GET"` | `"POST"` |
| `path` | `"/stations/tofino/readings"` | `"/stations/tofino/readings"` |
| `params` | `{ id: "tofino" }` | `{ id: "tofino" }` |
| `query` | `{ day: "12" }` | `{}` |
| `body` | `undefined` | `{ day: 31, hour: 0, height: 2.5, phase: "new" }` |

So a handler reads the station id as `request.params.id`, a query parameter as `request.query.day` (a string, or `undefined`), and a POST's data as `request.body` (of unknown shape until checked).

Rules:

* `params` has one entry per `:name` segment in the matched pattern, URL-decoded. For pattern `/stations/:id` and path `/stations/tofino`, `params` is `{ id: "tofino" }`.
* `query` values are strings. A parameter that was not sent is `undefined`. A parameter sent with no value, as in `?day=`, is the empty string. The type is `string | undefined`, so you have to handle both.
* `body` is whatever `JSON.parse` produced. Nothing about its shape has been checked. It can be an object, an array, a number, `null`, or `undefined` when there was no body. Checking it is the handler's job.

Watch out for `Number`. `Number("abc")` is `NaN`, and `NaN` passes every range check because it is neither less than nor greater than anything. `Number("")` is `0`. `Number(" 12 ")` is `12`. Check `Number.isFinite`, and `Number.isInteger` when you need a whole number, before comparing.

### `HttpResponse`

What a handler returns.

```ts
type HttpResponse = { status: number; body: unknown };
```

The server serialises `body` as JSON. Tests compare it as a value. Every failure response in this course has the body `{ error: string }`.

### `Handler<Service>` and `Route<Service>`

```ts
type Handler<Service> = (request: HttpRequest, service: Service) => HttpResponse | Promise<HttpResponse>;
type Route<Service> = { method: HttpMethod; pattern: string; handler: Handler<Service> };
```

A handler may be synchronous or `async`. It is `async` only when it waits on something, such as a file; a handler that only reads memory is a plain function. The network wait happens in `server.ts` before the handler is called, so no handler ever waits on the network. `Service` is whatever your application's state is; in this lab it is `TideService` from `src/server/service.ts`.

## Building responses

```ts
respond(200, [1, 2])     // { status: 200, body: [1, 2] }
fail(404, "nothing here") // { status: 404, body: { error: "nothing here" } }
```

`respond(status, body)` builds a success. `fail(status, message)` builds a failure with the standard error body. `notImplemented(name)` builds the `501` an `async` stub returns as a promise, as LA07's stubs did. This lab's stubs are synchronous and return `fail(501, ...)` directly.

## Writing a handler

The examples in this section use a toy service, so they don't give away the lab's answers:

```ts
type Lighthouse = { id: string; name: string; heightM: number };
type LighthouseService = { lighthouses: Lighthouse[] };
const toyService: LighthouseService = { lighthouses: [/* Fisgard, Point Atkinson */] };
```

A synchronous handler looks up its path parameter and returns one of two shapes:

```ts
function getLighthouse(request: HttpRequest, service: LighthouseService): HttpResponse {
  const found = service.lighthouses.find((l) => l.id === request.params.id);
  if (found === undefined) {
    return fail(404, "no lighthouse with id '" + request.params.id + "'");
  }
  return respond(200, found);
}
```

A handler that reads a query parameter checks the string first:

```ts
function listTallerThan(request: HttpRequest, service: LighthouseService): HttpResponse {
  const text = request.query.minHeight;
  if (text === undefined || text === "") {
    return fail(400, "minHeight is required");
  }
  const minHeight = Number(text);
  if (!Number.isFinite(minHeight)) {
    return fail(400, "minHeight must be a number, got '" + text + "'");
  }
  return respond(200, service.lighthouses.filter((l) => l.heightM >= minHeight));
}
```

An asynchronous handler is declared `async` and returns `Promise<HttpResponse>`; the framework awaits it. `request.body` is `unknown`, so the handler has to establish what it is before reading a field:

```ts
async function renameLighthouse(request: HttpRequest, service: LighthouseService): Promise<HttpResponse> {
  const found = service.lighthouses.find((l) => l.id === request.params.id);
  if (found === undefined) {
    return fail(404, "no lighthouse with id '" + request.params.id + "'");
  }
  const body = request.body;
  if (typeof body !== "object" || body === null || !("name" in body) || typeof body.name !== "string") {
    return fail(400, "body must be { name: string }");
  }
  found.name = body.name;
  await Promise.resolve(); // in real code, write to disk here
  return respond(200, found);
}
```

Keep model logic in the model and status codes in the handlers.

## The route table

Routes are tried in order and the first match wins. A pattern is a path whose `:name` segments match any one segment.

```ts
const routes: Route<LighthouseService>[] = [
  { method: "GET", pattern: "/lighthouses/:id", handler: getLighthouse },
  { method: "GET", pattern: "/lighthouses", handler: listTallerThan },
  { method: "PUT", pattern: "/lighthouses/:id", handler: renameLighthouse },
];
```

The matching functions are exported in case you need them:

```ts
matchPattern("/lighthouses/:id", "/lighthouses/fisgard") // { id: "fisgard" }
matchPattern("/lighthouses/:id", "/lighthouses")         // undefined
parseQuery("/lighthouses?minHeight=15&note=")            // { minHeight: "15", note: "" }
```

In this lab the route table is `src/server/routes.ts`. It holds every endpoint but one: T3 asks you to add the `extremes` row yourself.

## `dispatch`

```ts
dispatch(routes, toyService, method, url, body): Promise<HttpResponse>
```

`dispatch` splits `url` into path and query, finds the first route whose method and pattern match, builds the `HttpRequest`, calls the handler, and returns its response as a promise. Tests reach it through the test client. The server calls it for each request.

```ts
const response = await dispatch(routes, toyService, "GET", "/lighthouses/fisgard", undefined);
// response.status === 200, response.body is the Fisgard lighthouse

const bad = await dispatch(routes, toyService, "GET", "/lighthouses?minHeight=tall", undefined);
// bad.status === 400, bad.body is { error: "minHeight must be a number, got 'tall'" }

const renamed = await dispatch(routes, toyService, "PUT", "/lighthouses/fisgard", { name: "Fisgard Light" });
// the body object is passed straight through as request.body
```

Two cases to know:

* A URL that matches no route gets a `404` with the standard error body. No handler runs. A URL that matches a route but names an unknown `:id` does reach your handler, and that `404` is yours to return.
* A handler that throws is not caught here. In a test the exception fails the test, so a bug in a handler shows up as a failed test. The real server catches it and answers `500`.

```ts
await expect(dispatch(routes, toyService, "GET", "/explode", undefined)).rejects.toThrow("unexpected");
```

## The service (this lab's `Service`)

`src/server/service.ts` defines `TideService`, the state your handlers are given:

```ts
type StationInfo = { id: string; title: string; region: string; meanLevel: number; maxHeight: number };
type StationEntry = { info: StationInfo; station: TideStation };
type TideService = { stations: StationEntry[]; persistDir: string };

findStation(service, id): StationEntry | undefined   // look a station up by id
persistFile(service, id): string                     // where that station's readings persist
```

`startService(seeds, persistDir)` builds it: one `TideStation` per seed, each either rebuilt from its persisted file through your `loadStation` or, when there is no usable file, seeded from its readings through `record`. Every station's `readings()` is therefore chronological, which is what `passageWindows` requires.

## Testing with the test client

`src/server/framework/testClient.ts` runs the service in-process and calls `dispatch` directly. Every client gets its own temporary directory for persisted files, so tests never touch the shipped `data/` or each other.

```ts
type TestClient = {
  get: (path: string) => Promise<HttpResponse>;               // path may carry a query string
  post: (path: string, body: unknown) => Promise<HttpResponse>; // body is a value, not JSON text
  restart: () => Promise<void>;                               // stop and start again on the same files
  persistDir: string;                                         // where this client's stations persist
  stop: () => Promise<void>;                                  // remove the temporary directory
};

startTestClient(stations: StationSeed[]): Promise<TestClient>
reading(day, hour, height, phase = "new"): TideReading
station(id, readings, maxHeight = 6): StationSeed   // title "Station <id>", region "Test Coast", meanLevel 3
```

A test file starts with stations you know every answer for and a client started in `beforeEach` and stopped in `afterEach`. Each assertion checks one idea.

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { reading, startTestClient, station, type TestClient } from "../src/server/framework/testClient";

let client: TestClient;
beforeEach(async () => {
  client = await startTestClient([station("alpha", [reading(1, 0, 2.0), reading(1, 1, 3.5)]), station("beta", [], 3)]);
});
afterEach(async () => {
  await client.stop();
});

test("get returns the framework's 404 for a path no route matches", async () => {
  const response = await client.get("/nothing");
  expect(response.status).to.equal(404);
  expect(response.body).to.have.property("error").that.is.a("string");
});
```

A test of a state change is a sequence followed by an observation: call the endpoint that changes state, then call the endpoint that shows it. A test of persistence adds `await client.restart()` between the two. To test a corrupted file, write it yourself first:

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

await writeFile(join(client.persistDir, "alpha.json"), "this is not json {");
await client.restart();
const response = await client.get("/stations/alpha/readings");
// expect the seed readings: the bad file was ignored and nothing threw
```

Assertions you will use most, from vitest's chai-style `expect`:

| Assertion | Checks |
|---|---|
| `expect(x).to.equal(y)` | same primitive value (a status code) |
| `expect(x).to.deep.equal(y)` | same structure and values (a body) |
| `expect(x).to.have.property("error").that.is.a("string")` | a failure body |
| `expect(list).to.have.length(n)` | an array's length |
| `await expect(promise).rejects.toThrow()` | an async call that must fail |

`to.equal` on two arrays or objects compares identity and fails even when the contents match. Use `to.deep.equal` for bodies.

## Running a real server

```ts
startServer(routes, service, port, options?): Server
```

`src/start.ts` does this over the shipped dataset: `pnpm tsx src/start.ts`, then from another terminal:

```
curl http://localhost:3000/stations
curl "http://localhost:3000/stations/tofino/readings?day=12"
curl -X POST -d '{"day":31,"hour":0,"height":2.5,"phase":"new"}' http://localhost:3000/stations/tofino/readings
```

The server does two things a browser frontend needs:

* CORS is on by default. Every response has `Access-Control-Allow-Origin: *`, and an `OPTIONS` request gets a `204`. Pass `{ cors: false }` to turn it off.
* Static files. Pass `{ staticDir: "public" }` and a `GET` that matches no route is served from that directory. `/` serves `index.html`. A missing file is a `404` and a path outside the directory is a `403`. Routes take priority over files. Lab 5 uses this.

The server also answers `400` for a body that is not valid JSON and `500` for a handler that throws. Neither happens in tests, because tests pass `dispatch` a value, not JSON text, and exceptions reach the test.
