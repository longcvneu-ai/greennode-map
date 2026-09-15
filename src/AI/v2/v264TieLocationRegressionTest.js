import { createRiskIntentPlan } from './riskIntentPlanner.js'
import { executeQueryPlan } from './queryPlanExecutor.js'
import { formatQueryAnswer } from './queryAnswerFormatter.js'

const valuationAssets = []
const valuationSnapshots = []
const valuationRisks = []
let idx = 0
for (const province of ['Hà Nội', 'Đà Nẵng', 'Cần Thơ']) {
  for (let i = 1; i <= 25; i += 1) {
    idx += 1
    const recordId = `REC${idx}`
    valuationAssets.push({
      recordId,
      maTsDg: `DG${String(idx).padStart(5,'0')}`,
      tenTaiSan: `Tài sản ${idx}`,
      tinhTp: province,
      nhomTsCap1: 'BĐS',
      loaiTsCap2: 'Nhà đất',
    })
    valuationSnapshots.push({
      valuationRecordId: recordId,
      kyBaoCao: '2026-08-31',
      gtDinhGia: 1_000_000_000,
      ngayDinhGia: '2026-08-15',
      donViDinhGia: 'Nội bộ',
    })
    valuationRisks.push({
      valuationRecordId: recordId,
      kyBaoCao: '2026-08-31',
      loaiRuiRo: 'Định giá cao',
    })
  }
}
const dataset = { valuationAssets, valuationSnapshots, valuationRisks, collateralAssets: [], collateralSnapshots: [], collateralCustomers: [], customers: [] }

function run(q) {
  const plan = createRiskIntentPlan(q, { defaultPeriod: '2026-08-31' })
  const result = executeQueryPlan(plan, dataset)
  const answer = formatQueryAnswer(plan, result)
  return { plan, result, answer }
}

let pass = 0
const a = run('75 case phát sinh rủi ro tại đâu')
const ok1 = a.plan?.answerContext?.intent === 'DIMENSION_DISTRIBUTION' && a.plan?.answerContext?.groupDimension === 'province' && a.result?.data?.length === 3 && a.result.data.every(x => x.value === 25)
console.log(ok1 ? 'PASS' : 'FAIL', 'T01 location distribution:', JSON.stringify(a.plan), a.answer)
if (ok1) pass++

const b = run('tỉnh nào phát sinh rủi ro nhiều nhất')
const ok2 = b.plan?.answerContext?.intent === 'RANK_DIMENSION' && b.result?.data?.length === 3 && b.result.data.every(x => x.value === 25) && b.answer.includes('đồng hạng')
console.log(ok2 ? 'PASS' : 'FAIL', 'T02 tied ranking:', JSON.stringify(b.plan), b.answer)
if (ok2) pass++

console.log(`V2.6.4 TIE/LOCATION REGRESSION: ${pass}/2 passed.`)
if (pass !== 2) process.exitCode = 1
