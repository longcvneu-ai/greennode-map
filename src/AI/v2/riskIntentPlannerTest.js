import { createRiskIntentPlan } from './riskIntentPlanner.js'
import { validateQueryPlan } from './queryPlanValidator.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'

const cases = [
  'Tài sản định giá rủi ro tập trung ở đâu trong tháng 8/2026?',
  'Hà Nội phát sinh case tài sản nào sai trong tháng 08/2026?',
  'Tài sản sai phương pháp định giá là tài sản nào và thời điểm lúc nào?',
  'Hồ Chí Minh có phát sinh case tài sản nào rủi ro không?',
  'Tài sản không có rủi ro tập trung ở tỉnh, thành phố nào?',
  'Đơn vị nào có nhiều case sai nhất?',
  'tài sản sai vị tri ở thành phố nào và thời điểm nào',
  '2 tài sản rủi ro nằm ở địa bàn nào và thời điểm phát sinh',
  '01 case TS sai phương pháp định giá tập trung tỉnh, thành phố nào? thời điểm phát hiện ra',
]

let failed = 0

for (const [index, question] of cases.entries()) {
  const plan = createRiskIntentPlan(question, { defaultPeriod: '2026-08-31' })
  const validation = validateQueryPlan(plan)

  if (!plan || !validation.valid) {
    failed += 1
    console.error(`FAIL ${index + 1}`, question, validation.errors)
    continue
  }

  const result = executeQueryPlan(plan)

  if (!result.success) {
    failed += 1
    console.error(`FAIL ${index + 1}`, question, result.errors)
    continue
  }

  console.log(`PASS ${index + 1}: ${formatQueryAnswer(plan, result)}`)
}


// Regression assertions for the semantic bugs found in UI testing.
{
  const noRiskPlan = createRiskIntentPlan(
    'Tài sản không có rủi ro tập trung ở tỉnh, thành phố nào?',
    { defaultPeriod: '2026-08-31' }
  )
  const noRiskResult = executeQueryPlan(noRiskPlan)
  const totalNoRisk = Array.isArray(noRiskResult.data)
    ? noRiskResult.data.reduce((sum, row) => sum + row.value, 0)
    : 0

  if (totalNoRisk !== 98 || noRiskResult.metadata?.matchedRecordCount !== 98) {
    failed += 1
    console.error('FAIL COUNT SEMANTICS: expected 98 no-risk assets in current period.', noRiskResult)
  } else {
    console.log('PASS COUNT SEMANTICS: 98 no-risk assets in current period.')
  }
}

{
  const rankPlan = createRiskIntentPlan(
    'Đơn vị nào có nhiều case sai nhất?',
    { defaultPeriod: '2026-08-31' }
  )
  const rankResult = executeQueryPlan(rankPlan)
  if (rankResult.data?.[0]?.value !== 3) {
    failed += 1
    console.error('FAIL RISK CASE COUNT: expected 3 risk cases for top unit.', rankResult)
  } else {
    console.log('PASS RISK CASE COUNT: counts risk records, not asset rows.')
  }
}

{
  const timePlan = createRiskIntentPlan(
    '01 case TS sai phương pháp định giá tập trung tỉnh, thành phố nào? thời điểm phát hiện ra',
    { defaultPeriod: '2026-08-31' }
  )
  const timeAnswer = formatQueryAnswer(timePlan, executeQueryPlan(timePlan))
  if (!timeAnswer.includes('tháng 8/2026')) {
    failed += 1
    console.error('FAIL TIME OUTPUT: expected answer to preserve detection period.', timeAnswer)
  } else {
    console.log('PASS TIME OUTPUT: requested time is preserved in the answer.')
  }
}

if (failed > 0) {
  process.exitCode = 1
  console.error(`\n${failed}/${cases.length} cases failed.`)
} else {
  console.log(`\nPASS ${cases.length}/${cases.length} Risk Intent Planner cases.`)
}
