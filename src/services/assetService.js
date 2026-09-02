import { customers } from '../data/customers'
import { valuationSnapshots } from '../data/valuationSnapshots'
import { valuationAssets } from '../data/valuationAssets'
import { collateralAssets } from '../data/collateralAssets'
import { valuationRisks } from '../data/valuationRisks'
import { collateralSnapshots } from '../data/collateralSnapshots'
import { collateralCustomers } from '../data/collateralCustomers'


export function getAssets() {
  return valuationAssets.map((valuationAsset) => {
    const collateral = collateralAssets.find(
      (item) =>
        item.valuationRecordId === valuationAsset.recordId
    )
const customerRelations = collateral
  ? collateralCustomers.filter(
      (item) =>
        item.collateralRecordId === collateral.recordId
    )
  : []
  const customerDetails = customerRelations.map(
  (relation) => {
    const customer = customers.find(
      (item) =>
        item.cif === relation.cif
    )

    return {
      ...relation,
      tenKhachHang:
        customer?.tenKhachHang ?? null,
      loaiKhachHang:
        customer?.loaiKhachHang ?? null,
    }
  }
)
    const risks = valuationRisks.filter(
  (item) =>
    item.valuationRecordId ===
    valuationAsset.recordId
)

    const ltv =
      collateral && valuationAsset.gtDinhGia > 0
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

      gtBaoDam:
        collateral?.gtBaoDam ?? 0,

      duNoTsbd:
        collateral?.duNoTsbd ?? 0,

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
  })
}


export function getAssetById(
  maTsDg,
  kyBaoCao = null
) {
  if (kyBaoCao) {
    return getAssetsByReportingPeriod(
      kyBaoCao
    ).find(
      (asset) =>
        asset.maTsDg === maTsDg
    )
  }

  return getAssets().find(
    (asset) =>
      asset.maTsDg === maTsDg
  )
}


export function getReportingPeriods() {
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
  ]

  return [...new Set(periods)].sort()
}


export function getAssetsByReportingPeriod(
  kyBaoCao
) {
  const assets = getAssets()

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
const periodCustomers = collateral
  ? collateralCustomers.filter(
      (item) =>
        item.collateralRecordId ===
          collateral.recordId &&
        item.tuNgay <= kyBaoCao &&
        (
          item.denNgay === null ||
          item.denNgay >= kyBaoCao
        )
    )
  : []
  const periodCustomerDetails =
  periodCustomers.map((relation) => {
    const customer = customers.find(
      (item) =>
        item.cif === relation.cif
    )

    return {
      ...relation,
      tenKhachHang:
        customer?.tenKhachHang ?? null,
      loaiKhachHang:
        customer?.loaiKhachHang ?? null,
    }
  })
      const snapshot = collateral
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
       * nhưng không được mang dữ liệu TSBĐ
       * hiện tại ngược về kỳ quá khứ.
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
       * GT định giá lấy đúng kỳ định giá.
       * GT bảo đảm / dư nợ / thanh khoản /
       * trạng thái / đơn vị quản lý
       * lấy đúng snapshot TSBĐ cùng kỳ.
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

        maTsbd:
          snapshot.maTsbd,

       cifs: periodCustomers.map(
  (item) => item.cif
),
customers: periodCustomerDetails,

        ngayNhanTsbd:
          collateral?.ngayNhanTsbd ?? null,

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