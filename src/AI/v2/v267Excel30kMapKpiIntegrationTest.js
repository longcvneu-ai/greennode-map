import assert from 'node:assert/strict'
import fs from 'node:fs'
import { getAssetsByReportingPeriod } from '../../services/assetService.js'
import { getPersistentRiskSummary } from '../../services/persistentRiskService.js'
import { buildProvinceSummaries } from '../../services/mapSummaryService.js'
import { createQueryPlanFromGreenNode } from './greennodeAdapter.js'
import { executeQueryPlan } from './queryPlanExecutor.js'

const N = 30000
const periods = ['2026-06-30', '2026-07-31', '2026-08-31']
const provinces = [
  ['Hà Nội',21.0285,105.8542],['TP. Hồ Chí Minh',10.7769,106.7009],['Hải Phòng',20.8449,106.6881],
  ['Huế',16.4637,107.5909],['Đà Nẵng',16.0544,108.2022],['Cần Thơ',10.0452,105.7469],
  ['Lai Châu',22.3864,103.4703],['Điện Biên',21.3860,103.0230],['Sơn La',21.3270,103.9141],
  ['Lào Cai',22.4809,103.9755],['Tuyên Quang',21.8233,105.2140],['Cao Bằng',22.6666,106.2630],
  ['Lạng Sơn',21.8537,106.7615],['Thái Nguyên',21.5942,105.8482],['Phú Thọ',21.2684,105.2046],
  ['Bắc Ninh',21.1861,106.0763],['Hưng Yên',20.6464,106.0511],['Ninh Bình',20.2506,105.9745],
  ['Quảng Ninh',20.9510,107.0800],['Thanh Hóa',19.8067,105.7852],['Nghệ An',18.6796,105.6813],
  ['Hà Tĩnh',18.3559,105.8877],['Quảng Trị',16.8163,107.1003],['Quảng Ngãi',15.1205,108.7923],
  ['Gia Lai',13.9718,108.0151],['Đắk Lắk',12.6662,108.0382],['Khánh Hòa',12.2388,109.1967],
  ['Lâm Đồng',11.9404,108.4583],['Đồng Nai',10.9453,106.8240],['Tây Ninh',11.3352,106.1099],
  ['Vĩnh Long',10.2537,105.9722],['Đồng Tháp',10.4938,105.6882],['An Giang',10.5216,105.1259],['Cà Mau',9.1769,105.1524],
]

const valuationAssets=[]
const valuationSnapshots=[]
const valuationRisks=[]
for (let i=1;i<=N;i+=1) {
  const id=`DG${String(i).padStart(6,'0')}`
  const rec=`REC_${id}`
  const [tinhTp,lat,lon]=provinces[(i-1)%provinces.length]
  valuationAssets.push({recordId:rec,maTsDg:id,tenTaiSan:`TS ${id}`,nhomTsCap1:'BĐS',loaiTsCap2:'Nhà đất',tinhTp,latitude:lat,longitude:lon,gtDinhGia:1_000_000_000})
  for (const kyBaoCao of periods) valuationSnapshots.push({kyBaoCao,valuationRecordId:rec,maTsDg:id,gtDinhGia:1_000_000_000})
  // Exactly first 1,200 assets are risky in Jul+Aug => persistent at Aug.
  if (i<=1200) {
    valuationRisks.push({kyBaoCao:'2026-07-31',valuationRecordId:rec,maTsDg:id,maRuiRo:`J${i}`,loaiRuiRo:['Định giá cao','Sai thông tin tài sản','Sai phương pháp'][(i-1)%3]})
    valuationRisks.push({kyBaoCao:'2026-08-31',valuationRecordId:rec,maTsDg:id,maRuiRo:`A${i}`,loaiRuiRo:['Định giá cao','Sai thông tin tài sản','Sai phương pháp'][(i-1)%3]})
  }
}
const dataset={valuationAssets,valuationSnapshots,valuationRisks,collateralAssets:[],collateralSnapshots:[],collateralCustomers:[],customers:[]}

// Full-screen KPI and AI must be identical.
const currentAssets=getAssetsByReportingPeriod('2026-08-31',dataset)
assert.equal(currentAssets.length,N)
const kpi=getPersistentRiskSummary({period:'2026-08-31',dataset,assetIds:currentAssets.map(a=>a.maTsDg)})
assert.equal(kpi.persistentAssets,1200)
const plan=await createQueryPlanFromGreenNode('tài sản nào phát sinh rủi ro 2 kỳ liên tiếp',dataset,{defaultPeriod:'2026-08-31',persistentAssetIds:currentAssets.map(a=>a.maTsDg)})
const result=executeQueryPlan(plan,dataset)
assert.equal(result.success,true)
assert.equal(result.data.length,1200)
assert.deepEqual(new Set(result.data.map(x=>x.maTsDg)),new Set(kpi.items.map(x=>x.maTsDg)))

// Filtered UI scope must also stay identical (first province only).
const province='Hà Nội'
const scoped=currentAssets.filter(a=>a.tinhTp===province)
const scopedKpi=getPersistentRiskSummary({period:'2026-08-31',dataset,assetIds:scoped.map(a=>a.maTsDg)})
const scopedPlan=await createQueryPlanFromGreenNode('tài sản nào phát sinh rủi ro 2 kỳ liên tiếp',dataset,{defaultPeriod:'2026-08-31',persistentAssetIds:scoped.map(a=>a.maTsDg)})
const scopedResult=executeQueryPlan(scopedPlan,dataset)
assert.equal(scopedResult.data.length,scopedKpi.persistentAssets)
assert.deepEqual(new Set(scopedResult.data.map(x=>x.maTsDg)),new Set(scopedKpi.items.map(x=>x.maTsDg)))

// Exact field regression: a named province in the natural-language question must
// be resolved dynamically from the dataset, and a specific UI risk filter must be inherited
// when the question only says generic "rủi ro".
const daNang = 'Đà Nẵng'
const expectedDaNangAllRisk = valuationRisks.filter((risk) => {
  const asset = valuationAssets.find((item) => item.maTsDg === risk.maTsDg)
  return risk.kyBaoCao === '2026-08-31' && asset?.tinhTp === daNang
}).length
const expectedDaNangInfoRisk = valuationRisks.filter((risk) => {
  const asset = valuationAssets.find((item) => item.maTsDg === risk.maTsDg)
  return risk.kyBaoCao === '2026-08-31' && asset?.tinhTp === daNang && risk.loaiRuiRo === 'Sai thông tin tài sản'
}).length

const daNangPlan = await createQueryPlanFromGreenNode(
  'Đà Nẵng có bao nhiêu case tài sản bảo đảm rủi ro',
  dataset,
  { defaultPeriod: '2026-08-31', periodAssets: currentAssets }
)
assert.ok(daNangPlan.steps.some((step) => step.action === 'FILTER' && step.field === 'province' && step.value === daNang))
const daNangResult = executeQueryPlan(daNangPlan, dataset)
assert.equal(daNangResult.data?.value ?? daNangResult.data, expectedDaNangAllRisk)

const daNangFilteredPlan = await createQueryPlanFromGreenNode(
  'Đà Nẵng có bao nhiêu case tài sản bảo đảm rủi ro',
  dataset,
  {
    defaultPeriod: '2026-08-31',
    periodAssets: currentAssets,
    defaultRiskType: 'Sai thông tin tài sản',
  }
)
assert.ok(daNangFilteredPlan.steps.some((step) => step.action === 'FILTER' && step.field === 'valuationRisk' && step.value === 'Sai thông tin tài sản'))
const daNangFilteredResult = executeQueryPlan(daNangFilteredPlan, dataset)
assert.equal(daNangFilteredResult.data?.value ?? daNangFilteredResult.data, expectedDaNangInfoRisk)

// Large map must aggregate all provinces and preserve nationwide geographic span.
const summaries=buildProvinceSummaries(currentAssets)
assert.equal(summaries.length,34)
assert.equal(summaries.reduce((s,x)=>s+x.total,0),N)
assert.equal(summaries.reduce((s,x)=>s+x.risk,0),1200)
const latitudes=summaries.map(x=>x.latitude)
const longitudes=summaries.map(x=>x.longitude)
assert.ok(Math.max(...latitudes)-Math.min(...latitudes)>10,'map latitude span must remain nationwide')
assert.ok(Math.max(...longitudes)-Math.min(...longitudes)>5,'map longitude span must remain nationwide')

// Regression guard for stale popup/deep zoom after Excel import.
const app=fs.readFileSync(new URL('../../App.jsx',import.meta.url),'utf8')
const map=fs.readFileSync(new URL('../../components/AssetMap.jsx',import.meta.url),'utf8')
assert.match(app,/setExcelImported\(true\)[\s\S]{0,180}setSelectedAssetId\(null\)/)
assert.match(map,/map\.closePopup\(\)/)
assert.match(map,/map\.fitBounds\(bounds,[\s\S]{0,180}animate:\s*false/)

console.log('V2.6.7 Excel 30K KPI + Map integration: PASS 20/20')
