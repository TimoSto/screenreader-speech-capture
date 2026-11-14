import * as v from 'valibot';

/** A schema of the API contract (`SpeechEntrySchema`, …). */
export type DtoSchema = v.GenericSchema;

/** The DTO type a schema describes. */
export type DtoOf<S extends DtoSchema> = v.InferOutput<S>;

/** What {@link checkDto} found: the DTO, or the first field that doesn't match and why. */
export type DtoCheck<S extends DtoSchema> =
  | { readonly ok: true; readonly value: DtoOf<S> }
  | { readonly ok: false; readonly field: string; readonly message: string };

/**
 * Checks `value` against `schema`. Unknown keys don't fail it and are left out of the result: a
 * newer bridge of the same major version may add fields.
 */
export function checkDto<S extends DtoSchema>(schema: S, value: unknown): DtoCheck<S> {
  const result = v.safeParse(schema, value);
  if (result.success) return { ok: true, value: result.output };
  const [issue] = result.issues;
  return { ok: false, field: v.getDotPath(issue) ?? '(body)', message: issue.message };
}

/** Just enough of `GET /status` to check the API version before anything else. */
export const ApiVersionSchema = v.object({ bridge: v.object({ apiVersion: v.string() }) });

/**
 * An error body as a client must accept it: like `ErrorBodySchema`, but with any `code`, since
 * new codes may come in minor versions.
 */
export const AnyErrorBodySchema = v.object({
  error: v.object({
    code: v.string(),
    message: v.string(),
    details: v.optional(v.record(v.string(), v.unknown())),
  }),
});
