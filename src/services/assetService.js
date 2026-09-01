import { valuationSnapshots } from '../data/valuationSnapshots'
import { valuationAssets } from '../data/valuationAssets'
import { collateralAssets } from '../data/collateralAssets'
import { valuationRisks } from '../data/valuationRisks'
import { collateralSnapshots } from '../data/collateralSnapshots'


export function getAssets() {
  return valuationAssets.map((valuationAsset) => {
    const collateral = collateralAssets.find(
      (item) =>
        item.valuationRecordId === valuationAsset.recordId
    )

    const risks = valuationRisks.filter(
      (item) =>
        item.maTsDg === valuationAsset.maTsDg
    )

    const ltv =
      collateral && valuationAsset.gtDinhGia > 0
        ? collateral.gtBaoDam /
          valuationAsset.gtDinhGia
        : null

    return {
      ...valuationAsset,

      maTsbd: collateral?.maTsbd ?? null,
      cif: collateral?.cif ?? null,
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
            item.maTsDg === asset.maTsDg
        )

      const collateral =
        collateralAssets.find(
          (item) =>
            item.valuationRecordId ===
            asset.recordId
        )

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

          maTsbd: null,
          cif: null,
          ngayNhanTsbd: null,

          gtBaoDam: 0,
          duNoTsbd: 0,
          ltv: null,

          thanhKhoan: null,
          trangThaiTsbd: null,
          ngayGiaiChap: null,
          donViQuanLy: null,

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

        cif:
          collateral?.cif ?? null,

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
          collateral?.ngayGiaiChap ?? null,

        donViQuanLy:
          snapshot.donViQuanLy,

        risks: periodRisks,
        coRuiRoDinhGia:
          periodRisks.length > 0,
      }
    })
    .filter(Boolean)
}