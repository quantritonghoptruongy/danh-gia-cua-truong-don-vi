import React, { useState, useMemo } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

// ─────────────────────────────────────────────────────────────────────────────
// CẤU HÌNH - Đọc từ biến môi trường (.env file)
// Không hardcode trực tiếp trong code!
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const GAS_WEB_APP_URL = import.meta.env.VITE_GAS_WEB_APP_URL as string;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

interface CriteriaScore {
  id: string;
  score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DỮ LIỆU TIÊU CHÍ ĐÁNH GIÁ
// ─────────────────────────────────────────────────────────────────────────────
const CRITERIA = [
  {
    id: 'chat_luong',
    label: 'Chất lượng công việc',
    description: 'Mức độ hoàn thành, độ chính xác và hiệu quả công việc',
    maxScore: 30,
    icon: '⭐',
  },
  {
    id: 'so_luong',
    label: 'Khối lượng công việc',
    description: 'Số lượng công việc hoàn thành trong kỳ đánh giá',
    maxScore: 25,
    icon: '📊',
  },
  {
    id: 'ky_luat',
    label: 'Kỷ luật & Chấp hành',
    description: 'Chấp hành nội quy, giờ giấc, quy định của đơn vị',
    maxScore: 20,
    icon: '📋',
  },
  {
    id: 'tinh_than',
    label: 'Tinh thần & Thái độ',
    description: 'Thái độ làm việc, tinh thần trách nhiệm và hợp tác',
    maxScore: 15,
    icon: '🤝',
  },
  {
    id: 'sang_kien',
    label: 'Sáng kiến & Cải tiến',
    description: 'Đề xuất ý tưởng, cải tiến quy trình và tự học nâng cao',
    maxScore: 10,
    icon: '💡',
  },
];

const DEPARTMENTS = [
  'Phòng Hành chính - Nhân sự',
  'Phòng Kế toán - Tài chính',
  'Phòng Đào tạo',
  'Phòng Nghiên cứu Khoa học',
  'Phòng Kế hoạch - Tổng hợp',
  'Khoa Nội',
  'Khoa Ngoại',
  'Khoa Nhi',
  'Khoa Sản',
  'Khoa Cấp cứu',
  'Khoa Xét nghiệm',
  'Khoa Dược',
  'Khoa Chẩn đoán hình ảnh',
  'Khác',
];

const MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: XẾP LOẠI
// ─────────────────────────────────────────────────────────────────────────────
function getClassification(total: number): { label: string; color: string; bg: string } {
  if (total >= 90) return { label: 'Xuất sắc (A)', color: 'text-emerald-700', bg: 'bg-emerald-100' };
  if (total >= 75) return { label: 'Tốt (B)', color: 'text-blue-700', bg: 'bg-blue-100' };
  if (total >= 60) return { label: 'Khá (C)', color: 'text-yellow-700', bg: 'bg-yellow-100' };
  return { label: 'Cần cải thiện (D)', color: 'text-red-700', bg: 'bg-red-100' };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: SCORE SLIDER
// ─────────────────────────────────────────────────────────────────────────────
function ScoreSlider({
  criterion,
  value,
  onChange,
}: {
  criterion: typeof CRITERIA[0];
  value: number;
  onChange: (val: number) => void;
}) {
  const pct = (value / criterion.maxScore) * 100;
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{criterion.icon}</span>
          <div>
            <p className="font-semibold text-slate-800 text-sm">{criterion.label}</p>
            <p className="text-xs text-slate-500">{criterion.description}</p>
          </div>
        </div>
        <div className="ml-3 text-right flex-shrink-0">
          <span className="text-2xl font-bold text-emerald-700">{value}</span>
          <span className="text-slate-400 text-sm">/{criterion.maxScore}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 transition-colors flex-shrink-0"
        >
          −
        </button>
        <div className="flex-1 relative">
          <input
            type="range"
            min={0}
            max={criterion.maxScore}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #059669 ${pct}%, #e2e8f0 ${pct}%)`,
            }}
          />
        </div>
        <button
          onClick={() => onChange(Math.min(criterion.maxScore, value + 1))}
          className="w-8 h-8 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center font-bold text-emerald-700 transition-colors flex-shrink-0"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: LOGIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-emerald-50 to-slate-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center max-w-sm w-full text-center border-t-4 border-emerald-600">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <span className="text-3xl">🏥</span>
        </div>
        <h1 className="text-2xl font-bold mb-1 text-slate-800">
          Hệ thống Đánh giá
        </h1>
        <p className="text-emerald-700 font-semibold text-sm mb-1">Hoạt động Nhân viên</p>
        <p className="text-slate-400 text-xs mb-6">
          Đăng nhập để thực hiện và lưu kết quả đánh giá
        </p>
        {!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID.apps.googleusercontent.com' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 text-left">
            ⚠️ <strong>Chưa cấu hình Client ID.</strong>
            <br />
            Tạo file <code className="bg-amber-100 px-1 rounded">.env</code> và điền{' '}
            <code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code>
          </div>
        ) : (
          <GoogleLogin
            onSuccess={(res) => {
              // Xử lý được gọi ở App component qua onSuccess prop
              console.log('Login success', res);
            }}
            onError={() => alert('Đăng nhập thất bại. Kiểm tra Client ID và Authorized Origins!')}
            theme="outline"
            size="large"
            text="signin_with"
            shape="rectangular"
            locale="vi"
          />
        )}
        <p className="text-xs text-slate-400 mt-6">
          Chỉ tài khoản tổ chức mới được phép đăng nhập
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: MAIN EVALUATION FORM
// ─────────────────────────────────────────────────────────────────────────────
function EvaluationApp({ user, onLogout }: { user: GoogleUser; onLogout: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [year, setYear] = useState(now.getFullYear());
  const [department, setDepartment] = useState('');
  const [evaluateeName, setEvaluateeName] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const initialScores = CRITERIA.reduce((acc, c) => {
    acc[c.id] = 0;
    return acc;
  }, {} as Record<string, number>);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);

  const totalScore = useMemo(() => Object.values(scores).reduce((a, b) => a + b, 0), [scores]);
  const classification = useMemo(() => getClassification(totalScore), [totalScore]);

  const handleSave = async () => {
    if (!department) { alert('Vui lòng chọn Phòng/Khoa!'); return; }
    if (!evaluateeName.trim()) { alert('Vui lòng nhập tên nhân viên được đánh giá!'); return; }
    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL === 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec') {
      alert('Chưa cấu hình VITE_GAS_WEB_APP_URL trong file .env!');
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');

    const payload = {
      evaluatorEmail: user.email,
      evaluatorName: user.name,
      evaluateeName: evaluateeName.trim(),
      department,
      month: month + 1,
      year,
      scores,
      totalScore,
      classification: classification.label,
      note: note.trim(),
      submittedAt: new Date().toISOString(),
    };

    try {
      const response = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        // Dùng text/plain để tránh CORS preflight với Apps Script
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setSaveStatus('success');
        // Reset form sau khi lưu thành công
        setScores(initialScores);
        setEvaluateeName('');
        setNote('');
        setTimeout(() => setSaveStatus('idle'), 4000);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="pb-28">
      {/* ── HEADER BAR ── */}
      <div className="bg-emerald-700 text-white px-4 py-3 flex justify-between items-center shadow-md sticky top-0 z-50">
        <div className="flex items-center gap-2 min-w-0">
          <img
            src={user.picture}
            alt={user.name}
            className="w-8 h-8 rounded-full border-2 border-emerald-400 flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs opacity-75">Người đánh giá</p>
            <p className="text-sm font-semibold truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="ml-3 text-xs bg-emerald-800 hover:bg-emerald-900 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          Đăng xuất
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* ── TIÊU ĐỀ ── */}
        <div className="text-center py-2">
          <h1 className="text-xl font-bold text-slate-800">📋 Phiếu Đánh giá Hoạt động</h1>
          <p className="text-slate-500 text-sm mt-1">Nhanh · Khách quan · Minh bạch</p>
        </div>

        {/* ── THÔNG TIN KỲ ĐÁNH GIÁ ── */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
            Thông tin kỳ đánh giá
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Tháng</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Năm</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Phòng / Khoa</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <option value="">-- Chọn Phòng/Khoa --</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Tên nhân viên được đánh giá</label>
            <input
              type="text"
              value={evaluateeName}
              onChange={(e) => setEvaluateeName(e.target.value)}
              placeholder="Nhập họ và tên..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>

        {/* ── TIÊU CHÍ ĐÁNH GIÁ ── */}
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide px-1">
            Tiêu chí đánh giá
          </h2>
          {CRITERIA.map((c) => (
            <ScoreSlider
              key={c.id}
              criterion={c}
              value={scores[c.id]}
              onChange={(val) => setScores((prev) => ({ ...prev, [c.id]: val }))}
            />
          ))}
        </div>

        {/* ── TỔNG ĐIỂM & XẾP LOẠI ── */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm">Tổng điểm</p>
              <p className="text-5xl font-black text-slate-800 leading-none mt-1">{totalScore}</p>
              <p className="text-slate-400 text-sm mt-1">/100 điểm</p>
            </div>
            <div className={`px-4 py-2 rounded-xl ${classification.bg}`}>
              <p className={`font-bold text-lg ${classification.color}`}>{classification.label}</p>
            </div>
          </div>
          {/* Progress Bar */}
          <div className="mt-4 bg-slate-100 rounded-full h-3">
            <div
              className="h-3 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${totalScore}%` }}
            />
          </div>
          {/* Thang điểm */}
          <div className="flex justify-between text-xs text-slate-400 mt-1 px-0.5">
            <span>D (&lt;60)</span>
            <span>C (60-74)</span>
            <span>B (75-89)</span>
            <span>A (≥90)</span>
          </div>
        </div>

        {/* ── GHI CHÚ ── */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <label className="text-xs text-slate-500 mb-1 block uppercase tracking-wide font-semibold">
            Nhận xét / Ghi chú (tuỳ chọn)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Điểm mạnh, điểm cần cải thiện, đề xuất..."
            rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
          />
        </div>

        {/* ── STATUS MESSAGES ── */}
        {saveStatus === 'success' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <div>
              <p className="font-semibold text-emerald-800">Lưu thành công!</p>
              <p className="text-emerald-600 text-sm">Kết quả đã được ghi vào Google Sheets.</p>
            </div>
          </div>
        )}
        {saveStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl">❌</span>
            <div>
              <p className="font-semibold text-red-800">Lỗi kết nối</p>
              <p className="text-red-600 text-sm">Kiểm tra VITE_GAS_WEB_APP_URL và quyền truy cập Apps Script.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── STICKY SAVE BUTTON ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-lg transition-colors shadow-md"
          >
            {isSaving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Đang lưu...
              </span>
            ) : (
              `💾 Lưu kết quả đánh giá`
            )}
          </button>
          <p className="text-center text-xs text-slate-400 mt-2">
            Kết quả sẽ được lưu vào Google Sheets của đơn vị
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP - FIX: GoogleOAuthProvider bọc toàn bộ app, không chỉ login screen
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<GoogleUser | null>(null);

  const handleLoginSuccess = (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    try {
      const decoded = jwtDecode<GoogleUser>(credentialResponse.credential);
      setUser(decoded);
    } catch {
      alert('Không thể xác thực. Vui lòng thử lại!');
    }
  };

  return (
    /*
     * FIX CHÍNH: GoogleOAuthProvider phải bọc TOÀN BỘ ứng dụng,
     * không chỉ bọc màn hình login. Nếu không, khi user đăng nhập
     * xong thì provider bị unmount → mất context → lỗi tiềm ẩn.
     */
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || ''}>
      {!user ? (
        // Màn hình đăng nhập - truyền onSuccess xuống qua context của Provider
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-emerald-50 to-slate-100">
          <div className="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center max-w-sm w-full text-center border-t-4 border-emerald-600">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">🏥</span>
            </div>
            <h1 className="text-2xl font-bold mb-1 text-slate-800">Hệ thống Đánh giá</h1>
            <p className="text-emerald-700 font-semibold text-sm mb-1">Hoạt động Nhân viên</p>
            <p className="text-slate-400 text-xs mb-6">
              Đăng nhập bằng tài khoản Google của đơn vị để thực hiện đánh giá
            </p>

            {!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID.apps.googleusercontent.com' ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 text-left w-full">
                ⚠️ <strong>Chưa cấu hình Client ID!</strong>
                <br />
                Tạo file <code className="bg-amber-100 px-1 rounded text-xs">.env</code> và điền{' '}
                <code className="bg-amber-100 px-1 rounded text-xs">VITE_GOOGLE_CLIENT_ID</code>
                <br />
                Xem file <code className="bg-amber-100 px-1 rounded text-xs">.env.example</code> để biết cách cấu hình.
              </div>
            ) : (
              <>
                <GoogleLogin
                  onSuccess={handleLoginSuccess}
                  onError={() => alert('Đăng nhập thất bại!\nKiểm tra:\n1. Client ID đúng chưa?\n2. Đã thêm domain vào Authorized JavaScript Origins chưa?')}
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  locale="vi"
                />
                <p className="text-xs text-slate-400 mt-4">
                  Chỉ tài khoản tổ chức mới được phép đăng nhập
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <EvaluationApp
          user={user}
          onLogout={() => setUser(null)}
        />
      )}
    </GoogleOAuthProvider>
  );
}
