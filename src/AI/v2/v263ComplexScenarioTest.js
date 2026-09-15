import { createRiskIntentPlan } from './riskIntentPlanner.js'
import { validateQueryPlan } from './queryPlanValidator.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'

const cases = [
  ['C01', 'loại tài sản rủi ro là tài sản gì', 'DIMENSION_DISTRIBUTION', 'assetType'],
  ['C02', 'loại tài sản nào có rủi ro', 'DIMENSION_DISTRIBUTION', 'assetType'],
  ['C03', 'loại tài sản nào có nhiều rủi ro nhất', 'RANK_DIMENSION', 'assetType'],
  ['C04', 'loại hình tài sản nào có nhiều tài sản rủi ro nhất', 'RANK_DIMENSION', 'assetType'],
  ['C05', 'địa bàn có nhiều rủi ro nhất', 'RANK_DIMENSION', 'province'],
  ['C06', 'tỉnh có nhiều tài sản rủi ro nhất', 'RANK_DIMENSION', 'province'],
  ['C07', 'thành phố nào có nhiều rủi ro nhất', 'RANK_DIMENSION', 'province'],
  ['C08', 'tài sản rủi ro tập trung ở đâu', 'DISTRIBUTION', null],
  ['C09', 'nhóm tài sản rủi ro là nhóm gì', 'DIMENSION_DISTRIBUTION', 'assetGroup'],
  ['C10', 'nhóm tài sản nào có nhiều rủi ro nhất', 'RANK_DIMENSION', 'assetGroup'],
  ['C11', 'đơn vị định giá nào có nhiều rủi ro nhất', 'RANK_DIMENSION', 'valuationUnit'],
  ['C12', 'loại rủi ro nào có nhiều case nhất', 'RANK_DIMENSION', 'valuationRisk'],
  ['C13', 'loại rủi ro là gì', 'DIMENSION_DISTRIBUTION', 'valuationRisk'],
  ['C14', 'tài sản rủi ro tập trung vào tháng mấy', 'RANK_DIMENSION', 'queryPeriod'],
  ['C15', 'kỳ nào có nhiều tài sản rủi ro nhất', 'RANK_DIMENSION', 'queryPeriod'],
]

let failed = 0
for (const [id, q, intent, dimension] of cases) {
  const plan = createRiskIntentPlan(q, { defaultPeriod: '2026-08-31' })
  const valid = validateQueryPlan(plan)
  const ok = valid.valid && plan?.answerContext?.intent === intent && (dimension === null || plan?.answerContext?.groupDimension === dimension)
  if (!ok) {
    failed++
    console.error(`FAIL ${id}: ${q}`)
    console.error(JSON.stringify(plan, null, 2))
  } else {
    const result = executeQueryPlan(plan)
    const answer = result?.success ? formatQueryAnswer(plan, result) : 'execution failed'
    console.log(`PASS ${id}: ${q} -> ${answer}`)
  }
}

if (failed) {
  console.error(`\nV2.6.3 COMPLEX SCENARIOS: ${failed}/${cases.length} failed.`)
  process.exit(1)
}
console.log(`\nV2.6.3 COMPLEX SCENARIOS: ${cases.length}/${cases.length} passed.`)
