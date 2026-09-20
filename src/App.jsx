import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import './App.css'
import {
  getAssetsByReportingPeriod,
  getReportingPeriods,
  MOCK_DATASET,
} from './services/assetService'
import {
  readExcelWorkbook,
  validateWorkbookStructure,
  validateWorkbookColumns,
  validateValuationSnapshotRows,
  extractExcelData,
  buildCanonicalExcelData,
} from './services/excelImportService'
import AssetMap from './components/AssetMap'
import { getPersistentRiskSummary } from './services/persistentRiskService'
import { mark, perfEnabled } from './services/mapPerfMarks'

import {
  buildComparisonAssets,
  filterComparisonAssets,
  sliceForTable,
  TABLE_RENDER_LIMIT,
} from './services/rangeComparisonService'

import {
  createQueryPlanFromGreenNode,
} from './AI/v2/greennodeAdapter'

import {
  validateQueryPlan,
} from './AI/v2/queryPlanValidator'

import {
  executeQueryPlan,
} from './AI/v2/queryPlanExecutor'

import {
  formatQueryAnswer,
} from './AI/v2/queryAnswerFormatter'

import {
  resolveQueryPlanValues,
} from './AI/v2/queryValueResolver'

import {
  formatRiskAnalysis,
  fetchRiskEnrichment,
  composeRiskAnswer,
} from './AI/v2/riskAnalysisFormatter'

import tsbdLogo from './assets/tsbd-logo.png'

import headerMottoBg from './assets/header-motto-bg.png'

/* ===== TEMP PROFILE (10K general-filter perf UAT) — REMOVE BEFORE SHIP ===== */
const gnT = {
  on() {
    try {
      return !!(typeof window !== 'undefined' && window.__GN_PROFILE__ && window.__GN_PROFILE__.enabled)
    } catch { return false }
  },
  begin(ev) { if (!this.on()) return; const s = window.__GN_PROFILE__; (s._t = s._t || {})[ev] = performance.now() },
  end(ev) { if (!this.on()) return; const s = window.__GN_PROFILE__; const t = (s._t || {})[ev]; if (typeof t !== 'number') return; if (s._t) delete s._t[ev]; s.events.push({ ev, delta: performance.now() - t }) },
  event(ev) { if (!this.on()) return; window.__GN_PROFILE__.events.push({ ev, at: performance.now() }) },
  time(ev, fn) { if (!this.on()) return fn(); const s = window.__GN_PROFILE__; const t0 = performance.now(); const r = fn(); s.events.push({ ev, delta: performance.now() - t0 }); return r },
  count(ev) { if (!this.on()) return; const s = window.__GN_PROFILE__; s.counts[ev] = (s.counts[ev] || 0) + 1 },
}
/* ===== END TEMP PROFILE ===== */

function renderAiAnswer(answer) {
  const text = String(answer || '')
  const lines = text.split('\n')
  const headings = new Set(['KẾT LUẬN', 'CĂN CỨ CHÍNH', 'XU HƯỚNG', 'ƯU TIÊN KIỂM TRA', 'AI BỔ SUNG'])
  return (
    <div className="ai-structured-answer">
      {lines.map((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={index} className="ai-answer-gap" />
        if (headings.has(trimmed)) return <div key={index} className="ai-answer-heading">{trimmed}</div>
        if (/^P\d+:/.test(trimmed)) return <div key={index} className="ai-priority-line"><strong>{trimmed.match(/^P\d+:/)[0]}</strong>{trimmed.replace(/^P\d+:/, '')}</div>
        if (trimmed.startsWith('•')) return <div key={index} className="ai-evidence-line">{trimmed}</div>
        return <div key={index} className="ai-answer-line">{trimmed}</div>
      })}
    </div>
  )
}

function App() {
  gnT.count('renderApp')
  const [objectType, setObjectType] = useState('Tất cả')
  const [assetGroup, setAssetGroup] = useState('Tất cả')
const [province, setProvince] = useState('Tất cả')
const [valuationUnit, setValuationUnit] = useState('Tất cả')
const [valuationRisk, setValuationRisk] = useState('Tất cả')
const [reportingPeriod, setReportingPeriod] = useState('2026-08-31')
const [timeMode, setTimeMode] = useState('Một kỳ')
const [fromPeriod, setFromPeriod] = useState('2026-06-30')
const [toPeriod, setToPeriod] = useState('2026-08-31')
const [changeType, setChangeType] = useState('Tất cả')
  useEffect(() => {
    gnT.event('filter:settled')
  }, [objectType, assetGroup, province, valuationUnit, valuationRisk, timeMode, reportingPeriod, fromPeriod, toPeriod, changeType])
  const [selectedAssetId, setSelectedAssetId] = useState(null)
  const [mapFilterAssetIds, setMapFilterAssetIds] =
    useState(null)
  // Token nhỏ, rõ ràng: mỗi lần Xóa lọc tăng lên 1.
  // AssetMap đưa token này vào deps của effect "fit overview"
  // => ép map quay về tổng quan theo bộ lọc chung hiện tại.
  const [mapViewResetKey, setMapViewResetKey] =
    useState(0)
  const [detailAsset, setDetailAsset] = useState(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifView, setNotifView] = useState('summary')
  const [notifDetailItem, setNotifDetailItem] =
    useState(null)
  const [notifAllPage, setNotifAllPage] = useState(1)
  const [notifDrawerTop, setNotifDrawerTop] =
    useState(96)
  const [notifClosing, setNotifClosing] =
    useState(false)
  const headerRef = useRef(null)
const [searchText, setSearchText] =
  useState('')
  const [filterOpen, setFilterOpen] =
  useState(false)

  const hasActiveFilters = useMemo(
    () =>
      objectType !== 'Tất cả' ||
      assetGroup !== 'Tất cả' ||
      province !== 'Tất cả' ||
      valuationUnit !== 'Tất cả' ||
      valuationRisk !== 'Tất cả' ||
      timeMode !== 'Một kỳ' ||
      reportingPeriod !== '2026-08-31' ||
      fromPeriod !== '2026-06-30' ||
      toPeriod !== '2026-08-31' ||
      changeType !== 'Tất cả',
    [
      objectType,
      assetGroup,
      province,
      valuationUnit,
      valuationRisk,
      timeMode,
      reportingPeriod,
      fromPeriod,
      toPeriod,
      changeType,
    ]
  )

const [aiQuestion, setAiQuestion] =
  useState('')

const [aiLoading, setAiLoading] =
  useState(false)

const [aiError, setAiError] =
  useState('')

const [aiResult, setAiResult] =
  useState(null)

const [aiJobs, setAiJobs] =
  useState([])

  const [aiTab, setAiTab] = useState('ASK')

const [aiHistory, setAiHistory] = useState([])

  const [excelFileInfo, setExcelFileInfo] =
  useState(null)

  const [
  importedExcelFileInfo,
  setImportedExcelFileInfo,
] = useState(null)

  const [excelReadError, setExcelReadError] =
  useState('')

  const [
  excelStructureValidation,
  setExcelStructureValidation,
] = useState(null)

const [
  excelColumnValidation,
  setExcelColumnValidation,
] = useState(null)
const [
  valuationRowValidation,
  setValuationRowValidation,
] = useState(null)
const [excelImported, setExcelImported] =
  useState(false)
  const [pendingExcelData, setPendingExcelData] =
  useState(null)
  const [importedExcelData, setImportedExcelData] =
  useState(null)
  const [
  canonicalExcelData,
  setCanonicalExcelData,
] = useState(null)

const [showValidationDetails, setShowValidationDetails] =
  useState(false)
  const [showInputDetails, setShowInputDetails] = useState(false)
  const activeDataset =
  importedExcelData || MOCK_DATASET

const reportingPeriods = useMemo(
  () => getReportingPeriods(activeDataset),
  [activeDataset]
)

// V2.6.7 Final: gợi ý là "mỏ neo" dẫn người dùng từ tra cứu -> phân tích -> hành động.
// Khai báo sau reportingPeriods để tránh ReferenceError khi React render lần đầu.
const aiSuggestions = [
  'Phân tích tình hình rủi ro tài sản hiện tại.',
  'Địa bàn nào có nhiều tài sản rủi ro nhất?',
  'Địa bàn Hà Nội có bao nhiêu tài sản bảo đảm?',
  ...(reportingPeriods.length >= 2
    ? ['So với kỳ trước, điểm rủi ro nào thay đổi đáng chú ý nhất?']
    : []),
  'Dựa trên dữ liệu hiện tại, tôi nên ưu tiên kiểm tra những gì?',
]

const periodAssets = useMemo(
  () => getAssetsByReportingPeriod(reportingPeriod, activeDataset),
  [reportingPeriod, activeDataset]
)

const fromPeriodAssets = useMemo(
  () => getAssetsByReportingPeriod(fromPeriod, activeDataset),
  [fromPeriod, activeDataset]
)

const toPeriodAssets = useMemo(
  () => getAssetsByReportingPeriod(toPeriod, activeDataset),
  [toPeriod, activeDataset]
)

const baseAssets = timeMode === 'Một kỳ' ? periodAssets : toPeriodAssets

const filterOptions = useMemo(() => {
  const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'vi')
  )

  return {
    assetGroups: uniqueSorted(baseAssets.map((asset) => asset.nhomTsCap1)),
    provinces: uniqueSorted(baseAssets.map((asset) => asset.tinhTp)),
    valuationUnits: uniqueSorted(baseAssets.map((asset) => asset.donViDinhGia)),
    valuationRisks: uniqueSorted(
      baseAssets.flatMap((asset) => (asset.risks ?? []).map((risk) => risk.loaiRuiRo))
    ),
  }
}, [baseAssets])

const matchesBaseFilters = (asset) => {
  const matchObjectType =
  objectType === 'Tất cả' ||
  (
    objectType === 'TSBĐ đang bảo đảm' &&
    asset.isActiveCollateral
  ) ||
  (
    objectType === 'Không phải TSBĐ đang bảo đảm' &&
    !asset.isActiveCollateral
  )

  const matchAssetGroup =
    assetGroup === 'Tất cả' ||
    asset.nhomTsCap1 === assetGroup

  const matchProvince =
    province === 'Tất cả' ||
    asset.tinhTp === province

  const matchValuationUnit =
    valuationUnit === 'Tất cả' ||
    asset.donViDinhGia === valuationUnit

  return (
    matchObjectType &&
    matchAssetGroup &&
    matchProvince &&
    matchValuationUnit
  )
}

/*
  MỘT KỲ:
  áp dụng cả bộ lọc thông thường + bộ lọc rủi ro.
*/
const normalizeSearchText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

const normalizedSearchText =
  normalizeSearchText(searchText)

const matchesSearch = (asset) => {
  if (!normalizedSearchText) {
    return true
  }

  const searchableValues = [
    asset.maTsDg,
    asset.maTsbd,
    asset.cif,
    asset.tinhTp,
    asset.nhomTsCap1,
    asset.loaiTsCap2,

    // Các trường này dùng nếu dataset hiện có
    asset.diaChi,
    asset.tenKhachHang,
    asset.donViDinhGia,
    asset.valuationUnit,
  ]

  return searchableValues.some((value) =>
    normalizeSearchText(value).includes(
      normalizedSearchText
    )
  )
}


const filteredAssets = useMemo(() => {
  gnT.begin('filterAssets')
  const sourceAssets = timeMode === 'Một kỳ' ? periodAssets : toPeriodAssets

  const result = sourceAssets.filter((asset) => {
    const matchObjectType =
      objectType === 'Tất cả' ||
      (objectType === 'TSBĐ đang bảo đảm' && asset.isActiveCollateral) ||
      (objectType === 'Không phải TSBĐ đang bảo đảm' && !asset.isActiveCollateral)

    const matchAssetGroup = assetGroup === 'Tất cả' || asset.nhomTsCap1 === assetGroup
    const matchProvince = province === 'Tất cả' || asset.tinhTp === province
    const matchValuationUnit = valuationUnit === 'Tất cả' || asset.donViDinhGia === valuationUnit

    let matchRisk = true
    if (timeMode === 'Một kỳ') {
      if (valuationRisk === 'Không phát hiện') {
        matchRisk = (asset.risks ?? []).length === 0
      } else if (valuationRisk !== 'Tất cả') {
        matchRisk = (asset.risks ?? []).some((risk) => risk.loaiRuiRo === valuationRisk)
      }
    }

    let matchText = true
    if (normalizedSearchText) {
      const searchableValues = [
        asset.maTsDg,
        asset.maTsbd,
        asset.cif,
        asset.tinhTp,
        asset.nhomTsCap1,
        asset.loaiTsCap2,
        asset.diaChi,
        asset.tenKhachHang,
        asset.donViDinhGia,
        asset.valuationUnit,
      ]
      matchText = searchableValues.some((value) =>
        normalizeSearchText(value).includes(normalizedSearchText)
      )
    }

    return matchObjectType && matchAssetGroup && matchProvince && matchValuationUnit && matchRisk && matchText
  })
  gnT.end('filterAssets')
  return result
}, [
  timeMode,
  periodAssets,
  toPeriodAssets,
  objectType,
  assetGroup,
  province,
  valuationUnit,
  valuationRisk,
  normalizedSearchText,
])

/*
  KHOẢNG THỜI GIAN:
  chưa lọc rủi ro ở đây.

  Lý do:
  phải giữ được tài sản ở cả đầu kỳ và cuối kỳ
  trước khi so sánh rủi ro.
*/
const filteredFromPeriodAssets = useMemo(
  () => {
    gnT.begin('timeFilter')
    const result =
    timeMode === 'Khoảng thời gian'
      ? fromPeriodAssets.filter(
          (asset) =>
            matchesBaseFilters(asset) &&
            matchesSearch(asset)
        )
      : []
    gnT.end('timeFilter')
    return result
  },
  [
    timeMode,
    fromPeriodAssets,
    objectType,
    assetGroup,
    province,
    valuationUnit,
    normalizedSearchText,
  ]
)

const periodsInRange = useMemo(
  () =>
    reportingPeriods.filter(
      (period) =>
        period >= fromPeriod &&
        period <= toPeriod
    ),
  [reportingPeriods, fromPeriod, toPeriod]
)

const assetsByPeriodInRange = useMemo(
  () => {
    gnT.begin('timeFilterByPeriod')
    const result =
    timeMode === 'Khoảng thời gian' && fromPeriod !== toPeriod
      ? periodsInRange.map((period) => ({
          period,
          assets:
    getAssetsByReportingPeriod(
    period,
    activeDataset
    ).filter(
    (asset) =>
      matchesBaseFilters(asset) &&
      matchesSearch(asset)
    ),
        }))
      : []
    gnT.end('timeFilterByPeriod')
    return result
  },
  [
    timeMode,
    fromPeriod,
    toPeriod,
    periodsInRange,
    activeDataset,
    objectType,
    assetGroup,
    province,
    valuationUnit,
    normalizedSearchText,
  ]
)

const mapFilterIdSet = useMemo(
  () =>
    mapFilterAssetIds && mapFilterAssetIds.length > 0
      ? new Set(mapFilterAssetIds)
      : null,
  [mapFilterAssetIds]
)

const mapFilteredAssets = useMemo(
  () =>
    mapFilterIdSet
      ? filteredAssets.filter((asset) =>
          mapFilterIdSet.has(asset.maTsDg)
        )
      : filteredAssets,
  [filteredAssets, mapFilterIdSet]
)

const tableAssets = gnT.time('table', () =>
  mapFilteredAssets.slice(0, TABLE_RENDER_LIMIT)
)

const persistentRiskSummary = useMemo(() => {
  gnT.begin('persistentRisk')
  const targetPeriod = timeMode === 'Một kỳ' ? reportingPeriod : toPeriod
  const result = getPersistentRiskSummary({
    period: targetPeriod,
    dataset: activeDataset,
    assetIds: filteredAssets.map((asset) => asset.maTsDg),
    riskType: valuationRisk !== 'Tất cả' && valuationRisk !== 'Không phát hiện' ? valuationRisk : null,
  })
  gnT.end('persistentRisk')
  return result
}, [timeMode, reportingPeriod, toPeriod, activeDataset, filteredAssets, valuationRisk])

const persistentRiskById = useMemo(
  () => new Map((persistentRiskSummary.items || []).map((item) => [item.maTsDg, item])),
  [persistentRiskSummary]
)

const notificationAlerts = useMemo(() => {
  gnT.begin('notification')
  const items = persistentRiskSummary.items || []
  const result = {
    alertCount: items.length,
    visibleItems: items.slice(0, 5),
    extraCount: Math.max(0, items.length - 5),
  }
  gnT.end('notification')
  return result
}, [persistentRiskSummary])

const NOTIF_ALL_PAGE_SIZE = 20
const notifAllPageItems = useMemo(() => {
  gnT.begin('notificationAll')
  const items = persistentRiskSummary.items || []
  const start = (notifAllPage - 1) * NOTIF_ALL_PAGE_SIZE
  const result = items.slice(start, start + NOTIF_ALL_PAGE_SIZE)
  gnT.end('notificationAll')
  return result
}, [notifAllPage, persistentRiskSummary])
const notifAllTotalPages = Math.max(
  1,
  Math.ceil(
    (persistentRiskSummary.items || []).length /
      NOTIF_ALL_PAGE_SIZE
  )
)

const {
  totalValuation,
  totalCollateralAssets,
  totalCollateralDebt,
} = useMemo(() => {
  gnT.begin('kpi')
  const totalValuation = filteredAssets.reduce(
    (sum, asset) => sum + asset.gtDinhGia,
    0
  )

  const totalCollateralAssets = filteredAssets.filter(
    (asset) => asset.isActiveCollateral
  ).length

  const totalCollateralDebt = filteredAssets.reduce(
    (sum, asset) => sum + asset.duNoTsbd,
    0
  )

  const result = {
    totalValuation,
    totalCollateralAssets,
    totalCollateralDebt,
  }
  gnT.end('kpi')
  return result
}, [filteredAssets])

const totalAssets = filteredAssets.length

const fromTotalAssets =
  filteredFromPeriodAssets.length

const {
  fromTotalValuation,
  fromTotalCollateralAssets,
  fromTotalCollateralDebt,
} = useMemo(() => {
  gnT.begin('kpiFrom')
  const fromTotalValuation =
    filteredFromPeriodAssets.reduce(
      (sum, asset) => sum + asset.gtDinhGia,
      0
    )

  const fromTotalCollateralAssets =
    filteredFromPeriodAssets.filter(
      (asset) => asset.isActiveCollateral
    ).length

  const fromTotalCollateralDebt =
    filteredFromPeriodAssets.reduce(
      (sum, asset) => sum + asset.duNoTsbd,
      0
    )

  const result = {
    fromTotalValuation,
    fromTotalCollateralAssets,
    fromTotalCollateralDebt,
  }
  gnT.end('kpiFrom')
  return result
}, [filteredFromPeriodAssets])

const assetDelta =
  totalAssets - fromTotalAssets

const valuationDelta =
  totalValuation - fromTotalValuation

const collateralAssetDelta =
  totalCollateralAssets -
  fromTotalCollateralAssets

const collateralDebtDelta =
  totalCollateralDebt -
  fromTotalCollateralDebt

const comparisonAssets = useMemo(
  () => {
    gnT.begin('comparison')
    const result =
    timeMode === 'Khoảng thời gian'
      ? buildComparisonAssets({
          fromAssets: filteredFromPeriodAssets,
          toAssets: filteredAssets,
          assetsByPeriodInRange,
          fromPeriod,
          toPeriod,
          dataset: activeDataset,
        })
      : []
    gnT.end('comparison')
    return result
  },
  [
    timeMode,
    filteredFromPeriodAssets,
    filteredAssets,
    assetsByPeriodInRange,
    fromPeriod,
    toPeriod,
    activeDataset,
  ]
)

const filteredComparisonAssets = useMemo(
  () =>
    filterComparisonAssets(comparisonAssets, {
      changeType,
      valuationRisk,
    }),
  [comparisonAssets, changeType, valuationRisk]
)

const mapAssets = useMemo(
  () =>
    timeMode === 'Một kỳ'
      ? filteredAssets
      : filteredComparisonAssets
          .map((item) => item.toAsset ?? item.fromAsset)
          .filter(Boolean),
  [timeMode, filteredAssets, filteredComparisonAssets]
)

const mapFilteredComparisonAssets = useMemo(
  () =>
    mapFilterIdSet
      ? filteredComparisonAssets.filter((item) =>
          mapFilterIdSet.has(item.maTsDg)
        )
      : filteredComparisonAssets,
  [filteredComparisonAssets, mapFilterIdSet]
)

        const comparisonFromAssets =
  filteredComparisonAssets
    .map((item) => item.fromAsset)
    .filter(Boolean)

const comparisonToAssets =
  filteredComparisonAssets
    .map((item) => item.toAsset)
    .filter(Boolean)
const comparisonFromTotalAssets =
  comparisonFromAssets.length

const comparisonToTotalAssets =
  comparisonToAssets.length

const comparisonFromTotalValuation =
  comparisonFromAssets.reduce(
    (sum, asset) => sum + asset.gtDinhGia,
    0
  )

const comparisonToTotalValuation =
  comparisonToAssets.reduce(
    (sum, asset) => sum + asset.gtDinhGia,
    0
  )

const comparisonFromTotalCollateralAssets =
  filteredComparisonAssets.filter(
    (item) =>
      item.fromCollateralSnapshot
        ?.trangThaiTsbd ===
      'Đang bảo đảm'
  ).length

const comparisonToTotalCollateralAssets =
  filteredComparisonAssets.filter(
    (item) =>
      item.toCollateralSnapshot
        ?.trangThaiTsbd ===
      'Đang bảo đảm'
  ).length

const comparisonFromTotalDebt =
  filteredComparisonAssets.reduce(
    (sum, item) =>
      sum + item.fromDebt,
    0
  )

const comparisonToTotalDebt =
  filteredComparisonAssets.reduce(
    (sum, item) =>
      sum + item.toDebt,
    0
  )

  const formatBillion = (value) => {
  const billionValue =
    value / 1_000_000_000

  const formattedValue =
    billionValue.toLocaleString(
      'en-US',
      {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }
    )

  return `${formattedValue} tỷ đồng`
}

  const handleSelectAssetFromTable = (maTsDg) => {
  setSelectedAssetId(maTsDg)

  setTimeout(() => {
    const mapPanel =
      document.getElementById('asset-map-panel')

    if (mapPanel) {
      mapPanel.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, 100)
}

function splitQuestions(input) {
  const text =
    String(input || '')
      .replace(/\r\n/g, '\n')
      .trim()

  if (!text) {
    return []
  }

  const rawParts =
    text
      // One line = one question. A '?' inside a line may connect clauses
      // belonging to the same request, e.g. '... tỉnh nào? thời điểm nào'.
      .split(/\n+/)
      .map((item) =>
        item.trim()
      )
      .filter(Boolean)

  const uniqueQuestions = []

  rawParts.forEach((question) => {
    if (
      !uniqueQuestions.includes(
        question
      )
    ) {
      uniqueQuestions.push(
        question
      )
    }
  })

  return uniqueQuestions
}

const handleAskAI = async () => {

  const question = aiQuestion.trim()

  if (!question) {

    setAiError('Vui lòng nhập câu hỏi.')

    setAiResult(null)

    setAiJobs([])

    return

  }

  setAiQuestion('')

  const questions = splitQuestions(question)

  if (questions.length > 20) {
    setAiError(
      `Bạn đang gửi ${questions.length} câu hỏi. Vui lòng chia thành tối đa 20 câu mỗi lần.`
    )
    setAiJobs([])
    setAiResult(null)
    return
  }


  const initialJobs = questions.map(
    (item, index) => ({
      id: `q-${Date.now()}-${index}`,
      question: item,
      status: 'PENDING',
      planner: null,
      queryPlan: null,
      result: null,
      answer: null,
      error: null,
    })
  )

  setAiJobs(initialJobs)
  setAiLoading(true)
  setAiError('')
  setAiResult(null)

  const completedJobs = []

  try {
    for (const job of initialJobs) {
      setAiJobs((currentJobs) =>
        currentJobs.map((item) =>
          item.id === job.id
            ? {
                ...item,
                status: 'PROCESSING',
              }
            : item
        )
      )

      try {
        const jobStartTime = performance.now()

        const rawQueryPlan =
  await createQueryPlanFromGreenNode(
    job.question,
    activeDataset,
    {
      defaultPeriod: timeMode === 'Một kỳ' ? reportingPeriod : toPeriod,
      // Reuse the already-projected period assets so AI planning does not
      // rebuild 30k records just to resolve province/risk dimensions.
      periodAssets: timeMode === 'Một kỳ' ? periodAssets : toPeriodAssets,
      defaultRiskType:
        valuationRisk !== 'Tất cả' && valuationRisk !== 'Không phát hiện'
          ? valuationRisk
          : null,
      // Keep persistent-risk natural-language answers on the exact same
      // current UI scope as the KPI (period + filters + search).
      persistentAssetIds: filteredAssets.map((asset) => asset.maTsDg),
      persistentRiskType:
        valuationRisk !== 'Tất cả' && valuationRisk !== 'Không phát hiện'
          ? valuationRisk
          : null,
    }
  )

  if (rawQueryPlan?.engine === 'RISK_CONTEXT') {
    const analysis =
      formatRiskAnalysis(
        rawQueryPlan
      )

    const answer =
      analysis.text

    const jobEndTime =
      performance.now()

    const successJob = {
      ...job,
      status: 'SUCCESS',
      planner: 'RISK_CONTEXT',
      queryPlan: rawQueryPlan,
      result: null,
      answer,
      error: null,
      durationMs: Math.round(
        jobEndTime - jobStartTime
      ),
    }

    completedJobs.push(successJob)

    setAiHistory((current) => [
      {
        id: successJob.id,
        question: successJob.question,
        answer: successJob.answer,
      },
      ...current,
    ])

    setAiJobs((currentJobs) =>
      currentJobs.map((item) =>
        item.id === job.id
          ? successJob
          : item
      )
    )

    if (analysis.canEnrich && analysis.riskContext) {
      fetchRiskEnrichment(
        job.question,
        analysis.riskContext
      ).then((enrichment) => {
        const enrichedAnswer =
          composeRiskAnswer(
            analysis,
            enrichment
          )

        const enrichedJob = {
          ...successJob,
          answer: enrichedAnswer,
          durationMs: Math.round(
            performance.now() - jobStartTime
          ),
        }

        const existingIndex =
          completedJobs.findIndex((item) =>
            item.id === job.id
          )

        if (existingIndex >= 0) {
          completedJobs[existingIndex] = enrichedJob
        } else {
          completedJobs.push(enrichedJob)
        }

        setAiHistory((current) => [
          {
            id: job.id,
            question: job.question,
            answer: enrichedAnswer,
          },
          ...current.filter((item) =>
            item.id !== job.id
          ),
        ])

        setAiJobs((currentJobs) =>
          currentJobs.map((item) =>
            item.id === job.id
              ? enrichedJob
              : item
          )
        )
      })
    }

    continue
  }


  const resolution =
  resolveQueryPlanValues(
    rawQueryPlan,
    activeDataset
  )
  

if (!resolution.success) {
  const technicalError =
    resolution.errors.join(
      ' | '
    )

  console.error(
    'Query plan resolution failed:',
    job.question,
    technicalError
  )

  const errorMessage =
    'Chưa đủ thông tin để trả lời. Bạn có thể diễn đạt lại câu hỏi (kèm kỳ báo cáo và loại tài sản) rồi thử lại.'

  const failedJob = {
    ...job,
    status: 'ERROR',
    queryPlan:
      rawQueryPlan,
    error:
      errorMessage,
  }

  completedJobs.push(
    failedJob
  )

  setAiJobs(
    (currentJobs) =>
      currentJobs.map(
        (item) =>
          item.id ===
          job.id
            ? failedJob
            : item
      )
  )

  continue
}

const queryPlan =
  resolution.queryPlan

const validation =
  validateQueryPlan(
    queryPlan
  )

        if (!validation.valid) {
          const technicalErrors =
            validation.errors.join(
              ' | '
            )

          console.error(
            'Query plan validation failed:',
            job.question,
            technicalErrors
          )

          const errorMessage =
            'Câu hỏi chưa thể thực hiện ở dạng hiện tại. Vui lòng diễn đạt lại câu hỏi và thử lại.'

          const failedJob = {
            ...job,
            status: 'ERROR',
            queryPlan,
            error: errorMessage,
          }

          completedJobs.push(failedJob)

          setAiJobs((currentJobs) =>
            currentJobs.map((item) =>
              item.id === job.id
                ? failedJob
                : item
            )
          )

          continue
        }

        const result =
          executeQueryPlan(
            queryPlan,
            activeDataset
          )

        if (!result.success) {
          const technicalErrors =
            result.errors?.join(' | ') ||
            'no detail'

          console.error(
            'Query plan execution failed:',
            job.question,
            technicalErrors
          )

          const errorMessage =
            'Không thể xử lý truy vấn dữ liệu lúc này. Vui lòng thử lại.'

          const failedJob = {
            ...job,
            status: 'ERROR',
            queryPlan,
            result,
            error: errorMessage,
          }

          completedJobs.push(failedJob)

          setAiJobs((currentJobs) =>
            currentJobs.map((item) =>
              item.id === job.id
                ? failedJob
                : item
            )
          )

          continue
        }

        const answer =
          formatQueryAnswer(
            queryPlan,
            result
          )

        const jobEndTime =
          performance.now()

        const successJob = {
          ...job,
          status: 'SUCCESS',
          queryPlan,
          result,
          answer,
          error: null,
          durationMs: Math.round(
            jobEndTime - jobStartTime
          ),
        }

        completedJobs.push(successJob)

        setAiHistory((current) => [
  {
    id: successJob.id,
    question: successJob.question,
    answer: successJob.answer,
  },
  ...current,
])

        setAiJobs((currentJobs) =>
          currentJobs.map((item) =>
            item.id === job.id
              ? successJob
              : item
          )
        )

       
      } catch (error) {
  console.error(
    'GreenNode AI job error:',
    job.question,
    error
  )

  const isConnectionError =
    error instanceof TypeError &&
    error?.message ===
      'Failed to fetch'

  const userErrorMessage =
    isConnectionError
      ? 'Không thể kết nối tới dịch vụ AI. Vui lòng thử lại sau.'
      : 'Không thể xử lý yêu cầu AI. Vui lòng thử lại.'

  const failedJob = {
    ...job,
    status: 'ERROR',
    error: userErrorMessage,
  }

  completedJobs.push(
    failedJob
  )

  setAiJobs((currentJobs) =>
    currentJobs.map((item) =>
      item.id === job.id
        ? failedJob
        : item
    )
  )
}
    }

    const successfulJobs =
      completedJobs.filter(
        (job) =>
          job.status === 'SUCCESS'
      )

    const failedJobs =
      completedJobs.filter(
        (job) =>
          job.status === 'ERROR'
      )

    /*
     * Giữ tương thích với UI cũ
     * nếu người dùng chỉ hỏi 1 câu.
     */
    if (
      questions.length === 1 &&
      successfulJobs.length === 1
    ) {
      const job = successfulJobs[0]

      setAiResult({
        question: job.question,
        queryPlan: job.queryPlan,
        result: job.result,
        answer: job.answer,
      })
    }

    /*
     * Nếu cả batch đều lỗi,
     * mới hiện lỗi chung.
     */
    if (
      successfulJobs.length === 0 &&
      failedJobs.length > 0
    ) {
      setAiError(
        'Không có câu hỏi nào được xử lý thành công.'
      )
    }

   
    
  } finally {
    setAiLoading(false)
  }
}

const handleExcelFileChange = async (event) => {
  const file = event.target.files?.[0]

  if (!file) {
    return
  }

  try {
    setExcelReadError('')
    setExcelStructureValidation(null)
    setShowValidationDetails(false)

    const result =
      await readExcelWorkbook(file)

    const structureValidation =
      validateWorkbookStructure(
        result.workbook
      )
      const columnValidation =
  validateWorkbookColumns(
    result.workbook
  )
const rowValidation =
  validateValuationSnapshotRows(
    result.workbook
  )
  const extractedData =
  extractExcelData(
    result.workbook
  )

const canonicalData =
  buildCanonicalExcelData(
    extractedData
  )
  
    setExcelFileInfo({
      fileName: result.fileName,
      sheetNames: result.sheetNames,
    })

    setExcelStructureValidation(
      structureValidation
    )
    setExcelColumnValidation(
  columnValidation
)
setValuationRowValidation(
  rowValidation
)
setPendingExcelData(
  extractedData
)
setCanonicalExcelData(
  canonicalData
)
  } catch (error) {
    console.error(
      'Không đọc được file Excel:',
      error
    )

    setExcelFileInfo(null)
    setCanonicalExcelData(null)
    setExcelStructureValidation(null)
    setExcelColumnValidation(null)
    setValuationRowValidation(null)
    setPendingExcelData(null)

    setExcelReadError(
      'GreenNode không đọc được file Excel này.'
    )
  }
}
const handleImportExcel = () => {
  const totalErrors =
    (excelStructureValidation?.errorCount || 0) +
    (excelColumnValidation?.errorCount || 0) +
    (valuationRowValidation?.errorCount || 0)

  if (
    totalErrors > 0 ||
    !pendingExcelData ||
    !canonicalExcelData
  ) {
    return
  }

  setImportedExcelData(
  canonicalExcelData
)

setImportedExcelFileInfo(
  excelFileInfo
)

setExcelImported(true)
// A selection/popup from the previous dataset must never drive the new map.
setSelectedAssetId(null)
setShowValidationDetails(false)
}

const handleClearImportedExcel = () => {
  setExcelImported(false)
  setSelectedAssetId(null)
  setImportedExcelFileInfo(null)
  setCanonicalExcelData(null)
  setImportedExcelData(null)
  setExcelFileInfo(null)
  setExcelStructureValidation(null)
  setExcelColumnValidation(null)
  setValuationRowValidation(null)
  setPendingExcelData(null)
  setExcelReadError('')
  setShowValidationDetails(false)
  
}
const handleRemoveSelectedExcel = () => {
  setExcelFileInfo(null)
  setCanonicalExcelData(null)
  setExcelStructureValidation(null)
  setExcelColumnValidation(null)
  setValuationRowValidation(null)
  setExcelReadError('')
  setShowValidationDetails(false)
  setPendingExcelData(null)
}
const totalExcelErrors =
  (excelStructureValidation?.errorCount || 0) +
  (excelColumnValidation?.errorCount || 0) +
  (valuationRowValidation?.errorCount || 0)

const totalExcelWarnings =
  excelStructureValidation?.warningCount || 0

const excelReadyToImport =
  Boolean(excelFileInfo) &&
  totalExcelErrors === 0
const handleViewAssetDetail = useCallback((asset) => {
    setSelectedAssetId(asset.maTsDg)
    setDetailAsset(asset)

    setTimeout(() => {
      const detail = document.getElementById(
        'asset-detail-view'
      )

      if (detail) {
        detail.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }
    }, 100)
  }, [])

  const handleMapAssetClick = useCallback(
    (assetIds) => {
      mark('map:filter-requested', {
        count: Array.isArray(assetIds) ? assetIds.length : 0,
      })
      setMapFilterAssetIds(
        Array.isArray(assetIds) && assetIds.length > 0
          ? assetIds
          : null
      )

      if (
        Array.isArray(assetIds) &&
        assetIds.length === 1
      ) {
        setSelectedAssetId(assetIds[0])
      }
    },
    []
  )

  const handleClearMapFilter = useCallback(() => {
    setMapFilterAssetIds(null)
    setSelectedAssetId(null)
    // Yêu cầu AssetMap khôi phục viewport về tổng quan
    // đúng với bối cảnh bộ lọc chung hiện tại.
    setMapViewResetKey((key) => key + 1)
  }, [])

  // V2.6.7 perf mark (dev-only, guarded): map filter -> table settled.
  useEffect(() => {
    if (!perfEnabled()) return
    mark('map:filter-settled', {
      count: mapFilterAssetIds ? mapFilterAssetIds.length : 0,
    })
  }, [mapFilterAssetIds])

  const handleOpenDetail = useCallback((asset) => {
    if (asset) {
      setDetailAsset(asset)
    }
  }, [])

  const handleCloseDetail = useCallback(() => {
    setDetailAsset(null)
  }, [])

  const handleNotifClose = useCallback(() => {
    if (notifClosing) {
      return
    }

    setNotifClosing(true)

    window.setTimeout(() => {
      setNotifOpen(false)
      setNotifClosing(false)
    }, 180)
  }, [notifClosing])

  const handleNotifToggle = useCallback(() => {
    if (notifOpen) {
      handleNotifClose()
      return
    }

    setNotifView('summary')
    setNotifDetailItem(null)
    setNotifAllPage(1)

    const headerEl = headerRef.current
    const top = headerEl
      ? headerEl.getBoundingClientRect().bottom
      : 96

    setNotifDrawerTop(top)
    setNotifOpen(true)
  }, [notifOpen, handleNotifClose])

  const handleNotifRowClick = useCallback((item) => {
    setNotifDetailItem(item)
    setNotifView('detail')
  }, [])

  const handleNotifBackToSummary = useCallback(() => {
    setNotifView('summary')
  }, [])

  const handleNotifViewAsset = useCallback((item) => {
    handleNotifClose()

    if (item && item.maTsDg) {
      handleMapAssetClick([item.maTsDg])
    }
  }, [handleMapAssetClick, handleNotifClose])

  const handleNotifViewAll = useCallback(() => {
    setNotifAllPage(1)
    setNotifView('all')
  }, [])

  useEffect(() => {
    if (!notifOpen) {
      return
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        handleNotifClose()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [notifOpen, handleNotifClose])

  return (
    <div className="app">
      <header className="gn-header" ref={headerRef}>
  <div className="gn-header-wave" />

  <div className="gn-brand">
    <img
      src={tsbdLogo}
      alt="Logo hệ sinh thái bản đồ số TSBĐ"
      className="gn-logo-image"
    />

    <div className="gn-brand-text">
      <div className="gn-unit">
        Trung tâm Định giá & Quản lý TSBĐ
      </div>

      <div className="gn-division">
        Khối Quản lý Rủi ro
      </div>

      <h1>
        HỆ SINH THÁI BẢN ĐỒ SỐ TSBĐ
      </h1>

      <div className="gn-brand-slogan">
        Kết nối dữ liệu – Nhận diện rủi ro – Hỗ trợ ra quyết định
      </div>
    </div>
  </div>

  <div className="gn-header-right">
    <img
  src={headerMottoBg}
  alt=""
  className="gn-header-right-art"
/>
  <div className="gn-source-badge">
    <span className="gn-source-dot" />

    <span>Dữ liệu:</span>

    <strong>
      {excelImported ? 'EXCEL' : 'MOCK'}
    </strong>
  </div>

  <div className="gn-notification">
  <button
    type="button"
    className="gn-notification-bell"
    onClick={handleNotifToggle}
    aria-label={notificationAlerts.alertCount > 0
      ? `Thông báo: ${notificationAlerts.alertCount} cảnh báo`
      : 'Thông báo'}
    aria-expanded={notifOpen}
    title={notificationAlerts.alertCount > 0
      ? `Có ${notificationAlerts.alertCount} cảnh báo cần chú ý`
      : 'Thông báo'}
  >
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>

    {notificationAlerts.alertCount > 0 && (
      <span
        className="gn-notification-badge"
        aria-hidden="true"
      >
        {notificationAlerts.alertCount > 99
          ? '99+'
          : notificationAlerts.alertCount}
      </span>
    )}
  </button>
</div>

<div className="gn-user">
  <div className="gn-user-avatar">
    TL
  </div>

  <div className="gn-user-info">
    <div className="gn-user-name">
      Người dùng
    </div>

    <div className="gn-user-role">
      GreenNode Map
    </div>
  </div>
</div>

  
</div>
</header>

{notifOpen && (
  <div
    className={`gn-notif-backdrop${
      notifClosing ? ' is-closing' : ''
    }`}
    onClick={handleNotifClose}
    aria-hidden="true"
    style={{ top: notifDrawerTop }}
  />
)}

{notifOpen && (
  <aside
    className={`gn-notif-drawer${
      notifClosing ? ' is-closing' : ''
    }`}
    role="dialog"
    aria-label="Thông báo"
    style={{ top: notifDrawerTop }}
  >
    <div className="gn-notif-drawer-head">
      <div className="gn-notif-drawer-header">
        {notifView !== 'summary' && (
          <button
            type="button"
            className="gn-notif-drawer-back"
            onClick={handleNotifBackToSummary}
          >
            ← Quay lại
          </button>
        )}

        <div
          className={`gn-notif-drawer-title ${
            notifView === 'summary'
              ? 'is-left'
              : 'is-center'
          }`}
        >
          {notifView === 'detail'
            ? 'Chi tiết cảnh báo'
            : notifView === 'all'
              ? 'Tất cả cảnh báo'
              : 'Thông báo'}
        </div>

        <button
          type="button"
          className="gn-notif-drawer-close"
          onClick={handleNotifClose}
          aria-label="Đóng"
        >
          ×
        </button>
      </div>

      {notifView === 'summary' &&
        notificationAlerts.alertCount > 0 && (
          <div className="gn-notif-drawer-sub">
            Có {notificationAlerts.alertCount} cảnh báo cần chú ý
          </div>
        )}
    </div>

    <div className="gn-notif-drawer-body">
      {notifView === 'detail' &&
      notifDetailItem ? (
        <dl className="gn-notif-detail-rows">
          <div>
            <dt>Mã tài sản</dt>
            <dd>{notifDetailItem.maTsDg}</dd>
          </div>

          <div>
            <dt>Tên tài sản</dt>
            <dd>{notifDetailItem.tenTaiSan}</dd>
          </div>

          <div>
            <dt>Tỉnh/TP</dt>
            <dd>
              {notifDetailItem.province || '-'}
            </dd>
          </div>

          <div>
            <dt>Trạng thái rủi ro</dt>
            <dd>Có rủi ro</dd>
          </div>

          <div>
            <dt>Số kỳ rủi ro liên tiếp</dt>
            <dd>
              {notifDetailItem.consecutivePeriods} kỳ
            </dd>
          </div>
        </dl>
      ) : notifView === 'all' ? (
        <>
          {notifAllPageItems.length > 0 ? (
            <div className="gn-alert-list-scroll">
              {notifAllPageItems.map((item) => (
                <button
                  type="button"
                  key={item.maTsDg}
                  className="gn-alert-row"
                  onClick={() =>
                    handleNotifViewAsset(item)
                  }
                >
                  <span className="gn-alert-row-code">
                    {item.maTsDg}
                  </span>

                  <span
                    className="gn-alert-row-name"
                    title={item.tenTaiSan}
                  >
                    {item.tenTaiSan}
                  </span>

                  <span className="gn-alert-row-period">
                    Rủi ro liên tiếp {item.consecutivePeriods} kỳ
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="gn-notification-empty">
              Không có thông báo mới.
            </div>
          )}
        </>
      ) : notificationAlerts.alertCount === 0 ? (
        <div className="gn-notification-empty">
          Không có thông báo mới.
        </div>
      ) : (
        <div className="gn-notification-scroll">
          <ul className="gn-notification-items">
            {notificationAlerts.visibleItems.map((item) => (
              <li key={item.maTsDg}>
                <button
                  type="button"
                  className="gn-notification-item"
                  onClick={() =>
                    handleNotifRowClick(item)
                  }
                >
                  <div className="gn-notification-item-main">
                    <span className="gn-notification-item-code">
                      {item.maTsDg}
                    </span>

                    <span
                      className="gn-notification-item-name"
                      title={item.tenTaiSan}
                    >
                      {item.tenTaiSan}
                    </span>
                  </div>

                  <span className="gn-notification-item-period">
                    Rủi ro liên tiếp {item.consecutivePeriods} kỳ
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>

    {notifView === 'summary' &&
    notificationAlerts.alertCount > 0 ? (
      <div className="gn-notif-drawer-footer">
        <button
          type="button"
          className="gn-notification-more"
          onClick={handleNotifViewAll}
        >
          Xem tất cả cảnh báo
        </button>
      </div>
    ) : notifView === 'detail' &&
      notifDetailItem ? (
      <div className="gn-notif-drawer-footer">
        <button
          type="button"
          className="gn-notif-btn-primary"
          onClick={() =>
            handleNotifViewAsset(notifDetailItem)
          }
        >
          Xem tài sản
        </button>
      </div>
    ) : notifView === 'all' &&
      notifAllTotalPages > 1 ? (
      <div className="gn-alert-list-pager">
        <button
          type="button"
          className="gn-alert-pager-btn"
          disabled={notifAllPage <= 1}
          onClick={() =>
            setNotifAllPage((page) => page - 1)
          }
        >
          ← Trước
        </button>

        <span className="gn-alert-pager-info">
          Trang {notifAllPage} / {notifAllTotalPages}
        </span>

        <button
          type="button"
          className="gn-alert-pager-btn"
          disabled={
            notifAllPage >= notifAllTotalPages
          }
          onClick={() =>
            setNotifAllPage((page) => page + 1)
          }
        >
          Sau →
        </button>
      </div>
    ) : null}
  </aside>
)}

      <section
        className={`workspace ${
          filterOpen
      ? 'filter-open'
      : 'filter-closed'
       }`}
      >

        {!filterOpen && (
        <button
  type="button"
  className="filter-toggle"
  onClick={() =>
    setFilterOpen(
      (current) => !current
    )
  }
>
  <span className="filter-toggle-icon">
    ☰
  </span>

  <span className="filter-toggle-text">
    Bộ lọc thông tin
  </span>
</button>
)}
                {filterOpen && (
  <aside className="filter-panel">
    <div className="filter-panel-header">
      <div className="filter-panel-header-title">
        <h2>Bộ lọc thông tin</h2>

        <p
          className="filter-panel-hint"
          aria-live="polite"
        >
          {hasActiveFilters
            ? '✓ Đã áp dụng bộ lọc • Nhấn ✕ để xem kết quả'
            : 'Chọn điều kiện lọc • Nhấn ✕ để xem kết quả trên bản đồ'}
        </p>
      </div>

      <button
        type="button"
        className="filter-close"
        onClick={() =>
          setFilterOpen(false)
        }
        aria-label="Đóng bộ lọc"
      >
        ×
      </button>
    </div>
          <label>
          Chế độ thời gian
       <select
         value={timeMode}
          onChange={(event) => {
            gnT.event('filter:start')
            setTimeMode(event.target.value)
          }}
         >
           <option>Một kỳ</option>
           <option>Khoảng thời gian</option>
            </select>
            </label>

          {timeMode === 'Một kỳ' && (
  <label>
    Kỳ báo cáo
    <select
      value={reportingPeriod}
      onChange={(event) => {
        gnT.event('filter:start')
        setReportingPeriod(event.target.value)
      }}
    >
      {reportingPeriods.map((period) => (
        <option
          key={period}
          value={period}
        >
          {period}
        </option>
      ))}
    </select>
  </label>
)}

{timeMode === 'Khoảng thời gian' && (
  <>
    <label>
      Từ kỳ
      <select
        value={fromPeriod}
        onChange={(event) => {
          gnT.event('filter:start')
          setFromPeriod(event.target.value)
        }}
      >
       {reportingPeriods
  .filter((period) => period <= toPeriod)
  .map((period) => (
    <option
      key={period}
      value={period}
    >
      {period}
    </option>
  ))}
      </select>
    </label>

    <label>
      Đến kỳ
      <select
        value={toPeriod}
        onChange={(event) => {
          gnT.event('filter:start')
          setToPeriod(event.target.value)
        }}
      >
        {reportingPeriods
  .filter((period) => period >= fromPeriod)
  .map((period) => (
    <option
      key={period}
      value={period}
    >
      {period}
    </option>
          ))}
      </select>
    </label>
    <label>
  Loại biến động
  <select
    value={changeType}
    onChange={(event) => {
      gnT.event('filter:start')
      setChangeType(event.target.value)
    }}
  >
    <option>Tất cả</option>
    <option value="Phát sinh mới">Tài sản phát sinh mới</option>
    <option>Tăng GT định giá</option>
    <option>Giảm GT định giá</option>
    <option>Dư nợ tăng</option>
    <option>Dư nợ giảm</option>
    <option>Giải chấp</option>
    <option>Không còn xuất hiện trong nguồn</option>
    <option>Phát sinh rủi ro mới</option>
    <option>Phát sinh rủi ro trong khoảng</option>
  </select>
</label>
  </>
)}

          <label>
            Đối tượng
            <select
              value={objectType}
              onChange={(event) => {
                gnT.event('filter:start')
                setObjectType(event.target.value)
              }}
            >
              <option>Tất cả</option>
              <option>TSBĐ đang bảo đảm</option>
              <option>Không phải TSBĐ đang bảo đảm</option>
            </select>
          </label>

          <label>
            Nhóm tài sản
            <select
              value={assetGroup}
              onChange={(event) => {
                gnT.event('filter:start')
                setAssetGroup(event.target.value)
              }}
            >
              <option>Tất cả</option>
              {filterOptions.assetGroups.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label>
            Tỉnh/Thành phố
            <select
              value={province}
              onChange={(event) => {
                gnT.event('filter:start')
                setProvince(event.target.value)
              }}
            >
              <option>Tất cả</option>
              {filterOptions.provinces.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
             Đơn vị định giá
          <select
            value={valuationUnit}
             onChange={(event) => {
              gnT.event('filter:start')
              setValuationUnit(event.target.value)
             }}
            >
    <option>Tất cả</option>
    {filterOptions.valuationUnits.map((value) => (
      <option key={value} value={value}>{value}</option>
    ))}
  </select>
</label>

          <label>
            Rủi ro định giá
            <select
              value={valuationRisk}
              onChange={(event) => {
                gnT.event('filter:start')
                setValuationRisk(event.target.value)
              }}
            >
              <option>Tất cả</option>
              <option>Không phát hiện</option>
              {filterOptions.valuationRisks.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          </aside>
)}

      
    <div className="map-column">

  <section
    className="map-panel"
    id="asset-map-panel"
  >
    <div className="panel-title">
      <h2>Bản đồ tài sản</h2>
    </div>

    <AssetMap
      assets={mapAssets}
      selectedAssetId={selectedAssetId}
      onViewDetail={handleViewAssetDetail}
      onAssetClick={handleMapAssetClick}
      viewResetKey={mapViewResetKey}
      changeType={
        timeMode === 'Khoảng thời gian'
          ? changeType
          : 'Tất cả'
      }
      valuationRisk={valuationRisk}
    />
  </section>


  <section className="kpi-section">

  {/* =========================
      KPI 1 - SỐ TÀI SẢN
      ========================= */}
  <div className="kpi-card">
    <span>Số tài sản</span>

    {timeMode === 'Một kỳ' ? (
      <>
        <strong>
          {totalAssets}
        </strong>

        <small>
          Theo bộ lọc hiện tại
        </small>
      </>
    ) : (
      <>
        <strong>
          {comparisonFromTotalAssets}
          {' → '}
          {comparisonToTotalAssets}
        </strong>

        <small>
          Biến động:{' '}

          {comparisonToTotalAssets -
            comparisonFromTotalAssets >=
          0
            ? '+'
            : ''}

          {comparisonToTotalAssets -
            comparisonFromTotalAssets}
        </small>
      </>
    )}
  </div>


  {/* =========================
      KPI 2 - GIÁ TRỊ ĐỊNH GIÁ
      ========================= */}
  <div className="kpi-card">
    <span>Tổng GT định giá</span>

    {timeMode === 'Một kỳ' ? (
      <>
        <strong>
          {formatBillion(
            totalValuation
          )}
        </strong>

        <small>
          Theo bộ lọc hiện tại
        </small>
      </>
    ) : (
      <>
        <strong>
          {formatBillion(
            comparisonFromTotalValuation
          )}

          {' → '}

          {formatBillion(
            comparisonToTotalValuation
          )}
        </strong>

        <small>
          Biến động:{' '}

          {comparisonToTotalValuation -
            comparisonFromTotalValuation >=
          0
            ? '+'
            : ''}

          {formatBillion(
            comparisonToTotalValuation -
              comparisonFromTotalValuation
          )}
        </small>
      </>
    )}
  </div>


  {/* =========================
      KPI 3 - SỐ TSBĐ
      ========================= */}
  <div className="kpi-card">
    <span>Số TSBĐ</span>

    {timeMode === 'Một kỳ' ? (
      <>
        <strong>
          {totalCollateralAssets}
        </strong>

        <small>
          Đang bảo đảm
        </small>
      </>
    ) : (
      <>
        <strong>
          {comparisonFromTotalCollateralAssets}

          {' → '}

          {comparisonToTotalCollateralAssets}
        </strong>

        <small>
          Biến động:{' '}

          {comparisonToTotalCollateralAssets -
            comparisonFromTotalCollateralAssets >=
          0
            ? '+'
            : ''}

          {comparisonToTotalCollateralAssets -
            comparisonFromTotalCollateralAssets}
        </small>
      </>
    )}
  </div>


  {/* =========================
      KPI 4 - RỦI RO KÉO DÀI
      ========================= */}
  <div className={`kpi-card kpi-card-risk-persistent ${persistentRiskSummary.persistentAssets > 0 ? 'has-alert' : 'is-clear'}`}>
      <span>Rủi ro kéo dài</span>
    <strong>{persistentRiskSummary.persistentAssets}</strong>
    <small>
      {!persistentRiskSummary.available
        ? 'Cần tối thiểu 2 kỳ dữ liệu'
        : persistentRiskSummary.persistentAssets === 0
          ? 'Không có TS rủi ro ≥ 2 kỳ liên tiếp'
          : `⚠ Rủi ro ≥ 2 kỳ liên tiếp${persistentRiskSummary.threePlusAssets > 0 ? ` • ${persistentRiskSummary.threePlusAssets} TS ≥ 3 kỳ` : ''}`}
    </small>
  </div>


  {/* =========================
      KPI 5 - DƯ NỢ TSBĐ
      ========================= */}
  <div className="kpi-card">
    <span>Dư nợ TSBĐ</span>

    {timeMode === 'Một kỳ' ? (
      <>
        <strong>
          {formatBillion(
            totalCollateralDebt
          )}
        </strong>

        <small>
          Theo bộ lọc hiện tại
        </small>
      </>
    ) : (
      <>
        <strong>
          {formatBillion(
            comparisonFromTotalDebt
          )}

          {' → '}

          {formatBillion(
            comparisonToTotalDebt
          )}
        </strong>

        <small>
          Biến động:{' '}

          {comparisonToTotalDebt -
            comparisonFromTotalDebt >=
          0
            ? '+'
            : ''}

          {formatBillion(
            comparisonToTotalDebt -
              comparisonFromTotalDebt
          )}
        </small>
      </>
    )}
  </div>

</section>

</div>

<aside className="ai-panel">

 <div className="data-input-summary">
  <div className="data-input-title-row">
    <h2>Dữ liệu đầu vào</h2>

    <span
      className={`data-input-source ${
        excelImported
          ? 'is-excel'
          : 'is-mock'
      }`}
    >
      <span className="data-input-source-dot" />

      {excelImported
        ? 'EXCEL'
        : 'MOCK'}
    </span>
  </div>

  {excelImported ? (
    <>
      <div className="data-input-success">
        ✓ Đã nhập dữ liệu Excel
      </div>

      {importedExcelFileInfo && (
        <div className="data-input-file-name">
          {importedExcelFileInfo.fileName}
        </div>
      )}

      <button
        type="button"
        className="data-input-detail-button"
        onClick={() =>
          setShowInputDetails(
            (current) => !current
          )
        }
      >
        {showInputDetails
          ? 'Ẩn chi tiết'
          : 'Xem chi tiết'}
      </button>
    </>
  ) : (
    <>
      <div className="data-input-mock-status">
        Dữ liệu mẫu đang hoạt động
      </div>

      <label
        htmlFor="excel-file-input"
        className="data-input-file-button"
      >
        📂 Chọn file Excel

        <input
          id="excel-file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={handleExcelFileChange}
          style={{
            display: 'none',
          }}
        />
      </label>
    </>
  )}
</div>

  {excelFileInfo &&
  (!excelImported ||
    showInputDetails) && (
    <div
      style={{
        padding: '10px',
        border: '1px solid #cbd5e1',
        borderRadius: '8px',
        fontSize: '12px',
        background: '#f8fafc',
      }}
    >
      <div
        style={{
          fontWeight: '700',
          wordBreak: 'break-word',
          marginBottom: '8px',
        }}
      >
        <div
  style={{
    fontSize: '11px',
    fontWeight: '600',
    marginBottom: '4px',
  }}
>
  File đang kiểm tra:
</div>
        {excelFileInfo.fileName}
      </div>

      {canonicalExcelData && (
      <div
        style={{
          marginBottom: '8px',
          fontSize: '12px',
          lineHeight: '1.5',
        }}
      >
        <div
          style={{
            fontWeight: '700',
            marginBottom: '4px',
          }}
        >
          Đã chuẩn hóa:
        </div>

        <div>
          {canonicalExcelData.valuationAssets.length}{' '}
          tài sản
        </div>

        <div>
          {canonicalExcelData.valuationSnapshots.length}{' '}
          snapshot định giá
        </div>

        <div>
          {canonicalExcelData.collateralSnapshots.length}{' '}
          snapshot TSBĐ
        </div>

        <div>
          {canonicalExcelData.valuationRisks.length}{' '}
          rủi ro
        </div>

        <div>
          {canonicalExcelData.customers.length}{' '}
          khách hàng
        </div>

        <div>
          {canonicalExcelData.collateralCustomers.length}{' '}
          quan hệ TSBĐ-KH
        </div>
      </div>
    )}

    {excelReadyToImport ? (
        <div>
          <div
            style={{
              fontWeight: '700',
              marginBottom: '4px',
            }}
          >
            ✅ Dữ liệu hợp lệ
          </div>

          <div>
            ERROR: {totalExcelErrors}
            {' | '}
            WARNING: {totalExcelWarnings}
          </div>
        </div>
      ) : (
        <div>
          <div
            style={{
              fontWeight: '700',
              marginBottom: '4px',
            }}
          >
            ❌ Chưa thể Import
          </div>

          <div>
            ERROR: {totalExcelErrors}
            {' | '}
            WARNING: {totalExcelWarnings}
          </div>
        </div>
      )}

      {(totalExcelErrors > 0 ||
  totalExcelWarnings > 0) && (
  <button
    type="button"
    onClick={() =>
      setShowValidationDetails(
        !showValidationDetails
      )
    }
    style={{
      width: '100%',
      marginTop: '10px',
    }}
  >
    {showValidationDetails
      ? 'Ẩn chi tiết'
      : 'Xem chi tiết lỗi'}
  </button>
)}

{!excelImported && (
  <button
    type="button"
    onClick={handleRemoveSelectedExcel}
    style={{
      width: '100%',
      marginTop: '8px',
    }}
  >
    Bỏ file đã chọn
  </button>
)}

      {showValidationDetails && (
        <div
          style={{
            marginTop: '10px',
            paddingTop: '8px',
            borderTop:
              '1px solid #e2e8f0',
          }}
        >
          {excelStructureValidation?.results
            .filter(
              (item) =>
                item.status !== 'PASS'
            )
            .map((item) => (
              <div
                key={`sheet-${item.sheetName}`}
                style={{
                  marginBottom: '6px',
                }}
              >
                {item.status === 'ERROR'
                  ? '❌'
                  : '⚠️'}{' '}
                {item.sheetName}
                <div>{item.message}</div>
              </div>
            ))}

          {excelColumnValidation?.results
            .filter(
              (item) =>
                item.status !== 'PASS'
            )
            .map((item) => (
              <div
                key={`column-${item.sheetName}-${item.columnName}`}
                style={{
                  marginBottom: '6px',
                }}
              >
                ❌ {item.sheetName}
                {' → '}
                {item.columnName}
                <div>{item.message}</div>
              </div>
            ))}

          {valuationRowValidation?.results.map(
            (item, index) => (
              <div
                key={`row-${item.code}-${item.excelRow}-${index}`}
                style={{
                  marginBottom: '6px',
                }}
              >
                ❌ {item.code}
                {' | '}
                {item.sheetName}
                {' | '}
                Dòng {item.excelRow}
                {' | '}
                {item.columnName}

                <div>{item.message}</div>
              </div>
            )
          )}
        </div>
      )}

      {excelReadyToImport &&
        !excelImported && (
          <button
            type="button"
            onClick={handleImportExcel}
            style={{
              width: '100%',
              marginTop: '10px',
              fontWeight: '700',
            }}
          >
            Import dữ liệu
          </button>
        )}

      {excelImported && (
        <div
          style={{
            marginTop: '10px',
          }}
        >
          <div
            style={{
              fontWeight: '700',
              marginBottom: '8px',
            }}
          >
            ✅ Dữ liệu EXCEL đang hoạt động
          </div>

          <button
            type="button"
            onClick={handleClearImportedExcel}
            style={{
              width: '100%',
            }}
          >
            Xóa dữ liệu đã Import
          </button>
        </div>
      )}
    </div>
  )}

  {excelReadError && (
    <div
      style={{
        marginTop: '10px',
        fontSize: '12px',
      }}
    >
      ❌ {excelReadError}
    </div>
  )}

  <div className="ai-section-divider" />

 <div className="ai-panel-v2">
  <div className="ai-panel-header">
    <div>
      <div className="ai-panel-title">
        <span className="ai-panel-icon">
          ✦
        </span>

        <h2>Trợ lý AI</h2>
      </div>

      <p className="ai-description">
        Phân tích dữ liệu Tài sản / TSBĐ bằng ngôn ngữ tự nhiên.
      </p>
    </div>

    <span className="ai-ready-status">
      <span className="ai-ready-dot" />
      Sẵn sàng
    </span>
  </div>

  <div className="ai-tabs">
    <button
      type="button"
      className={
        aiTab === 'ASK'
          ? 'ai-tab active'
          : 'ai-tab'
      }
      onClick={() =>
        setAiTab('ASK')
      }
    >
      Hỏi AI
    </button>

    <button
      type="button"
      className={
        aiTab === 'SUGGESTIONS'
          ? 'ai-tab active'
          : 'ai-tab'
      }
      onClick={() =>
        setAiTab('SUGGESTIONS')
      }
    >
      Gợi ý phân tích
    </button>

    <button
      type="button"
      className={
        aiTab === 'HISTORY'
          ? 'ai-tab active'
          : 'ai-tab'
      }
      onClick={() =>
        setAiTab('HISTORY')
      }
    >
      Lịch sử
    </button>
  </div>

  {aiTab === 'ASK' && (
    <div className="ai-ask-tab">
      <div className="ai-question-row">
        <div className="ai-textarea-wrapper">
  <textarea
    placeholder="Nhập câu hỏi về tài sản, TSBĐ, dư nợ..."
    value={aiQuestion}
    onChange={(event) =>
      setAiQuestion(
        event.target.value
      )
    }
    disabled={aiLoading}
  />

  {aiQuestion && !aiLoading && (
    <button
      type="button"
      className="ai-clear-button"
      onClick={() => setAiQuestion('')}
      aria-label="Xóa câu hỏi"
      title="Xóa câu hỏi"
    >
      ×
    </button>
  )}
</div>
        <button
  type="button"
  className="ai-send-button"
  onClick={handleAskAI}
  disabled={
    aiLoading ||
    !aiQuestion.trim()
  }
  aria-label="Hỏi AI"
>
  {aiLoading ? (
  <span className="ai-send-spinner" />
) : (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M22 2L11 13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 2L15 22L11 13L2 9L22 2Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)}
</button>
      </div>
    </div>
  )}

  {aiTab === 'SUGGESTIONS' && (
  <div className="ai-suggestion-list">
    {aiSuggestions.map((suggestion) => (
      <button
        key={suggestion}
        type="button"
        className="ai-suggestion-item"
        onClick={() => {
          setAiQuestion(suggestion)
          setAiTab('ASK')
        }}
      >
        {suggestion}
      </button>
    ))}
  </div>
)}

  {aiTab === 'HISTORY' && (
  <div className="ai-history-list">
    {aiHistory.length === 0 ? (
      <div className="ai-tab-placeholder">
        Chưa có lịch sử câu hỏi trong phiên này.
      </div>
    ) : (
      aiHistory.map((item) => (
        <button
          key={item.id}
          type="button"
          className="ai-history-item"
          onClick={() => {
            setAiQuestion(item.question)
            setAiTab('ASK')
          }}
        >
          <strong>{item.question}</strong>

          <span>
            {item.answer}
          </span>
        </button>
      ))
    )}
  </div>
)}
</div>

{aiError && (
  <div
    style={{
      marginTop: '10px',
      padding: '10px',
      border: '1px solid #fecaca',
      borderRadius: '8px',
      background: '#fef2f2',
      fontSize: '12px',
      lineHeight: '1.5',
    }}
  >
    ❌ {aiError}
  </div>
)}

{aiJobs.length > 0 && (
  <div
    className="ai-jobs-list"
  >
    {aiJobs.map((job, index) => {
      const data =
        job.result?.data

      const steps =
        job.queryPlan?.steps || []

      const aggregateStep =
        steps.find(
          (step) =>
            step.action === 'AGGREGATE'
        )

      const groupStep =
        steps.find(
          (step) =>
            step.action === 'GROUP_BY'
        )

      const lookupStep =
        steps.find(
          (step) =>
            step.action === 'LOOKUP'
        )

      const answerIntent =
        job.queryPlan?.answerContext?.intent

      const compareStep =
        steps.find(
          (step) =>
            step.action === 'COMPARE'
        )

      return (
        <div
          key={job.id}
          className="ai-result-card"
        >
          <div className="ai-result-header">
            <div>
              <span className="ai-result-kicker">
                Câu {index + 1}
              </span>

              <h3
                style={{
                  fontSize: '14px',
                  lineHeight: '1.45',
                }}
              >
                {job.question}
              </h3>
            </div>

            <span className="ai-result-status">
              {job.status === 'SUCCESS'
                ? '✓ Hoàn tất'
                : job.status === 'ERROR'
                ? '✕ Lỗi'
                : job.status ===
                  'PROCESSING'
                ? '⏳ Đang xử lý'
                : '○ Đang chờ'}
            </span>
          </div>

          {job.status ===
            'PENDING' && (
            <div className="ai-answer-summary">
              Đang chờ xử lý...
            </div>
          )}

          {job.status ===
            'PROCESSING' && (
            <div className="ai-answer-summary">
              Đang phân tích câu hỏi...
            </div>
          )}

          {job.status ===
            'ERROR' && (
            <div
              style={{
                padding: '10px',
                border:
                  '1px solid #fecaca',
                borderRadius: '8px',
                background: '#fef2f2',
                fontSize: '12px',
                lineHeight: '1.5',
              }}
            >
              ❌{' '}
              {job.error ||
                'Không thể xử lý câu hỏi này.'}
            </div>
          )}

          {job.status ===
            'SUCCESS' && (
            <>
          <div className="ai-answer-summary ai-answer-summary--structured">
                  {renderAiAnswer(job.answer)}
                </div>

              {/*
                ==========================
                GROUP BY / TOP N
                ==========================
              */}
              {Array.isArray(data) &&
                data.length > 0 &&
                groupStep &&
                aggregateStep && (
                  <div className="ai-table-wrapper">
                    <table className="ai-result-table">
                      <thead>
                        <tr>
                          <th>
                            {groupStep.field ===
                            'province'
                              ? 'Tỉnh/Thành phố'
                              : groupStep.field ===
                                'assetGroup'
                              ? 'Nhóm tài sản'
                              : groupStep.field ===
                                'valuationUnit'
                              ? 'Đơn vị định giá'
                              : groupStep.field ===
                                'assetType'
                              ? 'Loại tài sản'
                              : groupStep.field ===
                                'valuationRisk'
                              ? 'Loại rủi ro'
                              : groupStep.field ===
                                'queryPeriod'
                              ? 'Kỳ báo cáo'
                              : 'Nhóm'}
                          </th>

                          <th>
                            {aggregateStep.metric ===
                            'TOTAL_DEBT'
                              ? 'Dư nợ TSBĐ'
                              : aggregateStep.metric ===
                                'TOTAL_VALUATION'
                              ? 'GT định giá'
                              : aggregateStep.metric ===
                                'TOTAL_COLLATERAL'
                              ? 'GT bảo đảm'
                              : 'Số lượng'}
                          </th>

                          <th>
                            Số bản ghi
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {data.map(
                          (item) => (
                            <tr
                              key={
                                item.key
                              }
                            >
                              <td>
                                <strong>
                                  {groupStep.field === 'queryPeriod'
                                    ? item.key
                                    : item.key}
                                </strong>
                              </td>

                              <td>
                                {aggregateStep.metric ===
                                  'TOTAL_DEBT' ||
                                aggregateStep.metric ===
                                  'TOTAL_VALUATION' ||
                                aggregateStep.metric ===
                                  'TOTAL_COLLATERAL'
                                  ? formatBillion(
                                      item.value
                                    )
                                  : item.value}
                              </td>

                              <td>
                                {item.recordCount ??
                                  '-'}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

              {/*
                ==========================
                AGGREGATE ĐƠN
                ==========================
              */}
              {data &&
                !Array.isArray(data) &&
                aggregateStep && (
                  <div className="ai-table-wrapper">
                    <table className="ai-result-table">
                      <tbody>
                        <tr>
                          <th>
                            Chỉ tiêu
                          </th>
                          <th>
                            Kết quả
                          </th>
                        </tr>

                        <tr>
                          <td>
                            {aggregateStep.metric ===
                              'TOTAL_DEBT'
                                ? 'Dư nợ TSBĐ'
                                : aggregateStep.metric ===
                                  'TOTAL_VALUATION'
                                ? 'Tổng GT định giá'
                                : aggregateStep.metric ===
                                  'TOTAL_COLLATERAL'
                                ? 'Số TSBĐ'
                                : 'Số lượng'}
                          </td>

                          <td>
                            <strong>
                              {aggregateStep.metric ===
                                'TOTAL_DEBT' ||
                              aggregateStep.metric ===
                                'TOTAL_VALUATION'
                                ? formatBillion(
                                    data.value
                                  )
                                : data.value}
                            </strong>
                          </td>
                        </tr>

                        {data.recordCount !==
                          undefined && (
                          <tr>
                            <td>
                              Số bản ghi
                            </td>
                            <td>
                              {
                                data.recordCount
                              }
                            </td>
                          </tr>
                        )}

                        <tr>
                          <td>
                            Kỳ báo cáo
                          </td>

                          <td>
                            {
                              job.result
                                ?.timeContext
                                ?.period
                            }
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

              {/*
                ==========================
                COMPARE
                ==========================
              */}
              {compareStep &&
                data &&
                !Array.isArray(data) &&
                !aggregateStep && (
                  <div className="ai-table-wrapper">
                    <table className="ai-result-table">
                      <thead>
                        <tr>
                          <th>
                            Chỉ tiêu
                          </th>
                          <th>
                            Đầu kỳ
                          </th>
                          <th>
                            Cuối kỳ
                          </th>
                          <th>
                            Biến động
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        <tr>
                          <td>
                            {
                              compareStep.field
                            }
                          </td>

                          <td>
                            {data.fromValue ===
                              null ||
                            data.fromValue ===
                              undefined
                              ? 'Chưa có dữ liệu'
                              : formatBillion(
                                  data.fromValue
                                )}
                          </td>

                          <td>
                            {data.toValue ===
                              null ||
                            data.toValue ===
                              undefined
                              ? 'Chưa có dữ liệu'
                              : formatBillion(
                                  data.toValue
                                )}
                          </td>

                          <td>
                            {data.difference ===
                              null ||
                            data.difference ===
                              undefined ? (
                              'Chưa xác định'
                            ) : (
                              <strong>
                                {data.difference >=
                                0
                                  ? '+'
                                  : ''}

                                {formatBillion(
                                  data.difference
                                )}
                              </strong>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

              {/*
                ==========================
                LOOKUP
                ==========================
              */}
              {lookupStep &&
                Array.isArray(data) &&
                data.length > 0 &&
                !groupStep && (
                  <div className="ai-table-wrapper">
                    <table className="ai-result-table">
                      <tbody>
                        <tr>
                          <th>
                            Mã tài sản
                          </th>
                          <td>
                            {data[0]
                              .maTsDg ??
                              '-'}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Tên tài sản
                          </th>
                          <td>
                            {data[0]
                              .tenTaiSan ??
                              data[0]
                                .moTaTs ??
                              '-'}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Loại tài sản
                          </th>
                          <td>
                            {data[0]
                              .loaiTsCap2 ??
                              '-'}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Tỉnh/Thành phố
                          </th>
                          <td>
                            {data[0]
                              .tinhTp ??
                              '-'}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            GT định giá
                          </th>
                          <td>
                            {data[0]
                              .gtDinhGia !==
                              null &&
                            data[0]
                              .gtDinhGia !==
                              undefined
                              ? formatBillion(
                                  data[0]
                                    .gtDinhGia
                                )
                              : '-'}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Mã TSBĐ
                          </th>
                          <td>
                            {data[0]
                              .maTsbd ??
                              '-'}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            Dư nợ
                          </th>
                          <td>
                            {data[0]
                              .duNoTsbd !==
                              null &&
                            data[0]
                              .duNoTsbd !==
                              undefined
                              ? formatBillion(
                                  data[0]
                                    .duNoTsbd
                                )
                              : '-'}
                          </td>
                        </tr>

                        <tr>
                          <th>
                            LTV
                          </th>
                          <td>
                            {data[0].ltv !==
                              null &&
                            data[0].ltv !==
                              undefined
                              ? `${(
                                  data[0]
                                    .ltv *
                                  100
                                ).toFixed(
                                  1
                                )}%`
                              : '-'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

              {/*
                ==========================
                LIST - KẾT QUẢ LIỆT KÊ
                ==========================
                Luôn trình bày dạng bảng để người dùng có thể đọc/đối chiếu
                thay vì một đoạn văn dài. Chỉ render 100 dòng đầu để giữ UI mượt.
              */}
              {answerIntent === 'LIST' &&
                Array.isArray(data) &&
                data.length > 0 &&
                !groupStep &&
                !lookupStep && (
                  <div className="ai-table-wrapper">
                    <div className="ai-list-table-note">
                      {data.length > 100
                        ? `Có ${data.length} kết quả · hiển thị 100 dòng đầu`
                        : `${data.length} kết quả`}
                    </div>
                    <table className="ai-result-table">
                      <thead>
                        <tr>
                          <th>Mã TS</th>
                          <th>Tên tài sản</th>
                          <th>Loại TS</th>
                          <th>Tỉnh/TP</th>
                          <th>GT định giá</th>
                          <th>Mã TSBĐ</th>
                          <th>Dư nợ</th>
                          <th>Rủi ro</th>
                          <th>Kỳ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.slice(0, 100).map((item, rowIndex) => (
                          <tr
                            key={`${item.maTsDg || 'row'}-${item.queryPeriod || rowIndex}-${rowIndex}`}
                            className={Array.isArray(item.risks) && item.risks.length > 0 ? 'ai-risk-row' : ''}
                          >
                            <td>
                              <strong className={Array.isArray(item.risks) && item.risks.length > 0 ? 'risk-asset-code' : ''}>
                                {item.maTsDg || '-'}
                              </strong>
                              {persistentRiskById.has(item.maTsDg) && (
                                <span className="persistent-risk-badge">
                                  ⚠ ≥{persistentRiskById.get(item.maTsDg).consecutivePeriods} kỳ
                                </span>
                              )}
                            </td>
                            <td>{item.tenTaiSan || item.moTaTs || '-'}</td>
                            <td>{item.loaiTsCap2 || item.nhomTsCap1 || '-'}</td>
                            <td>{item.tinhTp || '-'}</td>
                            <td>
                              {item.gtDinhGia !== null && item.gtDinhGia !== undefined
                                ? formatBillion(item.gtDinhGia)
                                : '-'}
                            </td>
                            <td>{item.maTsbd || '-'}</td>
                            <td>
                              {item.duNoTsbd !== null && item.duNoTsbd !== undefined
                                ? formatBillion(item.duNoTsbd)
                                : '-'}
                            </td>
                            <td>
                              {Array.isArray(item.risks) && item.risks.length > 0
                                ? [...new Set(item.risks.map((risk) => risk.loaiRuiRo).filter(Boolean))].join(', ')
                                : '-'}
                            </td>
                            <td>{item.queryPeriod || job.result?.timeContext?.period || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              <details className="ai-technical-details">
                <summary>
                  Chi tiết truy vấn kỹ thuật
                </summary>

                <div className="ai-technical-block">
                  <div className="ai-technical-title">
                    Query Plan
                  </div>

                  <pre>
                    {JSON.stringify(
                      job.queryPlan,
                      null,
                      2
                    )}
                  </pre>

                  <div className="ai-technical-title">
                    Metadata
                  </div>

                  <pre>
                    {JSON.stringify(
                      job.result
                        ?.metadata,
                      null,
                      2
                    )}
                  </pre>

                  {job.durationMs !==
                    undefined && (
                    <>
                      <div className="ai-technical-title">
                        Thời gian xử lý
                      </div>

                      <div>
                        {job.durationMs}{' '}
                        ms
                      </div>
                    </>
                  )}
                </div>
              </details>
            </>
          )}
        </div>
      )
    })}
  </div>
)}
        </aside>
      </section>

      
      <section className="table-section">
  <div className="table-header">
  <div>
    <h2>
      {timeMode === 'Một kỳ'
        ? 'Chi tiết tài sản'
        : 'Chi tiết biến động tài sản'}
    </h2>

    <p>
      {timeMode === 'Một kỳ'
        ? 'Danh sách đồng bộ với Map và bộ lọc.'
        : `So sánh ${fromPeriod} → ${toPeriod}`}
    </p>
  </div>

  <div className="table-header-actions">
    <div className="asset-search">
      <span className="asset-search-icon">
        ⌕
      </span>

      <input
        type="text"
        value={searchText}
        onChange={(event) =>
          setSearchText(event.target.value)
        }
        placeholder="Tìm kiếm mã TS, mã TSBĐ, tỉnh/thành phố..."
      />

      {searchText && (
        <button
          type="button"
          className="asset-search-clear"
          onClick={() =>
            setSearchText('')
          }
          aria-label="Xóa tìm kiếm"
        >
          ×
        </button>
      )}
    </div>

    <span className="table-result-count">
      {timeMode === 'Một kỳ'
        ? `${mapFilteredAssets.length} tài sản${
            mapFilteredAssets.length > TABLE_RENDER_LIMIT
              ? ` · hiển thị ${TABLE_RENDER_LIMIT}`
              : ''
          }`
        : `${mapFilteredComparisonAssets.length} tài sản${
            mapFilteredComparisonAssets.length > TABLE_RENDER_LIMIT
              ? ` · hiển thị ${TABLE_RENDER_LIMIT}`
              : ''
          }`}
    </span>
  </div>
</div>

  {mapFilterAssetIds &&
    mapFilterAssetIds.length > 0 && (
      <div className="map-filter-banner">
        <span className="map-filter-banner-text">
          Đang lọc theo bản đồ:{' '}
          <strong>
            {mapFilterAssetIds.length === 1
              ? mapFilterAssetIds[0]
              : `${mapFilterAssetIds.length} tài sản`}
          </strong>
        </span>

        <button
          type="button"
          className="map-filter-banner-clear"
          onClick={handleClearMapFilter}
        >
          Xóa lọc
        </button>
      </div>
    )}

  {detailAsset ? (
    <div
      className="asset-detail-view"
      id="asset-detail-view"
    >
      <div className="asset-detail-header">
        <div>
          <div className="asset-detail-title">
            Chi tiết tài sản
          </div>

          <div className="asset-detail-asset">
            <strong>{detailAsset.maTsDg}</strong>
            <span>
              {detailAsset.loaiTsCap2} ·{' '}
              {detailAsset.tinhTp}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="asset-detail-back"
          onClick={handleCloseDetail}
        >
          ← Quay lại
        </button>
      </div>

      <div className="asset-detail-grid">
        <section className="asset-detail-card">
          <h4>Thông tin tài sản</h4>

          <dl className="asset-detail-rows">
            <div>
              <dt>Mã tài sản</dt>
              <dd>{detailAsset.maTsDg}</dd>
            </div>

            {detailAsset.tenTaiSan && (
              <div>
                <dt>Tên tài sản</dt>
                <dd>{detailAsset.tenTaiSan}</dd>
              </div>
            )}

            {detailAsset.nhomTsCap1 && (
              <div>
                <dt>Nhóm TS</dt>
                <dd>{detailAsset.nhomTsCap1}</dd>
              </div>
            )}

            {detailAsset.loaiTsCap2 && (
              <div>
                <dt>Loại TS</dt>
                <dd>{detailAsset.loaiTsCap2}</dd>
              </div>
            )}

            <div>
              <dt>Tỉnh/Thành phố</dt>
              <dd>{detailAsset.tinhTp || '-'}</dd>
            </div>

            {detailAsset.diaChiChiTiet && (
              <div>
                <dt>Địa chỉ</dt>
                <dd>{detailAsset.diaChiChiTiet}</dd>
              </div>
            )}

            {detailAsset.tenKhachHang && (
              <div>
                <dt>Khách hàng</dt>
                <dd>{detailAsset.tenKhachHang}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="asset-detail-card">
          <h4>Định giá</h4>

          <dl className="asset-detail-rows">
            <div>
              <dt>Giá trị định giá</dt>
              <dd className="asset-detail-highlight">
                {formatBillion(detailAsset.gtDinhGia)}
              </dd>
            </div>

            {detailAsset.donViDinhGia && (
              <div>
                <dt>Đơn vị định giá</dt>
                <dd>{detailAsset.donViDinhGia}</dd>
              </div>
            )}

            {detailAsset.ngayDinhGia && (
              <div>
                <dt>Ngày định giá</dt>
                <dd>{detailAsset.ngayDinhGia}</dd>
              </div>
            )}

            {detailAsset.gtBaoDam !== undefined && (
              <div>
                <dt>Giá trị bảo đảm</dt>
                <dd>{formatBillion(detailAsset.gtBaoDam)}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="asset-detail-card">
          <h4>TSBĐ</h4>

          <dl className="asset-detail-rows">
            <div>
              <dt>Mã TSBĐ</dt>
              <dd>{detailAsset.maTsbd || '-'}</dd>
            </div>

            <div>
              <dt>Trạng thái TSBĐ</dt>
              <dd>{detailAsset.trangThaiTsbd || '-'}</dd>
            </div>

            {detailAsset.ngayNhanTsbd && (
              <div>
                <dt>Ngày nhận TSBĐ</dt>
                <dd>{detailAsset.ngayNhanTsbd}</dd>
              </div>
            )}

            {detailAsset.ngayGiaiChap && (
              <div>
                <dt>Ngày giải chấp</dt>
                <dd>{detailAsset.ngayGiaiChap}</dd>
              </div>
            )}

            {detailAsset.donViQuanLy && (
              <div>
                <dt>Đơn vị quản lý</dt>
                <dd>{detailAsset.donViQuanLy}</dd>
              </div>
            )}

            {detailAsset.thanhKhoan && (
              <div>
                <dt>Thanh khoản</dt>
                <dd>{detailAsset.thanhKhoan}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="asset-detail-card">
          <h4>Dư nợ</h4>

          <dl className="asset-detail-rows">
            <div>
              <dt>Dư nợ TSBĐ</dt>
              <dd>
                {detailAsset.duNoTsbd
                  ? formatBillion(detailAsset.duNoTsbd)
                  : '-'}
              </dd>
            </div>

            <div>
              <dt>LTV</dt>
              <dd>
                {detailAsset.ltv !== null
                  ? `${(detailAsset.ltv * 100).toFixed(1)}%`
                  : '-'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="asset-detail-card">
          <h4>Rủi ro</h4>

          {Array.isArray(detailAsset.risks) &&
          detailAsset.risks.length > 0 ? (
            <ul className="asset-detail-risk-list">
              {detailAsset.risks.map((risk) => (
                <li key={risk.maRuiRo}>
                  <strong>{risk.loaiRuiRo}</strong>
                  {risk.ghiChu && (
                    <span>{risk.ghiChu}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="asset-detail-empty">
              Không phát hiện rủi ro
            </p>
          )}

          {persistentRiskById.has(
            detailAsset.maTsDg
          ) && (
            <div className="asset-detail-warning">
              ⚠ Rủi ro kéo dài ≥{' '}
              {
                persistentRiskById.get(
                  detailAsset.maTsDg
                ).consecutivePeriods
              }{' '}
              kỳ liên tiếp
            </div>
          )}
        </section>

        <section className="asset-detail-card">
          <h4>Lịch sử theo kỳ</h4>

          {timeMode === 'Khoảng thời gian' ? (
            (() => {
              const cmpItem =
                filteredComparisonAssets.find(
                  (item) =>
                    item.maTsDg ===
                    detailAsset.maTsDg
                )

              if (!cmpItem) {
                return (
                  <p className="asset-detail-empty">
                    Chưa có dữ liệu
                  </p>
                )
              }

              return (
                <dl className="asset-detail-rows">
                  <div>
                    <dt>GT đầu kỳ</dt>
                    <dd>
                      {cmpItem.fromAsset
                        ? formatBillion(
                            cmpItem.fromValuation
                          )
                        : '-'}
                    </dd>
                  </div>

                  <div>
                    <dt>GT cuối kỳ</dt>
                    <dd>
                      {cmpItem.toAsset
                        ? formatBillion(
                            cmpItem.toValuation
                          )
                        : '-'}
                    </dd>
                  </div>

                  <div>
                    <dt>Biến động GT</dt>
                    <dd
                      className={
                        cmpItem.valuationChange > 0
                          ? 'asset-change-up'
                          : cmpItem.valuationChange < 0
                            ? 'asset-change-down'
                            : ''
                      }
                    >
                      {`${cmpItem.valuationChange >= 0 ? '+' : ''}${formatBillion(cmpItem.valuationChange)}`}
                    </dd>
                  </div>

                  <div>
                    <dt>Dư nợ đầu kỳ</dt>
                    <dd>
                      {cmpItem.fromCollateralSnapshot
                        ? formatBillion(
                            cmpItem.fromDebt
                          )
                        : '-'}
                    </dd>
                  </div>

                  <div>
                    <dt>Dư nợ cuối kỳ</dt>
                    <dd>
                      {cmpItem.toCollateralSnapshot
                        ? formatBillion(
                            cmpItem.toDebt
                          )
                        : '-'}
                    </dd>
                  </div>

                  <div>
                    <dt>Biến động dư nợ</dt>
                    <dd
                      className={
                        cmpItem.debtChange > 0
                          ? 'asset-change-up'
                          : cmpItem.debtChange < 0
                            ? 'asset-change-down'
                            : ''
                      }
                    >
                      {`${cmpItem.debtChange >= 0 ? '+' : ''}${formatBillion(cmpItem.debtChange)}`}
                    </dd>
                  </div>

                  {cmpItem.changeStatus && (
                    <div>
                      <dt>Trạng thái biến động</dt>
                      <dd>{cmpItem.changeStatus}</dd>
                    </div>
                  )}
                </dl>
              )
            })()
          ) : (
            <p className="asset-detail-empty">
              Chưa có dữ liệu
            </p>
          )}
        </section>
      </div>
    </div>
  ) : (
  <div className="table-wrapper">
    {timeMode === 'Một kỳ' ? (
      <table>
        <thead>
          <tr>
            <th>Mã TS</th>
            <th>Tỉnh/TP</th>
            <th>GT định giá</th>
            <th>Trạng thái</th>
            <th>Xem thêm</th>
          </tr>
        </thead>

        <tbody>
          {tableAssets.map((asset) => (
            <tr
              key={asset.maTsDg}
              id={`asset-row-${asset.maTsDg}`}
              onClick={() =>
  handleSelectAssetFromTable(asset.maTsDg)
}
              className={[
                selectedAssetId === asset.maTsDg ? 'selected-table-row' : '',
                Array.isArray(asset.risks) && asset.risks.length > 0 ? 'risk-table-row' : '',
                persistentRiskById.has(asset.maTsDg) ? 'persistent-risk-table-row' : '',
              ].filter(Boolean).join(' ')}
            >
              <td>
                <span className={Array.isArray(asset.risks) && asset.risks.length > 0 ? 'risk-asset-code' : ''}>
                  {asset.maTsDg}
                </span>
                {persistentRiskById.has(asset.maTsDg) && (
                  <span className="persistent-risk-badge">
                    ⚠ ≥{persistentRiskById.get(asset.maTsDg).consecutivePeriods} kỳ
                  </span>
                )}
              </td>
              <td>{asset.tinhTp}</td>

              <td>
                {formatBillion(asset.gtDinhGia)}
              </td>

              <td>
                {persistentRiskById.has(asset.maTsDg) ? (
                  <span className="change-status status-down">
                    Rủi ro kéo dài
                  </span>
                ) : Array.isArray(asset.risks) &&
                  asset.risks.length > 0 ? (
                  <span className="change-status status-down">
                    Có rủi ro
                  </span>
                ) : (
                  <span className="change-status status-stable">
                    Bình thường
                  </span>
                )}
              </td>

              <td>
                <button
                  type="button"
                  className="row-detail-button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleOpenDetail(asset)
                  }}
                >
                  Xem thêm
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <table>
        <thead>
          <tr>
            <th>Mã TS</th>
            <th>Tỉnh/TP</th>
            <th>GT đầu kỳ</th>
            <th>GT cuối kỳ</th>
            <th>Biến động GT</th>
            <th>Trạng thái</th>
            <th>Xem thêm</th>
          </tr>
        </thead>

        <tbody>
          {sliceForTable(mapFilteredComparisonAssets).map((item) => (
  <tr
    key={item.maTsDg}
    id={`asset-row-${item.maTsDg}`}
    onClick={() =>
  handleSelectAssetFromTable(item.maTsDg)
}
    className={
      selectedAssetId === item.maTsDg
        ? 'selected-table-row'
        : ''
    }
  >
              <td>{item.maTsDg}</td>

              <td>
                {item.toAsset?.tinhTp ??
                  item.fromAsset?.tinhTp ??
                  '-'}
              </td>

              <td>
                {item.fromAsset
                  ? formatBillion(item.fromValuation)
                  : '-'}
              </td>

              <td>
                {item.toAsset
                  ? formatBillion(item.toValuation)
                  : '-'}
              </td>

              <td>
                {item.valuationChange >= 0 ? '+' : ''}
                {formatBillion(item.valuationChange)}
              </td>

<td>
  {(() => {
    const displayStatus =
      changeType === 'Phát sinh rủi ro mới'
        ? 'Phát sinh rủi ro mới'
        : changeType ===
          'Phát sinh rủi ro trong khoảng'
        ? 'Phát sinh rủi ro trong khoảng'
        : item.changeStatus

    const statusClass =
      displayStatus === 'Phát sinh mới' ||
      displayStatus === 'Phát sinh TSBĐ' ||
      displayStatus ===
        'Phát sinh rủi ro mới' ||
      displayStatus ===
        'Phát sinh rủi ro trong khoảng'
        ? 'status-new'
        : displayStatus ===
            'Tăng GT định giá'
        ? 'status-up'
        : displayStatus ===
            'Giảm GT định giá'
        ? 'status-down'
        : displayStatus ===
            'Đã giải chấp' ||
          displayStatus ===
            'Không còn xuất hiện trong nguồn' ||
          displayStatus ===
            'Không còn cuối kỳ'
        ? 'status-release'
        : 'status-stable'

    const statusLabel =
      displayStatus === 'Phát sinh mới'
        ? 'Tài sản phát sinh mới'
        : displayStatus

    return (
      <span
        className={`change-status ${statusClass}`}
      >
        {statusLabel}
      </span>
    )
  })()}
</td>

              <td>
                <button
                  type="button"
                  className="row-detail-button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleOpenDetail(
                      item.toAsset ?? item.fromAsset
                    )
                  }}
                >
                  Xem thêm
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
  )}
</section>

<footer className="gn-footer">
  <div className="gn-footer-main">
    <div className="gn-footer-brand">
      <img
        src={tsbdLogo}
        alt="MSB - Trung tâm Định giá & Quản lý TSBĐ"
        className="gn-footer-logo"
      />

      <div>
        <div className="gn-footer-unit">
          Trung tâm Định giá & Quản lý TSBĐ
        </div>

        <div className="gn-footer-slogan">
          Kết nối dữ liệu – Nhận diện rủi ro – Hỗ trợ ra quyết định
        </div>
      </div>
    </div>

    <div className="gn-footer-links">
      <div className="gn-footer-link">
        <span className="gn-footer-icon">▣</span>
        <span>Hướng dẫn sử dụng</span>
      </div>

      <div className="gn-footer-link">
        <span className="gn-footer-icon">◫</span>
        <span>Gửi phản hồi</span>
      </div>

      <div className="gn-footer-link">
        <span className="gn-footer-icon">◉</span>
        <span>Liên hệ hỗ trợ: longtk1@msb.com.vn</span>
      </div>
    </div>

    <div className="gn-footer-status">
      <div>Phiên bản: V2.6.7</div>
      <div>Dữ liệu cập nhật: 09/2026</div>

      <div className="gn-footer-online">
        <span className="gn-footer-online-dot" />
        Hệ thống đang hoạt động
      </div>
    </div>

    <div className="gn-footer-policy">
      <div>Chính sách bảo mật</div>
      <div>Điều khoản sử dụng</div>
    </div>
  </div>

  <div className="gn-footer-bottom">
  <span>
  © 2026 MSB · Hệ thống sử dụng nội bộ · Phạm vi dữ liệu hiển thị phụ thuộc quyền truy cập của người dùng.
  {' '}· Sản phẩm do team LongTK1 & NhanNT31 thực hiện.
</span>

    <span className="gn-footer-motto">
      Cùng tiến xa hơn
    </span>
  </div>
</footer>

    </div>
  )
}

export default App