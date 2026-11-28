# Backend QA and edge-case guide

Load this for plans with a backend change (API, consumer, ledger, migration, vendor integration). It backs plan §4.1 and the QA "Backend" evidence row.

## Rules

- **Use the project's existing test harness** (real Postgres/Kafka via its own docker-compose, testcontainers or equivalent). If none exists, report the gap as a plan task; do not build one ad hoc. — Why: a bespoke harness is itself over-engineering.
- **Never call live vendors or production.** Use recorded fixtures or the vendor sandbox. — Why: real money and real messages are irreversible.
- **Assert state, not just return values:** query the DB or ledger after each scenario. — Why: a handler can return OK and still corrupt data.
- Evidence is the exact command, exit code, log excerpt and the invariant query output. Never claim a pass without seeing it.

## Edge-case catalogue (plan §4.1 rows)

| EC | What to try | Typical assertion |
| --- | --- | --- |
| EC-01 nil/empty | nil, empty string/slice/body, missing field, zero amount | clear rejection or no-op; no panic/NPE; no partial write |
| EC-02 duplicates | same request or event twice | one effect; second call returns the first result |
| EC-03 out-of-order | event N+1 before N; stale update after newer | state follows the version/sequence rule, not arrival order |
| EC-04 retries | caller, consumer or vendor retries after failure | no double effect; backoff bounded |
| EC-05 idempotency | same key, different payload; key reuse after expiry | conflict is detected; one row per key |
| EC-06 partial failure | fail after step N of M | state is consistent: all or nothing, or compensated |
| EC-07 rollback | migration down; reversal of a posting | data restored; reversal nets to zero |
| EC-08 timeouts | slow or silent vendor/DB | bounded wait; outcome unknown is handled, not assumed failed |
| EC-09 concurrency | parallel writers on the same row/account | no lost update, no overdraft; locking or constraint holds |
| EC-10 rounding | split, tax, FX, many small items, half-cent | integer minor units or decimal; sum of parts equals total |

## Replay tests (consumers and ledgers)

1. Fix a message sequence in a test file, including duplicates, a reorder, and a redelivery after a simulated crash before ack.
2. Feed it through the real handler against the real DB.
3. Assert final state and invariants: postings sum to zero, balance equals the sum of postings, one row per idempotency key, no negative balance unless the rules allow it.
4. Run the sequence twice; the second run must change nothing.

## Migrations

Run up, then down, then up on a seeded scratch database. Check row counts, constraints and that the old code still reads the new schema where a rolling deploy is expected. Never run against shared or production data.

## Vendor integrations

Replay recorded responses for success, decline, malformed body and 5xx. Use a fake slow server for timeouts. Assert that an unknown outcome leads to a reconcile path, not a silent retry that could double-charge.
