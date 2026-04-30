function doGet() {
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('الخيرات | عروض عمرة')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const SHEETS_CONFIG = {
  // إذا كان السكربت مرتبطاً بجدول بيانات معين (Container-bound script)،
  // اتركه فارغاً ليعتمد تلقائياً على الملف النشط.
  // إذا كان السكربت تطبيق ويب مستقلاً (Standalone Web App)،
  // يجب عليك وضع معرف جدول البيانات هنا (مثال: '1AbC_xyz123...')
  spreadsheetId: '',
  sheetName: 'Reservations',
  offersSheetName: 'Offers',
  offersSheetId: 734149518
};

const SHEET_HEADERS = [
  'Submitted At',
  'Full Name',
  'Phone Number',
  'Email',
  'State',
  'Category',
  'Offer ID',
  'Offer Name',
  'Travel Date',
  'Makkah Hotel',
  'Madinah Hotel',
  'Airport',
  'Room Type',
  'Room Capacity',
  'Room Count',
  'People Count',
  'Price Per Person',
  'Total Price'
];

/**
 * دالة مساعدة للحصول على ملف السبريدشيت
 * تحاول فتح الملف بالمعرف، وإذا لم يوجد تستخدم الملف النشط
 */
function getSpreadsheet_() {
  try {
    const ss = SHEETS_CONFIG.spreadsheetId ? SpreadsheetApp.openById(SHEETS_CONFIG.spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("Could not find spreadsheet context.");
    return ss;
  } catch (e) {
    throw new Error("فشل الوصول إلى جدول البيانات: " + e.message);
  }
}

function getOffers() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(SHEETS_CONFIG.offersSheetName);
  if (!sheet && typeof SHEETS_CONFIG.offersSheetId === 'number') {
    sheet = spreadsheet.getSheets().find((s) => s.getSheetId() === SHEETS_CONFIG.offersSheetId);
  }
  if (!sheet) {
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return [];
  }

  const headers = data[0].map((header) => String(header || '').trim());
  const rows = data.slice(1);

  return rows.map((row, rowIndex) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index];
    });

    const getValue = (key) => {
      const value = record[key];
      return value === undefined || value === null ? '' : String(value).trim();
    };

    const getNumber = (key) => {
      const raw = getValue(key).replace(/[^0-9\-\.]/g, '');
      return raw === '' ? 0 : Number(raw);
    };

    const makeLocal = (arKey, frKey, fallbackKey) => ({
      ar: getValue(arKey) || getValue(fallbackKey) || '',
      fr: getValue(frKey) || getValue(fallbackKey) || ''
    });

    return {
      id: Number(getValue('id') || rowIndex + 1),
      category: getValue('category') || 'Economy',
      name: makeLocal('name_ar', 'name_fr', 'program'),
      date: makeLocal('date_ar', 'date_fr', 'date'),
      makkahHotel: makeLocal('makkahHotel_ar', 'makkahHotel_fr', 'hotelName'),
      madinahHotel: makeLocal('madinahHotel_ar', 'madinahHotel_fr', 'hotelName2'),
      airport: makeLocal('airport_ar', 'airport_fr', 'hotelName'),
      priceFrom: getNumber('priceFrom') || getNumber('quintuple') || getNumber('quadruple') || getNumber('triple') || getNumber('double'),
      image: getValue('image'),
      roomPrices: {
        quintuple: getNumber('quintuple'),
        quadruple: getNumber('quadruple'),
        triple: getNumber('triple'),
        double: getNumber('double')
      }
    };
  });
}

/**
 * تتحقق مما إذا كان رقم الهاتف مسجلاً مسبقاً في جدول الحجوزات
 */
function checkDuplicatePhone(phoneNumber) {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(SHEETS_CONFIG.sheetName);
  if (!sheet) return false;
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const phoneIndex = headers.indexOf('Phone Number');
  if (phoneIndex === -1) return false;

  const values = sheet.getRange(2, phoneIndex + 1, lastRow - 1, 1).getValues();
  const searchPhone = String(phoneNumber).trim();

  return values.some(row => String(row[0]).trim() === searchPhone);
}

function submitBooking(payload) {
  validatePayload_(payload);
  
  if (checkDuplicatePhone(payload.phoneNumber)) {
    throw new Error("DUPLICATE_PHONE");
  }

  const sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);
  const normalizedPayload = normalizePayload_(payload);

  const submittedAt = normalizedPayload.submittedAt || new Date().toISOString();
  sheet.appendRow([
    submittedAt,
    normalizedPayload.fullName,
    normalizedPayload.phoneNumber,
    normalizedPayload.email,
    normalizedPayload.state,
    normalizedPayload.category,
    normalizedPayload.offerId,
    normalizedPayload.offerName,
    normalizedPayload.date,
    normalizedPayload.makkahHotel,
    normalizedPayload.madinahHotel,
    normalizedPayload.airport,
    normalizedPayload.roomType,
    normalizedPayload.roomCapacity,
    normalizedPayload.roomCount,
    normalizedPayload.peopleCount,
    normalizedPayload.pricePerPerson,
    normalizedPayload.totalPrice
  ]);

  // إرسال رسالة تأكيد آلية للزبون عبر البريد الإلكتروني (بدون تدخل)
  try {
    const customerSubject = "تأكيد طلب حجز عمرة - وكالة الخيرات";
    const customerMessage = `مرحباً ${normalizedPayload.fullName}،\n\nلقد تم استلام طلب حجزك بنجاح.\n\nتفاصيل العرض: ${normalizedPayload.offerName}\nتاريخ الرحلة: ${normalizedPayload.date}\nالسعر الإجمالي: ${normalizedPayload.totalPrice} DZD\n\nسنقوم بالاتصال بك قريباً لتأكيد باقي الإجراءات.\nشكراً لاختيارك وكالة الخيرات.`;
    
    MailApp.sendEmail(normalizedPayload.email, customerSubject, customerMessage);
  } catch (error) {
    console.error("Error sending confirmation email: " + error.toString());
  }

  // إنشاء رسالة رسمية تظهر للزبون عند فتح الواتساب
  const whatsappMessage = 
    `*تأكيد استلام طلب حجز - وكالة الخيرات*\n\n` +
    `مرحباً *${normalizedPayload.fullName}*،\n` +
    `لقد تم تسجيل طلبكم بنجاح في نظامنا.\n\n` +
    `*تفاصيل الحجز:*\n` +
    `• الباقة: ${normalizedPayload.offerName}\n` +
    `• التاريخ: ${normalizedPayload.date}\n` +
    `• السعر الإجمالي: ${normalizedPayload.totalPrice} DZD\n\n` +
    `يرجى إرسال هذه الرسالة لتأكيد التواصل معنا.`;

  const whatsappUrl = "https://wa.me/213560515258?text=" + encodeURIComponent(whatsappMessage);

  return {
    success: true,
    submittedAt: submittedAt,
    whatsappUrl: whatsappUrl
  };
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const result = submitBooking(payload);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet_() {
  const spreadsheet = getSpreadsheet_();
  const existingSheet = spreadsheet.getSheetByName(SHEETS_CONFIG.sheetName);

  if (existingSheet) {
    return existingSheet;
  }

  return spreadsheet.insertSheet(SHEETS_CONFIG.sheetName);
}

function ensureHeaders_(sheet) {
  const hasHeaders = sheet.getLastRow() > 0;
  if (hasHeaders) {
    return;
  }

  sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
  sheet.setFrozenRows(1);
}

function validatePayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Missing booking payload.');
  }

  const requiredFields = [
    'fullName',
    'phoneNumber',
    'email',
    'state',
    'category',
    'offerId',
    'offerName',
    'date',
    'makkahHotel',
    'madinahHotel',
    'airport',
    'roomType',
    'roomCapacity',
    'roomCount',
    'peopleCount',
    'pricePerPerson',
    'totalPrice'
  ];

  requiredFields.forEach(function(fieldName) {
    const value = payload[fieldName];
    if (value === '' || value === null || typeof value === 'undefined') {
      throw new Error('Missing required field: ' + fieldName);
    }
    if (typeof value === 'string' && value.trim() === '') {
      throw new Error('Missing required field: ' + fieldName);
    }
  });

  ['roomCapacity', 'roomCount', 'peopleCount', 'pricePerPerson', 'totalPrice'].forEach(function(fieldName) {
    if (Number.isNaN(Number(payload[fieldName]))) {
      throw new Error('Invalid numeric field: ' + fieldName);
    }
  });
}

function normalizePayload_(payload) {
  return {
    submittedAt: stringifyValue_(payload.submittedAt),
    fullName: stringifyValue_(payload.fullName),
    phoneNumber: stringifyValue_(payload.phoneNumber),
    email: stringifyValue_(payload.email),
    state: stringifyValue_(payload.state),
    category: stringifyValue_(payload.category),
    offerId: payload.offerId,
    offerName: stringifyValue_(payload.offerName),
    date: stringifyValue_(payload.date),
    makkahHotel: stringifyValue_(payload.makkahHotel),
    madinahHotel: stringifyValue_(payload.madinahHotel),
    airport: stringifyValue_(payload.airport),
    roomType: stringifyValue_(payload.roomType),
    roomCapacity: Number(payload.roomCapacity),
    roomCount: Number(payload.roomCount),
    peopleCount: Number(payload.peopleCount),
    pricePerPerson: Number(payload.pricePerPerson),
    totalPrice: Number(payload.totalPrice)
  };
}

function stringifyValue_(value) {
  return String(value).trim();
}