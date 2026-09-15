import { createQueryPlanFromGreenNode } from './greennodeAdapter.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'
import { getReportingPeriods } from '../../services/assetService.js'

const periods = getReportingPeriods()
const defaultPeriod = periods.at(-1) || null
let passed = 0
let failed = 0

async function check(question, predicate) {
  try {
    const plan = await createQueryPlanFromGreenNode(question, undefined, { defaultPeriod })
    if (plan?.engine === 'RISK_CONTEXT') {
      const ok = predicate({ plan, answer: '', result: null })
      if (!ok) throw new Error(`unexpected RISK_CONTEXT: ${JSON.stringify(plan)}`)
    } else {
      const result = executeQueryPlan(plan)
      const answer = formatQueryAnswer(plan, result)
      const ok = predicate({ plan, answer, result })
      if (!ok) throw new Error(`answer=${answer} plan=${JSON.stringify(plan)}`)
    }
    passed++
    console.log(`PASS: ${question}`)
  } catch (error) {
    failed++
    console.error(`FAIL: ${question}\n  ${error.message}`)
  }
}

await check('Địa bàn Hà Nội có bao nhiêu tài sản bảo đảm?', ({plan, answer}) =>
  plan?.steps?.some(s => s.action === 'AGGREGATE' && s.metric === 'TOTAL_COLLATERAL') &&
  plan?.steps?.some(s => s.action === 'FILTER' && s.field === 'province' && s.value === 'Hà Nội') &&
  /Hà Nội/i.test(answer)
)
await check('Hà Nội có bao nhiêu TSBĐ?', ({plan}) =>
  plan?.steps?.some(s => s.action === 'AGGREGATE' && s.metric === 'TOTAL_COLLATERAL')
)
await check('Hà Nội có bao nhiêu tài sản đảm bảo?', ({plan}) =>
  plan?.steps?.some(s => s.action === 'AGGREGATE' && s.metric === 'TOTAL_COLLATERAL')
)
await check('Phân tích tình hình rủi ro tài sản hiện tại và đề xuất 2 việc cần ưu tiên kiểm tra.', ({plan}) =>
  plan?.engine === 'RISK_CONTEXT' && plan?.status !== 'NO_DATASET_PERIOD'
)

console.log(`V2.6.7 FINAL UAT: ${passed}/${passed + failed} passed`)
if (failed) process.exit(1)
