import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useRef } from 'react'

delete L.Icon.Default.prototype._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function MapUpdater({ assets, selectedAssetId, markerRefs }) {
  const map = useMap()

  useEffect(() => {
    if (selectedAssetId) {
      const selectedAsset = assets.find(
        (asset) => asset.maTsDg === selectedAssetId
      )

      if (
        selectedAsset &&
        selectedAsset.latitude &&
        selectedAsset.longitude
      ) {
        map.flyTo(
          [selectedAsset.latitude, selectedAsset.longitude],
          15,
          {
            duration: 1,
          }
        )

        setTimeout(() => {
          markerRefs.current[
            selectedAssetId
          ]?.openPopup()
        }, 1000)

        return
      }
    }

    if (assets.length === 0) return

    const bounds = assets.map((asset) => [
      asset.latitude,
      asset.longitude,
    ])

    map.fitBounds(bounds, {
      padding: [40, 40],
    })
  }, [assets, selectedAssetId, map, markerRefs])

  return null
}

function AssetMap({
  assets,
  selectedAssetId,
  onViewDetail,
}) {
  const markerRefs = useRef({})

  const assetsWithLocation = assets.filter(
    (asset) => asset.latitude && asset.longitude
  )

  return (
    <div className="map-placeholder">

      <div className="map-summary">
        <strong>{assetsWithLocation.length}</strong>
        <span>tài sản có tọa độ đang hiển thị</span>
      </div>

      <MapContainer
        center={[16, 106]}
        zoom={5}
        style={{
          height: '470px',
          width: '100%',
          borderRadius: '12px',
        }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapUpdater
          assets={assetsWithLocation}
          selectedAssetId={selectedAssetId}
          markerRefs={markerRefs}
        />

        {assetsWithLocation.map((asset) => (
          <Marker
            key={asset.maTsDg}
            position={[
              asset.latitude,
              asset.longitude,
            ]}
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

      </MapContainer>

      <p className="map-note">
        Bấm marker để xem nhanh hoặc chọn tài sản từ bảng
      </p>

    </div>
  )
}

export default AssetMap