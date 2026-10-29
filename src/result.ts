export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export function ok<T>(value: T): Result<T, string> {
	return { ok: true, value };
}
export function err(error: string): Result<never, string> {
	return { ok: false, error };
}
