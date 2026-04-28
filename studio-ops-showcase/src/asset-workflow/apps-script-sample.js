/**
 * apps-script-sample.js
 * -----------------------------------------------------------------------------
 * Illustrative excerpt from a Google Apps Script project that orchestrates a
 * studio production workflow. This is a sanitized public version: real
 * endpoints, tokens, sheet IDs, and product fields have been replaced with
 * placeholders. Logic and structure are preserved.
 *
 * The full production system has additional modules for:
 *   - Webhook handlers (HTTP triggers)
 *   - Time-based pulls from the ERP
 *   - Slack notifications on exception rows
 *   - A dispatch layer that routes events to category-specific handlers
 *
 * This file shows three representative pieces:
 *   1. Column-by-name sheet reading (defensive against column reorders)
 *   2. Binary image upload to an ERP that expects hex-escape encoded payloads
 *   3. Deduplication scoring using sharpness + exposure heuristics
 *
 * Stack: Google Apps Script V8 runtime.
 * -----------------------------------------------------------------------------
 */

// =====================================================================
// Configuration — placeholders
// =====================================================================

const CONFIG = {
  ERP_BASE_URL: 'https://erp.example.com/api/v1',
  ERP_TOKEN: 'YOUR_API_TOKEN_HERE',
  WORKING_SHEET_ID: 'YOUR_SHEET_ID_HERE',
  WORKING_SHEET_TAB: 'shoot_list',
  STATUS_SHEET_TAB: 'status',
  CLOUD_STORE_ROOT: '/path/to/working/folder/',
  DEDUP_SCORE_THRESHOLD: 0.05,  // tuned against ~100 manually-judged pairs
};


// =====================================================================
// 1. Column-by-name sheet reading
// =====================================================================
// The ERP team's CSV export occasionally adds or reorders columns. Reading
// by column header rather than by index removes an entire class of failures
// at the cost of one extra pass to build a header map.

/**
 * Reads a sheet into an array of objects keyed by column header.
 * @param {string} sheetId
 * @param {string} tabName
 * @return {Array<Object>}
 */
function readSheetByHeader(sheetId, tabName) {
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(tabName);
  if (!sheet) throw new Error(`Tab not found: ${tabName}`);

  const range = sheet.getDataRange().getValues();
  if (range.length < 2) return [];

  const headers = range[0].map(h => String(h).trim());
  const rows = range.slice(1);

  return rows.map((row, rowIndex) => {
    const obj = { _rowIndex: rowIndex + 2 };  // 1-indexed, +1 for header
    headers.forEach((header, colIndex) => {
      obj[header] = row[colIndex];
    });
    return obj;
  });
}

/**
 * Writes a single field on a single row identified by ERP product ID.
 * @param {string} productId
 * @param {string} field   header name
 * @param {*} value
 */
function writeFieldByProductId(productId, field, value) {
  const sheet = SpreadsheetApp.openById(CONFIG.WORKING_SHEET_ID)
    .getSheetByName(CONFIG.WORKING_SHEET_TAB);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idCol = headers.indexOf('product_id');
  const targetCol = headers.indexOf(field);
  if (idCol === -1 || targetCol === -1) {
    throw new Error(`Missing required column: product_id or ${field}`);
  }

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === productId) {
      sheet.getRange(i + 1, targetCol + 1).setValue(value);
      return;
    }
  }
  throw new Error(`Product ID not found: ${productId}`);
}


// =====================================================================
// 2. Binary upload to an ERP with non-standard encoding
// =====================================================================
// The ERP's image-receive endpoint expects image bytes pre-encoded as a
// hex-escape string inside a JSON field rather than as a binary multipart
// attachment. Standard HTTP client libraries do not produce this format.
// This function reproduces it.
//
// See docs/case-studies.md §2 for the diagnostic story.

/**
 * Encodes a byte array as a hex-escape string ("\\x4A\\x50\\x47...").
 * @param {Uint8Array|number[]} bytes
 * @return {string}
 */
function encodeBinaryForErp(bytes) {
  const out = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    out[i] = '\\x' + (b < 16 ? '0' : '') + b.toString(16);
  }
  return out.join('');
}

/**
 * Uploads an image blob to the ERP's product-image endpoint.
 * Includes a deduplication key so retries are idempotent.
 * @param {string} productId
 * @param {Blob} imageBlob
 * @param {string} dedupKey   stable hash of (productId + content)
 * @return {Object} ERP response
 */
function uploadImageToErp(productId, imageBlob, dedupKey) {
  const bytes = imageBlob.getBytes();
  const payload = {
    product_id: productId,
    dedup_key: dedupKey,
    image_data: encodeBinaryForErp(bytes),
    mime_type: imageBlob.getContentType(),
  };

  const response = UrlFetchApp.fetch(
    `${CONFIG.ERP_BASE_URL}/products/${productId}/images`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': `Bearer ${CONFIG.ERP_TOKEN}` },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }
  );

  const code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    return JSON.parse(response.getContentText());
  }
  if (code === 409) {
    // Duplicate — the ERP saw this dedup_key before. Treat as success.
    return { status: 'duplicate_ignored' };
  }
  throw new Error(`ERP upload failed: ${code} ${response.getContentText()}`);
}


// =====================================================================
// 3. Deduplication scoring
// =====================================================================
// Real sharpness/exposure measurement happens in the studio Mac's folder
// watcher (Python + OpenCV). This function consumes those scores and decides
// whether a new take replaces the existing primary for a SKU.
//
// See docs/case-studies.md §3 for the threshold-tuning rationale.

/**
 * Composite quality score from sharpness and exposure metrics.
 * Both inputs are normalized to [0, 1] upstream.
 * @param {number} sharpness
 * @param {number} exposureNeutrality
 * @return {number} composite score in [0, 1]
 */
function compositeScore(sharpness, exposureNeutrality) {
  // Weights tuned empirically. Sharpness matters more for product photos
  // because exposure can be corrected in post; sharpness cannot.
  return 0.65 * sharpness + 0.35 * exposureNeutrality;
}

/**
 * Decides whether a new take should replace the existing primary.
 * @param {Object} existing   { score: number, ... }
 * @param {Object} candidate  { score: number, ... }
 * @return {string}  'replace' | 'keep_as_secondary' | 'discard'
 */
function dedupDecision(existing, candidate) {
  if (!existing) return 'replace';

  const gap = candidate.score - existing.score;
  if (gap > CONFIG.DEDUP_SCORE_THRESHOLD) return 'replace';
  if (gap > -CONFIG.DEDUP_SCORE_THRESHOLD) return 'keep_as_secondary';
  return 'discard';
}


// =====================================================================
// Pseudocode: the orchestration loop (omitted in full)
// =====================================================================
//
// function processIngestionEvent(event) {
//   const row = readSheetByHeader(...).find(r => r.product_id === event.productId);
//   if (!row) { logException(event); return; }
//
//   const candidate = compositeScore(event.sharpness, event.exposure);
//   const existing  = getCurrentPrimary(event.productId);
//   const decision  = dedupDecision(existing, { score: candidate });
//
//   switch (decision) {
//     case 'replace':
//       writeFieldByProductId(event.productId, 'primary_file', event.fileName);
//       writeFieldByProductId(event.productId, 'primary_score', candidate);
//       break;
//     case 'keep_as_secondary':
//       appendSecondary(event.productId, event.fileName, candidate);
//       break;
//     case 'discard':
//       logDiscarded(event.productId, event.fileName, candidate, existing.score);
//       break;
//   }
// }
//
// On a row reaching "ready for upload" status, a separate trigger calls
// uploadImageToErp() with a dedupKey computed as SHA-256 of (productId + bytes).
//
// =====================================================================
