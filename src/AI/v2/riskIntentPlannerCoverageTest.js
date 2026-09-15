import { createRiskIntentPlan } from './riskIntentPlanner.js'
import { validateQueryPlan } from './queryPlanValidator.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'

const DEFAULT_PERIOD = '2026-08-31'
let passed = 0
let failed = 0
const failures = []

function run(question, defaultPeriod = DEFAULT_PERIOD) {
  const plan = createRiskIntentPlan(question, { defaultPeriod })
  if (!plan) return { plan: null, validation: null, result: null, answer: null }
  const validation = validateQueryPlan(plan)
  if (!validation.valid) return { plan, validation, result: null, answer: null }
  const result = executeQueryPlan(plan)
  const answer = result.success ? formatQueryAnswer(plan, result) : null
  return { plan, validation, result, answer }
}

function test(name, question, predicate, defaultPeriod = DEFAULT_PERIOD) {
  const out = run(question, defaultPeriod)
  let ok = false
  try { ok = Boolean(predicate(out)) } catch { ok = false }
  if (ok) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    failures.push({ name, question, out })
    console.error(`FAIL ${name}: ${question}`)
  }
}

const isIntent = (intent) => ({ plan, validation }) => plan?.answerContext?.intent === intent && validation?.valid === true
const answerHas = (...parts) => ({ answer }) => parts.every((p) => String(answer || '').includes(p))

// A. YES/NO existence: natural variants + positive/negative data
const yesNoCases = [
  ['E01', 'ô tô có phải tài sản rủi ro trong tháng 08.2026 không', true],
  ['E02', 'ô tô bị rủi ro tháng 8/2026 không', true],
  ['E03', 'có tài sản ô tô rủi ro trong tháng 8/2026 không', true],
  ['E04', 'nhà đất là tài sản rủi ro phát hiện trong tháng 08.2026 có phải không?', true],
  ['E05', 'nhà đất có rủi ro tháng 8/2026 không?', true],
  ['E06', 'hàng hóa có phải tài sản rủi ro tháng 8/2026 không?', false],
  ['E07', 'CHCC có phải tài sản rủi ro tháng 7/2026 không?', true],
  ['E08', 'ô tô có rủi ro tháng 6/2026 không?', false],
]
for (const [id, q, yes] of yesNoCases) {
  test(id, q, ({ plan, answer }) => plan?.answerContext?.intent === 'EXISTS' && (yes ? answer?.startsWith('Có.') : answer?.startsWith('Không.')))
}

// B. COUNT: assets, cases, no-risk, time variants
const countCases = [
  ['C01', 'có bao nhiêu tài sản rủi ro tháng 8/2026', 2],
  ['C02', 'bao nhiêu tài sản bị rủi ro trong tháng 08.2026', 2],
  ['C03', 'số lượng tài sản rủi ro tháng 8 năm 2026', 2],
  ['C04', 'có bao nhiêu case rủi ro tháng 8/2026', 3],
  ['C05', 'có bao nhiêu tài sản không có rủi ro tháng 8/2026', 98],
  ['C06', 'có bao nhiêu tài sản rủi ro tháng 7.2026', 1],
  ['C07', 'có bao nhiêu tài sản rủi ro tháng 6/2026', 0],
]
for (const [id, q, value] of countCases) {
  test(id, q, ({ plan, result }) => plan?.answerContext?.intent === 'COUNT' && result?.data?.value === value)
}

// C. LIST and requested projections
const listCases = [
  ['L01', 'liệt kê tài sản rủi ro tháng 8/2026', ['DG001', 'DG004']],
  ['L02', 'cho tôi các tài sản rủi ro tháng 8/2026', ['DG001', 'DG004']],
  ['L03', 'những tài sản nào bị rủi ro tháng 8/2026', ['DG001', 'DG004']],
  ['L04', 'mã tài sản rủi ro tháng 8/2026 là gì', ['Mã tài sản:', 'DG001']],
  ['L05', 'hãy chỉ tên tsbd nào bị rủi ro tháng 7.2026, đưa thêm thông tin địa bàn có tài sản', ['Mã TSBĐ:', 'Hà Nội']],
  ['L06', 'loại hình tài sản bị rủi ro tháng 08.2026, giá trị bao nhiêu, mã là gì', ['Loại tài sản:', 'Giá trị định giá:', 'Mã tài sản:']],
  ['L07', '2 tài sản rủi ro nằm ở địa bàn nào và thời điểm phát sinh', ['DG001', 'DG004', 'Hà Nội', 'tháng 8/2026']],
  ['L08', '02 tài sản rủi ro có giá trị bao nhiêu (giá trị định giá, dư nợ)', ['Giá trị định giá:', 'Dư nợ:']],
  ['L09', '2 tài sản rủi ro có LTV bao nhiêu', ['LTV:']],
  ['L10', '2 tài sản rủi ro có giá trị bảo đảm bao nhiêu', ['Giá trị bảo đảm:']],
]
for (const [id, q, parts] of listCases) {
  test(id, q, ({ plan, answer }) => plan?.answerContext?.intent === 'LIST' && parts.every((p) => answer?.includes(p)))
}

// D. Dimension distribution / grouping
const dimCases = [
  ['D01', 'nhóm tài sản bảo đảm nào bị rủi ro trong tháng 08.2026', 'assetGroup'],
  ['D02', 'loại tài sản nào bị rủi ro tháng 8/2026', 'assetType'],
  ['D03', 'phân bố tài sản rủi ro theo loại tài sản tháng 8/2026', 'assetType'],
  ['D04', 'tài sản rủi ro tập trung ở tỉnh thành phố nào tháng 8/2026', 'province'],
  ['D05', 'địa bàn nào có tài sản rủi ro tháng 8/2026', 'province'],
  ['D06', 'phân bố tài sản rủi ro theo đơn vị định giá tháng 8/2026', 'valuationUnit'],
  ['D07', 'loại rủi ro nào phát sinh tháng 8/2026', 'valuationRisk'],
]
for (const [id, q, dimension] of dimCases) {
  test(id, q, ({ plan, result }) => plan?.answerContext?.intent === 'DIMENSION_DISTRIBUTION' && plan?.answerContext?.groupDimension === dimension && Array.isArray(result?.data))
}

// E. Ranking dimensions
const rankCases = [
  ['K01', 'nhóm tài sản nào có nhiều tài sản rủi ro nhất tháng 8/2026', 'assetGroup'],
  ['K02', 'loại tài sản nào có nhiều tài sản rủi ro nhất tháng 8/2026', 'assetType'],
  ['K03', 'tỉnh nào có nhiều tài sản rủi ro nhất tháng 8/2026', 'province'],
  ['K04', 'đơn vị định giá nào có nhiều tài sản rủi ro nhất tháng 8/2026', 'valuationUnit'],
  ['K05', 'loại rủi ro nào có nhiều tài sản nhất tháng 8/2026', 'valuationRisk'],
]
for (const [id, q, dimension] of rankCases) {
  test(id, q, ({ plan, result }) => {
    const rows = result?.data
    if (!(plan?.answerContext?.intent === 'RANK_DIMENSION' && plan?.answerContext?.groupDimension === dimension && Array.isArray(rows) && rows.length >= 1)) return false
    const top = Number(rows[0]?.value)
    // Tie-aware ranking: LIMIT 1 means first rank, including all co-leaders.
    return rows.every((row) => Number(row?.value) === top)
  })
}

// F. Metrics + aggregation
const metricCases = [
  ['M01', 'giá trị định giá bình quân tài sản rủi ro tháng 8/2026', '8.50 tỷ đồng'],
  ['M02', 'tổng giá trị định giá tài sản rủi ro tháng 8/2026', '17.00 tỷ đồng'],
  ['M03', 'giá trị định giá cao nhất của tài sản rủi ro tháng 8/2026', '15.00 tỷ đồng'],
  ['M04', 'giá trị định giá thấp nhất của tài sản rủi ro tháng 8/2026', '2.00 tỷ đồng'],
  ['M05', 'dư nợ bình quân tài sản rủi ro tháng 8/2026', '4.60 tỷ đồng'],
  ['M06', 'tổng dư nợ tài sản rủi ro tháng 8/2026', '9.20 tỷ đồng'],
  ['M07', 'LTV bình quân tài sản rủi ro tháng 8/2026', '80.0%'],
  ['M08', 'giá trị bảo đảm bình quân tài sản rủi ro tháng 8/2026', '6.80 tỷ đồng'],
  ['M09', 'tổng giá trị bảo đảm tài sản rủi ro tháng 8/2026', '13.60 tỷ đồng'],
]
for (const [id, q, expected] of metricCases) {
  test(id, q, ({ plan, answer }) => plan?.answerContext?.intent === 'METRIC_AGGREGATE' && answer?.includes(expected))
}

// G. Multi-period
const multiCases = [
  ['T01', 'giá trị bình quân tài sản rủi ro tháng 6/2026, 07.2026', ['tháng 6/2026', 'tháng 7/2026']],
  ['T02', 'so sánh số tài sản rủi ro tháng 7/2026 và 8/2026', ['tháng 7/2026', 'tháng 8/2026']],
  ['T03', 'giá trị định giá bình quân tài sản rủi ro tháng 7/2026 và tháng 8/2026', ['tháng 7/2026', 'tháng 8/2026']],
]
for (const [id, q, parts] of multiCases) {
  test(id, q, ({ answer, validation }) => validation?.valid === true && parts.every((p) => answer?.includes(p)))
}

// H. Risk subtypes + no data
const riskTypeCases = [
  ['R01', 'tài sản sai phương pháp định giá là tài sản nào và thời điểm lúc nào', 'DG001'],
  ['R02', 'tài sản sai thông tin tài sản tháng 8/2026 là tài sản nào', 'DG004'],
  ['R03', 'tài sản định giá cao tháng 7/2026 là tài sản nào', 'DG002'],
  ['R04', 'tài sản sai vị trí ở thành phố nào và thời điểm nào', 'Không tìm thấy'],
]
for (const [id, q, expected] of riskTypeCases) {
  test(id, q, ({ answer }) => answer?.includes(expected))
}

// I. Filters: asset group/type/location
const filterCases = [
  ['F01', 'ô tô rủi ro tháng 8/2026 có giá trị định giá bao nhiêu', ['2.00 tỷ đồng']],
  ['F02', 'nhà đất rủi ro tháng 8/2026 có dư nợ bao nhiêu', ['8.00 tỷ đồng']],
  ['F03', '2 tài sản rủi ro ở Hà Nội có giá trị định giá bao nhiêu', ['15.00 tỷ đồng', '2.00 tỷ đồng']],
  ['F04', 'BĐS rủi ro tháng 8/2026 có giá trị định giá bao nhiêu', ['15.00 tỷ đồng']],
  ['F05', 'động sản rủi ro tháng 8/2026 có giá trị định giá bao nhiêu', ['2.00 tỷ đồng']],
]
for (const [id, q, parts] of filterCases) {
  test(id, q, ({ answer }) => parts.every((p) => answer?.includes(p)))
}

// J. Time parsing and default-period isolation
const timeCases = [
  ['P01', 'liệt kê tài sản rủi ro tháng 08.2026', '2026-08-31'],
  ['P02', 'liệt kê tài sản rủi ro tháng 8 năm 2026', '2026-08-31'],
  ['P03', 'liệt kê tài sản rủi ro tháng 07.2026', '2026-07-31'],
  ['P04', 'liệt kê tài sản rủi ro 2026-07-31', '2026-07-31'],
  ['P05', 'liệt kê tài sản rủi ro', '2026-08-31'],
]
for (const [id, q, expectedPeriod] of timeCases) {
  test(id, q, ({ plan }) => plan?.timeContext?.period === expectedPeriod)
}

// K. Clarification / safe failure: do not fabricate unsupported semantics
test('S01', 'tài sản sai vị trí tháng 8/2026 là gì', ({ answer }) => answer?.includes('Không tìm thấy'))
test('S02', 'LTV tổng của tài sản rủi ro tháng 8/2026', ({ plan }) => plan?.answerContext?.clarificationRequired === true)

console.log(`\nCOVERAGE RESULT: ${passed}/${passed + failed} passed.`)
if (failed) {
  console.error(`FAILED ${failed} cases:`)
  for (const f of failures) {
    console.error(`- ${f.name}: ${f.question}`)
    console.error('  plan=', JSON.stringify(f.out.plan))
    console.error('  answer=', f.out.answer)
  }
  process.exitCode = 1
}
