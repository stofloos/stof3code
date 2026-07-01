import * as Effect from "effect/Effect";

/**
 * Annotates both the current span and any spans created within `effect`.
 *
 * The self-hosted relay does not ship the Alchemy/Axiom tracing stack; spans are
 * emitted through whatever tracer the runtime provides (console/no-op by default).
 */
export const withSpanAttributes =
  (attributes: Record<string, unknown>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.annotateCurrentSpan(attributes).pipe(
      Effect.andThen(effect.pipe(Effect.annotateSpans(attributes))),
    );
