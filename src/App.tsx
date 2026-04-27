import { useState, useMemo, useEffect, useCallback } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';

// ─────────────────────────────────────────────────────────────────────────────
// CẤU HÌNH — chỉ cần 2 biến env
// VITE_GOOGLE_CLIENT_ID : OAuth Client ID
// VITE_SPREADSHEET_ID   : ID của Google Sheet chứa tất cả đơn vị
// VITE_DIRECTORY_SHEET  : Tên tab danh mục trưởng đơn vị (mặc định "DanhMucTruongDV")
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID  = import.meta.env.VITE_GOOGLE_CLIENT_ID  as string;
const SPREADSHEET_ID    = import.meta.env.VITE_SPREADSHEET_ID    as string;
const DIRECTORY_SHEET   = (import.meta.env.VITE_DIRECTORY_SHEET  as string) || 'DanhMucTruongDV';
const SHEETS_BASE       = 'https://sheets.googleapis.com/v4/spreadsheets';
const APP_NAME          = 'Trường Y';   // ← Tên hiển thị toàn app

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface GoogleUser {
  email:   string;
  name:    string;
  picture: string;
}

/** Thông tin trưởng đơn vị đọc từ sheet "DanhMucTruongDV" */
interface UnitRecord {
  managerName: string;   // Cột B: Họ tên
  unitName:    string;   // Cột C: Đơn vị → cũng là tên tab sheet
  email:       string;   // Cột D: Email
  note:        string;   // Cột E: Ghi chú
}

interface Employee {
  sheetName:  string;
  rowNumber:  number;
  stt:        string | number;
  date:       string;
  name:       string;
  unit:       string;
  c11: string; c12: string; c13: string;
  c21: number; c22: number; c23: number; c24: number; c25: number;
  c31: number; c32: number; c33: number;
  c41: number; c42: number; c43: number;
  totalScore: number;
  ranking:    string;
  noteAplus:  string;
  status:     string;
  notes:      string;
  evaluated:  boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS API HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Generic fetch từ một range bất kỳ trong Spreadsheet */
async function sheetsGet(accessToken: string, range: string): Promise<string[][]> {
  const url = `${SHEETS_BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Không đọc được range: ${range}`);
  }
  const json = await res.json() as { values?: string[][] };
  return json.values || [];
}

/**
 * Đọc sheet "DanhMucTruongDV" → trả về danh sách UnitRecord.
 * Cấu trúc sheet:
 *   Dòng 1-2 : header (bỏ qua)
 *   Dòng 3+  : A=STT, B=Họ tên, C=Đơn vị, D=Email, E=Ghi chú
 */
async function apiGetDirectory(accessToken: string): Promise<UnitRecord[]> {
  const rows = await sheetsGet(accessToken, `${DIRECTORY_SHEET}!A:E`);
  const results: UnitRecord[] = [];

  // Bỏ qua 2 dòng header (index 0, 1)
  for (let i = 2; i < rows.length; i++) {
    const r     = rows[i];
    const email = (r[3] || '').trim().toLowerCase();
    const unit  = (r[2] || '').trim();
    if (!email || !unit) continue;
    results.push({
      managerName: (r[1] || '').trim(),
      unitName:    unit,
      email,
      note:        (r[4] || '').trim(),
    });
  }
  return results;
}

/**
 * Tìm đơn vị của user dựa trên email đã đăng nhập.
 * Trả về UnitRecord hoặc null nếu không tìm thấy.
 * So sánh không phân biệt chữ hoa/thường.
 */
async function apiResolveUnit(accessToken: string, email: string): Promise<UnitRecord | null> {
  const directory = await apiGetDirectory(accessToken);
  const lowerEmail = email.trim().toLowerCase();
  return directory.find(r => r.email === lowerEmail) ?? null;
}

/**
 * Đọc dữ liệu nhân viên từ sheet của đơn vị cụ thể.
 * Cấu trúc sheet đơn vị: 3 dòng header, dữ liệu từ dòng 4 (index 3).
 */
async function apiFetchEmployees(accessToken: string, unitSheetName: string): Promise<Employee[]> {
  const rows = await sheetsGet(accessToken, `${unitSheetName}!A:X`);

  const results: Employee[] = [];
  for (let i = 3; i < rows.length; i++) {
    const r    = rows[i];
    const name = (r[2] || '').trim();
    if (!name || name.includes('#REF!')) continue;

    results.push({
      sheetName:  unitSheetName,
      rowNumber:  i + 1,
      stt:        r[0]  || '',
      date:       parseSheetDate(r[1] || ''),
      name,
      unit:       r[3]  || '',
      c11: r[4]  || 'Không vi phạm',
      c12: r[5]  || 'Không vi phạm',
      c13: r[6]  || 'Không vi phạm',
      c21: parseFloat(r[7])  || 0,
      c22: parseFloat(r[8])  || 0,
      c23: parseFloat(r[9])  || 0,
      c24: parseFloat(r[10]) || 0,
      c25: parseFloat(r[11]) || 0,
      c31: parseFloat(r[12]) || 0,
      c32: parseFloat(r[13]) || 0,
      c33: parseFloat(r[14]) || 0,
      c41: parseFloat(r[15]) || 0,
      c42: parseFloat(r[16]) || 0,
      c43: parseFloat(r[17]) || 0,
      totalScore: parseFloat(r[18]) || 0,
      ranking:    r[19] || '',
      noteAplus:  r[20] || '',
      status:     r[21] || '',
      notes:      r[22] || '',
      evaluated: !!(r[21] && r[21].trim() !== ''),
    });
  }
  return results;
}

/**
 * Lưu kết quả đánh giá vào cột V, W, X của sheet đơn vị.
 * Ghi vết: email người đánh giá + timestamp.
 */
async function apiSaveEvaluation(
  accessToken: string,
  payload:     Employee,
  userEmail:   string,
): Promise<void> {
  // Kiểm tra khóa thời gian (mùng 3 tháng kế tiếp)
  if (payload.date) {
    const parts = payload.date.split('/');
    if (parts.length === 2) {
      const mm       = parseInt(parts[0], 10);
      const yyyy     = parseInt(parts[1], 10);
      const lockDate = new Date(yyyy, mm, 3);
      lockDate.setHours(0, 0, 0, 0);
      if (new Date() >= lockDate) {
        throw new Error(`Đã khóa đánh giá! Kỳ ${payload.date} chỉ được chỉnh sửa trước ngày 03 tháng kế tiếp.`);
      }
    }
  }

  const timestamp = new Date().toLocaleString('vi-VN', {
    timeZone:  'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const auditLog = `${userEmail} (${timestamp})`;

  const range = `${payload.sheetName}!V${payload.rowNumber}:X${payload.rowNumber}`;
  const url   = `${SHEETS_BASE}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ range, majorDimension: 'ROWS', values: [[payload.status, payload.notes, auditLog]] }),
  });

  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || 'Không lưu được dữ liệu');
  }
}

/** Lấy thông tin tài khoản Google */
async function apiGetUserInfo(accessToken: string): Promise<GoogleUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Không lấy được thông tin tài khoản');
  return res.json() as Promise<GoogleUser>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function parseSheetDate(val: string): string {
  if (!val) return '';
  if (/^\d{2}\/\d{4}$/.test(val)) return val;
  const d = new Date(val);
  if (!isNaN(d.getTime()))
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return val;
}

const calculateResult = (total: number, c11: string, c12: string, c13: string): string => {
  if (c11 === 'Vi phạm' || c12 === 'Vi phạm' || c13 === 'Vi phạm') return 'C';
  if (total > 90) return 'A+';
  if (total >= 80) return 'A';
  if (total >= 65) return 'B';
  return 'C';
};

const getRankingLabel = (code: string): string => {
  if (code === 'A+') return 'Hoàn thành xuất sắc nhiệm vụ';
  if (code === 'A')  return 'Hoàn thành tốt nhiệm vụ';
  if (code === 'B')  return 'Hoàn thành nhiệm vụ';
  return 'Không hoàn thành nhiệm vụ';
};

const getShortRank = (rankingText: string): string => {
  if (!rankingText) return 'C';
  const t = rankingText.toString().trim().toUpperCase();
  if (t.includes('XUẤT SẮC') || t === 'A+') return 'A+';
  if (t.includes('TỐT') || t === 'A') return 'A';
  if (t.includes('KHÔNG HOÀN THÀNH') || t === 'C') return 'C';
  if (t.includes('HOÀN THÀNH') || t === 'B') return 'B';
  return 'C';
};

const getBadgeColor = (rankingText: string): string => {
  const r = getShortRank(rankingText);
  if (r === 'A+') return 'bg-red-600';
  if (r === 'A')  return 'bg-green-600';
  if (r === 'B')  return 'bg-amber-600';
  return 'bg-slate-700';
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: ICON
// ─────────────────────────────────────────────────────────────────────────────
interface IconProps { name: string; size?: number; className?: string; }
const Icon = ({ name, size = 20, className = '' }: IconProps) => {
  const icons: Record<string, React.ReactNode> = {
    users:        (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
    check:        (<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>),
    clock:        (<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>),
    chevronRight: <path d="M9 18l6-6-6-6"/>,
    chevronLeft:  <path d="M15 18l-6-6 6-6"/>,
    search:       (<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>),
    save:         (<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></>),
    calendar:     (<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
    history:      (<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 15"/></>),
    refresh:      (<><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>),
    logout:       (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>),
    lock:         (<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>),
  };
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {icons[name] || null}
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: NHẬP ĐIỂM SỐ (Nhóm II, III, IV)
// ─────────────────────────────────────────────────────────────────────────────
interface DetailedScoreInputProps {
  label: string; title: string; desc?: string;
  max: number; value: number; onChange: (v: string) => void;
  colorClass?: string; disabled?: boolean;
}
const DetailedScoreInput = ({
  label, title, desc, max, value, onChange,
  colorClass = 'bg-slate-100 text-slate-600', disabled,
}: DetailedScoreInputProps) => (
  <div className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all
    ${!disabled ? 'hover:border-emerald-200 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500' : 'opacity-80'}`}>
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`${colorClass} text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider`}>{label}</span>
      </div>
      <h4 className="text-[13px] font-bold text-slate-800 leading-snug">{title}</h4>
      {desc && <p className="text-[11px] text-slate-500 mt-1 font-medium">{desc}</p>}
    </div>
    <div className={`flex items-center gap-1 p-2 rounded-xl border shrink-0 self-start sm:self-auto
      ${disabled ? 'bg-slate-100 border-slate-200' : 'bg-slate-50 border-slate-100'}`}>
      <input type="number" step="0.1" min="0" max={max} disabled={disabled}
        className={`w-12 bg-transparent border-none text-right font-black text-slate-800 text-lg focus:outline-none focus:ring-0 p-0
          ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        value={value} onChange={e => onChange(e.target.value)} />
      <span className="text-[10px] font-bold text-slate-400 mt-1">/ {max}đ</span>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: TIÊU CHÍ ĐẠO ĐỨC (Nhóm I)
// ─────────────────────────────────────────────────────────────────────────────
interface CriterionSelectProps {
  label: string; title: string; desc?: string;
  value: string; onChange: (v: string) => void; disabled?: boolean;
}
const CriterionSelect = ({ label, title, desc, value, onChange, disabled }: CriterionSelectProps) => (
  <div className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all
    ${!disabled ? 'hover:border-rose-200 focus-within:ring-2 focus-within:ring-rose-500' : 'opacity-80'}`}>
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">{label}</span>
      </div>
      <h4 className="text-[13px] font-bold text-slate-800 leading-snug">{title}</h4>
      {desc && <p className="text-[11px] text-slate-500 mt-1 font-medium">{desc}</p>}
    </div>
    <div className="shrink-0 self-start sm:self-auto">
      <select disabled={disabled}
        className={`border text-sm font-bold rounded-xl focus:ring-rose-500 focus:border-rose-500 block w-full p-2.5 outline-none transition-colors
          ${value === 'Vi phạm' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-700 border-slate-200'}
          ${disabled ? 'cursor-not-allowed opacity-60 bg-slate-100' : ''}`}
        value={value || 'Không vi phạm'} onChange={e => onChange(e.target.value)}>
        <option value="Không vi phạm">Không vi phạm</option>
        <option value="Vi phạm">Vi phạm</option>
      </select>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: LOGIN SCREEN — branding "Trường Y"
// ─────────────────────────────────────────────────────────────────────────────
interface LoginScreenProps { onLogin: () => void; isLoggingIn: boolean; }
const LoginScreen = ({ onLogin, isLoggingIn }: LoginScreenProps) => {
  const missingConfig =
    !GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('YOUR_CLIENT') ||
    !SPREADSHEET_ID   || SPREADSHEET_ID.includes('YOUR_SPREADSHEET');

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 to-slate-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center max-w-sm w-full text-center border-t-4 border-emerald-600">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <span className="text-3xl">🏥</span>
        </div>

        {/* ← TÊN APP: Trường Y */}
        <h1 className="text-2xl font-black text-slate-800 tracking-tighter">{APP_NAME}</h1>
        <p className="text-emerald-700 font-bold text-sm mt-1">Ứng dụng hỗ trợ Trưởng đơn vị đánh giá</p>
        <p className="text-slate-400 text-xs mt-2 mb-6">
          Đăng nhập để thực hiện đánh giá.<br />
          Tài khoản sẽ được ghi vết tự động khi lưu kết quả.
        </p>

        {missingConfig ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-left w-full space-y-1">
            <p className="font-bold">⚠️ Chưa cấu hình biến môi trường!</p>
            <pre className="text-xs bg-amber-100 rounded p-2 mt-2 whitespace-pre-wrap">
{`VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
VITE_SPREADSHEET_ID=1BxiM...your_sheet_id
VITE_DIRECTORY_SHEET=DanhMucTruongDV`}
            </pre>
          </div>
        ) : (
          <>
            <button onClick={onLogin} disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm text-sm">
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {isLoggingIn ? 'Đang xác thực...' : 'Đăng nhập bằng Google'}
            </button>
            <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
              Yêu cầu quyền đọc/ghi Google Sheets.<br />
              Mỗi trưởng đơn vị chỉ xem được dữ liệu đơn vị của mình.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: ACCESS DENIED — email không có trong danh mục
// ─────────────────────────────────────────────────────────────────────────────
interface AccessDeniedProps { email: string; onLogout: () => void; }
const AccessDenied = ({ email, onLogout }: AccessDeniedProps) => (
  <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
    <div className="bg-white rounded-2xl p-8 shadow-xl max-w-sm w-full text-center space-y-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
        <Icon name="lock" size={28} className="text-red-500" />
      </div>
      <h2 className="font-black text-xl text-slate-800">Không có quyền truy cập</h2>
      <p className="text-sm text-slate-500">
        Tài khoản <span className="font-bold text-slate-700">{email}</span> chưa được phân quyền trong hệ thống.
      </p>
      <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
        Liên hệ quản trị viên để thêm email vào sheet <br />
        <code className="font-bold">"{DIRECTORY_SHEET}"</code>
      </p>
      <button onClick={onLogout}
        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl text-sm">
        Đăng xuất & thử lại
      </button>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: ỨNG DỤNG ĐÁNH GIÁ CHÍNH
// ─────────────────────────────────────────────────────────────────────────────
interface MainAppProps {
  user:        GoogleUser;
  accessToken: string;
  unitRecord:  UnitRecord;   // ← thông tin đơn vị của user
  onLogout:    () => void;
}
const MainApp = ({ user, accessToken, unitRecord, onLogout }: MainAppProps) => {
  const [employees,     setEmployees]     = useState<Employee[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState('');
  const [activeTab,     setActiveTab]     = useState<'current' | 'history'>('current');
  const [searchTerm,    setSearchTerm]    = useState('');
  const [selectedEmp,   setSelectedEmp]   = useState<Employee | null>(null);
  const [isSaving,      setIsSaving]      = useState(false);
  const [saveError,     setSaveError]     = useState('');
  const [saveSuccess,   setSaveSuccess]   = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState('');

  // Sheet tab name = tên đơn vị từ directory
  const unitSheetName = unitRecord.unitName;

  // ── Load dữ liệu nhân viên ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiFetchEmployees(accessToken, unitSheetName);
      setEmployees(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'TOKEN_EXPIRED') { onLogout(); return; }
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [accessToken, unitSheetName, onLogout]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Tính kỳ đánh giá ──────────────────────────────────────────────────────
  const periods = useMemo(() => {
    const unique = Array.from(new Set(employees.map(e => e.date)));
    return unique.sort((a, b) => {
      const [m1, y1] = a.split('/').map(Number);
      const [m2, y2] = b.split('/').map(Number);
      return y2 !== y1 ? y2 - y1 : m2 - m1;
    });
  }, [employees]);

  const currentPeriod = periods[0] || '';

  useEffect(() => {
    if (periods.length > 1 && !historyPeriod) setHistoryPeriod(periods[1]);
    else if (periods.length > 0 && !historyPeriod) setHistoryPeriod(periods[0]);
  }, [periods, historyPeriod]);

  // ── Danh sách nhân viên hiển thị ──────────────────────────────────────────
  const displayedEmployees = useMemo(() => {
    const target = activeTab === 'current' ? currentPeriod : historyPeriod;
    return employees.filter(emp =>
      emp.date === target &&
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [employees, activeTab, currentPeriod, historyPeriod, searchTerm]);

  // ── Kiểm tra khóa chỉnh sửa ───────────────────────────────────────────────
  const isReadOnly = useMemo(() => {
    if (!selectedEmp) return false;
    if (activeTab === 'history') return true;
    const parts = selectedEmp.date.split('/');
    if (parts.length === 2) {
      const lockDate = new Date(parseInt(parts[1], 10), parseInt(parts[0], 10), 3);
      lockDate.setHours(0, 0, 0, 0);
      return new Date() >= lockDate;
    }
    return false;
  }, [selectedEmp, activeTab]);

  // ── Cập nhật điểm (local state) ───────────────────────────────────────────
  const updateScore = (field: string, value: string) => {
    if (isReadOnly || !selectedEmp) return;
    setSelectedEmp(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      if (field.startsWith('c1')) {
        (updated as Record<string, unknown>)[field] = value;
      } else {
        (updated as Record<string, unknown>)[field] = parseFloat(value) || 0;
      }
      const total = (updated.c21 || 0) + (updated.c22 || 0) + (updated.c23 || 0) +
        (updated.c24 || 0) + (updated.c25 || 0) + (updated.c31 || 0) +
        (updated.c32 || 0) + (updated.c33 || 0) + (updated.c41 || 0) +
        (updated.c42 || 0) + (updated.c43 || 0);
      updated.totalScore = parseFloat(total.toFixed(2));
      const rankCode  = calculateResult(updated.totalScore, updated.c11, updated.c12, updated.c13);
      updated.ranking = getRankingLabel(rankCode);
      updated.status  = rankCode;
      return updated;
    });
  };

  // ── Lưu kết quả lên Google Sheets ─────────────────────────────────────────
  const handleSave = async () => {
    if (isReadOnly || !selectedEmp) return;
    if (!selectedEmp.status) { alert('Vui lòng chọn xếp loại trước khi lưu!'); return; }
    if (selectedEmp.status === 'A+' && (!selectedEmp.notes || selectedEmp.notes.trim() === '')) {
      alert("Vui lòng điền 'Ghi chú & Nhận xét' để giải trình cho mốc đánh giá Xuất sắc (A+).");
      return;
    }
    setIsSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      await apiSaveEvaluation(accessToken, selectedEmp, user.email);
      setEmployees(prev => prev.map(e =>
        e.rowNumber === selectedEmp.rowNumber ? { ...selectedEmp, evaluated: true } : e,
      ));
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); setSelectedEmp(null); }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'TOKEN_EXPIRED') { onLogout(); return; }
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading & Error ────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 font-black text-[10px] tracking-widest uppercase italic">
          Đang tải dữ liệu {unitSheetName}...
        </p>
      </div>
    </div>
  );

  if (loadError) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-2xl p-8 shadow-xl max-w-sm w-full text-center space-y-4">
        <div className="text-4xl">❌</div>
        <h2 className="font-black text-slate-800">Không tải được dữ liệu</h2>
        <p className="text-sm text-slate-500 bg-red-50 border border-red-100 rounded-xl p-3 text-left">{loadError}</p>
        <p className="text-xs text-slate-400">
          Đảm bảo sheet tab có tên chính xác là <br />
          <code className="bg-slate-100 px-1 rounded font-bold">"{unitSheetName}"</code><br />
          trong Google Sheets.
        </p>
        <div className="flex gap-2">
          <button onClick={loadData} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm">Thử lại</button>
          <button onClick={onLogout} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm">Đăng xuất</button>
        </div>
      </div>
    </div>
  );

  // ── GIAO DIỆN CHÍNH ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans text-slate-900">

      {/* ── HEADER — hiển thị tên đơn vị động ── */}
      <header className="bg-emerald-700 text-white p-4 sticky top-0 z-20 shadow-md">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            {user.picture && (
              <img src={user.picture} alt={user.name}
                className="w-9 h-9 rounded-full border-2 border-emerald-400 shrink-0" />
            )}
            <div>
              {/* ← Tên đơn vị động từ directory */}
              <h1 className="text-sm font-black italic tracking-tighter leading-tight">{unitSheetName}</h1>
              <p className="text-[10px] font-bold opacity-70 leading-tight truncate max-w-[200px]">
                {activeTab === 'current'
                  ? `Tháng hiện tại: ${currentPeriod}`
                  : `Lịch sử: ${historyPeriod}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadData} title="Tải lại"
              className="p-2 bg-emerald-600 rounded-xl active:scale-95 transition-transform">
              <Icon name="refresh" size={18} />
            </button>
            <button onClick={onLogout} title="Đăng xuất"
              className="p-2 bg-emerald-600 rounded-xl active:scale-95 transition-transform">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ── HEADER LỊCH SỬ ── */}
      {activeTab === 'history' && (
        <div className="bg-slate-800 border-b border-slate-900 sticky top-[68px] z-10 flex items-center justify-between p-3 shadow-md">
          <button
            onClick={() => { const i = periods.indexOf(historyPeriod); if (i < periods.length - 1) setHistoryPeriod(periods[i + 1]); }}
            disabled={periods.indexOf(historyPeriod) === periods.length - 1}
            className="p-2 text-slate-400 disabled:opacity-20">
            <Icon name="chevronLeft" />
          </button>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-1">Dữ liệu Lịch sử (Chỉ xem)</p>
            <div className="flex items-center justify-center gap-2 font-black text-white text-lg uppercase">
              <Icon name="calendar" size={16} className="text-emerald-400" />
              Tháng {historyPeriod}
            </div>
          </div>
          <button
            onClick={() => { const i = periods.indexOf(historyPeriod); if (i > 0) setHistoryPeriod(periods[i - 1]); }}
            disabled={periods.indexOf(historyPeriod) === 0}
            className="p-2 text-slate-400 disabled:opacity-20">
            <Icon name="chevronRight" />
          </button>
        </div>
      )}

      {/* ── DANH SÁCH NHÂN VIÊN ── */}
      <main className="max-w-4xl mx-auto p-4 pt-6">
        <div className="relative mb-5">
          <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
          <input type="text" placeholder="Tìm theo tên nhân viên..."
            className="w-full pl-11 pr-4 py-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>

        {displayedEmployees.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-bold">{searchTerm ? 'Không tìm thấy nhân viên' : 'Chưa có dữ liệu kỳ này'}</p>
          </div>
        )}

        <div className="space-y-3">
          {displayedEmployees.map(emp => (
            <div key={emp.rowNumber} onClick={() => setSelectedEmp({ ...emp })}
              className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer hover:border-emerald-200">
              <div className="flex items-center gap-3">
                <div className={`shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center
                  ${emp.evaluated ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  <Icon name={emp.evaluated ? 'check' : 'clock'} size={22} />
                </div>
                <div className="max-w-[130px] sm:max-w-[220px]">
                  <h3 className="font-bold text-slate-800 leading-tight text-sm truncate">{emp.name}</h3>
                  <p className="text-[9px] text-slate-400 mt-0.5 uppercase font-bold tracking-tight truncate">{emp.unit}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p className="text-[11px] font-black text-emerald-600">{emp.totalScore}đ</p>
                {emp.ranking && (
                  <div className={`text-[10px] font-black text-white px-2 py-0.5 rounded-md shadow-sm text-center min-w-[28px] flex items-center justify-center ${getBadgeColor(emp.ranking)}`}>
                    {getShortRank(emp.ranking)}
                  </div>
                )}
                {emp.evaluated && (
                  <div className="border-l border-slate-100 pl-2">
                    <span className={`text-[10px] font-black text-white px-2 py-0.5 rounded-md min-w-[28px] inline-block text-center shadow-sm ${getBadgeColor(emp.status)}`}>
                      {getShortRank(emp.status)}
                    </span>
                  </div>
                )}
                <Icon name="chevronRight" className="text-slate-300 ml-1" size={18} />
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ── MODAL CHI TIẾT ── */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => !isSaving && setSelectedEmp(null)} />
          <div className="relative bg-white w-full max-w-2xl rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
            <div className="p-5 sm:p-6 pt-8 overflow-y-auto">

              {/* Modal header */}
              <div className="flex justify-between items-start mb-6 sticky top-0 bg-white/90 backdrop-blur pb-2 z-10 border-b border-slate-100">
                <div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block italic border
                    ${isReadOnly ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                    Kỳ đánh giá {selectedEmp.date} {isReadOnly && '(ĐÃ KHÓA)'}
                  </span>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tighter leading-tight">{selectedEmp.name}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedEmp.unit}</p>
                </div>
                <button onClick={() => setSelectedEmp(null)}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 active:scale-90 transition-transform shrink-0 ml-2">
                  <Icon name="chevronLeft" className="rotate-90" />
                </button>
              </div>

              {/* Xếp loại tự động */}
              <div className="bg-slate-800 p-4 rounded-2xl mb-4 flex justify-between items-center shadow-lg">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 text-white rounded-xl flex items-center justify-center text-2xl font-black shadow-lg ${getBadgeColor(selectedEmp.ranking)}`}>
                    {getShortRank(selectedEmp.ranking)}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Xếp loại tự động</p>
                    <p className="text-lg font-black text-white uppercase tracking-tighter">{selectedEmp.totalScore} ĐIỂM TỔNG</p>
                  </div>
                </div>
              </div>

              {/* Khu vực chốt đánh giá */}
              <div className="space-y-4 mb-8 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">
                    Nhân viên tự giải trình (Cho mốc A+)
                  </label>
                  <div className="w-full p-4 rounded-2xl bg-white border border-slate-200 text-sm font-medium text-slate-700 min-h-[4rem] whitespace-pre-wrap shadow-sm">
                    {selectedEmp.noteAplus
                      ? selectedEmp.noteAplus
                      : <span className="italic text-slate-400 font-normal opacity-70">Không có nội dung giải trình...</span>}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 ml-1">
                    Chốt xếp loại của Trưởng đơn vị
                  </label>
                  <select disabled={isReadOnly}
                    className={`w-full p-4 rounded-2xl bg-white ring-1 ring-emerald-200 focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 outline-none appearance-none shadow-sm
                      ${isReadOnly ? 'bg-slate-100 cursor-not-allowed opacity-70' : ''}`}
                    value={selectedEmp.status}
                    onChange={e => setSelectedEmp(prev => prev ? { ...prev, status: e.target.value } : prev)}>
                    <option value="">-- Chưa đánh giá --</option>
                    <option value="A+">A+ (Hoàn thành Xuất sắc nhiệm vụ)</option>
                    <option value="A">A (Hoàn thành Tốt nhiệm vụ)</option>
                    <option value="B">B (Hoàn thành nhiệm vụ)</option>
                    <option value="C">C (Không hoàn thành nhiệm vụ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 ml-1">
                    Ghi chú & Nhận xét
                    {selectedEmp.status === 'A+' && !isReadOnly && <span className="text-red-500 ml-1">* (Bắt buộc)</span>}
                  </label>
                  <textarea disabled={isReadOnly}
                    className={`w-full p-4 rounded-2xl bg-white ring-1 h-24 text-sm font-medium outline-none resize-none transition-all shadow-sm
                      ${selectedEmp.status === 'A+' && (!selectedEmp.notes || selectedEmp.notes.trim() === '') && !isReadOnly
                        ? 'ring-red-400 focus:ring-red-500 bg-red-50/30'
                        : 'ring-emerald-200 focus:ring-emerald-500'}
                      ${isReadOnly ? 'bg-slate-100 cursor-not-allowed opacity-70' : ''}`}
                    placeholder={selectedEmp.status === 'A+' && !isReadOnly
                      ? 'Vui lòng nhập lý do/thành tích...'
                      : 'Ý kiến chỉ đạo...'}
                    value={selectedEmp.notes}
                    onChange={e => setSelectedEmp(prev => prev ? { ...prev, notes: e.target.value } : prev)} />
                </div>

                {saveError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">❌ {saveError}</div>
                )}
                {saveSuccess && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 font-bold">
                    ✅ Đã lưu & ghi vết <strong>{user.email}</strong> vào Google Sheets!
                  </div>
                )}
              </div>

              {/* Chi tiết 4 nhóm điểm */}
              <div className="border-t border-slate-200 pt-6 mt-2">
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                  <Icon name="history" className="text-slate-400" /> Chi tiết điểm đánh giá
                </h3>

                <div className="mb-8">
                  <h3 className="text-xs font-black text-rose-700 uppercase tracking-widest mb-3 ml-2">I. Phẩm chất đạo đức (Tiêu chí bắt buộc)</h3>
                  <div className="flex flex-col gap-3 bg-slate-50 p-2 sm:p-3 rounded-3xl border border-slate-100">
                    <CriterionSelect disabled={isReadOnly} label="Chỉ số 1.1" title="Chấp hành đường lối, chủ trương, chính sách của Đảng và pháp luật của Nhà nước." value={selectedEmp.c11} onChange={v => updateScore('c11', v)} />
                    <CriterionSelect disabled={isReadOnly} label="Chỉ số 1.2" title="Phẩm chất chính trị, đạo đức, lối sống, tác phong, lề lối làm việc." value={selectedEmp.c12} onChange={v => updateScore('c12', v)} />
                    <CriterionSelect disabled={isReadOnly} label="Chỉ số 1.3" title="Thực hiện quy định về phòng, chống tham nhũng, tiêu cực, thực hành tiết kiệm, chống lãng phí." value={selectedEmp.c13} onChange={v => updateScore('c13', v)} />
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-3 ml-2">II. Tinh thần trách nhiệm, thái độ phục vụ (15đ)</h3>
                  <div className="flex flex-col gap-3 bg-slate-50 p-2 sm:p-3 rounded-3xl border border-slate-100">
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 2.1" colorClass="bg-blue-100 text-blue-700" title="Tinh thần trách nhiệm, tinh thần hợp tác trong thực hiện nhiệm vụ được giao." max={3} value={selectedEmp.c21} onChange={v => updateScore('c21', v)} />
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 2.2" colorClass="bg-blue-100 text-blue-700" title="Thái độ phục vụ, giao tiếp, ứng xử với đồng nghiệp và người học, người bệnh, khách hàng." max={3} value={selectedEmp.c22} onChange={v => updateScore('c22', v)} />
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 2.3" colorClass="bg-blue-100 text-blue-700" title="Thực hiện Quy tắc ứng xử của ĐHYD TP.HCM." max={3} value={selectedEmp.c23} onChange={v => updateScore('c23', v)} />
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 2.4" colorClass="bg-blue-100 text-blue-700" title="Bảo vệ bí mật Nhà nước, bí mật công tác, bí mật thông tin theo quy định." max={3} value={selectedEmp.c24} onChange={v => updateScore('c24', v)} />
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 2.5" colorClass="bg-blue-100 text-blue-700" title="Tham gia các hoạt động phong trào, đoàn thể của ĐHYD/đơn vị/tổ chức." max={3} value={selectedEmp.c25} onChange={v => updateScore('c25', v)} />
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-3 ml-2">III. Ý thức kỷ luật, kỷ cương (15đ)</h3>
                  <div className="flex flex-col gap-3 bg-slate-50 p-2 sm:p-3 rounded-3xl border border-slate-100">
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 3.1" colorClass="bg-amber-100 text-amber-700" title="Chấp hành sự phân công của tổ chức, của người quản lý có thẩm quyền." max={6} value={selectedEmp.c31} onChange={v => updateScore('c31', v)} />
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 3.2" colorClass="bg-amber-100 text-amber-700" title="Chấp hành các nội quy, quy chế, quy định của ĐHYD/đơn vị/tổ chức." max={4} value={selectedEmp.c32} onChange={v => updateScore('c32', v)} />
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 3.3" colorClass="bg-amber-100 text-amber-700" title="Thực hiện đúng quy định về thời gian làm việc, thời giờ nghỉ ngơi của đơn vị." max={5} value={selectedEmp.c33} onChange={v => updateScore('c33', v)} />
                  </div>
                </div>

                <div className="mb-8">
                  <h3 className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-3 ml-2">IV. Khả năng đáp ứng yêu cầu (70đ)</h3>
                  <div className="flex flex-col gap-3 bg-slate-50 p-2 sm:p-3 rounded-3xl border border-slate-100">
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 4.1" colorClass="bg-emerald-100 text-emerald-700" title="Khả năng đáp ứng yêu cầu của cấp quản lý về số lượng, tiến độ." max={20} value={selectedEmp.c41} onChange={v => updateScore('c41', v)} />
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 4.2" colorClass="bg-emerald-100 text-emerald-700" title="Khả năng đáp ứng yêu cầu của cấp quản lý về chất lượng thực hiện nhiệm vụ." max={20} value={selectedEmp.c42} onChange={v => updateScore('c42', v)} />
                    <DetailedScoreInput disabled={isReadOnly} label="Chỉ số 4.3" colorClass="bg-emerald-100 text-emerald-700" title="Trách nhiệm, thái độ, sự phối hợp trong thực hiện nhiệm vụ thường xuyên và đột xuất." max={30} value={selectedEmp.c43} onChange={v => updateScore('c43', v)} />
                  </div>
                </div>
              </div>

              {isReadOnly ? (
                <button disabled className="w-full bg-slate-200 text-slate-400 py-5 rounded-2xl font-black flex items-center justify-center gap-3 mb-4 cursor-not-allowed">
                  <Icon name="clock" /> ĐÃ KHÓA ĐÁNH GIÁ KỲ {selectedEmp.date}
                </button>
              ) : (
                <button onClick={handleSave} disabled={isSaving || !selectedEmp.status}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-100 active:scale-[0.99] mb-4">
                  {isSaving
                    ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><Icon name="save" /> LƯU KẾT QUẢ ĐÁNH GIÁ</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 p-3 flex justify-around items-center z-30 shadow-2xl">
        <button onClick={() => setActiveTab('current')}
          className={`flex flex-col items-center gap-1.5 px-6 py-2 rounded-2xl transition-all ${activeTab === 'current' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}>
          <Icon name="users" size={22} />
          <span className="text-[10px] font-black uppercase tracking-tighter">Hiện tại</span>
        </button>
        <button onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1.5 px-6 py-2 rounded-2xl transition-all ${activeTab === 'history' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}>
          <Icon name="history" size={22} />
          <span className="text-[10px] font-black uppercase tracking-tighter">Lịch sử</span>
        </button>
      </nav>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: AUTH WRAPPER
// Luồng: Login → OAuth → apiGetUserInfo → apiResolveUnit → MainApp / AccessDenied
// ─────────────────────────────────────────────────────────────────────────────
const AuthWrapper = () => {
  const [user,        setUser]        = useState<GoogleUser | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [unitRecord,  setUnitRecord]  = useState<UnitRecord | null>(null); 
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  //const [authError,   setAuthError]   = useState('');  Xoá dòng này để Vercel tránh báo lỗi src/App.tsx(882,10): error TS6133: 'authError' is declared but its value is never read.

  const handleLogout = useCallback(() => {
    setUser(null);
    setAccessToken('');
    setUnitRecord(null);
    //setAuthError(''); Xoá dòng này để Vercel tránh báo lỗi src/App.tsx(882,10): error TS6133: 'authError' is declared but its value is never read.
  }, []);

  const login = useGoogleLogin({
    onSuccess: async tokenResponse => {
      //setAuthError('');
      try {
        // 1. Lấy thông tin tài khoản
        const userInfo = await apiGetUserInfo(tokenResponse.access_token);

        // 2. Tra cứu đơn vị theo email trong sheet "DanhMucTruongDV"
        const unit = await apiResolveUnit(tokenResponse.access_token, userInfo.email);

        setAccessToken(tokenResponse.access_token);
        setUser(userInfo);
        setUnitRecord(unit); // null = không có quyền → AccessDenied
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        //setAuthError(msg); Xoá dòng này để Vercel tránh báo lỗi src/App.tsx(882,10): error TS6133: 'authError' is declared but its value is never read.
        alert(`Lỗi xác thực: ${msg}`);
      } finally {
        setIsLoggingIn(false);
      }
    },
    onError: () => {
      alert('Đăng nhập thất bại!\n\nKiểm tra:\n1. Client ID đúng chưa?\n2. Domain đã thêm vào Authorized JavaScript Origins chưa?');
      setIsLoggingIn(false);
    },
    // Scope bắt buộc: đọc/ghi Google Sheets
    scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets',
    flow: 'implicit',
  });

  // Chưa đăng nhập
  if (!user || !accessToken) {
    return (
      <LoginScreen
        onLogin={() => { setIsLoggingIn(true); login(); }}
        isLoggingIn={isLoggingIn}
      />
    );
  }

  // Đã đăng nhập nhưng email không có trong danh mục
  if (!unitRecord) {
    return <AccessDenied email={user.email} onLogout={handleLogout} />;
  }

  // Đăng nhập thành công — load đúng sheet đơn vị
  return (
    <MainApp
      user={user}
      accessToken={accessToken}
      unitRecord={unitRecord}
      onLogout={handleLogout}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || ''}>
      <AuthWrapper />
    </GoogleOAuthProvider>
  );
}
