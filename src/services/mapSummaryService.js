export function buildProvinceSummaries(assets = []) {
  return Array.from(
    assets.reduce((map, asset) => {
      const latitude = Number(asset?.latitude)
      const longitude = Number(asset?.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return map

      const key = asset.tinhTp || 'Chưa xác định'
      const current = map.get(key) || {
        province: key,
        total: 0,
        risk: 0,
        latitudeSum: 0,
        longitudeSum: 0,
      }

      current.total += 1
      if (Array.isArray(asset.risks) && asset.risks.length > 0) current.risk += 1
      current.latitudeSum += latitude
      current.longitudeSum += longitude
      map.set(key, current)
      return map
    }, new Map()).values()
  ).map((item) => ({
    province: item.province,
    total: item.total,
    risk: item.risk,
    latitude: item.latitudeSum / item.total,
    longitude: item.longitudeSum / item.total,
  }))
}
