// Risk Intent Planner V2.5
// Semantic planner for risk-oriented Vietnamese questions.
// It extracts risk polarity/type, requested dimensions, requested financial metrics,
// aggregation semantics, explicit periods and limits without matching full questions.

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    // Keep / . - because they carry date meaning (07.2026, 8/2026, ISO dates).
    .replace(/[^a-z0-9/.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function monthEnd(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!y || !m || m < 1 || m > 12) return null
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function extractPeriods(q) {
  const periods = []
  const add = (period) => {
    if (period && !periods.includes(period)) periods.push(period)
  }

  for (const match of q.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    add(match[0])
  }

  for (const match of q.matchAll(/(?:thang\s*)?0?(\d{1,2})\s*[/.]\s*(\d{4})/g)) {
    add(monthEnd(match[2], match[1]))
  }

  for (const match of q.matchAll(/thang\s*0?(\d{1,2})\s+nam\s+(\d{4})/g)) {
    add(monthEnd(match[2], match[1]))
  }

  return periods
}

function extractProvince(q) {
  if (/\bha noi\b/.test(q)) return 'Hà Nội'
  if (/\b(ho chi minh|tp hcm|tphcm|tp ho chi minh|thanh pho ho chi minh)\b/.test(q)) {
    return 'TP. Hồ Chí Minh'
  }
  return null
}

function extractRequestedLimit(q) {
  const top = q.match(/\btop\s*(\d+)\b/)
  if (top) return Number(top[1])

  const count = q.match(/\b0*(\d+)\s+(?:tai san|case|ts)\b/)
  if (count) {
    const n = Number(count[1])
    if (Number.isInteger(n) && n > 0) return n
  }

  if (/\b(nhieu nhat|cao nhat|lon nhat)\b/.test(q)) return 1
  return null
}


function detectAssetType(q) {
  if (/\bo to\b/.test(q)) return 'Ô tô'
  if (/\bnha dat\b/.test(q)) return 'Nhà đất'
  if (/\bcan ho chung cu\b/.test(q)) return 'Căn hộ chung cư'
  if (/\bchcc\b/.test(q)) return 'CHCC'
  if (/\bchung cu\b/.test(q)) return 'CHCC'
  if (/\bhang hoa\b/.test(q)) return 'Hàng hóa'
  return null
}

function detectAssetGroupFilter(q) {
  // Do not treat the phrase "nhóm tài sản" itself as a concrete group filter.
  if (/\b(bat dong san|bds)\b/.test(q)) return 'BĐS'
  if (/\bdong san\b/.test(q) && !/\bbat dong san\b/.test(q)) return 'Động sản'
  return null
}

function detectRiskType(q) {
  if (
    q.includes('sai phuong phap dinh gia') ||
    q.includes('sai phuong phap') ||
    q.includes('khong dung phuong phap dinh gia')
  ) return 'Sai phương pháp'

  if (q.includes('sai vi tri') || q.includes('sai dia diem') || q.includes('vi tri sai')) {
    return 'Sai vị trí'
  }

  if (q.includes('sai thong tin tai san') || q.includes('thong tin tai san sai')) {
    return 'Sai thông tin tài sản'
  }

  // 'định giá cao' is a risk type only when it is not the comparative phrase
  // 'giá trị định giá cao nhất/lớn nhất'.
  if (q.includes('dinh gia cao') && !q.includes('dinh gia cao nhat')) return 'Định giá cao'
  return null
}

function detectRiskPolarity(q) {
  if (
    q.includes('khong co rui ro') ||
    q.includes('khong rui ro') ||
    q.includes('khong phat hien rui ro')
  ) return 'NO_RISK'

  if (
    q.includes('rui ro') ||
    q.includes('case sai') ||
    q.includes('tai san sai') ||
    q.includes('ts sai') ||
    (q.includes('sai') && (q.includes('tai san') || q.includes('case') || q.includes(' ts '))) ||
    q.includes('sai phuong phap') ||
    q.includes('sai vi tri') ||
    q.includes('sai thong tin')
  ) return 'RISK'

  return 'UNSPECIFIED'
}

function detectRequestedMetrics(q) {
  const metrics = []
  const add = (metric) => {
    if (!metrics.includes(metric)) metrics.push(metric)
  }

  if (q.includes('du no')) add('duNoTsbd')
  if (q.includes('ltv')) add('ltv')
  if (q.includes('gia tri bao dam') || q.includes('gt bao dam')) add('gtBaoDam')

  const genericRiskAssetValue =
    (q.includes('gia tri bao nhieu') || q.includes('gia tri la bao nhieu') || q.includes('gia tri')) &&
    (q.includes('rui ro') || q.includes('sai')) &&
    !q.includes('gia tri bao dam')

  if (
    q.includes('gia tri dinh gia') ||
    q.includes('gt dinh gia') ||
    // In valuation-risk context, an unqualified "giá trị tài sản" means valuation value.
    q.includes('gia tri tai san') ||
    (q.includes('gia tri') &&
      !q.includes('gia tri bao dam') &&
      (q.includes('tai san rui ro') || q.includes('tai san bi rui ro') || q.includes('ts rui ro') || q.includes('ts bi rui ro'))) ||
    genericRiskAssetValue
  ) add('gtDinhGia')

  return metrics
}

function detectAggregation(q) {
  if (q.includes('binh quan') || q.includes('trung binh')) return 'AVG'
  if (q.includes('tong')) return 'SUM'
  if (q.includes('thap nhat') || q.includes('nho nhat')) return 'MIN'
  if (q.includes('cao nhat') || q.includes('lon nhat')) return 'MAX'
  return null
}

function asksLocation(q) {
  return (
    q.includes('o dau') ||
    q.includes('tai dau') ||
    q.includes('dia ban nao') ||
    q.includes('dia ban') ||
    q.includes('thong tin dia ban') ||
    q.includes('tinh') ||
    q.includes('thanh pho')
  )
}

function asksTimeOutput(q) {
  return (
    q.includes('thoi diem') ||
    q.includes('luc nao') ||
    q.includes('khi nao') ||
    q.includes('thoi gian') ||
    q.includes('thang may') ||
    q.includes('thang nao') ||
    q.includes('ky nao')
  )
}


function asksDistribution(q) {
  return q.includes('tap trung') || q.includes('phan bo')
}

function asksExistence(q, riskPolarity = 'UNSPECIFIED') {
  if (riskPolarity === 'NO_RISK' && (q.includes('bao nhieu') || q.includes('so luong'))) return false
  if (!q.includes('khong')) return false

  return (
    (q.includes('co phat sinh') && q.includes('khong')) ||
    /\bco .* rui ro .*khong\b/.test(q) ||
    /\bco phai .*khong\b/.test(q) ||
    /\bphai .*khong\b/.test(q) ||
    /\bbi rui ro .*khong\b/.test(q) ||
    /\brui ro .*khong\b/.test(q)
  )
}

function asksCount(q) {
  return (
    /\bco bao nhieu\b/.test(q) ||
    /\bbao nhieu (?:tai san|case|ts|tsbd)\b/.test(q) ||
    /\bso luong (?:tai san|case|ts|tsbd)\b/.test(q) ||
    /\bdem (?:so )?(?:tai san|case|ts|tsbd)\b/.test(q)
  )
}


function wantsRiskCaseCount(q) {
  return q.includes('case') || (q.includes('phat sinh rui ro') && !q.includes('tai san'))
}

function asksCompare(q) {
  return q.includes('so sanh') || q.includes('chenh lech') || q.includes('khac nhau')
}

function asksAssetList(q) {
  return (
    q.includes('tai san nao') ||
    q.includes('case nao') ||
    q.includes('ts nao') ||
    q.includes('tsbd nao') ||
    q.includes('la tai san nao') ||
    q.includes('chi ten') ||
    q.includes('liet ke') ||
    q.includes('danh sach') ||
    q.includes('gom nhung') ||
    q.includes('nhung tai san') ||
    q.includes('nhung ts') ||
    q.includes('ma la gi') ||
    q.includes('ma nao') ||
    q.includes('loai hinh tai san') ||
    q.includes('loai tai san') ||
    q.includes('cho toi cac tai san') ||
    q.includes('cho biet tai san') ||
    q.includes('tai san gi') ||
    q.includes('cac tai san')
  )
}

function detectRequestedDetailFields(q) {
  const fields = []
  const add = (field) => {
    if (!fields.includes(field)) fields.push(field)
  }

  if (
    q.includes('ten tai san') ||
    q.includes('ten ts') ||
    q.includes('chi ten') ||
    q.includes('ten tsbd')
  ) add('assetName')

  if (
    q.includes('ma tai san') ||
    q.includes('ma ts') ||
    q.includes('ma la gi') ||
    q.includes('ma nao')
  ) add('assetCode')

  if (q.includes('ma tsbd') || q.includes('tsbd nao') || q.includes('ten tsbd')) {
    add('collateralCode')
  }

  if (q.includes('loai hinh tai san') || q.includes('loai tai san')) {
    add('assetType')
  }

  if (q.includes('nhom tai san')) add('assetGroup')

  return fields
}


function detectRequestedDimension(q, context = {}) {
  const { requestedMetrics = [], requestedDetailFields = [], explicitLimit = null, assetList = false } = context
  const otherDetails = requestedDetailFields.filter((field) => !['assetType', 'assetGroup'].includes(field))
  const hasProjection = requestedMetrics.length > 0 || otherDetails.length > 0 || Boolean(explicitLimit)
  const asksWhichKind = (needle) => q.includes(needle) && (q.includes(' nao') || q.includes(' gi') || q.includes(' la '))
  const rankingLanguage = q.includes('nhieu nhat') || /\bnhieu .* nhat\b/.test(q) || q.includes('cao nhat') || /\bcao .* nhat\b/.test(q) || q.includes('lon nhat') || /\blon .* nhat\b/.test(q)

  // Aggregate location questions such as "75 case phát sinh rủi ro tại đâu" by province.
  // A leading case count describes the population, not a request to list N individual records.
  const asksAggregateLocation =
    q.includes('tai dau') &&
    (q.includes('case') || q.includes('phat sinh rui ro') || q.includes('rui ro')) &&
    !assetList
  if (asksAggregateLocation) return 'province'

  if (q.includes('nhom tai san bao dam') || q.includes('theo nhom tai san') || (q.includes('phan bo') && q.includes('nhom tai san'))) return 'assetGroup'
  if (!hasProjection && (q.includes('nhom tai san nao') || q.includes('nhom nao') || asksWhichKind('nhom tai san') || (rankingLanguage && q.includes('nhom tai san')))) return 'assetGroup'

  if (q.includes('theo loai tai san') || (q.includes('phan bo') && (q.includes('loai tai san') || q.includes('loai hinh tai san')))) return 'assetType'
  if (!hasProjection && (q.includes('loai tai san nao') || q.includes('loai hinh tai san nao') || asksWhichKind('loai tai san') || asksWhichKind('loai hinh tai san') || (rankingLanguage && (q.includes('loai tai san') || q.includes('loai hinh tai san'))))) return 'assetType'

  if (q.includes('theo tinh') || q.includes('theo thanh pho') || q.includes('theo dia ban') || (q.includes('phan bo') && (q.includes('tinh') || q.includes('thanh pho') || q.includes('dia ban')))) return 'province'
  if (!hasProjection && (q.includes('tinh nao') || q.includes('thanh pho nao') || q.includes('dia ban nao') || (rankingLanguage && (q.includes('tinh') || q.includes('thanh pho') || q.includes('dia ban'))))) return 'province'

  if (q.includes('theo don vi dinh gia')) return 'valuationUnit'
  if (!hasProjection && (q.includes('don vi dinh gia nao') || (rankingLanguage && q.includes('don vi dinh gia')))) return 'valuationUnit'

  if (q.includes('theo loai rui ro') || (!hasProjection && (q.includes('loai rui ro nao') || asksWhichKind('loai rui ro') || (rankingLanguage && q.includes('loai rui ro'))))) return 'valuationRisk'

  // Câu hỏi lịch sử như "rủi ro tập trung vào tháng mấy/kỳ nào"
  // phải nhóm theo kỳ snapshot thay vì yêu cầu người dùng nói rõ phép xử lý.
  if (
    q.includes('theo thang') ||
    q.includes('theo ky') ||
    q.includes('thang may') ||
    q.includes('thang nao') ||
    q.includes('ky nao')
  ) return 'queryPeriod'

  return null
}

function asksRanking(q) {
  return (
    q.includes('nhieu nhat') || /\bnhieu .* nhat\b/.test(q) ||
    q.includes('cao nhat') || /\bcao .* nhat\b/.test(q) ||
    q.includes('lon nhat') || /\blon .* nhat\b/.test(q) ||
    (q.includes('tap trung') && (q.includes('thang may') || q.includes('thang nao') || q.includes('ky nao')))
  )
}

function asksUnitRanking(q) {
  return (
    (q.includes('don vi nao') || q.includes('don vi')) &&
    (q.includes('nhieu nhat') || q.includes('cao nhat') || (q.includes('nhieu') && q.includes('nhat')))
  )
}

function metricToAggregate(metric, aggregation) {
  const map = {
    gtDinhGia: { AVG: 'AVG_VALUATION', SUM: 'TOTAL_VALUATION', MAX: 'MAX_VALUATION', MIN: 'MIN_VALUATION' },
    duNoTsbd: { AVG: 'AVG_DEBT', SUM: 'TOTAL_DEBT', MAX: 'MAX_DEBT', MIN: 'MIN_DEBT' },
    gtBaoDam: { AVG: 'AVG_COLLATERAL_VALUE', SUM: 'TOTAL_COLLATERAL_VALUE', MAX: 'MAX_COLLATERAL_VALUE', MIN: 'MIN_COLLATERAL_VALUE' },
    ltv: { AVG: 'AVG_LTV', MAX: 'MAX_LTV', MIN: 'MIN_LTV' },
  }
  return map[metric]?.[aggregation] || null
}

function createBase(periods, defaultPeriod = null, useAllPeriods = false) {
  const explicitSingle = periods.length === 1 ? periods[0] : null
  const multiPeriods = periods.length > 1
  const effectivePeriod = explicitSingle || (!useAllPeriods && !multiPeriods ? defaultPeriod : null)

  return {
    version: '2.0',
    timeContext: effectivePeriod
      ? { mode: 'SINGLE_PERIOD', period: effectivePeriod, fromPeriod: null, toPeriod: null }
      : { mode: 'ALL_PERIODS', period: null, fromPeriod: null, toPeriod: null },
    steps: [],
    answerContext: {
      domain: 'RISK',
      intent: 'LIST',
      requestedFields: ['asset'],
      requestedMetrics: [],
      requestedDetailFields: [],
      requestedPeriods: periods,
      riskPolarity: 'UNSPECIFIED',
      riskType: null,
      aggregation: null,
      clarificationRequired: false,
    },
  }
}

const ANALYTICAL_HINTS = [
  'phan tich',
  'de xuat',
  'nhan xet',
  'nhan dinh',
  'goi y',
  'khuyen nghi',
  'tong quan',
]

// Comparison / trend / change questions that ask for a qualitative read ("so sánh",
// "biến động", "xu hướng", "thay đổi") route to RiskContext. A PURE numeric
// comparison ("so sánh số tài sản rủi ro tháng 7 vs 8") stays deterministic
// because it is a count query.
const TREND_ANALYTICAL_HINTS = [
  'bien dong',
  'xu huong',
  'thay doi',
  'tang giam',
  'dien bien',
]

// "đáng chú ý nhất", "cần ưu tiên", "nên kiểm tra gì", "nổi bật" ... are explicit
// asks for analysis / prioritization, not for raw facts.
const NOTABLE_ANALYTICAL_HINTS = [
  'dang chu y',
  'dang luu y',
  'can luu y',
  'noi bat',
  'khac biet',
  'dang ngai',
  'uu tien',
  'can kiem tra',
  'nen kiem tra',
  'kiem tra gi',
  'can lam gi',
  'nen lam gi',
]

// Soft analytical questions about conclusions the collision dataset cannot
// support (loss, default, NPL, fraud, legality, credit damage). They must reach
// the evidence-grounded RiskContext path, never the legacy LLM /api/ai/query-plan.
const UNSUPPORTED_CONCLUSION_HINTS = [
  'no xau',
  'vo no',
  'khong co kha nang tra no',
  'mat kha nang thanh toan',
  'mat von',
  'thiet hai tin dung',
  'gian lan',
  'giam mao',
  'nguy tao',
  'khoi kien',
  'kien tung',
  'to tung',
  'hinh su',
  'vu an',
  'xep hang tin nhiem',
  'rui ro phap ly',
  'to that',
]

function isNumericComparison(q) {
  // "so sánh số tài sản / số case / số lượng / số hồ sơ tháng A và B" is a pure
  // count comparison and stays deterministic (counts must remain deterministic).
  return /\bso (luong|tai san|case|ho so)\b/.test(q)
}

export function isAnalyticalQuestion(q) {
  if (!q) return false
  if (ANALYTICAL_HINTS.some((hint) => q.includes(hint))) return true
  if (UNSUPPORTED_CONCLUSION_HINTS.some((hint) => q.includes(hint))) return true
  if (NOTABLE_ANALYTICAL_HINTS.some((hint) => q.includes(hint))) return true
  if (TREND_ANALYTICAL_HINTS.some((hint) => q.includes(hint))) return true
  if (q.includes('so sanh') && !isNumericComparison(q)) return true
  return false
}

// Exported for reuse by the V2.6.7 Risk Context engine (deterministic
// evidence builder) so analytical questions share the same normalization
// and extraction semantics as the deterministic planners.
export {
  normalize,
  extractPeriods,
  extractProvince,
  detectRiskType,
  detectAssetType,
  detectAssetGroupFilter,
}

export function createRiskIntentPlan(question, planningContext = {}) {
  const q = normalize(question)
  if (!q) return null
  if (isAnalyticalQuestion(q)) return null

  const riskPolarity = detectRiskPolarity(q)
  const explicitRiskType = detectRiskType(q)
  const riskType =
    riskPolarity === 'NO_RISK'
      ? null
      : explicitRiskType || planningContext?.detectedRiskType || planningContext?.defaultRiskType || null
  const assetType = detectAssetType(q)
  const assetGroupFilter = detectAssetGroupFilter(q)
  if (riskPolarity === 'UNSPECIFIED' && !riskType) return null

  const periods = extractPeriods(q)
  const province = planningContext?.detectedProvince || extractProvince(q)
  const limit = extractRequestedLimit(q)
  const requestedMetrics = detectRequestedMetrics(q)
  const requestedDetailFields = detectRequestedDetailFields(q)
  const aggregation = detectAggregation(q)
  const locationRequested = asksLocation(q)
  const timeRequested = asksTimeOutput(q)
  const distribution = asksDistribution(q)
  const existence = asksExistence(q, riskPolarity)
  const compareRequested = asksCompare(q)
  const countRequested = asksCount(q) || (compareRequested && (q.includes('so tai san') || q.includes('so case')))
  const assetList = asksAssetList(q)
  const unitRanking = asksUnitRanking(q)
  const explicitLimit = /\b0*\d+\s+(?:tai san|case|ts|tsbd)\b/.test(q) ? limit : null
  let requestedDimension = detectRequestedDimension(q, { requestedMetrics, requestedDetailFields, explicitLimit, assetList })
  const rankingRequested = asksRanking(q)
  if (timeRequested && !distribution && !rankingRequested && !countRequested) requestedDimension = null

  const useAllPeriods = periods.length > 1 || (periods.length === 0 && timeRequested)
  const defaultPeriod = planningContext?.defaultPeriod || null
  const plan = createBase(periods, defaultPeriod, useAllPeriods)
  plan.answerContext.riskPolarity = riskPolarity
  plan.answerContext.riskType = riskType
  plan.answerContext.assetType = assetType
  plan.answerContext.assetGroup = assetGroupFilter
  plan.answerContext.requestedMetrics = requestedMetrics
  plan.answerContext.requestedDetailFields = requestedDetailFields
  plan.answerContext.aggregation = aggregation

  // Multi-period queries are executed over ALL_PERIODS, then scoped explicitly.
  if (periods.length > 1) {
    plan.steps.push({ action: 'FILTER', field: 'queryPeriod', operator: 'IN', value: periods })
  }

  if (province) {
    plan.steps.push({ action: 'FILTER', field: 'province', operator: 'EQ', value: province })
  }

  if (assetType) {
    plan.steps.push({ action: 'FILTER', field: 'assetType', operator: 'EQ', value: assetType })
  }

  if (assetGroupFilter) {
    plan.steps.push({ action: 'FILTER', field: 'assetGroup', operator: 'EQ', value: assetGroupFilter })
  }

  if (riskPolarity === 'NO_RISK') {
    plan.steps.push({ action: 'FILTER', field: 'valuationRisk', operator: 'EMPTY' })
  } else if (riskType) {
    plan.steps.push({ action: 'FILTER', field: 'valuationRisk', operator: 'EQ', value: riskType })
  } else {
    plan.steps.push({ action: 'FILTER', field: 'valuationRisk', operator: 'NOT_EMPTY' })
  }


  // Multi-period comparisons that are fully specified as counts can be answered deterministically.
  if (compareRequested && periods.length > 1 && countRequested) {
    plan.answerContext.intent = 'PERIOD_DISTRIBUTION'
    plan.answerContext.groupDimension = 'queryPeriod'
    plan.answerContext.requestedFields = ['time', 'count']
    plan.answerContext.countEntity = wantsRiskCaseCount(q) ? 'riskCase' : 'asset'
    plan.steps.push(
      { action: 'GROUP_BY', field: 'queryPeriod' },
      { action: 'AGGREGATE', metric: wantsRiskCaseCount(q) ? 'RISK_CASE_COUNT' : 'COUNT' },
      { action: 'SORT', by: 'key', order: 'ASC' },
    )
    return plan
  }

  // Pure COUNT without a grouping dimension.
  if (countRequested && !requestedDimension) {
    plan.answerContext.intent = 'COUNT'
    plan.answerContext.requestedFields = ['count']
    plan.answerContext.countEntity = wantsRiskCaseCount(q) ? 'riskCase' : 'asset'
    plan.steps.push({ action: 'AGGREGATE', metric: wantsRiskCaseCount(q) ? 'RISK_CASE_COUNT' : 'COUNT' })
    return plan
  }


  if (requestedDimension) {
    plan.answerContext.intent = rankingRequested ? 'RANK_DIMENSION' : 'DIMENSION_DISTRIBUTION'
    plan.answerContext.groupDimension = requestedDimension
    plan.answerContext.requestedFields = [requestedDimension, 'count']
    plan.answerContext.countEntity = wantsRiskCaseCount(q) ? 'riskCase' : 'asset'
    plan.steps.push(
      { action: 'GROUP_BY', field: requestedDimension },
      { action: 'AGGREGATE', metric: wantsRiskCaseCount(q) ? 'RISK_CASE_COUNT' : 'COUNT' },
      { action: 'SORT', by: 'value', order: 'DESC' },
    )
    if (rankingRequested) plan.steps.push({ action: 'LIMIT', value: limit || 1 })
    else if (limit) plan.steps.push({ action: 'LIMIT', value: limit })
    return plan
  }

  if (unitRanking) {
    plan.answerContext.intent = 'RANK'
    plan.answerContext.requestedFields = ['valuationUnit', 'count']
    plan.answerContext.countEntity = 'riskCase'
    plan.steps.push(
      { action: 'GROUP_BY', field: 'valuationUnit' },
      { action: 'AGGREGATE', metric: 'RISK_CASE_COUNT' },
      { action: 'SORT', by: 'value', order: 'DESC' },
      { action: 'LIMIT', value: limit || 1 },
    )
    return plan
  }

  // Numeric metric aggregation (AVG/SUM/MAX/MIN) takes precedence over plain listing.
  if (aggregation && requestedMetrics.length > 0) {
    const primaryMetric = requestedMetrics[0]
    const aggregateMetric = metricToAggregate(primaryMetric, aggregation)

    if (!aggregateMetric) {
      plan.answerContext.clarificationRequired = true
      plan.answerContext.clarificationReason = 'UNSUPPORTED_AGGREGATION_METRIC'
      return plan
    }

    plan.answerContext.intent = 'METRIC_AGGREGATE'
    plan.answerContext.requestedFields = ['value', ...(periods.length > 1 ? ['time'] : [])]
    plan.answerContext.primaryMetric = primaryMetric

    if (periods.length > 1) {
      plan.steps.push({ action: 'GROUP_BY', field: 'queryPeriod' })
    }
    plan.steps.push({ action: 'AGGREGATE', metric: aggregateMetric })
    return plan
  }

  // Explicit number + requested values means list concrete assets and project metrics.
  if (requestedMetrics.length > 0) {
    plan.answerContext.intent = 'LIST'
    plan.answerContext.requestedFields = [
      'asset',
      ...requestedDetailFields,
      ...requestedMetrics,
      ...(locationRequested ? ['province'] : []),
      ...(timeRequested ? ['time'] : []),
      ...(riskType ? ['riskType'] : []),
    ]
    if (limit) plan.steps.push({ action: 'LIMIT', value: limit })
    return plan
  }

  if (limit && timeRequested) {
    plan.answerContext.intent = 'LIST'
    plan.answerContext.requestedFields = [
      'asset',
      ...(locationRequested ? ['province'] : []),
      'time',
      ...(riskType ? ['riskType'] : []),
    ]
    plan.steps.push({ action: 'LIMIT', value: limit })
    return plan
  }

  if (distribution && locationRequested) {
    plan.answerContext.intent = 'DISTRIBUTION'
    plan.answerContext.requestedFields = ['province', 'count', ...(timeRequested ? ['time'] : [])]
    plan.answerContext.countEntity = 'asset'
    plan.steps.push(
      { action: 'GROUP_BY', field: 'province' },
      { action: 'AGGREGATE', metric: 'COUNT' },
      { action: 'SORT', by: 'value', order: 'DESC' },
    )
    if (limit) plan.steps.push({ action: 'LIMIT', value: limit })
    return plan
  }

  if (existence) {
    plan.answerContext.intent = 'EXISTS'
    plan.answerContext.requestedFields = ['asset', 'province', 'time']
    if (limit) plan.steps.push({ action: 'LIMIT', value: limit })
    return plan
  }

  if (assetList || requestedDetailFields.length > 0 || locationRequested || timeRequested || limit) {
    plan.answerContext.intent = 'LIST'
    plan.answerContext.requestedFields = [
      'asset',
      ...requestedDetailFields,
      ...(locationRequested ? ['province'] : []),
      ...(timeRequested ? ['time'] : []),
      ...(riskType ? ['riskType'] : []),
    ]
    if (limit) plan.steps.push({ action: 'LIMIT', value: limit })
    return plan
  }

  plan.answerContext.clarificationRequired = true
  plan.answerContext.clarificationReason = 'MISSING_OPERATION'
  return plan
}
