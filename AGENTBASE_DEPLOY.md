# GreenNode Map V2.6.5 — AgentBase Ready

## Local verification
1. `npm ci`
2. Create `.env` from `.env.example` and set `GREENNODE_API_KEY` locally.
3. Terminal A: `npm run start`
4. Terminal B: `npm run dev`
5. Open the Vite URL and verify Map + AI Query.
6. Production test: `npm run build && npm run start`, then open `http://localhost:8080`.

## AgentBase
Per the MSB x GreenNode Training 2026 handbook, import the official `greennode-agentbase-skills` repository into the project, then ask the coding tool: `Giúp tôi deploy agent lên GreenNode AgentBase`.

Credentials are entered locally/runtime only: `GREENNODE_CLIENT_ID`, `GREENNODE_CLIENT_SECRET`, and `GREENNODE_API_KEY`. Do not commit them.

## Production behavior
- Frontend calls `/api/ai/query-plan` on the same origin.
- Express serves both the API and the built React UI.
- Runtime port comes from `PORT`; host binds `0.0.0.0`.
- `/health` is available for runtime checks.
- GreenNode model calls have a configurable timeout.

## AgentBase skill import status in this handoff
The application code is AgentBase-ready. The official skill repository is intentionally not vendored into this ZIP; import/pull it in OpenCode on the deployment machine as required by the training handbook. This keeps the app package clean and avoids committing external skill code.
