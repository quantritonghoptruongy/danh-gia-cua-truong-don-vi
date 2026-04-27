// ============================================================
// GOOGLE APPS SCRIPT - BACKEND NHẬN VÀ LƯU DỮ LIỆU ĐÁNH GIÁ
// File: Code.gs
// ============================================================
// HƯỚNG DẪN TRIỂN KHAI:
// 1. Vào https://script.google.com → New Project
// 2. Paste toàn bộ code này vào file Code.gs
// 3. Thay SPREADSHEET_ID bằng ID Google Sheet của bạn
// 4. Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone  (hoặc Anyone with Google account)
// 5. Copy URL → dán vào VITE_GAS_WEB_APP_URL trong file .env
// ============================================================

const SPREADSHEET_ID = 'THAY_BẰNG_ID_GOOGLE_SHEET_CỦA_BẠN';
const SHEET_NAME = 'DanhGia'; // Tên sheet tab để lưu dữ liệu

// Xử lý POST request từ ứng dụng web
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    
    // Tự động tạo sheet và header nếu chưa có
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      const headers = [
        'Thời gian nộp',
        'Email người đánh giá',
        'Tên người đánh giá',
        'Nhân viên được đánh giá',
        'Phòng/Khoa',
        'Tháng',
        'Năm',
        'Chất lượng CV (/30)',
        'Khối lượng CV (/25)',
        'Kỷ luật (/20)',
        'Tinh thần (/15)',
        'Sáng kiến (/10)',
        'Tổng điểm (/100)',
        'Xếp loại',
        'Ghi chú',
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#059669')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    // Thêm dòng dữ liệu mới
    const row = [
      new Date(payload.submittedAt || new Date()),
      payload.evaluatorEmail || '',
      payload.evaluatorName || '',
      payload.evaluateeName || '',
      payload.department || '',
      payload.month || '',
      payload.year || '',
      payload.scores?.chat_luong ?? 0,
      payload.scores?.so_luong ?? 0,
      payload.scores?.ky_luat ?? 0,
      payload.scores?.tinh_than ?? 0,
      payload.scores?.sang_kien ?? 0,
      payload.totalScore ?? 0,
      payload.classification || '',
      payload.note || '',
    ];
    
    sheet.appendRow(row);
    
    // Trả về thành công
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'Đã lưu thành công!' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Xử lý GET request (dùng để test)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'OK', message: 'Apps Script đang chạy bình thường.' }))
    .setMimeType(ContentService.MimeType.JSON);
}
