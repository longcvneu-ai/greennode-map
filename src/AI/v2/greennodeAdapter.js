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
    )
  ) {
    return 'TOTAL_COLLATERAL'
  }


  /*
    SỐ TÀI SẢN
  */

  if (
    normalizedQuestion.includes(
      'tai san'
    ) &&
    (
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
  question
) {
  const normalizedQuestion =
    normalizeQuestion(question)

  const period =
    extractPeriod(
      normalizedQuestion
    )

  /*
    Fast Planner hiện chỉ xử lý
    SINGLE_PERIOD.

    Không có period rõ ràng:
    trả về null để AI xử lý.
  */

  if (!period) {
    return null
  }

  const metric =
    detectMetric(
      normalizedQuestion
    )

  if (!metric) {
    return null
  }

  const province =
    extractProvince(
      normalizedQuestion
    )

  const topN =
    extractTopN(
      normalizedQuestion
    )


  /*
    ====================================================
    TOP N THEO TỈNH
    ====================================================

    Ví dụ:

    Top 1 tỉnh có dư nợ TSBĐ cao nhất
    tháng 8/2026
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

  if (
    asksProvinceRanking
  ) {
    /*
      Nếu câu vừa yêu cầu ranking
      vừa chỉ đích danh một tỉnh,
      Fast Planner không tự suy diễn.

      Để GreenNode xử lý.
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
    Nếu người dùng chỉ rõ tỉnh:
    thêm FILTER trước AGGREGATE.
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
    COUNT tài sản
  */

  if (
    metric === 'COUNT'
  ) {
    plan.steps.push({
      action: 'AGGREGATE',
      metric: 'COUNT',
    })

    return plan
  }


  /*
    TOTAL_COLLATERAL
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
    TOTAL_DEBT

    Chỉ fast-path khi câu có
    ý tổng hợp rõ ràng.
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

    if (
      !clearAggregateIntent
    ) {
      return null
    }

    plan.steps.push({
      action: 'AGGREGATE',
      metric: 'TOTAL_DEBT',
    })

    return plan
  }


  /*
    TOTAL_VALUATION
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
        'bao nhieu'
      ) ||
      normalizedQuestion.includes(
        'gia tri dinh gia'
      )

    if (
      !clearAggregateIntent
    ) {
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
      'http://localhost:3001/api/ai/query-plan',
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
  question
) {
  const fastPlan =
    tryCreateFastQueryPlan(
      question
    )

  /*
    FAST PATH
  */

  if (fastPlan) {
    console.log(
      'GREENNODE PLANNER: FAST',
      fastPlan
    )

    return fastPlan
  }


  /*
    AI FALLBACK
  */

  console.log(
    'GREENNODE PLANNER: AI FALLBACK'
  )

  return createQueryPlanFromModel(
    question
  )
}