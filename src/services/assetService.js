import { valuationSnapshots } from '../data/valuationSnapshots'
import { valuationAssets } from '../data/valuationAssets'
import { collateralAssets } from '../data/collateralAssets'
import { valuationRisks } from '../data/valuationRisks'
import { collateralSnapshots } from '../data/collateralSnapshots'

export function getAssets() {
  return valuationAssets.map((valuationAsset) => {
    const collateral = collateralAssets.find(
      (item) => item.maTsDg === valuationAsset.maTsDg
    )

    const risks = valuationRisks.filter(
      (item) => item.maTsDg === valuationAsset.maTsDg
    )

    const ltv =
      collateral && valuationAsset.gtDinhGia > 0
        ? collateral.gtBaoDam / valuationAsset.gtDinhGia
        : null

    return {
      ...valuationAsset,

      maTsbd: collateral?.maTsbd ?? null,
      cif: collateral?.cif ?? null,
      ngayNhanTsbd: collateral?.ngayNhanTsbd ?? null,
      gtBaoDam: collateral?.gtBaoDam ?? 0,
      duNoTsbd: collateral?.duNoTsbd ?? 0,
      ltv,
      thanhKhoan: collateral?.thanhKhoan ?? null,
      trangThaiTsbd: collateral?.trangThaiTsbd ?? null,
      ngayGiaiChap: collateral?.ngayGiaiChap ?? null,
      donViQuanLy: collateral?.donViQuanLy ?? null,

      risks,
      coRuiRoDinhGia: risks.length > 0,
    }
  })
}

export function getAssetById(maTsDg) {
  return getAssets().find(
    (asset) => asset.maTsDg === maTsDg
  )
}
export function getReportingPeriods() {
  return [
    ...new Set(
      collateralSnapshots.map(
        (item) => item.kyBaoCao
      )
    ),
  ].sort()
}

export function getAssetsByReportingPeriod(kyBaoCao) {
  const assets = getAssets()

  const periodValuationSnapshots =
    valuationSnapshots.filter(
      (item) => item.kyBaoCao === kyBaoCao
    )

  return assets
    .map((asset) => {
      const valuationSnapshot =
        periodValuationSnapshots.find(
          (item) => item.maTsDg === asset.maTsDg
        )

      if (!valuationSnapshot) {
        return null
      }

      const periodRisks = valuationRisks.filter(
        (item) =>
          item.kyBaoCao === kyBaoCao &&
          item.maTsDg === asset.maTsDg
      )

      const snapshot = collateralSnapshots.find(
        (item) =>
          item.kyBaoCao === kyBaoCao &&
          item.maTsDg === asset.maTsDg
      )

      if (!snapshot) {
        return {
          ...asset,
          gtDinhGia: valuationSnapshot.gtDinhGia,
          maTsbd: null,
          gtBaoDam: 0,
          duNoTsbd: 0,
          ltv: null,
          trangThaiTsbd: null,

          risks: periodRisks,
          coRuiRoDinhGia: periodRisks.length > 0,
        }
      }

      const ltv =
        valuationSnapshot.gtDinhGia > 0
          ? snapshot.gtBaoDam /
            valuationSnapshot.gtDinhGia
          : null

      return {
        ...asset,
        gtDinhGia: valuationSnapshot.gtDinhGia,
        maTsbd: snapshot.maTsbd,
        gtBaoDam: snapshot.gtBaoDam,
        duNoTsbd: snapshot.duNoTsbd,
        ltv,
        trangThaiTsbd: snapshot.trangThaiTsbd,

        risks: periodRisks,
        coRuiRoDinhGia: periodRisks.length > 0,
      }
    })
    .filter(Boolean)
}