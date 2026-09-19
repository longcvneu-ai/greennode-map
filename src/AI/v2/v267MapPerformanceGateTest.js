/*
 * GREENNODE V2.6.7 — FINAL MAP PERFORMANCE GATE
 * =============================================
 * Bảo vệ 2 yêu cầu sản phẩm:
 *   1) COORDINATE INTEGRITY: tọa độ EXACT không bao giờ bị nén về tâm tỉnh.
 *   2) MAP PERFORMANCE: chuẩn bị dữ liệu O(n), Set.has + memoization cho map click.
 *
 * Node test này đo CHUẨN BỊ DỮ LIỆU (deterministic). Browser rendering
 * (Leaflet) KHÔNG đo được ở đây — phần browser là harness thủ công (mapPerfMarks).
 * KHÔNG fake PASS cho browser.
 *
 * Chạy: npm run test:map-gate
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import XLSX from 'xlsx'
import {
  prepareMapData,
  classifyAssets,
  assignProvinceFallback,
  resolveCoordinateSource,
  hasValidCoordinate,
  PROVINCE_CENTERS,
} from '../../services/coordinateProvenanceService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')
const FIXTURE_DIR = path.join(ROOT, 'test-fixtures')
const GOLDEN_XLSX = path.join(
  FIXTURE_DIR,
  'greennode_golden_10000_assets_3periods.xlsx'
)
const GOLDEN_GENERATOR = path.join(
  FIXTURE_DIR,
  'generate_golden_10000_assets_3periods.cjs'
)

const RUNS = 7
let passed = 0
let failed = 0
const results = []

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1
    console.log(`PASS ${name}${detail ? `: ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`)
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function medianMs(fn, runs = RUNS) {
  const samples = []
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  return median(samples)
}

const budget = (ms) =>
  ms < 50 ? 'GREEN' : ms < 300 ? 'YELLOW' : 'RED'

/* ------------------------------------------------------------------ *
 * DETERMINISTIC TEST-ONLY DATASETS
 * ------------------------------------------------------------------ */

// Case 1: 10,000 tài sản, tọa độ phân tán (đúng kiểu file 10K uploaded:
// 10 tỉnh × 19 jitter = ~190 cặp tọa độ riêng biệt).
function makeDistributedTenK(total = 10000) {
  const provinces = PROVINCE_CENTERS.slice(0, 10)
  const assets = []
  for (let i = 1; i <= total; i += 1) {
    const province = provinces[(i - 1) % provinces.length]
    const jitterLat = (((i * 7) % 19) - 9) / 1000
    const jitterLng = (((i * 13) % 19) - 9) / 1000
    assets.push({
      maTsDg: `DG${String(i).padStart(6, '0')}`,
      tenTaiSan: `TS ${i}`,
      tinhTp: province.name,
      latitude: Number((province.lat + jitterLat).toFixed(4)),
      longitude: Number((province.lng + jitterLng).toFixed(4)),
      risks: [],
    })
  }
  return assets
}

// Case 2: 30,000 tài sản, 30,000 tọa độ EXACT riêng biệt (guaranteed unique).
function makeDistinctExact(total = 30000) {
  const assets = []
  for (let i = 1; i <= total; i += 1) {
    const province = PROVINCE_CENTERS[(i - 1) % PROVINCE_CENTERS.length]
    const rowOffset = Math.floor((i - 1) / 1000)
    const colOffset = (i - 1) % 1000
    assets.push({
      maTsDg: `DG${String(i).padStart(6, '0')}`,
      tenTaiSan: `TS ${i}`,
      tinhTp: province.name,
      latitude: Number((province.lat + rowOffset * 0.0001).toFixed(5)),
      longitude: Number((province.lng + colOffset * 0.0001).toFixed(5)),
      risks: [],
    })
  }
  return assets
}

// Case 3: 25,000 EXACT + 5,000 PROVINCE fallback (không có tọa độ, có tinhTp).
function makeMixed(exactTotal = 25000, fallbackTotal = 5000) {
  const exact = makeDistinctExact(exactTotal)
  const fallback = []
  for (let i = 1; i <= fallbackTotal; i += 1) {
    const province =
      PROVINCE_CENTERS[(i - 1) % PROVINCE_CENTERS.length]
    fallback.push({
      maTsDg: `FALLBACK${String(i).padStart(6, '0')}`,
      tenTaiSan: `TS fallback ${i}`,
      tinhTp: province.name,
      latitude: null,
      longitude: null,
      risks: i % 10 === 0 ? [{ maRuiRo: `R${i}` }] : [],
    })
  }
  return [...exact, ...fallback]
}

const case1 = makeDistributedTenK()
const case2 = makeDistinctExact()
const case3 = makeMixed()

/* ------------------------------------------------------------------ *
 * A. COORDINATE INTEGRITY
 * ------------------------------------------------------------------ */
console.log('\n=== A. COORDINATE INTEGRITY ===')

// A1: EXACT coordinate is never replaced by province coordinate.
const prepared2 = prepareMapData(case2)
const originalById = new Map(
  case2.map((asset) => [asset.maTsDg, asset])
)
const exactPreserved = prepared2.exactAssets.every((asset) => {
  const original = originalById.get(asset.maTsDg)
  return (
    original &&
    asset.latitude === original.latitude &&
    asset.longitude === original.longitude
  )
})
check(
  'A1 EXACT coordinate never replaced by province coordinate',
  exactPreserved && prepared2.exactAssets.length === 30000
)

// A2: dataset size never changes EXACT -> PROVINCE.
const firstTenK = makeDistinctExact(10000)
const preparedTenK = prepareMapData(firstTenK)
const sizeClassStable =
  preparedTenK.counts.exact === 10000 &&
  preparedTenK.counts.province === 0 &&
  prepared2.counts.exact === 30000 &&
  prepared2.counts.province === 0
check(
  'A2 dataset size never changes EXACT -> PROVINCE',
  sizeClassStable,
  `10K: exact=${preparedTenK.counts.exact}/province=${preparedTenK.counts.province} · 30K: exact=${prepared2.counts.exact}/province=${prepared2.counts.province}`
)

// A3: PROVINCE fallback only when exact coordinate unavailable.
const prepared3 = prepareMapData(case3)
const provinceIdsSet = new Set(
  prepared3.provinceAssets.map((asset) => asset.maTsDg)
)
const provinceOnlyWhenMissing = prepared3.provinceAssets.every(
  (asset) => !hasValidCoordinate(asset)
)
const exactNeverInProvince = prepared3.exactAssets.every(
  (asset) => !provinceIdsSet.has(asset.maTsDg)
)
check(
  'A3 PROVINCE fallback only when exact coordinate unavailable',
  provinceOnlyWhenMissing && exactNeverInProvince
)

// A4: mixed dataset preserves both populations.
const fallbackAssigned = prepared3.provinceAssets.length
const fallbackTotalInMap = prepared3.provinceEntries.reduce(
  (sum, entry) => sum + entry.total,
  0
)
const mixedPreserved =
  prepared3.counts.exact === 25000 &&
  prepared3.counts.province === 5000 &&
  fallbackAssigned === 5000 &&
  fallbackTotalInMap === 5000
check(
  'A4 mixed EXACT + PROVINCE preserves both populations',
  mixedPreserved,
  `exact=${prepared3.counts.exact} province=${prepared3.counts.province} provinceEntries=${prepared3.provinceEntries.length}`
)

// A5: 10K/30K dataset size alone cannot activate province-only mode.
const prepared1 = prepareMapData(case1)
const noProvinceCollapse =
  prepared2.provinceEntries.length === 0 &&
  prepared2.provinceAssets.length === 0 &&
  prepared1.provinceEntries.length === 0 &&
  prepared1.counts.exact === 10000
check(
  'A5 dataset size alone cannot activate province-only mode',
  noProvinceCollapse
)

const assetMapSource = fs.readFileSync(
  path.join(ROOT, 'src/components/AssetMap.jsx'),
  'utf8'
)
check(
  'A5b AssetMap has no size-based province collapse',
  !assetMapSource.includes('LARGE_MAP_THRESHOLD') &&
    assetMapSource.includes('prepareMapData')
)

/* ------------------------------------------------------------------ *
 * B. DATA PREPARATION PERFORMANCE
 * ------------------------------------------------------------------ */
console.log('\n=== B. DATA PREPARATION PERFORMANCE ===')

function measureCase(assets) {
  const classify = medianMs(() => classifyAssets(assets))
  const { provinceAssets } = classifyAssets(assets)
  const fallback = provinceAssets.length
    ? medianMs(() => assignProvinceFallback(provinceAssets))
    : 0
  const prepare = medianMs(() => prepareMapData(assets))
  return {
    classify,
    fallback,
    partition: classify,
    mapPrep: prepare,
    total: prepare,
  }
}

const timing1 = measureCase(case1)
const timing2 = measureCase(case2)
const timing3 = measureCase(case3)

const fmt = (value) => `${value.toFixed(2)}ms`
results.push(
  { dataset: '10K distributed', ...timing1 },
  { dataset: '30K distinct EXACT', ...timing2 },
  { dataset: '25K EXACT + 5K PROVINCE', ...timing3 }
)

check(
  'B1 map preparation 30K not RED (<300ms)',
  timing2.mapPrep < 300,
  `mapPrep=${fmt(timing2.mapPrep)} [${budget(timing2.mapPrep)}]`
)
check(
  'B2 map preparation mixed stays <300ms',
  timing3.mapPrep < 300,
  `mapPrep=${fmt(timing3.mapPrep)} [${budget(timing3.mapPrep)}]`
)

// No O(n^2): 3x data must not cost ~9x (allow generous 6x for node noise).
const base = Math.max(timing1.mapPrep, 0.1)
const scaling = timing2.mapPrep / base
check(
  'B3 preparation scales ~linearly (30K/10K < 6x, no O(n^2))',
  scaling < 6,
  `ratio=${scaling.toFixed(2)}x`
)

const distinct3 = prepared3.distinctCoordinateCount
const distinctUpperBound =
  prepared3.counts.exact + prepared3.provinceEntries.length
check(
  'B4 distinct coordinate count preserved (mixed)',
  distinct3 >= prepared3.counts.exact && distinct3 <= distinctUpperBound,
  `distinct=${distinct3} (bounds ${prepared3.counts.exact}..${distinctUpperBound})`
)

/* ------------------------------------------------------------------ *
 * C. MAP CLICK PERFORMANCE (Set.has + memoization)
 * ------------------------------------------------------------------ */
console.log('\n=== C. MAP CLICK PERFORMANCE ===')

const mapFilterWithSet = (assets, ids) => {
  const set = new Set(ids)
  return assets.filter((asset) => set.has(asset.maTsDg))
}
const singleId = [case2[0].maTsDg]
const clusterIds = case2.slice(0, 130).map((asset) => asset.maTsDg)
const provinceIds = case2
  .filter((asset) => asset.tinhTp === case2[0].tinhTp)
  .map((asset) => asset.maTsDg)

const tSingle = medianMs(() => mapFilterWithSet(case2, singleId))
const tCluster = medianMs(() => mapFilterWithSet(case2, clusterIds))
const tProvince = medianMs(() => mapFilterWithSet(case2, provinceIds))

check(
  'C1 single asset mapFilter < 50ms',
  tSingle < 50,
  `${fmt(tSingle)} [${budget(tSingle)}]`
)
check(
  'C2 large cluster/province selection < 100ms',
  tCluster < 100 && tProvince < 100,
  `cluster=${fmt(tCluster)} province=${fmt(tProvince)}`
)

const appSource = fs.readFileSync(
  path.join(ROOT, 'src/App.jsx'),
  'utf8'
)

check(
  'C3 mapFilter uses Set.has + memoization',
  appSource.includes('new Set(mapFilterAssetIds)') &&
    appSource.includes('mapFilterIdSet.has(asset.maTsDg)')
)
check(
  'C4 no O(n x ids) includes() in map filter path',
  !appSource.includes('mapFilterAssetIds.includes(') &&
    !appSource.includes('mapFilterIdSet.includes(')
)

// Map-filter-only interaction must NOT rerun comparison/KPI/risk.
const persistentRiskBlock =
  appSource.match(
    /const persistentRiskSummary = useMemo\([\s\S]*?\}, \[[^\]]*\]\)/
  )?.[0] || ''
const comparisonBlock =
  appSource.match(
    /const comparisonAssets = useMemo\([\s\S]*?\n\s*\]\s*\)/
  )?.[0] || ''
const kpiBlock =
  appSource.match(
    /const \{\s*totalValuation,[\s\S]*?\}, \[filteredAssets\]\)/
  )?.[0] || ''
const notificationBlock =
  appSource.match(
    /const notificationAlerts = useMemo\([\s\S]*?\}, \[persistentRiskSummary\]\)/
  )?.[0] || ''

check(
  'C5 map filter does NOT rerun comparison/KPI/risk/notification',
  persistentRiskBlock.length > 0 &&
    comparisonBlock.length > 0 &&
    kpiBlock.length > 0 &&
    notificationBlock.length > 0 &&
    !persistentRiskBlock.includes('mapFilter') &&
    !comparisonBlock.includes('mapFilter') &&
    !kpiBlock.includes('mapFilter') &&
    !notificationBlock.includes('mapFilter')
)

/* ------------------------------------------------------------------ *
 * E. REAL 10K TEST FILE (uploaded-style)
 * ------------------------------------------------------------------ */
console.log('\n=== E. REAL 10K TEST FILE ===')

if (!fs.existsSync(GOLDEN_XLSX)) {
  console.log('  golden fixture missing -> generating (test-only)...')
  execFileSync(process.execPath, [GOLDEN_GENERATOR], {
    cwd: FIXTURE_DIR,
    stdio: 'inherit',
  })
}

const workbook = XLSX.readFile(GOLDEN_XLSX)
const masterRows = XLSX.utils.sheet_to_json(
  workbook.Sheets.ASSET_MASTER
)
const pairKeys = new Set(
  masterRows.map(
    (row) => `${Number(row.latitude).toFixed(4)},${Number(row.longitude).toFixed(4)}`
  )
)
const goldenProvinces = new Set(masterRows.map((row) => row.tinhTp))
const goldenMapped = masterRows.map((row, index) => ({
  maTsDg: row.maTsDg || `ROW${index}`,
  tinhTp: row.tinhTp,
  latitude: row.latitude,
  longitude: row.longitude,
  risks: [],
}))
const goldenPrepared = prepareMapData(goldenMapped)

check(
  'E1 golden 10K file loads ~10,000 assets',
  masterRows.length >= 9000 && masterRows.length <= 11000,
  `rows=${masterRows.length}`
)
check(
  'E2 golden has ~190 distinct coordinate pairs',
  pairKeys.size >= 150 && pairKeys.size <= 250,
  `distinctPairs=${pairKeys.size}`
)
check(
  'E3 golden is NOT collapsed to province centers',
  pairKeys.size > goldenProvinces.size && goldenProvinces.size === 10,
  `distinct=${pairKeys.size} provinces=${goldenProvinces.size}`
)
check(
  'E4 map prep preserves every golden coordinate (no collapse)',
  goldenPrepared.counts.exact === masterRows.length &&
    goldenPrepared.counts.province === 0 &&
    goldenPrepared.distinctCoordinateCount === pairKeys.size,
  `exact=${goldenPrepared.counts.exact} distinct=${goldenPrepared.distinctCoordinateCount}`
)

/* ------------------------------------------------------------------ *
 * G. REGRESSION GUARDS
 * ------------------------------------------------------------------ */
console.log('\n=== G. REGRESSION GUARDS ===')

check(
  'G1 AssetMap keeps clustering / drill-down path',
  assetMapSource.includes('MarkerClusterGroup') &&
    assetMapSource.includes('spiderfyOnMaxZoom') &&
    assetMapSource.includes('zoomToBounds') &&
    assetMapSource.includes('fitBounds')
)
check(
  'G2 province fallback assigns only when coordinate missing',
  (() => {
    const mixed = [
      { maTsDg: 'A', tinhTp: 'Hà Nội', latitude: 21.1, longitude: 105.9 },
      { maTsDg: 'B', tinhTp: 'Hà Nội', latitude: null, longitude: null },
    ]
    const { exactAssets, provinceAssets } = classifyAssets(mixed)
    return (
      resolveCoordinateSource(mixed[0]) === 'EXACT' &&
      exactAssets.length === 1 &&
      provinceAssets.length === 1 &&
      provinceAssets[0].maTsDg === 'B'
    )
  })()
)
check(
  'G3 mixed populations cannot be corrupted (re-classify stable)',
  (() => {
    const again = prepareMapData(case3)
    return (
      again.counts.exact === prepared3.counts.exact &&
      again.counts.province === prepared3.counts.province
    )
  })()
)

/* ------------------------------------------------------------------ *
 * F. PERFORMANCE BUDGET REPORT
 * ------------------------------------------------------------------ */
console.log('\n=== F. PERFORMANCE BUDGET (NODE PREPARATION) ===')
console.log(
  'Dataset'.padEnd(28) +
    'classify'.padEnd(11) +
    'fallback'.padEnd(11) +
    'mapPrep'.padEnd(11) +
    'budget'
)
for (const row of results) {
  console.log(
    row.dataset.padEnd(28) +
      fmt(row.classify).padEnd(11) +
      (row.fallback ? fmt(row.fallback) : '—').padEnd(11) +
      fmt(row.mapPrep).padEnd(11) +
      budget(row.mapPrep)
  )
}
console.log(
  `\nmap click: single=${fmt(tSingle)} [${budget(tSingle)}] · ` +
    `cluster(130)=${fmt(tCluster)} [${budget(tCluster)}] · ` +
    `province(${provinceIds.length})=${fmt(tProvince)} [${budget(tProvince)}]`
)
console.log(
  '\nBROWSER RENDERING: NOT MEASURED HERE (needs real Leaflet DOM).'
)
console.log(
  '  Manual benchmark: npm run dev -> console: window.__GN_MAP_PERF__ = { enabled: true, marks: [] }'
)
console.log(
  '  Then: dataset import, cluster click, marker click; run window.__GN_MAP_PERF__.summary()'
)

console.log(
  `\nV2.6.7 MAP PERFORMANCE GATE: ${passed}/${passed + failed} passed`
)
if (failed > 0) process.exit(1)
