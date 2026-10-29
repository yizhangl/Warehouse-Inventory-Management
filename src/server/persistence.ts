// File helpers supplied in Project Phase 2; imports adapted for NodeNext.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { err, ok, type Result } from "../result.js";
/** Missing file succeeds with undefined. Unreadable/invalid JSON returns an error. */
export async function readJsonFile(
	path: string,
): Promise<Result<unknown, string>> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		)
			return ok(undefined);
		return err("could not read " + path + ": " + String(error));
	}
	try {
		return ok(JSON.parse(text));
	} catch {
		return err(path + " is not valid JSON");
	}
}
/** Saves the whole JSON value, creating parent directories; returns write errors. */
export async function writeJsonFile(
	path: string,
	value: unknown,
): Promise<Result<void, string>> {
	try {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, JSON.stringify(value, null, 2), "utf8");
		return ok(undefined);
	} catch (error) {
		return err("could not write " + path + ": " + String(error));
	}
}
