import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet'

import MarkerClusterGroup from 'react-leaflet-cluster'
import { useLeafletContext } from '@react-leaflet/core'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { prepareMapData } from '../services/coordinateProvenanceService.js'
import {
  buildCoordinateGroups,
  coordinateGroupRiskCount,
  coordinateKey,
  hasRisk,
} from '../services/coordinateLocationService.js'
import { mark, perfEnabled } from '../services/mapPerfMarks.js'

delete L.Icon.Default.prototype._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

/* ===== TEMP PROFILE (10K general-filter perf UAT) — REMOVE BEFORE SHIP ===== */
const gnT = {
  on() {
    try {
      return !!(typeof window !== 'undefined' && window.__GN_PROFILE__ && window.__GN_PROFILE__.enabled)
    } catch { return false }
  },
  begin(ev) { if (!this.on()) return; const s = window.__GN_PROFILE__; (s._t = s._t || {})[ev] = performance.now() },
  end(ev) { if (!this.on()) return; const s = window.__GN_PROFILE__; const t = (s._t || {})[ev]; if (typeof t !== 'number') return; if (s._t) delete s._t[ev]; s.events.push({ ev, delta: performance.now() - t }) },
  event(ev) { if (!this.on()) return; window.__GN_PROFILE__.events.push({ ev, at: performance.now() }) },
  count(ev) { if (!this.on()) return; const s = window.__GN_PROFILE__; s.counts[ev] = (s.counts[ev] || 0) + 1 },
}
/* ===== END TEMP PROFILE ===== */

const safeAssetIcon = L.divIcon({
  className: 'asset-risk-marker-wrapper',
  html: `
    <div class="asset-risk-marker asset-risk-marker-safe">
      <div class="asset-risk-marker-dot"></div>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -38],
})

const riskyAssetIcon = L.divIcon({
  className: 'asset-risk-marker-wrapper',
  html: `
    <div class="asset-risk-marker asset-risk-marker-risk">
      <div class="asset-risk-marker-dot"></div>
    </div>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -38],
})

function MapUpdater({
  fitAssets,
  selectionAssets,
  selectedAssetId,
  markerRefs,
  viewResetKey,
  mapApiRef,
}) {
  const map = useMap()

  // Cho phép các handler click trong AssetMap dùng cùng instance Leaflet
  // để drill-down (zoom/fit) mà không phải giữ map ở state cha.
  useEffect(() => {
    if (mapApiRef) {
      mapApiRef.current = map
    }
    // Debug/e2e handle: cho phép script kiểm thử ngoài truy cập instance map.
    window.__GN_MAP__ = map
  }, [map, mapApiRef])
  // Khi bộ dữ liệu / bộ lọc thay đổi:
  // luôn hiển thị tổng quan các tài sản đang có trên map.
  // Lưu ý: KHÔNG phụ thuộc viewResetKey — Xóa lọc không cần reset lại
  // viewport (một zoom-out toàn bộ 10.000 marker trên cây cluster sẽ
  // gây nghẽn main thread hàng chục giây).
  //
  // V2.6.7 PERF (10K general filter): fitBounds kéo theo MarkerClusterGroup
  // dựng lại toàn cây cụm trên 10.000 marker. Chạy ngay trong effect của lần
  // render bộ lọc làm chuỗi filter bị nghẽn 0.6-1.7s. Defer sang frame kế tiếp:
  // ClusterMarkets đồng bộ marker ở frame N, fitBounds chạy ở frame N+1 —
  // tách khỏi luồng render React, main thread không bị chặn khi đổi lọc.
  const fitRafOuterRef = useRef(null)
  const fitRafInnerRef = useRef(null)
  useEffect(() => {
    if (fitRafOuterRef.current) cancelAnimationFrame(fitRafOuterRef.current)
    if (fitRafInnerRef.current) cancelAnimationFrame(fitRafInnerRef.current)

    fitRafOuterRef.current = requestAnimationFrame(() => {
      fitRafInnerRef.current = requestAnimationFrame(() => {
        if (fitAssets.length === 0) {
          gnT.count('map:setView')
          map.setView([16, 106], 5, { animate: false })
          return
        }

        const validPoints = fitAssets
          .filter((asset) =>
            Number.isFinite(Number(asset.latitude)) &&
            Number.isFinite(Number(asset.longitude))
          )
          .map((asset) => [Number(asset.latitude), Number(asset.longitude)])

        if (validPoints.length === 0) {
          gnT.count('map:setView')
          map.setView([16, 106], 5, { animate: false })
          return
        }

        // Invalidate first: importing Excel often changes panel dimensions.
        // Fitting after that prevents a stale deep-zoom viewport from surviving.
        gnT.count('map:invalidateSize')
        map.invalidateSize({ animate: false })
        const bounds = L.latLngBounds(validPoints)
        gnT.count('map:fitBounds')
        map.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: validPoints.length > 1 ? 7 : 9,
          animate: false,
        })
        gnT.event('map:fit-onto-' + validPoints.length + '-points')
      })
    })

    return () => {
      if (fitRafOuterRef.current) cancelAnimationFrame(fitRafOuterRef.current)
      if (fitRafInnerRef.current) cancelAnimationFrame(fitRafInnerRef.current)
    }
  }, [fitAssets, map])

  // Chỉ cần đóng popup cũ khi bộ lọc bị xóa / view được reset —
  // rẻ, không kéo theo zoom-out toàn bộ cây cluster.
  useEffect(() => {
    gnT.count('map:closePopup')
    map.closePopup()
  }, [map, viewResetKey])

  // Chỉ zoom sâu khi người dùng thực sự chọn một tài sản.
  useEffect(() => {
    if (!selectedAssetId) {
      return
    }

    const selectedAsset = selectionAssets.find(
      (asset) =>
        asset.maTsDg === selectedAssetId
    )

    if (
      !selectedAsset ||
      !selectedAsset.latitude ||
      !selectedAsset.longitude
    ) {
      return
    }

    map.flyTo(
      [
        selectedAsset.latitude,
        selectedAsset.longitude,
      ],
      15,
      {
        duration: 1,
      }
    )
    gnT.count('map:flyTo')

    const timeoutId = setTimeout(() => {
      markerRefs.current[
        selectedAssetId
      ]?.openPopup()
    }, 1000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [
    selectedAssetId,
    selectionAssets,
    map,
    markerRefs,
  ])

  // V2.6.7 perf mark: dataset -> map usable (fitBounds đã hoàn tất).
  useEffect(() => {
    if (!perfEnabled()) return
    mark('map:dataset-usable', {
      fitPoints:
        (fitAssets || []).filter((asset) =>
          Number.isFinite(Number(asset.latitude)) &&
          Number.isFinite(Number(asset.longitude))
        ).length,
    })
  }, [fitAssets, map])

  return null
}

function MapResizeHandler() {
  const map = useMap()

  useEffect(() => {
    const container =
      map.getContainer()

    const resizeObserver =
      new ResizeObserver(() => {
        map.invalidateSize({
          animate: false,
        })
      })

    resizeObserver.observe(container)

    const timeoutId =
      setTimeout(() => {
        map.invalidateSize({
          animate: false,
        })
      }, 300)

    return () => {
      resizeObserver.disconnect()
      clearTimeout(timeoutId)
    }
  }, [map])

  return null
}

const createRiskClusterIconFor = (valuationRisk) => (cluster) => {
  const childMarkers =
    cluster.getAllChildMarkers()

  const totalCount =
    cluster.getChildCount()

  const riskCount =
    childMarkers.filter(
      (marker) =>
        marker.options.icon === riskyAssetIcon
    ).length

  const isAllRiskMode =
    valuationRisk === 'Tất cả'

  const isNoRiskMode =
    valuationRisk === 'Không phát hiện'

  let clusterClass =
    'risk-cluster-neutral'

  let badgeCount = 0

  if (isAllRiskMode) {
    clusterClass =
      'risk-cluster-neutral'

    badgeCount = riskCount
  } else if (isNoRiskMode) {
    clusterClass =
      'risk-cluster-safe'
  } else {
    clusterClass =
      'risk-cluster-risk'
  }

  return L.divIcon({
    html: `
      <div
        class="
          risk-cluster
          ${clusterClass}
        "
      >
        <span class="risk-cluster-total">
          ${totalCount}
        </span>

        ${
          isAllRiskMode &&
          badgeCount > 0
            ? `
              <span class="risk-cluster-badge">
                ${badgeCount}
              </span>
            `
            : ''
        }
      </div>
    `,
    className:
      'risk-cluster-wrapper',
    iconSize: [46, 46],
  })
}

// Các marker tài sản là phần rất nặng (10.000 phần tử). Chúng KHÔNG phụ
// thuộc selectedAssetId / viewResetKey / các thay đổi chỉ gây re-render
// AssetMap (vd Xóa lọc). Memo hóa để Xóa lọc không phải reconcile lại toàn
// bộ cây marker — khi đó click "Xóa lọc" chỉ tốn vài trăm ms thay vì hàng
// chục giây nghẽn main thread.
//
// V2.6.7 PERF (10K general filter): trước đây mỗi lần đổi filter, React
// tái tạo lại toàn bộ cây <Marker> (hàng ngàn fiber) bên trong
// <MarkerClusterGroup> — đo được freeze 1.6s (1.667 TS) tới 13.7s (10.000 TS).
// Thay bằng ClusterMarkets: đúng MỘT <MarkerClusterGroup> (giữ nguyên clustering,
// spiderfyOnMaxZoom, iconCreateFunction), còn các marker được quản lý
// imperatively bằng Leaflet — CHỈ diff phần dân số thay đổi, không tái dựng
// lại React element cho 10.000 phần tử.
const buildAssetPopupContent = (asset, changeType, onViewDetailRef, coordinateGroup) => {
  const root = document.createElement('div')

  const title = document.createElement('div')
  title.className = 'popup-title'
  title.textContent = asset.maTsDg

  const subtitle = document.createElement('div')
  subtitle.className = 'popup-subtitle'
  subtitle.textContent = `${asset.loaiTsCap2 || ''} · ${asset.tinhTp || ''}`

  root.append(title, subtitle)

  const row = (label, valueText) => {
    const r = document.createElement('div')
    r.className = 'popup-row'
    const s = document.createElement('span')
    s.textContent = label
    const strong = document.createElement('strong')
    strong.textContent = valueText
    r.append(s, strong)
    return r
  }

  root.append(
    row('Vị trí', asset.diaChiChiTiet || asset.tinhTp || 'Chưa xác định'),
    row(
      'Tọa độ',
      `${Number(asset.latitude).toFixed(5)}, ${Number(asset.longitude).toFixed(5)}`
    ),
    row('GT định giá', `${(asset.gtDinhGia / 1000000000).toFixed(1)} tỷ`),
    row(
      'Dư nợ',
      asset.duNoTsbd > 0
        ? `${(asset.duNoTsbd / 1000000000).toFixed(1)} tỷ`
        : '—'
    )
  )

  if (
    Array.isArray(asset.risks) &&
    asset.risks.length > 0
  ) {
    const riskBlock = document.createElement('div')
    riskBlock.className = 'popup-risk-block'

    const riskTitle = document.createElement('div')
    riskTitle.className = 'popup-risk-title'
    riskTitle.textContent = 'Rủi ro phát hiện'
    riskBlock.append(riskTitle)

    for (const risk of asset.risks) {
      const item = document.createElement('div')
      item.className = 'popup-risk-item'

      const strong = document.createElement('strong')
      strong.textContent = risk.loaiRuiRo
      item.append(strong)

      if (risk.ghiChu) {
        const span = document.createElement('span')
        span.textContent = risk.ghiChu
        item.append(span)
      }

      riskBlock.append(item)
    }

    root.append(riskBlock)
  }

  if (changeType !== 'Tất cả') {
    root.append(row('Biến động', changeType))
  }

  if (
    Array.isArray(coordinateGroup) &&
    coordinateGroup.length > 1
  ) {
    const hasGroupRisk = coordinateGroup.some((item) => hasRisk(item))
    const groupRiskCount = coordinateGroupRiskCount(coordinateGroup)

    const locationInfo = document.createElement('div')
    locationInfo.className = 'popup-location-info'

    const countLabel = document.createElement('strong')
    countLabel.className = 'popup-location-count'
    countLabel.textContent =
      `${coordinateGroup.length} TSBĐ tại vị trí này`

    const riskLabel = document.createElement('span')
    riskLabel.className =
      `popup-location-risk ${hasGroupRisk ? 'has-risk' : 'no-risk'}`
    riskLabel.textContent = hasGroupRisk
      ? `Có rủi ro phát hiện (${groupRiskCount})`
      : 'Không phát hiện rủi ro'

    locationInfo.append(countLabel, riskLabel)

    const list = document.createElement('div')
    list.className = 'popup-asset-list'

    for (const sibling of coordinateGroup) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className =
        `popup-asset-row ${hasRisk(sibling) ? 'has-risk' : ''}`

      const dot = document.createElement('span')
      dot.className =
        `popup-asset-risk-dot ${hasRisk(sibling) ? 'risk' : 'safe'}`

      const code = document.createElement('span')
      code.className = 'popup-asset-row-code'
      code.textContent = sibling.maTsDg

      const name = document.createElement('span')
      name.className = 'popup-asset-row-name'
      name.textContent =
        sibling.tenTaiSan ||
        sibling.loaiTsCap2 ||
        ''

      item.append(dot, code, name)
      item.addEventListener('click', (event) => {
        event.stopPropagation()
        onViewDetailRef.current?.(sibling)
      })
      list.append(item)
    }

    root.append(locationInfo, list)
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'popup-detail-button'
  button.textContent = 'Xem chi tiết'
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onViewDetailRef.current?.(asset)
  })

  root.append(button)

  return root
}

function ClusterMarkets({
  assets,
  changeType,
  onMarkerClick,
  onViewDetail,
  markerRefs,
}) {
  const context = useLeafletContext()
  const mcgRef = useRef(null)
  const markerMapRef = useRef(new Map())

  const onMarkerClickRef = useRef(onMarkerClick)
  const onViewDetailRef = useRef(onViewDetail)
  const changeTypeRef = useRef(changeType)
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick
  }, [onMarkerClick])
  useEffect(() => {
    onViewDetailRef.current = onViewDetail
  }, [onViewDetail])
  useEffect(() => {
    changeTypeRef.current = changeType
  }, [changeType])

  // layerContainer trong context được react-leaflet-cluster set = instance
  // L.MarkerClusterGroup của <MarkerClusterGroup> bao ngoài.
  useEffect(() => {
    const mcg = context.layerContainer
    if (mcg && mcg !== mcgRef.current) {
      mcgRef.current = mcg
    }
  }, [context.layerContainer])

  const assetsRef = useRef(assets)
  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  const coordinateGroups = useMemo(
    () => buildCoordinateGroups(assets),
    [assets]
  )
  const coordinateGroupsRef = useRef(coordinateGroups)
  useEffect(() => {
    coordinateGroupsRef.current = coordinateGroups
  }, [coordinateGroups])

  // V2.6.7 PERF (10K general filter): diff marker theo dân số lọc mới gây
  // removeLayers/addLayers hàng nghìn marker + dựng lại cụm ngay trong effect.
  // Defer sang rAF để lần render bộ lọc không chặn main thread (0.6-1.7s),
  // KPI/table/notification cập nhật tức thì, map chỉ nhanh về sau 1 frame.
  // assetsRef đảm bảo luôn diff theo dân số lọc MỚI NHẤT khi rAF chạy.
  const syncRafRef = useRef(null)
  useEffect(() => {
    if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current)
    const mcg = mcgRef.current
    if (!mcg) {
      return
    }

    syncRafRef.current = requestAnimationFrame(() => {
      const markerMap = markerMapRef.current
      const currentAssets = assetsRef.current
      const wanted = new Set()
      const toAdd = []

      // 1) Giữ/đồng bộ marker còn trong dân số lọc mới.
      for (const asset of currentAssets) {
        const id = asset.maTsDg
        wanted.add(id)

        let marker = markerMap.get(id)

        if (!marker) {
          marker = L.marker(
            [asset.latitude, asset.longitude],
            {
              icon:
                Array.isArray(asset.risks) &&
                asset.risks.length > 0
                  ? riskyAssetIcon
                  : safeAssetIcon,
            }
          )
          markerMap.set(id, marker)

          marker.on('click', () => {
            mark('map:marker-click')
            onMarkerClickRef.current?.([id])
          })

          marker.bindPopup(
            buildAssetPopupContent(
              asset,
              changeTypeRef.current,
              onViewDetailRef,
              coordinateGroupsRef.current.get(
                coordinateKey(asset.latitude, asset.longitude)
              )
            ),
            { className: 'asset-popup' }
          )

          markerRefs.current[id] = marker
          toAdd.push(marker)
          gnT.count('imperativeMarkerCreate')
          continue
        }

        // Marker đã tồn tại: chỉ cập nhật nếu dữ liệu thực sự đổi
        // (vd import dataset mới). Với filter thay đổi thì coordinate/icon
        // không đổi -> bỏ qua hoàn toàn (đây là phần rẻ nhất trong diff).
        const lat = Number(asset.latitude)
        const lng = Number(asset.longitude)
        const markerLatLng = marker.getLatLng()
        const icon =
          Array.isArray(asset.risks) &&
          asset.risks.length > 0
            ? riskyAssetIcon
            : safeAssetIcon

        if (
          markerLatLng.lat !== lat ||
          markerLatLng.lng !== lng
        ) {
          marker.setLatLng([lat, lng])
          marker.bindPopup(
            buildAssetPopupContent(
              asset,
              changeTypeRef.current,
              onViewDetailRef,
              coordinateGroupsRef.current.get(
                coordinateKey(asset.latitude, asset.longitude)
              )
            ),
            { className: 'asset-popup' }
          )
        }

        if (marker.options.icon !== icon) {
          marker.setIcon(icon)
        }
      }

      // 2) Gỡ marker không còn trong dân số lọc mới.
      const toRemove = []
      for (const [id, marker] of markerMap) {
        if (wanted.has(id)) {
          continue
        }
        markerMap.delete(id)
        if (mcg.hasLayer(marker)) {
          toRemove.push(marker)
        }
        markerRefs.current[id] = null
      }

      // 3) Thực thi theo đúng thứ tự: xóa trước, thêm sau (Leaflet batch).
      if (toRemove.length > 0) {
        mcg.removeLayers(toRemove)
        gnT.event('imperativeRemove:' + toRemove.length)
      }
      if (toAdd.length > 0) {
        mcg.addLayers(toAdd)
        gnT.event('imperativeAdd:' + toAdd.length)
      }
    })

    return () => {
      if (syncRafRef.current) cancelAnimationFrame(syncRafRef.current)
    }
  }, [assets])

  return null
}

const AssetClusterLayer = memo(function AssetClusterLayer({
  assets,
  changeType,
  valuationRisk,
  onMarkerClick,
  onClusterClick,
  onViewDetail,
  markerRefs,
}) {
  gnT.count('renderClusterLayer')
  gnT.event('clusterLayerAssets:' + assets.length)
  const createRiskClusterIcon = useMemo(
    () => createRiskClusterIconFor(valuationRisk),
    [valuationRisk]
  )

  return (
    <MarkerClusterGroup
      animate={false}
      chunkedLoading
      showCoverageOnHover={false}
      spiderfyOnMaxZoom
      iconCreateFunction={createRiskClusterIcon}
      onClick={onClusterClick}
    >
      <ClusterMarkets
        assets={assets}
        changeType={changeType}
        markerRefs={markerRefs}
        onMarkerClick={onMarkerClick}
        onViewDetail={onViewDetail}
      />
    </MarkerClusterGroup>
  )
})

function AssetMap({
  assets,
  selectedAssetId,
  onViewDetail,
  onAssetClick,
  changeType,
  valuationRisk,
  viewResetKey,
}) {
  gnT.count('renderAssetMap')
  const markerRefs = useRef({})
  const mapApiRef = useRef(null)

  // Routers luôn dùng ref mới nhất để giữ identity ổn định cho AssetClusterLayer.
  const latestOnAssetClick = useRef(onAssetClick)
  const latestOnViewDetail = useRef(onViewDetail)
  useEffect(() => {
    latestOnAssetClick.current = onAssetClick
    latestOnViewDetail.current = onViewDetail
  }, [onAssetClick, onViewDetail])

  const handleMarkerClick = useCallback(
    (asset) => {
      mark('map:marker-click')
      if (latestOnAssetClick.current) {
        latestOnAssetClick.current([asset.maTsDg])
      }
    },
    []
  )

  const handleViewDetailStable = useCallback(
    (asset) => {
      latestOnViewDetail.current?.(asset)
    },
    []
  )

  const handleClusterClick = useCallback(
    (event) => {
      const layer = event?.layer

      if (!layer) {
        return
      }
      mark('map:cluster-click')

      // Cụm = NHIỀU tài sản: click phải drill-down (zoom vào vùng),
      // KHÔNG đối xử như chọn một tài sản.
      if (typeof layer.zoomToBounds === 'function') {
        layer.zoomToBounds({ padding: [40, 40], maxZoom: 16 })
        return
      }

      const map = mapApiRef.current
      const bounds =
        typeof layer.getBounds === 'function'
          ? layer.getBounds()
          : null

      if (map && bounds) {
        map.fitBounds(bounds, {
          padding: [40, 40],
          maxZoom: 16,
          animate: false,
        })
      }
    },
    []
  )

  const handleProvinceClick = useCallback((item) => {
    const map = mapApiRef.current

    if (!map || !item) {
      return
    }
    mark('map:province-click')

    const latitude = Number(item.latitude)
    const longitude = Number(item.longitude)

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return
    }

    map.flyTo(
      [latitude, longitude],
      Math.max(map.getZoom(), 9),
      { duration: 0.6 }
    )
  }, [])

  const {
    exactAssets: assetsWithLocation,
    provinceAssets,
    provinceEntries,
    provinceAssetsMap,
    exactIdSet,
    counts,
    distinctCoordinateCount,
  } = useMemo(() => {
    gnT.begin('prepareMapData')
    const result = prepareMapData(assets)
    gnT.end('prepareMapData')
    return result
  }, [assets])

  const useProvinceSummary = useMemo(
    () => provinceAssets.length > 0,
    [provinceAssets]
  )

  const mapFitAssets = useMemo(
    () => [...assetsWithLocation, ...provinceEntries],
    [assetsWithLocation, provinceEntries]
  )

  const displayedAssetCount = useMemo(
    () =>
      assetsWithLocation.length +
      provinceEntries.reduce((sum, entry) => sum + entry.total, 0),
    [assetsWithLocation, provinceEntries]
  )

  const selectedAsset = selectedAssetId
    ? assets.find((asset) => asset.maTsDg === selectedAssetId) || null
    : null

  const selectedMarkerPosition = useMemo(() => {
    if (!selectedAsset || !useProvinceSummary) return null
    if (exactIdSet.has(selectedAsset.maTsDg)) return null
    const entry = provinceEntries.find(
      (item) => item.province === selectedAsset.tinhTp
    )
    return entry ? [entry.latitude, entry.longitude] : null
  }, [selectedAsset, useProvinceSummary, exactIdSet, provinceEntries])

  // V2.6.7 perf mark: dữ liệu map đã chuẩn bị (provenance + distinct coords).
  useEffect(() => {
    if (!perfEnabled()) return
    mark('map:prepared', {
      exact: counts.exact,
      province: counts.province,
      none: counts.none,
      distinct: distinctCoordinateCount,
    })
  }, [counts, distinctCoordinateCount])

  const createProvinceSummaryIcon = (item) =>
    L.divIcon({
      html: `
        <div class="risk-cluster risk-cluster-neutral">
          <span class="risk-cluster-total">${item.total}</span>
          ${item.risk > 0 ? `<span class="risk-cluster-badge">${item.risk}</span>` : ''}
        </div>
      `,
      className: 'risk-cluster-wrapper',
      iconSize: [46, 46],
    })



  return (
    <div className="map-placeholder">

  <div className="map-summary map-summary-floating">
    <strong>{displayedAssetCount}</strong>
    <span>tài sản đang hiển thị</span>
  </div>
<div className="map-risk-legend">

  {valuationRisk === 'Tất cả' && (
    <>
      <div className="map-risk-legend-item">
        <span className="map-risk-legend-dot safe" />
        <span>Tổng số tài sản trong cụm</span>
      </div>

      <div className="map-risk-legend-item">
        <span className="map-risk-legend-dot risk" />
        <span>Số tài sản có rủi ro</span>
      </div>
    </>
  )}

  {valuationRisk === 'Không phát hiện' && (
    <div className="map-risk-legend-item">
      <span className="map-risk-legend-dot safe" />
      <span>Tài sản không phát hiện rủi ro</span>
    </div>
  )}

  {valuationRisk !== 'Tất cả' &&
    valuationRisk !== 'Không phát hiện' && (
      <div className="map-risk-legend-item">
        <span className="map-risk-legend-dot risk" />
        <span>
          Tài sản có rủi ro {valuationRisk}
        </span>
      </div>
    )}

</div>

  <MapContainer
        center={[16, 106]}
        zoom={5}
        style={{
  height: '100%',
  width: '100%',
  borderRadius: '12px',
}}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapResizeHandler />


        <MapUpdater
          fitAssets={mapFitAssets}
          selectionAssets={assetsWithLocation}
          selectedAssetId={selectedAssetId}
          markerRefs={markerRefs}
          viewResetKey={viewResetKey}
          mapApiRef={mapApiRef}
        />


        {useProvinceSummary && (
          provinceEntries.map((item) => (
            <Marker
              key={`province-${item.province}`}
              position={[item.latitude, item.longitude]}
              icon={createProvinceSummaryIcon(item)}
              eventHandlers={{
                click: () => handleProvinceClick(item),
              }}
            >
              <Popup className="asset-popup">
                <div className="popup-title">{item.province}</div>
                <div className="popup-row">
                  <span>Tổng tài sản</span>
                  <strong>{item.total}</strong>
                </div>
                <div className="popup-row">
                  <span>Tài sản có rủi ro</span>
                  <strong>{item.risk}</strong>
                </div>
                <div className="popup-subtitle">
                  Tọa độ theo cấp tỉnh/thành phố (không phải vị trí chính xác
                  từng tài sản).
                </div>

                <div className="popup-asset-list">
                  {(provinceAssetsMap.get(item.province) || [])
                    .slice(0, 5)
                    .map((asset) => (
                      <button
                        key={asset.maTsDg}
                        type="button"
                        className="popup-asset-row"
                        onClick={(event) => {
                          event.stopPropagation()
                          onAssetClick?.([asset.maTsDg])
                        }}
                      >
                        <span className="popup-asset-row-code">
                          {asset.maTsDg}
                        </span>
                        <span className="popup-asset-row-name">
                          {asset.tenTaiSan}
                        </span>
                      </button>
                    ))}
                </div>

                <button
                  type="button"
                  className="popup-detail-button"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!onAssetClick) {
                      return
                    }
                    const provinceAssetIds = (
                      provinceAssetsMap.get(item.province) || []
                    )
                      .map((asset) => asset.maTsDg)
                    if (provinceAssetIds.length > 0) {
                      onAssetClick(provinceAssetIds)
                    }
                  }}
                >
                  Lọc toàn tỉnh ({item.total})
                </button>
              </Popup>
            </Marker>
          ))
        )}

        <AssetClusterLayer
          assets={assetsWithLocation}
          changeType={changeType}
          valuationRisk={valuationRisk}
          markerRefs={markerRefs}
          onMarkerClick={handleMarkerClick}
          onClusterClick={handleClusterClick}
          onViewDetail={handleViewDetailStable}
        />

        {useProvinceSummary && selectedAsset && !exactIdSet.has(selectedAsset.maTsDg) && selectedMarkerPosition && (
          <Marker
            key={`selected-${selectedAsset.maTsDg}`}
            position={selectedMarkerPosition}
            icon={
              Array.isArray(selectedAsset.risks) && selectedAsset.risks.length > 0
                ? riskyAssetIcon
                : safeAssetIcon
            }
            ref={(marker) => {
              if (marker) markerRefs.current[selectedAsset.maTsDg] = marker
            }}
          >
            <Popup className="asset-popup">
              <div className="popup-title">{selectedAsset.maTsDg}</div>
              <div className="popup-subtitle">
                {selectedAsset.loaiTsCap2} · {selectedAsset.tinhTp}
              </div>
              <div className="popup-row">
                <span>Vị trí</span>
                <strong>{selectedAsset.diaChiChiTiet || selectedAsset.tinhTp || 'Chưa xác định'}</strong>
              </div>
              <div className="popup-row">
                <span>Tọa độ</span>
                <strong>
                  {exactIdSet.has(selectedAsset.maTsDg)
                    ? `${Number(selectedAsset.latitude).toFixed(5)}, ${Number(selectedAsset.longitude).toFixed(5)}`
                    : 'Tọa độ cấp tỉnh'}
                </strong>
              </div>
              <div className="popup-row">
                <span>GT định giá</span>
                <strong>{(selectedAsset.gtDinhGia / 1000000000).toFixed(1)} tỷ</strong>
              </div>
              <div className="popup-row">
                <span>Dư nợ</span>
                <strong>
                  {selectedAsset.duNoTsbd > 0
                    ? `${(selectedAsset.duNoTsbd / 1000000000).toFixed(1)} tỷ`
                    : '—'}
                </strong>
              </div>
              {Array.isArray(selectedAsset.risks) && selectedAsset.risks.length > 0 && (
                <div className="popup-risk-block">
                  <div className="popup-risk-title">Rủi ro phát hiện</div>
                  {selectedAsset.risks.map((risk, index) => (
                    <div key={risk.maRuiRo || `${selectedAsset.maTsDg}-risk-${index}`} className="popup-risk-item">
                      <strong>{risk.loaiRuiRo}</strong>
                      {risk.ghiChu && <span>{risk.ghiChu}</span>}
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="popup-detail-button"
                onClick={(event) => {
                  event.stopPropagation()
                  onViewDetail(selectedAsset)
                }}
              >
                Xem chi tiết
              </button>
            </Popup>
          </Marker>
        )}

      </MapContainer>

      <p className="map-note">
        Bấm marker để xem nhanh hoặc chọn tài sản từ bảng
      </p>

    </div>
  )
}

export default memo(AssetMap)