# V2.6.7 Candidate v10 — Logic Audit

Core invariants locked before UI/deploy:

1. Numeric facts come from deterministic engines, not the LLM.
2. Current risk and persistent risk are separate domains; insufficient periods must stop persistent queries.
3. KPI, AI, table and map use the same active dataset/scope.
4. Ranking never discards ties. All co-leaders survive executor -> RiskContext -> formatter -> UI text.
5. No arbitrary tie-break is allowed unless an explicit deterministic secondary criterion exists.
6. Unsupported credit/default/loss/fraud/legal conclusions remain blocked.
7. Missing/absent period is explicit; no stale period inheritance.
8. Performance regression remains under the existing 500 ms deterministic-query target on the 60K harness.
