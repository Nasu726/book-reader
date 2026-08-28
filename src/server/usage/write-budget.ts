import { sql } from "drizzle-orm";

import { usageCounters } from "@/server/db/schema";
import type { Db } from "@/server/db/database";

/**
 * Write requests one reader may make in a day.
 *
 * D1's free tier allows 100,000 rows written a day across the whole account.
 * A single request here writes at most a handful of rows, so 2,000 requests
 * stays an order of magnitude below the ceiling while being far more than a
 * person reading a book can produce: a 400-page PDF read end to end saves 400
 * positions, and a long AI session adds two rows per exchange.
 *
 * Requests are counted rather than rows because that is what runs away. A loop,
 * a stuck retry, or someone hammering the API shows up as request count no
 * matter how many rows each one would have written.
 */
export const DEFAULT_DAILY_WRITE_BUDGET = 2000;

export function dailyWriteBudget(): number {
  const configured = Number(process.env.DAILY_WRITE_BUDGET);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_DAILY_WRITE_BUDGET;
}

/** The UTC calendar day, which is also the day D1's own quota resets on. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Counts one write against the reader's day, and refuses once it is spent.
 *
 * Returns the response to send back, or null to carry on. Call it after the
 * session check and before doing any work: the point is to stop before writing,
 * not to notice afterwards.
 *
 * The count is incremented first and judged second, in one statement, so two
 * requests arriving together cannot both read the same number and both pass.
 *
 * A failure to count lets the request through. The alternative fails closed,
 * which would mean that a missing table — a deployment that ran ahead of its
 * migration — silently turns every save in the application into an error. The
 * write this guards will fail on its own if the database is genuinely broken.
 */
export async function chargeWrite(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<Response | null> {
  const limit = dailyWriteBudget();
  let used: number;
  try {
    const [row] = await db
      .insert(usageCounters)
      .values({ day: utcDay(now), userId, writes: 1 })
      .onConflictDoUpdate({
        set: { writes: sql`${usageCounters.writes} + 1` },
        target: [usageCounters.userId, usageCounters.day],
      })
      .returning({ writes: usageCounters.writes });
    if (!row) return null;
    used = row.writes;
  } catch (error) {
    console.error("Write budget could not be counted:", error instanceof Error ? error.message : error);
    return null;
  }

  if (used <= limit) return null;
  return Response.json(
    {
      error: `Daily save limit reached (${limit} writes). This keeps the free tier from being exhausted. Try again tomorrow.`,
    },
    { status: 429 },
  );
}
