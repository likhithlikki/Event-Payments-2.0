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
  API_URL: 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE',

  APP_NAME: 'EventPay',

  // The ONLY thing ever kept in browser storage is the event code —
  // never a Spreadsheet ID, never Settings data. sessionStorage (not
  // localStorage) so it clears when the tab closes.
  STORAGE_KEY: 'eventpay_event_code'
};
