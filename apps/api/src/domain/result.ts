/**
 * Expected failures are values, not exceptions. A function that can fail in a
 * way the caller must handle returns a `Result`; `throw` is reserved for
 * defects (broken invariants, infrastructure outages).
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
