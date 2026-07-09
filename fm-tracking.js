/* ===========================================================================
   fm-tracking.js — Forward Motion Freight conversion tracking (GA4 + Google Ads)
   ---------------------------------------------------------------------------
   ONE place to turn analytics on. Loaded on the funnel pages. Until you paste
   your real IDs below it stays completely inert — no external requests, and it
   can never break the signup forms (every call is wrapped in try/catch and the
   lead-source value only ever *replaces a string*, never adds a field).

   ► TO GO LIVE: create free Google Analytics 4 + Google Ads accounts (Mark's
     guide walks you through it), then paste the four values below and redeploy.
   =========================================================================== */
(function () {
  'use strict';

  // =================== PASTE YOUR IDs HERE ===================
  var CONFIG = {
    GA4_ID: 'G-XXXXXXXXXX',          // Google Analytics 4 Measurement ID (Admin → Data Streams → your stream)
    ADS_ID: 'AW-XXXXXXXXXX',         // Google Ads conversion ID (Goals → Conversions → Tag setup)
    // The label is the part after the slash in "AW-XXXXXXXXXX/AbCdEfg" — one per conversion action:
    CONV_DISPATCHER_LEAD: '',        // PRIMARY conversion: someone requests dispatcher access (becomes revenue)
    CONV_COURSE_LEAD: ''             // MICRO conversion: someone starts the free crash course
  };
  // ===========================================================

  var placeholder = function (v) { return !v || v.indexOf('X') !== -1; };
  var hasGA4 = !placeholder(CONFIG.GA4_ID) && CONFIG.GA4_ID.indexOf('G-') === 0;
  var hasAds = !placeholder(CONFIG.ADS_ID) && CONFIG.ADS_ID.indexOf('AW-') === 0;

  // ---- gtag bootstrap (only loads Google's script once a real ID is set) ----
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  try {
    if (hasGA4 || hasAds) {
      var primaryId = hasGA4 ? CONFIG.GA4_ID : CONFIG.ADS_ID;
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + primaryId;
      document.head.appendChild(s);
      window.gtag('js', new Date());
      if (hasGA4) window.gtag('config', CONFIG.GA4_ID);
      if (hasAds) window.gtag('config', CONFIG.ADS_ID);
    }
  } catch (e) { /* never let tracking break the page */ }

  // ---- first-touch attribution (persists the ad click across pages) ----
  // The UTM params ride on the ad's landing URL; by the time someone reaches the
  // request-access form they're gone, so we stash them on first visit.
  var STORE_KEY = 'fm_attribution';
  function parseQuery() {
    var q = {}, str = (window.location.search || '').replace(/^\?/, '');
    if (!str) return q;
    str.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) { try { q[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } catch (e) {} }
    });
    return q;
  }
  function inferSource() {
    var r = document.referrer || '';
    if (!r) return 'direct';
    if (/[./]google\./.test(r)) return 'google-organic';
    if (/tiktok\./.test(r)) return 'tiktok';
    if (/facebook\.|instagram\.|fb\./.test(r)) return 'meta';
    try { return new URL(r).hostname.replace(/^www\./, ''); } catch (e) { return 'referral'; }
  }
  function capture() {
    var existing = null;
    try { existing = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
    var q = parseQuery();
    var hasUtm = !!(q.utm_source || q.utm_medium || q.utm_campaign || q.gclid);
    if (existing && !hasUtm) return existing;               // keep first-touch unless a fresh click arrives
    var attr = {
      source: q.utm_source || (hasUtm ? 'paid' : inferSource()),
      medium: q.utm_medium || (q.gclid ? 'cpc' : ''),
      campaign: q.utm_campaign || '',
      term: q.utm_term || '',
      content: q.utm_content || '',
      gclid: q.gclid || '',
      referrer: document.referrer || '',
      firstSeen: (existing && existing.firstSeen) || new Date().toISOString()
    };
    // Compact, human-readable label for the lead list: "google / cpc / dispatcher-search"
    attr.label = [attr.source, attr.medium, attr.campaign].filter(Boolean).join(' / ') || attr.source;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(attr)); } catch (e) {}
    return attr;
  }
  var ATTR = capture();

  // Returns the stored attribution; `.label` is the compact string for `source`.
  window.fmAttribution = function () { return ATTR; };
  window.fmSource = function (fallback) { return (ATTR && ATTR.label) || fallback || 'direct'; };

  // ---- conversion firing (safe no-op until Google IDs are set) ----
  window.fmTrack = function (type) {
    try {
      if (type === 'dispatcher_lead') {
        if (hasGA4) window.gtag('event', 'generate_lead', { lead_type: 'dispatcher_access', channel: ATTR.source });
        if (hasAds && CONFIG.CONV_DISPATCHER_LEAD) window.gtag('event', 'conversion', { send_to: CONFIG.ADS_ID + '/' + CONFIG.CONV_DISPATCHER_LEAD });
      } else if (type === 'course_lead') {
        if (hasGA4) window.gtag('event', 'sign_up', { method: 'crash_course', channel: ATTR.source });
        if (hasAds && CONFIG.CONV_COURSE_LEAD) window.gtag('event', 'conversion', { send_to: CONFIG.ADS_ID + '/' + CONFIG.CONV_COURSE_LEAD });
      }
    } catch (e) { /* tracking must never break a form submit */ }
  };
})();
