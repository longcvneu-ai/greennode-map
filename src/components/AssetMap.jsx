import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet'

import MarkerClusterGroup from 'react-leaflet-cluster'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { memo, useEffect, useMemo, useRef } from 'react'
import { buildProvinceSummaries } from '../services/mapSummaryService.js'

delete L.Icon.Default.prototype._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

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
}) {
  const map = useMap()

  // Khi bộ dữ liệu / bộ lọc thay đổi:
  // luôn hiển thị tổng quan các tài sản đang có trên map.
  useEffect(() => {
    // Any popup left open from the previous dataset/filter is stale.
    map.closePopup()

    if (fitAssets.length === 0) {
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
      map.setView([16, 106], 5, { animate: false })
      return
    }

    // Invalidate first: importing Excel often changes panel dimensions.
    // Fitting after that prevents a stale deep-zoom viewport from surviving.
    map.invalidateSize({ animate: false })
    const bounds = L.latLngBounds(validPoints)
    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom: validPoints.length > 1 ? 7 : 9,
      animate: false,
    })
  }, [fitAssets, map])

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

function AssetMap({
  assets,
  selectedAssetId,
  onViewDetail,
  changeType,
  valuationRisk,
}) {
  const markerRefs = useRef({})

 const createRiskClusterIcon = (cluster) => {
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

  const assetsWithLocation = useMemo(
    () => assets.filter(
      (asset) =>
        Number.isFinite(Number(asset.latitude)) &&
        Number.isFinite(Number(asset.longitude))
    ),
    [assets]
  )

  const LARGE_MAP_THRESHOLD = 5000
  const useProvinceSummary =
    assetsWithLocation.length > LARGE_MAP_THRESHOLD

  const provinceSummaries = useMemo(
    () => useProvinceSummary
      ? buildProvinceSummaries(assetsWithLocation)
      : [],
    [useProvinceSummary, assetsWithLocation]
  )

  const mapFitAssets = useProvinceSummary
    ? provinceSummaries
    : assetsWithLocation

  const selectedAsset = selectedAssetId
    ? assetsWithLocation.find((asset) => asset.maTsDg === selectedAssetId) || null
    : null

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
    <strong>{assetsWithLocation.length}</strong>
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
        />


        {useProvinceSummary ? (
          provinceSummaries.map((item) => (
            <Marker
              key={`province-${item.province}`}
              position={[item.latitude, item.longitude]}
              icon={createProvinceSummaryIcon(item)}
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
                  Lọc theo tỉnh/thành phố để xem marker chi tiết.
                </div>
              </Popup>
            </Marker>
          ))
        ) : (
        <MarkerClusterGroup
        chunkedLoading
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        iconCreateFunction={
        createRiskClusterIcon
         }
>
        {assetsWithLocation.map((asset) => (
          <Marker
                key={asset.maTsDg}
                position={[
                  asset.latitude,
                  asset.longitude,
                ]}
              icon={
                Array.isArray(asset.risks) &&
                asset.risks.length > 0
                  ? riskyAssetIcon
                  : safeAssetIcon
              }
            ref={(marker) => {
              if (marker) {
                markerRefs.current[asset.maTsDg] = marker
              }
            }}
          >
            <Popup className="asset-popup">

              <div className="popup-title">
                {asset.maTsDg}
              </div>

              <div className="popup-subtitle">
                {asset.loaiTsCap2} · {asset.tinhTp}
              </div>

              <div className="popup-row">
                <span>Vị trí</span>
                <strong>{asset.diaChiChiTiet || asset.tinhTp || 'Chưa xác định'}</strong>
              </div>

              <div className="popup-row">
                <span>Tọa độ</span>
                <strong>{Number(asset.latitude).toFixed(5)}, {Number(asset.longitude).toFixed(5)}</strong>
              </div>

              <div className="popup-row">
                <span>GT định giá</span>

                <strong>
                  {(asset.gtDinhGia / 1000000000).toFixed(1)} tỷ
                </strong>
              </div>

              <div className="popup-row">
                <span>Dư nợ</span>

                <strong>
                  {asset.duNoTsbd > 0
                    ? `${(
                        asset.duNoTsbd / 1000000000
                      ).toFixed(1)} tỷ`
                    : '—'}
                </strong>
              </div>


            
{Array.isArray(asset.risks) &&
  asset.risks.length > 0 && (
    <div className="popup-risk-block">
      <div className="popup-risk-title">
        Rủi ro phát hiện
      </div>

      {asset.risks.map((risk) => (
        <div
          key={risk.maRuiRo}
          className="popup-risk-item"
        >
          <strong>
            {risk.loaiRuiRo}
          </strong>

          {risk.ghiChu && (
            <span>
              {risk.ghiChu}
            </span>
          )}
        </div>
      ))}
    </div>
  )}
{changeType !== 'Tất cả' && (
  <div className="popup-row">
    <span>Biến động</span>

    <strong>
      {changeType}
    </strong>
  </div>
)}
              <button
                type="button"
                className="popup-detail-button"
                onClick={(event) => {
                  event.stopPropagation()
                  onViewDetail(asset)
                }}
              >
                Xem chi tiết
              </button>

            </Popup>
          </Marker>
        ))}
        </MarkerClusterGroup>
        )}

        {useProvinceSummary && selectedAsset && (
          <Marker
            key={`selected-${selectedAsset.maTsDg}`}
            position={[selectedAsset.latitude, selectedAsset.longitude]}
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
                <strong>{Number(selectedAsset.latitude).toFixed(5)}, {Number(selectedAsset.longitude).toFixed(5)}</strong>
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
