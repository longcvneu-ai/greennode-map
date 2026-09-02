import { generateCollateralAssets } from './mockDataGenerator'
export const collateralAssets = [
  {
    recordId: 'COL_REC_001',
    assetLinkId: null,

    maTsbd: 'BD001',

    valuationRecordId: 'VAL_REC_001',
    maTsDg: 'DG001',

    
    ngayNhanTsbd: '2026-07-20',
    gtBaoDam: 12000000000,
    duNoTsbd: 8000000000,
    thanhKhoan: 'Khá',
    trangThaiTsbd: 'Đang bảo đảm',
    ngayGiaiChap: null,
    donViQuanLy: 'Đơn vị Hà Nội',
  },

  {
    recordId: 'COL_REC_002',
    assetLinkId: null,

    maTsbd: 'BD002',

    valuationRecordId: 'VAL_REC_002',
    maTsDg: 'DG002',

    
    ngayNhanTsbd: '2026-07-22',
    gtBaoDam: 10000000000,
    duNoTsbd: 6000000000,
    thanhKhoan: 'Khá',
    trangThaiTsbd: 'Đang bảo đảm',
    ngayGiaiChap: null,
    donViQuanLy: 'Đơn vị Hà Nội',
  },

  {
    recordId: 'COL_REC_003',
    assetLinkId: null,

    maTsbd: 'BD003',

    valuationRecordId: 'VAL_REC_004',
    maTsDg: 'DG004',

    
    ngayNhanTsbd: '2026-07-25',
    gtBaoDam: 1600000000,
    duNoTsbd: 1200000000,
    thanhKhoan: 'Trung bình',
    trangThaiTsbd: 'Đang bảo đảm',
    ngayGiaiChap: null,
    donViQuanLy: 'Đơn vị Hà Nội',
  },

  {
    recordId: 'COL_REC_004',
    assetLinkId: null,

    maTsbd: 'BD004',

    valuationRecordId: 'VAL_REC_005',
    maTsDg: 'DG005',

    
    ngayNhanTsbd: '2026-07-28',
    gtBaoDam: 4000000000,
    duNoTsbd: 3000000000,
    thanhKhoan: 'Trung bình',
    trangThaiTsbd: 'Đang bảo đảm',
    ngayGiaiChap: null,
    donViQuanLy: 'Đơn vị TP.HCM',
  },
    ...generateCollateralAssets(),
]