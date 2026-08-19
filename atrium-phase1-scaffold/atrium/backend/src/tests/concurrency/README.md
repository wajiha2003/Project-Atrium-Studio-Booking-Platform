# Concurrency proof tests

PHASE 8 target. This folder holds the mandatory proof from brief section 05:

- `room-concurrency.test.ts` — 200 simultaneous booking requests against the
  same room + same 1-hour slot, fired across all 3 API replicas behind the
  local load balancer (not in-process). Assert exactly 1 success (`201`/`200`)
  and 199 clean `409`s. Zero `500`s, zero duplicate confirmations.
- `equipment-concurrency.test.ts` — same pattern against an EquipmentType
  with exactly 3 units owned; assert reserved units never exceed 3 at any
  overlapping instant.

These tests hit the real HTTP layer (via the load balancer URL, not
`buildApp()` + Supertest in-process) and a real Postgres instance — never
mocked — because the whole point is proving the mechanism holds across
separate processes, not just within one.

Output must be pasted into `ARCHITECTURE.md` per the brief.
