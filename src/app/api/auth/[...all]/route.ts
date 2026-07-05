import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

const handlers = toNextJsHandler(auth.handler);

// getDb() runs the schema (including the auth tables) before better-auth
// touches the database — otherwise a sign-in on a cold, empty database would
// hit "no such table". It's memoized, so this is one await after warmup.
export async function GET(request: Request) {
  await getDb();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  await getDb();
  return handlers.POST(request);
}
