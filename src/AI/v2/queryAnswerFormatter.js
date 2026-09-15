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

function formatMoney(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'không có dữ liệu'
  return `${(number / 1_000_000_000).toFixed(2)} tỷ đồng`
}

function formatMetricValue(field, value) {
  if (field === 'gtDinhGia' || field === 'duNoTsbd' || field === 'gtBaoDam') {
    return formatMoney(value)
  }
  if (field === 'ltv') {
    const number = Number(value)
    return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : 'không có dữ liệu'
  }
  return String(value ?? 'không có dữ liệu')
}

function metricLabel(field) {
  const labels = {
    gtDinhGia: 'Giá trị định giá',
    duNoTsbd: 'Dư nợ',
    gtBaoDam: 'Giá trị bảo đảm',
    ltv: 'LTV',
  }
  return labels[field] || field
}

function aggregationLabel(value) {
  const labels = { AVG: 'bình quân', SUM: 'tổng', MAX: 'cao nhất', MIN: 'thấp nhất' }
  return labels[value] || value
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

  const persistentAnswerContext = queryPlan?.answerContext
  if (persistentAnswerContext?.domain === 'PERSISTENT_RISK') {
    const minConsecutive = persistentAnswerContext.minConsecutive || 2
    const count = Array.isArray(data) ? data.length : 0
    const period = executionResult.timeContext?.period || queryPlan?.timeContext?.period
    const periodText = period ? ` tính đến ${formatPeriod(period)}` : ''

    if (!persistentAnswerContext.available) {
      return `Chưa đủ dữ liệu để xác định tài sản rủi ro ${minConsecutive} kỳ liên tiếp. Cần tối thiểu ${minConsecutive} kỳ báo cáo.`
    }

    if (count === 0) {
      return `Không có tài sản nào phát sinh rủi ro từ ${minConsecutive} kỳ liên tiếp${periodText}.`
    }

    const sample = data.slice(0, 8).map((item) => item.maTsDg || item.tenTaiSan).filter(Boolean)
    return `Có ${count} tài sản phát sinh rủi ro từ ${minConsecutive} kỳ liên tiếp${periodText}.${sample.length ? ` Ví dụ: ${sample.join(', ')}${count > sample.length ? ', …' : ''}.` : ''}`
  }

  if (
    Array.isArray(data) &&
    data.length === 0
  ) {
    if (queryPlan?.answerContext?.domain === 'RISK') {
      if (queryPlan.answerContext.intent === 'EXISTS') {
        return 'Không. Không phát hiện case tài sản phù hợp với điều kiện rủi ro trong dữ liệu hiện có.'
      }
      return 'Không tìm thấy dữ liệu phù hợp với điều kiện rủi ro.'
    }
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


     const valuationUnitFilter =
  queryPlan.steps.find(
    (step) =>
      step.action === 'FILTER' &&
      step.field === 'valuationUnit'
  )
  const valuationUnitText =
  valuationUnitFilter
    ? ` của ${valuationUnitFilter.value}`
    : ''

    const assetGroupFilter =
  queryPlan.steps.find(
    (step) =>
      step.action === 'FILTER' &&
      step.field === 'assetGroup'
  )

const assetGroupText =
  assetGroupFilter
    ? ` ${assetGroupFilter.value}`
    : ''

  /*
    ===== RISK INTENT ANSWERS =====
  */

  const answerContext =
    queryPlan?.answerContext

  if (
    answerContext?.domain === 'RISK'
  ) {
    const requestedFields =
      answerContext.requestedFields || []

    if (
      answerContext.clarificationRequired
    ) {
      return 'Câu hỏi chưa đủ thông tin để xác định phép xử lý. Vui lòng nêu rõ bạn muốn liệt kê, đếm, so sánh hay xếp hạng.'
    }

    if (
      answerContext.intent === 'EXISTS' &&
      Array.isArray(data)
    ) {
      if (data.length === 0) {
        return 'Không phát hiện case tài sản phù hợp với điều kiện rủi ro trong dữ liệu hiện có.'
      }

      const items = data
        .slice(0, 5)
        .map((item) => {
          const periodText = item.queryPeriod
            ? ` (${formatPeriod(item.queryPeriod)})`
            : ''
          return `${item.maTsDg || item.tenTaiSan || 'Tài sản'}${periodText}`
        })

      return `Có. Tìm thấy ${data.length} case phù hợp: ${items.join(', ')}.`
    }

    if (answerContext.intent === 'COUNT' && data && !Array.isArray(data)) {
      const label = answerContext.countEntity === 'riskCase' ? 'case rủi ro' : 'tài sản'
      return `${data.value ?? 0} ${label}.`
    }

    if (answerContext.intent === 'PERIOD_DISTRIBUTION' && Array.isArray(data)) {
      const label = answerContext.countEntity === 'riskCase' ? 'case rủi ro' : 'tài sản rủi ro'
      return data.map((row) => `${formatPeriod(row.key)}: ${row.value} ${label}`).join('; ') + '.'
    }

    if (
      answerContext.intent === 'METRIC_AGGREGATE'
    ) {
      const metric = answerContext.primaryMetric
      const aggregation = answerContext.aggregation
      const requestedPeriods = answerContext.requestedPeriods || []

      if (Array.isArray(data)) {
        const rowsByPeriod = new Map(data.map((row) => [row.key, row]))
        const periods = requestedPeriods.length > 0
          ? requestedPeriods
          : data.map((row) => row.key)

        const parts = periods.map((requestedPeriod) => {
          const row = rowsByPeriod.get(requestedPeriod)
          if (!row || row.value === null || row.recordCount === 0) {
            return `${formatPeriod(requestedPeriod)}: không có dữ liệu tài sản rủi ro phù hợp`
          }
          return `${formatPeriod(requestedPeriod)}: ${metricLabel(metric)} ${aggregationLabel(aggregation)} ${formatMetricValue(metric, row.value)} (${row.recordCount} tài sản)`
        })

        return parts.join('; ') + '.'
      }

      if (data && !Array.isArray(data)) {
        if (data.value === null || data.recordCount === 0) {
          return 'Không tìm thấy dữ liệu phù hợp với điều kiện rủi ro.'
        }
        const periodText = period ? ` trong ${formatPeriod(period)}` : ''
        return `${metricLabel(metric)} ${aggregationLabel(aggregation)} của tài sản rủi ro${periodText} là ${formatMetricValue(metric, data.value)} (${data.recordCount} tài sản).`
      }
    }

    if (
      (answerContext.intent === 'DISTRIBUTION' ||
        answerContext.intent === 'DIMENSION_DISTRIBUTION' ||
        answerContext.intent === 'RANK_DIMENSION' ||
        answerContext.intent === 'RANK') &&
      Array.isArray(data) &&
      data.length > 0
    ) {
      const countLabel =
        answerContext.countEntity === 'asset'
          ? 'tài sản'
          : 'case'

      const rows = data
        .map((item) => `${item.key}: ${item.value} ${countLabel}`)
        .join('; ')

      if (answerContext.intent === 'RANK') {
        const topValue = Number(data[0].value)
        const leaders = data.filter((row) => Number(row.value) === topValue)
        if (leaders.length > 1) {
          return `${leaders.map((row) => row.key).join(', ')} đồng hạng nhiều case rủi ro nhất với ${topValue} case.`
        }
        return `${leaders[0].key} có nhiều case rủi ro nhất với ${topValue} case.`
      }

      if (answerContext.intent === 'RANK_DIMENSION') {
        const dimensionLabels = { assetGroup: 'Nhóm tài sản', assetType: 'Loại tài sản', province: 'Tỉnh/thành phố', valuationUnit: 'Đơn vị định giá', valuationRisk: 'Loại rủi ro', queryPeriod: 'Kỳ báo cáo' }
        const label = dimensionLabels[answerContext.groupDimension] || 'Nhóm'
        const topValue = data[0].value
        const leaders = data.filter((row) => Number(row.value) === Number(topValue))
        const formatKey = (key) => answerContext.groupDimension === 'queryPeriod' ? formatPeriod(key) : key

        if (leaders.length > 1) {
          const names = leaders.map((row) => formatKey(row.key)).join(', ')
          return `${names} đồng hạng cao nhất: ${topValue} ${countLabel}/${label.toLowerCase()}.`
        }

        return `${formatKey(leaders[0].key)} cao nhất: ${topValue} ${countLabel}.`
      }

      if (answerContext.intent === 'DIMENSION_DISTRIBUTION') {
        const labelMap = { assetGroup: 'nhóm tài sản', assetType: 'loại tài sản', province: 'tỉnh/thành phố', valuationUnit: 'đơn vị định giá', valuationRisk: 'loại rủi ro', queryPeriod: 'kỳ báo cáo' }
        const dimensionLabel = labelMap[answerContext.groupDimension] || 'nhóm'
        if (answerContext.countEntity === 'riskCase') {
          return `${rows}.`
        }
        return `${dimensionLabel.charAt(0).toUpperCase() + dimensionLabel.slice(1)} có tài sản rủi ro: ${rows}.`
      }

      return `Phân bố ${countLabel} theo tỉnh/thành phố: ${rows}.`
    }

    if (
      answerContext.intent === 'LIST' &&
      Array.isArray(data)
    ) {
      if (data.length === 0) {
        return 'Không tìm thấy dữ liệu phù hợp với điều kiện rủi ro.'
      }

      const TEXT_LIST_LIMIT = 20
      const lines = data.slice(0, TEXT_LIST_LIMIT).map((item) => {
        const parts = []

        if (requestedFields.includes('assetName')) {
          parts.push(`Tên tài sản: ${item.tenTaiSan || 'không rõ tên'}`)
        }

        if (requestedFields.includes('assetCode')) {
          parts.push(`Mã tài sản: ${item.maTsDg || 'không rõ mã'}`)
        }

        if (requestedFields.includes('collateralCode')) {
          parts.push(`Mã TSBĐ: ${item.maTsbd || 'không có'}`)
        }

        if (requestedFields.includes('assetType')) {
          parts.push(`Loại tài sản: ${item.loaiTsCap2 || item.nhomTsCap1 || 'không rõ loại'}`)
        }

        if (requestedFields.includes('assetGroup')) {
          parts.push(`Nhóm tài sản: ${item.nhomTsCap1 || 'không rõ nhóm'}`)
        }

        if (parts.length === 0) {
          parts.push(item.maTsDg || item.tenTaiSan || 'Tài sản')
        }

        if (requestedFields.includes('province')) {
          parts.push(item.tinhTp || 'không rõ địa bàn')
        }

        if (requestedFields.includes('time')) {
          parts.push(formatPeriod(item.queryPeriod || period))
        }

        if (requestedFields.includes('riskType')) {
          const riskTypes = answerContext.riskType
            ? [answerContext.riskType]
            : (Array.isArray(item.risks)
                ? item.risks.map((risk) => risk.loaiRuiRo).filter(Boolean)
                : [])
          if (riskTypes.length > 0) {
            parts.push(riskTypes.join(', '))
          }
        }

        for (const metric of answerContext.requestedMetrics || []) {
          if (requestedFields.includes(metric)) {
            parts.push(`${metricLabel(metric)}: ${formatMetricValue(metric, item[metric])}`)
          }
        }

        return parts.join(' - ')
      })

      const remaining = Math.max(0, data.length - TEXT_LIST_LIMIT)
      const moreText = remaining > 0
        ? `; và ${remaining} tài sản/case khác. Xem bảng kết quả bên dưới.`
        : '.'

      return `Tìm thấy ${data.length} tài sản/case: ${lines.join('; ')}${moreText}`
    }
  }



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
    const first = data[0]
    const leaders = limitStep?.value === 1 && Array.isArray(data)
      ? data.filter((row) => Number(row.value) === Number(first?.value))
      : [first]
    const leaderNames = leaders.map((row) => row.key).join(', ')

    if (
      aggregateStep.metric ===
      'TOTAL_DEBT'
    ) {
      if (
        limitStep?.value === 1
      ) {
        return (
          leaders.length > 1
            ? `${leaderNames} đồng hạng dư nợ TSBĐ cao nhất trong ${formatPeriod(period)}, cùng đạt ${formatBillion(first.value)}.`
            : `${first.key} có dư nợ TSBĐ cao nhất trong ${formatPeriod(period)}, đạt ${formatBillion(first.value)}, từ ${first.recordCount} TSBĐ đang bảo đảm.`
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
          leaders.length > 1
            ? `${leaderNames} đồng hạng tổng giá trị định giá cao nhất trong ${formatPeriod(period)}, cùng đạt ${formatBillion(first.value)}.`
            : `${first.key} có tổng giá trị định giá cao nhất trong ${formatPeriod(period)}, đạt ${formatBillion(first.value)}.`
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
          leaders.length > 1
            ? `${leaderNames} đồng hạng số lượng tài sản cao nhất trong ${formatPeriod(period)}, cùng có ${first.value} tài sản.`
            : `${first.key} có số lượng tài sản cao nhất trong ${formatPeriod(period)}, với ${first.value} tài sản.`
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
       `Tổng giá trị định giá${assetGroupText}${valuationUnitText}${provinceText} trong ${formatPeriod(
          period
        )} là ${formatBillion(
          data.value
        )}.`
      )
    }


    if (
  aggregateStep.metric ===
  'TOTAL_COLLATERAL'
) {
  return (
    `Có ${data.value} TSBĐ đang bảo đảm${provinceText} trong ${formatPeriod(
      period
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
/*
  ===== FILTERED ASSET LIST =====
*/

if (
  Array.isArray(data) &&
  data.length > 0
) {
  const assetCodes =
    data
      .map((item) => item.maTsDg)
      .filter(Boolean)

  if (assetCodes.length > 0) {
    return (
      `Tìm thấy ${data.length} tài sản${provinceText} trong ${formatPeriod(
        period
      )}: ${assetCodes.join(', ')}.`
    )
  }
}
  return 'Đã xử lý yêu cầu và nhận được kết quả.'
}