// ============================================================
// Code.gs — EventPay Unified Google Apps Script Backend
// ============================================================
// Database Sheets: Payments | Complaints | Gallery | Settings |
//                  AuditLog | Analytics | Admins | Villages
// ============================================================

// The Master Database registry spreadsheet ID.
// Can also be set in Script Properties as 'MASTER_DB_SPREADSHEET_ID'
const MASTER_DB_ID =
PropertiesService.getScriptProperties()
.getProperty("MASTER_DB_SPREADSHEET_ID");

// ============================================================
// 1. HTTP ENTRYPOINTS & ROUTER
// ============================================================

function doGet(e) {
  const r = handleAction(e.parameter.action, e.parameter, null);
  return ContentService.createTextOutput(JSON.stringify(r))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const params = e.parameter;
  
  // Parse POST body parameters if encoded
  if (e.postData && e.postData.type === "application/x-www-form-urlencoded") {
    const parts = e.postData.contents.split("&");
    parts.forEach(p => {
      const pair = p.split("=");
      params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
    });
  }
  
  const r = handleAction(params.action, params, e.postData);
  return ContentService.createTextOutput(JSON.stringify(r))
                       .setMimeType(ContentService.MimeType.JSON);
}

function handleAction(action, p, pd) {
  try {
    // Public / Visitor Actions
    if (action === "searchEvent")          return searchEvent(p);          // MasterDB
    if (action === "getSettings")          return apiGetSettings(p);       // Settings
    if (action === "getPublicVisibility")  return apiGetPublicVisibility(p); // Settings
    if (action === "getPublicStats")       return apiGetPublicStats(p);    // Payments
    if (action === "getPublicPayments")    return apiGetPublicPayments(p); // Payments
    if (action === "checkStatus")          return apiCheckStatus(p);       // Payments
    if (action === "createPaymentOrder")   return apiCreatePaymentOrder(p); // Payments
    if (action === "verifyPayment")        return apiVerifyPayment(p);     // Payments
    if (action === "getGalleryImages")     return apiGetGalleryImages(p);  // Gallery
    if (action === "uploadPhoto")          return apiUploadPhoto(p);       // Gallery
    if (action === "submitComplaint")      return apiSubmitComplaint(p);   // Complaints
    if (action === "getComplaintStatus")   return apiGetComplaintStatus(p); // Complaints
    
    // Admin Actions
    if (action === "loginAdmin")           return apiLoginAdmin(p);        // Security / Admins
    if (action === "adminLogout")          return apiAdminLogout(p);       // Security / Admins
    if (action === "getPayments")          return apiGetPayments(p);       // Payments
    if (action === "updatePayments")       return apiUpdatePayments(p);    // Payments
    if (action === "getComplaints")        return apiGetComplaints(p);     // Complaints
    if (action === "updateComplaint")      return apiUpdateComplaint(p);   // Complaints
    if (action === "getPendingPhotos")     return apiGetPendingPhotos(p);  // Gallery
    if (action === "moderatePhoto")        return apiModeratePhoto(p);     // Gallery
    if (action === "deletePhoto")          return apiDeletePhoto(p);       // Gallery
    
    // Super Admin Actions
    if (action === "updateSettings")       return apiUpdateSettings(p);    // Settings
    if (action === "getAuditLog")          return apiGetAuditLog(p);       // Security / Admins
    if (action === "createEventSpreadsheet") return apiCreateEventSpreadsheet(p); // SheetMaker
    
    return jsonError("Unknown backend action: " + action);
  } catch (err) {
    return jsonError("Internal Server Error: " + err.message);
  }
}

// ============================================================
// 2. CORE UTILITY HELPERS
// ============================================================

function jsonSuccess(data) {
  return { success: true, data: data };
}

function jsonError(message) {
  return { success: false, error: message };
}

function serializeVal(val, key) {
  if (val instanceof Date) {
    const tz = Session.getScriptTimeZone();
    const k = String(key || '').toLowerCase().trim();
    if (val.getFullYear() <= 1900) {
      return Utilities.formatDate(val, tz, "hh:mm a");
    }
    if (k === 'date' || k === 'paymentdate' || k === 'createddate' || k === 'updateddate') {
      return Utilities.formatDate(val, tz, "dd-MMM-yyyy");
    }
    if (k === 'time') {
      return Utilities.formatDate(val, tz, "hh:mm a");
    }
    return Utilities.formatDate(val, tz, "dd-MMM-yyyy hh:mm a");
  }
  return val;
}

function getColMap(headers) {
  const m = {};
  headers.forEach((h, i) => {
    if (h) m[String(h).trim().toLowerCase()] = i;
  });
  return m;
}

function extractFolderID(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const f = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (f) return f[1];
  return s;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length, dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) dp[i][j] = 0;
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function nowFormatted() {
  const tz = Session.getScriptTimeZone(), now = new Date();
  return {
    date: Utilities.formatDate(now, tz, "dd-MMM-yyyy"),
    time: Utilities.formatDate(now, tz, "hh:mm a"),
    full: Utilities.formatDate(now, tz, "dd-MMM-yyyy hh:mm:ss"),
    iso: now.toISOString()
  };
}

// ============================================================
// 3. MASTER DATABASE OPERATIONS
// ============================================================

function searchEvent(params) {
  try {
    const ss = SpreadsheetApp.openById(MASTER_DB_ID);
    const sheet = ss.getSheetByName("Events");
    if (!sheet) return jsonError("Registry table 'Events' not found.");
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const col = getColMap(headers);
    
    const codeC = col["eventcode"] !== undefined ? col["eventcode"] : 1;
    const nameC = col["eventname"] !== undefined ? col["eventname"] : 3;
    const typeC = col["eventtype"] !== undefined ? col["eventtype"] : 2;
    const statusC = col["status"] !== undefined ? col["status"] : 8;
    
    const searchCode = params.code ? String(params.code).trim().toLowerCase() : null;
    const searchName = params.name ? String(params.name).trim().toLowerCase() : null;
    
    const matches = [];
    
    for (let i = 1; i < data.length; i++) {
      const codeVal = String(data[i][codeC]).trim();
      const nameVal = String(data[i][nameC]).trim();
      const typeVal = String(data[i][typeC]).trim();
      const statusVal = String(data[i][statusC]).trim();
      
      if (statusVal.toLowerCase() !== "active") continue;
      
      let isMatch = false;
      if (searchCode && codeVal.toLowerCase() === searchCode) {
        isMatch = true;
      } else if (searchName && nameVal.toLowerCase().indexOf(searchName) !== -1) {
        isMatch = true;
      }
      
      if (isMatch) {
        matches.push({
          eventCode: codeVal,
          eventName: nameVal,
          eventType: typeVal
        });
      }
    }
    
    return jsonSuccess({ matches: matches });
  } catch (err) {
    return jsonError(err.message);
  }
}

function resolveSpreadsheetID(eventCode) {
  if (!eventCode) throw new Error("EventCode is required.");
  
  const ss = SpreadsheetApp.openById(MASTER_DB_ID);
  const sheet = ss.getSheetByName("Events");
  if (!sheet) throw new Error("Registry table 'Events' not found.");
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = getColMap(headers);
  
  const codeC = col["eventcode"] !== undefined ? col["eventcode"] : 1;
  const ssIdC = col["spreadsheetid"] !== undefined ? col["spreadsheetid"] : 4;
  const statusC = col["status"] !== undefined ? col["status"] : 8;
  
  const cleanCode = eventCode.trim().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    const codeVal = String(data[i][codeC]).trim().toLowerCase();
    const statusVal = String(data[i][statusC]).trim().toLowerCase();
    
    if (codeVal === cleanCode) {
      if (statusVal !== "active") {
        throw new Error("This event is inactive.");
      }
      const ssId = String(data[i][ssIdC]).trim();
      if (!ssId) {
        throw new Error("Spreadsheet ID is missing for this event.");
      }
      return ssId;
    }
  }
  
  throw new Error("Event code not found in registry.");
}

function openEventSpreadsheet(spreadsheetId) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (err) {
    throw new Error("Could not open event database: " + err.message);
  }
}

// ============================================================
// 4. EVENT CONTEXT RESOLVER
// ============================================================

function resolveEventContext(params) {
  const eventCode = params.eventCode || params.code;
  if (!eventCode) {
    throw new Error("Missing parameter: eventCode.");
  }
  const spreadsheetId = resolveSpreadsheetID(eventCode);
  const ss = openEventSpreadsheet(spreadsheetId);
  if (!ss) {
    throw new Error("Failed to open event database.");
  }
  return {
    ss: ss,
    eventCode: eventCode.toUpperCase().trim()
  };
}

function resolveEventMetadata(params) {
  const context = resolveEventContext(params);
  
  // Read event registry to get name/type
  const registrySs = SpreadsheetApp.openById(MASTER_DB_ID);
  const registrySheet = registrySs.getSheetByName("Events");
  const data = registrySheet.getDataRange().getValues();
  const col = getColMap(data[0]);
  
  const codeC = col["eventcode"] !== undefined ? col["eventcode"] : 1;
  const nameC = col["eventname"] !== undefined ? col["eventname"] : 3;
  const typeC = col["eventtype"] !== undefined ? col["eventtype"] : 2;
  const statusC = col["status"] !== undefined ? col["status"] : 8;
  
  let eventName = "EventPay";
  let eventType = "General";
  let status = "Active";
  
  const cleanCode = context.eventCode.toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][codeC]).trim().toLowerCase() === cleanCode) {
      eventName = String(data[i][nameC]).trim();
      eventType = String(data[i][typeC]).trim();
      status = String(data[i][statusC]).trim();
      break;
    }
  }
  
  // Load settings (vertical layout from Settings sheet)
  const settingsSheet = context.ss.getSheetByName("Settings");
  const settingsObj = {};
  if (settingsSheet) {
    const settingsData = settingsSheet.getDataRange().getValues();
    settingsData.forEach(r => {
      if (r[0]) settingsObj[String(r[0]).trim()] = r[1];
    });
  }
  
  return {
    eventCode: context.eventCode,
    eventName: eventName,
    eventType: eventType,
    status: status,
    settings: settingsObj
  };
}

// ============================================================
// 5. EVENT SETTINGS OPERATIONS
// ============================================================

function apiGetSettings(params) {
  try {
    const meta = resolveEventMetadata(params);
    return jsonSuccess(meta);
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiGetPublicVisibility(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    const s = {};
    if (settingsSheet) {
      const data = settingsSheet.getDataRange().getValues();
      data.forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    const isActive = (key) => String(s[key] || "ACTIVE").toUpperCase().trim() === "ACTIVE" || String(s[key] || "").toLowerCase().trim() === "true" || String(s[key] || "").trim() === "1";
    
    return jsonSuccess({
      showDonorList:          isActive("SHOW_DONOR_LIST"),
      showStatistics:         isActive("SHOW_STATISTICS"),
      showHomepageStats:      isActive("SHOW_HOMEPAGE_STATS"),
      showHomepageDonors:     isActive("SHOW_HOMEPAGE_DONORS"),
      showGallery:            isActive("SHOW_GALLERY"),
      showInviteCard:         isActive("SHOW_INVITE_CARD"),
      showPendingPayments:    isActive("SHOW_PENDING_PAYMENTS"),
      showVerifiedPayments:   isActive("SHOW_VERIFIED_PAYMENTS"),
      showRecentPayments:     isActive("SHOW_RECENT_PAYMENTS"),
      showEngagementGallery:  isActive("SHOW_ENGAGEMENT_GALLERY"),
      showHaldiGallery:       isActive("SHOW_HALDI_GALLERY"),
      showMarriageGallery:    isActive("SHOW_MARRIAGE_GALLERY"),
      allowDownloadAll:       isActive("ALLOW_DOWNLOAD_ALL"),
      allowSectionDownload:   isActive("ALLOW_SECTION_DOWNLOAD"),
      showComplaints:         isActive("SHOW_COMPLAINTS"),
      showVideos:             isActive("SHOW_VIDEOS"),
      showAnalytics:          isActive("SHOW_ANALYTICS")
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiUpdateSettings(params) {
  try {
    verifySuperAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Settings");
    if (!sheet) return jsonError("Settings sheet not found.");
    
    const data = sheet.getDataRange().getValues();
    const updates = JSON.parse(params.updates || '{}');
    
    Object.keys(updates).forEach(key => {
      let found = false;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === key) {
          const oldVal = data[i][1];
          sheet.getRange(i + 1, 2).setValue(updates[key]);
          
          logAuditRecord(context.ss, {
            adminUser: params.adminUser,
            module: "Settings",
            action: "Update",
            field: key,
            oldValue: String(oldVal),
            newValue: String(updates[key]),
            reason: params.reason || ""
          });
          
          found = true;
          break;
        }
      }
      if (!found) {
        sheet.appendRow([key, updates[key]]);
        logAuditRecord(context.ss, {
          adminUser: params.adminUser,
          module: "Settings",
          action: "Create",
          field: key,
          oldValue: "",
          newValue: String(updates[key]),
          reason: params.reason || "Init settings param"
        });
      }
    });
    
    return jsonSuccess({ result: "Saved" });
  } catch (err) {
    return jsonError(err.message);
  }
}

// ============================================================
// 6. PAYMENTS & RAZORPAY OPERATIONS
// ============================================================

function apiCreatePaymentOrder(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    
    const s = {};
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    const keyId = s["RAZORPAY_KEY_ID"];
    const keySecret = s["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) {
      return jsonError("Razorpay keys are not configured for this event.");
    }
    
    const amount = Number(params.amount);
    if (!amount || amount <= 0) return jsonError("Invalid amount.");
    
    const minAmt = Number(s["MIN_AMOUNT"] || 50);
    const maxAmt = Number(s["MAX_AMOUNT"] || 100000);
    if (amount < minAmt) return jsonError("Amount is below minimum ₹" + minAmt);
    if (amount > maxAmt) return jsonError("Amount exceeds maximum ₹" + maxAmt);
    
    const url = "https://api.razorpay.com/v1/orders";
    const payload = {
      amount: amount * 100, // paise
      currency: "INR",
      receipt: "receipt_" + Utilities.getUuid().substring(0, 8)
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Basic " + Utilities.base64Encode(keyId + ":" + keySecret)
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const resText = response.getContentText();
    const resData = JSON.parse(resText);
    
    if (response.getResponseCode() !== 200) {
      return jsonError("Razorpay order creation failed: " + (resData.error && resData.error.description || resText));
    }
    
    return jsonSuccess({
      razorpayOrderId: resData.id,
      amountPaise: resData.amount,
      currency: resData.currency,
      keyId: keyId
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiVerifyPayment(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    
    const s = {};
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    const keySecret = s["RAZORPAY_KEY_SECRET"];
    if (!keySecret) return jsonError("Payment gateway configuration missing.");
    
    const orderId = params.razorpay_order_id;
    const paymentId = params.razorpay_payment_id;
    const signature = params.razorpay_signature;
    
    if (!orderId || !paymentId || !signature) {
      return jsonError("Missing verification parameters.");
    }
    
    const signPayload = orderId + "|" + paymentId;
    const computedSignature = Utilities.computeHmacSha256Signature(signPayload, keySecret);
    const computedSignatureHex = computedSignature.map(b => {
      let hex = (b & 0xff).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    
    if (computedSignatureHex !== signature) {
      return jsonError("Payment signature verification failed. Potential fraud attempt.");
    }
    
    const paymentsSheet = context.ss.getSheetByName("Payments");
    if (!paymentsSheet) return jsonError("Payments table not found.");
    
    // Fetch details of payment from Razorpay API
    const url = "https://api.razorpay.com/v1/payments/" + paymentId;
    const options = {
      method: "get",
      headers: {
        "Authorization": "Basic " + Utilities.base64Encode(s["RAZORPAY_KEY_ID"] + ":" + keySecret)
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const pDetails = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() !== 200 || pDetails.status !== "captured") {
      return jsonError("Payment verification failed on gateway. Status: " + (pDetails.status || "Unknown"));
    }
    
    const amount = Number(pDetails.amount) / 100;
    const name = params.name || pDetails.notes.name || "Anonymous";
    const village = params.village || pDetails.notes.village || "";
    const phone = params.phone || pDetails.contact || "";
    const email = params.email || pDetails.email || "";
    const message = params.message || pDetails.notes.message || "";
    
    const n = nowFormatted();
    const receiptNum = "EP" + n.date.replace(/-/g,"") + "_" + Utilities.getUuid().substring(0, 4).toUpperCase();
    
    paymentsSheet.appendRow([
      receiptNum,           // PaymentID / ReceiptNumber
      orderId,              // RazorpayOrderID
      paymentId,            // RazorpayPaymentID
      name,                 // Name
      village,              // Village
      phone,                // Phone
      email,                // Email
      amount,               // Amount
      message,              // Message
      n.date + " " + n.time,// PaymentDate
      "Paid",               // PaymentStatus
      "Pending",            // SettlementStatus
      "None",               // RefundStatus
      n.iso,                // CreatedTime
      n.iso                 // UpdatedTime
    ]);
    
    addVillageInternal(context.ss, village);
    
    try {
      if (s["OrganizerEmail"]) {
        MailApp.sendEmail({
          to: String(s["OrganizerEmail"]),
          subject: "💰 Contribution: " + name + " - ₹" + amount,
          body: "Name: " + name + "\nVillage: " + village + "\nPhone: " + phone + "\nAmount: ₹" + amount + "\nReceipt: " + receiptNum + "\nPayment ID: " + paymentId
        });
      }
    } catch (e) {}
    
    return jsonSuccess({
      receiptNumber: receiptNum,
      paymentId: paymentId,
      amount: amount,
      date: n.date,
      time: n.time
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

function addVillageInternal(ss, villageName) {
  if (!villageName) return;
  try {
    const sheet = ss.getSheetByName("Villages");
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const normalizedNew = villageName.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim().toLowerCase() === normalizedNew) {
        const count = parseInt(data[i][2] || 0) + 1;
        sheet.getRange(i + 1, 3).setValue(count);
        return;
      }
    }
    sheet.appendRow([villageName.trim(), normalizedNew, 1]);
  } catch (e) {}
}

function apiGetPublicStats(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonSuccess({ totalCollected: 0, donorCount: 0, goalAmount: 0 });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ totalCollected: 0, donorCount: 0, goalAmount: 0 });
    
    const col = getColMap(data[0]);
    const aC = col["amount"] !== undefined ? col["amount"] : 7;
    const sC = col["paymentstatus"] !== undefined ? col["paymentstatus"] : 10;
    
    let total = 0, count = 0;
    for (let i = 1; i < data.length; i++) {
      const st = String(data[i][sC]).trim().toLowerCase();
      const amt = Number(data[i][aC]) || 0;
      if (st === "paid") {
        total += amt;
        count++;
      }
    }
    
    const settingsSheet = context.ss.getSheetByName("Settings");
    let goalAmount = 0;
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0] === "Goal Amount") goalAmount = Number(r[1]) || 0;
      });
    }
    
    return jsonSuccess({
      totalCollected: total,
      donorCount: count,
      goalAmount: goalAmount,
      currency: "INR"
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiGetPublicPayments(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonSuccess({ donors: [] });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ donors: [] });
    
    const col = getColMap(data[0]);
    const nC = col["name"] !== undefined ? col["name"] : 3;
    const vC = col["village"] !== undefined ? col["village"] : 4;
    const aC = col["amount"] !== undefined ? col["amount"] : 7;
    const sC = col["paymentstatus"] !== undefined ? col["paymentstatus"] : 10;
    const dC = col["paymentdate"] !== undefined ? col["paymentdate"] : 9;
    const mC = col["message"] !== undefined ? col["message"] : 8;
    
    const donors = [];
    for (let i = 1; i < data.length; i++) {
      const st = String(data[i][sC]).trim().toLowerCase();
      if (st === "paid") {
        donors.push({
          name: data[i][nC],
          village: data[i][vC],
          amount: Number(data[i][aC]) || 0,
          paymentDate: serializeVal(data[i][dC], 'paymentdate'),
          message: data[i][mC] || ""
        });
      }
    }
    
    return jsonSuccess({ donors: donors });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiCheckStatus(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonSuccess({ found: false });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ found: false });
    
    const col = getColMap(data[0]);
    const C = {
      receipt: col["paymentid"] !== undefined ? col["paymentid"] : 0,
      order:   col["razorpayorderid"] !== undefined ? col["razorpayorderid"] : 1,
      payment: col["razorpaypaymentid"] !== undefined ? col["razorpaypaymentid"] : 2,
      name:    col["name"] !== undefined ? col["name"] : 3,
      village: col["village"] !== undefined ? col["village"] : 4,
      phone:   col["phone"] !== undefined ? col["phone"] : 5,
      amount:  col["amount"] !== undefined ? col["amount"] : 7,
      msg:     col["message"] !== undefined ? col["message"] : 8,
      date:    col["paymentdate"] !== undefined ? col["paymentdate"] : 9,
      status:  col["paymentstatus"] !== undefined ? col["paymentstatus"] : 10,
      settle:  col["settlementstatus"] !== undefined ? col["settlementstatus"] : 11,
      refund:  col["refundstatus"] !== undefined ? col["refundstatus"] : 12
    };
    
    const searchVal = String(params.searchVal || "").trim().toLowerCase();
    if (!searchVal) return jsonSuccess({ found: false });
    
    for (let i = 1; i < data.length; i++) {
      const recVal = String(data[i][C.receipt]).toLowerCase();
      const phoneVal = String(data[i][C.phone]).toLowerCase();
      const payVal = String(data[i][C.payment]).toLowerCase();
      
      const isMatch = recVal === searchVal || phoneVal === searchVal || payVal === searchVal || recVal.slice(-5) === searchVal;
      
      if (isMatch) {
        return jsonSuccess({
          found: true,
          receiptNumber: data[i][C.receipt],
          paymentId: data[i][C.payment],
          name: data[i][C.name],
          village: data[i][C.village],
          phone: data[i][C.phone],
          amount: Number(data[i][C.amount]),
          message: data[i][C.msg],
          date: serializeVal(data[i][C.date], 'paymentdate'),
          status: data[i][C.status],
          settlementStatus: data[i][C.settle],
          refundStatus: data[i][C.refund]
        });
      }
    }
    
    return jsonSuccess({ found: false });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiGetPayments(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonSuccess({ payments: [] });
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const payments = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = { _row: i + 1 };
      headers.forEach((h, j) => {
        if (h) row[String(h).trim()] = serializeVal(data[i][j], h);
      });
      payments.push(row);
    }
    
    return jsonSuccess({ payments: payments });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiUpdatePayments(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonError("Payments table not found.");
    
    const row = Number(params.row);
    const updates = JSON.parse(params.updates || '{}');
    
    const headers = sheet.getDataRange().getValues()[0];
    const col = getColMap(headers);
    
    Object.keys(updates).forEach(key => {
      const colIdx = col[key.toLowerCase()];
      if (colIdx !== undefined) {
        const oldVal = sheet.getRange(row, colIdx + 1).getValue();
        sheet.getRange(row, colIdx + 1).setValue(updates[key]);
        
        logAuditRecord(context.ss, {
          adminUser: params.adminUser,
          module: "Payments",
          action: "Edit",
          field: key,
          oldValue: String(oldVal),
          newValue: String(updates[key]),
          reason: params.reason || "Dashboard edit"
        });
      }
    });
    
    return jsonSuccess({ result: "Updated" });
  } catch (err) {
    return jsonError(err.message);
  }
}

// ============================================================
// 7. PHOTO GALLERY OPERATIONS
// ============================================================

function apiGetGalleryImages(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Gallery");
    if (!sheet) return jsonSuccess({ sections: {}, images: [] });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ sections: {}, images: [] });
    
    const col = getColMap(data[0]);
    const fldC = col["folder"] !== undefined ? col["folder"] : 1;
    const urlC = col["imageurl"] !== undefined ? col["imageurl"] : 3;
    const thbC = col["thumbnailurl"] !== undefined ? col["thumbnailurl"] : 4;
    const nameC = col["imagename"] !== undefined ? col["imagename"] : 2;
    const statusC = col["status"] !== undefined ? col["status"] : 7;
    
    const sections = {
      marriage: [],
      reception: [],
      haldi: [],
      engagement: [],
      public: []
    };
    
    const allImages = [];
    
    for (let i = 1; i < data.length; i++) {
      const statusVal = String(data[i][statusC]).trim().toLowerCase();
      if (statusVal !== "approved") continue;
      
      const folderVal = String(data[i][fldC]).trim().toLowerCase();
      const urlVal = String(data[i][urlC]).trim();
      const thumbVal = String(data[i][thbC]).trim();
      const nameVal = String(data[i][nameC]).trim();
      
      const imgObj = {
        id: String(i + 1),
        url: urlVal,
        thumb: thumbVal || urlVal,
        name: nameVal
      };
      
      if (sections[folderVal] !== undefined) {
        sections[folderVal].push(imgObj);
      } else {
        sections.public.push(imgObj);
      }
      
      allImages.push(imgObj);
    }
    
    return jsonSuccess({
      sections: sections,
      images: allImages
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiUploadPhoto(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    
    const s = {};
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    const folderCategory = String(params.folder || "public").trim().toLowerCase();
    const folderKey = folderCategory.toUpperCase() + "_FOLDER_ID";
    const folderId = extractFolderID(s[folderKey] || s["PUBLIC_FOLDER_ID"]);
    
    if (!folderId) {
      return jsonError("Drive folder configuration not found for category: " + folderCategory);
    }
    
    const name = params.name || "Anonymous";
    const filedata = params.filedata;
    const filename = params.filename || "upload_" + Date.now();
    const filetype = params.filetype || "image/jpeg";
    
    if (!filedata) return jsonError("No image data provided.");
    
    const cleanBase64 = filedata.split(",")[1] || filedata;
    const bytes = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(bytes, filetype, filename);
    
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const fileUrl = file.getUrl();
    const fileId = file.getId();
    const thumbUrl = "https://lh3.googleusercontent.com/d/" + fileId + "=w400-h400-no";
    
    const gallerySheet = context.ss.getSheetByName("Gallery");
    if (!gallerySheet) return jsonError("Gallery table not found.");
    
    const n = nowFormatted();
    const photoId = "PH" + Utilities.getUuid().substring(0, 8).toUpperCase();
    const defaultStatus = (s["MODERATION_ENABLED"] === "No" || s["MODERATION_ENABLED"] === "false") ? "Approved" : "Pending";
    
    gallerySheet.appendRow([
      photoId,          // PhotoID
      folderCategory,   // Folder
      filename,         // ImageName
      fileUrl,          // ImageURL
      thumbUrl,         // ThumbnailURL
      name,             // UploadedBy
      n.iso,            // UploadedTime
      defaultStatus     // Status
    ]);
    
    return jsonSuccess({
      photoId: photoId,
      status: defaultStatus,
      message: defaultStatus === "Approved" ? "Uploaded and published!" : "Submitted for approval."
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiGetPendingPhotos(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Gallery");
    if (!sheet) return jsonSuccess({ photos: [] });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ photos: [] });
    
    const col = getColMap(data[0]);
    const idC = col["photoid"] !== undefined ? col["photoid"] : 0;
    const fldC = col["folder"] !== undefined ? col["folder"] : 1;
    const nameC = col["imagename"] !== undefined ? col["imagename"] : 2;
    const urlC = col["imageurl"] !== undefined ? col["imageurl"] : 3;
    const whoC = col["uploadedby"] !== undefined ? col["uploadedby"] : 5;
    const whenC = col["uploadedtime"] !== undefined ? col["uploadedtime"] : 6;
    const statusC = col["status"] !== undefined ? col["status"] : 7;
    
    const photos = [];
    for (let i = 1; i < data.length; i++) {
      const statusVal = String(data[i][statusC]).trim();
      if (statusVal === "Pending") {
        photos.push({
          row: i + 1,
          photoId: data[i][idC],
          folder: data[i][fldC],
          name: data[i][nameC],
          url: data[i][urlC],
          uploadedBy: data[i][whoC],
          uploadedTime: serializeVal(data[i][whenC], 'uploadedtime')
        });
      }
    }
    
    return jsonSuccess({ photos: photos });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiModeratePhoto(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Gallery");
    if (!sheet) return jsonError("Gallery table not found.");
    
    const row = Number(params.row);
    const approve = String(params.approve).toLowerCase() === "true" || String(params.approve) === "1";
    
    const headers = sheet.getDataRange().getValues()[0];
    const col = getColMap(headers);
    const statusIdx = col["status"];
    
    if (statusIdx === undefined) return jsonError("Status column not found.");
    
    const newStatus = approve ? "Approved" : "Rejected";
    sheet.getRange(row, statusIdx + 1).setValue(newStatus);
    
    logAuditRecord(context.ss, {
      adminUser: params.adminUser,
      module: "Gallery",
      action: approve ? "Approve" : "Reject",
      field: "Status",
      oldValue: "Pending",
      newValue: newStatus,
      reason: params.reason || "Admin moderation"
    });
    
    return jsonSuccess({ result: "Moderated", status: newStatus });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiDeletePhoto(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Gallery");
    if (!sheet) return jsonError("Gallery table not found.");
    
    const row = Number(params.row);
    const data = sheet.getDataRange().getValues();
    if (row < 2 || row > data.length) return jsonError("Invalid row index.");
    
    const headers = data[0];
    const col = getColMap(headers);
    
    const idVal = data[row - 1][col["photoid"]];
    const urlVal = data[row - 1][col["imageurl"]];
    
    try {
      const fileId = extractFolderID(urlVal);
      if (fileId) {
        DriveApp.getFileById(fileId).setTrashed(true);
      }
    } catch (e) {}
    
    sheet.deleteRow(row);
    
    logAuditRecord(context.ss, {
      adminUser: params.adminUser,
      module: "Gallery",
      action: "Delete",
      field: "Row",
      oldValue: String(idVal),
      newValue: "Deleted",
      reason: params.reason || "Gallery cleaning"
    });
    
    return jsonSuccess({ result: "Deleted" });
  } catch (err) {
    return jsonError(err.message);
  }
}

// ============================================================
// 8. COMPLAINTS & GUEST FEEDBACK OPERATIONS
// ============================================================

function apiSubmitComplaint(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    
    const s = {};
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    let fileUrl = "";
    if (params.filedata) {
      try {
        const folderId = extractFolderID(s["PUBLIC_FOLDER_ID"]);
        if (folderId) {
          const cleanBase64 = params.filedata.split(",")[1] || params.filedata;
          const bytes = Utilities.base64Decode(cleanBase64);
          const blob = Utilities.newBlob(bytes, params.filetype || "image/jpeg", params.filename || "screenshot_" + Date.now());
          
          const folder = DriveApp.getFolderById(folderId);
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fileUrl = file.getUrl();
        }
      } catch (err) {}
    }
    
    const complaintsSheet = context.ss.getSheetByName("Complaints");
    if (!complaintsSheet) return jsonError("Complaints database table not found.");
    
    const name = params.name || "Anonymous";
    const village = params.village || "";
    const phone = params.phone || "";
    const complaintText = params.complaint || "";
    
    if (!complaintText) return jsonError("Please describe your issue.");
    
    const n = nowFormatted();
    const complaintId = "CP" + Utilities.getUuid().substring(0, 8).toUpperCase();
    
    complaintsSheet.appendRow([
      complaintId,          // ComplaintID
      name,                 // Name
      village,              // Village
      phone,                // Phone
      complaintText,        // Complaint
      fileUrl,              // ImageURL
      "Open",               // Status
      "",                   // Reply
      n.iso,                // CreatedTime
      ""                    // ResolvedTime
    ]);
    
    return jsonSuccess({
      complaintId: complaintId,
      status: "Open"
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiGetComplaintStatus(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Complaints");
    if (!sheet) return jsonSuccess({ complaints: [] });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ complaints: [] });
    
    const col = getColMap(data[0]);
    const idC = col["complaintid"] !== undefined ? col["complaintid"] : 0;
    const txtC = col["complaint"] !== undefined ? col["complaint"] : 4;
    const phC = col["phone"] !== undefined ? col["phone"] : 3;
    const stC = col["status"] !== undefined ? col["status"] : 6;
    const repC = col["reply"] !== undefined ? col["reply"] : 7;
    const timeC = col["createdtime"] !== undefined ? col["createdtime"] : 8;
    
    const searchPhone = String(params.phone || "").trim().toLowerCase();
    const searchId = String(params.trackId || params.complaintId || "").trim().toLowerCase();
    
    if (!searchPhone && !searchId) {
      return jsonError("Phone or Complaint ID is required.");
    }
    
    const results = [];
    
    for (let i = 1; i < data.length; i++) {
      const idVal = String(data[i][idC]).trim();
      const phoneVal = String(data[i][phC]).trim();
      
      let isMatch = false;
      if (searchId && idVal.toLowerCase() === searchId) {
        isMatch = true;
      } else if (searchPhone && phoneVal.toLowerCase() === searchPhone) {
        isMatch = true;
      }
      
      if (isMatch) {
        results.push({
          complaintId: idVal,
          complaint: data[i][txtC],
          status: data[i][stC],
          reply: data[i][repC],
          createdTime: serializeVal(data[i][timeC], 'createdtime')
        });
      }
    }
    
    return jsonSuccess({ complaints: results });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiGetComplaints(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Complaints");
    if (!sheet) return jsonSuccess({ complaints: [] });
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const complaints = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = { _row: i + 1 };
      headers.forEach((h, j) => {
        if (h) row[String(h).trim()] = serializeVal(data[i][j], h);
      });
      complaints.push(row);
    }
    
    return jsonSuccess({ complaints: complaints });
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiUpdateComplaint(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Complaints");
    if (!sheet) return jsonError("Complaints table not found.");
    
    const row = Number(params.row);
    const status = params.status;
    const reply = params.reply;
    
    const headers = sheet.getDataRange().getValues()[0];
    const col = getColMap(headers);
    
    const statusIdx = col["status"];
    const replyIdx = col["reply"];
    const resolvedTimeIdx = col["resolvedtime"];
    
    if (statusIdx === undefined || replyIdx === undefined) {
      return jsonError("Table schema mismatch.");
    }
    
    const n = nowFormatted();
    sheet.getRange(row, statusIdx + 1).setValue(status);
    sheet.getRange(row, replyIdx + 1).setValue(reply);
    
    if ((status === "Resolved" || status === "Closed") && resolvedTimeIdx !== undefined) {
      sheet.getRange(row, resolvedTimeIdx + 1).setValue(n.iso);
    }
    
    logAuditRecord(context.ss, {
      adminUser: params.adminUser,
      module: "Complaints",
      action: "Update",
      field: "Resolution",
      oldValue: "Open",
      newValue: status + " (" + reply.substring(0, 10) + "...)",
      reason: params.reason || "Complaint resolved by admin"
    });
    
    return jsonSuccess({ result: "Resolved" });
  } catch (err) {
    return jsonError(err.message);
  }
}

// ============================================================
// 9. ANALYTICS & TRENDS AGGREGATOR
// ============================================================

function apiAdminGetAnalytics(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    
    const paymentsSheet = context.ss.getSheetByName("Payments");
    if (!paymentsSheet) {
      return jsonSuccess({
        TotalAmount: 0,
        TotalPayments: 0,
        TopDonors: [],
        DailyTrends: {},
        VillageStats: {}
      });
    }
    
    const data = paymentsSheet.getDataRange().getValues();
    const headers = data[0];
    const col = getColMap(headers);
    
    const nameC = col["name"] !== undefined ? col["name"] : 3;
    const villageC = col["village"] !== undefined ? col["village"] : 4;
    const amountC = col["amount"] !== undefined ? col["amount"] : 7;
    const dateC = col["paymentdate"] !== undefined ? col["paymentdate"] : 9;
    const statusC = col["paymentstatus"] !== undefined ? col["paymentstatus"] : 10;
    
    let totalAmt = 0;
    let totalPayments = 0;
    const donors = [];
    const dailyCollection = {};
    const villageContributions = {};
    
    for (let i = 1; i < data.length; i++) {
      const statusVal = String(data[i][statusC]).trim().toLowerCase();
      const amountVal = Number(data[i][amountC]) || 0;
      const nameVal = String(data[i][nameC]).trim();
      const villageVal = String(data[i][villageC]).trim();
      const dateVal = serializeVal(data[i][dateC], 'paymentdate');
      
      if (statusVal === "paid") {
        totalAmt += amountVal;
        totalPayments++;
        
        donors.push({ name: nameVal, village: villageVal, amount: amountVal });
        
        if (dateVal) {
          dailyCollection[dateVal] = (dailyCollection[dateVal] || 0) + amountVal;
        }
        
        if (villageVal) {
          villageContributions[villageVal] = (villageContributions[villageVal] || 0) + amountVal;
        }
      }
    }
    
    donors.sort((a, b) => b.amount - a.amount);
    const topDonors = donors.slice(0, 10);
    
    const villageList = Object.keys(villageContributions).map(v => ({
      village: v,
      amount: villageContributions[v]
    })).sort((a, b) => b.amount - a.amount);
    
    return jsonSuccess({
      TotalAmount: totalAmt,
      TotalPayments: totalPayments,
      TopDonors: topDonors,
      DailyTrends: dailyCollection,
      VillageStats: villageList
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

// ============================================================
// 10. ADMIN AUTHENTICATION, SESSIONS & AUDITING
// ============================================================

function apiLoginAdmin(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Admins");
    if (!sheet) return jsonError("Admins authentication table not found.");
    
    const username = String(params.username || "").trim();
    const password = String(params.password || "").trim();
    
    if (!username || !password) return jsonError("Missing login credentials.");
    
    const data = sheet.getDataRange().getValues();
    const col = getColMap(data[0]);
    
    const userIdx = col["username"] !== undefined ? col["username"] : 0;
    const passIdx = col["password"] !== undefined ? col["password"] : 1;
    const roleIdx = col["role"] !== undefined ? col["role"] : 2;
    const accessIdx = col["accesslevel"] !== undefined ? col["accesslevel"] : 3;
    const statusIdx = col["status"] !== undefined ? col["status"] : 4;
    const emailIdx = col["email"] !== undefined ? col["email"] : 5;
    const loginIdx = col["lastlogin"] !== undefined ? col["lastlogin"] : 7;
    
    for (let i = 1; i < data.length; i++) {
      const uVal = String(data[i][userIdx]).trim();
      const pVal = String(data[i][passIdx]).trim();
      const statusVal = String(data[i][statusIdx] || "Active").trim().toLowerCase();
      
      if (uVal === username && pVal === password) {
        if (statusVal === "inactive") {
          return jsonError("Account is inactive. Contact Super Admin.");
        }
        
        const n = nowFormatted();
        if (loginIdx !== undefined) {
          sheet.getRange(i + 1, loginIdx + 1).setValue(n.full);
        }
        
        const settingsSheet = context.ss.getSheetByName("Settings");
        let timeout = 30;
        if (settingsSheet) {
          settingsSheet.getDataRange().getValues().forEach(r => {
            if (r[0] === "SessionTimeoutMinutes") timeout = parseInt(r[1]) || 30;
          });
        }
        
        const expiry = new Date(Date.now() + timeout * 60 * 1000).toISOString();
        const token = Utilities.getUuid();
        
        const cache = CacheService.getScriptCache();
        const sessionInfo = {
          username: username,
          role: String(data[i][roleIdx]),
          accessLevel: String(data[i][accessIdx]),
          email: String(data[i][emailIdx]),
          eventCode: context.eventCode
        };
        cache.put("session_" + token, JSON.stringify(sessionInfo), timeout * 60);
        
        logAuditRecord(context.ss, {
          adminUser: username,
          module: "Auth",
          action: "Login",
          field: "Session",
          oldValue: "Offline",
          newValue: "Online",
          reason: "Dashboard login"
        });
        
        return jsonSuccess({
          role: sessionInfo.role,
          accessLevel: sessionInfo.accessLevel,
          email: sessionInfo.email,
          token: token,
          expiry: expiry
        });
      }
    }
    
    return jsonError("Invalid username or password.");
  } catch (err) {
    return jsonError(err.message);
  }
}

function apiAdminLogout(params) {
  try {
    const token = params.adminToken || params.token;
    if (token) {
      const cache = CacheService.getScriptCache();
      cache.remove("session_" + token);
    }
    return jsonSuccess({ result: "LoggedOut" });
  } catch (err) {
    return jsonError(err.message);
  }
}

function verifyAdmin(params) {
  const token = params.adminToken || params.token;
  if (!token) throw new Error("Unauthorized: session token is missing.");
  
  const cache = CacheService.getScriptCache();
  const cached = cache.get("session_" + token);
  if (!cached) throw new Error("Unauthorized: session expired or invalid.");
  
  const session = JSON.parse(cached);
  if (session.eventCode !== String(params.eventCode || "").toUpperCase().trim()) {
    throw new Error("Unauthorized: token does not match this event's context.");
  }
  
  return session;
}

function verifySuperAdmin(params) {
  const session = verifyAdmin(params);
  const role = String(session.role).toLowerCase();
  if (role !== "super admin" && role !== "superadmin") {
    throw new Error("Super Admin permissions required.");
  }
  return session;
}

function logAuditRecord(ss, record) {
  try {
    const sheet = ss.getSheetByName("AuditLog");
    if (!sheet) return;
    const n = nowFormatted();
    sheet.appendRow([
      n.full,
      record.adminUser || "system",
      record.action || "",
      record.module || "",
      record.field || "",
      record.oldValue || "",
      record.newValue || "",
      record.reason || ""
    ]);
  } catch (e) {}
}

function apiGetAuditLog(params) {
  try {
    verifySuperAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("AuditLog");
    if (!sheet) return jsonSuccess({ audit: [] });
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const logs = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = { _row: i + 1 };
      headers.forEach((h, j) => {
        if (h) row[String(h).trim()] = serializeVal(data[i][j], h);
      });
      logs.push(row);
    }
    
    return jsonSuccess({ audit: logs });
  } catch (err) {
    return jsonError(err.message);
  }
}

// ============================================================
// 11. SHEETMAKER & SEED DATABASE SYSTEM
// ============================================================

function apiCreateEventSpreadsheet(params) {
  try {
    verifySuperAdmin(params);
    const spreadsheetId = params.targetSpreadsheetId;
    if (!spreadsheetId) return jsonError("Target Spreadsheet ID is required.");
    
    const ss = openEventSpreadsheet(spreadsheetId);
    
    // 1. Payments sheet setup
    setupSheet(ss, "Payments", [
      "PaymentID", "ReceiptNumber", "RazorpayOrderID", "RazorpayPaymentID",
      "Name", "Village", "Phone", "Email", "Amount", "Message",
      "PaymentDate", "PaymentStatus", "SettlementStatus", "RefundStatus",
      "CreatedTime", "UpdatedTime"
    ]);
    
    // 2. Complaints sheet setup
    setupSheet(ss, "Complaints", [
      "ComplaintID", "Name", "Village", "Phone", "Complaint", "ImageURL",
      "Status", "Reply", "CreatedTime", "ResolvedTime"
    ]);
    
    // 3. Gallery sheet setup
    setupSheet(ss, "Gallery", [
      "PhotoID", "Folder", "ImageName", "ImageURL", "ThumbnailURL",
      "UploadedBy", "UploadedTime", "Status"
    ]);
    
    // 4. Settings sheet (Vertical layout)
    const settingsSheet = setupSheet(ss, "Settings", ["Property", "Value"]);
    if (settingsSheet.getLastRow() <= 1) {
      const defaultSettings = [
        ["Bride Name", "Sita"],
        ["Groom Name", "Ram"],
        ["Event Name", "Ram & Sita Wedding Celebration"],
        ["Event Type", "Wedding"],
        ["Venue", "Royal Palace, Visakhapatnam"],
        ["Event Date", "2026-12-25"],
        ["Goal Amount", "500000"],
        ["MIN_AMOUNT", "100"],
        ["MAX_AMOUNT", "50000"],
        ["Theme", "royal-purple"],
        ["SHOW_DONOR_LIST", "Active"],
        ["SHOW_STATISTICS", "Active"],
        ["SHOW_HOMEPAGE_STATS", "Active"],
        ["SHOW_HOMEPAGE_DONORS", "Active"],
        ["SHOW_GALLERY", "Active"],
        ["SHOW_INVITE_CARD", "Active"],
        ["SHOW_COMPLAINTS", "Active"],
        ["MODERATION_ENABLED", "true"],
        ["SessionTimeoutMinutes", "30"],
        ["RAZORPAY_KEY_ID", "rzp_test_YOUR_KEY_ID"],
        ["RAZORPAY_KEY_SECRET", "YOUR_KEY_SECRET"],
        ["PUBLIC_FOLDER_ID", "YOUR_GOOGLE_DRIVE_PUBLIC_FOLDER_ID"]
      ];
      defaultSettings.forEach(r => settingsSheet.appendRow(r));
    }
    
    // 5. AuditLog sheet setup
    setupSheet(ss, "AuditLog", [
      "Time", "User", "Action", "Page", "Field", "OldValue", "NewValue", "Reason"
    ]);
    
    // 6. Analytics sheet setup
    setupSheet(ss, "Analytics", ["Metric", "Value", "UpdatedAt"]);
    
    // 7. Admins sheet setup
    const adminsSheet = setupSheet(ss, "Admins", [
      "Username", "Password", "Role", "AccessLevel", "Status", "Email", "CreatedAt", "LastLogin"
    ]);
    if (adminsSheet.getLastRow() <= 1) {
      const n = nowFormatted();
      adminsSheet.appendRow([
        "admin",          // Username
        "admin123",       // Password
        "Super Admin",    // Role
        "Full",           // AccessLevel
        "Active",         // Status
        "admin@eventpay.com",
        n.iso,
        ""
      ]);
    }
    
    // 8. Villages sheet setup
    setupSheet(ss, "Villages", ["VillageID", "VillageName", "Status"]);
    
    return jsonSuccess({ result: "SpreadsheetInitialized" });
  } catch (err) {
    return jsonError(err.message);
  }
}

function setupSheet(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f1f5f9");
    headerRange.setFontColor("#0f172a");
    sheet.setFrozenRows(1);
  }
  return sheet;
}
                    









// ============================================================
// Security.gs — Admin Authentication & Audit Logging
// ============================================================

// Authenticate Admin and generate session parameters
function apiLoginAdmin(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Admins");
    if (!sheet) return jsonError("Admins authentication table not found.");
    
    const username = String(params.username || "").trim();
    const password = String(params.password || "").trim();
    
    if (!username || !password) return jsonError("Missing login credentials.");
    
    const data = sheet.getDataRange().getValues();
    const col = getColMap(data[0]);
    
    const userIdx = col["username"] !== undefined ? col["username"] : 0;
    const passIdx = col["password"] !== undefined ? col["password"] : 1;
    const roleIdx = col["role"] !== undefined ? col["role"] : 2;
    const accessIdx = col["accesslevel"] !== undefined ? col["accesslevel"] : 3;
    const statusIdx = col["status"] !== undefined ? col["status"] : 4;
    const emailIdx = col["email"] !== undefined ? col["email"] : 5;
    const loginIdx = col["lastlogin"] !== undefined ? col["lastlogin"] : 7;
    
    for (let i = 1; i < data.length; i++) {
      const uVal = String(data[i][userIdx]).trim();
      const pVal = String(data[i][passIdx]).trim();
      const statusVal = String(data[i][statusIdx] || "Active").trim().toLowerCase();
      
      if (uVal === username && pVal === password) {
        if (statusVal === "inactive") {
          return jsonError("Account is inactive. Contact Super Admin.");
        }
        
        // Update last login
        const n = nowFormatted();
        if (loginIdx !== undefined) {
          sheet.getRange(i + 1, loginIdx + 1).setValue(n.full);
        }
        
        // Session timeout from Settings or 30 minutes
        const settingsSheet = context.ss.getSheetByName("Settings");
        let timeout = 30;
        if (settingsSheet) {
          settingsSheet.getDataRange().getValues().forEach(r => {
            if (r[0] === "SessionTimeoutMinutes") timeout = parseInt(r[1]) || 30;
          });
        }
        
        const expiry = new Date(Date.now() + timeout * 60 * 1000).toISOString();
        const token = Utilities.getUuid();
        
        // Cache session token in Script Cache for authentication
        const cache = CacheService.getScriptCache();
        const sessionInfo = {
          username: username,
          role: String(data[i][roleIdx]),
          accessLevel: String(data[i][accessIdx]),
          email: String(data[i][emailIdx]),
          eventCode: context.eventCode
        };
        cache.put("session_" + token, JSON.stringify(sessionInfo), timeout * 60);
        
        logAuditRecord(context.ss, {
          adminUser: username,
          module: "Auth",
          action: "Login",
          field: "Session",
          oldValue: "Offline",
          newValue: "Online",
          reason: "Dashboard login"
        });
        
        return jsonSuccess({
          role: sessionInfo.role,
          accessLevel: sessionInfo.accessLevel,
          email: sessionInfo.email,
          token: token,
          expiry: expiry
        });
      }
    }
    
    return jsonError("Invalid username or password.");
  } catch (err) {
    return jsonError(err.message);
  }
}

// Logs admin user out of their session
function apiAdminLogout(params) {
  try {
    const token = params.adminToken || params.token;
    if (token) {
      const cache = CacheService.getScriptCache();
      cache.remove("session_" + token);
    }
    return jsonSuccess({ result: "LoggedOut" });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Validates token session existence and permissions
function verifyAdmin(params) {
  const token = params.adminToken || params.token;
  if (!token) throw new Error("Unauthorized: session token is missing.");
  
  const cache = CacheService.getScriptCache();
  const cached = cache.get("session_" + token);
  if (!cached) throw new Error("Unauthorized: session expired or invalid.");
  
  const session = JSON.parse(cached);
  if (session.eventCode !== String(params.eventCode || "").toUpperCase().trim()) {
    throw new Error("Unauthorized: token does not match this event's context.");
  }
  
  return session;
}

// Validates super admin permissions specifically
function verifySuperAdmin(params) {
  const session = verifyAdmin(params);
  const role = String(session.role).toLowerCase();
  if (role !== "super admin" && role !== "superadmin") {
    throw new Error("Super Admin permissions required.");
  }
  return session;
}

// Logs action records directly into event spreadsheet AuditLog sheet
function logAuditRecord(ss, record) {
  try {
    const sheet = ss.getSheetByName("AuditLog");
    if (!sheet) return;
    const n = nowFormatted();
    sheet.appendRow([
      n.full,
      record.adminUser || "system",
      record.action || "",
      record.module || "",
      record.field || "",
      record.oldValue || "",
      record.newValue || "",
      record.reason || ""
    ]);
  } catch (e) {}
}

// Admin: Gets all audit logs list
function apiGetAuditLog(params) {
  try {
    verifySuperAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("AuditLog");
    if (!sheet) return jsonSuccess({ audit: [] });
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const logs = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = { _row: i + 1 };
      headers.forEach((h, j) => {
        if (h) row[String(h).trim()] = serializeVal(data[i][j], h);
      });
      logs.push(row);
    }
    
    return jsonSuccess({ audit: logs });
  } catch (err) {
    return jsonError(err.message);
  }
}












// ============================================================
// Analytics.gs — Admin Dashboard Analytics & Chart Data Sets
// ============================================================

// Compiles statistics for Admin Panel dashboard charts and cards
function apiAdminGetAnalytics(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    
    // Read payments
    const paymentsSheet = context.ss.getSheetByName("Payments");
    if (!paymentsSheet) {
      return jsonSuccess({
        TotalAmount: 0,
        TotalPayments: 0,
        TopDonors: [],
        DailyTrends: {},
        VillageStats: {}
      });
    }
    
    const data = paymentsSheet.getDataRange().getValues();
    const headers = data[0];
    const col = getColMap(headers);
    
    const nameC = col["name"] !== undefined ? col["name"] : 3;
    const villageC = col["village"] !== undefined ? col["village"] : 4;
    const amountC = col["amount"] !== undefined ? col["amount"] : 7;
    const dateC = col["paymentdate"] !== undefined ? col["paymentdate"] : 9;
    const statusC = col["paymentstatus"] !== undefined ? col["paymentstatus"] : 10;
    
    let totalAmt = 0;
    let totalPayments = 0;
    const donors = [];
    const dailyCollection = {};
    const villageContributions = {};
    
    for (let i = 1; i < data.length; i++) {
      const statusVal = String(data[i][statusC]).trim().toLowerCase();
      const amountVal = Number(data[i][amountC]) || 0;
      const nameVal = String(data[i][nameC]).trim();
      const villageVal = String(data[i][villageC]).trim();
      const dateVal = serializeVal(data[i][dateC], 'paymentdate');
      
      if (statusVal === "paid") {
        totalAmt += amountVal;
        totalPayments++;
        
        // Donors listing for leaderboard sorting later
        donors.push({ name: nameVal, village: villageVal, amount: amountVal });
        
        // Aggregate daily trends
        if (dateVal) {
          dailyCollection[dateVal] = (dailyCollection[dateVal] || 0) + amountVal;
        }
        
        // Aggregate village collections
        if (villageVal) {
          villageContributions[villageVal] = (villageContributions[villageVal] || 0) + amountVal;
        }
      }
    }
    
    // Top 10 Donors sorting
    donors.sort((a, b) => b.amount - a.amount);
    const topDonors = donors.slice(0, 10);
    
    // Format village distributions
    const villageList = Object.keys(villageContributions).map(v => ({
      village: v,
      amount: villageContributions[v]
    })).sort((a, b) => b.amount - a.amount);
    
    return jsonSuccess({
      TotalAmount: totalAmt,
      TotalPayments: totalPayments,
      TopDonors: topDonors,
      DailyTrends: dailyCollection,
      VillageStats: villageList
    });
  } catch (err) {
    return jsonError(err.message);
  }
}





// ============================================================
// Complaints.gs — Guest Complaints & Support Operations
// ============================================================

// Guest submits support case/complaint (supports optional attachment)
function apiSubmitComplaint(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    
    // Read public folder ID for attachments
    const s = {};
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    let fileUrl = "";
    if (params.filedata) {
      try {
        const folderId = extractFolderID(s["PUBLIC_FOLDER_ID"]);
        if (folderId) {
          const cleanBase64 = params.filedata.split(",")[1] || params.filedata;
          const bytes = Utilities.base64Decode(cleanBase64);
          const blob = Utilities.newBlob(bytes, params.filetype || "image/jpeg", params.filename || "screenshot_" + Date.now());
          
          const folder = DriveApp.getFolderById(folderId);
          const file = folder.createFile(blob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          fileUrl = file.getUrl();
        }
      } catch (err) {
        // Attachment failure is non-fatal to complaint submission
      }
    }
    
    const complaintsSheet = context.ss.getSheetByName("Complaints");
    if (!complaintsSheet) return jsonError("Complaints database table not found.");
    
    const name = params.name || "Anonymous";
    const village = params.village || "";
    const phone = params.phone || "";
    const complaintText = params.complaint || "";
    
    if (!complaintText) return jsonError("Please describe your issue.");
    
    const n = nowFormatted();
    const complaintId = "CP" + Utilities.getUuid().substring(0, 8).toUpperCase();
    
    complaintsSheet.appendRow([
      complaintId,          // ComplaintID
      name,                 // Name
      village,              // Village
      phone,                // Phone
      complaintText,        // Complaint
      fileUrl,              // ImageURL
      "Open",               // Status (Open/In Progress/Resolved/Closed)
      "",                   // Reply
      n.iso,                // CreatedTime
      ""                    // ResolvedTime
    ]);
    
    return jsonSuccess({
      complaintId: complaintId,
      status: "Open"
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Guest tracks complaint list using their phone number or Complaint ID
function apiGetComplaintStatus(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Complaints");
    if (!sheet) return jsonSuccess({ complaints: [] });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ complaints: [] });
    
    const col = getColMap(data[0]);
    const idC = col["complaintid"] !== undefined ? col["complaintid"] : 0;
    const txtC = col["complaint"] !== undefined ? col["complaint"] : 4;
    const phC = col["phone"] !== undefined ? col["phone"] : 3;
    const stC = col["status"] !== undefined ? col["status"] : 6;
    const repC = col["reply"] !== undefined ? col["reply"] : 7;
    const timeC = col["createdtime"] !== undefined ? col["createdtime"] : 8;
    
    const searchPhone = String(params.phone || "").trim().toLowerCase();
    const searchId = String(params.trackId || params.complaintId || "").trim().toLowerCase();
    
    if (!searchPhone && !searchId) {
      return jsonError("Phone or Complaint ID is required.");
    }
    
    const results = [];
    
    for (let i = 1; i < data.length; i++) {
      const idVal = String(data[i][idC]).trim();
      const phoneVal = String(data[i][phC]).trim();
      
      let isMatch = false;
      if (searchId && idVal.toLowerCase() === searchId) {
        isMatch = true;
      } else if (searchPhone && phoneVal.toLowerCase() === searchPhone) {
        isMatch = true;
      }
      
      if (isMatch) {
        results.push({
          complaintId: idVal,
          complaint: data[i][txtC],
          status: data[i][stC],
          reply: data[i][repC],
          createdTime: serializeVal(data[i][timeC], 'createdtime')
        });
      }
    }
    
    return jsonSuccess({ complaints: results });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Admin: Retrieve complaints list
function apiGetComplaints(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Complaints");
    if (!sheet) return jsonSuccess({ complaints: [] });
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const complaints = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = { _row: i + 1 };
      headers.forEach((h, j) => {
        if (h) row[String(h).trim()] = serializeVal(data[i][j], h);
      });
      complaints.push(row);
    }
    
    return jsonSuccess({ complaints: complaints });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Admin: Reply and Resolve Complaint
function apiUpdateComplaint(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Complaints");
    if (!sheet) return jsonError("Complaints table not found.");
    
    const row = Number(params.row);
    const status = params.status;
    const reply = params.reply;
    
    const headers = sheet.getDataRange().getValues()[0];
    const col = getColMap(headers);
    
    const statusIdx = col["status"];
    const replyIdx = col["reply"];
    const resolvedTimeIdx = col["resolvedtime"];
    
    if (statusIdx === undefined || replyIdx === undefined) {
      return jsonError("Table schema mismatch.");
    }
    
    const n = nowFormatted();
    
    // Set status & reply
    sheet.getRange(row, statusIdx + 1).setValue(status);
    sheet.getRange(row, replyIdx + 1).setValue(reply);
    
    if ((status === "Resolved" || status === "Closed") && resolvedTimeIdx !== undefined) {
      sheet.getRange(row, resolvedTimeIdx + 1).setValue(n.iso);
    }
    
    logAuditRecord(context.ss, {
      adminUser: params.adminUser,
      module: "Complaints",
      action: "Update",
      field: "Resolution",
      oldValue: "Open",
      newValue: status + " (" + reply.substring(0, 10) + "...)",
      reason: params.reason || "Complaint resolved by admin"
    });
    
    return jsonSuccess({ result: "Resolved" });
  } catch (err) {
    return jsonError(err.message);
  }
}









// ============================================================
// Gallery.gs — Photo Gallery Operations
// ============================================================

// Returns images grouped by category sections
function apiGetGalleryImages(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Gallery");
    if (!sheet) return jsonSuccess({ sections: {}, images: [] });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ sections: {}, images: [] });
    
    const col = getColMap(data[0]);
    const fldC = col["folder"] !== undefined ? col["folder"] : 1;
    const urlC = col["imageurl"] !== undefined ? col["imageurl"] : 3;
    const thbC = col["thumbnailurl"] !== undefined ? col["thumbnailurl"] : 4;
    const nameC = col["imagename"] !== undefined ? col["imagename"] : 2;
    const statusC = col["status"] !== undefined ? col["status"] : 7;
    
    const sections = {
      marriage: [],
      reception: [],
      haldi: [],
      engagement: [],
      public: []
    };
    
    const allImages = [];
    
    for (let i = 1; i < data.length; i++) {
      const statusVal = String(data[i][statusC]).trim().toLowerCase();
      if (statusVal !== "approved") continue;
      
      const folderVal = String(data[i][fldC]).trim().toLowerCase();
      const urlVal = String(data[i][urlC]).trim();
      const thumbVal = String(data[i][thbC]).trim();
      const nameVal = String(data[i][nameC]).trim();
      
      const imgObj = {
        id: String(i + 1),
        url: urlVal,
        thumb: thumbVal || urlVal,
        name: nameVal
      };
      
      if (sections[folderVal] !== undefined) {
        sections[folderVal].push(imgObj);
      } else {
        sections.public.push(imgObj);
      }
      
      allImages.push(imgObj);
    }
    
    return jsonSuccess({
      sections: sections,
      images: allImages
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Allows guests to upload photos to Google Drive (marked Pending)
function apiUploadPhoto(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    
    // Read folder IDs
    const s = {};
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    const folderCategory = String(params.folder || "public").trim().toLowerCase();
    
    // Resolve Drive folder ID key from settings, e.g. PUBLIC_FOLDER_ID
    const folderKey = folderCategory.toUpperCase() + "_FOLDER_ID";
    const folderId = extractFolderID(s[folderKey] || s["PUBLIC_FOLDER_ID"]);
    
    if (!folderId) {
      return jsonError("Drive folder configuration not found for category: " + folderCategory);
    }
    
    const name = params.name || "Anonymous";
    const filedata = params.filedata;
    const filename = params.filename || "upload_" + Date.now();
    const filetype = params.filetype || "image/jpeg";
    
    if (!filedata) return jsonError("No image data provided.");
    
    // Decode Base64 data and upload to Drive
    const cleanBase64 = filedata.split(",")[1] || filedata;
    const bytes = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(bytes, filetype, filename);
    
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const fileUrl = file.getUrl();
    const fileId = file.getId();
    
    // Construct thumbnail using drive webContentLink
    const thumbUrl = "https://lh3.googleusercontent.com/d/" + fileId + "=w400-h400-no";
    
    // Write details to Gallery database
    const gallerySheet = context.ss.getSheetByName("Gallery");
    if (!gallerySheet) return jsonError("Gallery table not found.");
    
    const n = nowFormatted();
    const photoId = "PH" + Utilities.getUuid().substring(0, 8).toUpperCase();
    const defaultStatus = (s["MODERATION_ENABLED"] === "No" || s["MODERATION_ENABLED"] === "false") ? "Approved" : "Pending";
    
    gallerySheet.appendRow([
      photoId,          // PhotoID
      folderCategory,   // Folder
      filename,         // ImageName
      fileUrl,          // ImageURL
      thumbUrl,         // ThumbnailURL
      name,             // UploadedBy
      n.iso,            // UploadedTime
      defaultStatus     // Status
    ]);
    
    return jsonSuccess({
      photoId: photoId,
      status: defaultStatus,
      message: defaultStatus === "Approved" ? "Uploaded and published!" : "Submitted for approval."
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Admin: Retrieve pending photos
function apiGetPendingPhotos(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Gallery");
    if (!sheet) return jsonSuccess({ photos: [] });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ photos: [] });
    
    const col = getColMap(data[0]);
    const idC = col["photoid"] !== undefined ? col["photoid"] : 0;
    const fldC = col["folder"] !== undefined ? col["folder"] : 1;
    const nameC = col["imagename"] !== undefined ? col["imagename"] : 2;
    const urlC = col["imageurl"] !== undefined ? col["imageurl"] : 3;
    const whoC = col["uploadedby"] !== undefined ? col["uploadedby"] : 5;
    const whenC = col["uploadedtime"] !== undefined ? col["uploadedtime"] : 6;
    const statusC = col["status"] !== undefined ? col["status"] : 7;
    
    const photos = [];
    for (let i = 1; i < data.length; i++) {
      const statusVal = String(data[i][statusC]).trim();
      if (statusVal === "Pending") {
        photos.push({
          row: i + 1,
          photoId: data[i][idC],
          folder: data[i][fldC],
          name: data[i][nameC],
          url: data[i][urlC],
          uploadedBy: data[i][whoC],
          uploadedTime: serializeVal(data[i][whenC], 'uploadedtime')
        });
      }
    }
    
    return jsonSuccess({ photos: photos });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Admin: Moderate Photo Status
function apiModeratePhoto(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Gallery");
    if (!sheet) return jsonError("Gallery table not found.");
    
    const row = Number(params.row);
    const approve = String(params.approve).toLowerCase() === "true" || String(params.approve) === "1";
    
    const headers = sheet.getDataRange().getValues()[0];
    const col = getColMap(headers);
    const statusIdx = col["status"];
    
    if (statusIdx === undefined) return jsonError("Status column not found.");
    
    const newStatus = approve ? "Approved" : "Rejected";
    sheet.getRange(row, statusIdx + 1).setValue(newStatus);
    
    logAuditRecord(context.ss, {
      adminUser: params.adminUser,
      module: "Gallery",
      action: approve ? "Approve" : "Reject",
      field: "Status",
      oldValue: "Pending",
      newValue: newStatus,
      reason: params.reason || "Admin moderation"
    });
    
    return jsonSuccess({ result: "Moderated", status: newStatus });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Admin: Delete Photo Record and Drive File
function apiDeletePhoto(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Gallery");
    if (!sheet) return jsonError("Gallery table not found.");
    
    const row = Number(params.row);
    const data = sheet.getDataRange().getValues();
    if (row < 2 || row > data.length) return jsonError("Invalid row index.");
    
    const headers = data[0];
    const col = getColMap(headers);
    
    const idVal = data[row - 1][col["photoid"]];
    const urlVal = data[row - 1][col["imageurl"]];
    
    // Delete file from Drive if we can parse the file ID
    try {
      const fileId = extractFolderID(urlVal);
      if (fileId) {
        DriveApp.getFileById(fileId).setTrashed(true);
      }
    } catch (e) {
      // Non-fatal if drive file doesn't exist or is already deleted
    }
    
    // Delete from spreadsheet
    sheet.deleteRow(row);
    
    logAuditRecord(context.ss, {
      adminUser: params.adminUser,
      module: "Gallery",
      action: "Delete",
      field: "Row",
      oldValue: String(idVal),
      newValue: "Deleted",
      reason: params.reason || "Gallery cleaning"
    });
    
    return jsonSuccess({ result: "Deleted" });
  } catch (err) {
    return jsonError(err.message);
  }
}










// ============================================================
// Payments.gs — Payments & Transaction Operations
// ============================================================

// Initiates a Razorpay Order by contacting the Razorpay API
function apiCreatePaymentOrder(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    
    // Read Razorpay keys from Settings
    const s = {};
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    const keyId = s["RAZORPAY_KEY_ID"];
    const keySecret = s["RAZORPAY_KEY_SECRET"];
    if (!keyId || !keySecret) {
      return jsonError("Razorpay keys are not configured for this event.");
    }
    
    const amount = Number(params.amount);
    if (!amount || amount <= 0) return jsonError("Invalid amount.");
    
    const minAmt = Number(s["MIN_AMOUNT"] || 50);
    const maxAmt = Number(s["MAX_AMOUNT"] || 100000);
    if (amount < minAmt) return jsonError("Amount is below minimum ₹" + minAmt);
    if (amount > maxAmt) return jsonError("Amount exceeds maximum ₹" + maxAmt);
    
    // Create Razorpay order via REST API
    const url = "https://api.razorpay.com/v1/orders";
    const payload = {
      amount: amount * 100, // Razorpay expects paise (cents)
      currency: "INR",
      receipt: "receipt_" + Utilities.getUuid().substring(0, 8)
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Basic " + Utilities.base64Encode(keyId + ":" + keySecret)
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const resText = response.getContentText();
    const resData = JSON.parse(resText);
    
    if (response.getResponseCode() !== 200) {
      return jsonError("Razorpay order creation failed: " + (resData.error && resData.error.description || resText));
    }
    
    return jsonSuccess({
      razorpayOrderId: resData.id,
      amountPaise: resData.amount,
      currency: resData.currency,
      keyId: keyId
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Verifies payment signature and logs transaction details
function apiVerifyPayment(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    
    // Read keys
    const s = {};
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    const keySecret = s["RAZORPAY_KEY_SECRET"];
    if (!keySecret) return jsonError("Payment gateway configuration missing.");
    
    const orderId = params.razorpay_order_id;
    const paymentId = params.razorpay_payment_id;
    const signature = params.razorpay_signature;
    
    if (!orderId || !paymentId || !signature) {
      return jsonError("Missing verification parameters.");
    }
    
    // Verify HMAC-SHA256 signature locally
    const signPayload = orderId + "|" + paymentId;
    const computedSignature = Utilities.computeHmacSha256Signature(signPayload, keySecret);
    const computedSignatureHex = computedSignature.map(b => {
      let hex = (b & 0xff).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
    
    if (computedSignatureHex !== signature) {
      return jsonError("Payment signature verification failed. Potential fraud attempt.");
    }
    
    // Verification succeeded. Insert into payments sheet.
    const paymentsSheet = context.ss.getSheetByName("Payments");
    if (!paymentsSheet) return jsonError("Payments table not found.");
    
    // Fetch details of payment from Razorpay API
    const url = "https://api.razorpay.com/v1/payments/" + paymentId;
    const options = {
      method: "get",
      headers: {
        "Authorization": "Basic " + Utilities.base64Encode(s["RAZORPAY_KEY_ID"] + ":" + keySecret)
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const pDetails = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() !== 200 || pDetails.status !== "captured") {
      return jsonError("Payment verification failed on gateway. Status: " + (pDetails.status || "Unknown"));
    }
    
    const amount = Number(pDetails.amount) / 100; // convert paise to INR
    const name = params.name || pDetails.notes.name || "Anonymous";
    const village = params.village || pDetails.notes.village || "";
    const phone = params.phone || pDetails.contact || "";
    const email = params.email || pDetails.email || "";
    const message = params.message || pDetails.notes.message || "";
    
    const n = nowFormatted();
    const receiptNum = "EP" + n.date.replace(/-/g,"") + "_" + Utilities.getUuid().substring(0, 4).toUpperCase();
    
    paymentsSheet.appendRow([
      receiptNum,           // PaymentID / ReceiptNumber
      orderId,              // RazorpayOrderID
      paymentId,            // RazorpayPaymentID
      name,                 // Name
      village,              // Village
      phone,                // Phone
      email,                // Email
      amount,               // Amount
      message,              // Message
      n.date + " " + n.time,// PaymentDate
      "Paid",               // PaymentStatus
      "Pending",            // SettlementStatus
      "None",               // RefundStatus
      n.iso,                // CreatedTime
      n.iso                 // UpdatedTime
    ]);
    
    // Insert into Villages database
    addVillageInternal(context.ss, village);
    
    // Notify organizer via email
    try {
      if (s["OrganizerEmail"]) {
        MailApp.sendEmail({
          to: String(s["OrganizerEmail"]),
          subject: "💰 Contribution: " + name + " - ₹" + amount,
          body: "Name: " + name + "\nVillage: " + village + "\nPhone: " + phone + "\nAmount: ₹" + amount + "\nReceipt: " + receiptNum + "\nPayment ID: " + paymentId
        });
      }
    } catch (e) {}
    
    return jsonSuccess({
      receiptNumber: receiptNum,
      paymentId: paymentId,
      amount: amount,
      date: n.date,
      time: n.time
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Add/Increment contributor village stats
function addVillageInternal(ss, villageName) {
  if (!villageName) return;
  try {
    const sheet = ss.getSheetByName("Villages");
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const normalizedNew = villageName.trim().toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim().toLowerCase() === normalizedNew) {
        const count = parseInt(data[i][2] || 0) + 1;
        sheet.getRange(i + 1, 3).setValue(count);
        return;
      }
    }
    sheet.appendRow([villageName.trim(), normalizedNew, 1]);
  } catch (e) {}
}

// Returns public metrics (Total Collections, Contributor count)
function apiGetPublicStats(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonSuccess({ total: 0, count: 0, goalAmount: 0 });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ total: 0, count: 0, goalAmount: 0 });
    
    const col = getColMap(data[0]);
    const aC = col["amount"] !== undefined ? col["amount"] : 7;
    const sC = col["paymentstatus"] !== undefined ? col["paymentstatus"] : 10;
    
    let total = 0, count = 0;
    for (let i = 1; i < data.length; i++) {
      const st = String(data[i][sC]).trim().toLowerCase();
      const amt = Number(data[i][aC]) || 0;
      if (st === "paid") {
        total += amt;
        count++;
      }
    }
    
    // Get Goal Amount
    const settingsSheet = context.ss.getSheetByName("Settings");
    let goalAmount = 0;
    if (settingsSheet) {
      settingsSheet.getDataRange().getValues().forEach(r => {
        if (r[0] === "Goal Amount") goalAmount = Number(r[1]) || 0;
      });
    }
    
    return jsonSuccess({
      totalCollected: total,
      donorCount: count,
      goalAmount: goalAmount,
      currency: "INR"
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Returns public successful contributions list
function apiGetPublicPayments(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonSuccess({ donors: [] });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ donors: [] });
    
    const col = getColMap(data[0]);
    const nC = col["name"] !== undefined ? col["name"] : 3;
    const vC = col["village"] !== undefined ? col["village"] : 4;
    const aC = col["amount"] !== undefined ? col["amount"] : 7;
    const sC = col["paymentstatus"] !== undefined ? col["paymentstatus"] : 10;
    const dC = col["paymentdate"] !== undefined ? col["paymentdate"] : 9;
    const mC = col["message"] !== undefined ? col["message"] : 8;
    
    const donors = [];
    for (let i = 1; i < data.length; i++) {
      const st = String(data[i][sC]).trim().toLowerCase();
      if (st === "paid") {
        donors.push({
          name: data[i][nC],
          village: data[i][vC],
          amount: Number(data[i][aC]) || 0,
          paymentDate: serializeVal(data[i][dC], 'paymentdate'),
          message: data[i][mC] || ""
        });
      }
    }
    
    // Return all donors
    return jsonSuccess({ donors: donors });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Lookup payment details by Receipt ID / Phone / Payment ID
function apiCheckStatus(params) {
  try {
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonSuccess({ found: false });
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return jsonSuccess({ found: false });
    
    const col = getColMap(data[0]);
    const C = {
      receipt: col["paymentid"] !== undefined ? col["paymentid"] : 0,
      order:   col["razorpayorderid"] !== undefined ? col["razorpayorderid"] : 1,
      payment: col["razorpaypaymentid"] !== undefined ? col["razorpaypaymentid"] : 2,
      name:    col["name"] !== undefined ? col["name"] : 3,
      village: col["village"] !== undefined ? col["village"] : 4,
      phone:   col["phone"] !== undefined ? col["phone"] : 5,
      amount:  col["amount"] !== undefined ? col["amount"] : 7,
      msg:     col["message"] !== undefined ? col["message"] : 8,
      date:    col["paymentdate"] !== undefined ? col["paymentdate"] : 9,
      status:  col["paymentstatus"] !== undefined ? col["paymentstatus"] : 10,
      settle:  col["settlementstatus"] !== undefined ? col["settlementstatus"] : 11,
      refund:  col["refundstatus"] !== undefined ? col["refundstatus"] : 12
    };
    
    const searchVal = String(params.searchVal || "").trim().toLowerCase();
    if (!searchVal) return jsonSuccess({ found: false });
    
    for (let i = 1; i < data.length; i++) {
      const recVal = String(data[i][C.receipt]).toLowerCase();
      const phoneVal = String(data[i][C.phone]).toLowerCase();
      const payVal = String(data[i][C.payment]).toLowerCase();
      
      const isMatch = recVal === searchVal || phoneVal === searchVal || payVal === searchVal || recVal.slice(-5) === searchVal;
      
      if (isMatch) {
        return jsonSuccess({
          found: true,
          receiptNumber: data[i][C.receipt],
          paymentId: data[i][C.payment],
          name: data[i][C.name],
          village: data[i][C.village],
          phone: data[i][C.phone],
          amount: Number(data[i][C.amount]),
          message: data[i][C.msg],
          date: serializeVal(data[i][C.date], 'paymentdate'),
          status: data[i][C.status],
          settlementStatus: data[i][C.settle],
          refundStatus: data[i][C.refund]
        });
      }
    }
    
    return jsonSuccess({ found: false });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Admin: Gets all payments listing
function apiGetPayments(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonSuccess({ payments: [] });
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const payments = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = { _row: i + 1 };
      headers.forEach((h, j) => {
        if (h) row[String(h).trim()] = serializeVal(data[i][j], h);
      });
      payments.push(row);
    }
    
    return jsonSuccess({ payments: payments });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Admin: Updates/Edits payments record cell values
function apiUpdatePayments(params) {
  try {
    verifyAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Payments");
    if (!sheet) return jsonError("Payments table not found.");
    
    const row = Number(params.row);
    const updates = JSON.parse(params.updates || '{}');
    
    const headers = sheet.getDataRange().getValues()[0];
    const col = getColMap(headers);
    
    Object.keys(updates).forEach(key => {
      const colIdx = col[key.toLowerCase()];
      if (colIdx !== undefined) {
        const oldVal = sheet.getRange(row, colIdx + 1).getValue();
        sheet.getRange(row, colIdx + 1).setValue(updates[key]);
        
        logAuditRecord(context.ss, {
          adminUser: params.adminUser,
          module: "Payments",
          action: "Edit",
          field: key,
          oldValue: String(oldVal),
          newValue: String(updates[key]),
          reason: params.reason || "Dashboard edit"
        });
      }
    });
    
    return jsonSuccess({ result: "Updated" });
  } catch (err) {
    return jsonError(err.message);
  }
}








// ============================================================
// Settings.gs — Settings Operations
// ============================================================

// Reads only the Settings sheet of the resolved event spreadsheet
function apiGetSettings(params) {
  try {
    const meta = resolveEventMetadata(params);
    return jsonSuccess(meta);
  } catch (err) {
    return jsonError(err.message);
  }
}

// Loads settings visibility toggles
function apiGetPublicVisibility(params) {
  try {
    const context = resolveEventContext(params);
    const settingsSheet = context.ss.getSheetByName("Settings");
    const s = {};
    if (settingsSheet) {
      const data = settingsSheet.getDataRange().getValues();
      data.forEach(r => {
        if (r[0]) s[String(r[0]).trim()] = r[1];
      });
    }
    
    const isActive = (key) => String(s[key] || "ACTIVE").toUpperCase().trim() === "ACTIVE" || String(s[key] || "").toLowerCase().trim() === "true" || String(s[key] || "").trim() === "1";
    
    return jsonSuccess({
      showDonorList:          isActive("SHOW_DONOR_LIST"),
      showStatistics:         isActive("SHOW_STATISTICS"),
      showHomepageStats:      isActive("SHOW_HOMEPAGE_STATS"),
      showHomepageDonors:     isActive("SHOW_HOMEPAGE_DONORS"),
      showGallery:            isActive("SHOW_GALLERY"),
      showInviteCard:         isActive("SHOW_INVITE_CARD"),
      showPendingPayments:    isActive("SHOW_PENDING_PAYMENTS"),
      showVerifiedPayments:   isActive("SHOW_VERIFIED_PAYMENTS"),
      showRecentPayments:     isActive("SHOW_RECENT_PAYMENTS"),
      // Gallery sections
      showEngagementGallery:  isActive("SHOW_ENGAGEMENT_GALLERY"),
      showHaldiGallery:       isActive("SHOW_HALDI_GALLERY"),
      showMarriageGallery:    isActive("SHOW_MARRIAGE_GALLERY"),
      allowDownloadAll:       isActive("ALLOW_DOWNLOAD_ALL"),
      allowSectionDownload:   isActive("ALLOW_SECTION_DOWNLOAD"),
      showComplaints:         isActive("SHOW_COMPLAINTS"),
      showVideos:             isActive("SHOW_VIDEOS"),
      showAnalytics:          isActive("SHOW_ANALYTICS")
    });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Updates Settings parameters from the Super Admin Panel
function apiUpdateSettings(params) {
  try {
    verifySuperAdmin(params);
    const context = resolveEventContext(params);
    const sheet = context.ss.getSheetByName("Settings");
    if (!sheet) return jsonError("Settings sheet not found.");
    
    const data = sheet.getDataRange().getValues();
    const updates = JSON.parse(params.updates || '{}');
    
    Object.keys(updates).forEach(key => {
      let found = false;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === key) {
          const oldVal = data[i][1];
          sheet.getRange(i + 1, 2).setValue(updates[key]);
          
          logAuditRecord(context.ss, {
            adminUser: params.adminUser,
            module: "Settings",
            action: "Update",
            field: key,
            oldValue: String(oldVal),
            newValue: String(updates[key]),
            reason: params.reason || ""
          });
          
          found = true;
          break;
        }
      }
      if (!found) {
        sheet.appendRow([key, updates[key]]);
        logAuditRecord(context.ss, {
          adminUser: params.adminUser,
          module: "Settings",
          action: "Create",
          field: key,
          oldValue: "",
          newValue: String(updates[key]),
          reason: params.reason || "Init settings param"
        });
      }
    });
    
    logAuditRecord(context.ss, {
      adminUser: params.adminUser,
      module: "Settings",
      action: "SettingsUpdate",
      field: "Theme/Config",
      oldValue: "",
      newValue: "Bulk",
      reason: "Bulk dashboard configurations"
    });
    
    return jsonSuccess({ result: "Saved" });
  } catch (err) {
    return jsonError(err.message);
  }
}







// ============================================================
// EventResolver.gs — Event Code & Spreadsheet Resolver
// ============================================================

/**
 * Resolves the EventCode from parameters into a unified package containing:
 * - ss: The Spreadsheet instance of the event
 * - code: The sanitized EventCode
 * - metadata: Basic event configurations
 */
function resolveEventContext(params) {
  const eventCode = params.eventCode || params.code;
  if (!eventCode) {
    throw new Error("Missing parameter: eventCode.");
  }
  
  // Resolve spreadsheet ID from Master registry
  const spreadsheetId = resolveSpreadsheetID(eventCode);
  
  // Open the spreadsheet
  const ss = openEventSpreadsheet(spreadsheetId);
  if (!ss) {
    throw new Error("Failed to open event database.");
  }
  
  // Return the resolved spreadsheet and eventCode context
  return {
    ss: ss,
    eventCode: eventCode.toUpperCase().trim()
  };
}

/**
 * Fetches event metadata plus settings sheet contents
 */
function resolveEventMetadata(params) {
  const context = resolveEventContext(params);
  
  // Read event registry to get name/type
  const registrySs = SpreadsheetApp.openById(MASTER_DB_ID);
  const registrySheet = registrySs.getSheetByName("Events");
  const data = registrySheet.getDataRange().getValues();
  const col = getColMap(data[0]);
  
  const codeC = col["eventcode"] !== undefined ? col["eventcode"] : 1;
  const nameC = col["eventname"] !== undefined ? col["eventname"] : 3;
  const typeC = col["eventtype"] !== undefined ? col["eventtype"] : 2;
  const statusC = col["status"] !== undefined ? col["status"] : 8;
  
  let eventName = "EventPay";
  let eventType = "General";
  let status = "Active";
  
  const cleanCode = context.eventCode.toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][codeC]).trim().toLowerCase() === cleanCode) {
      eventName = String(data[i][nameC]).trim();
      eventType = String(data[i][typeC]).trim();
      status = String(data[i][statusC]).trim();
      break;
    }
  }
  
  // Load settings (vertical layout from Settings sheet)
  const settingsSheet = context.ss.getSheetByName("Settings");
  const settingsObj = {};
  if (settingsSheet) {
    const settingsData = settingsSheet.getDataRange().getValues();
    settingsData.forEach(r => {
      if (r[0]) settingsObj[String(r[0]).trim()] = r[1];
    });
  }
  
  return {
    eventCode: context.eventCode,
    eventName: eventName,
    eventType: eventType,
    status: status,
    settings: settingsObj
  };
}




// ============================================================
// MasterDB.gs — Master Database Interface
// ============================================================

// Search events by code or name
function searchEvent(params) {
  try {
    const ss = SpreadsheetApp.openById(MASTER_DB_ID);
    const sheet = ss.getSheetByName("Events");
    if (!sheet) return jsonError("Registry table 'Events' not found.");
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const col = getColMap(headers);
    
    const codeC = col["eventcode"] !== undefined ? col["eventcode"] : 1;
    const nameC = col["eventname"] !== undefined ? col["eventname"] : 3;
    const typeC = col["eventtype"] !== undefined ? col["eventtype"] : 2;
    const statusC = col["status"] !== undefined ? col["status"] : 8;
    
    const searchCode = params.code ? String(params.code).trim().toLowerCase() : null;
    const searchName = params.name ? String(params.name).trim().toLowerCase() : null;
    
    const matches = [];
    
    for (let i = 1; i < data.length; i++) {
      const codeVal = String(data[i][codeC]).trim();
      const nameVal = String(data[i][nameC]).trim();
      const typeVal = String(data[i][typeC]).trim();
      const statusVal = String(data[i][statusC]).trim();
      
      if (statusVal.toLowerCase() !== "active") continue;
      
      let isMatch = false;
      if (searchCode && codeVal.toLowerCase() === searchCode) {
        isMatch = true;
      } else if (searchName && nameVal.toLowerCase().indexOf(searchName) !== -1) {
        isMatch = true;
      }
      
      if (isMatch) {
        matches.push({
          eventCode: codeVal,
          eventName: nameVal,
          eventType: typeVal
        });
      }
    }
    
    return jsonSuccess({ matches: matches });
  } catch (err) {
    return jsonError(err.message);
  }
}

// Retrieve Spreadsheet ID from Master Registry by Event Code
function resolveSpreadsheetID(eventCode) {
  if (!eventCode) throw new Error("EventCode is required.");
  
  const ss = SpreadsheetApp.openById(MASTER_DB_ID);
  const sheet = ss.getSheetByName("Events");
  if (!sheet) throw new Error("Registry table 'Events' not found.");
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const col = getColMap(headers);
  
  const codeC = col["eventcode"] !== undefined ? col["eventcode"] : 1;
  const ssIdC = col["spreadsheetid"] !== undefined ? col["spreadsheetid"] : 4;
  const statusC = col["status"] !== undefined ? col["status"] : 8;
  
  const cleanCode = eventCode.trim().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    const codeVal = String(data[i][codeC]).trim().toLowerCase();
    const statusVal = String(data[i][statusC]).trim().toLowerCase();
    
    if (codeVal === cleanCode) {
      if (statusVal !== "active") {
        throw new Error("This event is inactive.");
      }
      const ssId = String(data[i][ssIdC]).trim();
      if (!ssId) {
        throw new Error("Spreadsheet ID is missing for this event.");
      }
      return ssId;
    }
  }
  
  throw new Error("Event code not found in registry.");
}

// Opens the spreadsheet of the event safely
function openEventSpreadsheet(spreadsheetId) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (err) {
    throw new Error("Could not open event database: " + err.message);
  }
}



// ============================================================
// Core.gs — EventPay Global Configuration & Shared Utilities
// ============================================================

// The Master Database registry spreadsheet ID.
// Can also be set in Script Properties as 'MASTER_DB_SPREADSHEET_ID'


// Standard JSON response wrappers
function jsonSuccess(data) {
  return { success: true, data: data };
}

function jsonError(message) {
  return { success: false, error: message };
}

// Serialize cell values for JSON response compatibility (specifically Dates)
function serializeVal(val, key) {
  if (val instanceof Date) {
    const tz = Session.getScriptTimeZone();
    const k = String(key || '').toLowerCase().trim();
    if (val.getFullYear() <= 1900) {
      return Utilities.formatDate(val, tz, "hh:mm a");
    }
    if (k === 'date' || k === 'paymentdate' || k === 'createddate' || k === 'updateddate') {
      return Utilities.formatDate(val, tz, "dd-MMM-yyyy");
    }
    if (k === 'time') {
      return Utilities.formatDate(val, tz, "hh:mm a");
    }
    return Utilities.formatDate(val, tz, "dd-MMM-yyyy hh:mm a");
  }
  return val;
}

// Create a mapping of lowercase trimmed header names to column index
function getColMap(headers) {
  const m = {};
  headers.forEach((h, i) => {
    if (h) m[String(h).trim().toLowerCase()] = i;
  });
  return m;
}

// Extracts Google Drive folder ID from URL or returns ID directly
function extractFolderID(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const f = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (f) return f[1];
  return s;
}

// Levenshtein distance algorithm for UTR fuzzy similarity checks
function levenshtein(a, b) {
  const m = a.length, n = b.length, dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) dp[i][j] = 0;
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Returns current timestamp formatted in multiple variations
function nowFormatted() {
  const tz = Session.getScriptTimeZone(), now = new Date();
  return {
    date: Utilities.formatDate(now, tz, "dd-MMM-yyyy"),
    time: Utilities.formatDate(now, tz, "hh:mm a"),
    full: Utilities.formatDate(now, tz, "dd-MMM-yyyy hh:mm:ss"),
    iso: now.toISOString()
  };
}


