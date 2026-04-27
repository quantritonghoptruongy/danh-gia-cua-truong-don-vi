# 🚀 HƯỚNG DẪN TRIỂN KHAI - Hệ thống Đánh giá Hoạt động

---

## 📌 TỔNG QUAN KIẾN TRÚC

```
[Trình duyệt / Vercel]  ──POST──>  [Google Apps Script]  ──lưu──>  [Google Sheets]
        │
   Đăng nhập qua
   Google OAuth 2.0
```

---

## BƯỚC 1 — CÀI ĐẶT PROJECT

### 1.1 Cài đặt trên máy local

```bash
# Clone hoặc giải nén project
cd eval-app

# Cài dependencies
npm install

# Tạo file cấu hình
cp .env.example .env
```

### 1.2 Cài đặt trên StackBlitz

1. Truy cập https://stackblitz.com → **Open from GitHub** hoặc **Upload files**
2. Upload toàn bộ thư mục project (trừ `node_modules`)
3. StackBlitz tự động chạy `npm install`
4. Tạo file `.env` trong StackBlitz (click icon + → New file → `.env`)

---

## BƯỚC 2 — CẤU HÌNH GOOGLE CLOUD (OAuth)

### 2.1 Tạo Project trên Google Cloud Console

1. Vào https://console.cloud.google.com
2. Click **"Select a project"** → **"New Project"**
3. Đặt tên: `EvalApp` → **Create**

### 2.2 Bật Google OAuth API

1. Menu trái → **APIs & Services** → **Library**
2. Tìm **"Google Identity"** → Enable
3. Tìm **"Google Sheets API"** → Enable (nếu cần đọc sheet)

### 2.3 Tạo OAuth Credentials

1. **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth client ID**
2. Nếu được hỏi **Configure consent screen**:
   - User type: **External** → **Create**
   - App name: `Hệ thống Đánh giá`
   - User support email: email của bạn
   - Developer contact: email của bạn
   - **Save and Continue** (bỏ qua các bước còn lại)
   - Quay lại tạo credentials
3. Application type: **Web application**
4. Name: `EvalApp Web`
5. **Authorized JavaScript Origins** — thêm các domain:
   ```
   http://localhost:5173          ← cho dev local
   https://your-app.vercel.app    ← sau khi deploy Vercel
   https://stackblitz.com         ← cho StackBlitz
   https://xxxx.local.webcontainer.io  ← URL preview của StackBlitz
   ```
6. **Authorized redirect URIs**: Để trống (dùng implicit flow)
7. Click **Create** → Copy **Client ID**

### 2.4 Điền vào file .env

```bash
# Mở file .env và điền:
VITE_GOOGLE_CLIENT_ID=123456789-abcdefgh.apps.googleusercontent.com
```

---

## BƯỚC 3 — CÀI ĐẶT GOOGLE APPS SCRIPT (Backend)

### 3.1 Tạo Google Sheet

1. Vào https://sheets.google.com → Tạo sheet mới
2. Đặt tên: `Dữ liệu Đánh giá Hoạt động`
3. Copy **Spreadsheet ID** từ URL:
   ```
   https://docs.google.com/spreadsheets/d/  [SPREADSHEET_ID]  /edit
   ```

### 3.2 Tạo Apps Script

1. Trong Google Sheet → menu **Extensions** → **Apps Script**
   *(Hoặc vào https://script.google.com → New project)*
2. Xóa code mặc định, paste toàn bộ nội dung file **`Code.gs`**
3. Thay `THAY_BẰNG_ID_GOOGLE_SHEET_CỦA_BẠN` bằng Spreadsheet ID vừa copy
4. **Save** (Ctrl+S) → Đặt tên project: `EvalApp Backend`

### 3.3 Deploy Apps Script

1. Click **Deploy** → **New deployment**
2. Cài đặt:
   - Type: **Web app**
   - Description: `v1.0`
   - Execute as: **Me** (tài khoản Google của bạn)
   - Who has access: **Anyone** *(hoặc "Anyone with Google account" nếu muốn bảo mật hơn)*
3. Click **Deploy** → Authorize nếu được yêu cầu
4. Copy **Web app URL** (dạng: `https://script.google.com/macros/s/AKfyc.../exec`)

### 3.4 Điền URL vào file .env

```bash
VITE_GAS_WEB_APP_URL=https://script.google.com/macros/s/AKfycxxx/exec
```

### 3.5 Test Apps Script

Mở URL trong trình duyệt → phải thấy:
```json
{"status":"OK","message":"Apps Script đang chạy bình thường."}
```

---

## BƯỚC 4 — CHẠY LOCAL & KIỂM TRA

```bash
npm run dev
# Mở http://localhost:5173
```

**Checklist kiểm tra:**
- [ ] Trang login hiển thị đúng
- [ ] Nút "Sign in with Google" xuất hiện (không có cảnh báo màu vàng)
- [ ] Đăng nhập thành công → vào được form đánh giá
- [ ] Điền form → nhấn Lưu → dữ liệu xuất hiện trong Google Sheet

---

## BƯỚC 5A — DEPLOY LÊN VERCEL

### 5A.1 Cách 1: Deploy từ GitHub (Khuyến nghị)

```bash
# Đẩy code lên GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/eval-app.git
git push -u origin main
```

1. Vào https://vercel.com → **Add New Project** → Import từ GitHub
2. Chọn repository → **Deploy**
3. Thêm Environment Variables:
   - `VITE_GOOGLE_CLIENT_ID` = Client ID của bạn
   - `VITE_GAS_WEB_APP_URL` = URL Apps Script của bạn
4. **Deploy** → Copy domain Vercel (vd: `https://eval-app.vercel.app`)

### 5A.2 Cách 2: Deploy bằng Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
# Nhập env variables khi được hỏi
```

### 5A.3 Sau khi có domain Vercel

Quay lại **Google Cloud Console** → Credentials → Thêm vào **Authorized JavaScript Origins**:
```
https://eval-app.vercel.app
```

---

## BƯỚC 5B — LÀM VIỆC TRÊN STACKBLITZ

1. Mở file `.env` trong StackBlitz → điền Client ID và GAS URL
2. Copy URL preview của StackBlitz (ví dụ: `https://xxxx.stackblitz.io`)
3. Thêm URL đó vào **Authorized JavaScript Origins** trong Google Cloud Console
4. Restart project trong StackBlitz

> ⚠️ **Lưu ý**: StackBlitz preview URL có thể thay đổi. Mỗi lần URL thay đổi,
> bạn phải cập nhật lại trong Google Cloud Console.

---

## 🔧 XỬ LÝ LỖI THƯỜNG GẶP

### Lỗi: "popup_closed_by_user"
- **Nguyên nhân**: Popup bị chặn
- **Sửa**: Cho phép popup trong trình duyệt cho domain của bạn

### Lỗi: "idpiframe_initialization_failed" / "Error 400: redirect_uri_mismatch"
- **Nguyên nhân**: Domain chưa được thêm vào Authorized JavaScript Origins
- **Sửa**: Vào Google Cloud Console → Credentials → Thêm đúng domain (kể cả `http://` hay `https://`)

### Lỗi: CORS khi gọi Apps Script
- **Nguyên nhân**: Apps Script không cho phép cross-origin với Content-Type JSON
- **Sửa**: Code đã dùng `Content-Type: text/plain;charset=utf-8` — đây là cách đúng

### Lỗi: Apps Script trả về lỗi authorization
- **Sửa**: Vào Apps Script → Deploy → Manage deployments → Tạo **New deployment** (không dùng lại deployment cũ sau khi sửa code)

### Client ID chưa có trong .env (cảnh báo vàng trong app)
- **Sửa**: Tạo file `.env` (không phải `.env.example`) và điền Client ID

---

## 📋 CHECKLIST TRIỂN KHAI HOÀN CHỈNH

- [ ] Tạo Google Cloud Project & OAuth Client ID
- [ ] Thêm domain vào Authorized JavaScript Origins
- [ ] Tạo Google Sheet
- [ ] Deploy Apps Script và lấy URL
- [ ] Điền `.env` với Client ID và GAS URL
- [ ] Test local: `npm run dev`
- [ ] Deploy lên Vercel / StackBlitz
- [ ] Thêm production domain vào Authorized Origins
- [ ] Test toàn bộ luồng: đăng nhập → đánh giá → lưu → kiểm tra Sheet

---

## 🔐 BẢO MẬT

- **KHÔNG** commit file `.env` lên git (đã có trong `.gitignore`)
- Trên Vercel: dùng **Environment Variables** để lưu secrets
- Giới hạn quyền Apps Script: chỉ cho "Anyone with Google account" nếu app nội bộ
- Có thể thêm whitelist email domain trong Apps Script để chặn email ngoài tổ chức

---

*Cập nhật lần cuối: 04/2026*
