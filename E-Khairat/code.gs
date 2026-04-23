function doGet() {
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('الخيرات | عروض عمرة')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

const SHEETS_CONFIG = {
  spreadsheetId: '1h5HK4-fnzzfsJrFjgk_dQpsTRDudOiRMy9vNk8YcyPo',
  sheetName: 'Reservations',
  offersSheetName: 'Offers',
  offersSheetId: 734149518
};

const SHEET_HEADERS = [
  'Submitted At',
  'Full Name',
  'Phone Number',
  'State',
  'City',
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

function getOffers() {
  const spreadsheet = SpreadsheetApp.openById(SHEETS_CONFIG.spreadsheetId);
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

function submitBooking(payload) {
  validatePayload_(payload);

  const sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);
  const normalizedPayload = normalizePayload_(payload);

  const submittedAt = normalizedPayload.submittedAt || new Date().toISOString();
  sheet.appendRow([
    submittedAt,
    normalizedPayload.fullName,
    normalizedPayload.phoneNumber,
    normalizedPayload.state,
    normalizedPayload.city,
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

  return {
    success: true,
    submittedAt: submittedAt
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
  const spreadsheet = SpreadsheetApp.openById(SHEETS_CONFIG.spreadsheetId);
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
    'state',
    'city',
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
    state: stringifyValue_(payload.state),
    city: stringifyValue_(payload.city),
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
