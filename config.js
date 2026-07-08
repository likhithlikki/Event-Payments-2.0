/**
 * config.js
 * ------------------------------------------------------------------
 * One responsibility: app-wide constants. Every other JS file reads
 * from CONFIG — nothing else hardcodes the API URL or storage keys.
 * ------------------------------------------------------------------
 */

const CONFIG = {
  // Paste your deployed Apps Script Web App URL here.
  // Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone
  API_URL: 'https://script.google.com/macros/s/AKfycbziup2hPqlG3tvQZPnkoaTGxl58f5T5811W6SrppaCFrO_dFJGYHbFZ_Qc3OvEtdEvI/exec',

  APP_NAME: 'EventPay',

  // Suggested contribution amounts (INR), shown as quick-pick chips.
  QUICK_AMOUNTS: [101, 251, 501, 1001, 2001, 5001],

  // The ONLY thing ever kept in browser storage is the event code —
  // never a Spreadsheet ID, never Settings data. sessionStorage (not
  // localStorage) so it clears when the tab closes.
  STORAGE_KEY: 'eventpay_event_code'
};
