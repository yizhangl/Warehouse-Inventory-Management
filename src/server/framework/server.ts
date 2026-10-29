import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve as resolvePath, sep } from "node:path";
import type { Result } from "@ubccpsc/210-toolkit/core";
import { dispatch, fail, findRoute, type HttpMethod, type HttpResponse, pathOf, type Route } from "./router.js";

/**
 * The framework's HTTP listener. It turns requests into request records and
 * writes handlers' responses back as JSON. Tests do not use it; they call
 * `dispatch` through the test client.
 *
 * It also answers CORS requests and serves static files: anything in
 * `staticDir` whose path matches no route.
 *
 * You should not need to modify this file.
 */
export type ServerOptions = {
	/** Send permissive CORS headers and answer preflight requests. Defaults to true. */
	cors?: boolean;
	/** A directory of files to serve for GETs that match no route. "/" serves index.html. */
	staticDir?: string;
};

/** Content types for static files, by extension. Anything else is octet-stream. */
const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".txt": "text/plain; charset=utf-8",
};

/** A response whose body is raw bytes with a content type, not JSON. */
type FileResponse = { status: number; contentType: string; content: Buffer };

/**
 * Reads a request's body as one UTF-8 string.
 *
 * @param {IncomingMessage} request the request
 * @returns {Promise<string>} the body, or "" if there was none; rejects if the stream errors
 */
function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject): void => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer): void => {
			chunks.push(chunk);
		});
		request.on("end", (): void => {
			resolve(Buffer.concat(chunks).toString("utf8"));
		});
		request.on("error", reject);
	});
}

/**
 * Parses a request body as JSON.
 *
 * @param {string} text the raw body
 * @returns {Result<unknown, string>} the parsed value (undefined for an empty body), or
 *   "request body is not valid JSON"
 */
function parseBody(text: string): Result<unknown, string> {
	if (text === "") {
		return { ok: true, value: undefined };
	}
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false, error: "request body is not valid JSON" };
	}
}

/** The methods `dispatch` accepts. */
const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE"];

/**
 * Reads the file under `staticDir` that `path` names, refusing a path that resolves outside it.
 *
 * @param {string} staticDir the directory files are served from
 * @param {string} path the request path; a trailing "/" means its index.html
 * @returns {Promise<FileResponse | HttpResponse>} the file's bytes and content type; 403 for a
 *   path outside the directory; 404 for a missing file
 */
async function serveFile(staticDir: string, path: string): Promise<FileResponse | HttpResponse> {
	const relative = path.endsWith("/") ? path + "index.html" : path;
	const root = resolvePath(staticDir);
	const file = resolvePath(root, "." + decodeURIComponent(relative));
	if (!file.startsWith(root + sep)) {
		return fail(403, "path is outside the static directory");
	}
	try {
		const content = await readFile(file);
		return { status: 200, contentType: CONTENT_TYPES[extname(file)] ?? "application/octet-stream", content: content };
	} catch {
		return fail(404, "no route or file matches GET " + path);
	}
}

/**
 * Handles one API request: parses the body, dispatches it, and turns an uncaught error into a 500.
 *
 * @param {Route<Service>[]} routes the route table
 * @param {Service} service the state handlers are given
 * @param {HttpMethod} method the request method, one the framework routes
 * @param {IncomingMessage} request the request
 * @returns {Promise<HttpResponse>} the handler's response; 400 for a body that is not JSON; 404
 *   if no route matches; 500 if the handler threw
 */
async function handleApi<Service>(
	routes: Route<Service>[],
	service: Service,
	method: HttpMethod,
	request: IncomingMessage,
): Promise<HttpResponse> {
	const body = parseBody(await readBody(request));
	if (!body.ok) {
		return fail(400, body.error);
	}
	try {
		return await dispatch(routes, service, method, request.url ?? "/", body.value);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return fail(500, "handler threw: " + message);
	}
}

/**
 * Handles one request: a CORS preflight, a static file, an API call, or a 405 for any other method.
 *
 * @param {Route<Service>[]} routes the route table
 * @param {Service} service the state handlers are given
 * @param {ServerOptions} options the CORS and static-directory settings
 * @param {IncomingMessage} request the request
 * @returns {Promise<FileResponse | HttpResponse>} a JSON response, or a file for static content
 */
function handle<Service>(
	routes: Route<Service>[],
	service: Service,
	options: ServerOptions,
	request: IncomingMessage,
): Promise<FileResponse | HttpResponse> {
	const name = request.method ?? "GET";
	const url = request.url ?? "/";
	if (name === "OPTIONS" && options.cors !== false) {
		return Promise.resolve({ status: 204, body: undefined });
	}
	const method = METHODS.find((known: HttpMethod): boolean => known === name);
	if (method === undefined) {
		return Promise.resolve(fail(405, "unsupported method " + name));
	}
	if (method === "GET" && options.staticDir !== undefined && findRoute(routes, method, pathOf(url)) === undefined) {
		return serveFile(options.staticDir, pathOf(url));
	}
	return handleApi(routes, service, method, request);
}

/**
 * Writes a response: a file's bytes with its content type, or the body as JSON.
 *
 * @param {ServerResponse} response the outgoing response
 * @param {FileResponse | HttpResponse} result what to send; a 204 has no body, and an undefined
 *   JSON body is sent as null
 * @param {boolean} cors whether to add the CORS headers
 * @returns {void}
 */
function send(response: ServerResponse, result: FileResponse | HttpResponse, cors: boolean): void {
	if (cors) {
		response.setHeader("Access-Control-Allow-Origin", "*");
		response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
		response.setHeader("Access-Control-Allow-Headers", "Content-Type");
	}
	response.statusCode = result.status;
	if ("content" in result) {
		response.setHeader("Content-Type", result.contentType);
		response.end(result.content);
		return;
	}
	response.setHeader("Content-Type", "application/json");
	response.end(result.status === 204 ? undefined : JSON.stringify(result.body ?? null));
}

/**
 * Starts listening on `port`, routing every request through `routes`.
 *
 * @param {Route<Service>[]} routes the route table
 * @param {Service} service the state handlers are given
 * @param {number} port the TCP port
 * @param {ServerOptions} options CORS (on by default) and an optional static directory
 * @returns {Server} the server, so a caller can close it
 */
export function startServer<Service>(
	routes: Route<Service>[],
	service: Service,
	port: number,
	options: ServerOptions = {},
): Server {
	const cors = options.cors !== false;
	const server = createServer(async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
		try {
			send(response, await handle(routes, service, options, request), cors);
		} catch (error) {
			send(response, fail(500, String(error)), cors);
		}
	});
	server.listen(port);
	return server;
}
