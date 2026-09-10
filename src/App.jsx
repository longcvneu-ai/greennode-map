import { useState } from 'react'
import './App.css'
import {
  getAssetsByReportingPeriod,
  getReportingPeriods,
  getCollateralSnapshotByPeriodAndAsset,
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

import tsbdLogo from './assets/tsbd-logo.png'

function App() {
    
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
  const [selectedAssetId, setSelectedAssetId] = useState(null)

  const [filterOpen, setFilterOpen] =
  useState(false)

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
  const activeDataset =
  importedExcelData || undefined

const reportingPeriods =
  getReportingPeriods(
    activeDataset
  )
  const periodAssets =
  getAssetsByReportingPeriod(
    reportingPeriod,
    activeDataset
  )

const fromPeriodAssets =
  getAssetsByReportingPeriod(
    fromPeriod,
    activeDataset
  )

const toPeriodAssets =
  getAssetsByReportingPeriod(
    toPeriod,
    activeDataset
  )
  const baseAssets =
  timeMode === 'Một kỳ'
    ? periodAssets
    : toPeriodAssets

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

const matchesRiskFilter = (asset) => {
  if (valuationRisk === 'Tất cả') {
    return true
  }

  if (valuationRisk === 'Không phát hiện') {
    return asset.risks.length === 0
  }

  return asset.risks.some(
    (risk) => risk.loaiRuiRo === valuationRisk
  )
}

/*
  MỘT KỲ:
  áp dụng cả bộ lọc thông thường + bộ lọc rủi ro.
*/
const filteredAssets =
  timeMode === 'Một kỳ'
    ? periodAssets.filter(
        (asset) =>
          matchesBaseFilters(asset) &&
          matchesRiskFilter(asset)
      )
    : toPeriodAssets.filter(matchesBaseFilters)

/*
  KHOẢNG THỜI GIAN:
  chưa lọc rủi ro ở đây.

  Lý do:
  phải giữ được tài sản ở cả đầu kỳ và cuối kỳ
  trước khi so sánh rủi ro.
*/
const filteredFromPeriodAssets =
  timeMode === 'Khoảng thời gian'
    ? fromPeriodAssets.filter(matchesBaseFilters)
    : []

/*
  Các kỳ nằm trong khoảng người dùng lựa chọn.
*/
const periodsInRange = reportingPeriods.filter(
  (period) =>
    period >= fromPeriod &&
    period <= toPeriod
)

/*
  Tạo dữ liệu của từng kỳ trong khoảng.

  Ví dụ:
  30/06 → danh sách tài sản
  31/07 → danh sách tài sản
  31/08 → danh sách tài sản
*/
const assetsByPeriodInRange =
  timeMode === 'Khoảng thời gian'
    ? periodsInRange.map((period) => ({
        period,
        assets:
  getAssetsByReportingPeriod(
    period,
    activeDataset
  ).filter(
    matchesBaseFilters
  ),
      }))
    : []

const totalAssets = filteredAssets.length

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

const fromTotalAssets =
  filteredFromPeriodAssets.length

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

const comparisonAssets =
  timeMode === 'Khoảng thời gian'
    ? [
        ...new Set([
          ...filteredFromPeriodAssets.map(
            (asset) => asset.maTsDg
          ),
          ...filteredAssets.map(
            (asset) => asset.maTsDg
          ),
        ]),
      ].map((maTsDg) => {
        const fromAsset =
          filteredFromPeriodAssets.find(
            (asset) => asset.maTsDg === maTsDg
          )

        const toAsset =
          filteredAssets.find(
            (asset) => asset.maTsDg === maTsDg
          )
          const fromCollateralSnapshot =
  getCollateralSnapshotByPeriodAndAsset(
    maTsDg,
    fromPeriod,
    activeDataset
  )

const toCollateralSnapshot =
  getCollateralSnapshotByPeriodAndAsset(
    maTsDg,
    toPeriod,
    activeDataset
  )

        const fromValuation =
          fromAsset?.gtDinhGia ?? 0

        const toValuation =
          toAsset?.gtDinhGia ?? 0

        const valuationChange =
          toValuation - fromValuation

        const fromDebt =
  fromCollateralSnapshot?.duNoTsbd ??
  fromAsset?.duNoTsbd ??
  0

const toDebt =
  toCollateralSnapshot?.duNoTsbd ??
  toAsset?.duNoTsbd ??
  0

        const debtChange =
          toDebt - fromDebt

        /*
          ===== RỦI RO ĐẦU KỲ =====
        */
        const fromRiskTypes = new Set(
          (fromAsset?.risks ?? []).map(
            (risk) => risk.loaiRuiRo
          )
        )

        /*
          ===== RỦI RO CUỐI KỲ =====
        */
        const toRiskTypes = new Set(
          (toAsset?.risks ?? []).map(
            (risk) => risk.loaiRuiRo
          )
        )

        /*
          Những loại rủi ro có ở cuối kỳ
          nhưng đầu kỳ chưa có.
        */
        const newRiskTypesAtEnd = [
          ...toRiskTypes,
        ].filter(
          (riskType) =>
            !fromRiskTypes.has(riskType)
        )

        /*
          ===== RỦI RO PHÁT SINH TRONG KHOẢNG =====

          So sánh từng kỳ với kỳ ngay trước nó.

          Ví dụ:
          30/06: []
          31/07: [Định giá cao]
          31/08: []

          => Định giá cao được ghi nhận là
             rủi ro phát sinh trong khoảng.
        */
        const riskTypesOccurredInRange =
          new Set()

        for (
          let index = 1;
          index < assetsByPeriodInRange.length;
          index += 1
        ) {
          const previousPeriod =
            assetsByPeriodInRange[index - 1]

          const currentPeriod =
            assetsByPeriodInRange[index]

          const previousAsset =
            previousPeriod.assets.find(
              (asset) =>
                asset.maTsDg === maTsDg
            )

          const currentAsset =
            currentPeriod.assets.find(
              (asset) =>
                asset.maTsDg === maTsDg
            )

          const previousRiskTypes = new Set(
            (previousAsset?.risks ?? []).map(
              (risk) => risk.loaiRuiRo
            )
          )

          const currentRiskTypes =
            (currentAsset?.risks ?? []).map(
              (risk) => risk.loaiRuiRo
            )

          currentRiskTypes.forEach(
            (riskType) => {
              if (
                !previousRiskTypes.has(riskType)
              ) {
                riskTypesOccurredInRange.add(
                  riskType
                )
              }
            }
          )
        }

        let changeStatus =
  'Không thay đổi'

const fromCollateralActive =
  fromCollateralSnapshot?.trangThaiTsbd ===
  'Đang bảo đảm'

const toCollateralActive =
  toCollateralSnapshot?.trangThaiTsbd ===
  'Đang bảo đảm'

const toCollateralReleased =
  toCollateralSnapshot?.trangThaiTsbd ===
    'Đã giải chấp' &&
  Boolean(
    toCollateralSnapshot?.ngayGiaiChap
  )

if (
  fromCollateralActive &&
  toCollateralReleased
) {
  changeStatus =
    'Đã giải chấp'
} else if (
  fromCollateralActive &&
  !toCollateralSnapshot
) {
  changeStatus =
    'Không còn xuất hiện trong nguồn'
} else if (
  !fromCollateralSnapshot &&
  toCollateralActive
) {
  changeStatus =
    'Phát sinh TSBĐ'
} else if (
  !fromAsset &&
  toAsset &&
  !fromCollateralSnapshot
) {
  changeStatus =
    'Phát sinh mới'
} else if (
  fromAsset &&
  !toAsset &&
  !toCollateralSnapshot
) {
  changeStatus =
    'Không còn cuối kỳ'
} else if (valuationChange > 0) {
          changeStatus =
            'Tăng GT định giá'
        } else if (valuationChange < 0) {
          changeStatus =
            'Giảm GT định giá'
        }

        return {
          maTsDg,
          fromAsset,
          toAsset,
          fromCollateralSnapshot,
          toCollateralSnapshot,

          fromValuation,
          toValuation,
          valuationChange,

          fromDebt,
          toDebt,
          debtChange,

          newRiskTypesAtEnd,

          riskTypesOccurredInRange: [
            ...riskTypesOccurredInRange,
          ],

          changeStatus,
        }
      })
    : []

const filteredComparisonAssets =
  comparisonAssets.filter((item) => {
    /*
      1. Xử lý các biến động RỦI RO trước.
    */

    if (
      changeType ===
      'Phát sinh rủi ro mới'
    ) {
      if (valuationRisk === 'Tất cả') {
        return (
          item.newRiskTypesAtEnd.length > 0
        )
      }

      if (
        valuationRisk ===
        'Không phát hiện'
      ) {
        return false
      }

      return item.newRiskTypesAtEnd.includes(
        valuationRisk
      )
    }

    if (
      changeType ===
      'Phát sinh rủi ro trong khoảng'
    ) {
      if (valuationRisk === 'Tất cả') {
        return (
          item.riskTypesOccurredInRange
            .length > 0
        )
      }

      if (
        valuationRisk ===
        'Không phát hiện'
      ) {
        return false
      }

      return (
        item.riskTypesOccurredInRange.includes(
          valuationRisk
        )
      )
    }

    /*
      2. Với các loại biến động thông thường,
         bộ lọc "Rủi ro định giá"
         được hiểu là trạng thái RỦI RO CUỐI KỲ.
    */

    if (
      valuationRisk !== 'Tất cả'
    ) {
      if (!item.toAsset) {
        return false
      }

      if (
        !matchesRiskFilter(item.toAsset)
      ) {
        return false
      }
    }

    /*
      3. Sau đó mới xử lý loại biến động tài sản.
    */

    if (changeType === 'Tất cả') {
      return true
    }

    if (
      changeType === 'Phát sinh mới'
    ) {
      return (
        item.changeStatus ===
        'Phát sinh mới'
      )
    }

    if (
      changeType === 'Tăng GT định giá'
    ) {
      return item.valuationChange > 0
    }

    if (
      changeType === 'Giảm GT định giá'
    ) {
      return item.valuationChange < 0
    }

    if (changeType === 'Dư nợ tăng') {
      return item.debtChange > 0
    }

    if (changeType === 'Dư nợ giảm') {
      return item.debtChange < 0
    }

    if (changeType === 'Giải chấp') {
  return (
    item.fromAsset?.isActiveCollateral &&
    item.toAsset?.trangThaiTsbd ===
      'Đã giải chấp'
  )
}

if (
  changeType ===
  'Không còn xuất hiện trong nguồn'
) {
  return (
    item.changeStatus ===
    'Không còn xuất hiện trong nguồn'
  )
}

return true
  })
          const mapAssets =
  timeMode === 'Một kỳ'
    ? filteredAssets
    : filteredComparisonAssets
        .map((item) => item.toAsset ?? item.fromAsset)
        .filter(Boolean)
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

  const formatBillion = (value) =>
    `${(value / 1_000_000_000).toFixed(1)} tỷ`

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
      .split(/\n+|\?+/)
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
    activeDataset
  )
  

const resolution =
  resolveQueryPlanValues(
    rawQueryPlan,
    activeDataset
  )
  

if (!resolution.success) {
  const errorMessage =
    resolution.errors.join(
      ' | '
    )

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
          const errorMessage =
            `Query Plan không hợp lệ: ${validation.errors.join(
              ' | '
            )}`

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
          const errorMessage =
            result.errors?.join(' | ') ||
            'Không thể thực thi Query Plan.'

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
  console.log(
  'GREENNODE CANONICAL TEST:',
  canonicalData
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
setShowValidationDetails(false)
}

const handleClearImportedExcel = () => {
  setExcelImported(false)
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
const handleViewAssetDetail = (asset) => {
    setSelectedAssetId(asset.maTsDg)

    setTimeout(() => {
      const row = document.getElementById(
        `asset-row-${asset.maTsDg}`
      )

      if (row) {
        row.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }, 100)
  }

  return (
    <div className="app">
      <header className="gn-header">
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
        Hệ sinh thái bản đồ số TSBĐ
      </h1>
    </div>
  </div>

  <div className="gn-header-right">
    <div className="gn-source-badge">
      <span className="gn-source-dot" />

      Dữ liệu:
      <strong>
        {excelImported ? 'EXCEL' : 'MOCK'}
      </strong>
    </div>

    <div className="gn-user">
      <div className="gn-user-avatar">
        TL
      </div>

      <div className="gn-user-name">
        Người dùng
      </div>
    </div>
  </div>
</header>

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
      <h2>Bộ lọc thông tin</h2>

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
          onChange={(event) =>
           setTimeMode(event.target.value)
           }
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
      onChange={(event) =>
        setReportingPeriod(event.target.value)
      }
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
        onChange={(event) =>
          setFromPeriod(event.target.value)
        }
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
        onChange={(event) =>
          setToPeriod(event.target.value)
        }
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
    onChange={(event) =>
      setChangeType(event.target.value)
    }
  >
    <option>Tất cả</option>
    <option>Phát sinh mới</option>
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
              onChange={(event) =>
                setObjectType(event.target.value)
              }
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
              onChange={(event) =>
                setAssetGroup(event.target.value)
              }
            >
              <option>Tất cả</option>
              <option>BĐS</option>
              <option>Động sản</option>
            </select>
          </label>

          <label>
            Tỉnh/Thành phố
            <select
              value={province}
              onChange={(event) =>
                setProvince(event.target.value)
              }
            >
              <option>Tất cả</option>
              <option>Hà Nội</option>
              <option>TP. Hồ Chí Minh</option>
            </select>
          </label>
          <label>
             Đơn vị định giá
          <select
            value={valuationUnit}
             onChange={(event) =>
              setValuationUnit(event.target.value)
             }
            >
    <option>Tất cả</option>
    <option>Nội bộ</option>
    <option>Công ty định giá A</option>
    <option>Công ty định giá B</option>
  </select>
</label>

          <label>
            Rủi ro định giá
            <select
              value={valuationRisk}
              onChange={(event) =>
                setValuationRisk(event.target.value)
              }
            >
              <option>Tất cả</option>
              <option>Không phát hiện</option>
              <option>Định giá cao</option>
              <option>Sai phương pháp</option>
              <option>Sai thông tin tài sản</option>
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
      changeType={
        timeMode === 'Khoảng thời gian'
          ? changeType
          : 'Tất cả'
      }
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
      KPI 4 - DƯ NỢ TSBĐ
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

  <h2>Dữ liệu đầu vào</h2>

  <div
    style={{
      marginBottom: '10px',
      fontSize: '12px',
      fontWeight: '700',
    }}
  >
    <div>
  Nguồn đang hoạt động:{' '}
  {excelImported ? 'EXCEL' : 'MOCK'}
</div>

{excelImported &&
  importedExcelFileInfo && (
    <div
      style={{
        marginTop: '4px',
        fontWeight: '400',
        wordBreak: 'break-word',
      }}
    >
      {importedExcelFileInfo.fileName}
    </div>
  )}
  </div>

  <label
    htmlFor="excel-file-input"
    style={{
      display: 'block',
      padding: '10px 14px',
      marginBottom: '10px',
      background: '#ffffff',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      cursor: 'pointer',
      textAlign: 'center',
      fontWeight: '600',
    }}
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

  {excelFileInfo && (
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

  <hr />

  <h2>Trợ lý AI</h2>

<p className="ai-description">
  Hỏi dữ liệu Tài sản / TSBĐ bằng ngôn ngữ tự nhiên.
</p>

<textarea
  placeholder="Ví dụ: Top 1 tỉnh có dư nợ TSBĐ cao nhất tháng 8/2026"
  value={aiQuestion}
  onChange={(event) =>
    setAiQuestion(event.target.value)
  }
  disabled={aiLoading}
/>

<button
  type="button"
  onClick={handleAskAI}
  disabled={
    aiLoading ||
    !aiQuestion.trim()
  }
>
  {aiLoading
    ? 'Đang xử lý...'
    : 'Hỏi AI'}
</button>

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
    style={{
      marginTop: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}
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
              <div className="ai-answer-summary">
                {job.answer}
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
                                  {
                                    item.key
                                  }
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

              <details className="ai-technical-details">
                <summary>
                  Xem chi tiết truy vấn
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

    <span>
      {timeMode === 'Một kỳ'
        ? `${filteredAssets.length} tài sản`
        : `${filteredComparisonAssets.length} tài sản`}
    </span>
  </div>

  <div className="table-wrapper">
    {timeMode === 'Một kỳ' ? (
      <table>
        <thead>
          <tr>
            <th>Mã TS</th>
            <th>Nhóm TS</th>
            <th>Loại TS</th>
            <th>Tỉnh/TP</th>
            <th>GT định giá</th>
            <th>Mã TSBĐ</th>
            <th>Dư nợ</th>
            <th>LTV</th>
          </tr>
        </thead>

        <tbody>
          {filteredAssets.map((asset) => (
            <tr
              key={asset.maTsDg}
              id={`asset-row-${asset.maTsDg}`}
              onClick={() =>
  handleSelectAssetFromTable(asset.maTsDg)
}
              className={
                selectedAssetId === asset.maTsDg
                  ? 'selected-table-row'
                  : ''
              }
            >
              <td>{asset.maTsDg}</td>
              <td>{asset.nhomTsCap1}</td>
              <td>{asset.loaiTsCap2}</td>
              <td>{asset.tinhTp}</td>

              <td>
                {formatBillion(asset.gtDinhGia)}
              </td>

              <td>
                {asset.maTsbd ?? '-'}
              </td>

              <td>
                {asset.maTsbd
                  ? formatBillion(asset.duNoTsbd)
                  : '-'}
              </td>

              <td>
                {asset.ltv !== null
                  ? `${(asset.ltv * 100).toFixed(1)}%`
                  : '-'}
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
            <th>GT đầu kỳ</th>
            <th>GT cuối kỳ</th>
            <th>Biến động GT</th>
            <th>Dư nợ đầu kỳ</th>
            <th>Dư nợ cuối kỳ</th>
            <th>Biến động dư nợ</th>
            <th>Trạng thái</th>
          </tr>
        </thead>

        <tbody>
          {filteredComparisonAssets.map((item) => (
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
  {item.fromCollateralSnapshot
    ? formatBillion(item.fromDebt)
    : '-'}
</td>

<td>
  {item.toCollateralSnapshot
    ? formatBillion(item.toDebt)
    : '-'}
</td>

<td>
  {item.debtChange >= 0 ? '+' : ''}
  {formatBillion(item.debtChange)}
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

    return (
      <span
        className={`change-status ${statusClass}`}
      >
        {displayStatus}
      </span>
    )
  })()}
</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
</section>
    </div>
  )
}

export default App