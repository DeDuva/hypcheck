/**
 * Structured logging built for debugging on Vercel.
 *
 * In production every line is a single JSON object (greppable/queryable in the
 * Vercel log drain); in dev it's a compact human-readable line. Bind a context
 * once with `logger.child({ runId })` and every line from that logger carries
 * the correlation id, so one research run can be traced end to end.
 */

type Level = "debug" | "info" | "warn" | "error";
type Ctx = Record<string, unknown>;

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isProd = process.env.NODE_ENV === "production";

function thresholdWeight(): number {
  const configured = process.env.HYPCHECK_LOG_LEVEL?.toLowerCase() as Level | undefined;
  if (configured && configured in LEVEL_WEIGHT) return LEVEL_WEIGHT[configured];
  return isProd ? LEVEL_WEIGHT.info : LEVEL_WEIGHT.debug;
}

/** Next.js uses thrown errors with a `digest` for redirect()/notFound() control flow. */
export function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

export function serializeError(err: unknown): Ctx {
  if (err instanceof Error) {
    const out: Ctx = { name: err.name, message: err.message, stack: err.stack };
    // Anthropic APIError and libSQL errors carry extra diagnostic fields.
    const extra = err as unknown as { status?: unknown; type?: unknown; code?: unknown; requestID?: unknown };
    if (extra.status !== undefined) out.status = extra.status;
    if (extra.type !== undefined) out.type = extra.type;
    if (extra.code !== undefined) out.code = extra.code;
    if (extra.requestID !== undefined) out.requestID = extra.requestID;
    return out;
  }
  return { value: String(err) };
}

function safeStringify(obj: Ctx): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[circular]";
      seen.add(value);
    }
    return value;
  });
}

function emit(level: Level, event: string, ctx: Ctx): void {
  if (LEVEL_WEIGHT[level] < thresholdWeight()) return;
  const record: Ctx = { t: new Date().toISOString(), level, event, ...ctx };

  if (isProd) {
    const line = safeStringify(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }

  // Dev: readable single line, e.g. "12:04:33 INFO engine.run.recorded runId=a1b2 ms=142 score=71"
  const { t, ...rest } = record;
  const time = new Date(t as string).toLocaleTimeString("en-US", { hour12: false });
  const parts = Object.entries(rest)
    .filter(([k]) => k !== "level" && k !== "event")
    .map(([k, v]) => `${k}=${typeof v === "object" && v !== null ? safeStringify(v as Ctx) : String(v)}`);
  const label = `${time} ${level.toUpperCase().padEnd(5)} ${event}`;
  const message = parts.length ? `${label} ${parts.join(" ")}` : label;
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.log(message);
}

export class Logger {
  constructor(private readonly base: Ctx = {}) {}

  child(ctx: Ctx): Logger {
    return new Logger({ ...this.base, ...ctx });
  }

  debug(event: string, ctx: Ctx = {}): void {
    emit("debug", event, { ...this.base, ...ctx });
  }
  info(event: string, ctx: Ctx = {}): void {
    emit("info", event, { ...this.base, ...ctx });
  }
  warn(event: string, ctx: Ctx = {}): void {
    emit("warn", event, { ...this.base, ...ctx });
  }
  error(event: string, ctx: Ctx = {}): void {
    emit("error", event, { ...this.base, ...ctx });
  }

  /**
   * Time an async operation. Logs `<event>.start` (debug), then `<event>.ok`
   * (info) with `ms`, or `<event>.fail` (error) with the serialized error and
   * `ms`. Next.js redirect()/notFound() control-flow throws are logged as `ok`
   * (redirect: true), not as failures.
   */
  async span<T>(event: string, fn: () => Promise<T>, ctx: Ctx = {}): Promise<T> {
    const start = Date.now();
    this.debug(`${event}.start`, ctx);
    try {
      const result = await fn();
      this.info(`${event}.ok`, { ...ctx, ms: Date.now() - start });
      return result;
    } catch (err) {
      const ms = Date.now() - start;
      if (isNextControlFlow(err)) {
        this.info(`${event}.ok`, { ...ctx, ms, redirect: true });
      } else {
        this.error(`${event}.fail`, { ...ctx, ms, err: serializeError(err) });
      }
      throw err;
    }
  }
}

export const logger = new Logger();

/** Short correlation id for tracing one request/run across log lines. */
export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}
