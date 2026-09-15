import { createRiskIntentPlan } from './riskIntentPlanner.js'
import { validateQueryPlan } from './queryPlanValidator.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'

const DEFAULT_PERIOD = '2026-08-31'
let failed = 0

function run(question) {
  const plan = createRiskIntentPlan(question, { defaultPeriod: DEFAULT_PERIOD })
  if (!plan) throw new Error('Planner returned null')
  const validation = validateQueryPlan(plan)
  if (!validation.valid) throw new Error(validation.errors.join(' | '))
  const result = executeQueryPlan(plan)
  if (!result.success) throw new Error(result.errors.join(' | '))
  return { plan, result, answer: formatQueryAnswer(plan, result) }
}

function expect(name, question, predicate) {
  try {
    const out = run(question)
    const ok = predicate(out)
    if (!ok) {
      failed += 1
      console.error(`FAIL ${name}: ${question}`)
      console.error('PLAN', JSON.stringify(out.plan))
      console.error('ANSWER', out.answer)
    } else {
      console.log(`PASS ${name}: ${out.answer}`)
    }
  } catch (error) {
    failed += 1
    console.error(`FAIL ${name}: ${question}`)
    console.error(error)
  }
}

// Original risk/location/time/count cases
expect('R01 distribution', 'Tài sản định giá rủi ro tập trung ở đâu trong tháng 8/2026?',
  ({ plan, answer }) => plan.answerContext.intent === 'DISTRIBUTION' && answer.includes('Hà Nội: 2 tài sản'))
expect('R02 list by location/time', 'Hà Nội phát sinh case tài sản nào sai trong tháng 08/2026?',
  ({ answer }) => answer.includes('DG001') && answer.includes('DG004'))
expect('R03 risk type + time', 'Tài sản sai phương pháp định giá là tài sản nào và thời điểm lúc nào?',
  ({ answer }) => answer.includes('DG001') && answer.includes('tháng 8/2026'))
expect('R04 existence no data', 'Hồ Chí Minh có phát sinh case tài sản nào rủi ro không?',
  ({ answer }) => answer.startsWith('Không.'))
expect('R05 negative risk count', 'Tài sản không có rủi ro tập trung ở tỉnh, thành phố nào?',
  ({ result }) => Array.isArray(result.data) && result.data.reduce((s, x) => s + x.value, 0) === 98)
expect('R06 risk case rank', 'Đơn vị nào có nhiều case sai nhất?',
  ({ result }) => result.data?.[0]?.key === 'Nội bộ' && result.data?.[0]?.value === 3)
expect('R07 nonexistent risk type', 'Tài sản sai vị trí ở thành phố nào và thời điểm nào?',
  ({ result, answer }) => Array.isArray(result.data) && result.data.length === 0 && answer.includes('Không tìm thấy'))
expect('R08 explicit limit + location/time', '2 tài sản rủi ro nằm ở địa bàn nào và thời điểm phát sinh',
  ({ result, answer }) => result.data?.length === 2 && answer.includes('Hà Nội') && answer.includes('tháng 8/2026'))
expect('R09 preserve clause after question mark', '01 case TS sai phương pháp định giá tập trung tỉnh, thành phố nào? thời điểm phát hiện ra',
  ({ answer }) => answer.includes('Hà Nội') && answer.includes('tháng 8/2026'))

// User-discovered V2.2 scenarios: metric projection and multi-period aggregation
expect('M01 requested financial fields', '02 tài sản rủi ro có giá trị bao nhiêu (giá trị định giá, dư nợ)',
  ({ plan, result, answer }) =>
    result.data?.length === 2 &&
    plan.answerContext.requestedMetrics.includes('gtDinhGia') &&
    plan.answerContext.requestedMetrics.includes('duNoTsbd') &&
    answer.includes('Giá trị định giá:') && answer.includes('Dư nợ:'))

expect('M02 multi-period AVG with missing period', 'giá trị bình quân tài sản rủi ro tháng 6/2026, 07.2026',
  ({ plan, answer }) =>
    plan.timeContext.mode === 'ALL_PERIODS' &&
    plan.steps.some((s) => s.action === 'AGGREGATE' && s.metric === 'AVG_VALUATION') &&
    answer.includes('tháng 6/2026: không có dữ liệu') &&
    answer.includes('tháng 7/2026') && answer.includes('11.50 tỷ đồng'))

expect('M03 single-period AVG valuation', 'giá trị định giá bình quân tài sản rủi ro tháng 8/2026',
  ({ answer }) => answer.includes('8.50 tỷ đồng'))
expect('M04 total valuation', 'tổng giá trị định giá tài sản rủi ro tháng 8/2026',
  ({ answer }) => answer.includes('17.00 tỷ đồng'))
expect('M05 average debt', 'dư nợ bình quân tài sản rủi ro tháng 8/2026',
  ({ answer }) => answer.includes('4.60 tỷ đồng'))
expect('M06 average LTV', 'LTV bình quân tài sản rủi ro tháng 8/2026',
  ({ answer }) => answer.includes('80.0%'))
expect('M07 risk subtype metrics', '2 tài sản sai phương pháp có giá trị định giá và dư nợ bao nhiêu',
  ({ result, answer }) => result.data?.length === 1 && answer.includes('DG001') && answer.includes('15.00 tỷ đồng') && answer.includes('8.00 tỷ đồng'))
expect('M08 no-risk metric list', '2 tài sản không có rủi ro có giá trị định giá bao nhiêu tháng 8/2026',
  ({ result, answer }) => result.data?.length === 2 && answer.includes('DG002') && answer.includes('DG003'))
expect('M09 min valuation', 'giá trị định giá thấp nhất của tài sản rủi ro tháng 8/2026 là bao nhiêu?',
  ({ plan, answer }) => plan.answerContext.riskType === null && answer.includes('2.00 tỷ đồng'))
expect('M10 max valuation is not risk type', 'giá trị định giá cao nhất của tài sản rủi ro tháng 8/2026 là bao nhiêu?',
  ({ plan, answer }) => plan.answerContext.riskType === null && answer.includes('15.00 tỷ đồng'))
expect('M11 collateral value list', '2 tài sản rủi ro có giá trị bảo đảm bao nhiêu tháng 8/2026?',
  ({ plan, answer }) => plan.answerContext.requestedMetrics.includes('gtBaoDam') && answer.includes('Giá trị bảo đảm:'))
expect('M12 debt list only', '2 tài sản rủi ro có dư nợ bao nhiêu?',
  ({ plan, answer }) => plan.answerContext.requestedMetrics.length === 1 && plan.answerContext.requestedMetrics[0] === 'duNoTsbd' && answer.includes('Dư nợ:'))
expect('M13 LTV list', '2 tài sản rủi ro có LTV bao nhiêu?',
  ({ answer }) => answer.includes('LTV:'))
expect('M14 AVG explicit risk type', 'giá trị định giá bình quân của tài sản sai phương pháp tháng 8/2026',
  ({ result, answer }) => result.data?.recordCount === 1 && answer.includes('15.00 tỷ đồng'))
expect('M15 location + requested metric', '2 tài sản rủi ro ở Hà Nội có giá trị định giá bao nhiêu?',
  ({ result, answer }) => result.data?.length === 2 && answer.includes('15.00 tỷ đồng') && answer.includes('2.00 tỷ đồng'))

expect('N01 natural TSBĐ list + location', 'hãy chỉ tên tsbd nào bị rủi ro tháng 7.2026. đưa thêm thông tin địa bàn có tài sản',
  ({ plan, answer }) => plan.answerContext.intent === 'LIST' && answer.includes('Mã TSBĐ:') && answer.includes('Hà Nội'))
expect('N02 natural detail projection', 'loại hình tài sản bị rủi ro tháng 08.2026, giá trị bao nhiêu, mã là gì',
  ({ plan, answer }) => plan.answerContext.intent === 'LIST' && answer.includes('Loại tài sản:') && answer.includes('Mã tài sản:') && answer.includes('Giá trị định giá:'))
expect('N03 risk asset group question', 'nhóm tài sản bảo đảm nào bị rủi ro trong tháng 08.2026',
  ({ plan, answer }) => plan.answerContext.intent === 'DIMENSION_DISTRIBUTION' && plan.answerContext.groupDimension === 'assetGroup' && answer.includes('Nhóm tài sản có tài sản rủi ro:'))


expect('N04 yes-no risk by car type', 'ô tô có phải tài sản rủi ro trong tháng 08.2026 không',
  ({ plan, answer }) => plan.answerContext.intent === 'EXISTS' && plan.answerContext.assetType === 'Ô tô' && answer.startsWith('Có.'))
expect('N05 yes-no risk by land type', 'nhà đất là tài sản rủi ro phát hiện trong tháng 08.2026 có phải không?',
  ({ plan, answer }) => plan.answerContext.intent === 'EXISTS' && plan.answerContext.assetType === 'Nhà đất' && answer.startsWith('Có.'))

if (failed > 0) {
  console.error(`\nFAILED ${failed}/29 scenario tests.`)
  process.exitCode = 1
} else {
  console.log('\nPASS 29/29 expanded Risk Intent Planner scenario tests.')
}
