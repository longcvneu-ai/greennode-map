// src/AI/v2/greennodeAdapter.js


/*
  ======================================================
  NORMALIZE QUESTION
  ======================================================

  Mục tiêu:
  Chuẩn hóa câu tiếng Việt để nhận diện intent dễ hơn.

  Ví dụ:
  "Có bao nhiêu tài sản tại Hà Nội?"
  ->
  "co bao nhieu tai san tai ha noi"
*/
import {
  getAssetsByReportingPeriod,
  getReportingPeriods,
} from '../../services/assetService.js'

import {
  getPersistentRiskSummary,
} from '../../services/persistentRiskService.js'

import {
  createRiskIntentPlan,
  isAnalyticalQuestion,
} from './riskIntentPlanner.js'

import {
  buildRiskContext,
} from './riskContextEngine.js'

function normalizeQuestion(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(
      /[.,!?;:]/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
}


/*
  ======================================================
  PERIOD
  ======================================================
*/

function getMonthEndPeriod(
  year,
  month
) {
  const numericYear =
    Number(year)

  const numericMonth =
    Number(month)

  if (
    !numericYear ||
    !numericMonth ||
    numericMonth < 1 ||
    numericMonth > 12
  ) {
    return null
  }

  const lastDay =
    new Date(
      Date.UTC(
        numericYear,
        numericMonth,
        0
      )
    ).getUTCDate()

  return [
    numericYear,
    String(
      numericMonth
    ).padStart(2, '0'),
    String(
      lastDay
    ).padStart(2, '0'),
  ].join('-')
}


function extractPeriod(
  normalizedQuestion
) {
  /*
    Hỗ trợ:
    2026-08-31
  */

  const isoMatch =
    normalizedQuestion.match(
      /\b(\d{4})-(\d{2})-(\d{2})\b/
    )

  if (isoMatch) {
    return isoMatch[0]
  }


  /*
    Hỗ trợ:
    tháng 8/2026
  */

  const slashMatch =
    normalizedQuestion.match(
      /thang\s*(\d{1,2})\s*\/\s*(\d{4})/
    )

  if (slashMatch) {
    return getMonthEndPeriod(
      slashMatch[2],
      slashMatch[1]
    )
  }


  /*
    Hỗ trợ:
    tháng 8 năm 2026
  */

  const yearMatch =
    normalizedQuestion.match(
      /thang\s*(\d{1,2})\s+nam\s+(\d{4})/
    )

  if (yearMatch) {
    return getMonthEndPeriod(
      yearMatch[2],
      yearMatch[1]
    )
  }

  return null
}
function extractComparePeriods(
  normalizedQuestion
) {
  const matches = [
    ...normalizedQuestion.matchAll(
      /thang\s+(\d{1,2})\s*\/\s*(\d{4})/g
    ),
  ]

  if (matches.length < 2) {
    return null
  }

  const periods = matches
    .slice(0, 2)
    .map((match) => {
      const month =
        Number(match[1])

      const year =
        Number(match[2])

      return getMonthEndPeriod(
        year,
        month
      )
    })

  return {
    fromPeriod: periods[0],
    toPeriod: periods[1],
  }
}

/*
  ======================================================
  PROVINCE
  ======================================================
*/

function extractProvince(
  normalizedQuestion
) {
  if (
    normalizedQuestion.includes(
      'ha noi'
    )
  ) {
    return 'Hà Nội'
  }

  if (
    normalizedQuestion.includes(
      'tp ho chi minh'
    ) ||
    normalizedQuestion.includes(
      'thanh pho ho chi minh'
    ) ||
    normalizedQuestion.includes(
      'tp hcm'
    ) ||
    normalizedQuestion.includes(
      'tphcm'
    ) ||
    normalizedQuestion.includes(
      'ho chi minh'
    )
  ) {
    return 'TP. Hồ Chí Minh'
  }

  return null
}

/*
  ======================================================
  ASSET GROUP
  ======================================================
*/

function extractAssetGroup(
  normalizedQuestion
) {
  if (
    normalizedQuestion.includes(
      'bat dong san'
    ) ||
    normalizedQuestion.includes(
      'bds'
    )
  ) {
    return 'BĐS'
  }

  if (
    normalizedQuestion.includes(
      'dong san'
    )
  ) {
    return 'Động sản'
  }

  return null
}
/*
  ======================================================
  DYNAMIC DIMENSION MATCHER
  ======================================================

  Lấy giá trị thực tế từ dataset
  của đúng kỳ báo cáo.

  Hiện dùng cho valuationUnit.
  Sau này có thể mở rộng cho
  các dimension động khác.
*/

function extractDynamicDimension(
  normalizedQuestion,
  dataset,
  period,
  datasetKey,
  assetsOverride = null
) {
  if (!period) {
    return null
  }

  const assets = Array.isArray(assetsOverride)
    ? assetsOverride
    : getAssetsByReportingPeriod(
        period,
        dataset
      )

  const canonicalValues =
    Array.from(
      new Set(
        assets
          .map(
            (asset) =>
              asset?.[datasetKey]
          )
          .filter(Boolean)
      )
    )

  const matches =
    canonicalValues.filter(
      (value) => {
        const normalizedValue =
          normalizeQuestion(value)

        return (
          normalizedValue &&
          normalizedQuestion.includes(
            normalizedValue
          )
        )
      }
    )

  /*
    Chỉ nhận khi match duy nhất.

    Nếu không có hoặc có nhiều match
    thì Fast Planner không tự đoán.
  */

  if (matches.length !== 1) {
    return null
  }

  return matches[0]
}


function extractDynamicRisk(
  normalizedQuestion,
  dataset,
  period,
  assetsOverride = null
) {
  if (!period) {
    return null
  }

  const assets = Array.isArray(assetsOverride)
    ? assetsOverride
    : getAssetsByReportingPeriod(
        period,
        dataset
      )

  const canonicalValues =
    Array.from(
      new Set(
        assets
          .flatMap(
            (asset) =>
              Array.isArray(
                asset.risks
              )
                ? asset.risks
                    .map(
                      (risk) =>
                        risk.loaiRuiRo
                    )
                    .filter(Boolean)
                : []
          )
      )
    )

  const matches =
    canonicalValues.filter(
      (value) => {
        const normalizedValue =
          normalizeQuestion(value)

        return (
          normalizedValue &&
          normalizedQuestion.includes(
            normalizedValue
          )
        )
      }
    )

  if (matches.length !== 1) {
    return null
  }

  return matches[0]
}

/*
  ======================================================
  METRIC
  ======================================================
*/

function detectMetric(
  normalizedQuestion
) {
  /*
    DƯ NỢ
  */

  if (
    normalizedQuestion.includes(
      'du no tsbd'
    ) ||
    normalizedQuestion.includes(
      'tong du no'
    )
  ) {
    return 'TOTAL_DEBT'
  }


  /*
    GIÁ TRỊ ĐỊNH GIÁ
  */

  if (
    normalizedQuestion.includes(
      'gia tri dinh gia'
    ) ||
    normalizedQuestion.includes(
      'gt dinh gia'
    )
  ) {
    return 'TOTAL_VALUATION'
  }


  /*
    SỐ TSBĐ
  */

  if (
    normalizedQuestion.includes(
      'so tsbd'
    ) ||
    normalizedQuestion.includes(
      'bao nhieu tsbd'
    ) ||
    normalizedQuestion.includes('tai san bao dam') ||
    normalizedQuestion.includes('tai san dam bao') ||
    normalizedQuestion.includes('so tai san bao dam') ||
    normalizedQuestion.includes('bao nhieu tai san bao dam')
  ) {
    return 'TOTAL_COLLATERAL'
  }


  /*
    SỐ TÀI SẢN
  */

 if (
  normalizedQuestion.includes(
    'bao nhieu'
  ) ||
  normalizedQuestion.includes(
    'so tai san'
  ) ||
  normalizedQuestion.includes(
    'dem tai san'
  ) ||
  normalizedQuestion.includes(
    'nhieu tai san'
  )
) {
  return 'COUNT'
}
  return null
}


/*
  ======================================================
  TOP N
  ======================================================
*/

function extractTopN(
  normalizedQuestion
) {
  const match =
    normalizedQuestion.match(
      /\btop\s*(\d+)\b/
    )

  if (match) {
    const value =
      Number(match[1])

    if (
      Number.isInteger(value) &&
      value > 0
    ) {
      return value
    }
  }

  if (
    normalizedQuestion.includes(
      'cao nhat'
    ) ||
    normalizedQuestion.includes(
      'nhieu nhat'
    ) ||
    normalizedQuestion.includes(
      'lon nhat'
    )
  ) {
    return 1
  }

  return null
}


/*
  ======================================================
  QUERY PLAN BASE
  ======================================================
*/

function createBasePlan(
  period
) {
  return {
    version: '2.0',

    timeContext: {
      mode: 'SINGLE_PERIOD',
      period,
      fromPeriod: null,
      toPeriod: null,
    },

    steps: [],
  }
}


/*
  ======================================================
  FAST PLANNER
  ======================================================

  Chỉ xử lý những câu mà chúng ta hiểu chắc chắn.

  Nếu không chắc chắn:
  return null

  => hệ thống tự động gọi GreenNode Model.
*/

function tryCreateFastQueryPlan(
  question,
  dataset,
  planningContext = {}
) {
  const normalizedQuestion =
    normalizeQuestion(question)

  if (isAnalyticalQuestion(normalizedQuestion)) {
    return null
  }

  const period =
    extractPeriod(normalizedQuestion) ||
    planningContext?.defaultPeriod ||
    null

  if (!period) {
    return null
  }

  

/*
  ====================================================
  COMPARE GIỮA HAI KỲ
  ====================================================
*/

const asksCompare =
  normalizedQuestion.includes(
    'so sanh'
  )

if (asksCompare) {
  const comparePeriods =
    extractComparePeriods(
      normalizedQuestion
    )

  if (!comparePeriods) {
    return null
  }

  const valuationCodeMatch =
    normalizedQuestion.match(
      /\bdg\d+\b/i
    )

  if (!valuationCodeMatch) {
    return null
  }

  const valuationCode =
    valuationCodeMatch[0]
      .toUpperCase()

  return {
    version: '2.0',

    timeContext: {
      mode: 'RANGE',
      period: null,
      fromPeriod:
        comparePeriods.fromPeriod,
      toPeriod:
        comparePeriods.toPeriod,
    },

    steps: [
      {
        action: 'LOOKUP',
        field: 'maTsDg',
        value: valuationCode,
      },
      {
        action: 'COMPARE',
        field: 'gtDinhGia',
      },
    ],
  }
}

/*
  ====================================================
  RISK ASSET LIST
  ====================================================

  Ví dụ:
  - Hà Nội phát sinh case tài sản nào sai?
  - Có tài sản nào rủi ro tại Hà Nội?
  - Case rủi ro nào phát sinh tại Hồ Chí Minh?

  Ý nghĩa:
  trả danh sách tài sản có risk,
  không aggregate.
*/

const asksRiskAssetList =
  (
    normalizedQuestion.includes(
      'tai san nao'
    ) ||
    normalizedQuestion.includes(
      'case nao'
    )
  ) &&
  (
    normalizedQuestion.includes(
      'rui ro'
    ) ||
    normalizedQuestion.includes(
      'case tai san'
    ) ||
    normalizedQuestion.includes(
      'case sai'
    ) ||
    normalizedQuestion.includes(
      'tai san sai'
    )
  )

if (asksRiskAssetList) {
  const plan =
    createBasePlan(period)

  const province =
    extractProvince(normalizedQuestion) ||
    extractDynamicDimension(
      normalizedQuestion,
      dataset,
      period,
      'tinhTp',
      planningContext?.periodAssets
    )

  if (province) {
    plan.steps.push({
      action: 'FILTER',
      field: 'province',
      operator: 'EQ',
      value: province,
    })
  }

  plan.steps.push({
    action: 'FILTER',
    field: 'valuationRisk',
    operator: 'NOT_EMPTY',
  })

  return plan
}

  const metric =
    detectMetric(
      normalizedQuestion
    )

  /*
  ====================================================
  RISK DISTRIBUTION BY PROVINCE
  ====================================================

  Ví dụ:
  - Tài sản rủi ro tập trung ở đâu?
  - Tài sản định giá rủi ro tập trung ở tỉnh nào?
  - Các tài sản có rủi ro phân bố ở thành phố nào?

  Ý nghĩa:
  chỉ lấy tài sản có ít nhất một risk,
  sau đó đếm số tài sản theo tỉnh/thành phố.
*/

const asksRiskDistributionByProvince =
  (
    normalizedQuestion.includes(
      'rui ro'
    ) ||
    normalizedQuestion.includes(
      'case sai'
    ) ||
    normalizedQuestion.includes(
      'tai san sai'
    )
  ) &&
  (
    normalizedQuestion.includes(
      'tap trung'
    ) ||
    normalizedQuestion.includes(
      'phan bo'
    )
  ) &&
  (
    normalizedQuestion.includes(
      'o dau'
    ) ||
    normalizedQuestion.includes(
      'tinh'
    ) ||
    normalizedQuestion.includes(
      'thanh pho'
    ) ||
    normalizedQuestion.includes(
      'dia ban'
    )
  )

if (asksRiskDistributionByProvince) {
  const plan =
    createBasePlan(period)

  plan.steps.push(
    {
      action: 'FILTER',
      field: 'valuationRisk',
      operator: 'NOT_EMPTY',
    },
    {
      action: 'GROUP_BY',
      field: 'province',
    },
    {
      action: 'AGGREGATE',
      metric: 'COUNT',
    },
    {
      action: 'SORT',
      by: 'value',
      order: 'DESC',
    }
  )

  return plan
}

  
  if (!metric) {
    return null
  }

  const province =
    extractProvince(normalizedQuestion) ||
    extractDynamicDimension(
      normalizedQuestion,
      dataset,
      period,
      'tinhTp',
      planningContext?.periodAssets
    )

  const assetGroup =
    extractAssetGroup(
      normalizedQuestion
    )

  /*
    ====================================================
    VALUATION UNIT - DYNAMIC
    ====================================================

    Không hard-code:
    Nội bộ
    Công ty định giá A
    Công ty định giá B

    mà đọc trực tiếp từ dataset.
  */

  const valuationUnit =
    extractDynamicDimension(
      normalizedQuestion,
      dataset,
      period,
      'donViDinhGia',
      planningContext?.periodAssets
    )

  const valuationRisk =
    extractDynamicRisk(
      normalizedQuestion,
      dataset,
      period,
      planningContext?.periodAssets
    ) || planningContext?.defaultRiskType || null

  const hasNoValuationRisk =
  normalizedQuestion.includes(
    'khong phat hien'
  ) &&
  normalizedQuestion.includes(
    'rui ro'
  )

  const topN =
    extractTopN(
      normalizedQuestion
    )


  /*
    ====================================================
    TOP N THEO TỈNH
    ====================================================
  */

  const asksProvinceRanking =
    (
      normalizedQuestion.includes(
        'tinh'
      ) ||
      normalizedQuestion.includes(
        'thanh pho'
      )
    ) &&
    topN !== null

  if (asksProvinceRanking) {
    /*
      Nếu vừa ranking
      vừa chỉ đích danh tỉnh,
      Fast Planner không suy diễn.
    */

    if (province) {
      return null
    }

    const plan =
      createBasePlan(period)

    plan.steps.push(
      {
        action: 'GROUP_BY',
        field: 'province',
      },
      {
        action: 'AGGREGATE',
        metric,
      },
      {
        action: 'SORT',
        by: 'value',
        order: 'DESC',
      },
      {
        action: 'LIMIT',
        value: topN,
      }
    )

    return plan
  }


  /*
    ====================================================
    AGGREGATE ĐƠN
    ====================================================
  */

  const plan =
    createBasePlan(period)


  /*
    PROVINCE
  */

  if (province) {
    plan.steps.push({
      action: 'FILTER',
      field: 'province',
      operator: 'EQ',
      value: province,
    })
  }


  /*
    ASSET GROUP
  */

  if (assetGroup) {
    plan.steps.push({
      action: 'FILTER',
      field: 'assetGroup',
      operator: 'EQ',
      value: assetGroup,
    })
  }


  /*
    VALUATION UNIT
  */

  if (valuationUnit) {
    plan.steps.push({
      action: 'FILTER',
      field: 'valuationUnit',
      operator: 'EQ',
      value: valuationUnit,
    })
  }

 if (hasNoValuationRisk) {
  plan.steps.push({
    action: 'FILTER',
    field: 'valuationRisk',
    operator: 'EMPTY',
  })
} else if (valuationRisk) {
  plan.steps.push({
    action: 'FILTER',
    field: 'valuationRisk',
    operator: 'EQ',
    value: valuationRisk,
  })
}


  /*
    ====================================================
    COUNT
    ====================================================
  */

  if (metric === 'COUNT') {
    plan.steps.push({
      action: 'AGGREGATE',
      metric: 'COUNT',
    })

    return plan
  }


  /*
    ====================================================
    TOTAL COLLATERAL
    ====================================================
  */

  if (
    metric ===
    'TOTAL_COLLATERAL'
  ) {
    plan.steps.push({
      action: 'AGGREGATE',
      metric:
        'TOTAL_COLLATERAL',
    })

    return plan
  }


  /*
    ====================================================
    TOTAL DEBT
    ====================================================
  */

  if (
    metric === 'TOTAL_DEBT'
  ) {
    const clearAggregateIntent =
      normalizedQuestion.includes(
        'tong du no'
      ) ||
      normalizedQuestion.includes(
        'bao nhieu'
      ) ||
      normalizedQuestion.includes(
        'du no tsbd'
      )

    if (!clearAggregateIntent) {
      return null
    }

    plan.steps.push({
      action: 'AGGREGATE',
      metric: 'TOTAL_DEBT',
    })

    return plan
  }


  /*
    ====================================================
    TOTAL VALUATION
    ====================================================
  */

  if (
    metric ===
    'TOTAL_VALUATION'
  ) {
    const clearAggregateIntent =
      normalizedQuestion.includes(
        'tong gia tri dinh gia'
      ) ||
      normalizedQuestion.includes(
        'tong gt dinh gia'
      ) ||
      normalizedQuestion.includes(
        'bao nhieu'
      ) ||
      normalizedQuestion.includes(
        'gia tri dinh gia'
      ) ||
      normalizedQuestion.includes(
        'gt dinh gia'
      )

    if (!clearAggregateIntent) {
      return null
    }

    plan.steps.push({
      action: 'AGGREGATE',
      metric:
        'TOTAL_VALUATION',
    })

    return plan
  }


  /*
    Không chắc chắn.
  */

  return null
}


/*
  ======================================================
  GREENNODE FALLBACK
  ======================================================
*/

async function createQueryPlanFromModel(
  question
) {
  const response =
    await fetch(
      '/api/ai/query-plan',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          question,
        }),
      }
    )

  const data =
    await response.json()

  if (
    !response.ok ||
    !data.success
  ) {
    throw new Error(
      data.error ||
        'Không thể tạo Query Plan từ GreenNode.'
    )
  }

  if (!data.queryPlan) {
    throw new Error(
      'GreenNode không trả về Query Plan.'
    )
  }

  return data.queryPlan
}


/*
  ======================================================
  PUBLIC ADAPTER
  ======================================================
*/

export async function createQueryPlanFromGreenNode(
  question,
  dataset,
  planningContext = {}
) {
  const normalizedQuestion = normalizeQuestion(question)

  // V2.6.7 Final: persistent-risk questions must use exactly the same
  // deterministic source as the KPI. This prevents the UI from showing
  // e.g. KPI = 0 while natural-language search returns all current risks.
  // Persistent-risk intent is semantic rather than word-order dependent.
  // Examples that must all route here:
  // - "rủi ro 2 kỳ liên tiếp"
  // - "phát sinh 2 kỳ rủi ro liên tiếp"
  // - "rủi ro liên tục 2 tháng"
  // - "rủi ro kéo dài"
  const hasRiskTerm = /\brui ro\b/.test(normalizedQuestion)
  const hasPersistenceTerm =
    normalizedQuestion.includes('rui ro keo dai') ||
    /\b(?:lien tiep|lien tuc)\b/.test(normalizedQuestion) ||
    /\b(?:nhieu|qua nhieu)\s+ky\b/.test(normalizedQuestion)
  const hasPeriodTerm = /\b(?:ky|thang)\b/.test(normalizedQuestion)
  const asksPersistentRisk =
    hasRiskTerm &&
    (normalizedQuestion.includes('rui ro keo dai') || (hasPersistenceTerm && hasPeriodTerm))

  if (asksPersistentRisk) {
    const explicitPeriod = extractPeriod(normalizedQuestion)
    const periods = getReportingPeriods(dataset)
    const period = explicitPeriod || planningContext.defaultPeriod || periods.at(-1) || null
    const asksThreePeriods =
      /\b(?:3|ba)\s+(?:ky|thang)\b/.test(normalizedQuestion) ||
      /\b(?:ky|thang)\s+(?:3|ba)\b/.test(normalizedQuestion)
    const minConsecutive = asksThreePeriods ? 3 : 2
    const summary = getPersistentRiskSummary({
      period,
      dataset,
      minConsecutive,
      // Same deterministic scope as the KPI shown on screen.
      assetIds: Array.isArray(planningContext.persistentAssetIds)
        ? planningContext.persistentAssetIds
        : null,
      riskType: planningContext.persistentRiskType || null,
    })

    const ids = summary.items.map((item) => item.maTsDg)
    return {
      version: '2.0',
      timeContext: {
        mode: 'SINGLE_PERIOD',
        period,
        fromPeriod: null,
        toPeriod: null,
      },
      steps: [
        {
          action: 'FILTER',
          field: 'maTsDg',
          operator: 'IN',
          value: ids,
        },
      ],
      answerContext: {
        domain: 'PERSISTENT_RISK',
        intent: 'LIST',
        minConsecutive,
        persistentAssets: summary.persistentAssets,
        threePlusAssets: summary.threePlusAssets,
        available: summary.available,
      },
    }
  }
  const availablePeriods = getReportingPeriods(dataset)
  const planningPeriod =
    extractPeriod(normalizedQuestion) ||
    planningContext.defaultPeriod ||
    availablePeriods.at(-1) ||
    null
  const detectedProvince =
    extractProvince(normalizedQuestion) ||
    extractDynamicDimension(
      normalizedQuestion,
      dataset,
      planningPeriod,
      'tinhTp',
      planningContext?.periodAssets
    )
  const detectedRiskType = extractDynamicRisk(
    normalizedQuestion,
    dataset,
    planningPeriod,
    planningContext?.periodAssets
  )
  const enrichedPlanningContext = {
    ...planningContext,
    detectedProvince,
    detectedRiskType,
  }

  const riskPlan = createRiskIntentPlan(question, enrichedPlanningContext)

  if (riskPlan) {
    return riskPlan
  }

  const fastPlan =
  tryCreateFastQueryPlan(
    question,
    dataset,
    enrichedPlanningContext
  )

  
  /*
    FAST PATH
  */

  if (fastPlan) {
    //console.log(
     // 'GREENNODE PLANNER: FAST',
     // fastPlan
    //)

    return fastPlan
  }


  /*
    RISK CONTEXT PATH (V2.6.7)
  */

  if (isAnalyticalQuestion(normalizeQuestion(question))) {
    const riskContext =
      buildRiskContext(
        question,
        dataset,
        enrichedPlanningContext
      )

    if (riskContext) {
      return riskContext
    }
  }


  /*
    AI FALLBACK
  */

  //console.log(
    //'GREENNODE PLANNER: AI FALLBACK'
  //)

  return createQueryPlanFromModel(
    question
  )
}