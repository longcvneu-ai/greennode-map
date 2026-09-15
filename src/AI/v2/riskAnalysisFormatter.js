// src/AI/v2/riskAnalysisFormatter.js
// V2.6.7 Risk Intelligence - deterministic presentation + evidence grounding.
//
// Everything here is DOM-free so both the App (client) and server/server.js can
// import it. The deterministic narrative is the single source of truth; the LLM
// enrichment is an optional evidence-grounded layer that is sanitized against the
// same evidence before being shown to users.

function formatPeriod(period) {
  if (!period) return ''
  const [year, month] = String(period).split('-')
  const numericMonth = Number(month)
  if (!Number.isFinite(numericMonth)) return period
  return `tháng ${numericMonth}/${year}`
}

function formatBillion(value) {
  const number = Number(value) || 0
  return `${(number / 1_000_000_000).toFixed(2)} tỷ`
}

function formatLtvPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'không xác định'
  }
  return `${(Number(value) * 100).toFixed(1)}%`
}

function buildScopeText(scope) {
  const parts = []
  if (scope?.province) parts.push(`tại ${scope.province}`)
  if (scope?.assetGroup) parts.push(`nhóm ${scope.assetGroup}`)
  if (scope?.assetType) parts.push(`loại ${scope.assetType}`)
  if (scope?.riskType) parts.push(`loại rủi ro "${scope.riskType}"`)
  if (parts.length === 0) return ''
  return ` ${parts.join(', ')}`
}


function getRanking(context, dimension) {
  const explicit = context?.ranking?.[dimension]
  if (explicit) return explicit

  const rows = dimension === 'province' ? context?.byProvince : context?.byRiskType
  if (!Array.isArray(rows) || rows.length === 0) {
    return { leaders: [], value: null, isTie: false, leaderCount: 0 }
  }
  const value = Number(rows[0]?.cases)
  const leaders = rows.filter((row) => Number(row?.cases) === value).map((row) => row.key)
  return { leaders, value, isTie: leaders.length > 1, leaderCount: leaders.length }
}

function joinVietnamese(items = []) {
  const values = items.filter(Boolean)
  if (values.length <= 1) return values[0] || ''
  if (values.length === 2) return `${values[0]} và ${values[1]}`
  return `${values.slice(0, -1).join(', ')} và ${values.at(-1)}`
}

function getRowByKey(rows, key) {
  return (rows || []).find((row) => row.key === key) || null
}

export function formatRiskAnalysis(result) {
  if (!result || result.engine !== 'RISK_CONTEXT') {
    return { text: 'Không có kết quả hợp lệ để hiển thị.', canEnrich: false, riskContext: null }
  }

  const context = result.riskContext || null
  const status = result.status

  if (status === 'INSUFFICIENT_EVIDENCE') {
    return {
      text: 'Dữ liệu hiện tại chưa có thông tin để kết luận khả năng trở thành nợ xấu hoặc tỷ lệ mất vốn. Hệ thống chỉ có thể phân tích các tín hiệu rủi ro định giá và dữ liệu TSBĐ đang được cung cấp.',
      canEnrich: false,
      riskContext: context,
    }
  }

  if (status === 'NO_SCOPE') {
    return {
      text: 'Chưa xác định được kỳ báo cáo. Vui lòng nêu rõ tháng/kỳ (ví dụ: tháng 8/2026).',
      canEnrich: false,
      riskContext: null,
    }
  }

  if (status === 'NO_DATASET_PERIOD') {
    const period = context?.scope?.period
    return {
      text: period
        ? `Kỳ báo cáo ${formatPeriod(period)} chưa có dữ liệu tài sản được nhập. Vui lòng kiểm tra lại kỳ báo cáo hoặc tải dữ liệu cho kỳ này.`
        : 'Chưa có dữ liệu tài sản cho kỳ báo cáo được chọn.',
      canEnrich: false,
      riskContext: context,
    }
  }

  if (status === 'ZERO_RISK') {
    const zeroTimeframe = context?.scope?.period
      ? `trong ${formatPeriod(context.scope.period)}`
      : 'tại thời điểm hiện tại'
    return {
      text: `Không phát hiện rủi ro định giá nào phù hợp${buildScopeText(context?.scope)} ${zeroTimeframe}.`,
      canEnrich: false,
      riskContext: context,
    }
  }

  if (status !== 'OK' || !context) {
    return {
      text: 'Không có kết quả hợp lệ để hiển thị.',
      canEnrich: false,
      riskContext: context,
    }
  }

  const { scope, snapshot, byRiskType, byProvince, concentration, valuation, delta, riskCasesSample } = context
  const periodLabel = formatPeriod(scope?.period)
  const priorLabel = formatPeriod(scope?.priorPeriod)
  const scopeText = buildScopeText(scope)
  const timeframe = periodLabel ? `Trong ${periodLabel}` : 'Tại thời điểm hiện tại'

  const parts = []

  parts.push(
    `${timeframe}, có ${snapshot.totalAssets} tài sản trong phạm vi kiểm soát${scopeText}, trong đó ${snapshot.riskAssets} tài sản phát sinh rủi ro định giá (${snapshot.riskRatePct}% danh mục) với tổng ${snapshot.riskCases} case.`
  )

  const provinceRank = getRanking(context, 'province')
  const riskRank = getRanking(context, 'riskType')
  const topRisk = riskRank.leaders.length ? getRowByKey(byRiskType, riskRank.leaders[0]) : null
  if (topRisk) {
    parts.push(
      riskRank.isTie
        ? `Các loại rủi ro đồng hạng cao nhất là ${joinVietnamese(riskRank.leaders)} (${riskRank.value} case/nhóm).`
        : `Loại rủi ro chiếm tỷ trọng lớn nhất là ${topRisk.key} (${topRisk.cases} case, chiếm ${topRisk.sharePct}% tổng case).`
    )
  }

  if (provinceRank.leaders.length) {
    parts.push(
      provinceRank.isTie
        ? `Các địa bàn đồng hạng nhiều case nhất là ${joinVietnamese(provinceRank.leaders)} (${provinceRank.value} case/địa bàn).`
        : `Địa bàn có nhiều case nhất là ${provinceRank.leaders[0]} (${concentration.topProvinceCases} case, chiếm ${concentration.topProvinceSharePct}%); 3 địa bàn đầu chiếm ${concentration.top3SharePct}% tổng case.`
    )
  }

  parts.push(
    `Tổng giá trị định giá các tài sản rủi ro đạt ${formatBillion(valuation.totalValuation)} (bình quân ${formatBillion(valuation.avgValuation)}/tài sản); dư nợ TSBĐ ${formatBillion(valuation.totalDebt)} với ${valuation.totalDebt > 0 ? `${valuation.activeCollateralAssets} TSBĐ đang bảo đảm` : 'không có TSBĐ đang bảo đảm'}; LTV bình quân ${formatLtvPercent(valuation.avgLtv)}.`
  )

  if (delta?.priorPeriod) {
    const direction = delta.riskDeltaMoM >= 0 ? 'tăng' : 'giảm'
    const valuationDirection =
      valuation.valuationDeltaPct === null
        ? null
        : valuation.valuationDeltaPct >= 0
          ? 'tăng'
          : 'giảm'
    const deltaPart = valuationDirection
      ? `; giá trị định giá ${valuationDirection} ${Math.abs(valuation.valuationDeltaPct).toFixed(2)}% so với kỳ trước`
      : ''

    parts.push(
      `So với ${priorLabel}: tổng số case ${direction} ${Math.abs(delta.riskDeltaMoM)} (từ ${delta.priorRiskCases} lên ${snapshot.riskCases}); ${delta.emergingRiskAssets} tài sản phát sinh rủi ro mới và ${delta.closedRiskAssets} tài sản đã hết rủi ro${deltaPart}.`
    )
  }

  if (Array.isArray(riskCasesSample) && riskCasesSample.length > 0) {
    const sampleText = riskCasesSample
      .map((item) => {
        const value = Number.isFinite(item.valuation) ? `, giá trị định giá ${formatBillion(item.valuation)}` : ''
        return `${item.tenTaiSan || item.maTsDg} (${item.riskType || 'chưa rõ loại'}${value})`
      })
      .join('; ')
    parts.push(`Đáng chú ý nhất: ${sampleText}.`)
  }

  return {
    text: composeRiskAnswer({ text: 'OK', riskContext: context }, null),
    canEnrich: snapshot.riskCases > 0,
    riskContext: context,
  }
}

/*
  ======================================================
  EVIDENCE GROUNDING
  ======================================================
*/

const UNSUPPORTED_TOPIC_PHRASES = [
  'nợ xấu',
  'vỡ nợ',
  'không có khả năng trả nợ',
  'mất khả năng thanh toán',
  'giả mạo',
  'gian lận',
  'ngụy tạo',
  'khởi kiện',
  'kiện tụng',
  'tố tụng',
  'hình sự',
  'vụ án',
  'xếp hạng tín nhiệm',
  'thiệt hại tín dụng',
  'rủi ro pháp lý',
]

function containsUnsupportedTopic(text) {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

  return UNSUPPORTED_TOPIC_PHRASES.some((phrase) => {
    const normalizedPhrase = phrase
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
    return normalized.includes(normalizedPhrase)
  })
}

export function computeAllowedNumbers(context) {
  const allowed = new Set()
  const add = (value) => {
    const number = Number(value)
    if (Number.isFinite(number)) allowed.add(number)
  }
  const addScaledBillion = (value) => {
    const number = Number(value)
    if (Number.isFinite(number)) allowed.add(Math.round((number / 1_000_000_000) * 100) / 100)
  }

  if (!context) return allowed

  const { snapshot, byRiskType, byProvince, concentration, valuation, delta, persistentRisk, riskCasesSample } = context

  if (context.scope) {
    const addYearsOfPeriod = (value) => {
      const match = String(value || '').match(/^(\d{4})/)
      if (match) add(Number(match[1]))
    }
    addYearsOfPeriod(context.scope.period)
    addYearsOfPeriod(context.scope.priorPeriod)
    for (const period of context.scope.requestedPeriods || []) {
      addYearsOfPeriod(period)
    }
  }

  if (snapshot) {
    add(snapshot.totalAssets)
    add(snapshot.riskAssets)
    add(snapshot.riskCases)
    add(snapshot.riskRatePct)
  }

  for (const row of byRiskType || []) {
    add(row.cases)
    add(row.sharePct)
  }

  for (const row of byProvince || []) {
    add(row.cases)
    add(row.sharePct)
  }

  if (concentration) {
    add(concentration.topProvinceCases)
    add(concentration.topProvinceSharePct)
    add(concentration.top3SharePct)
  }

  if (valuation) {
    addScaledBillion(valuation.totalValuation)
    addScaledBillion(valuation.avgValuation)
    addScaledBillion(valuation.totalDebt)
    add(valuation.activeCollateralAssets)
    if (valuation.avgLtv !== null && valuation.avgLtv !== undefined) {
      add(valuation.avgLtv)
      add(Math.round(Number(valuation.avgLtv) * 100 * 10) / 10)
    }
    if (valuation.valuationDeltaPct !== null && valuation.valuationDeltaPct !== undefined) {
      add(Number(valuation.valuationDeltaPct))
    }
  }

  if (persistentRisk) {
    add(persistentRisk.persistentAssets)
    add(persistentRisk.threePlusAssets)
    add(persistentRisk.maxConsecutive)
  }

  if (delta) {
    add(delta.priorRiskCases)
    add(delta.riskDeltaMoM)
    if (Number(delta.priorRiskCases) > 0 && snapshot) {
      add(Math.round(((Number(snapshot.riskCases) - Number(delta.priorRiskCases)) / Number(delta.priorRiskCases)) * 1000) / 10)
    }
    add(Math.abs(delta.riskDeltaMoM))
    add(delta.emergingRiskAssets)
    add(delta.closedRiskAssets)
  }

  for (const item of riskCasesSample || []) {
    if (item.valuation !== null && item.valuation !== undefined) addScaledBillion(item.valuation)
    if (item.ltv !== null && item.ltv !== undefined) {
      add(Number(item.ltv))
      add(Math.round(Number(item.ltv) * 100 * 10) / 10)
    }
  }

  return allowed
}

function parseCandidateNumber(token) {
  const t = String(token || '').trim().replace(/\s+/g, '')
  if (!t) return null

  const trailingSeparator = t.match(/[.,](\d+)$/)
  const trailingDigits = trailingSeparator ? trailingSeparator[1].length : 0
  const separatorCount = (t.match(/[.,]/g) || []).length

  // Thousands grouping: more than one separator OR last separator followed by
  // exactly 3 digits (e.g. "8.640", "1.234.567").
  const isGrouped =
    separatorCount > 1 ||
    (trailingDigits === 3 && t.includes('.'))

  if (isGrouped) {
    return { value: Number(t.replace(/[.,]/g, '')), integer: true }
  }

  const normalized = t.replace(/,/g, '.')
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null

  return { value, integer: !normalized.includes('.') }
}

function isSalientCandidate(candidate) {
  if (!candidate) return false
  if (!candidate.integer) return true
  return Math.abs(candidate.value) >= 10
}

function extractCandidates(text) {
  const matches = String(text || '').match(/\d[\d.,]*/g) || []
  const candidates = matches
    .map(parseCandidateNumber)
    .filter(Boolean)
  return candidates
}

function isGrounded(candidate, allowedNumbers) {
  const target = candidate.integer ? candidate.value : Math.round(candidate.value * 100) / 100
  return allowedNumbers.has(target)
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.;\n])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function sanitizeEnrichmentText(text, allowedNumbers) {
  const kept = []
  const reasons = []
  let sanitized = false

  for (const sentence of splitSentences(text)) {
    if (containsUnsupportedTopic(sentence)) {
      sanitized = true
      reasons.push('unsupported-conclusion')
      continue
    }

    const candidates = extractCandidates(sentence)
    const floating = candidates.filter(isSalientCandidate).filter((candidate) => !isGrounded(candidate, allowedNumbers))

    if (floating.length > 0) {
      sanitized = true
      reasons.push(`ungrounded-number:${floating.map((c) => c.value).join(',')}`)
      continue
    }

    kept.push(sentence)
  }

  return { text: kept.join(' '), sanitized, reasons }
}

export function sanitizeEnrichment(enrichment, context) {
  const allowedNumbers = computeAllowedNumbers(context)

  const riskSeverity = (enrichment && ['LOW', 'MEDIUM', 'HIGH'].includes(enrichment.riskSeverity))
    ? enrichment.riskSeverity
    : 'MEDIUM'

  const analysisResult = sanitizeEnrichmentText(enrichment?.analysis, allowedNumbers)

  const priorities = Array.isArray(enrichment?.priorities) ? enrichment.priorities : []
  const sanitizedPriorities = []
  let prioritySanitized = false

  for (const item of priorities) {
    const itemResult = sanitizeEnrichmentText(String(item), allowedNumbers)
    if (itemResult.sanitized) prioritySanitized = true
    if (itemResult.text) sanitizedPriorities.push(itemResult.text)
  }

  return {
    riskSeverity,
    analysis: analysisResult.text,
    priorities: sanitizedPriorities,
    sanitized: analysisResult.sanitized || prioritySanitized,
    reasons: analysisResult.reasons,
  }
}

/*
  ======================================================
  CLIENT ENRICHMENT + COMPOSE
  ======================================================
*/

function trimSample(sample, max = 3) {
  return (sample || []).slice(0, max).map((item) => ({
    name: item.tenTaiSan || item.maTsDg,
    riskType: item.riskType || null,
    valuationB: Number.isFinite(Number(item.valuation))
      ? Math.round((Number(item.valuation) / 1_000_000_000) * 100) / 100
      : null,
  }))
}

// Compact, evidence-only payload for the MaaS enrichment call. Shrinks latency
// while preserving every number the engine treats as ground truth.
export function buildEnrichmentEvidence(context) {
  if (!context) return null
  const { scope, snapshot, byRiskType, byProvince, concentration, ranking, valuation, delta, persistentRisk } = context
  return {
    scope: scope
      ? {
          period: scope.period,
          priorPeriod: scope.priorPeriod || null,
          province: scope.province || null,
          assetGroup: scope.assetGroup || null,
          assetType: scope.assetType || null,
        }
      : null,
    snapshot: snapshot
      ? {
          totalAssets: snapshot.totalAssets,
          riskAssets: snapshot.riskAssets,
          riskCases: snapshot.riskCases,
          riskRatePct: snapshot.riskRatePct,
        }
      : null,
    byRiskType: (byRiskType || []).slice(0, 5).map((row) => ({ key: row.key, cases: row.cases, sharePct: row.sharePct })),
    byProvince: (byProvince || []).slice(0, 5).map((row) => ({ key: row.key, cases: row.cases, sharePct: row.sharePct })),
    ranking: ranking || null,
    concentration: concentration
      ? {
          topProvince: concentration.topProvince,
          topProvinceCases: concentration.topProvinceCases,
          topProvinceSharePct: concentration.topProvinceSharePct,
          top3SharePct: concentration.top3SharePct,
        }
      : null,
    valuation: valuation
      ? {
          totalValuationB: Math.round((valuation.totalValuation / 1_000_000_000) * 100) / 100,
          avgValuationB: Math.round((valuation.avgValuation / 1_000_000_000) * 100) / 100,
          totalDebtB: Math.round((valuation.totalDebt / 1_000_000_000) * 100) / 100,
          activeCollateralAssets: valuation.activeCollateralAssets,
          avgLtv: valuation.avgLtv,
          valuationDeltaPct: valuation.valuationDeltaPct,
        }
      : null,
    persistentRisk: persistentRisk
      ? {
          persistentAssets: persistentRisk.persistentAssets,
          threePlusAssets: persistentRisk.threePlusAssets,
          maxConsecutive: persistentRisk.maxConsecutive,
        }
      : null,
    delta: delta
      ? {
          priorRiskCases: delta.priorRiskCases,
          riskDeltaMoM: delta.riskDeltaMoM,
          emergingRiskAssets: delta.emergingRiskAssets,
          closedRiskAssets: delta.closedRiskAssets,
        }
      : null,
    riskCasesSample: trimSample(context.riskCasesSample),
  }
}

export async function fetchRiskEnrichment(
  question,
  riskContext,
  fetchImpl = globalThis.fetch
) {
  try {
    const evidence = buildEnrichmentEvidence(riskContext)
    const response = await fetchImpl('/api/ai/risk-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, evidence }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok || !data || data.success !== true) {
      return null
    }

    return data
  } catch (error) {
    return null
  }
}

const MAX_ANSWER_CHARS = 700

function buildSnapshotSummary(context) {
  const { scope, snapshot } = context || {}
  const periodLabel = formatPeriod(scope?.period)
  const scopeText = buildScopeText(scope).trim()
  if (!snapshot) return 'Không đủ dữ liệu để đưa ra nhận định.'
  const timeframe = periodLabel ? `Trong ${periodLabel}` : 'Tại thời điểm hiện tại'
  return `${timeframe}${scopeText ? ` (${scopeText})` : ''}, ${snapshot.riskAssets}/${snapshot.totalAssets} tài sản trong phạm vi kiểm soát có dấu hiệu rủi ro định giá (${snapshot.riskRatePct}%) với tổng ${snapshot.riskCases} case.`
}

function buildAttentionBullets(context, maxItems, maxLen) {
  if (!context) return ''
  const { byRiskType, concentration, delta } = context
  const bullets = []
  const provinceRank = getRanking(context, 'province')
  const riskRank = getRanking(context, 'riskType')
  const topRisk = riskRank.leaders.length ? getRowByKey(byRiskType, riskRank.leaders[0]) : null

  if (topRisk) {
    bullets.push(riskRank.isTie
      ? `- ${joinVietnamese(riskRank.leaders)} đồng hạng cao nhất: ${riskRank.value} case/nhóm.`
      : `- "${topRisk.key}" chiếm ${topRisk.cases} case (${topRisk.sharePct}% tổng case).`)
  }

  if (provinceRank.leaders.length) {
    bullets.push(provinceRank.isTie
      ? `- ${joinVietnamese(provinceRank.leaders)} đồng hạng cao nhất: ${provinceRank.value} case/địa bàn.`
      : `- ${provinceRank.leaders[0]} dẫn đầu ${concentration.topProvinceCases} case (${concentration.topProvinceSharePct}%); 3 địa bàn đầu cộng lại ${concentration.top3SharePct}%.`)
  }

  if (delta?.priorPeriod) {
    const direction = delta.riskDeltaMoM >= 0 ? 'tăng' : 'giảm'
    bullets.push(`- So với ${formatPeriod(delta.priorPeriod)}: tổng case ${direction} ${Math.abs(delta.riskDeltaMoM)} (${delta.priorRiskCases} → ${context?.snapshot?.riskCases}), ${delta.emergingRiskAssets} tài sản mới và ${delta.closedRiskAssets} tài sản hết rủi ro.`)
  }

  return bullets
    .slice(0, maxItems)
    .map((item) => clipTextLength(item, maxLen))
    .join('\n')
}

function buildPriorityBullets(context, enrichment, maxLen) {
  let items = []

  if (enrichment && Array.isArray(enrichment.priorities) && enrichment.priorities.length > 0) {
    items = enrichment.priorities.map((item) => `- ${item}`)
  } else if (context) {
    const { concentration, byRiskType, riskCasesSample } = context

    const sample = Array.isArray(riskCasesSample) ? riskCasesSample.slice(0, 2) : []
    if (sample.length > 0) {
      items.push(`- Kiểm tra chi tiết ${sample.map((item) => item.tenTaiSan || item.maTsDg).join(', ')} phát sinh rủi ro định giá.`)
    }

    const provinceRank = getRanking(context, 'province')
    const riskRank = getRanking(context, 'riskType')

    if (provinceRank.leaders.length) {
      items.push(provinceRank.isTie
        ? `- Rà soát đồng thời ${joinVietnamese(provinceRank.leaders)} (${provinceRank.value} case/địa bàn).`
        : `- Rà soát khu vực ${provinceRank.leaders[0]} (${concentration.topProvinceSharePct}% tổng case).`)
    }

    const topRisk = riskRank.leaders.length ? getRowByKey(byRiskType, riskRank.leaders[0]) : null
    if (topRisk) {
      items.push(riskRank.isTie
        ? `- Đối chiếu đồng thời ${joinVietnamese(riskRank.leaders)} (${riskRank.value} case/nhóm).`
        : `- Đối chiếu nhóm "${topRisk.key}" (${topRisk.cases} case).`)
    }
  }

  return items
    .slice(0, 3)
    .map((item) => clipTextLength(item, maxLen))
    .join('\n')
}

function clipTextLength(text, max) {
  if (max <= 0) return ''
  const value = String(text || '')
  if (value.length <= max) return value
  const cut = value.lastIndexOf(' ', max - 1)
  return `${value.slice(0, cut > 0 ? cut : max - 1)}…`
}

export function composeRiskAnswer(deterministic, enrichment) {
  if (!deterministic?.text) return 'Không có kết quả hợp lệ để hiển thị.'
  const context = deterministic.riskContext || null
  if (!context?.snapshot) return deterministic.text

  const { snapshot, byRiskType, concentration, delta, persistentRisk } = context
  const provinceRank = getRanking(context, 'province')
  const riskRank = getRanking(context, 'riskType')
  const topRisk = riskRank.leaders.length ? getRowByKey(byRiskType, riskRank.leaders[0]) : null

  const conclusionParts = []
  if (persistentRisk?.persistentAssets > 0) {
    const priorityCount = persistentRisk.threePlusAssets > 0
      ? persistentRisk.threePlusAssets
      : persistentRisk.persistentAssets
    const periods = persistentRisk.threePlusAssets > 0 ? '≥ 3 kỳ' : '≥ 2 kỳ'
    conclusionParts.push(`Ưu tiên ${priorityCount} tài sản có rủi ro kéo dài ${periods} liên tiếp`)
  }
  if (provinceRank.leaders.length) {
    conclusionParts.push(
      provinceRank.isTie
        ? `${provinceRank.leaderCount} địa bàn đồng mức cao nhất: ${joinVietnamese(provinceRank.leaders)}`
        : `địa bàn ${provinceRank.leaders[0]}`
    )
  }
  if (topRisk) {
    conclusionParts.push(
      riskRank.isTie
        ? `${riskRank.leaderCount} nhóm rủi ro đồng mức cao nhất: ${joinVietnamese(riskRank.leaders)}`
        : `nhóm “${topRisk.key}”`
    )
  }

  const conclusionPrefix = context?.scope?.period ? '' : 'Tại thời điểm hiện tại, '
  const conclusion = conclusionParts.length
    ? `${conclusionPrefix}${conclusionParts.join('; ')}.`
    : `${conclusionPrefix}chưa có tín hiệu nổi trội để xác định nhóm ưu tiên.`

  const grounds = [
    `• ${snapshot.riskAssets}/${snapshot.totalAssets} tài sản có dấu hiệu rủi ro (${snapshot.riskRatePct}%).`,
  ]
  if (provinceRank.leaders.length) {
    grounds.push(
      provinceRank.isTie
        ? `• ${joinVietnamese(provinceRank.leaders)} cùng có ${provinceRank.value} case/địa bàn, đồng mức cao nhất.`
        : `• ${provinceRank.leaders[0]} có ${concentration.topProvinceCases} case, cao nhất trong các địa bàn.`
    )
  }
  if (topRisk) {
    grounds.push(
      riskRank.isTie
        ? `• ${joinVietnamese(riskRank.leaders)} cùng có ${riskRank.value} case/nhóm, đồng mức cao nhất.`
        : `• Nhóm “${topRisk.key}” có ${topRisk.cases} case, chiếm ${topRisk.sharePct}% tổng case.`
    )
  }
  if (persistentRisk?.persistentAssets > 0) {
    const extra = persistentRisk.threePlusAssets > 0 ? `; ${persistentRisk.threePlusAssets} tài sản kéo dài ≥ 3 kỳ` : ''
    grounds.push(`• ${persistentRisk.persistentAssets} tài sản rủi ro ≥ 2 kỳ liên tiếp${extra}.`)
  }

  let trend = 'Chưa đủ ít nhất 2 kỳ dữ liệu để đánh giá xu hướng.'
  if (delta?.priorPeriod && Number.isFinite(Number(delta.priorRiskCases))) {
    const prior = Number(delta.priorRiskCases)
    const current = Number(snapshot.riskCases)
    if (prior > 0) {
      const pct = Math.round(((current - prior) / prior) * 1000) / 10
      trend = `Tổng số case ${current >= prior ? 'tăng' : 'giảm'} từ ${prior} lên ${current} so với ${formatPeriod(delta.priorPeriod)} (${pct >= 0 ? '+' : ''}${pct}%).`
    } else {
      trend = `Kỳ ${formatPeriod(delta.priorPeriod)} chưa ghi nhận case; kỳ hiện tại có ${current} case.`
    }
  }

  const priorities = []
  if (persistentRisk?.persistentAssets > 0) {
    priorities.push(`P1: Rủi ro kéo dài – ${persistentRisk.persistentAssets} tài sản ≥ 2 kỳ liên tiếp${persistentRisk.threePlusAssets > 0 ? `, trong đó ${persistentRisk.threePlusAssets} tài sản ≥ 3 kỳ` : ''}.`)
  }
  if (provinceRank.leaders.length) {
    priorities.push(
      provinceRank.isTie
        ? `P${priorities.length + 1}: ${joinVietnamese(provinceRank.leaders)} – ${provinceRank.value} case/địa bàn (đồng hạng).`
        : `P${priorities.length + 1}: ${provinceRank.leaders[0]} – ${concentration.topProvinceCases} case.`
    )
  }
  if (topRisk) {
    priorities.push(
      riskRank.isTie
        ? `P${priorities.length + 1}: ${joinVietnamese(riskRank.leaders)} – ${riskRank.value} case/nhóm (đồng hạng).`
        : `P${priorities.length + 1}: Nhóm “${topRisk.key}” – ${topRisk.cases} case.`
    )
  }

  const hasRankingTie = provinceRank.isTie || riskRank.isTie
  const aiNote = enrichment?.analysis && !hasRankingTie ? `

AI BỔ SUNG
${clipTextLength(String(enrichment.analysis), 180)}` : ''

  return [
    `KẾT LUẬN
${conclusion}`,
    `CĂN CỨ CHÍNH
${grounds.join('\n')}`,
    `XU HƯỚNG
${trend}`,
    `ƯU TIÊN KIỂM TRA
${priorities.slice(0, 3).join('\n') || 'Chưa có nhóm ưu tiên nổi trội.'}`,
  ].join('\n\n') + aiNote
}
