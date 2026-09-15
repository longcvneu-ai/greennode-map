import fs from 'node:fs'
import { createRiskIntentPlan } from './riskIntentPlanner.js'
import { validateQueryPlan } from './queryPlanValidator.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}${detail ? `: ${detail}` : ''}`)
  else { failed += 1; console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`) }
}

// 1) Natural time concentration question must be deterministic, not clarification.
const q = 'tài sản rủi ro tập trung vào tháng mấy'
const plan = createRiskIntentPlan(q, { defaultPeriod: '2026-08-31' })
const valid = validateQueryPlan(plan)
const result = executeQueryPlan(plan)
const answer = formatQueryAnswer(plan, result)
check('V262-01 month concentration intent', valid.valid && result.success && plan.answerContext.intent === 'RANK_DIMENSION' && plan.answerContext.groupDimension === 'queryPeriod', answer)
check('V262-02 month concentration answer', answer.includes('tháng 8/2026') && !answer.includes('chưa đủ thông tin'), answer)

// 2) Large LIST answer must be bounded to protect chat rendering.
const listPlan = {
  version: '2.0',
  timeContext: { mode: 'SINGLE_PERIOD', period: '2026-08-31', fromPeriod: null, toPeriod: null },
  steps: [],
  answerContext: {
    domain: 'RISK', intent: 'LIST', requestedFields: ['assetCode'], requestedMetrics: [], requestedDetailFields: ['assetCode'], requestedPeriods: [], clarificationRequired: false,
  },
}
const bigData = Array.from({ length: 125 }, (_, i) => ({ maTsDg: `DG${String(i + 1).padStart(6, '0')}` }))
const bigAnswer = formatQueryAnswer(listPlan, { success: true, data: bigData, timeContext: listPlan.timeContext })
check('V262-03 bounded LIST text', bigAnswer.includes('125') && bigAnswer.includes('105 tài sản/case khác') && bigAnswer.length < 2500, `length=${bigAnswer.length}`)

// 3) Static UI regression guards for table + selected marker/location popup.
const appSource = fs.readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
const mapSource = fs.readFileSync(new URL('../../components/AssetMap.jsx', import.meta.url), 'utf8')
check('V262-04 LIST renders table', appSource.includes("answerIntent === 'LIST'") && appSource.includes('Mã TS') && appSource.includes('Rủi ro'))
check('V262-05 selected asset works in province-summary mode', mapSource.includes('selectionAssets={assetsWithLocation}') && mapSource.includes('useProvinceSummary && selectedAsset'))
check('V262-06 popup shows location', mapSource.includes('<span>Vị trí</span>') && mapSource.includes('<span>Tọa độ</span>'))

if (failed > 0) {
  console.error(`\nV2.6.2 REGRESSION: ${failed} failed.`)
  process.exit(1)
}
console.log('\nV2.6.2 REGRESSION: 6/6 passed.')
