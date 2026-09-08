import {
  getAssetsByReportingPeriod,
} from '../../services/assetService'

/*
  ======================================================
  QUERY VALUE RESOLVER
  ======================================================

  Mục tiêu:

  Query Plan có thể chứa giá trị do
  Fast Planner hoặc AI Model tạo ra.

  Ví dụ:
  "TP.HCM"
  "Hồ Chí Minh"
  "TP Hồ Chí Minh"

  Trong khi dataset canonical có thể lưu:

  "TP. Hồ Chí Minh"

  Resolver sẽ đối chiếu giá trị query
  với chính danh mục có trong dataset.

  Không sửa dữ liệu nguồn.
  Không tính kết quả nghiệp vụ.
*/


/*
  ======================================================
  NORMALIZE TEXT
  ======================================================
*/

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/g,
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
  TOKEN NORMALIZATION
  ======================================================

  Các từ mang tính cách viết/hình thức
  không nên làm hai địa danh trở thành
  hai giá trị khác nhau.

  Ví dụ:

  "TP. Hồ Chí Minh"
  → "ho chi minh"

  "Thành phố Hồ Chí Minh"
  → "ho chi minh"
*/

function normalizeDimensionText(
  value,
  field
) {
  let normalized =
    normalizeText(value)

  if (
    field === 'province'
  ) {
    normalized = normalized
      .replace(
        /\bthanh pho\b/g,
        ' '
      )
      .replace(
        /\btp\b/g,
        ' '
      )
      .replace(
        /\btinh\b/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim()
  }

  return normalized
}


/*
  ======================================================
  FIELD CONFIG
  ======================================================

  Query Plan dùng tên logic.

  Dataset có thể dùng tên canonical
  khác bên dưới.
*/

const FIELD_CONFIG = {
  province: {
    datasetKeys: [
      'province',
      'tinhTp',
      'tinhTP',
      'tinhThanh',
    ],
  },

  assetGroup: {
  datasetKeys: [
    'assetGroup',
    'nhomTsCap1',
  ],

  aliases: {
    'bat dong san': 'BĐS',
    'bds': 'BĐS',

    'dong san': 'ĐS',
    'ds': 'ĐS',
  },
},

  valuationUnit: {
    datasetKeys: [
      'valuationUnit',
      'donViDinhGia',
    ],
  },

  valuationRisk: {
    datasetKeys: [
      'valuationRisk',
      'ruiRoDinhGia',
    ],
  },
}


/*
  ======================================================
  COLLECT CANONICAL VALUES
  ======================================================

  Đi qua dataset và lấy các giá trị
  thực sự đang tồn tại.

  Cách này giúp Resolver dùng được
  cho cả:

  MOCK
  EXCEL
  Datamart sau này
*/

function collectCanonicalValues(
  dataset,
  field,
  period
) {
  const config =
    FIELD_CONFIG[field]

  if (!config) {
    return []
  }

  /*
    Resolver phải sử dụng cùng
    tập record mà Executor sử dụng.

    Không quét raw dataset trực tiếp.
  */

  if (!period) {
    return []
  }

  const periodAssets =
    getAssetsByReportingPeriod(
      period,
      dataset
    )

  

  const values =
    new Set()

  const visited =
    new WeakSet()

  function walk(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return
    }

    if (
      typeof value !== 'object'
    ) {
      return
    }

    if (
      visited.has(value)
    ) {
      return
    }

    visited.add(value)

    if (
      Array.isArray(value)
    ) {
      value.forEach(walk)
      return
    }

    for (
      const [key, childValue]
      of Object.entries(value)
    ) {
      if (
        config.datasetKeys.includes(
          key
        ) &&
        (
          typeof childValue ===
            'string' ||
          typeof childValue ===
            'number'
        )
      ) {
        const textValue =
          String(childValue).trim()

        if (textValue) {
          values.add(textValue)
        }
      }

      if (
        childValue &&
        typeof childValue ===
          'object'
      ) {
        walk(childValue)
      }
    }
  }

  /*
    Chỉ quét record đã được
    assetService dựng cho đúng kỳ.
  */

  walk(periodAssets)

  return Array.from(values)
}


/*
  ======================================================
  ABBREVIATION MATCH
  ======================================================

  Ví dụ:

  "HCM"
  có thể match:
  "Hồ Chí Minh"

  bằng chữ cái đầu:

  Ho Chi Minh
  → H C M
  → hcm

  Ta chỉ chấp nhận nếu match duy nhất.
*/

function createInitials(
  value,
  field
) {
  return normalizeDimensionText(
    value,
    field
  )
    .split(' ')
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0)
    )
    .join('')
}


/*
  ======================================================
  RESOLVE SINGLE VALUE
  ======================================================
*/

export function resolveCanonicalValue(
  field,
  inputValue,
  dataset,
  period
) {
  if (
    inputValue === null ||
    inputValue === undefined
  ) {
    return {
      resolved: true,
      value: inputValue,
      method: 'EMPTY',
    }
  }

    const config =
    FIELD_CONFIG[field]

  const canonicalValues =
  collectCanonicalValues(
    dataset,
    field,
    period
  )

  /*
0. ALIAS MATCH

    Ví dụ:
    "Bất động sản"
    → "BĐS"

    "Động sản"
    → "ĐS"
    */

  const normalizedAliasInput =
    normalizeText(inputValue)

  const aliasValue =
    config?.aliases?.[
      normalizedAliasInput
    ]

  if (aliasValue) {
    const canonicalAliasMatch =
      canonicalValues.find(
        (value) =>
          normalizeText(value) ===
          normalizeText(aliasValue)
      )

    if (canonicalAliasMatch) {
      return {
        resolved: true,
        value:
          canonicalAliasMatch,
        method: 'ALIAS',
      }
    }
  }

  /*


    Field chưa được quản lý
    hoặc dataset không có danh mục.

    Không tự ý thay giá trị.
  */

  if (
    canonicalValues.length === 0
  ) {
    return {
      resolved: true,
      value: inputValue,
      method:
        'NO_CANONICAL_DICTIONARY',
    }
  }


  /*
    1. EXACT MATCH
  */

  const exactMatch =
    canonicalValues.find(
      (value) =>
        String(value) ===
        String(inputValue)
    )

  if (exactMatch) {
    return {
      resolved: true,
      value: exactMatch,
      method: 'EXACT',
    }
  }


  /*
    2. NORMALIZED MATCH
  */

  const normalizedInput =
    normalizeDimensionText(
      inputValue,
      field
    )

  const normalizedMatches =
    canonicalValues.filter(
      (value) =>
        normalizeDimensionText(
          value,
          field
        ) === normalizedInput
    )

  if (
    normalizedMatches.length === 1
  ) {
    return {
      resolved: true,
      value:
        normalizedMatches[0],
      method: 'NORMALIZED',
    }
  }


  /*
    3. ABBREVIATION MATCH

    Chỉ áp dụng cho province.
  */

  if (
    field === 'province'
  ) {
    const compactInput =
  normalizeDimensionText(
    inputValue,
    field
  )
    .replace(/\s+/g, '')

const abbreviationMatches =
  canonicalValues.filter(
    (value) =>
      createInitials(
        value,
        field
      ) === compactInput
  )
    if (
      abbreviationMatches.length ===
      1
    ) {
      return {
        resolved: true,
        value:
          abbreviationMatches[0],
        method:
          'ABBREVIATION',
      }
    }
  }


  /*
    Không được tự đoán khi không chắc.

    Đây là điểm quan trọng:
    không resolve được ≠ kết quả bằng 0.
  */

  return {
    resolved: false,
    value: inputValue,
    method: 'UNRESOLVED',

    error:
      `Không xác định được giá trị "${inputValue}" cho trường "${field}" trong bộ dữ liệu hiện tại.`,
  }
}


/*
  ======================================================
  RESOLVE QUERY PLAN
  ======================================================
*/

export function resolveQueryPlanValues(
  queryPlan,
  dataset
) {
  if (
    !queryPlan ||
    typeof queryPlan !== 'object'
  ) {
    return {
      success: false,
      queryPlan,
      errors: [
        'Query Plan không hợp lệ.',
      ],
    }
  }

  const resolvedPlan =
    structuredClone(queryPlan)

  const errors = []

  const period =
  resolvedPlan
    .timeContext
    ?.period ?? null

  if (
    !Array.isArray(
      resolvedPlan.steps
    )
  ) {
    return {
      success: true,
      queryPlan:
        resolvedPlan,
      errors: [],
    }
  }

  resolvedPlan.steps =
    resolvedPlan.steps.map(
      (step) => {
        /*
          Hiện tại chỉ resolve
          những action có value
          thuộc dimension.

          FILTER là ưu tiên đầu tiên.
        */

        if (
          step.action !== 'FILTER'
        ) {
          return step
        }

        if (
          !FIELD_CONFIG[
            step.field
          ]
        ) {
          return step
        }

        const resolution =
  resolveCanonicalValue(
    step.field,
    step.value,
    dataset,
    period
  )
         

        if (
          !resolution.resolved
        ) {
          errors.push(
            resolution.error
          )

          return step
        }

        return {
          ...step,

          value:
            resolution.value,
        }
      }
    )

  return {
    success:
      errors.length === 0,

    queryPlan:
      resolvedPlan,

    errors,
  }
}