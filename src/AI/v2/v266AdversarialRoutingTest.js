// V2.6.6 adversarial routing regression (V2.6.7 routing update)
// Mixed-intent Vietnamese queries where analytical words ("phân tích", "đề xuất",
// "nhận xét", "nhận định", "gợi ý", "khuyến nghị", "tổng quan") appear side by side
// with deterministic words (ranking/count/period/location/top-N/filter/search).
//
// Expected routing:
//   - any query containing an analytical hint -> RiskContext engine (engine === 'RISK_CONTEXT', no fetch)
//   - any query WITHOUT a hint -> deterministic planner (no fetch)
//   - hint-adjacent near-misses ("tổng số", "đề nghị", "phân bố", "xét duyệt") stay deterministic
//
// fetch is only reachable via createQueryPlanFromModel (the LLM fallback). The
// RiskContext engine and deterministic planners NEVER call fetch, so 0 calls
// proves the evidence-based/deterministic route for every kind of query here;
// a nonzero call count would reveal an accidental LLM fallback.

import { createQueryPlanFromGreenNode } from './greennodeAdapter.js'

const DEFAULT_PERIOD = '2026-08-31'

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

// [id, name, query, expectedRoute, expectedIntent|null]
const cases = [
  // ---- phân tích + ranking / count / location / filter / search / metric ----
  ['A01', 'phân tích + ranking', 'phân tích tỉnh nào có nhiều tài sản rủi ro nhất tháng 8/2026', 'RISK_CONTEXT', null],
  ['A02', 'phân tích + count', 'phân tích có bao nhiêu tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['A03', 'phân tích + quantity attr', 'phân tích 10 tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['A04', 'phân tích + location', 'phân tích tình hình rủi ro tài sản ở Hà Nội tháng 8/2026', 'RISK_CONTEXT', null],
  ['A05', 'phân tích + filter (ô tô)', 'phân tích tài sản ô tô rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['A06', 'phân tích + AVG metric (fast-planner trap)', 'phân tích giá trị định giá bình quân tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['A07', 'phân tích + search', 'phân tích danh sách tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['A08', 'phân tích + tie ranking', 'phân tích tỉnh nào phát sinh rủi ro nhiều nhất', 'RISK_CONTEXT', null],
  ['A09', 'phân tích hiện tại (no period)', 'phân tích tình hình rủi ro tài sản hiện tại', 'RISK_CONTEXT', null],

  // ---- đề xuất + period/date / list ----
  ['B01', 'đề xuất + period', 'đề xuất tài sản rủi ro cần xử lý trong tháng 8/2026', 'RISK_CONTEXT', null],
  ['B02', 'đề xuất + count + period', 'đề xuất tháng 8/2026 có bao nhiêu tài sản rủi ro', 'RISK_CONTEXT', null],
  ['B03', 'đề xuất + quantity + list', 'đề xuất 3 tài sản rủi ro cần ưu tiên tháng 8/2026', 'RISK_CONTEXT', null],
  ['B04', 'đề xuất + location', 'đề xuất tỉnh nào cần ưu tiên xử lý tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],

  // ---- nhận xét + location / ranking ----
  ['C01', 'nhận xét + location', 'nhận xét tài sản rủi ro tập trung ở đâu tháng 8/2026', 'RISK_CONTEXT', null],
  ['C02', 'nhận xét + ranking', 'nhận xét về các tỉnh nhiều tài sản rủi ro nhất tháng 8/2026', 'RISK_CONTEXT', null],
  ['C03', 'nhận xét + search', 'nhận xét danh sách tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],

  // ---- nhận định + ranking / count ----
  ['D01', 'nhận định + ranking top N', 'nhận định 5 tỉnh có rủi ro cao nhất tháng 8/2026', 'RISK_CONTEXT', null],
  ['D02', 'nhận định + tình hình', 'nhận định tình hình tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['D03', 'nhận định + count', 'nhận định có bao nhiêu tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],

  // ---- tổng quan + top N / tình hình ----
  ['E01', 'tổng quan + top N ranking', 'tổng quan 5 tỉnh có nhiều tài sản rủi ro nhất tháng 8/2026', 'RISK_CONTEXT', null],
  ['E02', 'tổng quan + tình hình', 'tổng quan tình hình tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['E03', 'tổng quan + count', 'tổng quan có bao nhiêu tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],

  // ---- gợi ý + filter / search ----
  ['F01', 'gợi ý + filter (ô tô)', 'gợi ý các tài sản ô tô rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['F02', 'gợi ý + hành động', 'gợi ý cách xử lý tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['F03', 'gợi ý + phân bố word', 'gợi ý về phân bố tài sản rủi ro theo tỉnh tháng 8/2026', 'RISK_CONTEXT', null],

  // ---- khuyến nghị + search / ưu tiên ----
  ['G01', 'khuyến nghị + search', 'khuyến nghị danh sách tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['G02', 'khuyến nghị + ưu tiên', 'khuyến nghị 2 việc ưu tiên kiểm tra tài sản rủi ro hiện tại', 'RISK_CONTEXT', null],

  // ---- analytical word in a non-analytical framing (hint dominates by design) ----
  ['H01', 'bảng nhận xét (nhận xét)', 'bảng nhận xét các tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['H02', 'dữ liệu phân tích (phân tích)', 'dữ liệu phân tích tài sản ô tô tháng 8/2026', 'RISK_CONTEXT', null],
  ['H03', 'số liệu tổng quan (tổng quan)', 'số liệu tổng quan tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['H04', 'danh sách đề xuất (đề xuất)', 'danh sách đề xuất tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['H05', 'nhận định khách quan (nhận định)', 'nhận định khách quan về tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['H06', 'gợi ý khẩn cấp (gợi ý)', 'gợi ý khẩn cấp chương trình kiểm tra tài sản rủi ro tháng 8/2026', 'RISK_CONTEXT', null],
  ['H07', 'target V2.6.6 query', 'Phân tích ngắn gọn tình hình rủi ro tài sản hiện tại và đề xuất 2 việc cần ưu tiên kiểm tra.', 'RISK_CONTEXT', null],

  // ---- V2.6.7 soft analytical phrasings (comparison / unsupported conclusion) ----
  ['K01', 'comparison + notable/prioritize target', 'So sánh tình hình rủi ro tài sản bảo đảm tháng 8/2026 so với tháng 7/2026, điểm nào đáng chú ý nhất và tôi nên kiểm tra gì?', 'RISK_CONTEXT', null],
  ['K02', 'unsupported conclusion (NPL %) target', 'Nợ xấu của tài sản bảo đảm đang chiếm bao nhiêu % tổng dư nợ trong tháng 8/2026?', 'RISK_CONTEXT', null],

  // ---- hint-adjacent near-misses that MUST stay deterministic ----
  ['I01', 'tổng số (near-miss; pre-existing LIST phrasing)', 'tổng số tài sản rủi ro tháng 8/2026', 'DET', 'LIST'],
  ['I02', 'tổng cộng (count)', 'tổng cộng bao nhiêu tài sản rủi ro tháng 8/2026', 'DET', 'COUNT'],
  ['I03', 'đề nghị + list (not đề xuất)', 'đề nghị liệt kê tài sản rủi ro tháng 8/2026', 'DET', 'LIST'],
  ['I04', 'đề nghị + limit 3 (not đề xuất)', 'đề nghị danh sách 3 tài sản rủi ro tháng 8/2026', 'DET', 'LIST'],
  ['I05', 'phân bố word (not phân tích)', 'phân bố tài sản rủi ro theo tỉnh tháng 8/2026', 'DET', 'DIMENSION_DISTRIBUTION'],
  ['I06', 'xét duyệt (not nhận xét)', 'liệt kê tài sản rủi ro cần xét duyệt tháng 8/2026', 'DET', null],
  ['I07', 'nhận bảo đảm (not nhận xét)', 'tài sản nào nhận bảo đảm rủi ro tháng 8/2026', 'DET', null],

  // ---- pure deterministic controls (must stay unchanged) ----
  ['J01', 'count control', 'có bao nhiêu tài sản rủi ro tháng 8/2026', 'DET', 'COUNT'],
  ['J02', 'ranking control', 'tỉnh nào có nhiều tài sản rủi ro nhất tháng 8/2026', 'DET', 'RANK_DIMENSION'],
  ['J03', 'location distribution control', '75 case phát sinh rủi ro tại đâu', 'DET', 'DIMENSION_DISTRIBUTION'],
  ['J04', 'tie ranking control', 'tỉnh nào phát sinh rủi ro nhiều nhất', 'DET', 'RANK_DIMENSION'],
  ['J05', 'search / list control', 'liệt kê tài sản rủi ro tháng 8/2026', 'DET', 'LIST'],
  ['J06', 'filter control (ô tô)', 'ô tô rủi ro tháng 8/2026', 'DET', 'LIST'],
]

;(async () => {
  const failures = []
  let passed = 0

  for (const [id, name, q, expected, expectedIntent] of cases) {
    const { plan, calls } = await route(q)

    let ok
    let actual
    let detail

    if (expected === 'RISK_CONTEXT') {
      const reachedEngine = plan?.engine === 'RISK_CONTEXT' && calls === 0
      ok = reachedEngine
      actual = reachedEngine ? 'RISK_CONTEXT' : calls > 0 ? `LLM(fetch=${calls})` : plan ? `DETERMINISTIC(${plan.answerContext?.intent})` : 'NONE/null'
      detail = reachedEngine ? '' : `calls=${calls}, planIntent=${plan?.answerContext?.intent ?? 'null'}, engine=${plan?.engine ?? 'null'}`
    } else {
      const stayedDeterministic = plan !== null && calls === 0
      const intentOk = expectedIntent ? plan?.answerContext?.intent === expectedIntent : true
      ok = stayedDeterministic && intentOk
      actual = plan
        ? `DETERMINISTIC(${plan.answerContext?.intent})`
        : calls > 0
          ? `LLM(fetch=${calls})`
          : 'NONE/null'
      detail = ok ? '' : `calls=${calls}, planIntent=${plan?.answerContext?.intent ?? 'null'}, expectedIntent=${expectedIntent ?? 'any'}`
    }

    if (ok) {
      passed += 1
      console.log(`PASS ${id} ${name}: ${actual}`)
    } else {
      failures.push({ id, name, q, expected, actual, detail })
      console.error(`FAIL ${id} ${name}: expected=${expected}, actual=${actual}${detail ? ` (${detail})` : ''}`)
    }
  }

  const total = cases.length
  console.log(`\nV2.6.7 ADVERSARIAL ROUTING (V2.6.6 baseline): ${passed}/${total} passed.`)

  if (failures.length > 0) {
    console.log('\nFAILED QUERIES:')
    for (const f of failures) {
      console.log(`  - [${f.id}] ${f.name}`)
      console.log(`      query:    ${f.q}`)
      console.log(`      expected: ${f.expected}${f.expected === 'DET' ? ` (intent ${f.detail ? '' : ''}${f.detail})` : ''}`)
      console.log(`      actual:   ${f.actual}`)
    }
    process.exitCode = 1
  } else {
    console.log('V2.6.6 is safe to deploy from a routing standpoint (no deploy performed).')
  }
})()