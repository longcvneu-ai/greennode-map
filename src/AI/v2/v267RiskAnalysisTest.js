// V2.6.7 Risk Intelligence regression suite.
//
// Covers (per approved design):
//   1. RiskContext is the source of truth (deterministic numbers).
//   2. Evidence grounding: allowed numbers are derived from RiskContext.
//   3. Hallucinated numeric values are stripped.
//   4. Unsupported conclusions (credit loss / default / fraud / legal) are stripped.
//   5. No-data period (NO_DATASET_PERIOD).
//   6. Zero matching risk cases (ZERO_RISK).
//   7. Insufficient evidence (NO_SCOPE).
//   8. MaaS timeout / failure fallback -> deterministic answer preserved.
//   9. Existing deterministic count/ranking/location/filter/search behavior.
//  10. 60K dataset performance of buildRiskContext.

import { buildRiskContext, isRiskContextResult } from './riskContextEngine.js'
import {
  formatRiskAnalysis,
  computeAllowedNumbers,
  sanitizeEnrichment,
  sanitizeEnrichmentText,
  fetchRiskEnrichment,
  composeRiskAnswer,
} from './riskAnalysisFormatter.js'
import { createQueryPlanFromGreenNode } from './greennodeAdapter.js'
import {
  valuationAssets as mockValuationAssets,
} from '../../data/valuationAssets.js'
import {
  valuationSnapshots as mockValuationSnapshots,
} from '../../data/valuationSnapshots.js'
import {
  valuationRisks as mockValuationRisks,
} from '../../data/valuationRisks.js'
import {
  collateralAssets as mockCollateralAssets,
} from '../../data/collateralAssets.js'
import {
  collateralSnapshots as mockCollateralSnapshots,
} from '../../data/collateralSnapshots.js'
import {
  collateralCustomers as mockCollateralCustomers,
} from '../../data/collateralCustomers.js'
import {
  customers as mockCustomers,
} from '../../data/customers.js'

const MOCK_CURRENT = {
  valuationAssets: mockValuationAssets,
  valuationSnapshots: mockValuationSnapshots,
  valuationRisks: mockValuationRisks,
  collateralAssets: mockCollateralAssets,
  collateralSnapshots: mockCollateralSnapshots,
  collateralCustomers: mockCollateralCustomers,
  customers: mockCustomers,
}

const PERIOD_07 = '2026-07-31'
const PERIOD_08 = '2026-08-31'

let failed = 0

function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}${detail ? `: ${detail}` : ''}`)
  else {
    failed += 1
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`)
  }
}

/*
  Handcrafted canonical dataset (2 periods).
  Period 08 facts:
    - 7 assets total (HN: A1,A2,A4,A5,A7 / HCM: A3,A6)
    - riskAssets = A1(Định giá cao), A2(Sai phương pháp + Định giá cao), A5(Sai thông tin tài sản), A7(Định giá cao)
    - riskCases = 5 ; riskRatePct = round1(4/7*100) = 57.1
    - byRiskType: Định giá cao 3 (60%), Sai phương pháp 1 (20%), Sai thông tin tài sản 1 (20%)
    - byProvince: Hà Nội 4 (80%), TP. Hồ Chí Minh 1 (20%) ; top3 = 100%
    - valuation: total 35 tỷ, avg 8.75 tỷ ; debt 17 tỷ, 4 active ; LTV mean round2 = 0.49
    - prior (07): riskAssets A2, A3, A7 = 3 cases ; emerging = A1,A5 = 2 ; closed = A3 = 1
    - valuationDeltaPct = round2((35-30)/30*100) = 16.67
*/

function buildDataset() {
  const record = (maTsDg, index, province) => ({
    recordId: `VAL_REC_${String(index).padStart(3, '0')}`,
    maTsDg,
    tenTaiSan: `Tài sản ${maTsDg}`,
    nhomTsCap1: index <= 4 || index === 7 ? 'BĐS' : 'Động sản',
    loaiTsCap2: index === 5 || index === 6 ? 'Ô tô' : index === 3 ? 'CHCC' : 'Nhà đất',
    tinhTp: province,
  })

  const valuationAssets = [
    record('DG001', 1, 'Hà Nội'),
    record('DG002', 2, 'Hà Nội'),
    record('DG003', 3, 'TP. Hồ Chí Minh'),
    record('DG004', 4, 'Hà Nội'),
    record('DG005', 5, 'TP. Hồ Chí Minh'),
    record('DG006', 6, 'TP. Hồ Chí Minh'),
    record('DG007', 7, 'Hà Nội'),
  ]

  const valuation = {
    DG001: 8_000_000_000,
    DG002: 10_000_000_000,
    DG003: 5_000_000_000,
    DG004: 12_000_000_000,
    DG005: 2_000_000_000,
    DG006: 2_500_000_000,
    DG007: 15_000_000_000,
  }

  const valuationSnapshots = []
  const collateralAssets = []
  const collateralSnapshots = []
  const valuationRisks = []

  const collateral = {
    DG001: { gtBaoDam: 4_000_000_000, duNoTsbd: 4_000_000_000 },
    DG002: { gtBaoDam: 5_000_000_000, duNoTsbd: 5_000_000_000 },
    DG005: { gtBaoDam: 1_000_000_000, duNoTsbd: 1_000_000_000 },
    DG007: { gtBaoDam: 7_000_000_000, duNoTsbd: 7_000_000_000 },
  }

  valuationAssets.forEach((asset) => {
    for (const period of [PERIOD_07, PERIOD_08]) {
      valuationSnapshots.push({
        kyBaoCao: period,
        valuationRecordId: asset.recordId,
        maTsDg: asset.maTsDg,
        gtDinhGia: valuation[asset.maTsDg],
        donViDinhGia: 'ĐV định giá 1',
      })
    }

    if (collateral[asset.maTsDg]) {
      const collateralRecordId = `COL_REC_${asset.maTsDg}`
      collateralAssets.push({
        recordId: collateralRecordId,
        valuationRecordId: asset.recordId,
        maTsDg: asset.maTsDg,
        maTsbd: `BD${asset.maTsDg}`,
      })
      for (const period of [PERIOD_07, PERIOD_08]) {
        collateralSnapshots.push({
          kyBaoCao: period,
          collateralRecordId,
          valuationRecordId: asset.recordId,
          maTsDg: asset.maTsDg,
          maTsbd: `BD${asset.maTsDg}`,
          gtBaoDam: collateral[asset.maTsDg].gtBaoDam,
          duNoTsbd: collateral[asset.maTsDg].duNoTsbd,
          thanhKhoan: 'Khá',
          trangThaiTsbd: 'Đang bảo đảm',
        })
      }
    }
  })

  // Period 08 risks
  const risks08 = [
    { DG001: ['Định giá cao'] },
    { DG002: ['Sai phương pháp', 'Định giá cao'] },
    { DG005: ['Sai thông tin tài sản'] },
    { DG007: ['Định giá cao'] },
  ]
  // Period 07 risks (A3 "closed" in 08; A2/A7 stay)
  const risks07 = [
    { DG002: ['Sai phương pháp'] },
    { DG003: ['Định giá cao'] },
    { DG007: ['Định giá cao'] },
  ]

  const pushRisks = (period, mapping) => {
    mapping.forEach((entry, index) => {
      const [maTsDg, types] = Object.entries(entry)[0]
      const asset = valuationAssets.find((a) => a.maTsDg === maTsDg)
      types.forEach((loaiRuiRo, riskIndex) => {
        valuationRisks.push({
          kyBaoCao: period,
          valuationRecordId: asset.recordId,
          maTsDg,
          maRuiRo: `R_${period}_${maTsDg}_${index}_${riskIndex}`,
          loaiRuiRo,
          trangThaiXuLy: 'Mới phát hiện',
        })
      })
    })
  }

  pushRisks(PERIOD_08, risks08)
  pushRisks(PERIOD_07, risks07)

  return {
    valuationAssets,
    valuationSnapshots,
    collateralAssets,
    collateralSnapshots,
    valuationRisks,
    customers: [],
    collateralCustomers: [],
  }
}

async function routeWithStubFetch(question, dataset) {
  let calls = 0
  const original = globalThis.fetch
  globalThis.fetch = async () => {
    calls += 1
    return { ok: true, json: async () => ({}) }
  }
  try {
    const plan = await createQueryPlanFromGreenNode(question, dataset, { defaultPeriod: PERIOD_08 })
    return { plan, calls }
  } finally {
    globalThis.fetch = original
  }
}

;
(async () => {
  const dataset = buildDataset()

  // ---- 1. RiskContext is the source of truth ----
  const okResult = buildRiskContext('phân tích tình hình rủi ro tài sản tháng 8/2026', dataset, { defaultPeriod: PERIOD_08 })
  check('RC01 engine + status OK', okResult?.engine === 'RISK_CONTEXT' && okResult?.status === 'OK')
  check('RC02 isRiskContextResult', isRiskContextResult(okResult))
  check('RC03 engine returns null for non-string', buildRiskContext('') === null || buildRiskContext(null) === null)

  const ctx = okResult.riskContext
  check('RC04 snapshot counts', ctx.snapshot.totalAssets === 7 && ctx.snapshot.riskAssets === 4 && ctx.snapshot.riskCases === 5, JSON.stringify(ctx.snapshot))
  check('RC05 risk rate pct', ctx.snapshot.riskRatePct === 57.1)

  check(
    'RC06 byRiskType sorted',
    ctx.byRiskType[0]?.key === 'Định giá cao' &&
      ctx.byRiskType[0]?.cases === 3 &&
      ctx.byRiskType[0]?.sharePct === 60 &&
      ctx.byRiskType[1]?.key === 'Sai phương pháp' &&
      ctx.byRiskType[1]?.cases === 1 &&
      ctx.byRiskType[2]?.key === 'Sai thông tin tài sản' &&
      ctx.byRiskType[2]?.cases === 1,
    JSON.stringify(ctx.byRiskType)
  )

  check(
    'RC07 byProvince + concentration',
    ctx.byProvince[0]?.key === 'Hà Nội' &&
      ctx.byProvince[0]?.cases === 4 &&
      ctx.byProvince[0]?.sharePct === 80 &&
      ctx.concentration.topProvince === 'Hà Nội' &&
      ctx.concentration.topProvinceCases === 4 &&
      ctx.concentration.top3SharePct === 100,
    JSON.stringify({ byProvince: ctx.byProvince, concentration: ctx.concentration })
  )

  check(
    'RC08 valuation metrics',
    ctx.valuation.totalValuation === 35_000_000_000 &&
      ctx.valuation.avgValuation === 8_750_000_000 &&
      ctx.valuation.totalDebt === 17_000_000_000 &&
      ctx.valuation.activeCollateralAssets === 4 &&
      ctx.valuation.avgLtv === 0.49 &&
      ctx.valuation.valuationDeltaPct === 16.67,
    JSON.stringify(ctx.valuation)
  )

  check(
    'RC09 MoM delta (emerging/closed)',
    ctx.delta.priorRiskCases === 3 &&
      ctx.delta.riskDeltaMoM === 2 &&
      ctx.delta.emergingRiskAssets === 2 &&
      ctx.delta.closedRiskAssets === 1,
    JSON.stringify(ctx.delta)
  )

  check(
    'RC10 sample top assets',
    ctx.riskCasesSample[0]?.maTsDg === 'DG007' &&
      ctx.riskCasesSample[1]?.maTsDg === 'DG002' &&
      ctx.riskCasesSample[2]?.maTsDg === 'DG001' &&
      ctx.riskCasesSample[3]?.maTsDg === 'DG005',
    ctx.riskCasesSample.map((s) => s.maTsDg).join(',')
  )

  // Scope filter: risk type
  const riskTypeResult = buildRiskContext('phân tích rủi ro định giá cao tháng 8/2026', dataset, { defaultPeriod: PERIOD_08 })
  check('RC11 riskType scope filter', riskTypeResult?.status === 'OK' && riskTypeResult.riskContext.snapshot.riskCases === 3 && riskTypeResult.riskContext.byRiskType.length === 1, JSON.stringify(riskTypeResult.riskContext.snapshot))

  // ---- 2 + self-check: every number in the narrative is grounded ----
  const deterministic = formatRiskAnalysis(okResult)
  check('RC12 narrative produced + canEnrich', deterministic.text.length > 0 && deterministic.canEnrich === true)
  const allowed = computeAllowedNumbers(ctx)
  const narrativeCandidates = String(deterministic.text).match(/\d[\d.,]*/g) || []
  let ungrounded = []
  for (const token of narrativeCandidates) {
    const t = token.replace(/\s+/g, '')
    if (!t) continue
    const grouped = (t.match(/[.,]/g) || []).length > 1 || (t.includes('.') && (t.match(/[.](\d+)$/) || [])[1]?.length === 3)
    const value = grouped ? Number(t.replace(/[.,]/g, '')) : Number(t.replace(/,/g, '.'))
    if (!Number.isFinite(value)) continue
    const target = grouped ? value : Math.round(value * 100) / 100
    if (!allowed.has(target)) ungrounded.push(token)
  }
  check('RC13 narrative grounded (every salient number from evidence)', ungrounded.length === 0, ungrounded.length ? ungrounded.join(', ') : '')

  check(
    'RC14 allowed numbers derived from evidence',
    allowed.has(57.1) && allowed.has(4) && allowed.has(5) && allowed.has(60) && allowed.has(35) && allowed.has(8.75) && allowed.has(17) && allowed.has(49) && allowed.has(16.67) && allowed.has(80) && allowed.has(100)
  )

  // ---- 3. Hallucinated numeric values are stripped ----
  const hallucinatedResult = sanitizeEnrichmentText('Có 5 case trong kỳ, nhưng kỳ trước lên tới 12.500 case phát sinh rủi ro.', allowed)
  check(
    'RC15 hallucinated number stripped',
    hallucinatedResult.sanitized === true &&
      !hallucinatedResult.text.includes('12.500') &&
      hallucinatedResult.reasons.join(',') === 'ungrounded-number:12500',
    `sanitized=${hallucinatedResult.sanitized} reasons=${hallucinatedResult.reasons.join(',')} text=${hallucinatedResult.text}`
  )

  const groundedPass = sanitizeEnrichmentText('Hà Nội 4 case chiếm 80% tổng case; giá trị định giá 35 tỷ.', allowed)
  check('RC16 grounded numbers kept', groundedPass.sanitized === false && groundedPass.text.includes('80%') && groundedPass.text.includes('35 tỷ'), groundedPass.text)

  // ---- 4. Unsupported conclusions are stripped ----
  const unsupportedText = sanitizeEnrichmentText(
    'Một số tài sản có nguy cơ vỡ nợ và gian lận cao tại địa bàn này.',
    allowed
  )
  check('RC17 unsupported conclusion stripped', unsupportedText.sanitized === true && !unsupportedText.text.includes('vỡ nợ') && unsupportedText.reasons.includes('unsupported-conclusion'))

  const mixedEnrichment = {
    riskSeverity: 'HIGH',
    analysis: 'Tập trung 4 case tại Hà Nội. Nguy cơ thiệt hại tín dụng 35 tỷ là đáng ngại. Cần kiểm tra 12.000 trường hợp.',
    priorities: ['Rà soát 12.500 tài sản', 'Ưu tiên Hà Nội 4 case'],
  }
  const sanitizedMixed = sanitizeEnrichment(mixedEnrichment, ctx)
  check('RC18 sanitizeEnrichment strips hallucinated + unsupported', sanitizedMixed.sanitized === true && !sanitizedMixed.analysis.includes('12.000') && !sanitizedMixed.analysis.includes('thiệt hại') && !sanitizedMixed.analysis.includes('12.500'), sanitizedMixed.analysis)

  // ---- 5. No-data period ----
  const noDataResult = buildRiskContext('phân tích tình hình rủi ro tháng 9/2026', dataset, { defaultPeriod: '2026-09-30' })
  check('RC19 NO_DATASET_PERIOD', noDataResult?.engine === 'RISK_CONTEXT' && noDataResult?.status === 'NO_DATASET_PERIOD')
  const noDataFormatted = formatRiskAnalysis(noDataResult)
  check('RC20 no-data message (user-safe)', noDataFormatted.text.includes('chưa có dữ liệu') && noDataFormatted.canEnrich === false, noDataFormatted.text)

  // ---- 6. Zero matching risk cases ----
  const zeroRiskDataset = {
    ...dataset,
    valuationRisks: dataset.valuationRisks.filter((risk) => risk.kyBaoCao === PERIOD_07),
  }
  const zeroResult = buildRiskContext('phân tích rủi ro tháng 8/2026', zeroRiskDataset, { defaultPeriod: PERIOD_08 })
  check('RC21 ZERO_RISK', zeroResult?.status === 'ZERO_RISK')
  const zeroFormatted = formatRiskAnalysis(zeroResult)
  check('RC22 zero-risk message (user-safe)', zeroFormatted.text.includes('Không phát hiện') && zeroFormatted.canEnrich === false, zeroFormatted.text)

  // ---- 7. Insufficient evidence / NO_SCOPE ----
  const noScopeResult = buildRiskContext('phân tích tình hình rủi ro hiện tại', {}, {})
  check('RC23 NO_SCOPE when no period determinable', noScopeResult?.status === 'NO_SCOPE')
  const noScopeFormatted = formatRiskAnalysis(noScopeResult)
  check('RC24 no-scope message (user-safe)', noScopeFormatted.text.includes('Chưa xác định được kỳ báo cáo'))

  const insufficientEnrichment = {
    error: 'INSUFFICIENT_INFORMATION',
  }
  const insufficientServerPath = Boolean(insufficientEnrichment?.error)
  check('RC25 INSUFFICIENT_INFORMATION recognizable (no raw codes to UI)', insufficientServerPath === true)

  // ---- 8. MaaS timeout / failure fallback ----
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ success: false, error: 'GREENNODE_API_ERROR' }) })
  const enrich500 = await fetchRiskEnrichment('phân tích', ctx)
  globalThis.fetch = async () => { throw new Error('Failed to fetch') }
  const enrichThrown = await fetchRiskEnrichment('phân tích', ctx)
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true, analysis: 'Rà soát 4 case tại Hà Nội.', priorities: ['Ưu tiên khu vực Hà Nội'], riskSeverity: 'MEDIUM' }) })
  const enrichOk = await fetchRiskEnrichment('phân tích', ctx)
  globalThis.fetch = originalFetch

  check('RC26 enrichment fails safely (500)', enrich500 === null)
  check('RC27 enrichment fails safely (network throw)', enrichThrown === null)
  check('RC28 enrichment succeeds', enrichOk?.success === true && enrichOk?.analysis.includes('Hà Nội'))

  const fallbackAnswer = composeRiskAnswer(deterministic, enrich500)
  const okAnswer = composeRiskAnswer(deterministic, enrichOk)
  check('RC29 no-enrichment fallback = structured grounded answer', fallbackAnswer.includes('KẾT LUẬN') && fallbackAnswer.includes('CĂN CỨ CHÍNH') && fallbackAnswer.includes('XU HƯỚNG') && fallbackAnswer.includes('ƯU TIÊN KIỂM TRA') && fallbackAnswer.includes('57.1%') && fallbackAnswer.length <= 760)
  check('RC30 enriched answer = structured answer with AI analysis', okAnswer.includes('KẾT LUẬN') && okAnswer.includes('CĂN CỨ CHÍNH') && okAnswer.includes('XU HƯỚNG') && okAnswer.includes('ƯU TIÊN KIỂM TRA') && okAnswer.includes('Rà soát 4 case tại Hà Nội') && okAnswer.length <= 760)


  // ---- 9b. V2.6.7 soft analytical phrasings (comparison / unsupported conclusion) ----
  const compareRoute = await routeWithStubFetch('So sánh tình hình rủi ro tài sản bảo đảm tháng 8/2026 so với tháng 7/2026, điểm nào đáng chú ý nhất và tôi nên kiểm tra gì?', dataset)
  check('RC37 comparison/notable routes to RiskContext (no LLM)', compareRoute.plan?.engine === 'RISK_CONTEXT' && compareRoute.calls === 0, `engine=${compareRoute.plan?.engine} calls=${compareRoute.calls}`)

  const compareResult = buildRiskContext('So sánh tình hình rủi ro tài sản bảo đảm tháng 8/2026 so với tháng 7/2026, điểm nào đáng chú ý nhất và tôi nên kiểm tra gì?', dataset, { defaultPeriod: PERIOD_08 })
  const compareCtx = compareResult?.riskContext
  check('RC37b comparison evidence = latest period + prior delta', compareResult?.status === 'OK' && compareCtx?.scope?.period === PERIOD_08 && compareCtx?.scope?.priorPeriod === '2026-07-31' && compareCtx?.delta?.priorRiskCases === 3 && compareCtx?.delta?.riskDeltaMoM === 2, `status=${compareResult?.status} ${JSON.stringify(compareCtx?.delta)}`)

  const lossRoute = await routeWithStubFetch('Nợ xấu của tài sản bảo đảm đang chiếm bao nhiêu % tổng dư nợ trong tháng 8/2026?', dataset)
  check('RC38 unsupported-conclusion routes to RiskContext (no LLM)', lossRoute.plan?.engine === 'RISK_CONTEXT' && lossRoute.calls === 0, `engine=${lossRoute.plan?.engine} calls=${lossRoute.calls}`)


  // ---- 9c. Current-period resolution (no stale 8/2026 inheritance) ----
  const currentQuestion = 'Phân tích tình hình rủi ro tài sản hiện tại và đề xuất 2 việc cần ưu tiên kiểm tra.'
  const currentRoute = await routeWithStubFetch(currentQuestion, MOCK_CURRENT)
  check(
    'RC39 current-question on 100-asset mock => RiskContext analysis (no inherit of 8/2026)',
    currentRoute.plan?.engine === 'RISK_CONTEXT' &&
      currentRoute.plan?.status === 'OK' &&
      currentRoute.plan?.periodResolution === 'LATEST_AVAILABLE_PERIOD' &&
      currentRoute.calls === 0,
    `status=${currentRoute.plan?.status} resolution=${currentRoute.plan?.periodResolution} calls=${currentRoute.calls}`
  )
  const currentFormatted = formatRiskAnalysis(currentRoute.plan)
  check(
    'RC39b current question must NOT say "tháng 8/2026 chưa có dữ liệu"',
    currentFormatted.text.includes('100 tài sản') &&
      !currentFormatted.text.includes('8/2026 chưa có dữ liệu') &&
      !currentFormatted.text.includes('chưa có dữ liệu'),
    currentFormatted.text
  )

  const periodlessDataset = buildCurrentMockDataset()
  const periodlessResult = buildRiskContext(currentQuestion, periodlessDataset, { defaultPeriod: PERIOD_08 })
  const periodlessFormatted = formatRiskAnalysis(periodlessResult)
  check(
    'RC40 no-period dataset + current question => CURRENT_DATASET analysis',
    periodlessResult?.engine === 'RISK_CONTEXT' &&
      periodlessResult?.status === 'OK' &&
      periodlessResult?.periodResolution === 'CURRENT_DATASET' &&
      periodlessResult?.riskContext?.snapshot?.totalAssets === 100 &&
      periodlessFormatted.text.includes('Tại thời điểm hiện tại') &&
      !periodlessFormatted.text.includes('chưa có dữ liệu'),
    formatRiskAnalysis(periodlessResult).text
  )

  const absentResult = buildRiskContext('phân tích tình hình rủi ro tài sản tháng 9/2026', MOCK_CURRENT, { defaultPeriod: '2026-09-30' })
  check(
    'RC41 explicit absent period => NO_DATASET_PERIOD (unchanged)',
    absentResult?.engine === 'RISK_CONTEXT' &&
      absentResult?.status === 'NO_DATASET_PERIOD' &&
      absentResult?.periodResolution === 'NO_DATASET_PERIOD' &&
      absentResult?.riskContext?.scope?.period === '2026-09-30' &&
      formatRiskAnalysis(absentResult).text.includes('chưa có dữ liệu'),
    `${absentResult?.status} ${absentResult?.periodResolution}`
  )

  const validResult = buildRiskContext('phân tích tình hình rủi ro tài sản tháng 8/2026', MOCK_CURRENT, { defaultPeriod: PERIOD_08 })
  check(
    'RC42 explicit valid period uses exactly that period',
    validResult?.status === 'OK' &&
      validResult?.periodResolution === 'EXPLICIT_PERIOD' &&
      validResult?.riskContext?.scope?.period === PERIOD_08,
    `${validResult?.status} ${validResult?.periodResolution} ${validResult?.riskContext?.scope?.period}`
  )

  const firstQuestion = buildRiskContext('Phân tích tình hình rủi ro tài sản tháng 8/2026 và đề xuất 2 việc ưu tiên kiểm tra.', dataset, { defaultPeriod: PERIOD_08 })
  const secondQuestion = buildRiskContext(currentQuestion, dataset, { defaultPeriod: '2026-09-30' })
  check(
    'RC43 no-period question never inherits previous question/default period',
    firstQuestion?.periodResolution === 'EXPLICIT_PERIOD' &&
      secondQuestion?.periodResolution === 'LATEST_AVAILABLE_PERIOD' &&
      secondQuestion?.riskContext?.scope?.period === PERIOD_08 &&
      secondQuestion?.riskContext?.scope?.priorPeriod === PERIOD_07 &&
      (secondQuestion?.riskContext?.scope?.requestedPeriods || []).length === 0,
    `first=${firstQuestion?.periodResolution} second=${secondQuestion?.periodResolution} scopePeriod=${secondQuestion?.riskContext?.scope?.period} default passed=2026-09-30`
  )

  const dangCoResult = formatRiskAnalysis(buildRiskContext('Phân tích tình hình rủi ro tài sản đang có và đề xuất việc cần ưu tiên kiểm tra.', periodlessDataset, { defaultPeriod: PERIOD_08 }))
  check(
    'RC44 "đang có" keyword => CURRENT_DATASET analysis (period-less dataset)',
    dangCoResult.text.includes('Tại thời điểm hiện tại') && !dangCoResult.text.includes('chưa có dữ liệu'),
    dangCoResult.text
  )

  const hienNayResult = formatRiskAnalysis(buildRiskContext('Phân tích tình hình rủi ro tài sản hiện nay', MOCK_CURRENT, { defaultPeriod: PERIOD_08 }))
  check(
    'RC45 "hiện nay" keyword => latest-available-period analysis (no data error)',
    hienNayResult.text.includes('100 tài sản') && !hienNayResult.text.includes('chưa có dữ liệu'),
    hienNayResult.text
  )


  // ---- 9. Existing deterministic behavior preserved ----
  const deterministicCount = await routeWithStubFetch('có bao nhiêu tài sản rủi ro tháng 8/2026', dataset)
  check('RC31 count stays deterministic', deterministicCount.plan && factualIntent(deterministicCount.plan) === 'COUNT' && deterministicCount.calls === 0, `intent=${factualIntent(deterministicCount.plan)} calls=${deterministicCount.calls}`)

  const deterministicRank = await routeWithStubFetch('tỉnh nào có nhiều tài sản rủi ro nhất tháng 8/2026', dataset)
  check('RC32 ranking stays deterministic', deterministicRank.plan && factualIntent(deterministicRank.plan) === 'RANK_DIMENSION' && deterministicRank.calls === 0)

  const deterministicList = await routeWithStubFetch('liệt kê tài sản rủi ro tháng 8/2026', dataset)
  check('RC33 search/list stays deterministic', deterministicList.plan && factualIntent(deterministicList.plan) === 'LIST' && deterministicList.calls === 0)

  const analyticalRoute = await routeWithStubFetch('phân tích tình hình rủi ro tài sản tháng 8/2026', dataset)
  check('RC34 analytical routes to RiskContext (no LLM)', analyticalRoute.plan?.engine === 'RISK_CONTEXT' && analyticalRoute.calls === 0)

  const nearMiss = await routeWithStubFetch('đề nghị liệt kê tài sản rủi ro tháng 8/2026', dataset)
  check('RC35 near-miss stays deterministic', nearMiss.plan && factualIntent(nearMiss.plan) === 'LIST' && nearMiss.calls === 0)


  // ---- 10. 60K dataset performance ----
  const perfTiming = benchmark60k()
  check('RC36 60K buildRiskContext < 500ms', perfTiming.ms < 500, `${perfTiming.ms.toFixed(2)}ms, status=${perfTiming.status}, riskAssets=${perfTiming.riskAssets}`)

  if (failed > 0) {
    console.error(`\nV2.6.7 RISK ANALYSIS REGRESSION: ${failed} failed.`)
    process.exitCode = 1
  } else {
    console.log('\nV2.6.7 RISK ANALYSIS REGRESSION: all passed.')
  }
})()

function factualIntent(plan) {
  return plan?.answerContext?.intent || null
}

function buildCurrentMockDataset() {
  const provinces = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng']
  const valuationAssets = []
  const valuationSnapshots = []
  const valuationRisks = []

  for (let i = 1; i <= 100; i += 1) {
    const recordId = `VAL_CUR_${String(i).padStart(4, '0')}`
    const maTsDg = `DG${String(i).padStart(3, '0')}`
    valuationAssets.push({
      recordId,
      maTsDg,
      tenTaiSan: `Tài sản ${maTsDg}`,
      nhomTsCap1: i % 3 === 0 ? 'Động sản' : 'BĐS',
      loaiTsCap2: i % 3 === 0 ? 'Ô tô' : 'Nhà đất',
      tinhTp: provinces[i % provinces.length],
    })
    valuationSnapshots.push({
      valuationRecordId: recordId,
      maTsDg,
      gtDinhGia: 1_000_000_000 + ((i * 791_911_700) % 40_000_000_000),
      ngayDinhGia: '2026-08-15',
      donViDinhGia: 'Nội bộ',
    })
    if (i === 7 || i % 50 === 17 || i % 50 === 43) {
      valuationRisks.push({
        valuationRecordId: recordId,
        maTsDg,
        maRuiRo: `R_CUR_${i}`,
        loaiRuiRo: 'Định giá cao',
        trangThaiXuLy: 'Mới phát hiện',
      })
    }
  }

  return {
    valuationAssets,
    valuationSnapshots,
    collateralAssets: [],
    collateralSnapshots: [],
    valuationRisks,
    customers: [],
    collateralCustomers: [],
  }
}

function benchmark60k() {
  const PERIODS = ['2026-06-30', '2026-07-31', '2026-08-31']
  const assets = []
  const valuationSnapshots = []
  const valuationRisks = []

  for (let i = 1; i <= 20000; i += 1) {
    const code = String(i).padStart(6, '0')
    const maTsDg = `DG${code}`
    assets.push({
      recordId: `VAL_${code}`,
      maTsDg,
      tenTaiSan: `Tài sản ${code}`,
      nhomTsCap1: i % 20 < 13 ? 'BĐS' : 'Động sản',
      loaiTsCap2: i % 20 < 9 ? 'Nhà đất' : i % 20 < 13 ? 'CHCC' : i % 20 < 17 ? 'Ô tô' : 'Hàng hóa',
      tinhTp: `Tỉnh ${(i % 34) + 1}`,
    })

    PERIODS.forEach((period, periodIndex) => {
      const gtDinhGia = 1_000_000_000 + ((i * 7_919_117) % 49_200_000_000)
      valuationSnapshots.push({
        kyBaoCao: period,
        valuationRecordId: `VAL_${code}`,
        maTsDg,
        gtDinhGia,
        donViDinhGia: 'ĐV định giá 1',
      })
      if (((i * 37 + periodIndex * 19 + Math.floor(i / 34)) % 100) < 4) {
        valuationRisks.push({
          kyBaoCao: period,
          valuationRecordId: `VAL_${code}`,
          maTsDg,
          maRuiRo: `R_${periodIndex}_${i}`,
          loaiRuiRo: ['Định giá cao', 'Sai phương pháp', 'Sai thông tin tài sản'][(i + periodIndex) % 3],
          trangThaiXuLy: 'Đang xử lý',
        })
      }
    })
  }

  const canonical = {
    valuationAssets: assets,
    valuationSnapshots,
    collateralAssets: [],
    collateralSnapshots: [],
    valuationRisks,
    customers: [],
    collateralCustomers: [],
  }

  const start = performance.now()
  const result = buildRiskContext('phân tích tổng quan rủi ro tài sản tháng 8/2026', canonical, { defaultPeriod: '2026-08-31' })
  const ms = performance.now() - start

  return {
    ms,
    status: result?.status,
    riskAssets: result?.riskContext?.snapshot?.riskAssets,
  }
}