import { customers as mockCustomers } from '../data/customers'
import { valuationSnapshots as mockValuationSnapshots } from '../data/valuationSnapshots'
import { valuationAssets as mockValuationAssets } from '../data/valuationAssets'
import { collateralAssets as mockCollateralAssets } from '../data/collateralAssets'
import { valuationRisks as mockValuationRisks } from '../data/valuationRisks'
import { collateralSnapshots as mockCollateralSnapshots } from '../data/collateralSnapshots'
import { collateralCustomers as mockCollateralCustomers } from '../data/collateralCustomers'


/*
 * Bộ dữ liệu mặc định của GreenNode.
 *
 * Nếu App không truyền dataset vào,
 * assetService vẫn dùng MOCK như hiện tại.
 */
const MOCK_DATASET = {
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
  const {
    valuationAssets = [],
    collateralAssets = [],
    collateralCustomers = [],
    customers = [],
    valuationRisks = [],
  } = dataset

  return valuationAssets.map(
    (valuationAsset) => {
      const collateral =
        collateralAssets.find(
          (item) =>
            item.valuationRecordId ===
            valuationAsset.recordId
        )

      const customerRelations =
        collateral
          ? collateralCustomers.filter(
              (item) =>
                item.collateralRecordId ===
                collateral.recordId
            )
          : []

      const customerDetails =
        customerRelations.map(
          (relation) => {
            const customer =
              customers.find(
                (item) =>
                  item.cif === relation.cif
              )

            return {
              ...relation,

              tenKhachHang:
                customer?.tenKhachHang ??
                null,

              loaiKhachHang:
                customer?.loaiKhachHang ??
                null,
            }
          }
        )

      const risks =
        valuationRisks.filter(
          (item) =>
            item.valuationRecordId ===
            valuationAsset.recordId
        )

      const ltv =
        collateral &&
        valuationAsset.gtDinhGia > 0
          ? collateral.gtBaoDam /
            valuationAsset.gtDinhGia
          : null

      return {
        ...valuationAsset,

        maTsbd:
          collateral?.maTsbd ?? null,

        cifs:
          customerRelations.map(
            (item) => item.cif
          ),

        customers: customerDetails,

        ngayNhanTsbd:
          collateral?.ngayNhanTsbd ??
          null,

        gtBaoDam:
          collateral?.gtBaoDam ?? 0,

        duNoTsbd:
          collateral?.duNoTsbd ?? 0,

        ltv,

        thanhKhoan:
          collateral?.thanhKhoan ??
          null,

        trangThaiTsbd:
          collateral?.trangThaiTsbd ??
          null,

        ngayGiaiChap:
          collateral?.ngayGiaiChap ??
          null,

        donViQuanLy:
          collateral?.donViQuanLy ??
          null,

        risks,

        coRuiRoDinhGia:
          risks.length > 0,
      }
    }
  )
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

  return [
    ...new Set(periods),
  ].sort()
}


export function getAssetsByReportingPeriod(
  kyBaoCao,
  dataset = MOCK_DATASET
) {
  const {
    valuationSnapshots = [],
    collateralAssets = [],
    collateralSnapshots = [],
    valuationRisks = [],
    collateralCustomers = [],
    customers = [],
  } = dataset

  const assets =
    getAssets(dataset)

  const periodValuationSnapshots =
    valuationSnapshots.filter(
      (item) =>
        item.kyBaoCao === kyBaoCao
    )

  return assets
    .map((asset) => {
      const valuationSnapshot =
        periodValuationSnapshots.find(
          (item) =>
            item.valuationRecordId ===
            asset.recordId
        )

      if (!valuationSnapshot) {
        return null
      }

      const periodRisks =
        valuationRisks.filter(
          (item) =>
            item.kyBaoCao === kyBaoCao &&
            item.valuationRecordId ===
              asset.recordId
        )

      const collateral =
        collateralAssets.find(
          (item) =>
            item.valuationRecordId ===
            asset.recordId
        )

      const periodCustomers =
        collateral
          ? collateralCustomers.filter(
              (item) =>
                item.collateralRecordId ===
                  collateral.recordId &&
                (
                  item.tuNgay === null ||
                  item.tuNgay === undefined ||
                  item.tuNgay <= kyBaoCao
                ) &&
                (
                  item.denNgay === null ||
                  item.denNgay === undefined ||
                  item.denNgay >= kyBaoCao
                )
            )
          : []

      const periodCustomerDetails =
        periodCustomers.map(
          (relation) => {
            const customer =
              customers.find(
                (item) =>
                  item.cif === relation.cif
              )

            return {
              ...relation,

              tenKhachHang:
                customer?.tenKhachHang ??
                null,

              loaiKhachHang:
                customer?.loaiKhachHang ??
                null,
            }
          }
        )

      const snapshot =
        collateral
          ? collateralSnapshots.find(
              (item) =>
                item.kyBaoCao ===
                  kyBaoCao &&
                item.collateralRecordId ===
                  collateral.recordId
            )
          : null

      /*
       * Không có snapshot TSBĐ tại kỳ này:
       * tài sản vẫn tồn tại trong dữ liệu định giá,
       * nhưng không mang dữ liệu TSBĐ
       * của kỳ khác sang.
       */
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

      /*
       * Có snapshot TSBĐ:
       * định giá lấy đúng kỳ,
       * TSBĐ lấy đúng snapshot cùng kỳ.
       */
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

        maTsbd:
          snapshot.maTsbd,

        cifs:
          periodCustomers.map(
            (item) => item.cif
          ),

        customers:
          periodCustomerDetails,

        ngayNhanTsbd:
          snapshot.ngayNhanTsbd ??
          collateral?.ngayNhanTsbd ??
          null,

        gtBaoDam:
          snapshot.gtBaoDam,

        duNoTsbd:
          snapshot.duNoTsbd,

        ltv,

        thanhKhoan:
          snapshot.thanhKhoan,

        trangThaiTsbd:
          snapshot.trangThaiTsbd,

        ngayGiaiChap:
          snapshot.ngayGiaiChap ??
          collateral?.ngayGiaiChap ??
          null,

        isActiveCollateral:
          snapshot.trangThaiTsbd ===
          'Đang bảo đảm',

        donViQuanLy:
          snapshot.donViQuanLy,

        risks: periodRisks,

        coRuiRoDinhGia:
          periodRisks.length > 0,
      }
    })
    .filter(Boolean)
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
