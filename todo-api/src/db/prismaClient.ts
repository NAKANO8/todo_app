import { config } from "dotenv";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

config({ quiet: true });

// task 3.2 (orm-migration) review follow-up: when given a bare connection
// string, @prisma/adapter-mariadb forces `prepareCacheLength=0` unless the
// URL already sets it (see node_modules/@prisma/adapter-mariadb PrismaMariaDb
// constructor), which disables the mariadb driver's prepared-statement LRU
// cache. With the cache off, every call the adapter makes (both
// prisma.$executeRaw/$queryRaw and the fluent model API, which route through
// the same performIO()) round-trips PREPARE -> EXECUTE -> CLOSE against
// MySQL 8 (confirmed via node_modules/mariadb/lib/connection.js
// prepareExecute(): our DB is MySQL, not MariaDB, so the pipelining shortcut
// there doesn't apply, leaving 2 sequential blocking round trips + 1 async
// close) instead of the single round trip mysql2's pool.query() used (text
// protocol, no prepare/execute split). Benchmarked against the local dev DB
// with 200 sequential identical queries: mysql2 ~0.68ms/call vs Prisma's
// default (adapter-forced no-cache) ~1.74ms/call (~2.6x). Enabling the
// prepare cache restores near-parity (~0.85ms/call) without changing wire
// protocol or result type mapping, by letting repeated identical SQL text
// (e.g. AuthRepository.updateRole/updateStatus's static statements) reuse a
// cached prepared statement instead of re-preparing on every call.
//
// This alone does not guarantee auth.repository.concurrency.test.ts's
// concurrent calls stay under Vitest's test timeout -- this sandbox has its
// own documented pre-existing DB-contention issues (tasks.md Implementation
// Notes 2.1-2.3, present before any Prisma work) that are outside this
// spec's control -- but it removes a genuine, avoidable per-call latency
// regression this migration introduced, so it's applied regardless. The
// test-timeout/hang scenario itself is defended independently and
// unconditionally by the afterEach-based DB-state repair in
// auth.repository.concurrency.test.ts / auth.repository.test.ts, which does
// not depend on this (or any) latency improvement to hold.
const rawUrl = process.env.DATABASE_URL as string;
const url = new URL(rawUrl);
if (!url.searchParams.has("prepareCacheLength")) {
  url.searchParams.set("prepareCacheLength", "256");
}

const adapter = new PrismaMariaDb(url.toString());

export const prisma = new PrismaClient({ adapter });
