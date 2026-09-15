import { customers as mockCustomers } from '../data/customers.js'
import { valuationSnapshots as mockValuationSnapshots } from '../data/valuationSnapshots.js'
import { valuationAssets as mockValuationAssets } from '../data/valuationAssets.js'
import { collateralAssets as mockCollateralAssets } from '../data/collateralAssets.js'
import { valuationRisks as mockValuationRisks } from '../data/valuationRisks.js'
import { collateralSnapshots as mockCollateralSnapshots } from '../data/collateralSnapshots.js'
import { collateralCustomers as mockCollateralCustomers } from '../data/collateralCustomers.js'


/*
 * Bộ dữ liệu mặc định của GreenNode.
 *
 * Nếu App không truyền dataset vào,
 * assetService vẫn dùng MOCK như hiện tại.
 */

/*
 * PERFORMANCE V2.6.7 FINAL
 * Cache các projection theo đúng object dataset + kỳ báo cáo.
 * Dataset trong App được thay bằng object mới sau mỗi lần import, vì vậy
 * WeakMap tự tách cache giữa MOCK / Excel và không giữ bộ nhớ khi dataset
 * không còn được dùng.
 */
const baseAssetsCache = new WeakMap()
const periodAssetsCache = new WeakMap()
const reportingPeriodsCache = new WeakMap()

function canCacheDataset(dataset) {
  return dataset && (typeof dataset === 'object' || typeof dataset === 'function')
}

export const MOCK_DATASET = {
  valuationAssets: mockValuationAssets,
  valuationSnapshots: mockValuationSnapshots,
  collateralAssets: mockCollateralAssets,
  collateralSnapshots: mockCollateralSnapshots,
  valuationRisks: mockValuationRisks,
  customers: mockCustomers,
  collateralCustomers: mockCollateralCustomers,
}


export function getAssets(
  dataset = MOCK_DATASET
) {
  if (canCacheDataset(dataset) && baseAssetsCache.has(dataset)) {
    return baseAssetsCache.get(dataset)
  }

  const {
    valuationAssets = [],
    collateralAssets = [],
    collateralCustomers = [],
    customers = [],
    valuationRisks = [],
  } = dataset

  /*
   * PERFORMANCE V2.6
   *
   * Trước đây mỗi tài sản lại .find()/.filter() trên toàn bộ dataset,
   * làm độ phức tạp tăng gần O(n²). Với 30.000 tài sản đây là nút thắt lớn.
   * Tạo index Map một lần rồi lookup O(1) cho từng tài sản.
   */
  const collateralByValuationRecordId = new Map()
  collateralAssets.forEach((item) => {
    if (
      item.valuationRecordId &&
      !collateralByValuationRecordId.has(
        item.valuationRecordId
      )
    ) {
      collateralByValuationRecordId.set(
        item.valuationRecordId,
        item
      )
    }
  })

  const relationsByCollateralRecordId = new Map()
  collateralCustomers.forEach((item) => {
    if (!item.collateralRecordId) return
    if (
      !relationsByCollateralRecordId.has(
        item.collateralRecordId
      )
    ) {
      relationsByCollateralRecordId.set(
        item.collateralRecordId,
        []
      )
    }
    relationsByCollateralRecordId
      .get(item.collateralRecordId)
      .push(item)
  })

  const customerByCif = new Map(
    customers.map((item) => [item.cif, item])
  )

  const risksByValuationRecordId = new Map()
  valuationRisks.forEach((item) => {
    if (!item.valuationRecordId) return
    if (
      !risksByValuationRecordId.has(
        item.valuationRecordId
      )
    ) {
      risksByValuationRecordId.set(
        item.valuationRecordId,
        []
      )
    }
    risksByValuationRecordId
      .get(item.valuationRecordId)
      .push(item)
  })

  const projectedAssets = valuationAssets.map(
    (valuationAsset) => {
      const collateral =
        collateralByValuationRecordId.get(
          valuationAsset.recordId
        ) || null

      const customerRelations =
        collateral
          ? relationsByCollateralRecordId.get(
              collateral.recordId
            ) || []
          : []

      const customerDetails =
        customerRelations.map((relation) => {
          const customer =
            customerByCif.get(relation.cif)

          return {
            ...relation,
            tenKhachHang:
              customer?.tenKhachHang ?? null,
            loaiKhachHang:
              customer?.loaiKhachHang ?? null,
          }
        })

      const risks =
        risksByValuationRecordId.get(
          valuationAsset.recordId
        ) || []

      const ltv =
        collateral &&
        valuationAsset.gtDinhGia > 0
          ? collateral.gtBaoDam /
            valuationAsset.gtDinhGia
          : null

      return {
        ...valuationAsset,
        maTsbd: collateral?.maTsbd ?? null,
        cifs: customerRelations.map(
          (item) => item.cif
        ),
        customers: customerDetails,
        ngayNhanTsbd:
          collateral?.ngayNhanTsbd ?? null,
        gtBaoDam: collateral?.gtBaoDam ?? 0,
        duNoTsbd: collateral?.duNoTsbd ?? 0,
        ltv,
        thanhKhoan:
          collateral?.thanhKhoan ?? null,
        trangThaiTsbd:
          collateral?.trangThaiTsbd ?? null,
        ngayGiaiChap:
          collateral?.ngayGiaiChap ?? null,
        donViQuanLy:
          collateral?.donViQuanLy ?? null,
        risks,
        coRuiRoDinhGia: risks.length > 0,
      }
    }
  )

  if (canCacheDataset(dataset)) {
    baseAssetsCache.set(dataset, projectedAssets)
  }

  return projectedAssets
}


export function getAssetById(
  maTsDg,
  kyBaoCao = null,
  dataset = MOCK_DATASET
) {
  if (kyBaoCao) {
    return getAssetsByReportingPeriod(
      kyBaoCao,
      dataset
    ).find(
      (asset) =>
        asset.maTsDg === maTsDg
    )
  }

  return getAssets(
    dataset
  ).find(
    (asset) =>
      asset.maTsDg === maTsDg
  )
}


export function getReportingPeriods(
  dataset = MOCK_DATASET
) {
  if (canCacheDataset(dataset) && reportingPeriodsCache.has(dataset)) {
    return reportingPeriodsCache.get(dataset)
  }

  const {
    valuationSnapshots = [],
    collateralSnapshots = [],
    valuationRisks = [],
  } = dataset

  const periods = [
    ...valuationSnapshots.map(
      (item) => item.kyBaoCao
    ),

    ...collateralSnapshots.map(
      (item) => item.kyBaoCao
    ),

    ...valuationRisks.map(
      (item) => item.kyBaoCao
    ),
  ].filter(Boolean)

  const result = [
    ...new Set(periods),
  ].sort()

  if (canCacheDataset(dataset)) {
    reportingPeriodsCache.set(dataset, result)
  }

  return result
}


export function getAssetsByReportingPeriod(
  kyBaoCao,
  dataset = MOCK_DATASET
) {
  const cacheKey = kyBaoCao ?? '__NO_PERIOD__'
  if (canCacheDataset(dataset)) {
    const datasetCache = periodAssetsCache.get(dataset)
    if (datasetCache?.has(cacheKey)) {
      return datasetCache.get(cacheKey)
    }
  }

  const {
    valuationSnapshots = [],
    collateralAssets = [],
    collateralSnapshots = [],
    valuationRisks = [],
    collateralCustomers = [],
    customers = [],
  } = dataset

  const assets = getAssets(dataset)

  /*
   * PERFORMANCE V2.6
   * Tạo index cho đúng kỳ một lần, thay vì .find/.filter toàn bộ mảng
   * cho từng tài sản.
   */
  const valuationSnapshotByRecordId = new Map()
  valuationSnapshots.forEach((item) => {
    if (
      item.kyBaoCao === kyBaoCao &&
      item.valuationRecordId
    ) {
      valuationSnapshotByRecordId.set(
        item.valuationRecordId,
        item
      )
    }
  })

  const periodRisksByRecordId = new Map()
  valuationRisks.forEach((item) => {
    if (
      item.kyBaoCao !== kyBaoCao ||
      !item.valuationRecordId
    ) {
      return
    }
    if (
      !periodRisksByRecordId.has(
        item.valuationRecordId
      )
    ) {
      periodRisksByRecordId.set(
        item.valuationRecordId,
        []
      )
    }
    periodRisksByRecordId
      .get(item.valuationRecordId)
      .push(item)
  })

  const collateralByValuationRecordId = new Map()
  collateralAssets.forEach((item) => {
    if (
      item.valuationRecordId &&
      !collateralByValuationRecordId.has(
        item.valuationRecordId
      )
    ) {
      collateralByValuationRecordId.set(
        item.valuationRecordId,
        item
      )
    }
  })

  const snapshotByCollateralRecordId = new Map()
  collateralSnapshots.forEach((item) => {
    if (
      item.kyBaoCao === kyBaoCao &&
      item.collateralRecordId
    ) {
      snapshotByCollateralRecordId.set(
        item.collateralRecordId,
        item
      )
    }
  })

  const relationsByCollateralRecordId = new Map()
  collateralCustomers.forEach((item) => {
    if (!item.collateralRecordId) return
    const inPeriod =
      (item.tuNgay === null ||
        item.tuNgay === undefined ||
        item.tuNgay <= kyBaoCao) &&
      (item.denNgay === null ||
        item.denNgay === undefined ||
        item.denNgay >= kyBaoCao)

    if (!inPeriod) return

    if (
      !relationsByCollateralRecordId.has(
        item.collateralRecordId
      )
    ) {
      relationsByCollateralRecordId.set(
        item.collateralRecordId,
        []
      )
    }
    relationsByCollateralRecordId
      .get(item.collateralRecordId)
      .push(item)
  })

  const customerByCif = new Map(
    customers.map((item) => [item.cif, item])
  )

  const result = assets
    .map((asset) => {
      const valuationSnapshot =
        valuationSnapshotByRecordId.get(
          asset.recordId
        )

      if (!valuationSnapshot) {
        return null
      }

      const periodRisks =
        periodRisksByRecordId.get(
          asset.recordId
        ) || []

      const collateral =
        collateralByValuationRecordId.get(
          asset.recordId
        ) || null

      const periodCustomers =
        collateral
          ? relationsByCollateralRecordId.get(
              collateral.recordId
            ) || []
          : []

      const periodCustomerDetails =
        periodCustomers.map((relation) => {
          const customer =
            customerByCif.get(relation.cif)

          return {
            ...relation,
            tenKhachHang:
              customer?.tenKhachHang ?? null,
            loaiKhachHang:
              customer?.loaiKhachHang ?? null,
          }
        })

      const snapshot =
        collateral
          ? snapshotByCollateralRecordId.get(
              collateral.recordId
            ) || null
          : null

      if (!snapshot) {
        return {
          ...asset,
          gtDinhGia:
            valuationSnapshot.gtDinhGia,
          ngayDinhGia:
            valuationSnapshot.ngayDinhGia,
          donViDinhGia:
            valuationSnapshot.donViDinhGia,
          maTsbd: null,
          cifs: [],
          customers: [],
          ngayNhanTsbd: null,
          gtBaoDam: 0,
          duNoTsbd: 0,
          ltv: null,
          thanhKhoan: null,
          trangThaiTsbd: null,
          ngayGiaiChap: null,
          donViQuanLy: null,
          isActiveCollateral: false,
          risks: periodRisks,
          coRuiRoDinhGia:
            periodRisks.length > 0,
        }
      }

      const ltv =
        valuationSnapshot.gtDinhGia > 0
          ? snapshot.gtBaoDam /
            valuationSnapshot.gtDinhGia
          : null

      return {
        ...asset,
        gtDinhGia:
          valuationSnapshot.gtDinhGia,
        ngayDinhGia:
          valuationSnapshot.ngayDinhGia,
        donViDinhGia:
          valuationSnapshot.donViDinhGia,
        maTsbd: snapshot.maTsbd,
        cifs: periodCustomers.map(
          (item) => item.cif
        ),
        customers: periodCustomerDetails,
        ngayNhanTsbd:
          snapshot.ngayNhanTsbd ??
          collateral?.ngayNhanTsbd ??
          null,
        gtBaoDam: snapshot.gtBaoDam ?? 0,
        duNoTsbd: snapshot.duNoTsbd ?? 0,
        ltv,
        thanhKhoan:
          snapshot.thanhKhoan ?? null,
        trangThaiTsbd:
          snapshot.trangThaiTsbd ?? null,
        ngayGiaiChap:
          snapshot.ngayGiaiChap ??
          collateral?.ngayGiaiChap ??
          null,
        donViQuanLy:
          snapshot.donViQuanLy ?? null,
        isActiveCollateral:
          snapshot.trangThaiTsbd !==
            'Đã giải chấp',
        risks: periodRisks,
        coRuiRoDinhGia:
          periodRisks.length > 0,
      }
    })
    .filter(Boolean)

  if (canCacheDataset(dataset)) {
    let datasetCache = periodAssetsCache.get(dataset)
    if (!datasetCache) {
      datasetCache = new Map()
      periodAssetsCache.set(dataset, datasetCache)
    }
    datasetCache.set(cacheKey, result)
  }

  return result
}

export function getCurrentAssets(
  dataset = MOCK_DATASET
) {
  return getAssetsByReportingPeriod(
    undefined,
    dataset
  )
}


export function getCollateralSnapshotByPeriodAndAsset(
  maTsDg,
  kyBaoCao,
  dataset = MOCK_DATASET
) {
  const {
    collateralSnapshots = [],
  } = dataset

  return (
    collateralSnapshots.find(
      (item) =>
        item.maTsDg === maTsDg &&
        item.kyBaoCao === kyBaoCao
    ) || null
  )
}
