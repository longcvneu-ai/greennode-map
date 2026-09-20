import assert from 'node:assert/strict'
import {
  buildCoordinateGroups,
  coordinateKey,
  coordinateGroupRiskCount,
  hasRisk,
} from './coordinateLocationService.js'

const makeAsset = (overrides = {}) => ({
  maTsDg: 'A1',
  tenTaiSan: 'Tài sản A1',
  nhomTsCap1: 'BĐS',
  loaiTsCap2: 'Nhà đất',
  tinhTp: 'Hà Nội',
  latitude: 21.0367,
  longitude: 105.7828,
  risks: [],
  ...overrides,
})

const risky = (asset) => ({ ...asset, risks: [{ loaiRuiRo: 'Định giá cao' }] })

/*
  Baseline: 1 asset tại 1 tọa độ -> nhóm chỉ có 1 phần tử (popup giữ nguyên).
*/
const single = buildCoordinateGroups([makeAsset({ maTsDg: 'SINGLE' })])
assert.equal(single.size, 1)
assert.equal(single.values().next().value.length, 1)

/*
  2 tài sản CÙNG CHÍNH XÁC tọa độ -> 1 nhóm 2.
*/
const twoAssets = [
  makeAsset({ maTsDg: 'G2a', tenTaiSan: 'TS G2a' }),
  makeAsset({ maTsDg: 'G2b', tenTaiSan: 'TS G2b' }),
]
const two = buildCoordinateGroups(twoAssets)
assert.equal(two.size, 1)
const twoGroup = two.values().next().value
assert.equal(twoGroup.length, 2)

/*
  10 tài sản CÙNG CHÍNH XÁC -> 1 nhóm 10; tọa độ không bị sửa sau grouping.
*/
const tenAssets = Array.from({ length: 10 }, (_, i) =>
  makeAsset({ maTsDg: `G10-${i}`, tenTaiSan: `TS G10 ${i}` })
)
const tenSnapshot = tenAssets.map((a) => [a.latitude, a.longitude])
const ten = buildCoordinateGroups(tenAssets)
assert.equal(ten.size, 1)
assert.equal(ten.values().next().value.length, 10)
tenAssets.forEach((a, i) => {
  assert.equal(a.latitude, tenSnapshot[i][0], 'latitude không bị mutate')
  assert.equal(a.longitude, tenSnapshot[i][1], 'longitude không bị mutate')
})

/*
  50 tài sản CÙNG CHÍNH XÁC -> 1 nhóm 50; truy cập asset đầu/giữa/cuối.
*/
const fiftyAssets = Array.from({ length: 50 }, (_, i) =>
  makeAsset({ maTsDg: `G50-${i}`, tenTaiSan: `TS G50 ${i}` })
)
const fifty = buildCoordinateGroups(fiftyAssets)
assert.equal(fifty.size, 1)
const fiftyGroup = fifty.values().next().value
assert.equal(fiftyGroup.length, 50)
assert.equal(fiftyGroup[0].maTsDg, 'G50-0')
assert.equal(fiftyGroup[24].maTsDg, 'G50-24')
assert.equal(fiftyGroup[49].maTsDg, 'G50-49')

/*
  50 tài sản CÙNG CHÍNH XÁC + rủi ro xen kẽ -> đếm rủi ro đúng, rủi ro từng asset rõ.
*/
const mixed50 = Array.from({ length: 50 }, (_, i) => {
  const asset = makeAsset({ maTsDg: `MX-${i}`, tenTaiSan: `TS MX ${i}` })
  return i % 2 === 0 ? risky(asset) : asset
})
const mixed = buildCoordinateGroups(mixed50)
assert.equal(mixed.size, 1)
const mixedGroup = mixed.values().next().value
assert.equal(mixedGroup.length, 50)
assert.equal(coordinateGroupRiskCount(mixedGroup), 25, '25 asset rủi ro / 25 an toàn')
assert.equal(mixedGroup.some(hasRisk), true, 'nhóm có rủi ro')
assert.equal(mixedGroup[0].maTsDg, 'MX-0')
assert.equal(mixedGroup[25].maTsDg, 'MX-25')
assert.equal(mixedGroup[49].maTsDg, 'MX-49')

/*
  Nhiều nhóm khác tọa độ song song -> clustering theo vị trí khác nhau giữ nguyên.
*/
const multi = buildCoordinateGroups([
  makeAsset({ maTsDg: 'P1', latitude: 21.0285, longitude: 105.8542 }),
  makeAsset({ maTsDg: 'P2', latitude: 21.0285, longitude: 105.8542 }),
  makeAsset({ maTsDg: 'P3', latitude: 10.7769, longitude: 106.7009 }),
  makeAsset({ maTsDg: 'P4', latitude: 10.7769, longitude: 106.7009 }),
  makeAsset({ maTsDg: 'U1', latitude: 16.0544, longitude: 108.2022 }),
])
assert.equal(multi.size, 3, '3 cụm tọa độ riêng biệt')
assert.deepEqual([...multi.values()].map((g) => g.length).sort(), [1, 2, 2])

/*
  Đồng nhất chuỗi số: "21.0367" và 21.0367 phải là CÙNG tọa độ.
*/
const stringCoords = buildCoordinateGroups([
  makeAsset({ maTsDg: 'S1', latitude: '21.0367', longitude: '105.7828' }),
  makeAsset({ maTsDg: 'S2', latitude: 21.0367, longitude: 105.7828 }),
])
assert.equal(stringCoords.size, 1)
assert.equal(stringCoords.get(coordinateKey(21.0367, 105.7828)).length, 2)

/*
  Asset thiếu tọa độ (province/NONE fallback) không vào nhóm nào.
*/
const noCoords = buildCoordinateGroups([makeAsset({ latitude: null, longitude: null })])
assert.equal(noCoords.size, 0)

console.log('EXACT CO-LOCATION GROUP (coordinateLocationService): PASS')