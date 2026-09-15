# GreenNode Map V2.6.5 — Test & Production Readiness Report

## Scope
- Baseline: V2.6.4 source provided by user.
- Goal: prepare an AgentBase-ready V2.6.5 without adding new product features.
- Test volume: 60,000 valuation snapshot records = 20,000 records x 3 periods (06/07/08-2026).

## Changes applied
- Frontend AI call changed from hard-coded `http://localhost:3001/...` to same-origin `/api/ai/query-plan`.
- Vite dev proxy added for local development.
- Express now supports runtime `PORT` and binds `0.0.0.0`.
- Express serves the production Vite `dist` folder so frontend + backend can run in one AgentBase container.
- `/health` retained for runtime checks.
- GreenNode model timeout added with `AbortController`; timeout is configurable by `GREENNODE_TIMEOUT_MS`.
- GreenNode base URL/model made environment-configurable.
- AI count/rank/location answers shortened for dashboard use.
- Added `.env.example`, `Dockerfile`, `.dockerignore`, deploy guide and production preflight test.

## Stress test result
- Asset master: 20,000
- Valuation snapshots: 60,000
- Collateral snapshots: 48,000
- Risk records: 2,399
- Risk assets: 06/2026 = 799; 07/2026 = 801; 08/2026 = 799
- 34 provinces per period
- Data-layer build: 256.23 ms
- Filter tests: 0.67–0.90 ms
- AI query planner/executor: average 60.37 ms; maximum 173.62 ms
- 6/6 stress assertions PASS

## Regression tests
- V2.6.4 location distribution: PASS
- V2.6.4 tied top ranking: PASS
- Tie/location regression: 2/2 PASS
- Expanded Risk Intent Planner scenarios: 29/29 PASS
- Production/AgentBase preflight: 9/9 PASS

## Production preflight checks
PASS: same-origin AI API; runtime PORT; 0.0.0.0 bind; Vite dist served; health endpoint; model timeout; API key server-side; local dev proxy; production start command.

## Remaining actions on deployment machine
1. Run `npm ci` and `npm run build`. The sandbox used for this handoff could not finish downloading npm dependencies, so the final Vite production bundle must be compiled once on the deployment machine.
2. Pull/import the official `greennode-agentbase-skills` repo into the project as required by the training handbook.
3. Set credentials locally/runtime only; do not commit them.
4. Run local production smoke test, then ask OpenCode: `Giúp tôi deploy agent lên GreenNode AgentBase`.
5. Verify Agent Runtime is live/running and test Map + AI Query end-to-end.
