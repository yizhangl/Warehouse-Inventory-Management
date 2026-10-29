/**
 * The course-provided REST framework, used in Labs 3 and 4 and in Phase 2 of
 * the project. FRAMEWORK.md documents it.
 *
 * A handler turns a request record into a response record. The framework
 * matches a URL to a route, extracts its path and query parameters, and (in
 * `server.ts`) listens for HTTP requests.
 *
 * You should not need to change anything in this directory.
 */

/** The request methods the framework routes. Anything else is answered 405 by the server. */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * What a handler receives.
 *
 * For example, the request `GET /stations/tofino/readings?day=12`, matched by
 * the route pattern "/stations/:id/readings", arrives as:
 *
 *   {
 *     method: "GET",
 *     path: "/stations/tofino/readings",
 *     params: { id: "tofino" },   // the :id segment of the pattern
 *     query: { day: "12" },       // the part after "?", as strings
 *     body: undefined             // a GET has no body
 *   }
 *
 * and `POST /stations/tofino/readings` with the JSON text
 * {"day": 31, "hour": 0, "height": 2.5, "phase": "new"} arrives as:
 *
 *   {
 *     method: "POST",
 *     path: "/stations/tofino/readings",
 *     params: { id: "tofino" },
 *     query: {},                  // no "?" in the URL
 *     body: { day: 31, hour: 0, height: 2.5, phase: "new" }
 *   }
 *
 * What a handler reads from it:
 * - `request.params.id`: the `:id` path segment, a string, present whenever
 *   the route has one. The handler checks whether a station has that id.
 * - `request.query.<name>`: a query-string parameter as a string: `"12"` for
 *   `?day=12`, `""` for `?day=`, and undefined when absent. The handler
 *   parses and checks it.
 * - `request.body`: for a POST, what JSON.parse made of the request's text:
 *   an object, an array, a number, a string, `null`, or undefined when there
 *   was no body. Its shape is unchecked, so its type is `unknown`; the
 *   handler checks it (through validate.ts) before reading a field.
 * - `method` and `path`: already used to choose the handler; rarely needed.
 *
 * INVARIANTS:
 * - params holds one URL-decoded string per `:name` segment of the matched
 *   route pattern
 * - query holds the query-string parameters as strings; an absent parameter
 *   is undefined, and `?day=` gives ""
 * - body is the parsed JSON body, or undefined when there was none; its shape
 *   is unchecked
 */
export type HttpRequest = {
	method: HttpMethod;
	path: string;
	params: Record<string, string>;
	query: Partial<Record<string, string>>;
	body: unknown;
};

/**
 * What a handler returns: an HTTP status code and a JSON-serialisable body.
 */
export type HttpResponse = {
	status: number;
	body: unknown;
};

/**
 * The body every failure response carries.
 */
export type ErrorBody = {
	error: string;
};

/**
 * A handler: checks the request, calls the model, and turns the answer into a
 * response, returned directly or as a promise.
 */
export type Handler<Service> = (request: HttpRequest, service: Service) => HttpResponse | Promise<HttpResponse>;

/**
 * One row of the route table: `pattern` is a path with `:name` segments.
 */
export type Route<Service> = {
	method: HttpMethod;
	pattern: string;
	handler: Handler<Service>;
};

/**
 * A success response.
 *
 * @param {number} status the status code, usually 200 or 201
 * @param {unknown} body the JSON-serialisable body
 * @returns {HttpResponse} the response
 */
export function respond(status: number, body: unknown): HttpResponse {
	return { status: status, body: body };
}

/**
 * A failure response, with the body { error: message }.
 *
 * @param {number} status the status code, such as 400 or 404
 * @param {string} message the error message
 * @returns {HttpResponse} the response
 */
export function fail(status: number, message: string): HttpResponse {
	const body: ErrorBody = { error: message };
	return { status: status, body: body };
}

/**
 * The response a stub handler returns for an endpoint not written yet.
 *
 * @param {string} name the endpoint's name
 * @returns {Promise<HttpResponse>} 501 with "<name> is not implemented"
 */
export function notImplemented(name: string): Promise<HttpResponse> {
	return Promise.resolve(fail(501, name + " is not implemented"));
}

/**
 * A URL's path, without its query string.
 *
 * @param {string} url a path and optional query string, such as "/stations/x?day=3"
 * @returns {string} everything before the first "?"
 */
export function pathOf(url: string): string {
	const index = url.indexOf("?");
	return index < 0 ? url : url.slice(0, index);
}

/**
 * A path's non-empty segments: "/a//b/" gives ["a", "b"].
 *
 * @param {string} path a path or route pattern
 * @returns {string[]} the segments, in order
 */
function segmentsOf(path: string): string[] {
	return path.split("/").filter((segment: string): boolean => segment !== "");
}

/**
 * Matches a path against a route pattern.
 *
 * @param {string} pattern a route pattern, such as "/stations/:id/readings"
 * @param {string} path a request path, such as "/stations/tofino/readings"
 * @returns {Record<string, string> | undefined} the URL-decoded `:name` parameters, or undefined
 *   if the path does not match
 */
export function matchPattern(pattern: string, path: string): Record<string, string> | undefined {
	const patternParts = segmentsOf(pattern);
	const pathParts = segmentsOf(path);
	if (patternParts.length !== pathParts.length) {
		return undefined;
	}
	const params: Record<string, string> = {};
	for (const [index, part] of patternParts.entries()) {
		const actual = pathParts[index];
		if (part.startsWith(":")) {
			params[part.slice(1)] = decodeURIComponent(actual);
		} else if (part !== actual) {
			return undefined;
		}
	}
	return params;
}

/**
 * A URL's query-string parameters. A repeated parameter keeps its last value.
 *
 * @param {string} url a path and optional query string, such as "/stations/x?day=3"
 * @returns {Partial<Record<string, string>>} the URL-decoded values by name; `?day=` gives "",
 *   and an absent parameter is undefined
 */
export function parseQuery(url: string): Partial<Record<string, string>> {
	const index = url.indexOf("?");
	if (index < 0) {
		return {};
	}
	const query: Partial<Record<string, string>> = {};
	for (const [key, value] of new URLSearchParams(url.slice(index + 1))) {
		query[key] = value;
	}
	return query;
}

/**
 * Routes one request to the first matching handler. If the handler throws or rejects, the
 * returned promise rejects with its error, which the server turns into a 500.
 *
 * @param {Route<Service>[]} routes the route table
 * @param {Service} service the state handlers are given
 * @param {HttpMethod} method the request method
 * @param {string} url the path and query string, such as "/stations/x?day=3"
 * @param {unknown} body the parsed JSON body, or undefined
 * @returns {Promise<HttpResponse>} the handler's response, or 404 if no route matches
 */
export async function dispatch<Service>(
	routes: Route<Service>[],
	service: Service,
	method: HttpMethod,
	url: string,
	body: unknown,
): Promise<HttpResponse> {
	const path = pathOf(url);
	const match = findRoute(routes, method, path);
	if (match === undefined) {
		return fail(404, "no route matches " + method + " " + path);
	}
	const request: HttpRequest = { method, path, params: match.params, query: parseQuery(url), body };
	return await match.route.handler(request, service);
}

/**
 * The first route matching a method and path, with its captured parameters.
 *
 * @param {Route<Service>[]} routes the route table
 * @param {HttpMethod} method the request method
 * @param {string} path the request path, without a query string
 * @returns {{ route: Route<Service>; params: Record<string, string> } | undefined} the route and
 *   its parameters, or undefined if none matches
 */
export function findRoute<Service>(
	routes: Route<Service>[],
	method: HttpMethod,
	path: string,
): { route: Route<Service>; params: Record<string, string> } | undefined {
	for (const route of routes) {
		if (route.method !== method) {
			continue;
		}
		const params = matchPattern(route.pattern, path);
		if (params !== undefined) {
			return { route: route, params: params };
		}
	}
	return undefined;
}
