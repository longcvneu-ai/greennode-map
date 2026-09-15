// V2.6.6 analytical-intent regression (V2.6.7 routing update)
// Analytical/advisory questions ("phân tích", "đề xuất", ...) must bypass the
// deterministic planners. Since V2.6.7 they are handled by the deterministic
// RiskContext engine (engine === 'RISK_CONTEXT', zero LLM fetch calls) instead of
// the GreenNode LLM fallback, which previously returned INSUFFICIENT_INFORMATION.
// Deterministic count/ranking/location/tie/filter/search behavior must remain
// unchanged (and still avoid the LLM call).

import { createRiskIntentPlan } from './riskIntentPlanner.js'
import { createQueryPlanFromGreenNode } from './greennodeAdapter.js'

const DEFAULT_PERIOD = '2026-08-31'
let failed = 0

function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}${detail ? `: ${detail}` : ''}`)
  else {
    failed += 1
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`)
  }
}

const ANALYTICAL_QUERY =
  'Phân tích ngắn gọn tình hình rủi ro tài sản hiện tại và đề xuất 2 việc cần ưu tiên kiểm tra.'

const cannedPlan = {
  version: '2.0',
  timeContext: { mode: 'SINGLE_PERIOD', period: null, fromPeriod: null, toPeriod: null },
  steps: [],
  answerContext: {
    domain: 'RISK',
    intent: 'LIST',
    requestedFields: ['asset'],
    requestedMetrics: [],
    requestedDetailFields: [],
    requestedPeriods: [],
    riskPolarity: 'RISK',
    riskType: null,
    aggregation: null,
    clarificationRequired: false,
  },
}

function stubFetch(tracker) {
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    tracker.calls += 1
    return { ok: true, json: async () => ({ success: true, queryPlan: cannedPlan }) }
  }
  return () => {
    globalThis.fetch = original
  }
}

async function route(question) {
  const tracker = { calls: 0 }
  const restore = stubFetch(tracker)
  try {
    const plan = await createQueryPlanFromGreenNode(question, {}, { defaultPeriod: DEFAULT_PERIOD })
    return { plan, calls: tracker.calls }
  } finally {
    restore()
  }
}

;(
  async () => {
    // 1) Planner must defer the analytical query entirely: no plan at all
    //    (no asset-search LIST, no MISSING_OPERATION clarification).
    const plan = createRiskIntentPlan(ANALYTICAL_QUERY, { defaultPeriod: DEFAULT_PERIOD })
    check('A01 target query yields no plan', plan === null)
    check('A02 not asset search', plan === null || !(plan.answerContext.intent === 'LIST' && plan.answerContext.requestedFields.includes('asset')))
    check('A03 not MISSING_OPERATION', plan === null || plan.answerContext.clarificationRequired !== true)

    // 2) Every analytical hint must defer.
    const hints = ['phân tích', 'đề xuất', 'nhận xét', 'nhận định', 'gợi ý', 'khuyến nghị', 'tổng quan']
    for (let i = 0; i < hints.length; i += 1) {
      const h = hints[i]
      const hintPlan = createRiskIntentPlan(`${h} tình hình rủi ro tài sản`, { defaultPeriod: DEFAULT_PERIOD })
      check(`A${String(i + 4).padStart(2, '0')} hint '${h}' defers`, hintPlan === null)
    }

    // 3) Adapter routing: analytical questions must build a RiskContext from
    //    evidence with ZERO fetch calls (no LLM involved for the numbers).
    const target = await route(ANALYTICAL_QUERY)
    check('B01 target reaches RiskContext engine', target.plan?.engine === 'RISK_CONTEXT' && target.calls === 0, `engine=${target.plan?.engine} fetchCalls=${target.calls}`)

    // 4) Analytical query WITH an explicit period must still bypass the Fast
    //    Planner and land in the RiskContext engine.
    const periodized = await route('phân tích tình hình rủi ro tài sản tập trung ở đâu tháng 8/2026')
    check('B02 periodized analytical query reaches RiskContext engine', periodized.plan?.engine === 'RISK_CONTEXT' && periodized.calls === 0, `engine=${periodized.plan?.engine} fetchCalls=${periodized.calls}`)

    // 5) Deterministic behaviors are unchanged and never call the LLM.
    const count = await route('có bao nhiêu tài sản rủi ro tháng 8/2026')
    check('C01 count stays deterministic', count.plan?.answerContext?.intent === 'COUNT' && count.calls === 0, count.calls === 0 ? `intent=${count.plan?.answerContext?.intent}` : `fetchCalls=${count.calls}`)

    const rank = await route('tỉnh nào có nhiều tài sản rủi ro nhất tháng 8/2026')
    check('C02 ranking stays deterministic', rank.plan?.answerContext?.intent === 'RANK_DIMENSION' && rank.plan?.answerContext?.groupDimension === 'province' && rank.calls === 0)

    const location = await route('75 case phát sinh rủi ro tại đâu')
    check('C03 location distribution stays deterministic', location.plan?.answerContext?.intent === 'DIMENSION_DISTRIBUTION' && location.plan?.answerContext?.groupDimension === 'province' && location.calls === 0)

    const tie = await route('tỉnh nào phát sinh rủi ro nhiều nhất')
    check('C04 tie ranking stays deterministic', tie.plan?.answerContext?.intent === 'RANK_DIMENSION' && tie.calls === 0)

    const filter = await route('ô tô rủi ro tháng 8/2026 có giá trị định giá bao nhiêu')
    check('C05 filter stays deterministic', filter.plan?.answerContext?.requestedMetrics?.includes('gtDinhGia') && filter.calls === 0)

    const search = await route('liệt kê tài sản rủi ro tháng 8/2026')
    check('C06 search stays deterministic', search.plan?.answerContext?.intent === 'LIST' && search.calls === 0)

    if (failed > 0) {
      console.error(`\nV2.6.6 ANALYTICAL REGRESSION: ${failed} failed.`)
      process.exitCode = 1
    } else {
      console.log('\nV2.6.6 ANALYTICAL REGRESSION: all passed.')
    }
  }
)()