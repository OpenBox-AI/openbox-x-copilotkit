// Real in-memory access-grant store backed by node:sqlite. The lookup runs a
// genuine SQL SELECT through an instrumented connection so the OpenBox SDK's
// database instrumentation emits a db_query (database_select) span — the span
// that Core's file-read behavioral rule requires before a vault secret read.
//
// node:sqlite is experimental on Node 22 (stable on Node 24+), so the import is
// dynamic and guarded: if it is unavailable the lookup degrades to a no-op and
// the demo keeps running (without the db span) rather than crashing at import.

import { instrumentSqlite } from "@openbox-ai/openbox-sdk/copilotkit";

interface AccessGrantRow {
  grant_id: string;
  scope: string;
}

interface AccessStore {
  prepare(sql: string): { get(...params: unknown[]): unknown };
}

let store: AccessStore | null | undefined;

async function getStore(): Promise<AccessStore | null> {
  if (store !== undefined) return store;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(":memory:");
    db.exec(
      "CREATE TABLE access_grants (grant_id TEXT, subject TEXT, scope TEXT)",
    );
    db.exec(
      "INSERT INTO access_grants (grant_id, subject, scope) VALUES " +
        "('grant_demo', 'current_agent', 'vault:read')",
    );
    // Instrument the connection so prepared-statement queries emit db_query
    // spans into the active OpenBox capture scope.
    instrumentSqlite(db as unknown as Parameters<typeof instrumentSqlite>[0]);
    store = db as unknown as AccessStore;
  } catch (error) {
    console.warn(
      `[openbox-demo] access-grant store unavailable (node:sqlite): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    store = null;
  }
  return store;
}

/**
 * Look up the access grant for a subject via a real, instrumented SQL SELECT.
 * Returns the grant row when present; undefined when absent or the store is
 * unavailable. The side effect that matters for governance is the emitted
 * database_select span.
 */
export async function lookupAccessGrant(
  subject: string,
): Promise<AccessGrantRow | undefined> {
  const db = await getStore();
  if (!db) return undefined;
  const row = db
    .prepare("SELECT grant_id, scope FROM access_grants WHERE subject = ?")
    .get(subject);
  return (row as AccessGrantRow | undefined) ?? undefined;
}
