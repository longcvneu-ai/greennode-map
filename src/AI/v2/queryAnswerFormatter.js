// src/AI/v2/queryAnswerFormatter.js

function formatBillion(value) {
  const number = Number(value) || 0

  return `${(
    number / 1_000_000_000
  ).toFixed(2)} tỷ`
}

function formatPeriod(period) {
  if (!period) {
    return ''
  }

  const [year, month] =
    period.split('-')

  return `tháng ${Number(month)}/${year}`
}

export function formatQueryAnswer(
  queryPlan,
  executionResult
) {
  if (
    !executionResult ||
    executionResult.success !== true
  ) {
    return 'Không có kết quả hợp lệ để hiển thị.'
  }

  const data =
    executionResult.data

  if (
    Array.isArray(data) &&
    data.length === 0
  ) {
    return 'Không tìm thấy dữ liệu phù hợp với yêu cầu.'
  }

  const timeContext =
    executionResult.timeContext ||
    queryPlan?.timeContext ||
    {}

  const period =
    timeContext.period

  const steps =
    queryPlan?.steps || []

  const aggregateStep =
    steps.find(
      (step) =>
        step.action === 'AGGREGATE'
    )

  const groupByStep =
    steps.find(
      (step) =>
        step.action === 'GROUP_BY'
    )

  const limitStep =
    steps.find(
      (step) =>
        step.action === 'LIMIT'
    )

  const compareStep =
    steps.find(
      (step) =>
        step.action === 'COMPARE'
    )

  const filterSteps =
    steps.filter(
      (step) =>
        step.action === 'FILTER'
    )

  const provinceFilter =
    filterSteps.find(
      (step) =>
        step.field === 'province' &&
        step.operator === 'EQ'
    )

  const provinceText =
    provinceFilter
      ? ` tại ${provinceFilter.value}`
      : ''

  /*
    ===== COMPARE =====
  */

  if (
    compareStep &&
    data &&
    !Array.isArray(data)
  ) {
    if (
      data.comparisonStatus !==
      'COMPARABLE'
    ) {
      return (
        'Chưa đủ dữ liệu ở cả hai kỳ để thực hiện so sánh.'
      )
    }

    const fromPeriod =
      timeContext.fromPeriod

    const toPeriod =
      timeContext.toPeriod

    const fromValue =
      formatBillion(
        data.fromValue
      )

    const toValue =
      formatBillion(
        data.toValue
      )

    const difference =
      formatBillion(
        Math.abs(
          data.difference
        )
      )

    if (
      data.direction ===
      'INCREASE'
    ) {
      return (
        `Giá trị tăng từ ${fromValue} tại ${formatPeriod(
          fromPeriod
        )} lên ${toValue} tại ${formatPeriod(
          toPeriod
        )}, tăng ${difference}.`
      )
    }

    if (
      data.direction ===
      'DECREASE'
    ) {
      return (
        `Giá trị giảm từ ${fromValue} tại ${formatPeriod(
          fromPeriod
        )} xuống ${toValue} tại ${formatPeriod(
          toPeriod
        )}, giảm ${difference}.`
      )
    }

    return (
      `Giá trị không thay đổi giữa ${formatPeriod(
        fromPeriod
      )} và ${formatPeriod(
        toPeriod
      )}.`
    )
  }

  /*
    ===== GROUP + AGGREGATE =====
  */

  if (
    Array.isArray(data) &&
    data.length > 0 &&
    groupByStep &&
    aggregateStep
  ) {
    const first =
      data[0]

    if (
      aggregateStep.metric ===
      'TOTAL_DEBT'
    ) {
      if (
        limitStep?.value === 1
      ) {
        return (
          `${first.key} có dư nợ TSBĐ cao nhất trong ${formatPeriod(
            period
          )}, đạt ${formatBillion(
            first.value
          )}, từ ${first.recordCount} TSBĐ đang bảo đảm.`
        )
      }

      return (
        `Kết quả tổng hợp dư nợ TSBĐ theo ${groupByStep.field} trong ${formatPeriod(
          period
        )} gồm ${data.length} nhóm.`
      )
    }

    if (
      aggregateStep.metric ===
      'TOTAL_VALUATION'
    ) {
      if (
        limitStep?.value === 1
      ) {
        return (
          `${first.key} có tổng giá trị định giá cao nhất trong ${formatPeriod(
            period
          )}, đạt ${formatBillion(
            first.value
          )}.`
        )
      }

      return (
        `Kết quả tổng hợp giá trị định giá theo ${groupByStep.field} trong ${formatPeriod(
          period
        )} gồm ${data.length} nhóm.`
      )
    }

    if (
      aggregateStep.metric ===
      'COUNT'
    ) {
      if (
        limitStep?.value === 1
      ) {
        return (
          `${first.key} có số lượng tài sản cao nhất trong ${formatPeriod(
            period
          )}, với ${first.value} tài sản.`
        )
      }

      return (
        `Kết quả đếm tài sản theo ${groupByStep.field} trong ${formatPeriod(
          period
        )} gồm ${data.length} nhóm.`
      )
    }
  }

  /*
    ===== AGGREGATE KHÔNG GROUP =====
  */

  if (
    aggregateStep &&
    data &&
    !Array.isArray(data)
  ) {
    if (
      aggregateStep.metric ===
      'TOTAL_DEBT'
    ) {
      return (
        `Tổng dư nợ TSBĐ${provinceText} trong ${formatPeriod(
          period
        )} là ${formatBillion(
          data.value
        )}, từ ${data.recordCount} TSBĐ đang bảo đảm.`
      )
    }

    if (
      aggregateStep.metric ===
      'TOTAL_VALUATION'
    ) {
      return (
        `Tổng giá trị định giá${provinceText} trong ${formatPeriod(
          period
        )} là ${formatBillion(
          data.value
        )}.`
      )
    }

    if (
      aggregateStep.metric ===
      'COUNT'
    ) {
      return (
        `Có ${data.value} tài sản${provinceText} trong ${formatPeriod(
          period
        )}.`
      )
    }
  }

  /*
    ===== LOOKUP =====
  */

  const lookupStep =
    steps.find(
      (step) =>
        step.action === 'LOOKUP'
    )

  if (
    lookupStep &&
    Array.isArray(data)
  ) {
    return (
      `Tìm thấy ${data.length} bản ghi phù hợp với ${lookupStep.field} = ${lookupStep.value}.`
    )
  }

  return 'Đã xử lý yêu cầu và nhận được kết quả.'
}