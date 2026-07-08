import React, { useState, useEffect, useRef } from 'react';
import {
  Map, FileText, Wallet, HeartPulse, Dog, LayoutDashboard, Bell, Settings,
  Upload, CheckCircle2, Navigation, Activity, ShieldCheck, CreditCard, Building,
  MapPin, User, Calendar, Wrench, Plus, GraduationCap, BookOpen, Clock, Search, Moon,
  Gamepad2, Trophy, Pause, Play, RotateCcw, Fuel, Target, Flame, Share2, Delete,
  NotebookPen, ChevronDown, Coffee, BedDouble, Radio, X, ChevronLeft, ChevronRight,
  Award, StickyNote, Users, Eraser, Grid3x3, Trash2, AlertTriangle
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, getDocs, collection, setDoc, addDoc,
  query, where, serverTimestamp, updateDoc, deleteDoc, onSnapshot, deleteField
} from 'firebase/firestore';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
  sendPasswordResetEmail, updateProfile
} from 'firebase/auth';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyA-nWxAYjSzGRprXZv2HSbfRr2yow83f18",
  authDomain: "forward-motion-freight.firebaseapp.com",
  projectId: "forward-motion-freight",
  storageBucket: "forward-motion-freight.firebasestorage.app",
  messagingSenderId: "131232028664",
  appId: "1:131232028664:web:18131f2ebf4359ecafe80d",
  measurementId: "G-VCQDBFZNQ8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functionsClient = getFunctions(app);
const googleProvider = new GoogleAuthProvider();

// Per-ACCOUNT localStorage namespacing for game/personal state (Break Room
// scores + progress, Coach's Corner hide, Haul Buddy, the dashboard-peek
// stamp). Suffixes the key with the signed-in uid so two accounts sharing
// one browser never see each other's data. MUST be called at read/write
// time — never captured at module load — because the uid changes on
// logout/login within a session. Display prefs (fm_theme, fm_guided,
// fm_mycorner_collapsed, …) and shared caches (fm_market_cache) are
// deliberately global and do NOT go through this helper.
const uidKey = (base) => base + '_' + ((auth.currentUser && auth.currentUser.uid) || 'anon');

// ============================================================================
// ===== NIGHT HAUL THEME LAYER ===============================================
// Two full skins — "Night Haul" (warm dark + gold, the new look) and
// "Classic" (the original slate/amber) — expressed as CSS custom properties.
// tailwind.config.js maps the slate/amber/emerald/red/blue/warn scales onto
// these variables as `rgb(var(--tw-…) / <alpha-value>)`, so flipping
// `data-theme` on <html> reskins every existing utility class instantly,
// opacity modifiers included. Injected at module load (below) so the login
// screen is themed too, and so one paste of this file ships the whole skin.
//
// Structure follows the three-layer token model:
//   1. Primitives — raw RGB channel triplets consumed by Tailwind.
//   2. Semantic   — fonts / radii / shadows aliases (--fm-*).
//   3. Component  — the .font-data pairing + the theme crossfade helper.
// ============================================================================
const FM_THEME_CSS = `
/* === NIGHT HAUL (default — also the fallback if data-theme is missing) === */
:root, :root[data-theme="nighthaul"] {
  /* 1. Primitives — surfaces & warm ink (slate remap) */
  --tw-slate-50: 250 247 240;
  --tw-slate-100: 239 233 220;
  --tw-slate-200: 222 213 194;
  --tw-slate-300: 200 190 169;
  --tw-slate-400: 169 159 141;  /* ink-2 #A99F8D */
  --tw-slate-500: 111 103 87;   /* ink-3 #6F6757 */
  --tw-slate-600: 76 69 54;
  --tw-slate-700: 54 47 32;     /* warm hairline (strong) */
  --tw-slate-800: 30 25 18;     /* s2 raised #1E1912 */
  --tw-slate-900: 20 17 12;     /* s1 card #14110C */
  --tw-slate-950: 12 10 7;      /* s0 page #0C0A07 */
  --tw-white: 243 238 227;      /* ink-1 #F3EEE3 */
  /* Primitives — brand gold (amber remap) */
  --tw-amber-50: 255 248 232;
  --tw-amber-100: 255 239 200;
  --tw-amber-200: 255 227 160;
  --tw-amber-300: 255 216 126;
  --tw-amber-400: 255 202 95;   /* gold-bright #FFCA5F */
  --tw-amber-500: 255 178 36;   /* gold #FFB224 */
  --tw-amber-600: 226 150 9;
  --tw-amber-700: 180 118 5;
  --tw-amber-800: 138 90 8;
  --tw-amber-900: 107 70 12;
  --tw-amber-950: 64 41 5;
  /* Primitives — status: ok (emerald remap, #34D590 at 500) */
  --tw-emerald-50: 235 251 243;
  --tw-emerald-100: 210 246 228;
  --tw-emerald-200: 169 237 203;
  --tw-emerald-300: 123 227 176;
  --tw-emerald-400: 87 220 160;
  --tw-emerald-500: 52 213 144;
  --tw-emerald-600: 36 174 116;
  --tw-emerald-700: 29 138 93;
  --tw-emerald-800: 26 109 75;
  --tw-emerald-900: 22 89 63;
  --tw-emerald-950: 10 50 36;
  /* Primitives — status: bad (red remap, #F0564A at 500) */
  --tw-red-50: 254 241 240;
  --tw-red-100: 253 225 223;
  --tw-red-200: 250 197 193;
  --tw-red-300: 247 161 154;
  --tw-red-400: 244 124 114;
  --tw-red-500: 240 86 74;
  --tw-red-600: 214 58 46;
  --tw-red-700: 176 44 34;
  --tw-red-800: 143 39 31;
  --tw-red-900: 118 37 31;
  --tw-red-950: 64 15 11;
  /* Primitives — status: info (blue remap, #5AA2FF at 500) */
  --tw-blue-50: 239 246 255;
  --tw-blue-100: 222 235 255;
  --tw-blue-200: 194 219 255;
  --tw-blue-300: 156 197 255;
  --tw-blue-400: 122 179 255;
  --tw-blue-500: 90 162 255;
  --tw-blue-600: 59 130 230;
  --tw-blue-700: 46 103 188;
  --tw-blue-800: 41 84 147;
  --tw-blue-900: 38 72 117;
  --tw-blue-950: 26 46 74;
  /* Primitives — status: warn = coral (#FF7A59), NEVER the brand gold */
  --tw-warn-100: 255 227 218;
  --tw-warn-200: 255 199 184;
  --tw-warn-300: 255 172 148;
  --tw-warn-400: 255 147 118;
  --tw-warn-500: 255 122 89;
  --tw-warn-600: 224 90 56;
  /* Primitives — named depth system + page gradient deep end */
  --tw-s0: 12 10 7;
  --tw-s1: 20 17 12;
  --tw-s2: 30 25 18;
  --tw-s3: 42 35 24;
  --tw-hairline: 42 35 24;
  --tw-pagedeep: 22 18 11;
  /* 2. Semantic — type, radii, elevation */
  --fm-font-sans: 'Inter Tight', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --fm-font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  --fm-font-data: var(--fm-font-mono);
  --fm-r-sm: 4px;
  --fm-r: 6px;
  --fm-r-md: 8px;
  --fm-r-lg: 10px;
  --fm-r-xl: 14px;
  --fm-r-2xl: 18px;
  /* Elevation carries a faint warm-gold ambient glow (Phase 1b) — static
     box-shadow baked into the token, so every shadow-e1 Card glows softly
     on the dark ground at zero runtime cost. Classic stays 0 0 #0000. */
  --fm-shadow-1: inset 0 1px 0 rgb(255 255 255 / 0.03), 0 1px 2px rgb(0 0 0 / 0.5), 0 0 24px -6px rgb(255 178 36 / 0.10);
  --fm-shadow-2: inset 0 1px 0 rgb(255 255 255 / 0.04), 0 10px 30px rgb(0 0 0 / 0.5), 0 0 36px -8px rgb(255 178 36 / 0.14);
}
/* === CLASSIC (the original look — stock Tailwind slate/amber values) === */
:root[data-theme="classic"] {
  --tw-slate-50: 248 250 252;
  --tw-slate-100: 241 245 249;
  --tw-slate-200: 226 232 240;
  --tw-slate-300: 203 213 225;
  --tw-slate-400: 148 163 184;
  --tw-slate-500: 100 116 139;
  --tw-slate-600: 71 85 105;
  --tw-slate-700: 51 65 85;
  --tw-slate-800: 30 41 59;
  --tw-slate-900: 15 23 42;
  --tw-slate-950: 2 6 23;
  --tw-white: 255 255 255;
  --tw-amber-50: 255 251 235;
  --tw-amber-100: 254 243 199;
  --tw-amber-200: 253 230 138;
  --tw-amber-300: 252 211 77;
  --tw-amber-400: 251 191 36;
  --tw-amber-500: 245 158 11;
  --tw-amber-600: 217 119 6;
  --tw-amber-700: 180 83 9;
  --tw-amber-800: 146 64 14;
  --tw-amber-900: 120 53 15;
  --tw-amber-950: 69 26 3;
  --tw-emerald-50: 236 253 245;
  --tw-emerald-100: 209 250 229;
  --tw-emerald-200: 167 243 208;
  --tw-emerald-300: 110 231 183;
  --tw-emerald-400: 52 211 153;
  --tw-emerald-500: 16 185 129;
  --tw-emerald-600: 5 150 105;
  --tw-emerald-700: 4 120 87;
  --tw-emerald-800: 6 95 70;
  --tw-emerald-900: 6 78 59;
  --tw-emerald-950: 2 44 34;
  --tw-red-50: 254 242 242;
  --tw-red-100: 254 226 226;
  --tw-red-200: 254 202 202;
  --tw-red-300: 252 165 165;
  --tw-red-400: 248 113 113;
  --tw-red-500: 239 68 68;
  --tw-red-600: 220 38 38;
  --tw-red-700: 185 28 28;
  --tw-red-800: 153 27 27;
  --tw-red-900: 127 29 29;
  --tw-red-950: 69 10 10;
  --tw-blue-50: 239 246 255;
  --tw-blue-100: 219 234 254;
  --tw-blue-200: 191 219 254;
  --tw-blue-300: 147 197 253;
  --tw-blue-400: 96 165 250;
  --tw-blue-500: 59 130 246;
  --tw-blue-600: 37 99 235;
  --tw-blue-700: 29 78 216;
  --tw-blue-800: 30 64 175;
  --tw-blue-900: 30 58 138;
  --tw-blue-950: 23 37 84;
  /* Classic warnings were amber — keep them amber so "off" = today's look. */
  --tw-warn-100: 254 243 199;
  --tw-warn-200: 253 230 138;
  --tw-warn-300: 252 211 77;
  --tw-warn-400: 251 191 36;
  --tw-warn-500: 245 158 11;
  --tw-warn-600: 217 119 6;
  --tw-s0: 2 6 23;
  --tw-s1: 15 23 42;
  --tw-s2: 30 41 59;
  --tw-s3: 51 65 85;
  --tw-hairline: 30 41 59;
  --tw-pagedeep: 11 18 32;  /* the old hardcoded #0b1220 */
  --fm-font-sans: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  --fm-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  --fm-font-data: var(--fm-font-sans);
  --fm-r-sm: 0.125rem;
  --fm-r: 0.25rem;
  --fm-r-md: 0.375rem;
  --fm-r-lg: 0.5rem;
  --fm-r-xl: 0.75rem;
  --fm-r-2xl: 1rem;
  --fm-shadow-1: 0 0 rgb(0 0 0 / 0);
  --fm-shadow-2: 0 0 rgb(0 0 0 / 0);
}
/* 3. Component — ~300ms crossfade while the theme flips (class added by
   applyTheme, removed right after). Reduced-motion users flip instantly. */
:root.fm-theme-x, :root.fm-theme-x *, :root.fm-theme-x *::before, :root.fm-theme-x *::after {
  transition: background-color .3s ease, border-color .3s ease, color .3s ease, fill .3s ease, stroke .3s ease, box-shadow .3s ease !important;
}
@media (prefers-reduced-motion: reduce) {
  :root.fm-theme-x, :root.fm-theme-x *, :root.fm-theme-x *::before, :root.fm-theme-x *::after { transition: none !important; }
}
/* === NIGHT HAUL GLOW LAYER (Phase 1b) =====================================
   "Alive at night" — every rule is scoped to :root[data-theme="nighthaul"]
   so Classic is byte-for-byte unaffected. Three layers, in order of volume:
   1. Ambient: gold ambience rides the elevation tokens above (static).
   2. Breathing: a slow opacity-only pulse on pseudo-elements that carry a
      static box-shadow — the shadow rasterizes once, the compositor fades
      the layer. Applied to exactly two signature elements (primary CTA +
      active nav item), so only a few nodes per screen ever animate.
   3. Hero shimmer: a masked 1px gradient ring on ONE hero card per screen;
      the sweep travels ~3s then rests ~9s, so most frames paint nothing.
   Reduced motion: animations stop, the static glow stays. */
@keyframes fmBreathe { 0%, 100% { opacity: .45; } 50% { opacity: 1; } }
@keyframes fmHeroSweep {
  0%   { background-position: 250% 0, 0 0; }
  26%  { background-position: -150% 0, 0 0; }
  100% { background-position: -150% 0, 0 0; }
}
:root[data-theme="nighthaul"] .fm-glow-cta,
:root[data-theme="nighthaul"] .fm-glow-nav,
:root[data-theme="nighthaul"] .fm-glow-hero { position: relative; }
:root[data-theme="nighthaul"] .fm-glow-cta::after,
:root[data-theme="nighthaul"] .fm-glow-nav::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  pointer-events: none;
  animation: fmBreathe 5.2s ease-in-out infinite;
}
:root[data-theme="nighthaul"] .fm-glow-cta::after {
  box-shadow: 0 0 16px -2px rgb(255 178 36 / .40), 0 0 3px rgb(255 202 95 / .30);
}
:root[data-theme="nighthaul"] .fm-glow-cta:disabled::after { display: none; }
:root[data-theme="nighthaul"] .fm-glow-nav::after {
  box-shadow: inset 2px 0 10px -4px rgb(255 202 95 / .55), 0 0 12px -2px rgb(255 178 36 / .22);
}
/* Hero ring: a faint gilded 1px border (static) + a slow traveling shimmer.
   The two-gradient mask keeps paint confined to the 1px ring. */
:root[data-theme="nighthaul"] .fm-glow-hero::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  padding: 1px; pointer-events: none;
  background:
    linear-gradient(100deg, transparent 30%, rgb(255 202 95 / .75) 47%, rgb(255 227 160 / .9) 50%, rgb(255 202 95 / .75) 53%, transparent 70%) no-repeat,
    linear-gradient(180deg, rgb(255 178 36 / .30), rgb(255 178 36 / .07));
  background-size: 300% 100%, 100% 100%;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  animation: fmHeroSweep 12s ease-in-out infinite;
}
/* Gold focus treatment (NH only) — a halo on focused fields via filter (no
   box-shadow conflicts with Tailwind ring utilities) and a visible gold
   outline for keyboard users. */
:root[data-theme="nighthaul"] :is(input, select, textarea):focus {
  filter: drop-shadow(0 0 6px rgb(255 178 36 / .28));
}
:root[data-theme="nighthaul"] :is(button, a, [role="button"]):focus-visible {
  outline: 2px solid rgb(255 178 36 / .60);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  :root[data-theme="nighthaul"] .fm-glow-cta::after,
  :root[data-theme="nighthaul"] .fm-glow-nav::after { animation: none; opacity: .7; }
  :root[data-theme="nighthaul"] .fm-glow-hero::before { animation: none; background-position: -150% 0, 0 0; }
}`;

const THEME_KEY = 'fm_theme';
const getStoredTheme = () => {
  try { return localStorage.getItem(THEME_KEY) === 'classic' ? 'classic' : 'nighthaul'; }
  catch (_) { return 'nighthaul'; }
};

// Flip the whole portal skin: stamp <html data-theme>, persist per device,
// sync the mobile status-bar color, and tell every mounted useTheme() hook.
function applyTheme(theme, animate = true) {
  try {
    const root = document.documentElement;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    if (animate && !reduce) {
      root.classList.add('fm-theme-x');
      clearTimeout(applyTheme._t);
      applyTheme._t = setTimeout(() => root.classList.remove('fm-theme-x'), 350);
    }
    root.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'classic' ? '#020617' : '#0C0A07');
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    window.dispatchEvent(new CustomEvent('fm-themechange', { detail: theme }));
  } catch (_) { /* non-browser env */ }
}

// Boot: inject the token stylesheet + stamp the saved theme once, at module
// load — before anything renders, so even the login screen is skinned.
(function bootTheme() {
  try {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('fm-theme-tokens')) {
      const el = document.createElement('style');
      el.id = 'fm-theme-tokens';
      el.textContent = FM_THEME_CSS;
      document.head.appendChild(el);
    }
    applyTheme(getStoredTheme(), false);
  } catch (_) { /* ignore */ }
})();

// Live theme state for any component; instances stay in sync via the
// fm-themechange event, so the header control and Settings row never drift.
function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme);
  useEffect(() => {
    const onChange = (e) => setThemeState((e && e.detail) || getStoredTheme());
    window.addEventListener('fm-themechange', onChange);
    return () => window.removeEventListener('fm-themechange', onChange);
  }, []);
  return [theme, applyTheme];
}

// Theme switch, two presentations:
//  - compact: icon-only button for the header (next to search/bell)
//  - default: labeled Night Haul / Classic segmented control for Settings
function ThemeToggle({ compact = false }) {
  const [theme, setTheme] = useTheme();
  const night = theme !== 'classic';
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTheme(night ? 'classic' : 'nighthaul')}
        className={`transition-colors ${night ? 'text-amber-400 hover:text-amber-300' : 'hover:text-white'}`}
        title={night ? 'Theme: Night Haul — switch to Classic' : 'Theme: Classic — switch to Night Haul'}
        aria-label={night ? 'Switch to Classic theme' : 'Switch to Night Haul theme'}
      >
        <Moon size={20} />
      </button>
    );
  }
  return (
    <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden shrink-0" role="group" aria-label="Portal theme">
      {[['nighthaul', 'Night Haul'], ['classic', 'Classic']].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTheme(key)}
          aria-pressed={theme === key}
          className={`text-xs font-semibold px-3 py-1.5 transition-colors ${theme === key ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// --- Google Maps (client-side distance lookup) ---
const GOOGLE_MAPS_API_KEY = 'AIzaSyBwhjnErrb0u91XdcPvavYknLNQBVSCzJI';

// Carrier-packet submissions now land in the `carrier_packets` Firestore
// collection via the public CarrierIntakeView (?intake=<orgId>) — no Apps Script.

let mapsLoaderPromise = null;
function loadGoogleMaps() {
  if (typeof window !== 'undefined' && window.google && window.google.maps) return Promise.resolve();
  if (mapsLoaderPromise) return mapsLoaderPromise;
  mapsLoaderPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(s);
  });
  return mapsLoaderPromise;
}

async function getDrivingMiles(originZip, destZip) {
  await loadGoogleMaps();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, arg) => { if (!done) { done = true; clearTimeout(timer); fn(arg); } };
    window.gm_authFailure = () => finish(reject, new Error('Maps auth failed — check the key, its website restriction, billing, and that both APIs are enabled.'));
    const timer = setTimeout(() => finish(reject, new Error('Timed out — usually a key, referrer, or billing issue.')), 12000);
    try {
      const svc = new window.google.maps.DistanceMatrixService();
      svc.getDistanceMatrix({
        origins: [originZip + ', USA'],
        destinations: [destZip + ', USA'],
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      }, (res, status) => {
        if (status !== 'OK') return finish(reject, new Error(status));
        const el = res.rows && res.rows[0] && res.rows[0].elements && res.rows[0].elements[0];
        if (!el || el.status !== 'OK') return finish(reject, new Error(el ? el.status : 'NO_RESULT'));
        finish(resolve, el.distance.value / 1609.344);
      });
    } catch (e) {
      finish(reject, e);
    }
  });
}

async function getRouteMiles(origin, destination, waypoints) {
  await loadGoogleMaps();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, arg) => { if (!done) { done = true; clearTimeout(timer); fn(arg); } };
    window.gm_authFailure = () => finish(reject, new Error('Maps auth failed — check the key, its website restriction, billing, and that the APIs are enabled.'));
    const timer = setTimeout(() => finish(reject, new Error('Timed out — usually a key, referrer, or billing issue.')), 15000);
    try {
      const svc = new window.google.maps.DirectionsService();
      svc.route({
        origin,
        destination,
        waypoints: (waypoints || []).map((w) => ({ location: w, stopover: true })),
        travelMode: window.google.maps.TravelMode.DRIVING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      }, (res, status) => {
        if (status !== 'OK') return finish(reject, new Error(status));
        const route = res.routes && res.routes[0];
        if (!route) return finish(reject, new Error('NO_ROUTE'));
        const meters = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
        finish(resolve, meters / 1609.344);
      });
    } catch (e) {
      finish(reject, e);
    }
  });
}

async function geocodeZip(zip) {
  await loadGoogleMaps();
  return new Promise((resolve, reject) => {
    try {
      const g = new window.google.maps.Geocoder();
      g.geocode({ address: zip + ', USA' }, (results, status) => {
        if (status !== 'OK' || !results || !results[0]) return reject(new Error(status || 'NO_RESULT'));
        const comps = results[0].address_components || [];
        const get = (type) => comps.find((x) => x.types.includes(type)) || null;
        const cityC = get('locality') || get('postal_town') || get('sublocality') || get('neighborhood');
        const stateC = get('administrative_area_level_1');
        const city = cityC ? cityC.long_name : '';
        const state = stateC ? stateC.short_name : '';
        resolve(city && state ? city + ', ' + state : (city || state || ''));
      });
    } catch (e) { reject(e); }
  });
}

// Browser geolocation as a promise.
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location not available on this device.'));
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), (e) => reject(e), { timeout: 12000, maximumAge: 60000 });
  });
}

// Google Places text search near a lat/lng (needs the Places API enabled on the key).
async function placesNear(queryText, lat, lng, radius = 40000) {
  await loadGoogleMaps();
  return new Promise((resolve, reject) => {
    if (!(window.google && window.google.maps && window.google.maps.places)) return reject(new Error('Places library not available — enable the Places API.'));
    const svc = new window.google.maps.places.PlacesService(document.createElement('div'));
    svc.textSearch({ query: queryText, location: new window.google.maps.LatLng(lat, lng), radius }, (results, status) => {
      const S = window.google.maps.places.PlacesServiceStatus;
      if (status === S.OK) resolve(results || []);
      else if (status === S.ZERO_RESULTS) resolve([]);
      else reject(new Error(status));
    });
  });
}

// Upload a file to Storage and return its public download URL.
async function uploadToStorage(path, file) {
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}

// Public portal URL — used in outbound welcome emails. Change this in ONE place
// when the app moves off vercel.app to a custom domain.
const PORTAL_URL = 'https://portal.forwardmotionfreight.com';

// Queue a transactional email. Writes a doc to the `mail` collection that the
// Firebase "Trigger Email from Firestore" extension picks up and sends. Never
// throws into the caller — a mail hiccup must not block account creation.
// Normalize a Firestore Timestamp | ms-number | ISO-string to epoch ms.
function toMs(t) {
  if (!t) return null;
  if (typeof t === 'number') return t;
  if (t.toDate) { try { return t.toDate().getTime(); } catch (_) { return null; } }
  if (t.seconds) return t.seconds * 1000;
  const d = new Date(t); return isNaN(d) ? null : d.getTime();
}
// Compact "2h ago" / "3d ago" relative time. Falls back to '' if unknown.
function timeAgo(t) {
  const ms = toMs(t);
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

async function queueEmail(to, subject, html) {
  if (!to) return;
  try {
    // Stamp sender + org so the mail-queue rule can tie this to a real
    // dispatcher (the Trigger Email extension ignores the extra fields).
    await addDoc(collection(db, 'mail'), {
      to: [to],
      message: { subject, html },
      senderUid: auth.currentUser ? auth.currentUser.uid : null,
      orgId: ACTIVE_ORG || null,
    });
  } catch (e) {
    console.error('queueEmail failed (account still created):', e);
  }
}

// Escapes text for safe interpolation into HTML (email bodies, printed
// invoices). Call this exactly once, at the point of interpolation — never
// store the escaped result anywhere, and never run it twice on the same
// string (that's how "A & B Trucking" would end up as "A &amp;amp; B…").
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Brand-aware email wrapper. Pass a brand ({ name, logoUrl }) to co-brand the
// banner with the dispatcher's business (white-label uses their logo; Pro shows
// their name). A small "Powered by Forward OS" footer always stays. No brand →
// the default Forward Motion Freight banner (used for FMF's own emails).
function emailShell(bodyHtml, brand) {
  const b = brand || {};
  // Only ever emit an <img> for a real http(s) URL — anything else (a blank
  // string, "javascript:...", a bare filename) falls back to the text banner
  // instead of being trusted as a src.
  const isHttpLogo = typeof b.logoUrl === 'string' && /^https?:\/\//i.test(b.logoUrl.trim());
  const banner = isHttpLogo
    ? `<img src="${escapeHtml(b.logoUrl.trim())}" alt="${escapeHtml(b.name || 'Logo')}" style="max-height:30px;max-width:220px;display:block" />`
    : `<span style="color:#f59e0b;font-weight:bold;letter-spacing:2px;font-size:13px">${escapeHtml((b.name || 'Forward Motion Freight').toUpperCase())}</span>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.6">
    <div style="background:#0a0f1a;padding:22px 24px;border-radius:12px 12px 0 0">
      ${banner}
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px">${bodyHtml}</div>
    <div style="text-align:center;padding:12px 0;color:#9ca3af;font-size:11px;letter-spacing:0.5px">Powered by Forward OS</div>
  </div>`;
}

function welcomeCarrierEmail({ name, email, tempPw, company, phone, logoUrl }) {
  const co = company || 'Forward Motion Freight';
  const safeName = escapeHtml(name || 'driver');
  const safeCo = escapeHtml(co);
  const safeEmail = escapeHtml(email);
  const safeTempPw = escapeHtml(tempPw);
  const safePhone = escapeHtml(phone);
  return emailShell(`
    <h2 style="margin:0 0 12px;font-size:20px">Welcome aboard, ${safeName}!</h2>
    <p>Your ${safeCo} driver portal is set up and ready. Here's how to get rolling:</p>
    <ol style="padding-left:18px">
      <li><strong>Sign in:</strong> <a href="${PORTAL_URL}" style="color:#2563eb">${PORTAL_URL}</a><br>
        Email: <strong>${safeEmail}</strong><br>
        Temporary password: <strong>${safeTempPw}</strong></li>
      <li>You'll be prompted to set your own password.</li>
      <li>A quick 2-minute setup confirms your carrier profile (equipment, lanes, docs).</li>
      <li>Take the optional dashboard tour — then you're ready to roll.</li>
    </ol>
    <p>Inside you'll find your assigned loads, pay, compliance dates, document vault, and your own cost-per-mile calculator — all in one place.</p>
    ${phone ? `<p>Questions about a load? Call your dispatcher: <strong>${safePhone}</strong>.</p>` : ''}
    <p style="color:#6b7280;font-size:13px">Questions? Just reply to this email and we'll get you sorted.</p>
    <p style="margin-top:18px">Keep moving forward,<br><strong>${safeCo} — Dispatch</strong></p>`, { name: company, logoUrl });
}

function welcomeCarrierText({ email, tempPw, company, phone }) {
  const co = company || 'Forward Motion Freight';
  const phoneLine = phone ? `\nDispatch phone: ${phone}` : '';
  return `Welcome to ${co}!\n\nYour driver portal is ready. Here's how to get started:\n\n1) Sign in: ${PORTAL_URL}\n     Email: ${email}\n     Temporary password: ${tempPw}\n\n2) You'll be prompted to set your own password.\n3) A quick 2-minute setup confirms your carrier profile.\n4) Take the optional dashboard tour, and you're ready to roll.${phoneLine}\n\nQuestions? Just reply to this email.\n\nKeep moving forward,\n— ${co} Dispatch`;
}

function welcomeDispatcherEmail({ name, email, tempPw }) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeTempPw = escapeHtml(tempPw);
  return emailShell(`
    <h2 style="margin:0 0 12px;font-size:20px">Welcome to the deal desk${name ? ', ' + safeName : ''}.</h2>
    <p>Your Forward OS dispatcher account is ready.</p>
    <ol style="padding-left:18px">
      <li><strong>Sign in:</strong> <a href="${PORTAL_URL}" style="color:#2563eb">${PORTAL_URL}</a><br>
        Email: <strong>${safeEmail}</strong><br>
        Temporary password: <strong>${safeTempPw}</strong></li>
      <li>Set your own password when prompted.</li>
      <li>Flip on <strong>Guided Mode</strong> (top of the screen) — it walks you through every tab.</li>
      <li>Take the dashboard tour for a 60-second orientation.</li>
    </ol>
    <p>Your day starts on the Dashboard (weekly dispatch total + live Market Pulse). Work a deal in the Rate Calculator, vet the broker in Broker Check, then send the load. Carriers and their logins live under "Carriers &amp; Access."</p>
    <p style="margin-top:18px">Keep moving forward,<br><strong>Forward Motion Freight — Operations</strong></p>`);
}

// Off-platform offer alert — carriers are driving, not watching a browser tab,
// so a new offer must reach them immediately. Email is queued via the mail
// collection; a copy-to-text version lets the dispatcher fire an SMS from their
// own phone right now (until the Twilio auto-SMS function is deployed).
function offerCarrierEmail({ carrierName, loadId, origin, destination, rate, pickup, delivery, commodity, dispatchPhone, company, logoUrl }) {
  const co = company || 'Forward Motion Freight';
  const money = (x) => '$' + (Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const safeCarrierName = escapeHtml(carrierName);
  const safeLoadId = escapeHtml(loadId);
  const safeOrigin = escapeHtml(origin) || '?';
  const safeDestination = escapeHtml(destination) || '?';
  const safePickup = escapeHtml(pickup);
  const safeDelivery = escapeHtml(delivery);
  const safeCommodity = escapeHtml(commodity);
  const safeDispatchPhone = escapeHtml(dispatchPhone);
  const safeCo = escapeHtml(co);
  return emailShell(`
    <h2 style="margin:0 0 12px;font-size:20px">New load offer${carrierName ? ', ' + safeCarrierName : ''} — ${safeLoadId}</h2>
    <p>A load offer is waiting in your portal. Review and accept or decline before it's gone.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
      <tr><td style="padding:4px 0;color:#6b7280">Load</td><td style="text-align:right;font-weight:bold">${safeLoadId}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280">Lane</td><td style="text-align:right;font-weight:bold">${safeOrigin} &rarr; ${safeDestination}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280">Rate</td><td style="text-align:right;font-weight:bold;color:#059669">${money(rate)}</td></tr>
      ${pickup ? `<tr><td style="padding:4px 0;color:#6b7280">Pickup</td><td style="text-align:right">${safePickup}</td></tr>` : ''}
      ${delivery ? `<tr><td style="padding:4px 0;color:#6b7280">Delivery</td><td style="text-align:right">${safeDelivery}</td></tr>` : ''}
      ${commodity ? `<tr><td style="padding:4px 0;color:#6b7280">Commodity</td><td style="text-align:right">${safeCommodity}</td></tr>` : ''}
    </table>
    <p><a href="${PORTAL_URL}" style="background:#f59e0b;color:#06141f;font-weight:bold;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block">Review the offer &rarr;</a></p>
    ${dispatchPhone ? `<p style="color:#6b7280;font-size:13px">Questions? Call dispatch: <strong>${safeDispatchPhone}</strong>.</p>` : ''}
    <p style="margin-top:18px">Keep moving forward,<br><strong>${safeCo} — Dispatch</strong></p>`, { name: company, logoUrl });
}

function offerCarrierText({ loadId, origin, destination, rate, pickup, dispatchPhone, company }) {
  const co = company || 'Forward Motion Freight';
  const money = (x) => '$' + (Number(x) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pu = pickup ? `\nPickup: ${pickup}` : '';
  const ph = dispatchPhone ? `\nQ's? ${dispatchPhone}` : '';
  return `${co}: New load offer ${loadId}\n${origin || '?'} -> ${destination || '?'}\nRate: ${money(rate)}${pu}\n\nReview & accept in your portal: ${PORTAL_URL}${ph}`;
}

async function createDriverAccount(email, password, displayName) {
  const secondary = initializeApp(firebaseConfig, 'driver-creator-' + Date.now());
  const secondaryAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    // Seed the auth-profile name so their dashboard greets them by name on the
    // very first login (before they've saved a profile). Best-effort.
    if (displayName) { try { await updateProfile(cred.user, { displayName }); } catch (_) {} }
    return cred.user.uid;
  } finally {
    try { await signOut(secondaryAuth); } catch (_) {}
    try { await deleteApp(secondary); } catch (_) {}
  }
}

const ADMIN_EMAILS = [
  'prince.younger3@gmail.com',
];

// Phone the "Call Dispatcher" button dials from a pending load offer.
const DISPATCHER_PHONE = '';

// Default dispatch fee % when a load/carrier doesn't specify one.
const DEFAULT_FEE_PCT = 10;
// Resolves a stored fee % safely: a deliberate 0 is respected as 0 (a real,
// intentional fee arrangement), while blank/missing/non-numeric falls back
// to DEFAULT_FEE_PCT. `(Number(v) || DEFAULT_FEE_PCT)` is the bug this
// replaces — `||` treats 0 as falsy and silently coerces it to 10%.
const feePctOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v !== null && v !== undefined ? n : DEFAULT_FEE_PCT;
};
// A load's own fee % if it was actually set (0 counts as set), else the
// linked carrier's fee %, else the default. Every fee computation site
// (dashboard, expenses, invoices, FMF rev-share) resolves a load's fee this
// same way, so a load booked before feePct was stamped still counts right.
const loadFeePctOf = (l, carrier) => {
  const set = l && l.feePct !== '' && l.feePct !== null && l.feePct !== undefined && Number.isFinite(Number(l.feePct));
  return set ? feePctOf(l.feePct) : feePctOf(carrier && carrier.feePct);
};
// Turns a workspace name into a safe filename fragment (falls back to the
// unbranded default name when there's no workspace name to slugify).
const slugifyOrgName = (name) => {
  const s = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'forward-motion';
};

// ============================================================================
// ===== MARKET DATA — live feed from the marketing site, builtin fallback ====
// The portal reads its market numbers from a small public JSON file hosted on
// the marketing site (https://forwardmotionfreight.com/market.json). That file
// auto-deploys on push, so updating the market needs NO portal paste. Priority:
// live fetch → last-good localStorage cache (fm_market_cache) → the builtin
// constants below. Every field is validated individually in mergeMarketData(),
// so a partial or malformed file can never blank the widgets — bad fields just
// fall back. Read it via useMarketData(); never read the FALLBACK_* directly.
// ============================================================================
const MARKET_FEED_URL = 'https://forwardmotionfreight.com/market.json';
const MARKET_CACHE_KEY = 'fm_market_cache';

// Builtin last-resort snapshot, shipped with the app (shown as "reference
// data" when neither the live file nor a cached copy is available).
const FALLBACK_MARKET_RATES = {
  'General Dry Freight': 2.47,
  'Frozen Seafood/Poultry': 3.20,
  'Fresh Produce': 3.20,
  'Coiled Steel': 3.57,
  'High-Value Electronics': 2.60,
};
const BUILTIN_MARKET = {
  asOf: 'Q2 2026',
  blurb: 'Supply-constrained market — capacity is tight and rates favor carriers.',
  dieselPerGal: 5.35,
  spotAllIn: 3.83, // national truckload spot ($/mi)
  trend: 'up', // 'up' | 'down' | 'flat'
  modality: [
    { type: 'Dry Van', rpm: '$2.47–$2.80', yoy: '+18–23%' },
    { type: 'Reefer', rpm: '$3.11–$3.31', yoy: '+13–18%' },
    { type: 'Flatbed', rpm: '$3.46–$3.57', yoy: '+14–20%' },
    { type: 'LTL', rpm: '+12.5% GRI', yoy: '+12.5%' },
    { type: 'Intermodal', rpm: '$1.39', yoy: '−5%' },
  ],
  lanes: [
    { lane: 'Atlanta, GA → Miami, FL', rpm: '$2.50–$2.90' },
    { lane: 'Memphis, TN → Atlanta, GA', rpm: '$2.40–$2.75' },
    { lane: 'Yakima, WA → Northeast (reefer)', rpm: '$8.7k–$10.6k / load' },
  ],
  commodityRates: FALLBACK_MARKET_RATES,
};

// Validates a raw market.json payload field-by-field against BUILTIN_MARKET.
// Returns a complete, safe object — or null if the payload isn't even an
// object (caller keeps whatever it already has). Tolerates missing fields,
// wrong types, and extra keys; commodity rates merge over the builtin list.
function mergeMarketData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = BUILTIN_MARKET;
  const str = (x, fb) => (typeof x === 'string' && x.trim() ? x.trim() : fb);
  const num = (x, fb) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : fb);
  const modality = Array.isArray(raw.modality)
    ? raw.modality
        .filter((m) => m && typeof m === 'object' && typeof m.type === 'string' && typeof m.rpm === 'string')
        .map((m) => ({ type: m.type, rpm: m.rpm, yoy: typeof m.yoy === 'string' ? m.yoy : '' }))
    : [];
  const lanes = Array.isArray(raw.lanes)
    ? raw.lanes
        .filter((l) => l && typeof l === 'object' && typeof l.lane === 'string' && typeof l.rpm === 'string')
        .map((l) => ({ lane: l.lane, rpm: l.rpm }))
    : [];
  const rates = { ...b.commodityRates };
  if (raw.commodityRates && typeof raw.commodityRates === 'object' && !Array.isArray(raw.commodityRates)) {
    Object.entries(raw.commodityRates).forEach(([k, val]) => {
      const nv = Number(val);
      if (k && Number.isFinite(nv) && nv > 0) rates[k] = nv;
    });
  }
  return {
    asOf: str(raw.asOf, b.asOf),
    blurb: str(raw.blurb, str(raw.headline, b.blurb)),
    dieselPerGal: num(raw.dieselPerGal, b.dieselPerGal),
    spotAllIn: num(raw.spotAllIn, b.spotAllIn),
    trend: ['up', 'down', 'flat'].includes(raw.trend) ? raw.trend : b.trend,
    modality: modality.length ? modality : b.modality,
    lanes: lanes.length ? lanes : b.lanes,
    commodityRates: rates,
  };
}

// Renders the feed's asOf as a human date ("Jul 1, 2026") when it's a
// YYYY-MM-DD string; anything else (e.g. "Q2 2026") passes through as-is.
function fmtMarketAsOf(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return String(s || '');
  const mo = Number(m[2]), day = Number(m[3]);
  const d = new Date(Number(m[1]), mo - 1, day);
  // round-trip check: JS Date silently rolls over out-of-range months/days
  if (d.getMonth() !== mo - 1 || d.getDate() !== day) return String(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Module-level market state + listener array (same pattern as the toast
// system): components subscribe via useMarketData() and re-render when the
// fetch lands. source: 'live' | 'cached' | 'builtin'.
let _marketState = { data: BUILTIN_MARKET, source: 'builtin' };
let _marketListeners = [];
function _publishMarket(data, source) {
  _marketState = { data, source };
  _marketListeners.forEach((fn) => { try { fn(_marketState); } catch (_) {} });
}
function useMarketData() {
  const [m, setM] = useState(_marketState);
  useEffect(() => {
    _marketListeners.push(setM);
    setM(_marketState); // in case the fetch landed between render and mount
    return () => { _marketListeners = _marketListeners.filter((f) => f !== setM); };
  }, []);
  return m;
}

// One-shot boot: hydrate from the last good cached copy immediately, then try
// the live file. Any failure (offline, CORS, 404, bad JSON, timeout) is
// silent — the cache/builtin simply stands, so the widgets always render.
let _marketBooted = false;
function bootMarketData() {
  if (_marketBooted || typeof window === 'undefined') return;
  _marketBooted = true;
  try {
    const cached = JSON.parse(localStorage.getItem(MARKET_CACHE_KEY) || 'null');
    const merged = cached && mergeMarketData(cached.raw);
    if (merged) _publishMarket(merged, 'cached');
  } catch (_) { /* corrupt cache — builtin stands */ }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => { try { ctl.abort(); } catch (_) {} }, 8000) : null;
  fetch(MARKET_FEED_URL, { cache: 'no-cache', signal: ctl ? ctl.signal : undefined })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then((raw) => {
      const merged = mergeMarketData(raw);
      if (!merged) return; // malformed file — keep what we have
      _publishMarket(merged, 'live');
      try { localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify({ fetchedAt: new Date().toISOString(), raw })); } catch (_) {}
    })
    .catch(() => { /* silent fallback by design */ })
    .finally(() => { if (timer) clearTimeout(timer); });
}
bootMarketData();

// ============================================================================
// ===== Multi-tenancy (Lite) — org-scoping helpers ===========================
// ACTIVE_ORG is set from the signed-in user's doc after login. While it's null
// (single-tenant / pre-migration) the helpers fall back to unscoped behavior,
// so the app keeps working exactly as before until the full cutover.
// ============================================================================
let ACTIVE_ORG = null;
function setActiveOrg(orgId) { ACTIVE_ORG = orgId || null; _orgBrandCache = null; }

// Per-workspace brand for co-branding (Pro shows the company name; the
// Authority/white-label tier shows an uploaded logo). Loaded once per active
// org and cached at the module level so the sidebar/emails don't re-read it.
let _orgBrandCache = null;
function useOrgBrand(enabled = true) {
  const [brand, setBrand] = useState(_orgBrandCache && _orgBrandCache._org === ACTIVE_ORG ? _orgBrandCache : null);
  useEffect(() => {
    if (!enabled || !ACTIVE_ORG) return;
    if (_orgBrandCache && _orgBrandCache._org === ACTIVE_ORG) { setBrand(_orgBrandCache); return; }
    let live = true;
    (async () => {
      try {
        const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG));
        if (!live) return;
        const d = o.exists() ? o.data() : {};
        const b = { _org: ACTIVE_ORG, name: d.name || '', logoUrl: d.logoUrl || '', brandTier: d.brandTier || '' };
        _orgBrandCache = b; setBrand(b);
      } catch (_) { /* brand is best-effort; falls back to Forward OS */ }
    })();
    return () => { live = false; };
  }, [enabled]);
  return brand;
}
// Org-filtered query for dispatcher-wide reads; unscoped when no org is set.
function orgScoped(name) {
  return ACTIVE_ORG ? query(collection(db, name), where('orgId', '==', ACTIVE_ORG)) : collection(db, name);
}
// Stamp the active org onto a document being created.
function stampOrg(obj) { return ACTIVE_ORG ? { ...obj, orgId: ACTIVE_ORG } : obj; }

// Collision-resistant load ID. A 6-digit space (900k values) plus an existence
// check against this workspace's loads (retry on the rare clash) so two loads
// can't end up sharing an FM-###### number on a RateCon, invoice, or factoring
// submission. Async — always await it.
async function genLoadId() {
  const rand = () => 'FM-' + Math.floor(100000 + Math.random() * 900000);
  for (let i = 0; i < 8; i++) {
    const cand = rand();
    try {
      const snap = await getDocs(query(orgScoped('loads'), where('loadId', '==', cand)));
      if (snap.empty) return cand;
    } catch (_) { return cand; } // can't check → 900k space makes a clash unlikely
  }
  return 'FM-' + String(Date.now()).slice(-6);
}

// "Guided Mode" (training wheels) — when on, the UI nudges new dispatchers
// through workflows with checklists and contextual hints. Read app-wide.
const GuidedModeContext = React.createContext(false);
const useGuided = () => React.useContext(GuidedModeContext);

// Contextual tip that only appears when Guided Mode is on.
function GuidedHint({ children }) {
  const guided = useGuided();
  if (!guided) return null;
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs rounded-lg px-3 py-2 flex gap-2 items-start">
      <span className="shrink-0">💡</span>
      <div>{children}</div>
    </div>
  );
}

// ===== Forward OS brand =====
function ForwardOSLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="fosGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="#0b1220" stroke="#1e293b" strokeWidth="1.5" />
      <g fill="none" stroke="url(#fosGrad)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="12,13 20,20 12,27" />
        <polyline points="20,13 28,20 20,27" />
      </g>
    </svg>
  );
}

// When `branded`, the lockup co-brands to the active workspace: the Authority
// (white-label) tier shows the company's own logo, Pro shows the company name,
// both with a small "Powered by Forward OS" line. No brand (or pre-login) →
// the default Forward OS lockup.
function BrandLockup({ size = 34, stack = false, branded = false }) {
  const brand = useOrgBrand(branded);
  const wrap = `flex items-center gap-2.5 ${stack ? 'flex-col text-center gap-2' : ''}`;

  if (branded && brand && brand.logoUrl) {
    return (
      <div className={stack ? 'flex flex-col items-center gap-1' : 'flex flex-col leading-none'}>
        <img src={brand.logoUrl} alt={brand.name || 'Workspace logo'} style={{ height: size, maxWidth: 168 }} className="object-contain" />
        <div className="text-[9px] text-slate-500 tracking-[0.16em] font-semibold mt-1">POWERED BY FORWARD OS</div>
      </div>
    );
  }
  if (branded && brand && brand.name) {
    return (
      <div className={wrap}>
        <div className={stack ? '' : 'leading-none'}>
          <div className="text-base font-extrabold tracking-tight text-white leading-none">{brand.name}</div>
          <div className="text-[9px] text-slate-500 tracking-[0.16em] font-semibold mt-1">POWERED BY FORWARD OS</div>
        </div>
      </div>
    );
  }
  return (
    <div className={wrap}>
      <ForwardOSLogo size={size} />
      <div className={stack ? '' : 'leading-none'}>
        <div className="text-base font-extrabold tracking-tight text-white leading-none">Forward<span className="text-amber-500">OS</span></div>
        <div className="text-[10px] text-slate-500 tracking-[0.18em] font-semibold mt-1">DISPATCH PLATFORM</div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    // Restore the tab from the URL hash so a refresh keeps you where you were.
    try { return (window.location.hash || '').replace(/^#/, '') || 'dashboard'; } catch (_) { return 'dashboard'; }
  });
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [needsPwChange, setNeedsPwChange] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [viewAs, setViewAs] = useState(null);
  const [carrierOpts, setCarrierOpts] = useState([]);
  const [vipOn, setVipOn] = useState(true); // driver sees VIP Concierge unless their carrier turns it off
  const [myStatus, setMyStatus] = useState('Available'); // carrier self-set availability
  const [vipRequested, setVipRequested] = useState(false); // carrier asked dispatch for VIP
  const [showTour, setShowTour] = useState(false); // first-login walkthrough
  const [paletteOpen, setPaletteOpen] = useState(false); // command palette (Ctrl/Cmd+K)
  const [myOrgId, setMyOrgId] = useState(null); // multi-tenancy: the user's workspace
  const [myRole, setMyRole] = useState(null);   // 'admin' (dispatcher) | 'driver'
  const [myOrgType, setMyOrgType] = useState(null);       // 'fmf' | 'independent' | null
  const [revShareSigned, setRevShareSigned] = useState(false); // FMF dispatcher signed?
  const [guidedMode, setGuidedMode] = useState(() => { try { return localStorage.getItem('fm_guided') === '1'; } catch (_) { return false; } });
  const toggleGuided = () => setGuidedMode((g) => { const nv = !g; try { localStorage.setItem('fm_guided', nv ? '1' : '0'); } catch (_) {} return nv; });

  const isAdminEmail = (email) =>
    ADMIN_EMAILS.map((e) => e.toLowerCase()).includes((email || '').toLowerCase());

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setNeedsPwChange(false);
        setAuthLoading(false);
        return;
      }
      const admin = isAdminEmail(u.email);
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const data = snap.exists() ? snap.data() : null;
        const approved = admin || (data && data.approved === true);

        if (!approved) {
          await signOut(auth);
          setUser(null);
          setAccessDenied(true);
          setAuthLoading(false);
          return;
        }

        await setDoc(
          doc(db, 'users', u.uid),
          { email: u.email, approved: true, lastLogin: serverTimestamp() },
          { merge: true }
        );
        // A provisioned dispatcher has role:'admin' on a non-super email — treat them
        // as admin so they skip the carrier onboarding wizard (but still change pw).
        const roleAdmin = admin || (data && data.role === 'admin');
        setNeedsPwChange(!admin && data && data.mustChangePassword === true);
        setNeedsOnboarding(!roleAdmin && !(data && data.onboardingComplete === true));
        setVipOn(roleAdmin || !data || data.vipConcierge !== false); // off only when explicitly disabled
        setMyStatus((data && data.availability) || 'Available');
        setVipRequested(!!(data && data.vipRequested));
        // Multi-tenancy: resolve the user's workspace + role (null until migrated).
        setActiveOrg(data && data.orgId);
        setMyOrgId((data && data.orgId) || null);
        setMyRole((data && data.role) || (admin ? 'admin' : 'driver'));
        // The user-doc marker is a display convenience only (no longer
        // self-writable under the updated rules — super-only). The
        // tamper-evident signed_agreements record is authoritative; read it
        // whenever it could matter (i.e. there's a workspace to gate), and
        // fall back to the marker on a transient read failure so nobody gets
        // locked out of a screen they've legitimately signed for.
        setRevShareSigned(!!(data && data.revShareAgreement));
        if (data && data.orgId) {
          try {
            const sa = await getDocs(query(collection(db, 'signed_agreements'), where('uid', '==', u.uid), where('type', '==', 'revShareAgreement')));
            setRevShareSigned(!sa.empty);
          } catch (_) { /* keep the marker-based fallback set above */ }
        }
        // Resolve the workspace type (FMF vs independent) for FMF-only gates
        // like the dispatcher revenue-share agreement. Best-effort.
        if (data && data.orgId) {
          try { const o = await getDoc(doc(db, 'orgs', data.orgId)); setMyOrgType(o.exists() ? (o.data().orgType || null) : null); }
          catch (_) { setMyOrgType(null); }
        } else { setMyOrgType(null); }
        setUser(u);
        setAccessDenied(false);
      } catch (e) {
        console.error('access check failed', e);
        setUser(u);
      } finally {
        setAuthLoading(false);
      }
    });
  }, []);

  const isSuper = !!user && isAdminEmail(user.email); // super-admin (you) — provisions workspaces
  const isAdmin = isSuper || myRole === 'admin';       // dispatcher console access (role-based)
  const isFmfDispatcher = isAdmin && !isSuper && myOrgType === 'fmf'; // dispatches under FMF
  const fmfUnsigned = isFmfDispatcher && !revShareSigned;             // must sign to go live

  // Command Palette (Ctrl/Cmd+K) — global shortcut, works from anywhere once
  // signed in. The item list below mirrors the sidebar's own gating exactly
  // so it can never open a tab the sidebar itself wouldn't show.
  useEffect(() => {
    const onKey = (e) => {
      if (!user) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user]);

  const paletteIsAdmin = isAdmin && !viewAs; // "view as" drops into the carrier's own tab list, same as the sidebar
  const paletteItems = React.useMemo(() => {
    if (paletteIsAdmin) {
      const items = [
        { tab: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, keywords: ['home', 'overview'] },
      ];
      if (isFmfDispatcher) {
        items.push({ tab: 'fmfagreement', label: 'Dispatcher Agreement', icon: <FileText size={16} />, keywords: ['revshare', 'sign'] });
      }
      items.push(
        { tab: 'calc', label: 'Rate Calculator', icon: <Wallet size={16} />, keywords: ['rpm', 'pricing', 'negotiate'] },
        { tab: 'laneintel', label: 'Lane Intel', icon: <Map size={16} />, keywords: ['market', 'lanes'] },
        { tab: 'trihaul', label: 'TriHaul Planner', icon: <Navigation size={16} />, keywords: ['triangle', 'route'] },
        { tab: 'brokercheck', label: 'Broker Check', icon: <ShieldCheck size={16} />, keywords: ['credit', 'broker'] },
        { tab: 'carriercheck', label: 'Carrier Check', icon: <ShieldCheck size={16} />, keywords: ['vet', 'carrier', 'insurance'] },
        { tab: 'assign', label: 'Assign Load', icon: <Plus size={16} />, keywords: ['new load', 'dispatch'] },
        { tab: 'allloads', label: 'All Loads', icon: <Navigation size={16} />, keywords: ['loads', 'board'] },
        { tab: 'lanes', label: 'Lane Management', icon: <Map size={16} />, keywords: ['active load', 'carrier lane', 'status'] },
        { tab: 'carriers', label: 'Carriers', icon: <Building size={16} />, keywords: ['fleet', 'owner operator'] },
        { tab: 'crm', label: 'CRM / Network', icon: <BookOpen size={16} />, keywords: ['leads', 'brokers'] },
        { tab: 'drivers', label: 'Logins & Access', icon: <User size={16} />, keywords: ['accounts', 'password'] },
        { tab: 'vip', label: 'VIP Services', icon: <HeartPulse size={16} />, keywords: ['concierge'] },
        { tab: 'expenses', label: 'Expenses', icon: <CreditCard size={16} />, keywords: ['costs'] },
        { tab: 'invoices', label: 'Invoices', icon: <FileText size={16} />, keywords: ['billing', 'invoice'] },
        { tab: 'fleet', label: 'Fleet (ELD)', icon: <Activity size={16} />, keywords: ['eld', 'trucks'] },
        { tab: 'training', label: 'Training', icon: <GraduationCap size={16} />, keywords: ['course', 'quiz'] },
        { tab: 'walkthrough', label: 'First Load Walkthrough', icon: <Navigation size={16} />, keywords: ['walkthrough', 'tutorial', 'first load'] },
      );
      if (isSuper) {
        items.push(
          { tab: 'workspaces', label: 'Workspaces', icon: <Building size={16} />, keywords: ['orgs', 'provision'] },
          { tab: 'requests', label: 'Access Requests', icon: <User size={16} />, keywords: ['leads'] },
          { tab: 'courseprogress', label: 'Course Progress', icon: <GraduationCap size={16} />, keywords: ['training'] },
          { tab: 'fmfrevshare', label: 'FMF Rev-Share', icon: <Wallet size={16} />, keywords: ['revenue share'] },
        );
      }
      items.push({ tab: 'breakroom', label: 'Break Room', icon: <Gamepad2 size={16} />, keywords: ['game', 'arcade', 'break'] });
      items.push({ tab: 'settings', label: 'Settings', icon: <Settings size={16} />, keywords: ['guided mode', 'account'] });
      return items;
    }
    const items = [
      { tab: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, keywords: ['home'] },
      { tab: 'newauthority', label: 'New Authority', icon: <Navigation size={16} />, keywords: ['mc authority', 'setup'] },
      { tab: 'profile', label: 'My Profile', icon: <User size={16} />, keywords: ['account'] },
      { tab: 'schedule', label: 'Schedule & Calendar', icon: <Calendar size={16} />, keywords: ['calendar', 'appointments'] },
      { tab: 'lanes', label: 'Lane Management', icon: <Map size={16} />, keywords: ['lanes', 'preferences'] },
      { tab: 'parking', label: 'Safe Parking', icon: <MapPin size={16} />, keywords: ['parking', 'rest stop'] },
      { tab: 'compliance', label: 'Compliance', icon: <ShieldCheck size={16} />, keywords: ['cdl', 'insurance', 'medical'] },
      { tab: 'agreements', label: 'Agreements & W-9', icon: <FileText size={16} />, keywords: ['w9', 'sign'] },
      { tab: 'vault', label: 'Digital Vault', icon: <FileText size={16} />, keywords: ['documents', 'files'] },
      { tab: 'financials', label: 'Financial Routing', icon: <Wallet size={16} />, keywords: ['bank', 'factoring'] },
      { tab: 'mycpm', label: 'My CPM & Expenses', icon: <Activity size={16} />, keywords: ['cost per mile', 'breakeven'] },
      { tab: 'upgrades', label: 'Upgrades & Credentials', icon: <CreditCard size={16} />, keywords: ['twic', 'hazmat'] },
    ];
    if (vipOn) {
      items.push(
        { tab: 'wellness', label: 'Wellness & Diet', icon: <HeartPulse size={16} />, keywords: ['health'] },
        { tab: 'pets', label: 'Pet Logistics', icon: <Dog size={16} />, keywords: ['pet'] },
      );
    }
    items.push({ tab: 'breakroom', label: 'Break Room', icon: <Gamepad2 size={16} />, keywords: ['game', 'arcade', 'break'] });
    items.push({ tab: 'settings', label: 'Settings', icon: <Settings size={16} />, keywords: ['account'] });
    return items;
  }, [paletteIsAdmin, isFmfDispatcher, isSuper, vipOn]);

  // Show the first-login tour once the user is fully signed in (not mid pw-change/onboarding).
  useEffect(() => {
    if (user && !needsPwChange && !needsOnboarding) {
      try { if (localStorage.getItem('fm_tour_seen') !== '1') setShowTour(true); } catch (_) {}
    }
  }, [user, needsPwChange, needsOnboarding]);
  const closeTour = () => { setShowTour(false); try { localStorage.setItem('fm_tour_seen', '1'); } catch (_) {} };

  useEffect(() => {
    if (!isAdmin) { setCarrierOpts([]); return; }
    getDocs(orgScoped('carriers'))
      .then((snap) => setCarrierOpts(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.linkedDriverUid)
      ))
      .catch((e) => console.error('Error loading carrier options:', e));
  }, [isAdmin]);

  const viewUid = viewAs ? viewAs.uid : (user ? user.uid : null);
  const viewName = viewAs ? viewAs.name : null;

  const go = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
    // Reflect the tab in the URL hash so a refresh (and the browser back/forward
    // buttons) keep you on this page instead of resetting to the Dashboard.
    try { if (('#' + tab) !== window.location.hash) window.location.hash = tab; } catch (_) {}
  };

  // Keep the active tab in sync with the URL hash (browser back/forward, and
  // manual edits / bookmarks to a #tab).
  useEffect(() => {
    const onHash = () => {
      try { setActiveTab((window.location.hash || '').replace(/^#/, '') || 'dashboard'); } catch (_) {}
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Carrier self-sets their availability; mirror it onto their linked carrier
  // profile so the dispatcher's Carriers/Rate Calculator views stay in sync.
  const updateMyStatus = async (next) => {
    if (!user) return;
    setMyStatus(next);
    try {
      await setDoc(doc(db, 'users', user.uid), { availability: next }, { merge: true });
      const cs = await getDocs(query(collection(db, 'carriers'), where('linkedDriverUid', '==', user.uid)));
      cs.forEach((d) => updateDoc(doc(db, 'carriers', d.id), { availability: next }).catch(() => {}));
    } catch (e) { console.error('status update failed', e); }
  };

  // Carrier asks dispatch to enable VIP concierge (an upsell at a higher fee %).
  // `answers` is the questionnaire payload so the dispatcher knows what they want.
  const requestVip = async (answers) => {
    if (!user) return;
    setVipRequested(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { vipRequested: true, vipRequestedAt: serverTimestamp(), vipRequest: answers || {} }, { merge: true });
    } catch (e) { console.error('VIP request failed', e); setVipRequested(false); }
  };

  // Carrier changed their mind — withdraw the pending VIP request.
  const cancelVip = async () => {
    if (!user) return;
    setVipRequested(false);
    try {
      await setDoc(doc(db, 'users', user.uid), { vipRequested: false }, { merge: true });
    } catch (e) { console.error('VIP cancel failed', e); setVipRequested(true); }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView key={'dash-' + viewUid} uid={viewUid} displayName={viewName} isAdmin={isAdmin && !viewAs} isSuper={isSuper} vipOn={vipOn} onNavigate={go} myStatus={myStatus} onSetStatus={updateMyStatus} vipRequested={vipRequested} onRequestVip={requestVip} onCancelVip={cancelVip} showAgreementGate={fmfUnsigned && !viewAs} />;
      case 'fmfagreement': return isAdmin ? <DispatcherAgreementView onSigned={() => setRevShareSigned(true)} /> : <DashboardView />;
      case 'newauthority': return <NewAuthorityView />;
      case 'profile': return <ProfileView key={'prof-' + viewUid} uid={viewUid} displayName={viewName} />;
      case 'schedule': return <ScheduleView key={'sched-' + viewUid} uid={viewUid} />;
      case 'lanes': return <LaneManagementView key={'lane-' + viewUid} uid={viewUid} isAdmin={isAdmin && !viewAs} />;
      case 'parking': return <SafeParkingView />;
      case 'compliance': return <ComplianceView key={'comp-' + viewUid} uid={viewUid} isAdmin={isAdmin && !!viewAs} />;
      case 'agreements': return <CarrierAgreementsView key={'agr-' + viewUid} uid={viewUid} isAdmin={isAdmin && !!viewAs} />;
      case 'vault': return <DigitalVaultView key={'vault-' + viewUid} uid={viewUid} isAdmin={isAdmin && !!viewAs} />;
      case 'financials': return <FinancialsView key={'fin-' + viewUid} uid={viewUid} />;
      case 'wellness': return <WellnessView />;
      case 'pets': return <PetLogisticsView />;
      case 'upgrades': return <UpgradesView key={'upg-' + viewUid} uid={viewUid} />;
      case 'mycpm': return <DriverExpensesView key={'cpm-' + viewUid} uid={viewUid} />;
      case 'settings': return <SettingsView isAdmin={isAdmin && !viewAs} myStatus={myStatus} onSetStatus={updateMyStatus} vipOn={vipOn} vipRequested={vipRequested} onRequestVip={requestVip} onCancelVip={cancelVip} guidedMode={guidedMode} toggleGuided={toggleGuided} onNavigate={go} onReplayTour={() => setShowTour(true)} />;
      case 'workspaces': return isSuper ? <WorkspacesView /> : <DashboardView />;
      case 'requests': return isSuper ? <AccessRequestsView onNavigate={go} /> : <DashboardView />;
      case 'courseprogress': return isSuper ? <CourseProgressView /> : <DashboardView />;
      case 'fmfrevshare': return isSuper ? <FmfRevShareView /> : <DashboardView />;
      case 'expenses': return isAdmin ? <ExpensesView /> : <DashboardView />;
      case 'invoices': return isAdmin ? <InvoicesView /> : <DashboardView />;
      case 'assign': return isAdmin ? (fmfUnsigned ? <AgreementRequired onNavigate={go} /> : <AssignLoadView />) : <DashboardView />;
      case 'allloads': return isAdmin ? <AllLoadsView onNavigate={go} /> : <DashboardView />;
      case 'drivers': return isAdmin ? <ManageDriversView /> : <DashboardView />;
      case 'fleet': return isAdmin ? <FleetView /> : <DashboardView />;
      case 'carriers': return isAdmin ? <CarriersView onNavigate={go} /> : <DashboardView />;
      case 'crm': return isAdmin ? <CrmView onNavigate={go} /> : <DashboardView />;
      case 'vip': return isAdmin ? <VipServicesView /> : <DashboardView />;
      case 'brokercheck': return isAdmin ? <BrokerCheckView /> : <DashboardView />;
      case 'carriercheck': return isAdmin ? <CarrierCheckView /> : <DashboardView />;
      case 'walkthrough': return isAdmin ? <WalkthroughView /> : <DashboardView />;
      case 'laneintel': return isAdmin ? <LaneIntelView /> : <DashboardView />;
      case 'trihaul': return isAdmin ? <TriHaulView /> : <DashboardView />;
      case 'calc': return isAdmin ? (fmfUnsigned ? <AgreementRequired onNavigate={go} /> : <NegotiationCalcView />) : <DashboardView />;
      case 'training': return isAdmin ? <TrainingView /> : <DashboardView />;
      case 'breakroom': return <BreakRoomView isSuper={isSuper} />; // everyone signed in — no role gate (isSuper only gates Haul Buddy inside)
      default: return <DashboardView />;
    }
  };

  // Public carrier intake — reachable without a login at ?intake=<workspaceId>.
  // A carrier fills this and it lands in that dispatcher's workspace.
  let intakeOrg = null;
  try { intakeOrg = new URLSearchParams(window.location.search).get('intake'); } catch (_) { /* ignore */ }
  if (intakeOrg) {
    return <CarrierIntakeView orgId={intakeOrg} />;
  }

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 to-pagedeep text-slate-400 font-sans">Loading…</div>;
  }
  if (!user) {
    return <LoginView accessDenied={accessDenied} />;
  }
  if (needsPwChange) {
    return <ChangePasswordView onDone={() => setNeedsPwChange(false)} />;
  }
  if (needsOnboarding) {
    return <OnboardingWizard onDone={() => setNeedsOnboarding(false)} />;
  }
  // Multi-tenancy guard: a dispatcher whose account isn't attached to a workspace
  // would otherwise read across every org (ACTIVE_ORG null = unscoped). Block the
  // console until a super-admin assigns them an orgId. Super-admins are exempt.
  if (isAdmin && !isSuper && !myOrgId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 to-pagedeep text-slate-100 font-sans p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <Building size={26} className="text-amber-400" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Workspace pending</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            Your dispatcher account isn't attached to a workspace yet. An administrator
            needs to assign you to one before your console unlocks. This usually takes a moment.
          </p>
          <button
            onClick={() => signOut(auth)}
            className="rounded-lg border border-slate-700 bg-slate-900/60 px-5 py-2 text-sm text-slate-300 hover:bg-slate-800 transition"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <GuidedModeContext.Provider value={isAdmin && guidedMode}>
    <style>{PROFIT_GLOW_CSS}</style>
    <style>{HAULBUDDY_CSS}</style>
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-pagedeep text-slate-100 font-sans overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-pagedeep/95 backdrop-blur border-r border-slate-800/80 flex flex-col transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="p-6 flex items-start justify-between">
          <BrandLockup size={34} branded />
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-white text-3xl leading-none -mt-1"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <div className="px-6 -mt-3 mb-1 text-[10px] font-semibold tracking-[0.15em] text-amber-500/70 uppercase">Keep Moving Forward</div>

        <nav className="flex-1 overflow-y-auto py-4">
          {isAdmin && !viewAs ? (
            /* ----- ADMIN sees only dispatch tools ----- */
            <>
              <div className="px-4 mb-2 text-xs font-semibold text-amber-500 tracking-wider">OVERVIEW</div>
              <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => go('dashboard')} />
              {isFmfDispatcher && (
                <NavItem
                  icon={<FileText size={18} />}
                  label={<span className="flex items-center gap-2">Dispatcher Agreement{fmfUnsigned && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Signature needed" />}</span>}
                  isActive={activeTab === 'fmfagreement'} onClick={() => go('fmfagreement')} />
              )}

              <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">THE DEAL DESK</div>
              <NavItem icon={<Wallet size={18} />} label="Rate Calculator" isActive={activeTab === 'calc'} onClick={() => go('calc')} />
              <NavItem icon={<Map size={18} />} label="Lane Intel" isActive={activeTab === 'laneintel'} onClick={() => go('laneintel')} />
              <NavItem icon={<Navigation size={18} />} label="TriHaul Planner" isActive={activeTab === 'trihaul'} onClick={() => go('trihaul')} />
              <NavItem icon={<ShieldCheck size={18} />} label="Broker Check" isActive={activeTab === 'brokercheck'} onClick={() => go('brokercheck')} />
              <NavItem icon={<Plus size={18} />} label="Assign Load" isActive={activeTab === 'assign'} onClick={() => go('assign')} />
              <NavItem icon={<Navigation size={18} />} label="All Loads" isActive={activeTab === 'allloads'} onClick={() => go('allloads')} />
              <NavItem icon={<Map size={18} />} label="Lane Management" isActive={activeTab === 'lanes'} onClick={() => go('lanes')} />

              <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">CARRIERS &amp; ACCESS</div>
              <NavItem icon={<Building size={18} />} label="Carriers" isActive={activeTab === 'carriers'} onClick={() => go('carriers')} />
              <NavItem icon={<ShieldCheck size={18} />} label="Carrier Check" isActive={activeTab === 'carriercheck'} onClick={() => go('carriercheck')} />
              <NavItem icon={<BookOpen size={18} />} label="CRM / Network" isActive={activeTab === 'crm'} onClick={() => go('crm')} />
              <NavItem icon={<User size={18} />} label="Logins &amp; Access" isActive={activeTab === 'drivers'} onClick={() => go('drivers')} />
              <NavItem icon={<HeartPulse size={18} />} label="VIP Services" isActive={activeTab === 'vip'} onClick={() => go('vip')} />

              <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">BUSINESS</div>
              <NavItem icon={<CreditCard size={18} />} label="Expenses" isActive={activeTab === 'expenses'} onClick={() => go('expenses')} />
              <NavItem icon={<FileText size={18} />} label="Invoices" isActive={activeTab === 'invoices'} onClick={() => go('invoices')} />
              <NavItem icon={<Activity size={18} />} label="Fleet (ELD)" isActive={activeTab === 'fleet'} onClick={() => go('fleet')} />
              <NavItem icon={<GraduationCap size={18} />} label="Training" isActive={activeTab === 'training'} onClick={() => go('training')} />
              <NavItem icon={<Navigation size={18} />} label="First Load Walkthrough" isActive={activeTab === 'walkthrough'} onClick={() => go('walkthrough')} />
              <NavItem icon={<Gamepad2 size={18} />} label="Break Room" isActive={activeTab === 'breakroom'} onClick={() => go('breakroom')} />
              {isSuper && <NavItem icon={<Building size={18} />} label="Workspaces" isActive={activeTab === 'workspaces'} onClick={() => go('workspaces')} />}
              {isSuper && <NavItem icon={<User size={18} />} label="Access Requests" isActive={activeTab === 'requests'} onClick={() => go('requests')} />}
              {isSuper && <NavItem icon={<GraduationCap size={18} />} label="Course Progress" isActive={activeTab === 'courseprogress'} onClick={() => go('courseprogress')} />}
              {isSuper && <NavItem icon={<Wallet size={18} />} label="FMF Rev-Share" isActive={activeTab === 'fmfrevshare'} onClick={() => go('fmfrevshare')} />}
            </>
          ) : (
            /* ----- CARRIER / driver tools (and admin "view as") ----- */
            <>
              <div className="px-4 mb-2 text-xs font-semibold text-slate-500 tracking-wider">OVERVIEW</div>
              <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => go('dashboard')} />
              <NavItem icon={<Navigation size={18} />} label="New Authority" isActive={activeTab === 'newauthority'} onClick={() => go('newauthority')} />
              <NavItem icon={<User size={18} />} label="My Profile" isActive={activeTab === 'profile'} onClick={() => go('profile')} />
              <NavItem icon={<Calendar size={18} />} label="Schedule & Calendar" isActive={activeTab === 'schedule'} onClick={() => go('schedule')} />

              <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">LOGISTICS CORE</div>
              <NavItem icon={<Map size={18} />} label="Lane Management" isActive={activeTab === 'lanes'} onClick={() => go('lanes')} />
              <NavItem icon={<MapPin size={18} />} label="Safe Parking" isActive={activeTab === 'parking'} onClick={() => go('parking')} />
              <NavItem icon={<ShieldCheck size={18} />} label="Compliance" isActive={activeTab === 'compliance'} onClick={() => go('compliance')} />
              <NavItem icon={<FileText size={18} />} label="Agreements & W-9" isActive={activeTab === 'agreements'} onClick={() => go('agreements')} />
              <NavItem icon={<FileText size={18} />} label="Digital Vault" isActive={activeTab === 'vault'} onClick={() => go('vault')} />
              <NavItem icon={<Wallet size={18} />} label="Financial Routing" isActive={activeTab === 'financials'} onClick={() => go('financials')} />
              <NavItem icon={<Activity size={18} />} label="My CPM & Expenses" isActive={activeTab === 'mycpm'} onClick={() => go('mycpm')} />
              <NavItem icon={<CreditCard size={18} />} label="Upgrades & Credentials" isActive={activeTab === 'upgrades'} onClick={() => go('upgrades')} />

              {vipOn && (
                <>
                  <div className="px-4 mt-6 mb-2 text-xs font-semibold text-amber-500/80 tracking-wider">VIP CONCIERGE</div>
                  <NavItem icon={<HeartPulse size={18} />} label="Wellness & Diet" isActive={activeTab === 'wellness'} onClick={() => go('wellness')} />
                  <NavItem icon={<Dog size={18} />} label="Pet Logistics" isActive={activeTab === 'pets'} onClick={() => go('pets')} />
                </>
              )}

              <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">OFF THE CLOCK</div>
              <NavItem icon={<Gamepad2 size={18} />} label="Break Room" isActive={activeTab === 'breakroom'} onClick={() => go('breakroom')} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold uppercase shrink-0">
              {(user.displayName || user.email || 'D')[0]}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{user.displayName || user.email}</div>
              {user.displayName && <div className="text-[11px] text-slate-500 truncate">{user.email}</div>}
              {isAdmin ? (
                <div className="text-xs text-emerald-400">● Admin</div>
              ) : (
                <div className="flex items-center gap-1.5 -ml-0.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: myStatus === 'Available' ? '#34d399' : myStatus === 'On Break' ? '#fbbf24' : '#94a3b8' }} />
                  <select
                    value={myStatus}
                    onChange={(e) => updateMyStatus(e.target.value)}
                    title="Set your status — your dispatcher sees this"
                    className="text-xs bg-transparent border-0 focus:outline-none cursor-pointer font-medium p-0"
                    style={{ color: myStatus === 'Available' ? '#34d399' : myStatus === 'On Break' ? '#fbbf24' : '#94a3b8' }}
                  >
                    <option className="bg-slate-800 text-slate-100">Available</option>
                    <option className="bg-slate-800 text-slate-100">On Break</option>
                    <option className="bg-slate-800 text-slate-100">Off Duty</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="w-full text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1 -ml-1 text-slate-300 hover:text-white shrink-0"
              aria-label="Open menu"
            >
              <span className="block w-5 h-0.5 bg-current mb-1.5"></span>
              <span className="block w-5 h-0.5 bg-current mb-1.5"></span>
              <span className="block w-5 h-0.5 bg-current"></span>
            </button>
            <h2 className="text-lg font-medium capitalize text-slate-200 truncate">{activeTab.replace('-', ' ')}</h2>
          </div>
          <div className="flex items-center gap-3 md:gap-5 text-slate-400 shrink-0">
            {isAdmin && (
              <select
                value={viewAs ? viewAs.id : ''}
                onChange={(e) => {
                  const c = carrierOpts.find((x) => x.id === e.target.value);
                  if (c) { setViewAs({ id: c.id, uid: c.linkedDriverUid, name: c.name }); go('dashboard'); }
                  else setViewAs(null);
                }}
                className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 max-w-[150px]"
                title="View as — open a carrier's portal (read-only) to see exactly what they see, help them over the phone, approve their vault docs, or manage their agreements. Pick 'Admin (you)' to return."
              >
                <option value="">Admin (you)</option>
                {carrierOpts.map((c) => <option key={c.id} value={c.id}>View: {c.name}</option>)}
              </select>
            )}
            {isAdmin && (
              <button
                onClick={toggleGuided}
                title="Guided Mode walks new dispatchers through workflows step-by-step"
                className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${guidedMode ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'}`}
              >
                <GraduationCap size={15} />
                <span className="hidden sm:inline">Guided Mode</span>
                <span className={`w-8 h-4 rounded-full relative transition-colors ${guidedMode ? 'bg-amber-500' : 'bg-slate-600'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${guidedMode ? 'left-4' : 'left-0.5'}`} />
                </span>
              </button>
            )}
            <a href="https://forwardmotionfreight.com" target="_blank" rel="noopener noreferrer"
              className="text-sm flex items-center gap-1.5 hover:text-white transition-colors">
              ← <span className="hidden sm:inline">Back to Website</span>
            </a>
            <ThemeToggle compact />
            <button
              onClick={() => setPaletteOpen(true)}
              className="hover:text-white transition-colors"
              title="Search pages (Ctrl/Cmd+K)"
              aria-label="Open command palette"
            >
              <Search size={20} />
            </button>
            <NotificationsBell isAdmin={isAdmin && !viewAs} uid={viewUid} onNavigate={go} />
            <button onClick={() => go('settings')} className={`transition-colors ${activeTab === 'settings' ? 'text-amber-400' : 'hover:text-white'}`} title="Settings" aria-label="Settings"><Settings size={20} /></button>
          </div>
        </header>

        {viewAs && (
          <div className="bg-indigo-600 text-white px-4 md:px-8 py-2 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold truncate">👁 CARRIER VIEW — {viewAs.name}<span className="font-normal opacity-80 hidden sm:inline"> · you're seeing their portal</span></div>
            {/* go() (not bare setActiveTab) keeps the URL hash in sync — otherwise a
                refresh/back after leaving View-As resurrects the carrier-only tab. */}
            <button onClick={() => { setViewAs(null); go('dashboard'); }} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg shrink-0">Return to Admin</button>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${viewAs ? 'ring-2 ring-inset ring-indigo-600/50' : ''}`}>
          {/* keyed by tab so each view slides in fresh */}
          <div key={activeTab + '|' + (viewAs ? viewAs.id : '')} className="fm-view">
            {renderContent()}
          </div>
        </div>
      </main>

      {showTour && <TourOverlay role={isAdmin ? 'admin' : 'carrier'} onClose={closeTour} />}
      <CommandPalette open={paletteOpen} items={paletteItems} onSelect={go} onClose={() => setPaletteOpen(false)} />
      <ToastHost />
    </div>
    </GuidedModeContext.Provider>
  );
}

// Quiet inline SVG trend line — no chart library. Renders 8 weekly gross
// totals (oldest → newest) as an amber line with a soft area fill and the
// current week's point highlighted. Purely presentational, no state.
function WeeklyGrossSparkline({ weeks }) {
  const width = 220, height = 44, pad = 5;
  const max = Math.max(...weeks.map((w) => w.gross), 1);
  const stepX = (width - pad * 2) / (weeks.length - 1);
  const pts = weeks.map((w, i) => [
    pad + i * stepX,
    height - pad - (w.gross / max) * (height - pad * 2),
  ]);
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height - pad} L${pts[0][0].toFixed(1)},${height - pad} Z`;
  const [lastX, lastY] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-11" aria-hidden="true">
      <path d={area} fill="rgba(245,158,11,0.12)" stroke="none" />
      <path d={line} fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={lastX} cy={lastY} r="2.75" fill="#f59e0b" />
    </svg>
  );
}

// ---------- ADMIN: WEEKLY DISPATCH OVERVIEW ----------
function AdminWeeklyGross() {
  const [stats, setStats] = useState({ gross: 0, fee: 0, net: 0, count: 0 });
  const [weeks, setWeeks] = useState([]); // last 8 ISO weeks of delivered gross, oldest → newest
  const [loaded, setLoaded] = useState(false);

  // Monday 00:00 of the week containing `base` (defaults to today) — the same
  // Mon–Sun week boundary the headline stats have always used.
  const startOfWeek = (base) => {
    const d = base ? new Date(base) : new Date();
    const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  useEffect(() => {
    (async () => {
      try {
        // Carriers alongside loads (one extra org-scoped read) so a load
        // booked without its own feePct still resolves to the carrier's
        // actual fee instead of silently falling to the 10% default.
        const [snap, cSnap] = await Promise.all([getDocs(orgScoped('loads')), getDocs(orgScoped('carriers'))]);
        const rows = snap.docs.map((d) => d.data());
        const carrierByUid = {};
        cSnap.docs.forEach((d) => { const c = d.data(); if (c.linkedDriverUid) carrierByUid[c.linkedDriverUid] = c; });
        const sow = startOfWeek();
        let gross = 0, fee = 0, count = 0;

        // Bucket the same delivered loads by week for a trailing 8-week trend —
        // no extra reads, just another pass over the dataset we already have.
        const buckets = Array.from({ length: 8 }, (_, i) => {
          const start = new Date(sow);
          start.setDate(start.getDate() - (7 - i) * 7);
          return { ms: start.getTime(), gross: 0, count: 0 };
        });

        rows.forEach((l) => {
          const delivered = l.status === 'Delivered' || l.status === 'Cleared';
          if (!delivered || !l.delivery_date) return;
          const dDate = new Date(l.delivery_date + 'T00:00:00');
          const g = Number(l.gross_pay) || 0;

          if (dDate >= sow) {
            gross += g;
            fee += g * (loadFeePctOf(l, carrierByUid[l.uid]) / 100);
            count += 1;
          }

          const wkMs = startOfWeek(dDate).getTime();
          const bucket = buckets.find((b) => b.ms === wkMs);
          if (bucket) { bucket.gross += g; bucket.count += 1; }
        });

        setStats({ gross, fee, net: gross - fee, count });
        setWeeks(buckets);
      } catch (e) {
        console.error('Error loading admin weekly gross:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const feeUp = useCountUp(stats.fee);

  // Only show the trend once there's enough history to actually read as a
  // trend — a single data point (or none) would just look like a broken line.
  const weeksWithData = weeks.filter((w) => w.count > 0).length;
  const showSparkline = weeksWithData >= 2;
  const thisWk = weeks[weeks.length - 1];
  const lastWk = weeks[weeks.length - 2];
  const changePct = (showSparkline && lastWk && lastWk.gross > 0)
    ? ((thisWk.gross - lastWk.gross) / lastWk.gross) * 100
    : null;

  return (
    <Card className="fm-glow-hero bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white">Dispatch Overview</h2>
            <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
          </div>
          <p className="text-slate-400 mt-1">
            {loaded ? `${stats.count} load${stats.count === 1 ? '' : 's'} delivered this week across all carriers.` : 'Loading this week…'}
          </p>
        </div>
        <div className="md:text-right">
          <div className="font-data text-[10px] uppercase tracking-[0.14em] text-slate-400 mb-1">Your Dispatch Total (This Week)</div>
          <div className="font-data text-3xl font-semibold text-amber-400">{money(feeUp)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
        <StatTile label="Gross Booked" value={money(stats.gross)} />
        <StatTile label="Your Dispatch Fee" value={money(stats.fee)} accent="amber" />
        <StatTile label="Net to Carriers" value={money(stats.net)} accent="emerald" />
      </div>
      {loaded && showSparkline && (
        <div className="mt-5 pt-5 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-data text-[10px] uppercase tracking-[0.14em] text-slate-400">Weekly Gross · Last 8 Weeks</span>
              {changePct !== null && (
                <Badge tone={changePct >= 0 ? 'emerald' : 'red'} className="font-semibold">
                  {changePct >= 0 ? '▲' : '▼'} {Math.abs(changePct).toFixed(0)}% vs last week
                </Badge>
              )}
            </div>
            <WeeklyGrossSparkline weeks={weeks} />
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- ADMIN: MARKET PULSE (live feed via useMarketData, builtin fallback) ----------
// Collapsible — same pattern as MyCornerStrip: whole header is the toggle,
// chevron flips, and the choice persists. Collapsed still shows the as-of
// badge, the live trend, and the one-line blurb, so it stays glanceable.
const MP_COLLAPSED_KEY = 'fm_marketpulse_collapsed'; // display pref — deliberately global (matches fm_mycorner_collapsed), NOT per-uid

function MarketPulse() {
  const { data: p, source } = useMarketData();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(MP_COLLAPSED_KEY) !== '1'; } catch (_) { return true; }
  });
  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(MP_COLLAPSED_KEY, next ? '0' : '1'); } catch (_) {}
      return next;
    });
  };
  const trend = { up: { t: '▲ Rising', c: 'text-emerald-400' }, down: { t: '▼ Falling', c: 'text-red-400' }, flat: { t: '▬ Flat', c: 'text-slate-400' } }[p.trend] || { t: '', c: 'text-slate-400' };
  return (
    <Card className="p-0 overflow-hidden">
      <button type="button" onClick={toggleOpen} aria-expanded={open} className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-white/[0.02] transition-colors">
        <h3 className="text-base font-semibold text-white flex items-center gap-2.5 min-w-0 flex-wrap">
          <span className="w-1 h-4 shrink-0 bg-amber-500" />
          <Activity size={20} className="text-amber-500 shrink-0" />
          <span>Market Pulse</span>
          <Badge tone="slate" className="font-normal">as of {fmtMarketAsOf(p.asOf)}{source === 'builtin' ? ' · reference data' : ''}</Badge>
        </h3>
        <span className="flex items-center gap-3 shrink-0">
          <span className={`text-sm font-bold ${trend.c}`}>{trend.t}</span>
          <ChevronDown size={16} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      <p className={`text-sm text-slate-400 px-6 -mt-1 ${open ? '' : 'pb-5'}`}>{p.blurb}</p>
      {open && (
      <div className="px-6 pb-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
        <StatTile label="National Spot (all-in)" value={`$${p.spotAllIn.toFixed(2)}/mi`} accent="emerald" />
        <StatTile label="Avg Diesel" value={`$${p.dieselPerGal.toFixed(2)}/gal`} accent="amber" />
        <StatTile label="Trend" value={trend.t} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-400 mb-2">Spot Rates by Equipment</div>
          <div className="space-y-1.5">
            {p.modality.map((m) => (
              <div key={m.type} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{m.type}</span>
                <span className="text-white font-semibold">{m.rpm}{m.yoy ? <span className="text-slate-500 font-normal text-xs"> ({m.yoy})</span> : null}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-400 mb-2">Hot Lanes</div>
          <div className="space-y-1.5">
            {p.lanes.map((l) => (
              <div key={l.lane} className="flex items-center justify-between text-sm gap-2">
                <span className="text-slate-300 truncate">{l.lane}</span>
                <span className="text-amber-400 font-semibold shrink-0">{l.rpm}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <GuidedHint>Use these as your anchor on broker calls. If the broker's offer is well under the market band for that equipment, you have room to counter — don't take the first number.</GuidedHint>
      <p className="text-[10px] text-slate-600 mt-3">
        {source === 'live' && 'Estimates for guidance — pulled live from the Forward OS market feed.'}
        {source === 'cached' && 'Estimates for guidance — showing the last fetched market snapshot (feed unreachable right now).'}
        {source === 'builtin' && 'Estimates for guidance — built-in reference data; the live market feed loads automatically when reachable.'}
      </p>
      </div>
      )}
    </Card>
  );
}

// ---------- ADMIN: COACH'S CORNER (daily rotating dispatch tip) ----------
// 90 field-usable tips drawn straight from the course, SOPs, and talk tracks —
// every number in here is one the product already teaches (True RPM, the 5–10%
// fee, 2+ red flags = walk, the $75k bond, factoring 90–97%, etc.). Categories
// are interleaved so consecutive days don't repeat a theme.
const COACH_TIPS = [
  { cat: 'Negotiation', tip: 'Never take the broker’s first number. Counter once on every call, even if it’s only $50 — small bumps on every load add up to real money by Friday.' },
  { cat: 'Broker Red Flags', tip: 'The rule that saves carriers: two or more red flags = walk away. No single rate is worth an unpaid load.' },
  { cat: 'Paperwork & Pay', tip: 'No POD, no payment. The signed BOL at delivery becomes the POD — have the driver photograph it at the receiver’s dock, not at the truck stop an hour later.' },
  { cat: 'Ops Discipline', tip: 'Run the 0700 morning audit before you touch a load board: every truck loaded, rolling, and legal on HOS, and weather checked on every route. Surprises found at 0700 are fixable; at 1400 they’re fires.' },
  { cat: 'Negotiation', tip: 'Anchor above your target with a market reason: “This lane’s been running $2.75 — I can do it at $2,650 all-in.” The middle lands where you wanted; a naked high number just gets a no.' },
  { cat: 'Broker Red Flags', tip: 'Urgency is a weapon pointed at your checklist. “Cover it right now” pressure to skip vetting is exactly when you slow down and run every check.' },
  { cat: 'Growth', tip: 'Source carriers from the FMCSA SAFER database, not bought lead lists. Target the sweet spot: owner-operators with 1–3 trucks and authority older than ~6 months.' },
  { cat: 'Paperwork & Pay', tip: 'Before every RateCon goes to the driver: rate to the dollar, pickup AND delivery times, weight, detention terms. The 30-second audit prevents the most expensive mistakes in dispatch.' },
  { cat: 'Negotiation', tip: 'Before you dial, know the carrier’s break-even RPM and write down your walk-away number. If you don’t know the floor, the broker is negotiating alone.' },
  { cat: 'Ops Discipline', tip: 'Hunt loads 0800–1100 — the war-room hours when the board is freshest. By mid-afternoon the good freight is gone and you’re negotiating leftovers.' },
  { cat: 'Broker Red Flags', tip: 'A rate that’s suspiciously high for the lane is bait, not luck. Fraudsters overpay on paper to make you skip verification — the too-good number IS the red flag.' },
  { cat: 'Paperwork & Pay', tip: 'Build the proof package as the load runs — signed RateCon, timestamped check-calls, BOL, POD, lumper receipts. It’s what wins a surety-bond claim, and you can’t reconstruct it later.' },
  { cat: 'Negotiation', tip: 'True RPM = gross ÷ ALL miles, loaded plus deadhead. Say the deadhead out loud: “That’s $2.60 loaded, but I’m running 60 empty to get there — all-in it’s $2.40. I need $2,450 to make this work.”' },
  { cat: 'Broker Red Flags', tip: 'A broker emailing from gmail or yahoo instead of a corporate domain is a flag. Verify contact through the SAFER-registered company details before you send anything.' },
  { cat: 'Ops Discipline', tip: 'Close every day with the blueprint: check deliveries, map tomorrow’s moves, invoice today’s funded loads. Fifteen minutes tonight beats a chaotic 0700 tomorrow.' },
  { cat: 'Paperwork & Pay', tip: 'Make “carrier funded” your invoice trigger: the moment the factoring payment lands, your dispatch fee invoice goes out. Fee money ages badly.' },
  { cat: 'Negotiation', tip: 'Attach a broker benefit to every counter: “…and that keeps your pickup window covered with a vetted truck.” Brokers move for their problem, not yours.' },
  { cat: 'Growth', tip: 'Lead with local in every pitch: “I’m a dispatcher based out of [your city], looking for one reliable owner-operator.” Local reads as real; generic reads as spam.' },
  { cat: 'Negotiation', tip: 'After you name your number, stop talking. Silence is a negotiating tool — the first one to speak after a counter usually gives ground.' },
  { cat: 'Broker Red Flags', tip: 'Callback discipline: hang up and call the corporate number registered on FMCSA — not the number in the email signature. Fraudsters control the signature; they don’t control SAFER.' },
  { cat: 'Paperwork & Pay', tip: 'If the carrier factors, the broker needs the NOA before the load moves. A missing Notice of Assignment is how payments end up in the wrong account for weeks.' },
  { cat: 'Ops Discipline', tip: 'Never book a load in isolation — ask “where does this leave the truck, and what’s coming out of there?” One load is a rate; a sequence is a paycheck.' },
  { cat: 'Negotiation', tip: 'Open with “Where do you need to be on this one?” before you quote. Making the broker name a number first tells you how much room is really there.' },
  { cat: 'Broker Red Flags', tip: 'Before you book, confirm the $75k broker bond is active and not pending suspension on FMCSA L&I. A suspended bond means claims don’t get paid — which means your carrier doesn’t.' },
  { cat: 'Growth', tip: 'One call doesn’t land a carrier — run the sequence. Tuesday AM: the SMS pattern-interrupt (“Running or parked?”). Wednesday PM: a value-first call. Thursday: the proof-of-work close.' },
  { cat: 'Paperwork & Pay', tip: 'Detention is won at the dock: log the in-time and out-time on the BOL while the driver is sitting. Documented times get paid; “we waited a long time” doesn’t.' },
  { cat: 'Negotiation', tip: 'Flag detention at hour two, while the truck is still sitting: “In-time is documented — I’m opening a detention case now.” Detention flagged live gets paid; detention mentioned after delivery gets argued.' },
  { cat: 'Ops Discipline', tip: 'Before booking an out-and-back with a weak return, price the triangle: A→B→C→A through a strong third market usually beats a cheap backhaul on blended RPM. Run it in the TriHaul Planner.' },
  { cat: 'Broker Red Flags', tip: 'Run the broker’s MC through the factoring company before booking. If they won’t factor that broker, that’s a professional credit team telling you no for free.' },
  { cat: 'Paperwork & Pay', tip: 'Lumper fee? Get the broker’s reimbursement in writing before the driver pays it. A verbal “we’ll cover it” has no cash value.' },
  { cat: 'Negotiation', tip: 'Load canceled after dispatch? Ask for the TONU as standard, not a penalty: “My driver was already rolling — standard on a dispatched cancellation is $250. Can you get that on a confirmation?”' },
  { cat: 'Broker Red Flags', tip: 'A last-minute equipment swap or pickup-location change after you agreed on the load is a classic double-brokering sign. Stop and re-verify before the truck moves.' },
  { cat: 'Ops Discipline', tip: 'Check outbound freight before you send a truck into any market. A great inbound rate into a dead zone is a loan the backhaul makes you repay.' },
  { cat: 'Paperwork & Pay', tip: 'Know your carrier’s factoring deal cold — advances typically pay 90–97% of the invoice. Their real take-home, not the sticker gross, is what your True RPM talk should be built on.' },
  { cat: 'Negotiation', tip: 'On a lane you suspect pays more: broker transparency (49 CFR 371.3) gives you the right to the transaction records. Invoking it plus a real market number usually moves the rate — you rarely have to pull the records.' },
  { cat: 'Growth', tip: 'The strongest close removes all risk: “Don’t sign anything. Let me run the board for you tomorrow — if I beat your usual rate, I’ll text it. If not, we part as friends.”' },
  { cat: 'Negotiation', tip: 'Check Market Pulse before your first call. When the trend is up and capacity is tight, that’s your cue to counter harder — leverage has a season.' },
  { cat: 'Broker Red Flags', tip: 'A broker who refuses tracking is hiding something. Legit brokers want to know where their freight is.' },
  { cat: 'Paperwork & Pay', tip: 'Scan RateCon fine print for quick-pay deductions and late penalties before signing. Brokers don’t hide the good news in the fine print.' },
  { cat: 'Ops Discipline', tip: 'Three check-calls per load — at pickup, in transit, at delivery — logged with timestamps. They keep you ahead of problems and they’re a required layer of the proof package.' },
  { cat: 'Negotiation', tip: 'If the offer sits well under the market band for that equipment, say the band out loud: “Dry van on this lane is running $2.47–$2.80 — you’re at $2.10.” A named number beats “that’s too low.”' },
  { cat: 'Broker Red Flags', tip: 'Company name or address on SAFER doesn’t match what the broker gave you? That mismatch is a fraud flag, not a typo. Verify independently before booking.' },
  { cat: 'Growth', tip: 'Interview before you pitch. Qualify authority, factoring, and equipment; get their floor RPM, home base, and no-go states; then ask “what’s the most frustrating part of your day out there?” — and pitch straight at the answer.' },
  { cat: 'Paperwork & Pay', tip: 'File every document against its load in the Vault the day you get it. An organized vault turns a 30-minute broker setup into a 3-minute one — and speed wins loads.' },
  { cat: 'Negotiation', tip: 'Trade things that cost you nothing: a flexible pickup window, extra tracking updates, a guaranteed on-time truck. Every one of them is worth dollars on the rate.' },
  { cat: 'Ops Discipline', tip: 'Keep each carrier’s floor RPM, home base, and no-go states written where you dispatch from. Guessing a driver’s floor mid-call is how bad loads get booked.' },
  { cat: 'Broker Red Flags', tip: 'Add the suspended-broker list to your routine: it’s a 30-second FMCSA check that catches brokers whose authority already died.' },
  { cat: 'Paperwork & Pay', tip: 'Complete the carrier packet before load one: W-9, MC authority letter, COI, NOA. Chasing paperwork with a truck already loaded is how deadlines and payments get missed.' },
  { cat: 'Negotiation', tip: 'Settle accessorials before you settle the linehaul: “Who covers the lumper? What’s detention after the two free hours?” Those answers are cheap now and expensive later.' },
  { cat: 'Broker Red Flags', tip: 'Save every vetting run in Broker Check. If a load ever goes sideways, a timestamped record showing you checked authority, bond, and flags is your defense.' },
  { cat: 'Ops Discipline', tip: 'Route around the driver’s life — safe parking, decent food, home time. A driver who feels planned-for doesn’t take his truck to another dispatcher.' },
  { cat: 'Paperwork & Pay', tip: 'Verify the COI with the issuing agent, not by admiring the PDF. Fake certificates look exactly like real ones — the agent’s phone number is the only test that counts.' },
  { cat: 'Negotiation', tip: 'Counter with a specific number like $2,485, not a round $2,500. Odd numbers read like math you’ve done, and math is harder to argue with than haggling.' },
  { cat: 'Growth', tip: 'Big brokers block new MCs for ~90 days — that’s a stranded market nobody serves. Build a list of day-one-friendly brokers and become the dispatcher who keeps new authorities moving.' },
  { cat: 'Negotiation', tip: 'One counter per number: never lower your own offer before the broker has responded to it. If you drop from $2,600 to $2,450 unprompted, you just negotiated against yourself.' },
  { cat: 'Broker Red Flags', tip: 'Test the hands-off broker: ask a shipper-specific question they should know — dock hours, pallet count. A “broker” with no answers may not control the freight at all.' },
  { cat: 'Paperwork & Pay', tip: 'Get listed as a certificate holder on your carrier’s insurance. Then you find out about a coverage lapse from the insurer — not from a broker rejecting your truck at booking.' },
  { cat: 'Ops Discipline', tip: 'Check remaining HOS before you commit to any pickup window. A perfect rate the driver can’t legally cover is a service failure with your name on it.' },
  { cat: 'Negotiation', tip: '“Can you do any better?” invites a no. “I can do it at $2,400 all-in” invites a yes. Always counter with a number, never with a question about their generosity.' },
  { cat: 'Broker Red Flags', tip: 'A brand-new broker MC gets the full checklist, not the benefit of the doubt. New authority isn’t automatically bad — but it earns zero shortcuts.' },
  { cat: 'Growth', tip: 'Price your fee at 5–10% of gross and sell it as ROI, not cost: “If I don’t make you more than I cost you, fire me.” Then make the numbers prove it every week.' },
  { cat: 'Paperwork & Pay', tip: 'Know the detention terms before pickup: the free window (usually 2 hours) and the hourly rate should be on the RateCon. If it’s not in writing, it’s a fight.' },
  { cat: 'Negotiation', tip: 'When a broker says “that’s all the load pays,” move to the edges: fuel surcharge, detention rate, drop fee. Money hides outside the linehaul.' },
  { cat: 'Ops Discipline', tip: 'If it’s not in the system, it doesn’t exist. Every load, document, and carrier note goes in the TMS — the load you’re tracking in your head is the one that goes wrong.' },
  { cat: 'Broker Red Flags', tip: 'Screenshot the SAFER and L&I pages when you book. In a bond claim, what matters is the broker’s status at time of booking — prove it with a timestamp, not a memory.' },
  { cat: 'Paperwork & Pay', tip: 'If the freight scales heavier than the RateCon says, call the broker before the truck leaves the shipper. Weight discrepancies resolved on-site get paid; discovered at delivery, they get argued.' },
  { cat: 'Negotiation', tip: 'After a good load, ask the broker: “What other lanes do you cover weekly?” One repeat broker relationship is worth more than ten load-board wins.' },
  { cat: 'Broker Red Flags', tip: 'Any broker who asks your carrier to route payment outside the factoring flow or “skip the NOA this once” is a walk-away. The NOA is how the money finds its way home.' },
  { cat: 'Ops Discipline', tip: 'Batch your admin into the 1100–1300 block — broker setups, RateCon audits, detention disputes. Don’t let paperwork eat the morning hours when the rates are on the phone.' },
  { cat: 'Paperwork & Pay', tip: 'Save the executed RateCon the moment it’s signed — into the Vault, against the load. It’s your binding agreement and your evidence, and it should never live only in an inbox.' },
  { cat: 'Negotiation', tip: 'Decline below-floor freight with the door open: “Can’t make it work at $1,900, but call me first when this lane pays $2,300+.” You want to be the number they save.' },
  { cat: 'Growth', tip: 'For inbound leads: 9:16 vertical video, premium and professional tone, posted consistently. Consistency beats one viral hit — brand is a compounding asset.' },
  { cat: 'Negotiation', tip: 'Flexibility is currency: “I can do your number if pickup slides to tomorrow morning.” If the rate won’t move, move the schedule and charge for the convenience.' },
  { cat: 'Broker Red Flags', tip: 'Before every RateCon: confirm the broker MC on the document matches the MC you vetted. Document swaps are how double-brokers slip a different company under your signature.' },
  { cat: 'Paperwork & Pay', tip: 'When a broker runs multiple warehouses, check the exact pickup address against what the driver expects. Right company, wrong city is a classic missed-pickup story.' },
  { cat: 'Ops Discipline', tip: 'A delivered truck should have its reload conversation within the hour. Empty trucks lose money by the hour, and afternoon boards only get thinner.' },
  { cat: 'Negotiation', tip: 'Before a big call, run one rep in Practice Broker Call. A counter you’ve already said out loud comes out clean under pressure.' },
  { cat: 'Broker Red Flags', tip: 'Phone deal with one company, RateCon from another name or MC? That’s a re-broker sign. Stop and verify who actually controls this load before anyone signs.' },
  { cat: 'Growth', tip: 'Your best lead source is a happy carrier. After a strong week, ask: “Who else do you run with who could use numbers like this?” Owner-operators travel in packs.' },
  { cat: 'Paperwork & Pay', tip: 'Double-check both MC numbers on every RateCon — the broker’s and your carrier’s. A wrong MC can stall a factoring payment cold.' },
  { cat: 'Negotiation', tip: 'Quote and confirm all-in: “$2,450 all-in, fuel included.” Then check that exact phrase appears on the RateCon — “plus fuel” and “all-in” are very different loads.' },
  { cat: 'Ops Discipline', tip: 'Audit every truck against tomorrow, not just today: who delivers tomorrow, where, and what’s the plan from there? Dispatchers who work 48 hours ahead are the ones who sound calm on the phone.' },
  { cat: 'Broker Red Flags', tip: 'Fraud calls are warm and friendly by design. Charm is not a check — run the same six checks on every new broker, no matter how good the call felt.' },
  { cat: 'Paperwork & Pay', tip: 'Never let the truck roll before the signed RateCon comes back. No signed RateCon means no binding rate and no proof for payment — everything after that is a favor.' },
  { cat: 'Negotiation', tip: 'Offer ~20¢/mi under the floor? Use the anchor line: “My carrier’s floor on this lane is $2.30/mi — after deadhead I can do it at $1,750 all-in and keep your pickup on time.”' },
  { cat: 'Broker Red Flags', tip: 'When anything feels off, the move is always the same: hang up, look up the registered number yourself, call back. Independent verification kills most scams in one step.' },
  { cat: 'Ops Discipline', tip: 'Run the SOP every time, even when you “know” the answer. The dispatchers who win aren’t the smartest — they’re the ones who run their checklists every single day.' },
  { cat: 'Paperwork & Pay', tip: 'End the delivery day with the money motion: signed RateCon + signed POD + invoice (plus lumper receipts) to the factoring company same day. Every day you sit on a POD is a day the carrier waits to get paid.' },
  { cat: 'Negotiation', tip: 'Run the True RPM math before you answer, not after. $1,650 on 750 miles is $2.20 — against a $2.30 floor, that’s a counter, not a booking.' },
  { cat: 'Growth', tip: 'Memorize your value sentence: higher rates, fewer empty miles, zero paperwork stress. Say that — not “I find loads.” Every owner-operator has met a hundred load-finders.' },
];

const COACH_HIDE_KEY = 'fm_coach_hide';

function CoachCorner() {
  // Deterministic daily pick — local Y/M/D midnights diffed and rounded, the
  // same DST-safe technique as Freight Five's ffDayNumber. No Math.random.
  const dayIdx = React.useMemo(() => {
    const d = new Date();
    const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(2026, 0, 1)) / 86400000);
    return ((days % COACH_TIPS.length) + COACH_TIPS.length) % COACH_TIPS.length;
  }, []);
  // "Next tip" previews ahead locally; a reload resets to the day's canonical tip.
  const [offset, setOffset] = useState(0);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(uidKey(COACH_HIDE_KEY)) === ffLocalDateStr(); } catch (_) { return false; }
  });
  if (hidden) return null;
  const t = COACH_TIPS[(dayIdx + offset) % COACH_TIPS.length];
  const tone = { 'Negotiation': 'amber', 'Broker Red Flags': 'red', 'Paperwork & Pay': 'emerald', 'Ops Discipline': 'blue', 'Growth': 'indigo' }[t.cat] || 'slate';
  const dismiss = () => {
    try { localStorage.setItem(uidKey(COACH_HIDE_KEY), ffLocalDateStr()); } catch (_) {}
    setHidden(true); // returns tomorrow — the key only matches today's date
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-data text-[10px] uppercase tracking-[0.14em] text-slate-500">Coach’s Corner · Day {dayIdx + 1}{offset > 0 ? ' · preview' : ''}</span>
          <Badge tone={tone} className="text-[10px] px-2 py-0.5">{t.cat}</Badge>
        </div>
        <button type="button" onClick={dismiss} aria-label="Hide today’s tip"
          className="shrink-0 -mt-1 -mr-1 p-1 text-slate-600 hover:text-slate-300 transition-colors leading-none text-base">×</button>
      </div>
      <p className="text-sm text-slate-200 leading-relaxed mt-2">{t.tip}</p>
      <button type="button" onClick={() => setOffset((o) => o + 1)}
        className="mt-2 text-xs text-slate-500 hover:text-amber-400 transition-colors">next tip →</button>
    </Card>
  );
}

// ---------- ADMIN: GET YOUR FIRST LOAD OUT ----------
// A day-one dispatcher lands on an empty dashboard of zeros — this gives them
// an actual next step. Disappears the moment they have any loads (they're
// rolling and don't need hand-holding anymore).
function AdminGettingStarted({ onNavigate }) {
  const [counts, setCounts] = useState(null);
  useEffect(() => { (async () => {
    try {
      const [cSnap, lSnap] = await Promise.all([getDocs(orgScoped('carriers')), getDocs(orgScoped('loads'))]);
      setCounts({ carriers: cSnap.size, loads: lSnap.size });
    } catch (_) { setCounts({ carriers: 0, loads: 0 }); }
  })(); }, []);
  if (!counts || counts.loads > 0) return null;
  const steps = [
    { done: counts.carriers > 0, label: 'Add your first carrier', desc: 'Save an owner-operator (and create their portal login) in Carriers & Access.', tab: 'carriers', cta: 'Add a carrier' },
    { done: false, label: 'Price your first load', desc: 'Open the Rate Calculator, pick your carrier, and run the numbers — you’ll see your dispatch fee and True RPM.', tab: 'calc', cta: 'Open Rate Calculator' },
    { done: false, label: 'Send it as an offer', desc: 'From the calculator, “Send as Offer” — the carrier gets an alert to accept or decline.', tab: 'calc', cta: 'Price & send' },
  ];
  return (
    <Card className="p-6 border-amber-500/30">
      <div className="flex items-center gap-2 mb-1"><span className="text-amber-400">🚀</span><h3 className="font-bold text-white">Get your first load out</h3></div>
      <p className="text-sm text-slate-400 mb-4">Three steps to your first booked load. This card disappears once you’ve got loads moving.</p>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <button key={i} type="button" onClick={() => onNavigate && onNavigate(s.tab)}
            className="w-full flex items-start gap-3 text-left rounded-lg border border-slate-800 hover:border-amber-500/40 hover:bg-slate-800/40 p-3 transition-colors">
            <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[11px] ${s.done ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-600 text-slate-500'}`}>{s.done ? '✓' : i + 1}</span>
            <span className="min-w-0">
              <span className={`text-sm font-semibold ${s.done ? 'text-slate-400 line-through' : 'text-white'}`}>{s.label}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{s.desc}</span>
            </span>
            <span className="ml-auto shrink-0 text-xs text-amber-400 self-center">{s.cta} →</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// ---------- ADMIN: ACTIVE LOADS AT A GLANCE (live, collapsible) ----------
// Compact list of everything currently moving — same collapse pattern as
// Market Pulse / My Corner (whole header toggles, chevron flips, choice
// persists) but COLLAPSED by default so it never dominates: the header always
// shows the live count (and pending-offer badge), which is the glanceable bit.
const AL_COLLAPSED_KEY = 'fm_activeloads_collapsed'; // display pref — deliberately global, NOT per-uid

function AdminActiveLoads({ onNavigate }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(AL_COLLAPSED_KEY) === '0'; } catch (_) { return false; }
  });
  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem(AL_COLLAPSED_KEY, next ? '0' : '1'); } catch (_) {}
      return next;
    });
  };
  const [loads, setLoads] = useState(null); // null = loading
  const [names, setNames] = useState({}); // uid → carrier name (else login email)

  // One-shot name map — carrier profile names read nicer than raw emails.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [uSnap, cSnap] = await Promise.all([getDocs(orgScoped('users')), getDocs(orgScoped('carriers'))]);
        if (!live) return;
        const map = {};
        uSnap.docs.forEach((d) => { map[d.id] = d.data().email || d.id; });
        cSnap.docs.forEach((d) => { const c = d.data(); if (c.linkedDriverUid && c.name) map[c.linkedDriverUid] = c.name; });
        setNames(map);
      } catch (_) { /* names are best-effort — rows fall back to "Carrier" */ }
    })();
    return () => { live = false; };
  }, []);

  // LIVE loads — an accept/decline/status change updates the count and rows
  // without a refresh (getDocs fallback if the listener errors).
  useEffect(() => {
    const unsub = onSnapshot(
      orgScoped('loads'),
      (snap) => setLoads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      async (e) => {
        console.error('active-loads live listener failed', e);
        try { const snap = await getDocs(orgScoped('loads')); setLoads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); } catch (_) { setLoads([]); }
      }
    );
    return () => unsub();
  }, []);

  const rows = (loads || [])
    .filter((l) => l.status !== 'Delivered' && l.status !== 'Cleared' && l.offerStatus !== 'declined')
    .sort((a, b) => (a.delivery_date || '9999').localeCompare(b.delivery_date || '9999'));
  const offersOut = rows.filter((l) => l.offerStatus === 'pending').length;

  // Nothing moving (and not still loading) — skip the card entirely; the
  // "Get your first load out" checklist covers the true zero state.
  if (loads !== null && rows.length === 0) return null;

  const stateBadge = (l) => {
    if (l.offerStatus === 'pending') return <Badge tone="amber">Offer out</Badge>;
    if (l.status === 'In Transit') return <Badge tone="blue">In Transit</Badge>;
    if (l.status === 'Dispatched') return <Badge tone="amber">Dispatched</Badge>;
    return <Badge tone="slate">{l.status || '—'}</Badge>;
  };
  const shown = rows.slice(0, 8);

  return (
    <Card className="p-0 overflow-hidden">
      <button type="button" onClick={toggleOpen} aria-expanded={open} className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-white/[0.02] transition-colors">
        <h3 className="text-base font-semibold text-white flex items-center gap-2.5 min-w-0 flex-wrap">
          <span className="w-1 h-4 shrink-0 bg-amber-500" />
          <Navigation size={20} className="text-amber-500 shrink-0" />
          <span>Active Loads{loads === null ? '' : ` (${rows.length})`}</span>
          {offersOut > 0 && <Badge tone="amber" className="font-semibold">{offersOut} offer{offersOut === 1 ? '' : 's'} awaiting</Badge>}
        </h3>
        <ChevronDown size={16} className={`text-slate-500 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-6 pb-6">
          {loads === null ? (
            <SkelRows rows={2} />
          ) : (
            <div className="space-y-2">
              {shown.map((l) => (
                <button key={l.id} type="button" onClick={() => onNavigate && onNavigate('allloads')}
                  className="w-full flex items-center gap-3 text-left rounded-lg border border-slate-800 hover:border-amber-500/40 hover:bg-slate-800/40 px-3 py-2.5 transition-colors"
                  title="Open in All Loads">
                  <span className="font-mono text-amber-500 text-xs font-bold shrink-0">{l.loadId || '—'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-200 truncate">{l.origin || '—'} → {l.destination || '—'}</span>
                    <span className="block text-[11px] text-slate-500 truncate">{names[l.uid] || 'Carrier'}{l.delivery_date ? ` · del ${l.delivery_date}` : ''}</span>
                  </span>
                  <span className="shrink-0">{stateBadge(l)}</span>
                </button>
              ))}
              <div className="flex items-center justify-between gap-3 pt-1">
                {rows.length > shown.length ? <span className="text-xs text-slate-500">+{rows.length - shown.length} more</span> : <span />}
                <button type="button" onClick={() => onNavigate && onNavigate('allloads')} className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors">Open All Loads →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- ADMIN: INDEPENDENT WORKSPACE "MAKE IT YOURS" NUDGE ----------
// Soft, dismissible checklist for INDEPENDENT dispatchers (never FMF — they
// run under FMF branding — and never super-admin, gated at the call site):
// company name, dispatch phone, and the carrier agreement/LPOA text are what
// make their carrier-facing docs and emails theirs. Modeled on the carrier
// setup checklist — a nudge, not a gate; independents are never blocked.
function IndieBrandingSetup({ onNavigate }) {
  const dismissKey = 'fm_brandsetup_dismissed_' + (ACTIVE_ORG || 'org');
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(dismissKey) === '1'; } catch (_) { return false; } });
  const [org, setOrg] = useState(null);
  useEffect(() => {
    if (!ACTIVE_ORG) return;
    let live = true;
    (async () => {
      try { const s = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (live && s.exists()) setOrg(s.data()); }
      catch (_) { /* nudge is best-effort */ }
    })();
    return () => { live = false; };
  }, []);
  if (dismissed || !ACTIVE_ORG || !org || org.orgType === 'fmf') return null;

  const items = [
    { key: 'name', done: !!(org.name || '').trim(), label: 'Set your company / legal business name', desc: 'The "Dispatcher" party on every carrier agreement, offer email, and login invite.' },
    { key: 'phone', done: !!(org.dispatchPhone || '').trim(), label: 'Add your dispatch phone', desc: 'What carriers dial when they tap "Call Dispatcher" on a load offer.' },
    { key: 'agr', done: !!((org.agreementText || '').trim() || (org.lpoaText || '').trim()), label: 'Review your carrier Dispatch Agreement & LPOA', desc: 'Carriers e-sign these under your name — amend the built-in text or paste your own.' },
  ];
  if (items.every((i) => i.done)) return null;
  const dismiss = () => { setDismissed(true); try { localStorage.setItem(dismissKey, '1'); } catch (_) {} };

  return (
    <Card className="p-6 border-amber-500/30">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2"><span className="text-amber-400">🏷</span><h3 className="font-bold text-white">Make this workspace yours</h3></div>
        <button type="button" onClick={dismiss} aria-label="Dismiss this checklist" title="Dismiss — you can finish these in Settings anytime"
          className="text-slate-500 hover:text-slate-300 transition-colors -mt-1 -mr-1 p-1">✕</button>
      </div>
      <p className="text-sm text-slate-400 mb-4">Your carriers see <em>your</em> business on their agreements, offers, and emails — a few one-time settings put your name on all of it. This card disappears once they're set (or dismiss it and finish in Settings anytime).</p>
      <div className="space-y-3">
        {items.map((s, i) => (
          <button key={s.key} type="button" onClick={() => onNavigate && onNavigate('settings')}
            className="w-full flex items-start gap-3 text-left rounded-lg border border-slate-800 hover:border-amber-500/40 hover:bg-slate-800/40 p-3 transition-colors">
            <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[11px] ${s.done ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-slate-600 text-slate-500'}`}>{s.done ? '✓' : i + 1}</span>
            <span className="min-w-0">
              <span className={`text-sm font-semibold ${s.done ? 'text-slate-400 line-through' : 'text-white'}`}>{s.label}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{s.desc}</span>
            </span>
            <span className="ml-auto shrink-0 text-xs text-amber-400 self-center">Settings →</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-4">Want your logo across the portal and carrier emails instead of your name? That's the Authority tier — message Forward OS and we'll attach it to your workspace.</p>
    </Card>
  );
}

// ---------- DASHBOARD ----------
function DashboardView({ uid, displayName, isAdmin, isSuper = false, vipOn = true, onNavigate, myStatus = 'Available', onSetStatus, vipRequested = false, onRequestVip, onCancelVip, showAgreementGate = false }) {
  const u = auth.currentUser;
  const targetUid = uid || (u && u.uid);
  const [earnings, setEarnings] = useState(0);
  const [active, setActive] = useState(null);
  const [pendingOffer, setPendingOffer] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [setup, setSetup] = useState(null); // carrier onboarding checklist state

  // Carrier getting-started checklist: read their own user + vault docs once.
  useEffect(() => {
    if (isAdmin || !targetUid) return;
    (async () => {
      try {
        const [uSnap, vSnap] = await Promise.all([
          getDoc(doc(db, 'users', targetUid)),
          getDocs(query(collection(db, 'vault_docs'), where('uid', '==', targetUid))),
        ]);
        const d = uSnap.exists() ? uSnap.data() : {};
        // Profile actually saves hours to hosSelf.driveAvail — carrierProfile
        // is a legacy/alternate source, so accept either or the checklist
        // item can never complete even after a driver fills in their hours.
        const driveAvailVal = d.hosSelf && d.hosSelf.driveAvail !== undefined && d.hosSelf.driveAvail !== ''
          ? d.hosSelf.driveAvail
          : (d.carrierProfile && d.carrierProfile.driveAvail);
        const hos = driveAvailVal !== undefined && driveAvailVal !== null && driveAvailVal !== '';
        setSetup({
          w9: !!(d.w9 && d.w9.legalName),
          agreements: !!d.dispatchAgreement && !!d.lpoa && !(d.resignRequest && (d.resignRequest.dispatchAgreement || d.resignRequest.lpoa)),
          hos: !!hos,
          docs: vSnap.size > 0,
        });
      } catch (_) { /* checklist is best-effort */ }
    })();
  }, [isAdmin, targetUid]);

  const prettyName = (handle) =>
    handle.replace(/[0-9]/g, '')
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const name = displayName || u?.displayName || (u?.email ? prettyName(u.email.split('@')[0]) : 'Driver');
  const greet = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; })();

  const startOfWeek = () => {
    const d = new Date();
    const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Compute dashboard state from the carrier's loads (shared by the live
  // listener and the manual refresh callback).
  const applyLoads = React.useCallback((rows) => {
    // A load awaiting the driver's accept/decline overrides the dashboard.
    setPendingOffer(rows.find((l) => l.offerStatus === 'pending') || null);
    const pending = rows
      .filter((l) => l.status !== 'Delivered' && l.status !== 'Cleared' && l.offerStatus !== 'pending' && l.offerStatus !== 'declined')
      .sort((a, b) => (a.delivery_date || '').localeCompare(b.delivery_date || ''));
    setActive(pending[0] || null);
    const sow = startOfWeek();
    const total = rows.reduce((sum, l) => {
      const delivered = l.status === 'Delivered' || l.status === 'Cleared';
      const inWeek = l.delivery_date && new Date(l.delivery_date + 'T00:00:00') >= sow;
      return delivered && inWeek ? sum + (Number(l.gross_pay) || 0) : sum;
    }, 0);
    setEarnings(total);
    setLoaded(true);
  }, []);

  const fetchData = React.useCallback(async () => {
    if (!targetUid || isAdmin) return;
    try {
      const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', targetUid)));
      applyLoads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('Error loading dashboard:', e); setLoaded(true); }
  }, [targetUid, isAdmin, applyLoads]);

  // LIVE: a new offer, an accepted/declined change, or a delivered load shows
  // up on the carrier's dashboard the instant it happens — no refresh needed.
  useEffect(() => {
    if (!targetUid || isAdmin) return;
    const unsub = onSnapshot(
      query(collection(db, 'loads'), where('uid', '==', targetUid)),
      (snap) => applyLoads(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => { console.error('dashboard live listener failed', e); fetchData(); }
    );
    return () => unsub();
  }, [targetUid, isAdmin, applyLoads, fetchData]);

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const earnUp = useCountUp(earnings);

  // Greeting subline driven by availability (and the active load). When real
  // ELD/HOS data is connected, swap in the live "drive hours remaining" here.
  const statusLine = (() => {
    if (myStatus === 'Off Duty') return "You're off duty — your dispatcher won't assign loads. We'll have freight ready when you're back.";
    if (myStatus === 'On Break') return "On a break. New load offers are paused until you set yourself Available again.";
    if (active) return "You're rolling on an active load. Drive safe — we've got the paperwork and back office covered.";
    return "You're marked Available and we're hunting your next high-paying load.";
  })();

  const statusBadge = (s) => {
    if (s === 'In Transit') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (s === 'Delivered' || s === 'Cleared') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  };

  // A pending offer takes over the driver's whole dashboard until they respond.
  if (!isAdmin && pendingOffer) {
    return <PendingOfferScreen offer={pendingOffer} onResolved={fetchData} />;
  }

  return (
    <div className="space-y-6">
      {/* The one sanctioned Haul Buddy appearance outside the Break Room —
          see HaulBuddyDashboardPeek for the mood/frequency gating. SUPER-ONLY
          for now (Haul Buddy hasn't rolled out to workspaces yet), and never
          rendered during an admin's "View As" session: displayName is only
          ever passed in that case (see the comment on MyCornerStrip below). */}
      {isSuper && !displayName && <HaulBuddyDashboardPeek onNavigate={onNavigate} />}
      {isAdmin && showAgreementGate && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="text-amber-400 text-lg shrink-0">✍️</span>
            <div className="min-w-0">
              <div className="font-bold text-white">Sign your dispatcher agreement to go live</div>
              <p className="text-xs text-amber-200/80 mt-0.5">You can look around, but you can’t book real freight until your Forward Motion Freight revenue-share agreement is signed.</p>
            </div>
          </div>
          <button onClick={() => onNavigate && onNavigate('fmfagreement')}
            className="text-xs px-4 py-2 rounded-lg font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 shrink-0">Review &amp; sign →</button>
        </Card>
      )}
      {isAdmin && (
        <div>
          <h2 className="text-2xl font-bold text-white">{greet}, {name}.</h2>
          <p className="text-slate-400 text-sm mt-0.5">Here’s your deal desk. Let’s move some freight.</p>
        </div>
      )}
      {isAdmin && <MyCornerStrip />}
      {isAdmin && <AdminGettingStarted onNavigate={onNavigate} />}
      {/* Independent-workspace branding nudge — never FMF (checked inside via
          orgType) and never super-admin (gated here). */}
      {isAdmin && !isSuper && <IndieBrandingSetup onNavigate={onNavigate} />}
      {isAdmin && <AdminWeeklyGross />}
      {isAdmin && <AdminActiveLoads onNavigate={onNavigate} />}
      {isAdmin && <MarketPulse />}
      {isAdmin && <CoachCorner />}

      {!isAdmin && (
        <Card className="fm-glow-hero bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50 p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{myStatus === 'Off Duty' ? `Rest up, ${name}.` : myStatus === 'On Break' ? `Enjoy the break, ${name}.` : `Safe travels, ${name}.`}</h2>
            <p className="text-slate-400">{statusLine}</p>
            <div className="mt-3"><GuidedHint>This is the carrier’s home screen — active load, weekly earnings, and VIP updates. A pending offer takes over this screen until they accept or decline.</GuidedHint></div>
          </div>
          <div className="md:text-right">
            <div className="font-data text-[10px] uppercase tracking-[0.14em] text-slate-400 mb-1">Gross Earnings (This Week)</div>
            <div className="font-data text-3xl font-semibold text-emerald-400">{money(earnUp)}</div>
            <div className="text-[11px] text-slate-500 mt-1 md:max-w-[220px] md:ml-auto">You collect from your dispatcher (factoring or direct) — see <button onClick={() => onNavigate && onNavigate('financials')} className="text-amber-400 hover:underline">Financial Routing</button>.</div>
          </div>
        </Card>
      )}

      {/* Carrier getting-started checklist — only while something's incomplete. */}
      {!isAdmin && setup && !(setup.w9 && setup.agreements && setup.hos && setup.docs) && (
        <Card className="p-5 border-amber-500/30">
          <div className="flex items-center gap-2 mb-1"><span className="text-amber-400">🚀</span><h3 className="font-bold text-white">Finish setting up your profile</h3></div>
          <p className="text-xs text-slate-400 mb-3">A few one-time steps so your dispatcher can start booking you loads.</p>
          <div className="space-y-2">
            {[
              ['w9', 'Complete your W-9', 'agreements'],
              ['agreements', 'Sign your Dispatch Agreement & Power of Attorney', 'agreements'],
              ['hos', 'Set your Hours of Service', 'profile'],
              ['docs', 'Upload your documents (Authority, COI, NOA) to the Vault', 'vault'],
            ].map(([key, label, tab]) => (
              <button key={key} onClick={() => onNavigate && onNavigate(tab)}
                className="w-full flex items-center gap-3 text-left text-sm rounded-md px-3 py-2 hover:bg-white/5 transition-colors">
                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${setup[key] ? 'bg-emerald-500/20 text-emerald-400' : 'border border-slate-600 text-slate-500'}`}>{setup[key] ? '✓' : ''}</span>
                <span className={setup[key] ? 'text-slate-500 line-through' : 'text-slate-200'}>{label}</span>
                {!setup[key] && <span className="ml-auto text-xs text-amber-400 shrink-0">Do it →</span>}
              </button>
            ))}
          </div>
        </Card>
      )}

      {!isAdmin && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: myStatus === 'Available' ? '#34d399' : myStatus === 'On Break' ? '#fbbf24' : '#94a3b8' }} />
            <span className="text-sm text-slate-400">My status:</span>
            <select value={myStatus} onChange={(e) => onSetStatus && onSetStatus(e.target.value)}
              className="text-sm bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer">
              <option>Available</option>
              <option>On Break</option>
              <option>Off Duty</option>
            </select>
          </div>
          <span className="text-xs text-slate-500">Your dispatcher sees this when matching you to loads.</span>
        </Card>
      )}

      {/* Skipped during an admin's "View As" session (displayName is only
          passed in that case) — this is the signed-in person's own private
          corner, never the carrier being viewed. */}
      {!isAdmin && !displayName && <MyCornerStrip />}

      <QuoteOfTheDay forDispatcher={isAdmin} />

      {!isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6">
            <PanelHeader
              className="mb-6"
              icon={<Map size={20} />}
              accent="blue"
              title="Active Load"
              action={active ? <Badge tone={active.status === 'In Transit' ? 'blue' : (active.status === 'Delivered' || active.status === 'Cleared') ? 'emerald' : 'amber'}>{active.status}</Badge> : null}
            />

            {!loaded ? (
              <SkelRows rows={2} />
            ) : !active ? (
              <div className="text-slate-500 text-sm py-4">No active load right now. Your dispatcher will assign one shortly.</div>
            ) : (
              <button type="button" onClick={() => onNavigate && onNavigate('lanes')}
                className="w-full text-left space-y-3 group/al rounded-lg -m-1 p-1 hover:bg-white/[0.02] transition-colors"
                title="Open in Lane Management">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-amber-500 font-bold text-sm">{active.loadId || '—'}</span>
                  <span className="text-sm font-bold text-emerald-400">{money(active.gross_pay)}</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-700 bg-slate-800">
                  <div className="text-xs text-slate-400">Origin</div>
                  <div className="font-semibold">{active.origin || '—'}</div>
                </div>
                <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                  <div className="text-xs text-slate-400">
                    Destination{active.delivery_time ? ` (ETA: ${active.delivery_time})` : active.delivery_date ? ` (by ${active.delivery_date})` : ''}
                  </div>
                  <div className="font-semibold text-slate-300">{active.destination || '—'}</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 pt-1">
                  Open in Lane Management
                  <span className="transition-transform group-hover/al:translate-x-1">→</span>
                </div>
              </button>
            )}
          </Card>

          {vipOn ? (
          <Card className="p-6">
            <PanelHeader
              className="mb-6"
              icon={<HeartPulse size={20} />}
              title="VIP Concierge Updates"
              badge={<Badge tone="slate" className="font-normal">Examples</Badge>}
            />
            <div className="space-y-3">
              <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg"><Dog size={20} /></div>
                <div>
                  <div className="font-semibold text-sm">Fresh Pet Food Delivery Scheduled</div>
                  <div className="text-xs text-slate-400 mt-1">Lady's fresh meals have been rerouted to your Dallas drop-off terminal tomorrow morning.</div>
                </div>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><Activity size={20} /></div>
                <div>
                  <div className="font-semibold text-sm">Gym Access Authorized</div>
                  <div className="text-xs text-slate-400 mt-1">Found a rig-friendly spot 0.2mi from 'Power House Gym' on your I-20 route. Added to your GPS.</div>
                </div>
              </div>
            </div>
          </Card>
          ) : (
          <VipUpsellCard requested={vipRequested} onRequest={onRequestVip} onCancel={onCancelVip} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------- DASHBOARD: "MY CORNER" (private notepad + weekly goal) ----------
// Deliberately quiet and personal — not a work widget. Always keyed off the
// ACTUAL signed-in user (auth.currentUser), never a `uid` prop, so it can
// never be pulled up under an admin's "View As" impersonation of a carrier.
// Storage lives at users/{uid}/private/mycorner — an owner-only subcollection
// (enforced by rules) so "just for you" is a real guarantee, not just a UI
// promise. Legacy data may still be sitting on the old users/{uid}.myCorner
// field from before that rule existed; on load, if the new location is
// empty, fall back to reading the legacy field once, and best-effort clear
// it after the next successful save to the new location.
function MyCornerStrip() {
  const u = auth.currentUser;
  const uid = u && u.uid;

  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('fm_mycorner_collapsed') !== '1'; } catch (_) { return true; }
  });
  const [notes, setNotes] = useState('');
  const [goal, setGoal] = useState('');
  const [goalDone, setGoalDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [legacyToClear, setLegacyToClear] = useState(false); // true once we've read from the old field and should sweep it up on next save

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const privSnap = await getDoc(doc(db, 'users', uid, 'private', 'mycorner'));
        let mc = privSnap.exists() ? privSnap.data() : null;
        if (!mc) {
          // One-time migration read: nothing at the new location yet — check
          // the pre-rule legacy field on the user doc itself.
          try {
            const uSnap = await getDoc(doc(db, 'users', uid));
            const legacy = uSnap.exists() ? uSnap.data().myCorner : null;
            if (legacy) { mc = legacy; setLegacyToClear(true); }
          } catch (_) { /* legacy read is best-effort */ }
        }
        if (mc) {
          setNotes(mc.notes || '');
          setGoal(mc.goal || '');
          setGoalDone(!!mc.goalDone);
        }
      } catch (e) { console.error('My Corner load failed', e); }
    })();
  }, [uid]);

  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o;
      try { localStorage.setItem('fm_mycorner_collapsed', next ? '0' : '1'); } catch (_) {}
      return next;
    });
  };

  const save = async () => {
    if (!uid || saving) return;
    setSaving(true);
    try {
      // Owner-only subcollection — never the users/{uid} doc itself, so this
      // write can never touch role/orgId/approved even by accident.
      await setDoc(doc(db, 'users', uid, 'private', 'mycorner'), { notes, goal, goalDone, updatedAt: serverTimestamp() }, { merge: true });
      if (legacyToClear) {
        try { await setDoc(doc(db, 'users', uid), { myCorner: deleteField() }, { merge: true }); setLegacyToClear(false); }
        catch (_) { /* best-effort cleanup — fine to retry on a later save */ }
      }
      toast('Saved ✓', 'success');
    } catch (e) {
      console.error('My Corner save failed', e);
      toast('Could not save — try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!uid) return null;

  return (
    <Card className="p-0 overflow-hidden border-slate-800/70">
      <button type="button" onClick={toggleOpen} className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <NotebookPen size={16} className="text-slate-500 shrink-0" />
          <span className="text-sm font-semibold text-slate-300">My Corner</span>
          <span className="text-xs text-slate-400 hidden sm:inline truncate">Just for you — not visible to your team</span>
        </div>
        <ChevronDown size={16} className={`text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-800/70">
          <p className="text-xs text-slate-400 mb-3 sm:hidden">Just for you — not visible to your team.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Private notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything worth remembering — a reminder, a thought, a number to check later…"
                className={`${INPUT_CLS} resize-none`}
              />
            </Field>
            <Field label="This week's goal">
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Hit 2,500 miles, or just get home rested."
                className={INPUT_CLS}
              />
              <button
                type="button"
                onClick={() => setGoalDone((d) => !d)}
                className={`mt-2 inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${goalDone ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'}`}
              >
                <CheckCircle2 size={13} />
                {goalDone ? 'Marked done' : 'Mark done'}
              </button>
            </Field>
          </div>
          <div className="mt-4 flex justify-end">
            <PrimaryButton onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</PrimaryButton>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- VIP: shared request button + questionnaire ----------
// The VIP menu is per-workspace: each dispatcher offers the services THEY
// actually deliver (Settings → VIP Services Menu). These are the defaults a
// workspace starts with; an empty/missing override means "use these".
const DEFAULT_VIP_MENU = [
  { icon: '🛡', name: 'Safe parking scouting', desc: 'Trusted safe-parking scouting on every route' },
  { icon: '🏋️', name: 'Healthy Hub (gyms, grocers, dining)', desc: 'Gyms, grocers & clean dining near your delivery' },
  { icon: '🚿', name: 'Shower queue at stops', desc: 'Shower requests queued at your next stop' },
  { icon: '🐾', name: 'Pet logistics', desc: 'Food intercepts & pet-friendly waypoints' },
  { icon: '📞', name: 'Priority concierge line', desc: 'A direct line for layovers & last-minute needs' },
];

// Read this workspace's VIP menu (defaults until the org doc loads/overrides).
function useVipMenu() {
  const [menu, setMenu] = useState(DEFAULT_VIP_MENU);
  useEffect(() => {
    if (!ACTIVE_ORG) return;
    let alive = true;
    getDoc(doc(db, 'orgs', ACTIVE_ORG)).then((s) => {
      const m = s.exists() && s.data().vipMenu;
      if (alive && Array.isArray(m) && m.length) setMenu(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return menu;
}

function VipRequestButton({ requested, onRequest, onCancel, className = '' }) {
  const vipMenu = useVipMenu();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [svc, setSvc] = useState({});
  const [form, setForm] = useState({ diet: '', pet: '', fitness: '', notes: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (s) => setSvc((x) => ({ ...x, [s]: !x[s] }));

  const submit = async () => {
    setBusy(true);
    const answers = {
      services: vipMenu.map((m) => m.name).filter((s) => svc[s]),
      diet: form.diet.trim(), pet: form.pet.trim(), fitness: form.fitness.trim(), notes: form.notes.trim(),
    };
    try { await onRequest(answers); } finally { setBusy(false); setOpen(false); }
  };

  if (requested) {
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-emerald-400 font-semibold flex items-center gap-2"><CheckCircle2 size={16} /> Request sent — your dispatcher will reach out.</div>
        {onCancel && <button onClick={onCancel} className="text-xs text-slate-400 hover:text-red-400 underline shrink-0">Cancel request</button>}
      </div>
    );
  }
  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)} className={className}>Request VIP Concierge</PrimaryButton>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8 overflow-y-auto" onClick={() => !busy && setOpen(false)}>
          <Card className="w-full max-w-lg p-6 my-auto h-fit" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><HeartPulse size={18} className="text-amber-500" /> VIP Concierge Request</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <p className="text-sm text-slate-400 mb-4">Tell your dispatcher what you'd like so they can set up your concierge. <span className="text-slate-500">(VIP is a premium tier — it raises your dispatch fee a point or two.)</span></p>
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Which services interest you?</label>
                <div className="flex flex-wrap gap-2">
                  {vipMenu.map((m) => (
                    <button key={m.name} type="button" onClick={() => toggle(m.name)} className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${svc[m.name] ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}`}>{svc[m.name] ? '✓ ' : ''}{m.icon ? m.icon + ' ' : ''}{m.name}</button>
                  ))}
                </div>
              </div>
              <Field label="Dietary preferences / restrictions"><input className={INPUT_CLS} value={form.diet} onChange={set('diet')} placeholder="e.g. high-protein, no pork, diabetic-friendly" /></Field>
              <Field label="Traveling with a pet? (type, name, needs)"><input className={INPUT_CLS} value={form.pet} onChange={set('pet')} placeholder="e.g. Golden Retriever 'Lady', fresh food" /></Field>
              <Field label="Fitness / gym needs"><input className={INPUT_CLS} value={form.fitness} onChange={set('fitness')} placeholder="e.g. truck-accessible gym, daily" /></Field>
              <Field label="Anything else?"><textarea className={`${INPUT_CLS} min-h-[70px]`} value={form.notes} onChange={set('notes')} placeholder="Anything that would make life on the road easier…" /></Field>
            </div>
            <div className="flex items-center gap-3 mt-5">
              <PrimaryButton onClick={submit} disabled={busy} className="px-5">{busy ? 'Sending…' : 'Send Request'}</PrimaryButton>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

// ---------- VIP UPSELL (carrier requests concierge from dispatch) ----------
function VipUpsellCard({ requested, onRequest, onCancel }) {
  const vipMenu = useVipMenu();
  return (
    <Card className="p-6 border-amber-500/30">
      <PanelHeader icon={<HeartPulse size={20} />} title="VIP Concierge" badge={<Badge tone="amber">Premium</Badge>} />
      <p className="text-sm text-slate-400 mt-2">White-glove support so you can focus on driving. Available as a premium add-on.</p>
      <div className="space-y-2.5 mt-4">
        {vipMenu.map((m) => (
          <div key={m.name} className="flex items-start gap-3 text-sm text-slate-200">
            <span className="text-base leading-none shrink-0">{m.icon || '★'}</span>
            <span><span className="font-semibold text-white">{m.name}</span>{m.desc ? <span className="text-slate-400"> — {m.desc}</span> : null}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-slate-800/50 border border-slate-700 px-3 py-2.5 text-xs text-slate-400">
        Heads up: VIP is a premium tier — your dispatch fee goes up a point or two to cover the concierge work. Most carriers find the saved time and stress more than worth it.
      </div>
      <div className="mt-4"><VipRequestButton requested={requested} onRequest={onRequest} onCancel={onCancel} className="w-full" /></div>
    </Card>
  );
}
// ---------- DRIVER: PENDING LOAD OFFER ----------
function PendingOfferScreen({ offer, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const loadedMi = Number(offer.loadedMiles) || 0;
  const deadMi = Number(offer.deadheadMiles) || 0;
  const totalMi = loadedMi + deadMi;
  const gross = Number(offer.gross_pay) || 0;
  const rpm = totalMi > 0 ? gross / totalMi : (loadedMi > 0 ? gross / loadedMi : 0);
  // Offers reach this screen exclusively via "Send as Offer" in the Rate
  // Calculator, which always stamps feePct from the selected carrier — so
  // feePctOf's built-in default fallback is the same fallback Invoices
  // would land on for an (unlikely) legacy offer with no feePct at all.
  const offerFeePct = feePctOf(offer.feePct);
  const offerNet = gross * (1 - offerFeePct / 100);
  const REASONS = ['Rate too low', 'Bad location', 'Weight too high'];

  const accept = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'loads', offer.id), {
        offerStatus: 'accepted', status: 'Dispatched', offerRespondedAt: serverTimestamp(),
      });
      onResolved && onResolved();
    } catch (e) { console.error('Accept failed:', e); toast('Could not accept — please try again.', 'error'); setBusy(false); }
  };
  const decline = async (reason) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'loads', offer.id), {
        offerStatus: 'declined', status: 'Declined', declineReason: reason, offerRespondedAt: serverTimestamp(),
      });
      onResolved && onResolved();
    } catch (e) { console.error('Decline failed:', e); toast('Could not decline — please try again.', 'error'); setBusy(false); }
  };

  // Hours-of-Service fit: pull the carrier's own self-reported drive hours and
  // check this load against an 11-hour daily clock so they know BEFORE they accept.
  const [driveAvail, setDriveAvail] = useState(null);
  const [dispatchPhone, setDispatchPhone] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const h = snap.exists() && snap.data().hosSelf;
        if (h && (h.driveAvail || h.driveAvail === 0)) setDriveAvail(Number(h.driveAvail));
      } catch (_) { /* ignore */ }
      try {
        if (ACTIVE_ORG) { const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (o.exists()) setDispatchPhone(o.data().dispatchPhone || ''); }
      } catch (_) { /* ignore */ }
    })();
  }, []);
  const callPhone = dispatchPhone || DISPATCHER_PHONE;
  const estDriveH = totalMi / 50; // ~50 mph planning average
  const hosDays = estDriveH > 0 ? Math.ceil(estDriveH / 11) : 0;
  let hos = null;
  if (totalMi > 0) {
    if (driveAvail == null) hos = { tone: 'slate', text: `~${estDriveH.toFixed(1)} h of driving. Add your hours in Profile to see how it fits your clock.` };
    else if (estDriveH <= driveAvail) hos = { tone: 'emerald', text: `Fits your hours — ~${estDriveH.toFixed(1)} h driving, you have ${driveAvail} h available.` };
    else if (estDriveH <= 11) hos = { tone: 'amber', text: `~${estDriveH.toFixed(1)} h driving fits an 11-hour day, but you only have ${driveAvail} h left today — you'd finish on a fresh clock.` };
    else hos = { tone: 'amber', text: `~${estDriveH.toFixed(1)} h driving = ${hosDays} days with HOS resets. Plan fuel & rest before you accept.` };
  }
  const hosCls = { emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300', amber: 'bg-amber-500/10 border-amber-500/30 text-amber-200', slate: 'bg-slate-800/60 border-slate-700 text-slate-300' };

  // "Protect Your Carrier" terms the dispatcher stamped on this offer — shown in
  // plain language so the carrier sees their back was covered before accepting.
  const pr = offer.protections || {};
  const protLines = [];
  if (pr.detentionFreeHrs || pr.detentionPerHr) {
    const free = pr.detentionFreeHrs ? `${pr.detentionFreeHrs} hr${Number(pr.detentionFreeHrs) === 1 ? '' : 's'} free` : '';
    const then = pr.detentionPerHr ? `${free ? 'then ' : ''}$${pr.detentionPerHr}/hr` : '';
    protLines.push(`Detention: ${[free, then].filter(Boolean).join(', ')}`);
  }
  if (pr.lumperReimbursed) protLines.push('Lumper: reimbursed by the broker — not out of your rate');
  if (pr.reeferSetPoint) protLines.push(`Reefer: ${pr.reeferSetPoint}°F, ${pr.reeferMode === 'cycle' ? 'Cycle Sentry' : 'continuous run'} — in writing on the RateCon`);
  if (pr.weightInWriting) protLines.push('Weight: confirmed in writing');
  if (pr.otherTerms) protLines.push(`Also secured: ${pr.otherTerms}`);

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-5">
        <Badge tone="amber" className="font-bold tracking-widest uppercase">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Pending Offer
        </Badge>
        <h2 className="text-2xl font-bold text-white mt-3">Review Your Load Offer</h2>
        <p className="text-slate-400 text-sm mt-1">Your dispatcher is holding this load for you. Respond to lock it in.</p>
        {offer.offerSentAt && <p className="text-xs text-slate-500 mt-1">Sent {timeAgo(offer.offerSentAt)}</p>}
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500/10 to-transparent px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <span className="font-mono text-amber-500 font-bold">{offer.loadId || 'New Load'}</span>
          <div className="text-right">
            <div className="text-xs text-slate-500">Gross Rate</div>
            <div className="text-xl font-bold text-emerald-400 fm-profit">{money(gross)}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {offerFeePct > 0
                ? `Your net after the ${offerFeePct}% dispatch fee: ${money(offerNet)}`
                : `No dispatch fee on this load — full ${money(gross)} is yours.`}
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-[10px] text-emerald-400 font-semibold">PICKUP</div>
              <div className="font-bold text-white text-sm">{offer.origin || '—'}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-[10px] text-amber-400 font-semibold">DROP-OFF</div>
              <div className="font-bold text-white text-sm">{offer.destination || '—'}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div><div className="text-[11px] text-slate-400">LOADED</div><div className="font-bold text-white text-sm">{loadedMi ? loadedMi.toLocaleString() + ' mi' : '—'}</div></div>
            <div><div className="text-[11px] text-slate-400">DEADHEAD</div><div className="font-bold text-white text-sm">{deadMi ? deadMi.toLocaleString() + ' mi' : '—'}</div></div>
            <div><div className="text-[11px] text-slate-400">RPM</div><div className="font-bold text-amber-400 text-sm">{rpm > 0 ? '$' + rpm.toFixed(2) : '—'}</div></div>
            <div><div className="text-[11px] text-slate-400">WEIGHT</div><div className="font-bold text-white text-sm">{offer.weight || '—'}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-[11px] text-slate-400">COMMODITY</div><div className="text-sm text-slate-200">{offer.commodity || '—'}</div></div>
            <div><div className="text-[11px] text-slate-400">DELIVERY</div><div className="text-sm text-slate-200">{offer.delivery_date || offer.delivery_time || '—'}</div></div>
          </div>
        </div>
        {protLines.length > 0 && (
          <div className="mx-6 mb-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 mb-1.5">
              <ShieldCheck size={13} className="shrink-0" /> What your dispatcher secured for you
            </div>
            <ul className="space-y-1">
              {protLines.map((l) => (
                <li key={l} className="text-xs text-slate-300 flex gap-1.5"><span className="text-emerald-500 shrink-0">✓</span><span>{l}</span></li>
              ))}
            </ul>
            <p className="text-[10px] text-slate-500 mt-1.5">These terms ride on the RateCon — call your dispatcher if anything looks off.</p>
          </div>
        )}
        {hos && (
          <div className={`mx-6 mb-2 rounded-lg border px-3 py-2.5 text-xs font-medium ${hosCls[hos.tone]}`}>
            <span className="font-semibold">Hours of Service:</span> {hos.text}
          </div>
        )}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <PrimaryButton onClick={accept} disabled={busy} className="w-full py-3">
            {busy ? 'Working…' : '✓ Accept Offer'}
          </PrimaryButton>
          <div className={callPhone ? 'grid grid-cols-2 gap-2' : ''}>
            <GhostButton onClick={() => setShowDecline(true)} disabled={busy} className="py-2.5">Decline</GhostButton>
            {callPhone && (
              <a href={`tel:${callPhone}`} className="text-center border border-slate-700 text-slate-300 font-semibold py-2.5 rounded-lg transition-colors hover:bg-slate-800">
                Call Dispatcher
              </a>
            )}
          </div>
        </div>
      </Card>

      {showDecline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !busy && setShowDecline(false)}>
          <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-white mb-1">Why are you declining?</h3>
            <p className="text-xs text-slate-400 mb-4">One tap — this helps us find you better freight.</p>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <button key={r} onClick={() => decline(r)} disabled={busy} className="w-full text-left bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-3 rounded-lg transition-colors disabled:opacity-50">{r}</button>
              ))}
            </div>
            <button onClick={() => setShowDecline(false)} disabled={busy} className="w-full text-slate-400 hover:text-white text-sm mt-3">Cancel</button>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- QUOTE OF THE DAY ----------
const QUOTES = [
  { text: "The road to success is always under construction.", author: "Lily Tomlin" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "Keep your eyes on the road and your hands upon the wheel.", author: "The Doors" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Every mile is two in winter.", author: "George Herbert" },
  { text: "The harder you work, the luckier you get.", author: "Gary Player" },
  { text: "A smooth sea never made a skilled sailor.", author: "Franklin D. Roosevelt" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent van Gogh" },
  { text: "Wherever you go, go with all your heart.", author: "Confucius" },
  { text: "Out of difficulties grow miracles.", author: "Jean de La Bruyère" },
  { text: "Quality means doing it right when no one is looking.", author: "Henry Ford" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "The miracle isn't that I finished. It's that I had the courage to start.", author: "John Bingham" },
  { text: "Slow down and enjoy the drive — but never lose the mission.", author: "Forward Motion" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "Hard roads often lead to beautiful destinations.", author: "Unknown" },
  { text: "Drive safe today — tomorrow's loads need you.", author: "Forward Motion" },
];

// Dispatcher-facing quotes — geared toward the deal desk, not the road.
const DISPATCHER_QUOTES = [
  { text: "Every load you book is a problem you solved for someone.", author: "Forward Motion" },
  { text: "The best dispatchers don't find loads — they build relationships.", author: "Forward Motion" },
  { text: "Never accept the first number. The counter is where you get paid.", author: "Forward Motion" },
  { text: "Your carrier's profit is your reputation. Protect both.", author: "Forward Motion" },
  { text: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Price is what you pay. Value is what you negotiate.", author: "Forward Motion" },
  { text: "The dispatcher who knows the lane owns the call.", author: "Forward Motion" },
  { text: "Success is where preparation and opportunity meet.", author: "Bobby Unser" },
  { text: "A deal that doesn't clear the floor isn't a deal — it's a loss.", author: "Forward Motion" },
  { text: "Do the hard work of the quiet hours; the loud wins follow.", author: "Forward Motion" },
  { text: "Persistence on the phone beats talent on the bench.", author: "Forward Motion" },
  { text: "Vet twice, book once. Fraud only wins when you're in a hurry.", author: "Forward Motion" },
  { text: "Treat every carrier like the only one — that's how you keep them.", author: "Forward Motion" },
  { text: "Quality means doing it right when no one is looking.", author: "Henry Ford" },
  { text: "The harder you work, the luckier you get.", author: "Gary Player" },
];

function QuoteOfTheDay({ forDispatcher = false }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const pool = forDispatcher ? DISPATCHER_QUOTES : QUOTES;
  const q = pool[dayOfYear % pool.length];

  return (
    <Card className="p-5 flex items-start gap-4">
      <div className="text-amber-500 text-4xl leading-none font-serif select-none mt-[-4px]">&ldquo;</div>
      <div>
        <p className="text-slate-200 text-sm sm:text-base italic leading-relaxed">{q.text}</p>
        <p className="text-amber-500/80 text-xs font-semibold mt-2 tracking-wide">— {q.author}</p>
        <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-1">Quote of the Day</p>
      </div>
    </Card>
  );
}

// ---------- PROFILE ----------
function ProfileView({ uid, displayName }) {
  const u = auth.currentUser;
  const impersonating = !!displayName;
  const acctUid = uid || u?.uid;
  const isSelf = !impersonating && acctUid === u?.uid;

  const [name, setName] = useState(displayName || '');
  const [photoURL, setPhotoURL] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hos, setHos] = useState({ driveAvail: '', dutyUsed: '', cycleUsed: '' });
  const [hosUpdated, setHosUpdated] = useState(null);
  const [hosMsg, setHosMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', acctUid));
        if (snap.exists()) {
          const d = snap.data();
          setName(d.displayName || displayName || (d.email ? d.email.split('@')[0] : ''));
          setPhotoURL(d.photoURL || '');
          if (d.hosSelf) { setHos({ driveAvail: d.hosSelf.driveAvail ?? '', dutyUsed: d.hosSelf.dutyUsed ?? '', cycleUsed: d.hosSelf.cycleUsed ?? '' }); setHosUpdated(d.hosSelf.updatedAt || null); }
        }
      } catch (e) { console.error('profile load failed', e); }
    })();
  }, [acctUid]);

  const title = name || displayName || u?.email || 'Driver';

  const saveName = async () => {
    setSavingName(true);
    try {
      await setDoc(doc(db, 'users', acctUid), { displayName: name.trim() }, { merge: true });
      if (isSelf) { try { await updateProfile(auth.currentUser, { displayName: name.trim() }); } catch (_) {} }
      setEditingName(false);
    } catch (e) { console.error('name save failed', e); alert('Could not save your name — try again.'); }
    finally { setSavingName(false); }
  };

  const onPhoto = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToStorage(`avatars/${acctUid}/${Date.now()}_${file.name}`, file);
      await setDoc(doc(db, 'users', acctUid), { photoURL: url }, { merge: true });
      if (isSelf) { try { await updateProfile(auth.currentUser, { photoURL: url }); } catch (_) {} }
      setPhotoURL(url);
    } catch (err) {
      console.error('avatar upload failed', err);
      alert(err.code === 'storage/unauthorized' ? 'Photo upload needs Storage rules published.' : 'Upload failed — try a smaller image.');
    } finally { setUploading(false); }
  };

  const saveHos = async () => {
    setHosMsg('');
    try {
      const payload = { driveAvail: Number(hos.driveAvail) || 0, dutyUsed: Number(hos.dutyUsed) || 0, cycleUsed: Number(hos.cycleUsed) || 0, updatedAt: serverTimestamp() };
      await setDoc(doc(db, 'users', acctUid), { hosSelf: payload }, { merge: true });
      setHosMsg('Hours saved ✓'); setTimeout(() => setHosMsg(''), 2500);
    } catch (e) { console.error('hos save failed', e); setHosMsg('Could not save'); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">{impersonating ? 'Carrier Profile' : 'My Profile'}</h2>
      <GuidedHint>Edit your display name, photo, and your current hours of service here. Your operating details (equipment, rates, lanes) live in the onboarding profile.</GuidedHint>
      <Card className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <label className={`relative w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-2xl font-bold uppercase overflow-hidden shrink-0 ${uploading ? 'opacity-60' : 'cursor-pointer group'}`}>
            {photoURL
              ? <img src={photoURL} alt="" className="w-full h-full object-cover" />
              : <span>{title ? title[0] : 'D'}</span>}
            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 text-[10px] font-medium normal-case">{uploading ? '…' : 'Change'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading} />
          </label>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input className={INPUT_CLS + ' max-w-xs'} value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
                <button onClick={saveName} disabled={savingName} className="text-xs bg-amber-500 text-slate-950 font-semibold px-3 py-1.5 rounded-lg">{savingName ? '…' : 'Save'}</button>
                <button onClick={() => setEditingName(false)} className="text-xs text-slate-400 px-2">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-lg font-bold truncate">{title}</div>
                <button onClick={() => setEditingName(true)} className="text-xs text-amber-400 hover:underline shrink-0">Edit</button>
              </div>
            )}
            <div className="text-sm text-emerald-400">● Active</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Info label={impersonating ? 'Carrier' : 'Email'} value={impersonating ? displayName : (u?.email || '—')} />
          <Info label="Support ID" value={acctUid ? acctUid.slice(0, 10) + '…' : '—'} />
          <Info label="Role" value="Carrier / Driver" />
          <Info label="Member Since" value={impersonating ? '—' : (u?.metadata?.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString() : '—')} />
        </div>
      </Card>

      <Card className="p-6">
        <PanelHeader icon={<Clock size={18} />} title="Hours of Service (self-reported)" />
        <p className="text-sm text-slate-400 mt-1 mb-4">Until your ELD is connected, keep these current so your dispatcher only sends loads you can legally run. Updating here lets the system check each offer against your clock.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Drive hours available today"><input className={INPUT_CLS} type="number" inputMode="decimal" value={hos.driveAvail} onChange={(e) => setHos((s) => ({ ...s, driveAvail: e.target.value }))} placeholder="11" /></Field>
          <Field label="On-duty hours used (14h day)"><input className={INPUT_CLS} type="number" inputMode="decimal" value={hos.dutyUsed} onChange={(e) => setHos((s) => ({ ...s, dutyUsed: e.target.value }))} placeholder="3" /></Field>
          <Field label="Cycle hours used (70h/8d)"><input className={INPUT_CLS} type="number" inputMode="decimal" value={hos.cycleUsed} onChange={(e) => setHos((s) => ({ ...s, cycleUsed: e.target.value }))} placeholder="40" /></Field>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <PrimaryButton onClick={saveHos} className="px-5">Save my hours</PrimaryButton>
          {hosMsg && <span className="text-xs text-emerald-400">{hosMsg}</span>}
          {!hosMsg && hosUpdated && <span className="text-xs text-slate-500">Last updated {hosUpdated.toDate ? hosUpdated.toDate().toLocaleString() : ''}</span>}
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="font-semibold text-white break-words">{value}</div>
    </div>
  );
}

// ---------- SCHEDULE ----------
function ScheduleView({ uid }) {
  const targetUid = uid || auth.currentUser?.uid;
  const [events, setEvents] = useState([]);
  const [loadEvents, setLoadEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'Maintenance', date: '' });

  const fetchEvents = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'schedule_events'), where('uid', '==', targetUid)));
      setEvents(snap.docs.map((d) => ({ id: d.id, manual: true, ...d.data() })));
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    const fetchLoads = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', targetUid)));
        const evs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((l) => l.delivery_date)
          .map((l) => ({
            id: 'load-' + l.id,
            type: 'Load',
            title: `${l.loadId}: ${l.origin || '?'} → ${l.destination || '?'}`,
            date: l.delivery_date,
          }));
        setLoadEvents(evs);
      } catch (err) {
        console.error('Error loading schedule:', err);
      }
    };
    fetchLoads();
    fetchEvents();
  }, []);

  const all = [...events, ...loadEvents];
  const groups = {};
  all.forEach((e) => {
    const key = e.date || 'Unscheduled';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  const dateKeys = Object.keys(groups).sort();

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title || !form.date) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'schedule_events'), {
        uid: targetUid, title: form.title, type: form.type, date: form.date, createdAt: serverTimestamp(),
      });
      setEvents((prev) => [{ id: ref.id, manual: true, uid: targetUid, ...form }, ...prev]);
      setForm({ title: '', type: 'Maintenance', date: '' });
      setShowForm(false);
    } catch (err) {
      console.error('Error adding event:', err);
      alert('Could not save event — check the console.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id) => {
    try {
      await deleteDoc(doc(db, 'schedule_events', id));
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  const fmtDate = (str) => {
    if (str === 'Unscheduled') return 'Unscheduled';
    return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const typeStyle = (t) => {
    if (t === 'Load') return { icon: <Map size={16} />, cls: 'bg-blue-500/20 text-blue-400' };
    if (t === 'Maintenance') return { icon: <Wrench size={16} />, cls: 'bg-amber-500/20 text-amber-400' };
    return { icon: <Calendar size={16} />, cls: 'bg-slate-700 text-slate-300' };
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2"><Calendar className="text-amber-500" size={24} /> Schedule & Calendar</h2>
          <p className="text-slate-400">Your agenda of upcoming loads and truck maintenance.</p>
          <div className="mt-3"><GuidedHint>Loads with a delivery date appear here automatically. Add maintenance or other events manually so the carrier’s whole week lives in one place.</GuidedHint></div>
        </div>
        <PrimaryButton onClick={() => setShowForm((s) => !s)} className="shrink-0">
          <Plus size={18} /> Add Event
        </PrimaryButton>
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={handleAdd} className="space-y-4">
          <h3 className="font-bold">New Event</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className={`${INPUT_CLS} md:col-span-2`}
              placeholder="Event title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <select className={SELECT_CLS}
              value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option>Maintenance</option>
              <option>Load</option>
              <option>Other</option>
            </select>
            <input className={`${INPUT_CLS} md:col-span-3`}
              type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <PrimaryButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add to Calendar'}</PrimaryButton>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
          </div>
          </form>
        </Card>
      )}

      {loadingEvents ? (
        <div className="text-slate-500 text-center py-12">Loading your schedule…</div>
      ) : dateKeys.length === 0 ? (
        <div className="text-slate-500 text-center py-12">Nothing scheduled yet.</div>
      ) : (
        <div className="space-y-6">
          {dateKeys.map((dk) => (
            <div key={dk}>
              <div className="text-sm font-semibold text-slate-400 mb-3 border-b border-slate-800 pb-2">{fmtDate(dk)}</div>
              <div className="space-y-3">
                {groups[dk].map((e) => {
                  const s = typeStyle(e.type);
                  return (
                    <div key={e.id} className="flex items-center gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
                      <div className={`p-2 rounded-lg ${s.cls}`}>{s.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white truncate">{e.title}</div>
                        <div className="text-xs text-slate-400">{e.type}</div>
                      </div>
                      {e.manual && (
                        <button onClick={() => deleteEvent(e.id)} className="text-slate-500 hover:text-red-400 text-sm shrink-0" title="Remove event">✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ---------- DELIVERY DEBRIEF (carrier, right after marking Delivered) ----------
// Captures how the delivery went and logs it to Facility & Market Intel
// (lane_intel) so the dispatcher sees it and the team learns the facility.
function DeliveryDebriefModal({ load, onClose }) {
  const [outcome, setOutcome] = useState('smooth');
  const [issues, setIssues] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [podUrl, setPodUrl] = useState('');
  const [podBusy, setPodBusy] = useState(false);
  const ISSUES = ['Long detention / held late', 'Hard to find / bad directions', 'No overnight parking', 'Rude or slow staff', 'Lumper required', 'Other'];
  const toggle = (x) => setIssues((s) => ({ ...s, [x]: !s[x] }));
  const uploadPod = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setPodBusy(true);
    try { setPodUrl(await uploadToStorage(`load_docs/${load.uid}/pod_${load.id}_${file.name}`, file)); }
    catch (err) { console.error('POD upload failed', err); alert('Photo upload failed — try again.'); }
    finally { setPodBusy(false); }
  };

  const submit = async (skip = false) => {
    setBusy(true);
    const issueList = ISSUES.filter((x) => issues[x]);
    const summary = skip ? '' : (outcome === 'smooth' ? 'Smooth delivery.' : 'Issues: ' + (issueList.join(', ') || 'unspecified') + '.') + (notes.trim() ? ' ' + notes.trim() : '');
    try {
      if (!skip) {
        await addDoc(collection(db, 'lane_intel'), stampOrg({
          location: load.destination || 'Delivery facility',
          category: 'Receiver',
          note: `[${load.loadId || 'Load'}] ${summary}`.trim(),
          createdAtMs: Date.now(),
          createdAt: serverTimestamp(),
          source: 'driver_debrief',
        }));
        await updateDoc(doc(db, 'loads', load.id), {
          deliveryReport: { outcome, issues: issueList, notes: notes.trim(), podUrl: podUrl || '', at: serverTimestamp() },
        }).catch(() => {});
      }
    } catch (e) {
      console.error('debrief save failed', e);
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-5">
        <Badge tone="emerald" className="font-bold tracking-widest uppercase"><CheckCircle2 size={14} /> Delivered</Badge>
        <h2 className="text-2xl font-bold text-white mt-3">How did this delivery go?</h2>
        <p className="text-slate-400 text-sm mt-1">A quick note helps your dispatcher and the next driver. <span className="font-mono text-amber-500">{load.loadId || ''}</span> · {load.destination || ''}</p>
      </div>
      <Card className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setOutcome('smooth')} className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${outcome === 'smooth' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>👍 Smooth</button>
          <button onClick={() => setOutcome('issues')} className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${outcome === 'issues' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>⚠️ Had issues</button>
        </div>

        {outcome === 'issues' && (
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">What happened? (tap any)</div>
            <div className="flex flex-wrap gap-2">
              {ISSUES.map((x) => (
                <button key={x} onClick={() => toggle(x)} className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${issues[x] ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}`}>{issues[x] ? '✓ ' : ''}{x}</button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={LABEL_CLS}>Notes for your dispatcher (optional)</label>
          <textarea className={`${INPUT_CLS} min-h-[80px]`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this receiver or lane…" />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className={`text-xs px-3 py-2 rounded-lg cursor-pointer ${podBusy ? 'bg-slate-700 text-slate-400' : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700'}`}>
            {podBusy ? 'Uploading…' : (podUrl ? '✓ POD attached — replace' : '📎 Attach signed POD photo')}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={uploadPod} disabled={podBusy} />
          </label>
          {podUrl && <a href={podUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline">View</a>}
        </div>

        <div className="space-y-2">
          <PrimaryButton onClick={() => submit(false)} disabled={busy} className="w-full py-3">{busy ? 'Sending…' : 'Send to Dispatcher'}</PrimaryButton>
          <p className="text-sm text-amber-400/90 text-center">A signed POD is what gets this load invoiced — skipping it can delay your pay.</p>
          <button onClick={() => submit(true)} disabled={busy} className="w-full text-slate-400 hover:text-white text-sm py-1">Skip for now</button>
        </div>
      </Card>
    </div>
  );
}

// ---------- RATE CONFIRMATION E-SIGN (carrier accepts the binding terms) ----------
// `dispatcherMode` — the dispatcher is driving this lane (not the carrier):
// an unsigned RateCon records as signed ON THE CARRIER'S BEHALF (byDispatcher,
// under their LPOA), matching AllLoadsView's signRateConOnBehalf record shape.
function RateConCard({ load, onSigned, dispatcherMode = false }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const signed = load.rateConSigned;
  const money = (x) => Number(x || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const sign = async () => {
    if (!name.trim() || !agree) return;
    setBusy(true);
    try {
      const rec = dispatcherMode
        ? { name: name.trim(), at: serverTimestamp(), byDispatcher: true }
        : { name: name.trim(), at: serverTimestamp() };
      await updateDoc(doc(db, 'loads', load.id), { rateConSigned: rec });
      if (onSigned) await onSigned();
    } catch (e) { console.error('ratecon sign failed', e); toast('Could not save your signature — try again.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-6">
      <PanelHeader icon={<FileText size={20} />} title="Rate Confirmation" badge={signed ? <Badge tone="emerald"><CheckCircle2 size={11} /> Signed</Badge> : <Badge tone="amber">Needs signature</Badge>} />
      <p className="text-sm text-slate-400 mt-1">{dispatcherMode ? 'The carrier’s binding acceptance of this load.' : 'Your binding acceptance of this load. Review the terms, then e-sign before you roll.'}</p>
      <div className="grid grid-cols-2 gap-3 mt-4 text-sm bg-slate-800/40 border border-slate-700 rounded-xl p-4">
        <div><span className="text-slate-500 text-[11px] uppercase">Load</span><div className="font-mono text-amber-500">{load.loadId || '—'}</div></div>
        <div><span className="text-slate-500 text-[11px] uppercase">Rate</span><div className="font-semibold text-emerald-400">{money(load.gross_pay)}</div></div>
        <div><span className="text-slate-500 text-[11px] uppercase">Pickup</span><div className="text-slate-200">{load.origin || '—'}{load.pickup_time ? ` · ${load.pickup_time}` : ''}</div></div>
        <div><span className="text-slate-500 text-[11px] uppercase">Delivery</span><div className="text-slate-200">{load.destination || '—'}{load.delivery_time ? ` · ${load.delivery_time}` : ''}</div></div>
        <div><span className="text-slate-500 text-[11px] uppercase">Commodity</span><div className="text-slate-200">{load.commodity || '—'}</div></div>
        <div><span className="text-slate-500 text-[11px] uppercase">Weight</span><div className="text-slate-200">{load.weight || '—'}</div></div>
      </div>
      {load.rateConUrl && (
        <a href={load.rateConUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-sm text-amber-400 hover:underline">📄 View the broker’s Rate Confirmation document</a>
      )}
      {signed ? (
        signed.byDispatcher ? (
          <div className="mt-4 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm px-4 py-3">
            {dispatcherMode
              ? <>✓ Recorded as signed <strong>on the carrier’s behalf</strong> under their Limited Power of Attorney{signed.name ? <> — “{signed.name}”</> : ''}.</>
              : <>✓ Signed <strong>by your dispatcher on your behalf</strong>, under your Limited Power of Attorney{signed.name ? <> — recorded as “{signed.name}”</> : ''}. If this doesn’t look right, contact your dispatcher.</>}
          </div>
        ) : (
          <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm px-4 py-3">✓ E-signed by <strong>{signed.name}</strong>.{dispatcherMode ? '' : ' Your dispatcher has been notified.'}</div>
        )
      ) : (
        <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
          {dispatcherMode ? (
            <>
              <p className="text-xs text-slate-400">Carrier not in the app? Once they’ve confirmed by phone or text, record the RateCon as signed on their behalf — their LPOA authorizes it. Note how it was authorized (shown on the permanent record).</p>
              <input className={INPUT_CLS} value={name} onChange={(e) => setName(e.target.value)} placeholder={`How it was authorized — e.g. "Verbal OK — J. Smith, ${new Date().toLocaleDateString()}"`} />
              <label className="flex items-start gap-2.5 text-sm text-slate-200 cursor-pointer">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0" />
                <span>The carrier confirmed these terms and their LPOA authorizes me to sign.</span>
              </label>
              <PrimaryButton onClick={sign} disabled={busy || !name.trim() || !agree} className="px-5">{busy ? 'Recording…' : '✍️ Record signature on carrier’s behalf'}</PrimaryButton>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400">Confirm the rate, stops, and times match what you agreed. Typing your name below is a legal electronic signature accepting these terms.</p>
              <input className={INPUT_CLS} value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your full legal name to sign" />
              <label className="flex items-start gap-2.5 text-sm text-slate-200 cursor-pointer">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0" />
                <span>I confirm these terms are correct and I accept this Rate Confirmation.</span>
              </label>
              <PrimaryButton onClick={sign} disabled={busy || !name.trim() || !agree} className="px-5">{busy ? 'Signing…' : '✍️ E-sign Rate Confirmation'}</PrimaryButton>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- DETENTION REQUEST (carrier files on a load; storage-free) ----------
function DetentionCard({ load, onSaved }) {
  const existing = load.detention || null;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    arrivedAt: existing?.arrivedAt || '',
    departedAt: existing?.departedAt || '',
    freeHours: existing?.freeHours != null ? String(existing.freeHours) : '2',
    ratePerHour: existing?.ratePerHour != null ? String(existing.ratePerHour) : '50',
    notes: existing?.notes || '',
  });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const [bolUrl, setBolUrl] = useState(existing?.bolPhotoUrl || '');
  const [photoBusy, setPhotoBusy] = useState(false);
  const uploadBol = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setPhotoBusy(true);
    try { setBolUrl(await uploadToStorage(`load_docs/${load.uid}/detention_bol_${load.id}_${file.name}`, file)); }
    catch (err) { console.error('BOL upload failed', err); alert('Photo upload failed — try again.'); }
    finally { setPhotoBusy(false); }
  };
  const n = (x) => parseFloat(x) || 0;
  const money = (x) => '$' + (x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalH = (f.arrivedAt && f.departedAt) ? Math.max(0, (new Date(f.departedAt) - new Date(f.arrivedAt)) / 3600000) : 0;
  const billable = Math.max(0, totalH - n(f.freeHours));
  const amount = billable * n(f.ratePerHour);
  const ready = f.arrivedAt && f.departedAt && new Date(f.departedAt) > new Date(f.arrivedAt);

  const save = async () => {
    setBusy(true);
    const detention = {
      arrivedAt: f.arrivedAt, departedAt: f.departedAt,
      freeHours: n(f.freeHours), ratePerHour: n(f.ratePerHour),
      billableHours: Number(billable.toFixed(2)), amount: Number(amount.toFixed(2)),
      notes: f.notes.trim(), bolPhotoUrl: bolUrl || '', status: 'filed', filedAt: serverTimestamp(),
    };
    try { await updateDoc(doc(db, 'loads', load.id), { detention }); if (onSaved) await onSaved(); setOpen(false); }
    catch (e) { console.error('detention save failed', e); alert('Could not save — check the console.'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-6">
      <PanelHeader icon={<Activity size={20} />} title="Detention" badge={existing ? <Badge tone={existing.status === 'resolved' ? 'emerald' : 'amber'}>{existing.status === 'resolved' ? 'Resolved' : 'Filed'}</Badge> : null} />
      <p className="text-sm text-slate-400 mt-1">Held past your free time at a facility? Log it here — documented in/out times are what get detention paid.</p>
      <GuidedHint>Document arrival the moment the driver checks in. Per the 2026 Evergreen ruling, fees are collectible when the delay is the facility's fault — your timestamps are the proof. See Training → Negotiation Scripts for the talk-track.</GuidedHint>

      {existing && !open && (
        <div className="mt-4 bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div><div className="text-[10px] text-slate-500">BILLABLE</div><div className="font-bold text-white text-sm">{existing.billableHours}h</div></div>
            <div><div className="text-[10px] text-slate-500">RATE</div><div className="font-bold text-white text-sm">{money(existing.ratePerHour)}/h</div></div>
            <div><div className="text-[10px] text-slate-500">AMOUNT</div><div className="font-bold text-amber-400 text-sm">{money(existing.amount)}</div></div>
            <div><div className="text-[10px] text-slate-500">FREE TIME</div><div className="font-bold text-white text-sm">{existing.freeHours}h</div></div>
          </div>
          {existing.notes && <div className="text-xs text-slate-400 mt-3">{existing.notes}</div>}
          {existing.bolPhotoUrl && <a href={existing.bolPhotoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline mt-2 inline-block">📎 View attached BOL photo</a>}
        </div>
      )}

      {!open ? (
        <GhostButton onClick={() => setOpen(true)} className="mt-4">{existing ? 'Edit detention claim' : 'File a detention claim'}</GhostButton>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Checked in (arrival)"><input className={INPUT_CLS} type="datetime-local" value={f.arrivedAt} onChange={set('arrivedAt')} /></Field>
            <Field label="Checked out (departure)"><input className={INPUT_CLS} type="datetime-local" value={f.departedAt} onChange={set('departedAt')} /></Field>
            <Field label="Free time (hours)"><input className={INPUT_CLS} type="number" inputMode="decimal" value={f.freeHours} onChange={set('freeHours')} /></Field>
            <Field label="Detention rate ($/hour)"><input className={INPUT_CLS} type="number" inputMode="decimal" value={f.ratePerHour} onChange={set('ratePerHour')} /></Field>
          </div>
          <Field label="Notes (what caused the delay?)"><textarea className={`${INPUT_CLS} min-h-[60px]`} value={f.notes} onChange={set('notes')} placeholder="e.g. dock closed, no doors available, lumper backed up" /></Field>
          <div className="flex items-center gap-3 flex-wrap">
            <label className={`text-xs px-3 py-2 rounded-lg cursor-pointer ${photoBusy ? 'bg-slate-700 text-slate-400' : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700'}`}>
              {photoBusy ? 'Uploading…' : (bolUrl ? '✓ BOL photo attached — replace' : '📎 Attach timestamped BOL photo')}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={uploadBol} disabled={photoBusy} />
            </label>
            {bolUrl && <a href={bolUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline">View</a>}
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
            <div className="text-sm text-slate-400">{ready ? `${totalH.toFixed(1)}h on site − ${n(f.freeHours)}h free = ` : 'Enter both times to calculate'}<span className="font-bold text-white">{ready ? `${billable.toFixed(1)}h billable` : ''}</span></div>
            <div className="text-xl font-bold text-amber-400">{ready ? money(amount) : '—'}</div>
          </div>
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={save} disabled={busy || !ready} className="px-5">{busy ? 'Saving…' : 'Submit Detention'}</PrimaryButton>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-600 mt-3">Attach the timestamped BOL photo to back up the claim — it's the proof that wins detention disputes.</p>
    </Card>
  );
}

// ---------- LANE MANAGEMENT ----------
// ---------- LOAD PROOF PACKAGE (BOL / POD / lumper / accessorial docs) ----------
// One panel per load, shared by BOTH sides: the carrier attaches paperwork from
// their phone as the load runs; the dispatcher sees the same package on the
// load (All Loads → edit) and can upload anything that arrives by email/fax.
// Docs live in an array on the load doc itself, files in load_docs/{carrierUid}.
const LOAD_DOC_TYPES = ['BOL (pickup)', 'POD (delivered)', 'Lumper receipt', 'Detention / accessorial', 'Other'];

function LoadDocsPanel({ load, uploadedBy, onChanged }) {
  const [docType, setDocType] = useState(LOAD_DOC_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const docs = Array.isArray(load.docs) ? load.docs : [];

  const upload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const url = await uploadToStorage(`load_docs/${load.uid}/${docType.replace(/[^a-z0-9]/gi, '_')}_${load.id}_${Date.now()}_${file.name}`, file);
      const rec = { type: docType, name: file.name, url, by: uploadedBy, atMs: Date.now() };
      await updateDoc(doc(db, 'loads', load.id), { docs: [...docs, rec] });
      if (onChanged) onChanged([...docs, rec]);
    } catch (e2) {
      console.error('load doc upload failed', e2);
      setErr(e2.code === 'storage/unauthorized' ? 'Storage rules not published for this path yet.' : (e2.message || 'Upload failed'));
    } finally { setBusy(false); e.target.value = ''; }
  };

  const removeDoc = async (i) => {
    if (!window.confirm('Remove this document from the load?')) return;
    const next = docs.filter((_, j) => j !== i);
    try { await updateDoc(doc(db, 'loads', load.id), { docs: next }); if (onChanged) onChanged(next); }
    catch (e2) { console.error('doc remove failed', e2); }
  };

  // Completeness chips: pull in docs that already live elsewhere on the load.
  const has = (t) => docs.some((d) => d.type === t);
  const hasBol = has('BOL (pickup)') || !!(load.detention && load.detention.bolUrl);
  const hasPod = has('POD (delivered)') || !!(load.deliveryReport && load.deliveryReport.podUrl);
  const hasRateCon = !!load.rateConUrl;
  const chip = (ok, label) => (
    <span className={`text-[11px] px-2 py-0.5 rounded-sm border ${ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>{ok ? '✓ ' : ''}{label}</span>
  );

  const isDispatcher = uploadedBy === 'dispatcher';

  return (
    <div className="rounded-md border border-slate-700 bg-slate-800/40 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm font-semibold text-white">🗂 Proof Package</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {chip(hasRateCon, 'RateCon')}{chip(hasBol, 'BOL')}{chip(hasPod, 'POD')}
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-1.5">Signed BOL at pickup, signed POD at delivery, lumper receipts, and any detention/accessorial paperwork — the package that gets this load paid and wins a dispute.</p>

      {(docs.length > 0 || (load.deliveryReport && load.deliveryReport.podUrl) || (load.detention && load.detention.bolUrl)) && (
        <div className="mt-3 space-y-1.5">
          {load.detention && load.detention.bolUrl && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-300 truncate">⏱ Detention BOL photo <span className="text-slate-500">· from detention claim</span></span>
              <a href={load.detention.bolUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline shrink-0">View</a>
            </div>
          )}
          {load.deliveryReport && load.deliveryReport.podUrl && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-300 truncate">📦 POD photo <span className="text-slate-500">· from delivery debrief</span></span>
              <a href={load.deliveryReport.podUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline shrink-0">View</a>
            </div>
          )}
          {docs.map((d, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-300 truncate">📎 {d.type} — {d.name} <span className="text-slate-500">· {d.by === 'dispatcher' ? 'dispatcher' : 'carrier'}, {d.atMs ? new Date(d.atMs).toLocaleDateString() : ''}</span></span>
              <span className="flex items-center gap-2 shrink-0">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">View</a>
                {isDispatcher && <button type="button" onClick={() => removeDoc(i)} className="text-red-400/80 hover:text-red-400">✕</button>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-2 text-slate-200" value={docType} onChange={(e) => setDocType(e.target.value)}>
          {LOAD_DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className={`text-xs px-3 py-2 rounded cursor-pointer shrink-0 ${busy ? 'bg-slate-700 text-slate-400' : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700'}`}>
          {busy ? 'Uploading…' : '📎 Attach photo / PDF'}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={upload} disabled={busy} />
        </label>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>
    </div>
  );
}

// `isAdmin` — a dispatcher opened this OUTSIDE "View As" (their own uid owns no
// loads, so the old behavior was a dead-end empty state). Dispatcher mode adds
// a carrier picker and runs the SAME live lane view against that carrier's
// linkedDriverUid — status advance, RateCon (recorded on-behalf), and docs all
// work; loads are assigned with uid = linkedDriverUid, so the query matches.
function LaneManagementView({ uid, isAdmin = false }) {
  const [carriers, setCarriers] = useState(null); // dispatcher mode: null = loading
  const [carrierUid, setCarrierUid] = useState('');
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    getDocs(orgScoped('carriers'))
      .then((snap) => {
        if (!live) return;
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.linkedDriverUid);
        rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setCarriers(rows);
        setCarrierUid((cur) => cur || (rows[0] ? rows[0].linkedDriverUid : ''));
      })
      .catch((e) => { console.error('lane carriers load failed', e); if (live) setCarriers([]); });
    return () => { live = false; };
  }, [isAdmin]);

  const targetUid = isAdmin ? carrierUid : (uid || auth.currentUser?.uid);
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [debriefLoad, setDebriefLoad] = useState(null);

  const STATUS_FLOW = ['Dispatched', 'Arrived at Shipper', 'Loaded', 'In Transit', 'Delivered'];

  const applyRows = (rows) => {
    rows.sort((a, b) => (a.delivery_date || '').localeCompare(b.delivery_date || ''));
    setLoads(rows);
    setLoading(false);
  };
  const fetchLoads = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', targetUid)));
      applyRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error('Error loading lanes:', err); setLoading(false); }
  };

  // LIVE: a RateCon your dispatcher just attached, or a status they advanced,
  // shows up here instantly. Re-subscribes when the dispatcher switches carriers.
  useEffect(() => {
    if (!targetUid) return;
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'loads'), where('uid', '==', targetUid)),
      (snap) => applyRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error('lanes live listener failed', err); fetchLoads(); }
    );
    return () => unsub();
  }, [targetUid]);

  // A delivered/cleared load normally drops off this screen — but if it's
  // missing a delivery date it's also invisible on every invoice and
  // monthly statement, so keep it surfaced as "active" until that's fixed
  // (see the persistent banner below) instead of letting it quietly vanish.
  const pending = loads.filter((l) => (l.status !== 'Delivered' && l.status !== 'Cleared') || !l.delivery_date);
  const active = pending[0] || null;
  const upcoming = pending.slice(1);

  const setStatus = async (newStatus) => {
    if (!active) return;
    setUpdating(true);
    const justDelivered = newStatus === 'Delivered' && active.status !== 'Delivered';
    const deliveredLoad = justDelivered ? active : null;
    try {
      await updateDoc(doc(db, 'loads', active.id), { status: newStatus });
      if (justDelivered && !active.delivery_date) {
        toast("No delivery date — this load won't appear on any invoice or monthly statement until one is set.", 'error');
      }
      // Capture a quick debrief before the active load disappears from the
      // screen — the debrief is the CARRIER's voice, so skip it in dispatcher mode.
      if (deliveredLoad && !isAdmin) setDebriefLoad(deliveredLoad);
      await fetchLoads();
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdating(false);
    }
  };

  // Dispatcher mode: pick whose lane you're running. Rendered above every
  // state (empty included) so switching carriers is always one tap away.
  const selectedCarrier = isAdmin && Array.isArray(carriers) ? carriers.find((c) => c.linkedDriverUid === carrierUid) : null;
  const adminPicker = isAdmin && Array.isArray(carriers) && carriers.length > 0 ? (
    <Card className="p-4 flex flex-wrap items-center gap-3">
      <label htmlFor="lane-carrier-picker" className="text-sm text-slate-400 shrink-0">Carrier’s lane:</label>
      <select
        id="lane-carrier-picker"
        className="text-sm bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 min-w-0 flex-1 max-w-xs"
        value={carrierUid}
        onChange={(e) => setCarrierUid(e.target.value)}
      >
        {carriers.map((c) => <option key={c.id} value={c.linkedDriverUid}>{c.name || c.linkedDriverUid}</option>)}
      </select>
      <Badge tone="amber" className="font-bold tracking-wide shrink-0">ADMIN</Badge>
    </Card>
  ) : null;

  // Dispatcher with no linked carriers yet — nothing to manage.
  if (isAdmin && Array.isArray(carriers) && carriers.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <h2 className="text-2xl font-bold">Lane Management</h2>
        <Card className="p-10 text-center text-slate-400">
          No carriers with a portal login yet — add one in <strong className="text-slate-200">Carriers</strong> and link their driver login, then manage their active lane here.
        </Card>
      </div>
    );
  }

  if (loading || (isAdmin && carriers === null)) return <div className="max-w-4xl mx-auto text-slate-400">Loading lane…</div>;

  // Delivery debrief takes priority — collect feedback right after delivery.
  if (debriefLoad) {
    return <DeliveryDebriefModal load={debriefLoad} onClose={() => setDebriefLoad(null)} />;
  }

  if (!active) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <h2 className="text-2xl font-bold">Lane Management</h2>
        {adminPicker}
        <Card className="p-10 text-center text-slate-400">
          {isAdmin
            ? <>No active load for {selectedCarrier ? <strong className="text-slate-200">{selectedCarrier.name || 'this carrier'}</strong> : 'this carrier'} right now. Price one in the <strong className="text-slate-200">Rate Calculator</strong> and send it as an offer, or use <strong className="text-slate-200">Assign Load</strong>.</>
            : 'No active load right now. Your dispatcher will assign one shortly.'}
        </Card>
      </div>
    );
  }

  const currentIdx = STATUS_FLOW.indexOf(active.status);
  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Lane Management</h2>
        <p className="text-slate-400">{isAdmin ? 'Run the carrier’s active load — advance the status, handle the RateCon, and keep the proof package tight.' : 'Everything you need to execute your current load.'}</p>
        <div className="mt-3"><GuidedHint>The carrier’s execution screen for the active load — status updates, route, the paperwork checklist, and VIP stops. Walk a new driver through advancing the status as the load moves.</GuidedHint></div>
      </div>

      {adminPicker}

      {(active.status === 'Delivered' || active.status === 'Cleared') && !active.delivery_date && (
        <div className="rounded-lg border border-warn-500/40 bg-warn-500/10 px-4 py-3 text-sm text-warn-200 flex items-start gap-2.5">
          <span className="shrink-0">⚠️</span>
          <span>{isAdmin ? 'This load has no delivery date — set one in All Loads so it lands on the invoice.' : 'This load has no delivery date — tell your dispatcher so it lands on the invoice.'}</span>
        </div>
      )}

      <Card className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-amber-500 font-bold">{active.loadId}</span>
            <Badge tone="blue">Active Load</Badge>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Gross Pay</div>
            <div className="text-lg font-bold text-emerald-400">{money(active.gross_pay)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-emerald-400 font-semibold mb-2">SHIPPER (PICKUP)</div>
            <div className="font-bold text-white">{active.origin || '—'}</div>
            <div className="text-sm text-slate-400 mt-1">{active.pickup_time || 'Pickup time TBD'}</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-amber-400 font-semibold mb-2">RECEIVER (DELIVERY)</div>
            <div className="font-bold text-white">{active.destination || '—'}</div>
            <div className="text-sm text-slate-400 mt-1">{active.delivery_time || (active.delivery_date ? `By ${active.delivery_date}` : 'Delivery time TBD')}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><div className="text-xs text-slate-500 mb-1">Commodity</div><div className="text-sm font-semibold text-white">{active.commodity || '—'}</div></div>
          <div><div className="text-xs text-slate-500 mb-1">Weight</div><div className="text-sm font-semibold text-white">{active.weight || '—'}</div></div>
          <div><div className="text-xs text-slate-500 mb-1">PO Number</div><div className="text-sm font-semibold text-white">{active.po_number || '—'}</div></div>
          <div><div className="text-xs text-slate-500 mb-1">Pickup Number</div><div className="text-sm font-semibold text-white">{active.pickup_number || '—'}</div></div>
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-3">UPDATE STATUS</div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FLOW.map((s, i) => {
              const done = i <= currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={updating}
                  className={`text-sm px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                    isCurrent
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                      : done
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {done && !isCurrent ? '✓ ' : ''}{s}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">Current status: <span className="text-slate-300 font-semibold">{active.status}</span></p>
        </div>
      </Card>

      <RateConCard load={active} onSigned={fetchLoads} dispatcherMode={isAdmin} />

      <LoadDocsPanel load={active} uploadedBy={isAdmin ? 'dispatcher' : 'carrier'} onChanged={() => fetchLoads()} />

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2"><Map className="text-blue-400" size={20} /> Route Map</h3>
          <span className="text-[11px] bg-slate-800 text-slate-400 px-2 py-1 rounded">Preview</span>
        </div>
        <div className="relative h-64 rounded-xl overflow-hidden border border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #334155 1px, transparent 1px), radial-gradient(circle at 70% 60%, #334155 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <Navigation className="text-blue-400 mb-3" size={32} />
            <div className="font-semibold text-white">{active.origin || 'Origin'} → {active.destination || 'Destination'}</div>
            <div className="text-xs text-slate-400 mt-2">Interactive live map coming soon</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span> Pickup</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span> Delivery</span>
        </div>
      </Card>

      <LoadStepChecklist load={active} forCarrier onPersist={(steps) => updateDoc(doc(db, 'loads', active.id), { steps }).catch((e) => console.error('checklist save failed', e))} />

      <DetentionCard load={active} onSaved={fetchLoads} />

      <HealthyHubAndShower load={active} />

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Upcoming Loads</h3>
        {upcoming.length === 0 ? (
          <div className="text-slate-500 text-sm">No upcoming loads queued. Plan your hours of service freely.</div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((l) => (
              <div key={l.id} className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <div>
                  <div className="font-mono text-slate-300 text-sm font-semibold">{l.loadId}</div>
                  <div className="text-sm text-slate-400">{l.origin || '—'} → {l.destination || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">{l.delivery_date || 'Date TBD'}</div>
                  <div className="text-xs bg-slate-700/40 text-slate-300 px-2 py-1 rounded mt-1 inline-block">{l.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- VIP: HEALTHY HUB + SHOWER (on the active load) ----------
function HealthyHubAndShower({ load }) {
  const [hub, setHub] = useState({ loading: false, err: '', items: null });
  const [shower, setShower] = useState(load && load.showerRequested ? 'sent' : 'idle');

  const findStops = async () => {
    setHub({ loading: true, err: '', items: null });
    try {
      const dest = (load && load.destination) || '';
      if (!dest) throw new Error('No destination on this load yet.');
      const coords = await new Promise((resolve, reject) => {
        loadGoogleMaps().then(() => {
          const g = new window.google.maps.Geocoder();
          g.geocode({ address: dest + ', USA' }, (res, status) => {
            if (status === 'OK' && res && res[0]) {
              const loc = res[0].geometry.location;
              resolve({ lat: loc.lat(), lng: loc.lng() });
            } else reject(new Error('Could not locate destination — enable the Geocoding API.'));
          });
        }).catch(reject);
      });
      const [gyms, grocers, dining] = await Promise.all([
        placesNear('truck accessible gym fitness center', coords.lat, coords.lng, 30000),
        placesNear('grocery store healthy food', coords.lat, coords.lng, 30000),
        placesNear('healthy high protein restaurant', coords.lat, coords.lng, 30000),
      ]);
      const pick = (arr, n) => arr.slice(0, n).map((r) => ({ name: r.name, addr: r.formatted_address }));
      setHub({ loading: false, err: '', items: { gyms: pick(gyms, 3), grocers: pick(grocers, 3), dining: pick(dining, 3) } });
    } catch (e) {
      setHub({ loading: false, err: e.message || 'Could not load stops — enable the Places + Geocoding APIs.', items: null });
    }
  };

  const requestShower = async () => {
    if (!load || !load.id) return;
    setShower('sending');
    try {
      await updateDoc(doc(db, 'loads', load.id), { showerRequested: true, showerRequestedAt: serverTimestamp() });
      setShower('sent');
    } catch (e) { console.error('Shower request failed:', e); setShower('idle'); alert('Could not send request — try again.'); }
  };

  const Group = ({ title, items, icon }) => (
    <div>
      <div className="text-xs font-semibold text-amber-400 mb-2">{icon} {title}</div>
      {(!items || items.length === 0) ? <div className="text-xs text-slate-500">None found nearby.</div> : (
        <div className="space-y-1.5">
          {items.map((x, i) => (
            <a key={i} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.name + ' ' + (x.addr || ''))}`} target="_blank" rel="noopener noreferrer" className="block bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 hover:border-amber-500/40">
              <div className="text-sm text-white truncate">{x.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{x.addr}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><HeartPulse className="text-amber-500" size={20} /> Healthy Hub &amp; Wellness Stops</h3>
        <Badge tone="amber" className="font-bold tracking-wide">VIP</Badge>
      </div>
      <p className="text-sm text-slate-400">Premium stops near your delivery — gyms, grocers, and clean dining — so you don't waste time scrolling maps.</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={findStops} disabled={hub.loading} className="text-sm bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg disabled:opacity-50">{hub.loading ? 'Finding…' : '🧭 Find stops near my delivery'}</button>
        <button onClick={requestShower} disabled={shower !== 'idle'} className={`text-sm px-3 py-2 rounded-lg border ${shower === 'sent' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'} disabled:opacity-70`}>
          {shower === 'sent' ? '✓ Shower requested' : shower === 'sending' ? 'Sending…' : '🚿 Request a shower at next stop'}
        </button>
      </div>
      {hub.err && <p className="text-xs text-red-400">{hub.err}</p>}
      {hub.items && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Group title="Fitness" items={hub.items.gyms} icon="🏋️" />
          <Group title="Grocers" items={hub.items.grocers} icon="🥗" />
          <Group title="Clean Dining" items={hub.items.dining} icon="🍱" />
        </div>
      )}
    </Card>
  );
}

// ---------- SAFE PARKING ----------
function SafeParkingView() {
  const admin = ADMIN_EMAILS.map((e) => e.toLowerCase()).includes((auth.currentUser?.email || '').toLowerCase());
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const blank = { name: '', highway_exit: '', state: '', security_level: '', has_showers: false, notes: '' };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fetchSpots = async () => {
    try {
      const snap = await getDocs(orgScoped('safe_parking'));
      setSpots(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error loading parking spots:', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchSpots(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'safe_parking'), stampOrg({ ...form, createdAt: serverTimestamp() }));
      setSpots((p) => [{ id: ref.id, ...form }, ...p]);
      setForm(blank); setShowForm(false);
    } catch (err) {
      console.error('Error adding spot:', err);
      alert('Could not save — check the console.');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id) => {
    if (!window.confirm('Remove this parking spot?')) return;
    try {
      await deleteDoc(doc(db, 'safe_parking', id));
      setSpots((p) => p.filter((s) => s.id !== id));
    } catch (err) { console.error('Error removing spot:', err); }
  };

  const field = INPUT_CLS;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold mb-2">Trusted Safe Parking</h2>
          <p className="text-slate-400">Pre-verified, high-security stops for your route.</p>
          <div className="mt-3"><GuidedHint>Curate trusted, secure overnight stops for your carriers. Add the ones you vouch for — they show up on the driver’s route.</GuidedHint></div>
        </div>
        {admin && (
          <PrimaryButton onClick={() => setShowForm((s) => !s)} className="text-sm shrink-0"><Plus size={18} /> Add Spot</PrimaryButton>
        )}
      </div>

      {admin && showForm && (
        <Card className="p-6">
          <form onSubmit={add} className="space-y-4">
          <h3 className="font-bold">New Parking Spot</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name"><input className={field} value={form.name} onChange={set('name')} placeholder="TA Travel Center" /></Field>
            <Field label="Highway / Exit"><input className={field} value={form.highway_exit} onChange={set('highway_exit')} placeholder="I-75 Exit 201" /></Field>
            <Field label="State"><input className={field} value={form.state} onChange={set('state')} placeholder="GA" /></Field>
            <Field label="Security Level"><input className={field} value={form.security_level} onChange={set('security_level')} placeholder="High / Gated" /></Field>
            <Field label="Notes" className="sm:col-span-2"><input className={field} value={form.notes} onChange={set('notes')} placeholder="Lighting, fuel, restaurant, etc." /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className="w-4 h-4 accent-amber-500" checked={form.has_showers} onChange={(e) => setForm((f) => ({ ...f, has_showers: e.target.checked }))} /> Showers available</label>
          </div>
          <div className="flex items-center gap-3">
            <PrimaryButton type="submit" disabled={saving} className="px-5 py-2.5">{saving ? 'Saving…' : 'Save Spot'}</PrimaryButton>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
          </div>
          </form>
        </Card>
      )}

      {loading && <div className="text-slate-400">Loading parking spots…</div>}
      {!loading && spots.length === 0 && <Card className="p-10 text-center text-slate-400">No parking spots yet.{admin ? ' Tap "Add Spot" to enter your trusted stops.' : ''}</Card>}

      {spots.map((spot) => (
        <Card key={spot.id} className="p-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex gap-4 items-center">
            <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-xl"><MapPin size={24} /></div>
            <div>
              <h3 className="text-xl font-bold text-white">{spot.name}</h3>
              <p className="text-slate-400 text-sm">{spot.highway_exit} • {spot.state}</p>
              {spot.notes && <p className="text-slate-500 text-xs mt-1">{spot.notes}</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                {spot.security_level && <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">{spot.security_level} Security</span>}
                {spot.has_showers && <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">Showers</span>}
              </div>
            </div>
          </div>
          {admin ? (
            <button onClick={() => remove(spot.id)} className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-2 rounded-lg shrink-0">Remove</button>
          ) : (
            <button
              disabled
              aria-disabled="true"
              title="Reservations aren't live yet — call ahead to confirm a spot."
              className="bg-slate-800 text-slate-500 font-semibold px-4 py-2 rounded-lg shrink-0 cursor-default"
            >
              Reservations coming soon
            </button>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------- COMPLIANCE ----------
function ComplianceView({ uid, isAdmin }) {
  const targetUid = uid || auth.currentUser?.uid;
  const admin = !!isAdmin;
  // The carrier who owns this record can edit it too (their own license /
  // medical / insurance dates), not just a dispatcher viewing-as.
  const canEdit = admin || (auth.currentUser && auth.currentUser.uid === targetUid);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const blank = { cdl_expiration_date: '', medical_card_expiration: '', insurance_status: '', insurance_expiration: '' };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fetchCompliance = async () => {
    try {
      const snap = await getDoc(doc(db, 'compliance', targetUid));
      if (snap.exists()) setData(snap.data());
      else setData(null);
    } catch (err) {
      console.error('Error loading compliance:', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchCompliance(); }, []);

  const openEdit = () => { setForm({ ...blank, ...(data || {}) }); setEditing(true); };
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'compliance', targetUid), stampOrg({ ...form, updatedAt: serverTimestamp() }), { merge: true });
      setData((d) => ({ ...(d || {}), ...form }));
      setEditing(false);
    } catch (err) {
      console.error('Error saving compliance:', err);
      alert('Could not save — check the console.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (str) => str ? new Date(str + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const status = (str) => {
    if (!str) return { label: 'Not on file', cls: 'text-slate-500' };
    const days = (new Date(str + 'T00:00:00') - new Date()) / 86400000;
    if (days < 0) return { label: 'Expired', cls: 'text-red-400' };
    if (days <= 30) return { label: `Expiring in ${Math.ceil(days)} days`, cls: 'text-amber-400' };
    return { label: 'Valid', cls: 'text-emerald-400' };
  };
  const field = INPUT_CLS;

  if (loading) return <div className="max-w-4xl mx-auto text-slate-400">Loading compliance data…</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold mb-2">Compliance Dashboard</h2>
          <p className="text-slate-400">Stay ahead of expiration dates and keep your status green.</p>
          <p className="text-xs text-slate-500 mt-2">{admin ? 'You can enter or update these dates for the carrier here.' : 'Keep your CDL, medical card, and insurance dates current — your dispatcher sees them and the portal warns you before anything lapses.'}</p>
          <div className="mt-3"><GuidedHint>Keep CDL, medical card, and insurance dates current. The portal warns 30 days out, the bell flags anything expired, and the dispatch guard stops you sending a load to a carrier with expired docs.</GuidedHint></div>
        </div>
        {canEdit && !editing && (
          <PrimaryButton onClick={openEdit} className="text-sm shrink-0">{data ? 'Edit Dates' : 'Add Record'}</PrimaryButton>
        )}
      </div>

      {editing ? (
        <Card className="p-6">
          <form onSubmit={save} className="space-y-4">
          <h3 className="font-bold">Edit Compliance Record</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="CDL Expiration"><input className={field} type="date" value={form.cdl_expiration_date} onChange={set('cdl_expiration_date')} /></Field>
            <Field label="Medical Card Expiration"><input className={field} type="date" value={form.medical_card_expiration} onChange={set('medical_card_expiration')} /></Field>
            <Field label="Insurance Status"><input className={field} value={form.insurance_status} onChange={set('insurance_status')} placeholder="Active / Lapsed" /></Field>
            <Field label="Insurance Expiration"><input className={field} type="date" value={form.insurance_expiration} onChange={set('insurance_expiration')} /></Field>
          </div>
          <div className="flex items-center gap-3">
            <PrimaryButton type="submit" disabled={saving} className="px-5 py-2.5">{saving ? 'Saving…' : 'Save'}</PrimaryButton>
            <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
          </div>
          </form>
        </Card>
      ) : !data ? (
        <Card className="p-10 text-center text-slate-400">
          No compliance record yet.{admin ? ' Tap "Add Record" to enter CDL, medical, and insurance dates.' : ' Your dispatcher will add this shortly.'}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card className="p-6">
            <div className="text-slate-400 mb-2">CDL Expiration</div>
            <div className="text-2xl font-bold text-white">{formatDate(data.cdl_expiration_date)}</div>
            <div className={`text-sm mt-2 ${status(data.cdl_expiration_date).cls}`}>{status(data.cdl_expiration_date).label}</div>
          </Card>
          <Card className="p-6">
            <div className="text-slate-400 mb-2">Medical Card</div>
            <div className="text-2xl font-bold text-white">{formatDate(data.medical_card_expiration)}</div>
            <div className={`text-sm mt-2 ${status(data.medical_card_expiration).cls}`}>{status(data.medical_card_expiration).label}</div>
          </Card>
          <Card className="p-6">
            <div className="text-slate-400 mb-2">Insurance</div>
            <div className="text-2xl font-bold text-white">{data.insurance_status || '—'}</div>
            <div className={`text-sm mt-2 ${data.insurance_expiration ? status(data.insurance_expiration).cls : 'text-emerald-400'}`}>
              {data.insurance_expiration ? `Renews ${formatDate(data.insurance_expiration)} · ${status(data.insurance_expiration).label}` : 'On file'}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- DIGITAL VAULT ----------
const VAULT_CATEGORIES = ['BOL', 'POD', 'Rate Con', 'Lumper Receipt', 'Scale Ticket', 'COI', 'W-9', 'Authority', 'Other'];

// Real document vault: files in Storage (vault/{uid}/), records in Firestore
// (vault_docs, org-scoped). Carrier manages their own; a dispatcher viewing the
// carrier can approve/reject. Deleting ARCHIVES (kept on file for records).
function DigitalVaultView({ uid, isAdmin = false }) {
  const targetUid = uid || auth.currentUser?.uid;
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ file: null, fileName: '', category: 'BOL', loadId: '' });
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'vault_docs'), where('uid', '==', targetUid)));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      setDocs(rows);
    } catch (e) { console.error('vault load failed', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchDocs(); }, [targetUid]);

  const statusStyle = (status) => {
    if (status === 'Approved') return 'text-emerald-400 bg-emerald-400/10';
    if (status === 'Rejected') return 'text-red-400 bg-red-400/10';
    return 'text-amber-400 bg-amber-400/10';
  };

  const onFile = (e) => { const f = e.target.files[0]; if (f) setForm((s) => ({ ...s, file: f, fileName: f.name })); };

  const upload = async (e) => {
    e.preventDefault(); setErr('');
    if (!form.file) { setErr('Choose a file first.'); return; }
    setUploading(true);
    try {
      const path = `vault/${targetUid}/${Date.now()}_${form.file.name}`;
      const url = await uploadToStorage(path, form.file);
      await addDoc(collection(db, 'vault_docs'), stampOrg({
        uid: targetUid, name: form.file.name, category: form.category, loadId: form.loadId.trim(),
        url, storagePath: path, status: 'Pending Approval', archived: false,
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        createdAtMs: Date.now(), createdAt: serverTimestamp(), uploadedBy: auth.currentUser?.email || '',
      }));
      setForm({ file: null, fileName: '', category: 'BOL', loadId: '' });
      setShowForm(false);
      fetchDocs();
    } catch (e2) {
      console.error('vault upload failed', e2);
      setErr(e2.code === 'storage/unauthorized' ? 'Publish the updated Storage rules to enable the vault.' : (e2.message || 'Upload failed'));
    } finally { setUploading(false); }
  };

  const setStatus = async (d, status) => {
    try { await updateDoc(doc(db, 'vault_docs', d.id), { status }); setDocs((p) => p.map((x) => (x.id === d.id ? { ...x, status } : x))); }
    catch (e) { console.error('status update failed', e); }
  };
  const archive = async (d) => {
    if (!window.confirm(`Archive "${d.name}"? It's removed from the active vault but kept on file for your records.`)) return;
    try { await updateDoc(doc(db, 'vault_docs', d.id), { archived: true, archivedAt: serverTimestamp() }); fetchDocs(); }
    catch (e) { console.error('archive failed', e); }
  };
  const restore = async (d) => {
    try { await updateDoc(doc(db, 'vault_docs', d.id), { archived: false }); fetchDocs(); }
    catch (e) { console.error('restore failed', e); }
  };

  const visible = docs
    .filter((d) => (showArchived ? d.archived : !d.archived))
    .filter((d) => filter === 'All' || d.category === filter);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">The Digital Vault</h2>
          <p className="text-slate-400">Your secure document cabinet — missing paperwork means missing pay.</p>
          <div className="mt-3"><GuidedHint>Every load’s paperwork lives here — BOL, RateCon, lumper receipts, POD. A complete vault is the proof package that gets a carrier paid and wins a dispute.</GuidedHint></div>
        </div>
        <PrimaryButton onClick={() => setShowForm((s) => !s)} className="shrink-0">
          <Upload size={18} /> Upload
        </PrimaryButton>
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={upload} className="space-y-4">
          <h3 className="font-bold">New Document</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="File (image or PDF)">
              <input type="file" accept="image/*,application/pdf" onChange={onFile}
                className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:cursor-pointer hover:file:bg-slate-700" />
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))} className={SELECT_CLS}>
                {VAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Load ID (optional)">
              <input type="text" value={form.loadId} onChange={(e) => setForm((s) => ({ ...s, loadId: e.target.value }))} placeholder="e.g. FM-8831" className={INPUT_CLS} />
            </Field>
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex items-center gap-3 flex-wrap">
            <PrimaryButton type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Add to Vault'}</PrimaryButton>
            <button type="button" onClick={() => { setShowForm(false); setErr(''); }} className="text-slate-400 hover:text-white text-sm">Cancel</button>
          </div>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {['All', ...VAULT_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilter(c)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              filter === c ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
            }`}>
            {c}
          </button>
        ))}
        <button onClick={() => setShowArchived((s) => !s)}
          className={`ml-auto text-xs px-3 py-1.5 rounded-full border transition-colors ${showArchived ? 'bg-slate-700 text-white border-slate-600' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'}`}>
          {showArchived ? '← Back to active' : 'View archived'}
        </button>
      </div>

      {loading ? (
        <div className="text-slate-500 text-center py-12">Loading your vault…</div>
      ) : visible.length === 0 ? (
        <div className="text-slate-500 text-center py-12">{showArchived ? 'Nothing archived.' : 'No documents here yet — hit Upload to add your first.'}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((d) => (
            <Card key={d.id} className="p-5 flex items-start gap-4 hover:border-slate-700 transition-colors">
              <a href={d.url || undefined} target="_blank" rel="noopener noreferrer" className="p-3 bg-slate-800 text-amber-500 rounded-xl shrink-0 hover:bg-slate-700"><FileText size={22} /></a>
              <div className="min-w-0 flex-1">
                <a href={d.url || undefined} target="_blank" rel="noopener noreferrer" className="font-semibold text-white truncate block hover:text-amber-400">{d.name}</a>
                <div className="text-xs text-slate-400 mt-1">{d.loadId ? `Load ${d.loadId} • ` : ''}{d.date}</div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">{d.category}</span>
                  <span className={`text-xs px-2 py-1 rounded ${statusStyle(d.status)}`}>{d.status}</span>
                </div>
                {!showArchived && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {isAdmin && d.status !== 'Approved' && <button onClick={() => setStatus(d, 'Approved')} className="text-xs text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 rounded-lg hover:bg-emerald-500/20">Approve</button>}
                    {isAdmin && d.status !== 'Rejected' && <button onClick={() => setStatus(d, 'Rejected')} className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-2.5 py-1 rounded-lg hover:bg-red-500/20">Reject</button>}
                    <button onClick={() => archive(d)} className="text-xs text-slate-400 border border-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-800">Archive</button>
                  </div>
                )}
                {showArchived && (
                  <div className="mt-3"><button onClick={() => restore(d)} className="text-xs text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg hover:bg-amber-500/10">Restore</button></div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
// ---------- FINANCIALS ----------
function FinancialsView({ uid }) {
  const targetUid = uid || auth.currentUser?.uid;
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLoads = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', targetUid)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (b.delivery_date || '').localeCompare(a.delivery_date || ''));
        setLoads(rows);
      } catch (e) {
        console.error('Error loading financials:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchLoads();
  }, []);

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const feeRateOf = (l) => feePctOf(l.feePct) / 100;
  const settled = loads.filter((l) => l.status === 'Delivered' || l.status === 'Cleared');
  const totalGross = settled.reduce((s, l) => s + (Number(l.gross_pay) || 0), 0);
  const totalFee = settled.reduce((s, l) => s + (Number(l.gross_pay) || 0) * feeRateOf(l), 0);
  const totalNet = totalGross - totalFee;
  const fmtDate = (str) => str ? new Date(str + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const statusStyle = (s) => {
    if (s === 'Cleared') return 'text-emerald-400 bg-emerald-400/10';
    if (s === 'Delivered') return 'text-blue-400 bg-blue-400/10';
    return 'text-amber-400 bg-amber-400/10';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Financial Routing</h2>
        <p className="text-slate-400">How you get paid, and your load-by-load settlement ledger.</p>
        <GuidedHint>Shows the carrier how they get paid (through their factoring company) and their settlement ledger — gross, your fee, their net, computed automatically per load.</GuidedHint>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Gross Earned (Delivered)" value={money(totalGross)} className="p-5" />
        <StatTile label="Dispatch Fees" value={money(totalFee)} accent="amber" className="p-5" />
        <StatTile label="Your Net Payout" value={money(totalNet)} accent="emerald" className="p-5" />
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-amber-500/15 text-amber-500 shrink-0"><Building size={24} /></div>
          <div>
            <h3 className="text-xl font-bold mb-1">How you get paid</h3>
            <p className="text-sm text-slate-400">You get paid through your factoring company. Your dispatcher submits your signed BOL with a Notice of Assignment, and your factor funds you the full amount (often next business day). Per your signed agreement, your dispatch fee is due within 24 hours of you receiving that payment — it's not deducted before it reaches you. <span className="text-slate-300">We never touch your bank account</span> — your exact split on every load is in the ledger below.</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 overflow-x-auto">
        <h3 className="text-lg font-bold mb-4">Settlements Ledger</h3>
        {loading ? (
          <SkelRows rows={3} />
        ) : loads.length === 0 ? (
          <div className="text-slate-500 text-sm py-6 text-center">No loads yet. Settlements appear here once your dispatcher assigns and delivers loads.</div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-800">
                <Th>Load</Th><Th>Delivery</Th><Th>Gross</Th><Th>Fee</Th><Th>Your Net</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loads.map((l) => {
                const gross = Number(l.gross_pay) || 0;
                const fee = gross * feeRateOf(l);
                return (
                  <tr key={l.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <Td className="font-mono text-amber-500">{l.loadId || '—'}</Td>
                    <Td className="text-slate-400">{fmtDate(l.delivery_date)}</Td>
                    <Td className="font-semibold text-white">{money(gross)}</Td>
                    <Td className="text-slate-400">{money(fee)}</Td>
                    <Td className="font-semibold text-emerald-400">{money(gross - fee)}</Td>
                    <Td><span className={`px-2 py-1 rounded text-xs ${statusStyle(l.status)}`}>{l.status || '—'}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------- WELLNESS ----------
function WellnessView() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center px-4">
      <HeartPulse size={64} className="mb-4 text-slate-700" />
      <h2 className="text-xl font-bold text-slate-300 mb-2">Wellness & Diet Routing</h2>
      <p className="max-w-md">Your diet preferences and gym requirements actively filter your route. Full module coming soon.</p>
      <div className="mt-4 max-w-md text-left"><GuidedHint>A VIP concierge perk — diet and gym routing for the driver. Placeholder for now; the live Healthy Hub already runs on the active load in Lane Management.</GuidedHint></div>
    </div>
  );
}

// ---------- PET LOGISTICS ----------
function PetLogisticsView() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">Pet Logistics Dashboard <Badge tone="slate" className="font-normal">Example</Badge></h2>
          <p className="text-slate-400">Managing Lady's road life so you don't have to worry. <span className="text-slate-500">(Sample data — full module coming soon.)</span></p>
          <div className="mt-3"><GuidedHint>A VIP concierge perk showing how you’d manage a driver’s pet on the road. Sample data for now — it demonstrates the premium experience to carriers.</GuidedHint></div>
        </div>
        <PrimaryButton className="shrink-0">
          <ShieldCheck size={18} /> Emergency Vet Connect
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 p-6 flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-slate-800 rounded-full border-4 border-amber-500/30 flex items-center justify-center mb-4">
            <Dog size={48} className="text-amber-500/80" />
          </div>
          <h3 className="text-xl font-bold">Lady</h3>
          <p className="text-sm text-slate-400 mb-4">Golden Retriever • 4 yrs</p>
          <div className="w-full bg-slate-800 rounded-lg p-3 text-left space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Vaccines</span><span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={14} /> Up to date</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Diet</span><span className="text-slate-200">Fresh Sub</span></div>
          </div>
        </Card>

        <div className="md:col-span-2 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Activity className="text-amber-500" size={20} /> Predictive Nutrition Engine</h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 bg-slate-800 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Current Supply</div>
                <div className="text-2xl font-bold">3 Days <span className="text-sm text-slate-500 font-normal">left</span></div>
                <div className="w-full bg-slate-700 h-2 mt-3 rounded-full overflow-hidden"><div className="bg-amber-500 w-1/4 h-full rounded-full"></div></div>
              </div>
              <div className="flex-1 bg-slate-800 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Next Delivery</div>
                <div className="text-lg font-bold text-emerald-400">Oct 28th Intercept</div>
                <div className="text-sm text-slate-300 mt-1">Rerouted to Dallas Terminal</div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Map className="text-blue-500" size={20} /> Pet-Friendly Waypoints</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div>
                  <div className="font-semibold text-sm">Buc-ee's Dog Walk Area</div>
                  <div className="text-xs text-slate-400">I-20 East, Exit 45 • 120 mi away</div>
                </div>
                <button className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition-colors text-white shrink-0">Add to GPS</button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <div>
                  <div className="font-semibold text-sm">Rest Stop 44 (Fenced)</div>
                  <div className="text-xs text-slate-400">I-20 East, Exit 88 • 250 mi away</div>
                </div>
                <button className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition-colors text-white shrink-0">Add to GPS</button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- ADMIN: ASSIGN LOAD ----------
function AssignLoadView() {
  const [drivers, setDrivers] = useState([]);
  const [carriers, setCarriers] = useState([]); // for feePct lookup by linked driver — keeps fee math aligned with the calculator's assign flow
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');

  const blank = {
    driverUid: '',
    loadId: 'FM-' + Math.floor(100000 + Math.random() * 900000),
    origin: '', destination: '', commodity: '', weight: '',
    po_number: '', pickup_number: '', pickup_time: '',
    delivery_time: '', delivery_date: '', gross_pay: '',
  };
  const [form, setForm] = useState(blank);

  useEffect(() => {
    const loadDrivers = async () => {
      try {
        const [uSnap, cSnap] = await Promise.all([getDocs(orgScoped('users')), getDocs(orgScoped('carriers'))]);
        setDrivers(uSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));
        setCarriers(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Error loading drivers:', e);
      } finally {
        setLoading(false);
      }
    };
    loadDrivers();
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.driverUid || !form.origin || !form.destination) return;
    setSaving(true);
    setDone('');
    try {
      // Keep a dispatcher-typed load ID if it's unique; otherwise (empty or a
      // clash with an existing load) assign a guaranteed-unique one.
      let loadId = (form.loadId || '').trim();
      try {
        if (!loadId || !(await getDocs(query(orgScoped('loads'), where('loadId', '==', loadId)))).empty) loadId = await genLoadId();
      } catch (_) { if (!loadId) loadId = await genLoadId(); }
      // Stamp the carrier's own fee % onto the load — mirrors the Rate
      // Calculator's assignLoad() — so this load counts correctly (not at
      // the 10% default) everywhere fee math is computed from it.
      const carrier = carriers.find((c) => c.linkedDriverUid === form.driverUid);
      await addDoc(collection(db, 'loads'), stampOrg({
        ...form,
        loadId,
        uid: form.driverUid,
        gross_pay: Number(form.gross_pay) || 0,
        feePct: feePctOf(carrier && carrier.feePct),
        status: 'Dispatched',
        createdAt: serverTimestamp(),
      }));
      const drv = drivers.find((d) => d.uid === form.driverUid);
      setDone(`Load ${loadId} assigned to ${drv?.email || 'driver'} ✓`);
      setForm({ ...blank, loadId: 'FM-' + Math.floor(100000 + Math.random() * 900000) });
    } catch (e) {
      console.error('Error assigning load:', e);
      setDone('Error assigning load — check the console.');
    } finally {
      setSaving(false);
    }
  };

  const field = INPUT_CLS;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Assign a Load</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Create a load and assign it to a driver — it appears instantly in their Lane Management & Schedule.</p>
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <div className="font-semibold text-amber-300 flex items-center gap-2">⚠️ This assigns the load directly — no accept/decline</div>
        <p className="text-slate-300 mt-1">The carrier is committed the moment you assign it here; they can’t review or decline. If you want them to confirm the rate first, price it in the <strong>Rate Calculator</strong> and use <strong>“Send as Offer”</strong> instead — that also runs the rate-floor, HOS, and compliance safety checks before it goes out.</p>
      </div>

      {loading ? (
        <div className="text-slate-400">Loading drivers…</div>
      ) : (
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-5">
          <Field label="Driver">
            <select className={field} value={form.driverUid} onChange={(e) => set('driverUid', e.target.value)} required>
              <option value="">Select a driver…</option>
              {drivers.map((d) => <option key={d.uid} value={d.uid}>{d.email || d.uid}</option>)}
            </select>
            {drivers.length === 0 && <p className="text-xs text-amber-400 mt-2">No drivers yet — a driver has to log in once before they show up here.</p>}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Load ID"><input className={field} value={form.loadId} onChange={(e) => set('loadId', e.target.value)} /></Field>
            <Field label="Gross Pay ($)"><input className={field} type="number" value={form.gross_pay} onChange={(e) => set('gross_pay', e.target.value)} placeholder="2450" /></Field>
            <Field label="Origin (Pickup)"><input className={field} value={form.origin} onChange={(e) => set('origin', e.target.value)} placeholder="Atlanta, GA" required /></Field>
            <Field label="Destination (Delivery)"><input className={field} value={form.destination} onChange={(e) => set('destination', e.target.value)} placeholder="Dallas, TX" required /></Field>
            <Field label="Commodity"><input className={field} value={form.commodity} onChange={(e) => set('commodity', e.target.value)} placeholder="Dry goods" /></Field>
            <Field label="Weight"><input className={field} value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="42,000 lbs" /></Field>
            <Field label="PO Number"><input className={field} value={form.po_number} onChange={(e) => set('po_number', e.target.value)} /></Field>
            <Field label="Pickup Number"><input className={field} value={form.pickup_number} onChange={(e) => set('pickup_number', e.target.value)} /></Field>
            <Field label="Pickup Time"><input className={field} value={form.pickup_time} onChange={(e) => set('pickup_time', e.target.value)} placeholder="Oct 24, 8:00 AM" /></Field>
            <Field label="Delivery Time"><input className={field} value={form.delivery_time} onChange={(e) => set('delivery_time', e.target.value)} placeholder="Oct 25, 4:00 PM" /></Field>
            <Field label="Delivery Date"><input className={field} type="date" value={form.delivery_date} onChange={(e) => set('delivery_date', e.target.value)} /></Field>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <PrimaryButton type="submit" disabled={saving} className="px-5 py-2.5">
              {saving ? 'Assigning…' : 'Assign Load'}
            </PrimaryButton>
            {done && <span className="text-sm text-emerald-400">{done}</span>}
          </div>
          </form>
        </Card>
      )}
    </div>
  );
}
// ---------- TRIP PLAN (route-aware briefing) ----------
// v1 is pure logic + your own Safe Parking data — no external routing API, no
// cost. Distance comes from the load's loaded+deadhead miles; drive time and
// the Hours-of-Service overnight breakpoints are computed; trusted parking is
// matched to the origin/destination states. A later version can layer in
// truck-legal routing + weather along the corridor.
const US_STATE_CODES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
function stateCodeFrom(loc) {
  if (!loc) return null;
  const toks = String(loc).toUpperCase().match(/\b[A-Z]{2}\b/g);
  if (!toks) return null;
  for (let i = toks.length - 1; i >= 0; i--) if (US_STATE_CODES.has(toks[i])) return toks[i];
  return null;
}
function TripPlanPanel({ load }) {
  const [spots, setSpots] = useState([]);
  useEffect(() => {
    let live = true;
    (async () => {
      try { const snap = await getDocs(orgScoped('safe_parking')); if (live) setSpots(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); }
      catch (e) { console.error('trip plan parking load failed', e); }
    })();
    return () => { live = false; };
  }, []);

  const AVG_MPH = 55, MAX_DRIVE = 11; // realistic OTR average + daily driving cap
  const loaded = Number(load.loadedMiles) || 0;
  const dead = Number(load.deadheadMiles) || 0;
  const totalMi = loaded + dead;
  const driveHrs = totalMi / AVG_MPH;
  const days = totalMi > 0 ? Math.max(1, Math.ceil(driveHrs / MAX_DRIVE)) : 0;
  const overnights = days > 0 ? days - 1 : 0;
  const fmtHrs = (h) => { const t = Math.round(h * 60); const hh = Math.floor(t / 60); const mm = t % 60; return hh ? `${hh}h ${mm}m` : `${mm}m`; };

  const oState = stateCodeFrom(load.origin);
  const dState = stateCodeFrom(load.destination);
  const routeStates = [...new Set([oState, dState].filter(Boolean))];
  const matched = spots.filter((s) => routeStates.includes((s.state || '').toUpperCase().trim()));

  const know = [
    ['🕒', 'Hours of Service', `Plan the run against the 11-hour driving / 14-hour on-duty clock and the 70-hour/8-day limit. Build in the required 30-minute break by hour 8.`],
    ['⛽', 'Fuel & scales', `Map fuel stops to the cheaper states on the lane and know which weigh stations are open${routeStates.length ? ` across ${routeStates.join(' → ')}` : ''}.`],
    ['🌦', 'Weather & road', `Check the forecast and any construction/closures along the corridor before dispatch — a mountain pass or storm can add hours.`],
    ['⭐', 'VIP add-ons', `Offer concierge extras where they fit the route: reserved safe parking near the overnight point, Healthy Hub / shower queue, pet logistics.`],
  ];

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
      <div className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
        🗺 Trip Plan
        {oState && dState && <Badge tone="slate">{oState} → {dState}</Badge>}
        <span className="text-[10px] text-slate-500 font-normal">route-aware briefing</span>
      </div>

      {totalMi > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <div><div className="text-[10px] uppercase tracking-wide text-slate-500">Distance</div><div className="font-data font-semibold text-white">{totalMi.toLocaleString()} mi</div></div>
          <div><div className="text-[10px] uppercase tracking-wide text-slate-500">Est. drive</div><div className="font-data font-semibold text-white">{fmtHrs(driveHrs)}</div></div>
          <div><div className="text-[10px] uppercase tracking-wide text-slate-500">Days</div><div className="font-data font-semibold text-white">{days}</div></div>
          <div><div className="text-[10px] uppercase tracking-wide text-slate-500">Overnights</div><div className="font-data font-semibold text-amber-400">{overnights}</div></div>
        </div>
      ) : (
        <p className="text-[11px] text-amber-400/80 mt-2">Add <strong>Loaded Miles</strong> above to get drive time, day count, and overnight planning.</p>
      )}

      {overnights > 0 && (
        <p className="text-xs text-slate-400 mt-3">This run needs about <strong className="text-slate-200">{overnights}</strong> overnight stop{overnights === 1 ? '' : 's'}. End each driving day near a trusted, secure stop — suggestions below.</p>
      )}

      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Trusted parking on this lane</div>
        {matched.length > 0 ? (
          <div className="space-y-1.5">
            {matched.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs text-slate-300">
                <MapPin size={13} className="text-emerald-400 shrink-0" />
                <span className="font-medium text-white">{s.name}</span>
                <span className="text-slate-500">{[s.highway_exit, s.state].filter(Boolean).join(' · ')}</span>
                {s.has_showers && <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">showers</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">{routeStates.length ? `No trusted stops logged for ${routeStates.join(' / ')} yet — add them in Safe Parking so they show up here.` : 'Set the origin and destination (with a state, e.g. “Atlanta, GA”) to match trusted parking.'}</p>
        )}
      </div>

      <div className="mt-3 border-t border-slate-800 pt-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">Know before you roll</div>
        {know.map(([icon, t, body]) => (
          <div key={t} className="flex gap-2 text-xs">
            <span className="shrink-0">{icon}</span>
            <span className="text-slate-400"><strong className="text-slate-200">{t}:</strong> {body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- ADMIN: ALL LOADS ----------
function AllLoadsView({ onNavigate }) {
  const [loads, setLoads] = useState([]);
  const [users, setUsers] = useState({});
  const [userList, setUserList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [driverFilter, setDriverFilter] = useState('All');
  const [loadSearch, setLoadSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rcBusy, setRcBusy] = useState(false);

  // Dispatcher attaches the broker's Rate Confirmation to the load (into the
  // driver's Storage folder so the carrier can view & e-sign it).
  const uploadRateCon = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !editing) return;
    setRcBusy(true);
    try {
      const url = await uploadToStorage(`load_docs/${editing.uid}/ratecon_${editing.id}_${file.name}`, file);
      const patch = { rateConUrl: url, rateConName: file.name };
      await updateDoc(doc(db, 'loads', editing.id), patch);
      setLoads((prev) => prev.map((l) => (l.id === editing.id ? { ...l, ...patch } : l)));
      setEditing((ed) => ({ ...ed, ...patch }));
    } catch (err) {
      console.error('ratecon upload failed', err);
      toast('Upload failed: ' + (err.code === 'storage/unauthorized' ? 'check the Storage rules allow admin write to load_docs.' : (err.message || 'try again')), 'error');
    } finally { setRcBusy(false); }
  };

  const STATUS_FLOW = ['Dispatched', 'Arrived at Shipper', 'Loaded', 'In Transit', 'Delivered'];

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [loadSnap, userSnap] = await Promise.all([
        getDocs(orgScoped('loads')),
        getDocs(orgScoped('users')),
      ]);
      const userMap = {};
      const list = [];
      userSnap.docs.forEach((d) => {
        userMap[d.id] = d.data().email || d.id;
        list.push({ uid: d.id, email: d.data().email || d.id });
      });
      setUsers(userMap);
      setUserList(list);
      const rows = loadSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.delivery_date || '').localeCompare(a.delivery_date || ''));
      setLoads(rows);
    } catch (e) {
      console.error('Error loading all loads:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // LIVE: a carrier accepting/declining an offer, e-signing a RateCon, or
  // advancing a status hits this board instantly — same onSnapshot pattern as
  // the bell and Lane Management. fetchAll() above stays as the initial paint
  // (it also builds the user map) and the fallback if the listener errors.
  useEffect(() => {
    const unsub = onSnapshot(
      orgScoped('loads'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (b.delivery_date || '').localeCompare(a.delivery_date || ''));
        setLoads(rows);
        setLoading(false);
      },
      (e) => console.error('all-loads live listener failed', e) // one-shot data from fetchAll still stands
    );
    return () => unsub();
  }, []);

  const changeStatus = async (loadDocId, newStatus) => {
    if (!newStatus) return;
    setUpdatingId(loadDocId);
    try {
      await updateDoc(doc(db, 'loads', loadDocId), { status: newStatus });
      setLoads((prev) => prev.map((l) => (l.id === loadDocId ? { ...l, status: newStatus } : l)));
      if (newStatus === 'Delivered') {
        const l = loads.find((x) => x.id === loadDocId);
        if (l && !l.delivery_date) toast("No delivery date — this load won't appear on any invoice or monthly statement until one is set.", 'error');
      }
    } catch (e) {
      console.error('Error updating status:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  // Send / cancel a pending offer the carrier must accept or decline.
  const setOffer = async (id, val, extra = {}) => {
    setUpdatingId(id);
    try {
      const patch = { offerStatus: val, ...extra };
      await updateDoc(doc(db, 'loads', id), patch);
      setLoads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    } catch (e) {
      console.error('Error setting offer:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  // --- "Carrier not in the app" mode ---------------------------------------
  // When a carrier doesn't use the portal, the dispatcher runs the load on
  // their behalf: accept the offer once the carrier confirms by phone/text, and
  // record the RateCon e-signature (the LPOA authorizes signing rate cons for
  // them). Proof docs are already uploadable via the LoadDocsPanel below.
  const acceptOnBehalf = async (l) => {
    if (!window.confirm(`Accept load ${l.loadId || ''} on ${users[l.uid] || 'the carrier'}'s behalf?\n\nUse this only when the carrier has confirmed by phone or text and isn't using the app. It moves the load to Dispatched.`)) return;
    setUpdatingId(l.id);
    try {
      const patch = { offerStatus: 'accepted', status: 'Dispatched', offerRespondedAt: serverTimestamp(), offerAcceptedBy: 'dispatcher' };
      await updateDoc(doc(db, 'loads', l.id), patch);
      setLoads((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...patch } : x)));
      setEditing((ed) => (ed && ed.id === l.id ? { ...ed, ...patch } : ed));
    } catch (e) { console.error('accept on behalf failed', e); toast('Could not accept — try again.', 'error'); }
    finally { setUpdatingId(null); }
  };
  const signRateConOnBehalf = async (l) => {
    const who = window.prompt(`Record the Rate Confirmation as signed on ${users[l.uid] || 'the carrier'}'s behalf (authorized by their LPOA).\n\nEnter how it was authorized — shown on the record — e.g. "Verbal OK — J. Smith, ${new Date().toLocaleDateString()}":`, '');
    if (who === null) return;
    const name = who.trim() || `${users[l.uid] || 'Carrier'} (via dispatcher)`;
    try {
      const rec = { name, at: serverTimestamp(), byDispatcher: true };
      await updateDoc(doc(db, 'loads', l.id), { rateConSigned: rec });
      setLoads((prev) => prev.map((x) => (x.id === l.id ? { ...x, rateConSigned: rec } : x)));
      setEditing((ed) => (ed && ed.id === l.id ? { ...ed, rateConSigned: rec } : ed));
    } catch (e) { console.error('sign on behalf failed', e); toast('Could not record the signature — try again.', 'error'); }
  };

  const offerBadge = (s) => {
    if (s === 'pending') return <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded">● Offer sent</span>;
    if (s === 'accepted') return <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded">✓ Accepted</span>;
    if (s === 'declined') return <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded">✕ Declined</span>;
    return null;
  };

  // Offers are created from the Rate Calculator; here admins can only cancel a pending one.
  const OfferButton = ({ l }) => (
    l.offerStatus === 'pending' ? (
      <button onClick={() => setOffer(l.id, 'cancelled', { status: 'Dispatched' })} disabled={updatingId === l.id}
        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">Cancel Offer</button>
    ) : null
  );

  const openEdit = (l) => {
    setEditing(l);
    setForm({
      driverUid: l.uid || '',
      loadId: l.loadId || '',
      origin: l.origin || '',
      destination: l.destination || '',
      commodity: l.commodity || '',
      weight: l.weight || '',
      po_number: l.po_number || '',
      pickup_number: l.pickup_number || '',
      pickup_time: l.pickup_time || '',
      delivery_time: l.delivery_time || '',
      delivery_date: l.delivery_date || '',
      gross_pay: l.gross_pay ?? '',
      loadedMiles: l.loadedMiles ?? '',
      deadheadMiles: l.deadheadMiles ?? '',
      status: l.status || 'Dispatched',
    });
  };

  const closeEdit = () => { setEditing(null); setForm(null); };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, uid: form.driverUid, gross_pay: Number(form.gross_pay) || 0, loadedMiles: Number(form.loadedMiles) || 0, deadheadMiles: Number(form.deadheadMiles) || 0 };
      delete payload.driverUid;
      await updateDoc(doc(db, 'loads', editing.id), payload);
      setLoads((prev) => prev.map((l) => (l.id === editing.id ? { ...l, ...payload } : l)));
      if (payload.status === 'Delivered' && !payload.delivery_date) {
        toast("No delivery date — this load won't appear on any invoice or monthly statement until one is set.", 'error');
      }
      closeEdit();
    } catch (err) {
      console.error('Error saving load:', err);
      toast('Error saving — check the console.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteLoad = async () => {
    if (!editing) return;
    if (!window.confirm(`Delete load ${editing.loadId || ''}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'loads', editing.id));
      setLoads((prev) => prev.filter((l) => l.id !== editing.id));
      closeEdit();
    } catch (err) {
      console.error('Error deleting load:', err);
      toast('Error deleting — check the console.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const driverEmails = Array.from(new Set(loads.map((l) => users[l.uid] || l.uid).filter(Boolean)));

  const q = loadSearch.trim().toLowerCase();
  const filtered = loads.filter((l) => {
    const okStatus = statusFilter === 'All' || l.status === statusFilter;
    const okDriver = driverFilter === 'All' || (users[l.uid] || l.uid) === driverFilter;
    const okSearch = !q || `${l.loadId || ''} ${l.origin || ''} ${l.destination || ''} ${l.commodity || ''} ${users[l.uid] || ''}`.toLowerCase().includes(q);
    return okStatus && okDriver && okSearch;
  });

  const statusStyle = (s) => {
    if (s === 'Delivered' || s === 'Cleared') return 'bg-emerald-500/15 text-emerald-400';
    if (s === 'In Transit') return 'bg-blue-500/15 text-blue-400';
    return 'bg-amber-500/15 text-amber-400';
  };

  const totalGross = filtered.reduce((sum, l) => sum + (Number(l.gross_pay) || 0), 0);

  const StatusSelect = ({ l, full }) => (
    <select
      value={STATUS_FLOW.includes(l.status) ? l.status : ''}
      onChange={(e) => changeStatus(l.id, e.target.value)}
      disabled={updatingId === l.id}
      className={`${full ? 'w-full mt-1 py-2' : 'py-1.5'} text-xs px-2 rounded-lg border-0 focus:outline-none cursor-pointer disabled:opacity-50 ${statusStyle(l.status)}`}
    >
      {!STATUS_FLOW.includes(l.status) && <option value="">{l.status || 'Set status'}</option>}
      {STATUS_FLOW.map((s) => <option key={s} value={s} className="bg-slate-800 text-slate-100">{s}</option>)}
    </select>
  );

  const field = INPUT_CLS;

  if (loading) return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">All Loads</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <Card className="p-6"><SkelRows rows={5} /></Card>
    </div>
  );

  // Full-page load detail (replaces the modal). Clicking a load opens this in
  // place of the list; "← All Loads" returns. No height ceiling, natural scroll.
  if (editing && form) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={closeEdit} className="text-sm text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-medium">← All Loads</button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Load</span>
            <span className="font-mono text-amber-500 font-semibold">{form.loadId || '—'}</span>
            {editing.offerStatus && offerBadge(editing.offerStatus)}
          </div>
        </div>

        <Card className="p-6">
          <form onSubmit={saveEdit} className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Load <span className="font-mono text-amber-500">{form.loadId}</span></h3>
              <button type="button" onClick={closeEdit} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            {editing.offerStatus === 'pending' && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
                <div className="text-sm font-semibold text-white flex items-center gap-2">🤝 Offer pending — carrier hasn’t responded in the app</div>
                <p className="text-[11px] text-slate-400 mt-1">If this carrier doesn’t use the portal, accept on their behalf once they’ve confirmed by phone or text. The load moves to <strong>Dispatched</strong> and you keep working — no need to wait on a login.</p>
                <button type="button" onClick={() => acceptOnBehalf(editing)} disabled={updatingId === editing.id}
                  className="mt-3 text-xs bg-emerald-500 text-slate-950 font-semibold px-3 py-2 rounded-lg disabled:opacity-50">Accept on carrier’s behalf</button>
              </div>
            )}

            <Field label="Driver">
              <select className={field} value={form.driverUid} onChange={(e) => setField('driverUid', e.target.value)} required>
                <option value="">Select a driver…</option>
                {userList.map((d) => <option key={d.uid} value={d.uid}>{d.email}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Load ID"><input className={field} value={form.loadId} onChange={(e) => setField('loadId', e.target.value)} /></Field>
              <Field label="Status">
                <select className={field} value={form.status} onChange={(e) => setField('status', e.target.value)}>
                  {STATUS_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="Cleared">Cleared</option>
                </select>
              </Field>
              <Field label="Gross Pay ($)"><input className={field} type="number" value={form.gross_pay} onChange={(e) => setField('gross_pay', e.target.value)} /></Field>
              <Field label="Delivery Date"><input className={field} type="date" value={form.delivery_date} onChange={(e) => setField('delivery_date', e.target.value)} /></Field>
              <Field label="Loaded Miles"><input className={field} type="number" value={form.loadedMiles} onChange={(e) => setField('loadedMiles', e.target.value)} placeholder="for offer RPM" /></Field>
              <Field label="Deadhead Miles"><input className={field} type="number" value={form.deadheadMiles} onChange={(e) => setField('deadheadMiles', e.target.value)} /></Field>
              <Field label="Origin (Pickup)"><input className={field} value={form.origin} onChange={(e) => setField('origin', e.target.value)} /></Field>
              <Field label="Destination (Delivery)"><input className={field} value={form.destination} onChange={(e) => setField('destination', e.target.value)} /></Field>
              <Field label="Commodity"><input className={field} value={form.commodity} onChange={(e) => setField('commodity', e.target.value)} /></Field>
              <Field label="Weight"><input className={field} value={form.weight} onChange={(e) => setField('weight', e.target.value)} /></Field>
              <Field label="PO Number"><input className={field} value={form.po_number} onChange={(e) => setField('po_number', e.target.value)} /></Field>
              <Field label="Pickup Number"><input className={field} value={form.pickup_number} onChange={(e) => setField('pickup_number', e.target.value)} /></Field>
              <Field label="Pickup Time"><input className={field} value={form.pickup_time} onChange={(e) => setField('pickup_time', e.target.value)} /></Field>
              <Field label="Delivery Time"><input className={field} value={form.delivery_time} onChange={(e) => setField('delivery_time', e.target.value)} /></Field>
            </div>

            <TripPlanPanel load={editing} />

            <LoadStepChecklist
              load={editing}
              onPersist={(steps) => {
                setLoads((prev) => prev.map((l) => (l.id === editing.id ? { ...l, steps } : l)));
                updateDoc(doc(db, 'loads', editing.id), { steps }).catch((e) => console.error('checklist save failed', e));
              }}
            />

            {editing.detention && (
              <div className={`rounded-xl border p-4 ${editing.detention.status === 'resolved' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    ⏱ Detention claim — ${Number(editing.detention.amount || 0).toLocaleString()} ({editing.detention.billableHours}h)
                    <Badge tone={editing.detention.status === 'resolved' ? 'emerald' : 'amber'}>{editing.detention.status === 'resolved' ? 'Resolved' : 'Filed'}</Badge>
                  </div>
                  {editing.detention.status !== 'resolved' && (
                    <GhostButton
                      type="button"
                      onClick={() => {
                        const next = { ...editing.detention, status: 'resolved' };
                        setLoads((prev) => prev.map((l) => (l.id === editing.id ? { ...l, detention: next } : l)));
                        setEditing((e) => ({ ...e, detention: next }));
                        updateDoc(doc(db, 'loads', editing.id), { detention: next }).catch((err) => console.error('resolve failed', err));
                      }}
                      className="text-sm"
                    >Mark Resolved</GhostButton>
                  )}
                </div>
                {editing.detention.notes && <div className="text-xs text-slate-400 mt-2">{editing.detention.notes}</div>}
              </div>
            )}

            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  📄 Rate Confirmation
                  {editing.rateConSigned ? <Badge tone="emerald"><CheckCircle2 size={11} /> Signed by {editing.rateConSigned.name}{editing.rateConSigned.byDispatcher ? ' · on file' : ''}</Badge>
                    : editing.rateConUrl ? <Badge tone="amber">Sent — awaiting signature</Badge>
                    : <Badge tone="slate">Not attached</Badge>}
                </div>
                <label className={`text-xs px-3 py-2 rounded-lg cursor-pointer shrink-0 ${rcBusy ? 'bg-slate-700 text-slate-400' : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700'}`}>
                  {rcBusy ? 'Uploading…' : (editing.rateConUrl ? 'Replace RateCon' : 'Attach broker RateCon')}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={uploadRateCon} disabled={rcBusy} />
                </label>
              </div>
              {editing.rateConUrl && <a href={editing.rateConUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline mt-2 inline-block">View attached document</a>}
              <p className="text-[11px] text-slate-500 mt-2">Attach the broker's RateCon — the carrier reviews and e-signs it from their Lane Management screen.</p>
              {!editing.rateConSigned && (
                <button type="button" onClick={() => signRateConOnBehalf(editing)}
                  className="mt-2 text-xs text-blue-300 border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 rounded-lg hover:bg-blue-500/20">Record e-signature on carrier’s behalf</button>
              )}
            </div>

            <LoadDocsPanel
              load={editing}
              uploadedBy="dispatcher"
              onChanged={(docs) => {
                setEditing((prev) => ({ ...prev, docs }));
                setLoads((prev) => prev.map((l) => (l.id === editing.id ? { ...l, docs } : l)));
              }}
            />

            <div className="flex items-center justify-between gap-3 border-t border-slate-800 mt-1 pt-4 flex-wrap">
              <button type="button" onClick={deleteLoad} disabled={saving} className="text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                Delete Load
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeEdit} className="text-slate-400 hover:text-white text-sm">Cancel</button>
                <PrimaryButton type="submit" disabled={saving} className="px-5 py-2.5">
                  {saving ? 'Saving…' : 'Save Changes'}
                </PrimaryButton>
              </div>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">All Loads</h2>
          <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
        </div>
        <GhostButton onClick={fetchAll} className="text-sm px-3 py-2">Refresh</GhostButton>
      </div>

      <GuidedHint>Your command center for every load. <strong>Click any load</strong> to open its full detail — every field, the <strong>Status</strong> options, and the <strong>Paperwork to Collect</strong> checklist. Use the inline <strong>Status</strong> dropdown to advance a load without opening it, and <strong>Cancel Offer</strong> to pull back a pending offer.</GuidedHint>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile label="Total Loads" value={filtered.length} />
        <StatTile label="In Transit" value={filtered.filter((l) => l.status === 'In Transit').length} accent="blue" />
        <StatTile label="Delivered" value={filtered.filter((l) => l.status === 'Delivered').length} accent="emerald" />
        <StatTile label="Gross (shown)" value={money(totalGross)} accent="emerald" />
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className={`${SELECT_CLS} w-auto`}>
          <option value="All">All drivers</option>
          {driverEmails.map((em) => <option key={em} value={em}>{em}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${SELECT_CLS} w-auto`}>
          <option value="All">All statuses</option>
          {STATUS_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={loadSearch} onChange={(e) => setLoadSearch(e.target.value)} placeholder="Search load #, city, commodity…"
          className={`${INPUT_CLS} w-full sm:w-64`} />
      </div>

      {loads.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-3xl mb-2">🚀</div>
          <h3 className="font-bold text-white mb-1">Get your first load out</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto mb-4">Once you price and send an offer, it'll land here — every load, driver, and status in one place.</p>
          {onNavigate && <PrimaryButton onClick={() => onNavigate('assign')} className="mx-auto">Assign a load →</PrimaryButton>}
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-slate-400">No loads match these filters.</Card>
      ) : (
        <>
          <Card className="hidden md:block overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/30">
                  <Th>Load</Th><Th>Driver</Th><Th>Route</Th><Th>Delivery</Th><Th>Gross</Th><Th>Status</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} onClick={() => openEdit(l)} title="Open full load — details, status & paperwork to collect"
                    className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors cursor-pointer">
                    <Td className="font-mono text-amber-500 font-semibold">{l.loadId || '—'}</Td>
                    <Td className="text-slate-300">{users[l.uid] || <span className="text-slate-500">unknown</span>}</Td>
                    <Td className="text-slate-300">{l.origin || '—'} <span className="text-slate-600">→</span> {l.destination || '—'}</Td>
                    <Td className="text-slate-400">
                      {l.delivery_date || '—'}
                      {!l.delivery_date && (l.status === 'Delivered' || l.status === 'Cleared') && (
                        <Badge tone="warn" className="ml-1.5 align-middle font-normal" title="No delivery date — won't appear on any invoice or monthly statement until one is set.">no date</Badge>
                      )}
                    </Td>
                    <Td className="font-semibold text-white">{money(l.gross_pay)}</Td>
                    <Td onClick={(e) => e.stopPropagation()}><StatusSelect l={l} />{offerBadge(l.offerStatus) && <div className="mt-1">{offerBadge(l.offerStatus)}</div>}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <OfferButton l={l} />
                        <button onClick={() => openEdit(l)} className="text-xs bg-amber-500/90 hover:bg-amber-500 text-slate-950 font-semibold px-3 py-1.5 rounded-lg transition-colors">Open</button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="md:hidden space-y-3">
            {filtered.map((l) => (
              <Card key={l.id} className="p-4 space-y-2">
                <div onClick={() => openEdit(l)} className="space-y-2 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-amber-500 font-semibold text-sm">{l.loadId || '—'}</span>
                    <span className="font-semibold text-white text-sm">{money(l.gross_pay)}</span>
                  </div>
                  <div className="text-sm text-slate-300">{l.origin || '—'} → {l.destination || '—'}</div>
                  <div className="text-xs text-slate-400">Driver: {users[l.uid] || 'unknown'}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                    Delivery: {l.delivery_date || '—'}
                    {!l.delivery_date && (l.status === 'Delivered' || l.status === 'Cleared') && (
                      <Badge tone="warn" className="font-normal" title="No delivery date — won't appear on any invoice or monthly statement until one is set.">no date</Badge>
                    )}
                  </div>
                  {offerBadge(l.offerStatus) && <div>{offerBadge(l.offerStatus)}{l.offerStatus === 'declined' && l.declineReason ? <span className="text-[10px] text-slate-500 ml-2">({l.declineReason})</span> : null}</div>}
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1"><StatusSelect l={l} full /></div>
                  <OfferButton l={l} />
                  <button onClick={() => openEdit(l)} className="text-xs bg-amber-500/90 hover:bg-amber-500 text-slate-950 font-semibold px-3 py-2 rounded-lg transition-colors shrink-0">Open</button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- LOGIN (invite-only) ----------
function LoginView({ accessDenied }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) { setError('Enter your email above first, then tap "Forgot password".'); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice('Password reset link sent — check your email (and spam folder).');
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    }
  };

  return (
    <div className="relative flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-950 to-pagedeep text-slate-100 font-sans p-4 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
      <div className="fm-glow-hero relative w-full max-w-md bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/40">
        <div className="flex justify-center mb-2"><BrandLockup size={42} stack /></div>
        <p className="text-center text-amber-400/90 font-semibold tracking-wide text-sm mb-8">Keep Moving Forward.</p>

        <h2 className="text-xl font-bold mb-2">Sign In</h2>
        <p className="text-sm text-slate-400 mb-6">Access is invite-only. Sign in with the email and temporary password from your welcome email.</p>

        {accessDenied && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            This account isn't authorized for the portal yet. Contact your dispatcher to get access.
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required
            className={`${INPUT_CLS} px-4 py-3`} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required
            className={`${INPUT_CLS} px-4 py-3`} />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {notice && <p className="text-emerald-400 text-sm">{notice}</p>}
          <PrimaryButton type="submit" disabled={busy} className="w-full py-3">
            {busy ? 'Please wait…' : 'Sign In'}
          </PrimaryButton>
          <button type="button" onClick={handleReset} className="w-full text-center text-xs text-slate-400 hover:text-amber-400 transition-colors">
            Forgot password?
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Need access? <a href="https://forwardmotionfreight.com/request-dispatcher-access.html" className="text-amber-400 hover:underline">Request a workspace</a> or ask your dispatcher to add you.
        </p>
      </div>
    </div>
  );
}

// ---------- FIRST-LOGIN PASSWORD CHANGE ----------
function ChangePasswordView({ onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (pw !== pw2) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await updatePassword(auth.currentUser, pw);
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { mustChangePassword: false });
      onDone();
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        setError('For security, please sign out and sign back in, then change your password.');
      } else {
        setError(err.message.replace('Firebase: ', ''));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-950 to-pagedeep text-slate-100 font-sans p-4">
      <div className="w-full max-w-md bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/40">
        <div className="flex justify-center mb-6"><BrandLockup size={36} stack /></div>
        <h2 className="text-xl font-bold mb-2">Set Your Password</h2>
        <p className="text-sm text-slate-400 mb-6">You're using a temporary password. Choose a new one to continue.</p>
        <form onSubmit={submit} className="space-y-4">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" required
            className={`${INPUT_CLS} px-4 py-3`} />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm new password" required
            className={`${INPUT_CLS} px-4 py-3`} />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <PrimaryButton type="submit" disabled={busy} className="w-full py-3">
            {busy ? 'Saving…' : 'Save & Continue'}
          </PrimaryButton>
        </form>
        <button onClick={() => signOut(auth)} className="w-full text-center text-xs text-slate-500 mt-6 hover:text-slate-300">Sign out</button>
      </div>
    </div>
  );
}
// ---------- ADMIN: MANAGE DRIVERS ----------
function ManageDriversView() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [orgInfo, setOrgInfo] = useState({ name: '', dispatchPhone: '' });
  useEffect(() => { (async () => {
    if (!ACTIVE_ORG) return;
    try { const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (o.exists()) setOrgInfo({ name: o.data().name || '', dispatchPhone: o.data().dispatchPhone || '' }); } catch (_) {}
  })(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(orgScoped('users'));
      setList(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    } catch (e) {
      console.error('Error loading drivers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const genPw = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPw(p);
  };

  const createDriver = async (e) => {
    e.preventDefault();
    setError('');
    setCreated(null);
    if (!email || pw.length < 6) { setError('Enter an email and a temp password of at least 6 characters.'); return; }
    setSaving(true);
    try {
      const uid = await createDriverAccount(email.trim(), pw);
      await setDoc(doc(db, 'users', uid), stampOrg({
        email: email.trim(),
        approved: true,
        mustChangePassword: true,
        role: 'driver',
        createdAt: serverTimestamp(),
      }), { merge: true });
      setCreated({ email: email.trim(), pw });
      queueEmail(email.trim(), `Welcome to ${orgInfo.name || 'Forward Motion Freight'} — your portal is ready`,
        welcomeCarrierEmail({ name: '', email: email.trim(), tempPw: pw, company: orgInfo.name, phone: orgInfo.dispatchPhone }));
      setEmail(''); setPw('');
      fetchUsers();
    } catch (err) {
      setError(err.code === 'auth/email-already-in-use'
        ? 'That email already has a login. If you revoked it, just re-approve it in the list below — the account is kept (it isn\'t deleted when you revoke or remove a carrier).'
        : err.message.replace('Firebase: ', ''));
    } finally {
      setSaving(false);
    }
  };

  const setApproved = async (uid, value) => {
    try {
      await updateDoc(doc(db, 'users', uid), { approved: value });
      setList((prev) => prev.map((u) => (u.uid === uid ? { ...u, approved: value } : u)));
    } catch (err) {
      console.error('Error updating approval:', err);
    }
  };

  const isAdminEmail = (em) => ADMIN_EMAILS.map((e) => e.toLowerCase()).includes((em || '').toLowerCase());
  const field = INPUT_CLS;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Logins &amp; Access</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400"><strong className="text-slate-300">This tab is only about portal access</strong> — who can log in. Create the login &amp; temporary password here, then approve or revoke sign-in. The carrier's business details (MC#, equipment, rates, VIP) live in the <strong className="text-slate-300">Carriers</strong> tab.</p>
      <GuidedHint>Two-step setup: (1) create the login <strong>here</strong>, then (2) build the carrier's profile in <strong>Carriers</strong> and link this login to it. Think of this tab as the keyring and Carriers as the rolodex.</GuidedHint>

      <Card className="p-6">
        <form onSubmit={createDriver} className="space-y-4">
        <h3 className="font-bold">Add a New Driver</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Driver Email">
            <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="driver@example.com" />
          </Field>
          <Field label="Temporary Password">
            <div className="flex gap-2">
              <input className={field} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" />
              <button type="button" onClick={genPw} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 rounded-lg shrink-0">Generate</button>
            </div>
          </Field>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <PrimaryButton type="submit" disabled={saving} className="px-5 py-2.5">
          {saving ? 'Creating…' : 'Create Driver Account'}
        </PrimaryButton>

        {created && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-sm">
            <div className="font-semibold text-emerald-400 mb-2">✓ Account created — share these with the driver:</div>
            <div className="font-mono text-slate-200">Email: {created.email}</div>
            <div className="font-mono text-slate-200">Temp password: {created.pw}</div>
            <div className="text-xs text-slate-400 mt-2">They'll be asked to set their own password on first login.</div>
            <button type="button"
              onClick={() => {
                const txt = welcomeCarrierText({ email: created.email, tempPw: created.pw, company: orgInfo.name, phone: orgInfo.dispatchPhone });
                if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Welcome email copied to your clipboard.', 'success')).catch(() => {});
              }}
              className="mt-3 text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg">
              📋 Copy welcome email
            </button>
          </div>
        )}
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold mb-4">Current Accounts</h3>
        {loading ? (
          <SkelRows rows={3} />
        ) : list.length === 0 ? (
          <div className="text-slate-500 text-sm">No accounts yet.</div>
        ) : (
          <div className="space-y-2">
            {list.map((u) => {
              const admin = isAdminEmail(u.email);
              const approved = admin || u.approved === true;
              return (
                <div key={u.uid} className="flex items-center justify-between gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{u.email || u.uid}</div>
                    <div className="text-xs mt-0.5">
                      {admin ? <span className="text-amber-400">Admin</span>
                        : approved ? <span className="text-emerald-400">● Approved</span>
                        : <span className="text-slate-500">● Pending / Revoked</span>}
                    </div>
                  </div>
                  {!admin && (
                    approved ? (
                      <button onClick={() => setApproved(u.uid, false)} className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg shrink-0">Revoke</button>
                    ) : (
                      <button onClick={() => setApproved(u.uid, true)} className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg shrink-0">Approve</button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- ADMIN: FLEET / ELD (demo data) ----------
const DEMO_VEHICLES = [
  { id: 'demo-v1', name: 'Truck 101', vin: '1FUJGLDR8NLAA1234', make: 'Freightliner', model: 'Cascadia', year: '2022', licensePlate: 'GA-8842' },
  { id: 'demo-v2', name: 'Truck 102', vin: '1XKWDB0X1MJ334455', make: 'Kenworth', model: 'T680', year: '2021', licensePlate: 'TX-2291' },
  { id: 'demo-v3', name: 'Truck 103', vin: '4V4NC9EH7PN998877', make: 'Volvo', model: 'VNL 760', year: '2023', licensePlate: 'FL-7733' },
];
const DEMO_DRIVERS = [
  { id: 'demo-d1', name: 'Marcus Bell', username: 'mbell', phone: '555-0142' },
  { id: 'demo-d2', name: 'Tanya Cruz', username: 'tcruz', phone: '555-0199' },
  { id: 'demo-d3', name: 'Devon Pratt', username: 'dpratt', phone: '555-0177' },
];
const HR = 3600000;
const DEMO_HOS = [
  { id: 'demo-d1', driverName: 'Marcus Bell', dutyStatus: 'Driving', driveRemainingMs: 4.5 * HR, shiftRemainingMs: 6 * HR, cycleRemainingMs: 38 * HR },
  { id: 'demo-d2', driverName: 'Tanya Cruz', dutyStatus: 'On Duty', driveRemainingMs: 8 * HR, shiftRemainingMs: 9 * HR, cycleRemainingMs: 50 * HR },
  { id: 'demo-d3', driverName: 'Devon Pratt', dutyStatus: 'Sleeper Berth', driveRemainingMs: 11 * HR, shiftRemainingMs: 14 * HR, cycleRemainingMs: 60 * HR },
];

function FleetView() {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [hos, setHos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [v, d, h] = await Promise.all([
        getDocs(orgScoped('vehicles')),
        getDocs(orgScoped('fleet_drivers')),
        getDocs(orgScoped('hos_status')),
      ]);
      setVehicles(v.docs.map((x) => ({ id: x.id, ...x.data() })));
      setDrivers(d.docs.map((x) => ({ id: x.id, ...x.data() })));
      setHos(h.docs.map((x) => ({ id: x.id, ...x.data() })));
    } catch (e) {
      console.error('Error loading fleet:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const loadDemo = async () => {
    setBusy(true); setMsg('');
    try {
      const ts = serverTimestamp();
      await Promise.all([
        ...DEMO_VEHICLES.map(({ id, ...data }) => setDoc(doc(db, 'vehicles', id), stampOrg({ ...data, syncedAt: ts }), { merge: true })),
        ...DEMO_DRIVERS.map(({ id, ...data }) => setDoc(doc(db, 'fleet_drivers', id), stampOrg({ ...data, syncedAt: ts }), { merge: true })),
        ...DEMO_HOS.map(({ id, ...data }) => setDoc(doc(db, 'hos_status', id), stampOrg({ ...data, syncedAt: ts }), { merge: true })),
      ]);
      setMsg('Demo fleet data loaded ✓');
      await fetchAll();
    } catch (e) {
      console.error(e); setMsg('Failed: ' + (e.message || 'check console'));
    } finally { setBusy(false); }
  };

  const clearDemo = async () => {
    setBusy(true); setMsg('');
    try {
      await Promise.all([
        ...DEMO_VEHICLES.map(({ id }) => deleteDoc(doc(db, 'vehicles', id))),
        ...DEMO_DRIVERS.map(({ id }) => deleteDoc(doc(db, 'fleet_drivers', id))),
        ...DEMO_HOS.map(({ id }) => deleteDoc(doc(db, 'hos_status', id))),
      ]);
      setMsg('Demo data cleared.');
      await fetchAll();
    } catch (e) {
      console.error(e); setMsg('Failed: ' + (e.message || 'check console'));
    } finally { setBusy(false); }
  };

  const fmtHrs = (ms) => (ms || ms === 0) ? (ms / HR).toFixed(1) + 'h' : '—';
  const dutyStyle = (s) => {
    if (s === 'Driving') return 'text-blue-400';
    if (s === 'On Duty') return 'text-amber-400';
    if (s === 'Sleeper Berth' || s === 'Off Duty') return 'text-emerald-400';
    return 'text-slate-300';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Fleet (ELD)</h2>
          <Badge tone="amber" className="font-bold tracking-wide">DEMO</Badge>
        </div>
        <div className="flex gap-2">
          <PrimaryButton onClick={loadDemo} disabled={busy} className="text-sm">
            {busy ? 'Working…' : 'Load Demo Data'}
          </PrimaryButton>
          <GhostButton onClick={clearDemo} disabled={busy} className="text-sm">
            Clear
          </GhostButton>
        </div>
      </div>

      <GuidedHint>This ELD screen is demo data for now. When your Samsara token is connected in the backend phase, these same screens fill with live hours-of-service and vehicle data — no layout changes.</GuidedHint>
      <div className="text-xs text-slate-500 bg-slate-800/40 border border-slate-700 rounded-lg px-4 py-2">
        This is sample data so you can build the UI today. When your Samsara token is ready, a Cloud Function fills these same screens with real fleet data — no UI changes.
      </div>
      {msg && <div className="text-sm text-slate-300 bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2">{msg}</div>}

      {loading ? (
        <div className="text-slate-400">Loading fleet…</div>
      ) : (
        <>
          <Card className="p-6">
            <h3 className="font-bold mb-4">Hours of Service</h3>
            {hos.length === 0 ? <div className="text-slate-500 text-sm">No HOS data yet — click "Load Demo Data".</div> : (
              <div className="space-y-2">
                {hos.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-sm">
                    <span className="font-semibold text-white">{h.driverName || h.id}</span>
                    <span className={`font-semibold ${dutyStyle(h.dutyStatus)}`}>{h.dutyStatus}</span>
                    <span className="text-slate-400">Drive: {fmtHrs(h.driveRemainingMs)} · Shift: {fmtHrs(h.shiftRemainingMs)} · Cycle: {fmtHrs(h.cycleRemainingMs)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="font-bold mb-4">Vehicles ({vehicles.length})</h3>
              {vehicles.length === 0 ? <div className="text-slate-500 text-sm">None yet.</div> : (
                <div className="space-y-2">
                  {vehicles.map((v) => (
                    <div key={v.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-sm">
                      <div className="font-semibold text-white">{v.name || v.id}</div>
                      <div className="text-xs text-slate-400">{[v.year, v.make, v.model].filter(Boolean).join(' ')} · VIN {v.vin || '—'} · {v.licensePlate || '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-6">
              <h3 className="font-bold mb-4">Drivers ({drivers.length})</h3>
              {drivers.length === 0 ? <div className="text-slate-500 text-sm">None yet.</div> : (
                <div className="space-y-2">
                  {drivers.map((d) => (
                    <div key={d.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-sm">
                      <div className="font-semibold text-white">{d.name || d.id}</div>
                      <div className="text-xs text-slate-400">{d.username || '—'} · {d.phone || '—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
// ---------- ADMIN: FREIGHT NEGOTIATION CALCULATOR ----------
// Build the "Protect Your Carrier" stamp from the calculator's protection
// inputs — only non-empty/true values, so the load doc stays clean. These are
// terms the dispatcher is securing with the broker (they ride on the RateCon);
// the carrier sees them on the offer screen before accepting.
function buildProtections(prot, isReefer) {
  const p = {};
  const dFree = parseFloat(prot.detentionFreeHrs);
  const dRate = parseFloat(prot.detentionPerHr);
  if (dFree > 0) p.detentionFreeHrs = dFree;
  if (dRate > 0) p.detentionPerHr = dRate;
  if (prot.lumperReimbursed) p.lumperReimbursed = true;
  if (isReefer && String(prot.reeferSetPoint || '').trim() !== '') {
    p.reeferSetPoint = String(prot.reeferSetPoint).trim();
    p.reeferMode = prot.reeferMode === 'cycle' ? 'cycle' : 'continuous';
  }
  if (prot.weightInWriting) p.weightInWriting = true;
  if (String(prot.otherTerms || '').trim()) p.otherTerms = String(prot.otherTerms).trim();
  return p;
}

function NegotiationCalcView() {
  const guided = useGuided();
  const { data: market } = useMarketData(); // live per-commodity rates + asOf (builtin fallback)
  const DEFAULTS = {
    selectedCarrier: '',
    originCity: '', originZip: '', destCity: '', destZip: '',
    pickupAt: '', deliveryAt: '',
    brokerOffer: '', finalOffer: '', loadedMiles: '', deadheadMiles: '', tolls: '',
    mpg: '6.5', fuelPrice: '3.80', weight: '', maxCapacity: '', minRpm: '', marketRpm: '',
    driveAvail: '', commodity: 'General Dry Freight',
  };
  const STORAGE_KEY = 'fm_ratecalc_v1';
  const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (_) { return {}; } };

  // "Protect Your Carrier" — the negotiated terms the rate math doesn't capture
  // (detention, lumper, temp-in-writing…). Stamped onto the load when sent.
  const PROT_DEFAULTS = {
    detentionFreeHrs: '2', detentionPerHr: '50', lumperReimbursed: false,
    reeferSetPoint: '', reeferMode: 'continuous', weightInWriting: false, otherTerms: '',
  };

  const [v, setV] = useState(() => ({ ...DEFAULTS, ...(loadSaved().v || {}) }));
  const [stops, setStops] = useState(() => loadSaved().stops || []);
  const [prot, setProt] = useState(() => ({ ...PROT_DEFAULTS, ...(loadSaved().prot || {}) }));
  const [protOpen, setProtOpen] = useState(false);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setP = (k, val) => setProt((s) => ({ ...s, [k]: val }));
  const n = (x) => parseFloat(x) || 0;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v, stops, prot })); } catch (_) {}
  }, [v, stops, prot]);

  const clearAll = () => { setV(DEFAULTS); setStops([]); setProt(PROT_DEFAULTS); try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} };
  const clearCarrier = () => setV((s) => ({ ...s, selectedCarrier: '' }));

  const addStop = () => setStops((s) => (s.length < 2 ? [...s, { city: '', zip: '' }] : s));
  const removeStop = (i) => setStops((s) => s.filter((_, idx) => idx !== i));
  const setStop = (i, k) => (e) => setStops((s) => s.map((st, idx) => (idx === i ? { ...st, [k]: e.target.value } : st)));

  const [carriers, setCarriers] = useState([]);
  useEffect(() => {
    getDocs(orgScoped('carriers'))
      .then((snap) => setCarriers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => console.error('Error loading carriers:', e));
  }, []);

  const applyCarrier = (id) => {
    setV((s) => {
      const c = carriers.find((x) => x.id === id);
      if (!c) return { ...s, selectedCarrier: '' };
      return {
        ...s,
        selectedCarrier: id,
        mpg: c.mpg ? String(c.mpg) : s.mpg,
        maxCapacity: c.maxCapacity ? String(c.maxCapacity) : s.maxCapacity,
        minRpm: c.minRpm ? String(c.minRpm) : s.minRpm,
        driveAvail: (c.currentDriveHours || c.currentDriveHours === 0) ? String(c.currentDriveHours) : s.driveAvail,
      };
    });
  };

  const selectedCarrierObj = carriers.find((c) => c.id === v.selectedCarrier) || null;

  const fillCityFromZip = async (zip, key, currentCity) => {
    if ((currentCity || '').trim() || !(zip || '').trim() || !GOOGLE_MAPS_API_KEY) return;
    try {
      const cs = await geocodeZip(zip.trim());
      if (cs) setV((s) => ({ ...s, [key]: cs }));
    } catch (_) { /* ignore */ }
  };

  const originRef = useRef(null);
  const destRef = useRef(null);
  useEffect(() => {
    let acs = [];
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        if (cancelled || !window.google || !window.google.maps || !window.google.maps.places) return;
        const attach = (ref, key) => {
          if (!ref.current) return null;
          const ac = new window.google.maps.places.Autocomplete(ref.current, {
            types: ['(cities)'], componentRestrictions: { country: 'us' },
          });
          ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            const val = (place && (place.formatted_address || place.name)) || ref.current.value;
            setV((s) => ({ ...s, [key]: String(val).replace(/, USA$/, '') }));
          });
          return ac;
        };
        acs = [attach(originRef, 'originCity'), attach(destRef, 'destCity')].filter(Boolean);
      } catch (_) { /* maps not ready */ }
    })();
    return () => { cancelled = true; acs.forEach((ac) => { if (window.google) window.google.maps.event.clearInstanceListeners(ac); }); };
  }, []);

  const windowHours = (() => {
    if (!v.pickupAt || !v.deliveryAt) return 0;
    const diff = (new Date(v.deliveryAt).getTime() - new Date(v.pickupAt).getTime()) / 3600000;
    return diff > 0 ? diff : 0;
  })();

  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsErr, setMapsErr] = useState('');
  const addr = (city, zip) => {
    const c = (city || '').trim();
    if (c) return c.toLowerCase().includes('usa') ? c : c + ', USA';
    const z = (zip || '').trim();
    return z ? z + ', USA' : '';
  };
  const calcMiles = async () => {
    setMapsErr('');
    const o = addr(v.originCity, v.originZip);
    const d = addr(v.destCity, v.destZip);
    if (!o || !d) { setMapsErr('Enter an origin and destination (city/state or zip).'); return; }
    if (!GOOGLE_MAPS_API_KEY) { setMapsErr('Add your Google Maps API key in the code (GOOGLE_MAPS_API_KEY).'); return; }
    const ways = stops.map((st) => addr(st.city, st.zip)).filter(Boolean);
    setMapsLoading(true);
    try {
      const mi = await getRouteMiles(o, d, ways);
      setV((s) => ({ ...s, loadedMiles: String(Math.round(mi)) }));
    } catch (e) {
      setMapsErr('Could not get distance (' + (e.message || 'error') + '). Check the locations and key restrictions.');
    } finally {
      setMapsLoading(false);
    }
  };

  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState('');
  const [lastOfferText, setLastOfferText] = useState('');
  const [orgInfo, setOrgInfo] = useState({ name: '', dispatchPhone: '' });
  useEffect(() => { (async () => {
    if (!ACTIVE_ORG) return;
    try { const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (o.exists()) setOrgInfo({ name: o.data().name || '', dispatchPhone: o.data().dispatchPhone || '' }); } catch (_) {}
  })(); }, []);
  const assignLoad = async (asOffer = false) => {
    setAssignMsg('');
    if (!selectedCarrierObj) { setAssignMsg('Pick a saved carrier first.'); return; }
    if (!selectedCarrierObj.linkedDriverUid) { setAssignMsg('This carrier has no linked driver login — set one in the Carriers tab.'); return; }

    // ----- Pre-send safety guards (always on; confirm-to-override) -----
    const finalRate = Number(v.finalOffer) || Number(v.brokerOffer) || 0;
    const miles = (Number(v.loadedMiles) || 0) + (Number(v.deadheadMiles) || 0);
    const minRpmVal = Number(v.minRpm) || 0;
    const rpm = miles > 0 ? finalRate / miles : 0;
    const warnings = [];

    // 1) Below the carrier's rate floor.
    if (minRpmVal > 0 && rpm > 0 && rpm < minRpmVal) {
      warnings.push(`Rate $${rpm.toFixed(2)}/mi is BELOW the carrier's $${minRpmVal.toFixed(2)}/mi floor.`);
    }
    // 2) Delivery window may not be legal on the driver's clock (mirrors the HOS validator @55mph).
    if (miles > 0 && windowHours > 0 && v.driveAvail !== '') {
      const availHrs = Math.min(Number(v.driveAvail) || 0, 11);
      const requiredDrive = miles / 55;
      let resets = 0, remaining = requiredDrive - availHrs;
      while (remaining > 0 && resets < 100) { resets += 1; remaining -= 11; }
      const totalTransit = requiredDrive + resets * 10;
      if (totalTransit > windowHours) warnings.push(`Delivery window looks too tight to run legally (~${totalTransit.toFixed(1)}h needed vs ${windowHours.toFixed(1)}h window).`);
    }
    // 3) Carrier isn't available.
    if (selectedCarrierObj.availability && selectedCarrierObj.availability !== 'Available') {
      warnings.push(`Carrier is currently ${selectedCarrierObj.availability}.`);
    }
    // 4) Expired compliance on the linked driver.
    try {
      const cs = await getDoc(doc(db, 'compliance', selectedCarrierObj.linkedDriverUid));
      if (cs.exists()) {
        const c = cs.data();
        const expired = [];
        [['CDL', c.cdl_expiration_date], ['Medical card', c.medical_card_expiration], ['Insurance', c.insurance_expiration]].forEach(([label, date]) => {
          if (!date) return;
          const dd = Math.ceil((new Date(date + 'T00:00:00') - new Date()) / 86400000);
          if (dd < 0) expired.push(label);
        });
        if (expired.length) warnings.push(`${expired.join(', ')} ${expired.length === 1 ? 'is' : 'are'} EXPIRED on this carrier.`);
      }
    } catch (_) { /* compliance read is best-effort */ }

    // Build one confirm dialog from the guards (+ the guided RateCon checklist).
    const lines = [];
    if (warnings.length) { lines.push('⚠️ Heads up before you send:', ...warnings.map((w) => '• ' + w), ''); }
    if (guided) { lines.push('RateCon check:', '• Rate matches what you agreed with the broker?', '• Pickup & delivery times correct?', '• Lumper / detention / hidden fees accounted for?', ''); }
    if (lines.length) {
      if (!window.confirm(lines.join('\n') + '\nSend this load to the carrier?')) return;
    }

    setAssigning(true);
    try {
      const loadId = await genLoadId();
      await addDoc(collection(db, 'loads'), stampOrg({
        loadId,
        uid: selectedCarrierObj.linkedDriverUid,
        origin: (v.originCity.trim() || v.originZip.trim()),
        destination: (v.destCity.trim() || v.destZip.trim()),
        commodity: v.commodity,
        weight: v.weight,
        gross_pay: Number(v.finalOffer) || Number(v.brokerOffer) || 0,
        loadedMiles: Number(v.loadedMiles) || 0,
        deadheadMiles: Number(v.deadheadMiles) || 0,
        feePct: feePctOf(selectedCarrierObj.feePct),
        pickup_time: v.pickupAt ? new Date(v.pickupAt).toLocaleString() : '',
        delivery_time: v.deliveryAt ? new Date(v.deliveryAt).toLocaleString() : '',
        delivery_date: v.deliveryAt ? v.deliveryAt.slice(0, 10) : '',
        status: asOffer ? 'Offered' : 'Dispatched',
        ...(asOffer ? { offerStatus: 'pending', offerSentAt: serverTimestamp() } : {}),
        // "Protect Your Carrier" terms — plain fields on the load, only when set.
        ...(Object.keys(protStamp).length ? { protections: protStamp } : {}),
        createdAt: serverTimestamp(),
      }));
      if (asOffer) {
        const rate = Number(v.finalOffer) || Number(v.brokerOffer) || 0;
        const origin = (v.originCity.trim() || v.originZip.trim());
        const destination = (v.destCity.trim() || v.destZip.trim());
        const pickup = v.pickupAt ? new Date(v.pickupAt).toLocaleString() : '';
        const delivery = v.deliveryAt ? new Date(v.deliveryAt).toLocaleString() : '';
        // Queue the off-platform email (sends once the Trigger Email extension is live)…
        if (selectedCarrierObj.email) {
          queueEmail(selectedCarrierObj.email, `New load offer ${loadId} — ${origin || '?'} → ${destination || '?'}`,
            offerCarrierEmail({ carrierName: selectedCarrierObj.name, loadId, origin, destination, rate, pickup, delivery, commodity: v.commodity, dispatchPhone: orgInfo.dispatchPhone, company: orgInfo.name }));
        }
        // …and stage a text the dispatcher can send from their own phone right now.
        setLastOfferText(offerCarrierText({ loadId, origin, destination, rate, pickup, dispatchPhone: orgInfo.dispatchPhone, company: orgInfo.name }));
      }
      setAssignMsg(asOffer
        ? `Offer ${loadId} sent to ${selectedCarrierObj.name} — awaiting their accept/decline ✓`
        : `Load ${loadId} assigned to ${selectedCarrierObj.name} ✓`);
    } catch (e) {
      console.error('Error assigning load:', e);
      setAssignMsg('Error assigning — check the console.');
    } finally {
      setAssigning(false);
    }
  };

  const COMMODITIES = {
    'General Dry Freight': { equip: 'Standard Dry Van.', surcharge: 0 },
    'Frozen Seafood/Poultry': { equip: 'Reefer Unit, Continuous Run Mode, Trailer Washout Required.', surcharge: 50 },
    'Fresh Produce': { equip: 'Reefer Unit, Cycle Sentry Mode, Pulping Thermometer.', surcharge: 25 },
    'Coiled Steel': { equip: 'Flatbed, Heavy-Duty Chains, Binders, 8ft Steel Tarps.', surcharge: 150 },
    'High-Value Electronics': { equip: 'Dry Van, High-Security Bolt Seals, E-Tracks, Lock-Down Logistics.', surcharge: 0 },
  };
  const commodityInfo = COMMODITIES[v.commodity] || COMMODITIES['General Dry Freight'];
  const surcharge = commodityInfo.surcharge;
  // Reefer commodities (Fresh Produce, Frozen Seafood/Poultry) unlock the temp-instructions fields.
  const isReefer = /reefer/i.test(commodityInfo.equip || '');
  const protStamp = buildProtections(prot, isReefer);
  const protCount = Object.keys(protStamp).filter((k) => k !== 'reeferMode').length; // mode rides with the set point — count them as one term

  const brokerOffer = n(v.brokerOffer);
  const tolls = n(v.tolls);
  const mpg = n(v.mpg);
  const fuelPrice = n(v.fuelPrice);
  const minRpm = n(v.minRpm);
  const marketRpm = n(v.marketRpm);
  const maxCap = n(v.maxCapacity);
  const weight = n(v.weight);
  const totalMiles = n(v.loadedMiles) + n(v.deadheadMiles);

  // Effective rate = the Final Agreed Rate once set, otherwise the broker offer —
  // so True RPM and the dispatcher's fee reflect what was actually negotiated.
  const effRate = n(v.finalOffer) || brokerOffer;
  const trueRpm = totalMiles > 0 ? effRate / totalMiles : 0;
  const tripCost = (mpg > 0 ? (totalMiles / mpg) * fuelPrice : 0) + tolls + surcharge;
  const targetOffer = minRpm * totalMiles + tolls + surcharge;
  const gap = targetOffer - brokerOffer;
  const weightFactor = maxCap > 0 ? (weight / maxCap) * 100 : 0;
  // Market comparison (manual rate now; live data later).
  const marketTarget = marketRpm > 0 ? marketRpm * totalMiles + tolls + surcharge : 0;
  const vsMarket = marketRpm > 0 ? trueRpm - marketRpm : 0;
  const marketGap = marketTarget > 0 ? marketTarget - brokerOffer : 0;

  const ready = brokerOffer > 0 && totalMiles > 0 && minRpm > 0;

  // Market-gap promotion: when the effective rate sits MEANINGFULLY below
  // market, the loudest number on the panel should be the MARKET target, not
  // the floor — a rookie who counters just past the floor on an underpriced
  // load "wins" and still leaves four figures on the table. "Meaningful" =
  // worse than −$0.15/mi vs market OR under 92% of the market trip value
  // (catches short trips where the per-mile gap looks small but the dollars
  // don't). At/above market the floor goes back to being the primary anchor.
  const MARKET_GAP_RPM = 0.15;
  const MARKET_GAP_RATIO = 0.92;
  const pushToMarket = ready && marketRpm > 0 && marketTarget > 0 && effRate > 0
    && (vsMarket < -MARKET_GAP_RPM || effRate < MARKET_GAP_RATIO * marketTarget);
  const underMarketAmt = marketTarget - effRate;

  // The dispatcher's own cut on this load — the number they most want to see.
  const dispFeePct = feePctOf(selectedCarrierObj?.feePct);
  const yourFee = effRate * dispFeePct / 100;

  let status = 'idle';
  if (ready) {
    if (trueRpm >= minRpm && weightFactor < 85) status = 'green';
    else if (trueRpm < minRpm && gap > 0.15 * brokerOffer) status = 'red';
    else status = 'yellow';
  }
  // Market downgrade: clears your floor but sits below market → push for more.
  let belowMarket = false;
  if (status === 'green' && marketRpm > 0 && trueRpm < marketRpm) { status = 'yellow'; belowMarket = true; }

  const money = (x) => '$' + (x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rpm = (x) => '$' + (x || 0).toFixed(2);

  let banner = {
    idle: { cls: 'bg-slate-800 border-slate-700 text-slate-300', title: 'Enter load details to analyze', sub: 'Fill in the broker offer, miles, and carrier minimum RPM to see the math.' },
    green: { cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', title: '🟢 Profitable Load — Proceed', sub: 'The numbers work. Book it — or push for a little extra.' },
    yellow: {
      cls: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
      title: gap > 0 ? `🟡 Counter Offer Required — Ask for ${money(gap)}` : '🟡 Heavy Load — Leverage the Weight',
      sub: gap > 0 ? 'The rate is close. Counter the broker to reach your floor.' : 'Freight is over 85% of capacity. Use the weight to justify a higher rate.',
    },
    red: { cls: 'bg-red-500/15 border-red-500/40 text-red-300', title: '🔴 Unprofitable — Walk Away', sub: `This offer is well below your floor — you'd need ${money(gap)} more. Politely pass.` },
  }[status];
  if (belowMarket) {
    banner = { cls: 'bg-amber-500/15 border-amber-500/40 text-amber-300', title: `🟡 Clears your floor — but BELOW market`, sub: `Market is ${rpm(marketRpm)}/mi; you're at ${rpm(trueRpm)}. Push toward ${money(marketTarget)}.` };
  }

  const field = INPUT_CLS;

  const Metric = ({ label, value, guide, accent, highlight, action }) => (
    <div className={`border rounded-sm p-4 transition-colors ${highlight ? 'bg-amber-500/10 border-amber-500/40 border-l-2 border-l-amber-500' : 'bg-slate-800/50 border-slate-700'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-xs ${highlight ? 'text-amber-300 font-semibold' : 'text-slate-400'}`}>{label}</span>
        <span className={`font-data font-semibold ${highlight ? 'text-2xl' : 'text-lg'} ${accent || 'text-white'}`}>{value}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2 leading-snug">{guide}</p>
      {action && (
        <button type="button" onClick={action.onClick}
          className="text-[10px] text-amber-400 hover:text-amber-300 mt-1.5 underline decoration-amber-500/40 underline-offset-2">
          {action.label}
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Rate Calculator</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Punch in the broker's numbers live on the call — see instantly if the load works and exactly what to counter.</p>

      <GuidedHint>
        <strong>Negotiation tip:</strong> never accept the broker's first number. Counter toward the highlighted target below — when the offer is well under market, that's the <strong>Market Target</strong> (don't stop at your floor); otherwise it's your <strong>Target Offer (floor)</strong>. If they're ~20¢/mi under the carrier's minimum, anchor to a real number: <em>"My carrier's floor on this lane is $___/mi; after deadhead I can do it at $____ all-in and keep your pickup on time."</em> See the <strong>Training → Negotiation Scripts</strong> tab for full talk-tracks.
      </GuidedHint>

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={clearAll} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg">Clear (New Load)</button>
        {v.selectedCarrier && <button type="button" onClick={clearCarrier} className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-1.5 rounded-lg">Clear Carrier</button>}
        <span className="text-[11px] text-slate-500">Inputs are saved automatically — switching tabs won't lose them.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-bold">Load Inputs</h3>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Saved Carrier (auto-fills truck specs)</label>
            <select className={field} value={v.selectedCarrier} onChange={(e) => applyCarrier(e.target.value)}>
              <option value="">Manual entry…</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {carriers.length === 0 && <p className="text-[11px] text-amber-400 mt-1">No saved carriers yet — add them in the Carriers tab.</p>}
          </div>

          {selectedCarrierObj && (
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-white truncate">{selectedCarrierObj.name}{selectedCarrierObj.mcNumber ? <span className="text-slate-500 font-normal"> · {selectedCarrierObj.mcNumber}</span> : null}</div>
                {selectedCarrierObj.availability && <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${selectedCarrierObj.availability === 'Available' ? 'bg-emerald-500/15 text-emerald-400' : selectedCarrierObj.availability === 'On Break' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>{selectedCarrierObj.availability}</span>}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-400">
                <span>{selectedCarrierObj.trailerType || '—'}</span>
                <span>· {selectedCarrierObj.maxCapacity ? Number(selectedCarrierObj.maxCapacity).toLocaleString() + ' lbs' : '—'}</span>
                <span>· {selectedCarrierObj.mpg || '—'} mpg</span>
                <span>· min ${Number(selectedCarrierObj.minRpm || 0).toFixed(2)}/mi</span>
                <span>· {selectedCarrierObj.currentDriveHours ?? '—'} drive hrs</span>
                {selectedCarrierObj.vipConcierge && <span className="text-amber-400">· VIP</span>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Origin City, State</label><input ref={originRef} className={field} value={v.originCity} onChange={set('originCity')} placeholder="Start typing a city…" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Origin Zip Code</label><input className={field} inputMode="numeric" value={v.originZip} onChange={set('originZip')} onBlur={() => fillCityFromZip(v.originZip, 'originCity', v.originCity)} placeholder="30301" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Destination City, State</label><input ref={destRef} className={field} value={v.destCity} onChange={set('destCity')} placeholder="Start typing a city…" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Destination Zip Code</label><input className={field} inputMode="numeric" value={v.destZip} onChange={set('destZip')} onBlur={() => fillCityFromZip(v.destZip, 'destCity', v.destCity)} placeholder="75201" /></div>
          </div>

          {stops.map((st, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-slate-400 mb-1">Stop {i + 1} City, State</label><input className={field} value={st.city} onChange={setStop(i, 'city')} placeholder="Macon, GA" /></div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Stop {i + 1} Zip</label>
                <div className="flex gap-2">
                  <input className={field} inputMode="numeric" value={st.zip} onChange={setStop(i, 'zip')} placeholder="31201" />
                  <button type="button" onClick={() => removeStop(i)} className="text-xs text-red-400 border border-red-500/30 px-3 rounded-lg shrink-0">✕</button>
                </div>
              </div>
            </div>
          ))}
          {stops.length < 2 && (
            <button type="button" onClick={addStop} className="text-xs text-amber-400 hover:text-amber-300">+ Add Stop</button>
          )}

          <button type="button" onClick={calcMiles} disabled={mapsLoading}
            className="w-full text-sm bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            {mapsLoading ? 'Calculating…' : '🧭 Auto-Calc Miles (Origin → Stops → Destination)'}
          </button>
          {mapsErr && <p className="text-[11px] text-red-400">{mapsErr}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Pickup Date &amp; Time</label><input className={field} type="datetime-local" value={v.pickupAt} onChange={set('pickupAt')} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Delivery Date &amp; Time</label><input className={field} type="datetime-local" value={v.deliveryAt} onChange={set('deliveryAt')} /></div>
            <div><label className="block text-xs text-amber-300 font-semibold mb-1">Broker Offer ($)</label><input className={`${field} border-amber-500/60 bg-amber-500/5 text-base font-semibold`} type="number" inputMode="decimal" value={v.brokerOffer} onChange={set('brokerOffer')} placeholder="2000" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Carrier Minimum RPM ($)</label><input className={field} type="number" inputMode="decimal" value={v.minRpm} onChange={set('minRpm')} placeholder="2.00" /></div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Current Market Rate ($/mi)</label>
              <input className={field} type="number" inputMode="decimal" value={v.marketRpm} onChange={set('marketRpm')} placeholder="2.45" />
              {market.commodityRates[v.commodity] ? (
                <button type="button" onClick={() => setV((s) => ({ ...s, marketRpm: String(market.commodityRates[v.commodity]) }))}
                  className="text-[10px] text-amber-400 hover:text-amber-300 mt-1">
                  Market ~${market.commodityRates[v.commodity].toFixed(2)}/mi ({fmtMarketAsOf(market.asOf)}) — tap to use
                </button>
              ) : <p className="text-[10px] text-slate-500 mt-1">No market suggestion for this commodity — enter it manually.</p>}
            </div>
            <div><label className="block text-xs text-slate-400 mb-1">Loaded Miles</label><input className={field} type="number" inputMode="decimal" value={v.loadedMiles} onChange={set('loadedMiles')} placeholder="800" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Deadhead Miles</label><input className={field} type="number" inputMode="decimal" value={v.deadheadMiles} onChange={set('deadheadMiles')} placeholder="50" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Estimated Tolls ($)</label><input className={field} type="number" inputMode="decimal" value={v.tolls} onChange={set('tolls')} placeholder="40" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Truck Avg MPG</label><input className={field} type="number" inputMode="decimal" value={v.mpg} onChange={set('mpg')} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Fuel Price ($/gal)</label><input className={field} type="number" inputMode="decimal" value={v.fuelPrice} onChange={set('fuelPrice')} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Freight Weight (lbs)</label><input className={field} type="number" inputMode="decimal" value={v.weight} onChange={set('weight')} placeholder="42000" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Carrier Max Capacity (lbs)</label><input className={field} type="number" inputMode="decimal" value={v.maxCapacity} onChange={set('maxCapacity')} placeholder="45000" /></div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Commodity Type</label>
            <select className={field} value={v.commodity} onChange={set('commodity')}>
              {Object.keys(COMMODITIES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-amber-400 font-semibold mb-1">REQUIRED EQUIPMENT</div>
            <div className="text-sm text-slate-200">{commodityInfo.equip}</div>
            <div className="text-xs text-slate-400 mt-2">Accessorial surcharge: <span className="text-white font-semibold">{money(surcharge)}</span></div>
          </div>
        </Card>

        <div className="space-y-4">
          <div className={`rounded-2xl border p-5 ${banner.cls}`}>
            <div className="font-bold text-base">{banner.title}</div>
            <div className="text-sm opacity-80 mt-1">{banner.sub}</div>
          </div>

          <Metric label="True RPM" value={rpm(trueRpm)}
            accent={ready ? (trueRpm >= minRpm ? 'text-emerald-400' : 'text-amber-400') : 'text-white'}
            guide="What the truck actually earns per mile — on your Final Agreed Rate once you set it, otherwise the broker's offer. Compare to Carrier Min; if it's lower, negotiate." />
          <Metric label="Trip Cost" value={money(tripCost)}
            guide={`Hard cash to move the truck — fuel + tolls${surcharge > 0 ? ` + ${money(surcharge)} equipment accessorial` : ''}. The offer must cover this plus profit.`} />
          {pushToMarket ? (
            <>
              {/* Real market gap → the MARKET target takes the glow; the floor demotes to a quiet walk-away line. */}
              <Metric label="Market Target — Push Toward This" value={money(marketTarget)} accent="text-amber-400" highlight
                guide={`Market is ${rpm(marketRpm)}/mi. You're ${money(Math.abs(underMarketAmt))} under market (${rpm(Math.abs(vsMarket))}/mi below). Counter toward this number — the floor is your walk-away, not your ask.`}
                action={{ label: `Tap to set the Final Agreed Rate to ${money(marketTarget)} (anchor your ask above it)`, onClick: () => setV((s) => ({ ...s, finalOffer: marketTarget.toFixed(2) })) }} />
              <Metric label="Target Offer (Floor)" value={money(targetOffer)} accent="text-amber-400"
                guide="Your walk-away number — never below this. But with market this far above, don't settle just past the floor." />
            </>
          ) : (
            <Metric label="Target Offer (Floor)" value={money(targetOffer)} accent="text-amber-400" highlight
              guide="Your negotiation floor. Don't accept below this — counter the broker slightly higher than this number." />
          )}
          {effRate > 0 && (
            <Metric label={`Your Dispatch Fee (${dispFeePct}%)`} value={money(yourFee)} accent="text-emerald-400" highlight
              guide={`What YOU keep on this load — ${dispFeePct}% of the gross${selectedCarrierObj ? `, ${selectedCarrierObj.name}'s rate` : ''}. Updates the moment you set the Final Agreed Rate.`} />
          )}
          {gap > 0 && (
            <Metric label="The Gap (Counter By)" value={money(gap)} accent="text-amber-400"
              guide="Ask the broker for exactly this much more to make the load viable." />
          )}
          {marketRpm > 0 && (
            <Metric label="vs. Market" value={(vsMarket >= 0 ? '+' : '') + rpm(vsMarket) + '/mi'}
              accent={vsMarket >= 0 ? 'text-emerald-400' : 'text-amber-400'}
              guide={`Market is ${rpm(marketRpm)}/mi (${money(marketTarget)} for this trip). ${vsMarket >= 0 ? 'You’re at or above market — strong.' : `You’re below market — push toward ${money(marketTarget)}.`}`} />
          )}
          <Metric label="Weight Factor" value={weightFactor.toFixed(0) + '%'}
            accent={weightFactor >= 85 ? 'text-amber-400' : 'text-white'}
            guide="Over 85% means heavy freight that burns more fuel. Use it to justify asking for a higher rate." />
          {surcharge > 0 && (
            <Metric label="Equipment Accessorial" value={money(surcharge)} accent="text-amber-400"
              guide={`Built into Trip Cost and your floor. Required: ${commodityInfo.equip}`} />
          )}

          <Card className="p-4 space-y-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Final Agreed Rate ($)</label>
              <input className={`${field} text-base font-semibold`} type="number" inputMode="decimal" value={v.finalOffer} onChange={set('finalOffer')} placeholder={v.brokerOffer ? `${v.brokerOffer} (broker offer)` : 'e.g. 2200'} />
              <p className="text-[10px] text-slate-500 mt-1">What the load actually pays the carrier. Leave blank to use the broker offer.</p>
            </div>

            {/* Protect Your Carrier — terms the rate math doesn't capture. Rides on the load + shows on the carrier's offer screen. */}
            <div className="border border-slate-700 rounded-xl bg-slate-800/40">
              <button type="button" onClick={() => setProtOpen((o) => !o)} aria-expanded={protOpen}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <ShieldCheck size={14} className="text-emerald-400 shrink-0" /> Protect Your Carrier
                  {protCount > 0 && <span className="text-[10px] font-normal text-emerald-400">{protCount} term{protCount === 1 ? '' : 's'} ride with this load</span>}
                </span>
                <ChevronDown size={14} className={`text-slate-500 shrink-0 transition-transform ${protOpen ? 'rotate-180' : ''}`} />
              </button>
              {protOpen && (
                <div className="px-3 pb-3 pt-3 space-y-3 border-t border-slate-700/60">
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Terms you're securing with the broker — they're stamped on the load, shown to your carrier before they accept, and should match the RateCon. Blank a field to leave it off.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] text-slate-400 mb-1">Detention — free hrs</label><input className={field} type="number" inputMode="decimal" value={prot.detentionFreeHrs} onChange={(e) => setP('detentionFreeHrs', e.target.value)} placeholder="2" /></div>
                    <div><label className="block text-[11px] text-slate-400 mb-1">Then $/hr</label><input className={field} type="number" inputMode="decimal" value={prot.detentionPerHr} onChange={(e) => setP('detentionPerHr', e.target.value)} placeholder="50" /></div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={prot.lumperReimbursed} onChange={(e) => setP('lumperReimbursed', e.target.checked)} className="accent-amber-500" />
                    <span>Lumper on the broker — reimbursed, not out of the carrier's rate</span>
                  </label>
                  {isReefer && (
                    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5 space-y-2">
                      <div className="text-[11px] font-semibold text-sky-300">Reefer temp — get it IN WRITING on the RateCon (claims protection)</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className={`${field} max-w-[100px]`} type="number" inputMode="decimal" value={prot.reeferSetPoint} onChange={(e) => setP('reeferSetPoint', e.target.value)} placeholder="34" aria-label="Reefer set point (°F)" />
                        <span className="text-xs text-slate-400">°F set point</span>
                        <div className="flex rounded-lg overflow-hidden border border-slate-700 ml-auto" role="group" aria-label="Reefer run mode">
                          <button type="button" onClick={() => setP('reeferMode', 'continuous')} className={`px-2.5 py-1.5 text-[11px] transition-colors ${prot.reeferMode !== 'cycle' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>Continuous</button>
                          <button type="button" onClick={() => setP('reeferMode', 'cycle')} className={`px-2.5 py-1.5 text-[11px] transition-colors ${prot.reeferMode === 'cycle' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>Cycle Sentry</button>
                        </div>
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={prot.weightInWriting} onChange={(e) => setP('weightInWriting', e.target.checked)} className="accent-amber-500" />
                    <span>Weight confirmed in writing (scale-ticket protection)</span>
                  </label>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Other terms (optional)</label>
                    <input className={field} value={prot.otherTerms} onChange={(e) => setP('otherTerms', e.target.value)} placeholder="e.g. TONU $250 if canceled after dispatch" />
                  </div>
                </div>
              )}
            </div>

            <PrimaryButton type="button" onClick={() => assignLoad(true)} disabled={assigning || !selectedCarrierObj} className="w-full px-4 py-2.5">
              {assigning ? 'Working…' : '📣 Send as Offer (carrier accepts/declines)'}
            </PrimaryButton>
            <GhostButton type="button" onClick={() => assignLoad(false)} disabled={assigning || !selectedCarrierObj} className="w-full border border-slate-700">
              ➕ Assign Directly (no offer)
            </GhostButton>
            <p className="text-[11px] text-slate-500">
              {selectedCarrierObj ? `Creates a dispatched load for ${selectedCarrierObj.name} and sends it to their portal.` : 'Pick a saved carrier above to enable.'}
            </p>
            {assignMsg && <p className={`text-sm ${assignMsg.includes('✓') || assignMsg.includes('copied') ? 'text-emerald-400' : 'text-amber-400'}`}>{assignMsg}</p>}
            {lastOfferText && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                <p className="text-[11px] text-slate-400">Your carrier is on the road — send them the offer now so they see it before another dispatcher books the lane. (Auto-email is queued; text it too for speed.)</p>
                <button type="button"
                  onClick={() => { if (navigator.clipboard) { navigator.clipboard.writeText(lastOfferText).then(() => setAssignMsg('Offer text copied — paste it into a text to your carrier.')).catch(() => {}); } }}
                  className="w-full text-xs font-semibold border border-blue-500/40 text-blue-200 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-2 rounded-lg">📋 Copy offer text to send your carrier</button>
              </div>
            )}
          </Card>
        </div>
      </div>

      <HosValidator totalMiles={totalMiles} windowHours={windowHours} driveAvail={v.driveAvail} onDriveAvail={set('driveAvail')} />
    </div>
  );
}

// ---------- ADMIN: TRANSIT & HOS VALIDATOR ----------
function HosValidator({ totalMiles = 0, windowHours = 0, driveAvail = '', onDriveAvail }) {
  const [v, setV] = useState({ speed: '55' });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const n = (x) => parseFloat(x) || 0;

  const miles = totalMiles;
  const windowHrs = windowHours;
  const speed = n(v.speed);
  const avail = Math.min(n(driveAvail), 11);

  const requiredDrive = speed > 0 ? miles / speed : 0;

  let resets = 0;
  let remaining = requiredDrive - avail;
  while (remaining > 0 && resets < 100) { resets += 1; remaining -= 11; }
  const totalTransit = requiredDrive + resets * 10;

  const ready = miles > 0 && windowHrs > 0 && speed > 0 && driveAvail !== '';
  const feasible = ready && totalTransit < windowHrs;
  const buffer = windowHrs - totalTransit;

  const hrs = (x) => (x || x === 0) ? x.toFixed(1) + ' hrs' : '—';

  let status = 'idle';
  if (ready) status = feasible ? 'green' : 'red';

  const banner = {
    idle: { cls: 'bg-slate-800 border-slate-700 text-slate-300', title: 'Enter trip details to check legality', sub: 'Miles, the delivery window, and the driver’s remaining drive hours.' },
    green: { cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', title: '🟢 Feasible — You Can Book It', sub: `${hrs(buffer)} of buffer before the deadline.` },
    red: { cls: 'bg-red-500/15 border-red-500/40 text-red-300', title: '🔴 Not Legal In Time — Pass or Push Delivery', sub: `Short by ${hrs(Math.abs(buffer))}. Negotiate a later delivery date.` },
  }[status];

  const field = INPUT_CLS;
  const Metric = ({ label, value, guide, accent }) => (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-400">{label}</span>
        <span className={`text-lg font-bold ${accent || 'text-white'}`}>{value}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2 leading-snug">{guide}</p>
    </div>
  );

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-2xl font-bold">Transit & HOS Validator</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400 mb-4">Can the driver legally make this delivery window? Get a yes/no in seconds — before you commit to the broker.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-bold">Trip Inputs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-xs text-slate-400">Trip Miles <span className="text-slate-500">(shared)</span></div>
              <div className="font-bold text-white text-lg">{miles > 0 ? miles.toLocaleString() + ' mi' : '—'}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-xs text-slate-400">Delivery Window <span className="text-slate-500">(pickup → delivery)</span></div>
              <div className="font-bold text-white text-lg">{windowHrs > 0 ? windowHrs.toFixed(1) + ' hrs' : '—'}</div>
            </div>
          </div>
          {(miles <= 0 || windowHrs <= 0) && <div className="text-[11px] text-amber-400">Set miles and pickup/delivery date-times in the Rate Calculator above.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Drive Hours Available (max 11)</label><input className={field} type="number" inputMode="decimal" value={driveAvail} onChange={onDriveAvail} placeholder="8" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Avg Truck Speed (mph)</label><input className={field} type="number" inputMode="decimal" value={v.speed} onChange={set('speed')} /></div>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            Tip: keep avg speed at 50–55 — a truck cruising 65 averages far less once you add fuel stops, scales, and traffic.
          </p>
        </Card>

        <div className="space-y-4">
          <div className={`rounded-2xl border p-5 ${banner.cls}`}>
            <div className="font-bold text-base">{banner.title}</div>
            <div className="text-sm opacity-80 mt-1">{banner.sub}</div>
          </div>

          <Metric label="Required Drive Time" value={hrs(requiredDrive)}
            guide="Pure driving time at this average speed — before any rest." />
          <Metric label="10-Hour Resets Needed" value={ready ? String(resets) : '—'}
            accent={resets > 0 ? 'text-amber-400' : 'text-white'}
            guide="Each reset is a mandatory 10-hour break once the driver's daily hours run out." />
          <Metric label="Total Transit Time" value={hrs(totalTransit)}
            guide="Driving time PLUS every required rest. This is the real door-to-door clock." />
          <Metric label="Delivery Window" value={hrs(windowHrs)}
            guide="How long the broker is giving you to deliver." />
          <Metric label={feasible ? 'Buffer' : 'Shortfall'} value={ready ? hrs(Math.abs(buffer)) : '—'}
            accent={feasible ? 'text-emerald-400' : 'text-red-400'}
            guide={feasible ? 'Slack time before the deadline. More is safer.' : 'How much you’re over the legal window. Push the delivery date out by at least this much.'} />
        </div>
      </div>

      <p className="text-[11px] text-slate-600 mt-4 leading-snug">
        Simplified estimate based on drive time + 10-hour resets. Always confirm against the 14-hour on-duty window and the 70-hour/8-day cycle in the driver's ELD before committing.
      </p>
    </div>
  );
}
// ---------- NEW AUTHORITY: STRAIGHT TALK ----------
function NewAuthorityView() {
  const reasons = [
    { t: 'Your authority is brand new', d: "Many brokers and shippers won't touch an MC number until it's 90–180 days old. It's not personal — it's their risk policy. Time alone fixes this." },
    { t: 'You have no track record yet', d: 'Brokers hand their best-paying loads to carriers they trust. You earn that trust one on-time, no-drama delivery at a time — and it compounds fast.' },
    { t: 'First-year insurance is expensive', d: 'New-authority insurance is high for the first 12 months, which eats margins. After one clean year it drops a lot, so early loads feel tighter than they will later.' },
    { t: "You're on the spot market", d: 'New carriers live on load boards — the most competitive, lowest-priced tier. Better-paying contract and direct-shipper freight comes once you have history.' },
    { t: 'No broker relationships yet', d: 'Great rates come from repeat brokers who know you deliver. Every load we book is building that book of relationships for you.' },
  ];
  const phases = [
    { p: 'Months 0–3', d: 'The grind. Cheaper loads, building history, proving reliability. Stay clean, stay consistent.', c: 'text-amber-400' },
    { p: 'Months 3–6', d: 'Doors open. Authority ages, brokers start repeating, factoring expands. Rates climb.', c: 'text-blue-400' },
    { p: 'Months 6–12', d: 'Momentum. Better lanes, preferred-carrier status, insurance about to drop.', c: 'text-emerald-400' },
    { p: '12 months +', d: "Leverage. You're a price-setter, not a price-taker. Cheaper insurance, your pick of freight.", c: 'text-emerald-400' },
  ];
  const helps = [
    'We negotiate every rate so you never take the first number a broker offers.',
    'We hunt smarter lanes to cut deadhead — empty miles are where new carriers bleed money.',
    'We build your broker relationships on every load, so repeat freight comes sooner.',
    'We handle factoring, paperwork, and compliance so you can focus on driving and building your record.',
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-amber-500/10 to-slate-900 border border-amber-500/30 rounded-2xl p-6">
        <h2 className="text-2xl font-bold text-white mb-2">The First 90 Days: Straight Talk</h2>
        <p className="text-slate-300 leading-relaxed">
          If finding good-paying freight feels hard right now, read this. It's not because you're doing
          something wrong, and it's not your dispatcher failing you — <span className="text-amber-400 font-semibold">every
          new authority goes through this</span>. Here's exactly why, and exactly how we shorten it for you.
        </p>
      </div>

      <GuidedHint>Share this with brand-new-authority carriers who are frustrated about cheap freight — it explains why the first 90 days are hard and how a good dispatcher shortens that runway.</GuidedHint>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Why good freight is harder to find at first</h3>
        <div className="space-y-3">
          {reasons.map((r) => (
            <div key={r.t} className="flex gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="text-amber-500 font-bold shrink-0">•</div>
              <div>
                <div className="font-semibold text-white">{r.t}</div>
                <div className="text-sm text-slate-400 mt-1">{r.d}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-1">It gets better — here's the timeline</h3>
        <p className="text-sm text-slate-400 mb-4">This curve is normal. The grind is temporary and it pays off.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {phases.map((ph) => (
            <div key={ph.p} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className={`font-bold ${ph.c}`}>{ph.p}</div>
              <div className="text-sm text-slate-400 mt-1">{ph.d}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">What we're doing about it — for you</h3>
        <div className="space-y-2">
          {helps.map((h) => (
            <div key={h} className="flex gap-3 items-start text-sm">
              <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
              <span className="text-slate-300">{h}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50 p-6 text-center">
        <p className="text-white font-semibold">Keep the wheels turning. Stay clean, stay consistent, and let the calendar do its work.</p>
        <p className="text-sm text-slate-400 mt-1">Every established carrier on the road today started exactly where you are.</p>
      </Card>
    </div>
  );
}

// ---------- ADMIN: CARRIERS ----------
// ---------- PUBLIC CARRIER INTAKE (no login) ----------
// Served at ?intake=<workspaceId>. Writes a carrier_packets doc stamped with
// that orgId, which then shows up under the dispatcher's "Import from Carrier
// Packet" in their Carriers tab. Replaces the old Google-Forms/Apps-Script flow.
function CarrierIntakeView({ orgId }) {
  const blank = {
    name: '', mcNumber: '', dotNumber: '', ein: '', driverName: '', phone: '', email: '',
    homeBase: '', trailerType: 'Dry Van', numTrucks: '', maxCapacity: '', minRpm: '',
    factoringCompany: '', hazmat: false, twic: false,
    preferredLanes: '', noGo: '', multiStop: '', notes: '',
  };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggle = (k) => () => setF((s) => ({ ...s, [k]: !s[k] }));
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.name.trim() || (!f.mcNumber.trim() && !f.dotNumber.trim()) || !f.phone.trim()) {
      setErr('Company name, an MC or DOT number, and a phone number are required.');
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'carrier_packets'), {
        orgId,
        name: f.name.trim(), mcNumber: f.mcNumber.trim(), dotNumber: f.dotNumber.trim(),
        ein: f.ein.trim(), driverName: f.driverName.trim(), phone: f.phone.trim(), email: f.email.trim(),
        homeBase: f.homeBase.trim(), trailerType: f.trailerType.trim(),
        numTrucks: f.numTrucks.trim(), maxCapacity: f.maxCapacity.trim(), minRpm: f.minRpm.trim(),
        factoringCompany: f.factoringCompany.trim(), hazmat: !!f.hazmat, twic: !!f.twic,
        preferredLanes: f.preferredLanes.trim(), noGo: f.noGo.trim(),
        multiStop: f.multiStop.trim(), notes: f.notes.trim(),
        status: 'new', createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (e2) {
      console.error('intake submit failed', e2);
      setErr('Could not submit — please try again, or call your dispatcher directly.');
    } finally {
      setSaving(false);
    }
  };

  const fld = INPUT_CLS;
  const Label = ({ children }) => <label className="block text-xs text-slate-400 mb-1">{children}</label>;

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-950 to-pagedeep text-slate-100 font-sans p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-3xl">✓</div>
          <h1 className="text-2xl font-bold mb-2">Packet received</h1>
          <p className="text-slate-400 leading-relaxed">
            Thanks, {f.name.trim() || 'driver'} — your carrier packet is in. Your dispatcher will
            review your authority and reach out to finish setup. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-pagedeep text-slate-100 font-sans py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-amber-400 font-bold tracking-[0.2em] text-xs mb-2">FORWARD MOTION</div>
          <h1 className="text-2xl sm:text-3xl font-bold">Carrier Setup Packet</h1>
          <p className="text-slate-400 mt-2 text-sm">Tell us about your truck and lanes. Takes about 2 minutes — no login needed.</p>
        </div>

        <form onSubmit={submit} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Carrier / Business Name *</Label><input className={fld} value={f.name} onChange={set('name')} placeholder="Bell Trucking LLC" /></div>
            <div><Label>MC Number *</Label><input className={fld} value={f.mcNumber} onChange={set('mcNumber')} placeholder="MC-123456" /></div>
            <div><Label>DOT Number</Label><input className={fld} value={f.dotNumber} onChange={set('dotNumber')} placeholder="1234567" /></div>
            <div><Label>EIN (Tax ID)</Label><input className={fld} value={f.ein} onChange={set('ein')} placeholder="12-3456789" /></div>
            <div><Label>Factoring Company</Label><input className={fld} value={f.factoringCompany} onChange={set('factoringCompany')} placeholder="e.g. RTS, Apex — or 'None'" /></div>
            <div><Label>Driver Name</Label><input className={fld} value={f.driverName} onChange={set('driverName')} /></div>
            <div><Label>Cell Phone *</Label><input className={fld} type="tel" value={f.phone} onChange={set('phone')} placeholder="(555) 123-4567" /></div>
            <div><Label>Email</Label><input className={fld} type="email" value={f.email} onChange={set('email')} /></div>
            <div><Label>Home Base (City, State)</Label><input className={fld} value={f.homeBase} onChange={set('homeBase')} placeholder="Dallas, TX" /></div>
            <div>
              <Label>Trailer Type</Label>
              <select className={SELECT_CLS} value={f.trailerType} onChange={set('trailerType')}>
                {['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Power Only', 'Box Truck', 'Other'].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div><Label># of Trucks</Label><input className={fld} type="number" inputMode="numeric" value={f.numTrucks} onChange={set('numTrucks')} placeholder="1" /></div>
            <div><Label>Max Capacity (lbs)</Label><input className={fld} type="number" inputMode="decimal" value={f.maxCapacity} onChange={set('maxCapacity')} placeholder="45000" /></div>
            <div><Label>Minimum RPM ($)</Label><input className={fld} type="number" inputMode="decimal" value={f.minRpm} onChange={set('minRpm')} placeholder="2.00" /></div>
            <div className="sm:col-span-2 flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={toggle('hazmat')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${f.hazmat ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${f.hazmat ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-500'}`}>{f.hazmat ? '✓' : ''}</span>
                Hazmat endorsement
              </button>
              <button type="button" onClick={toggle('twic')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${f.twic ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${f.twic ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-500'}`}>{f.twic ? '✓' : ''}</span>
                TWIC card
              </button>
            </div>
            <div className="sm:col-span-2"><Label>Preferred Lanes / Regions</Label><input className={fld} value={f.preferredLanes} onChange={set('preferredLanes')} placeholder="TX ↔ Southeast, no NYC" /></div>
            <div className="sm:col-span-2"><Label>No-Go States / Cities</Label><input className={fld} value={f.noGo} onChange={set('noGo')} placeholder="NYC, CA" /></div>
            <div className="sm:col-span-2"><Label>Anything else we should know?</Label><input className={fld} value={f.notes} onChange={set('notes')} placeholder="TWIC, hazmat, team, etc." /></div>
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg py-3 transition disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit Carrier Packet'}
          </button>
          <p className="text-[11px] text-slate-600 text-center">By submitting you agree to be contacted about dispatching services. We'll verify your FMCSA authority before booking.</p>
        </form>
      </div>
    </div>
  );
}

// Shareable public-intake link for this workspace (shown in the Carriers tab).
function IntakeLink() {
  const [copied, setCopied] = useState(false);
  const org = ACTIVE_ORG;
  if (!org) {
    return (
      <div className="rounded-lg bg-slate-800/40 border border-slate-700 px-3 py-2 text-[11px] text-slate-400">
        Your shareable carrier-intake link appears here once your workspace is set up.
      </div>
    );
  }
  let link = '';
  try { link = `${window.location.origin}${window.location.pathname}?intake=${org}`; } catch (_) { link = `?intake=${org}`; }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
  };
  return (
    <div className="rounded-lg bg-slate-800/40 border border-slate-700 px-3 py-2.5">
      <div className="text-[11px] font-semibold text-slate-300 mb-1">📨 Your carrier-intake link — share it with new carriers to onboard themselves</div>
      <div className="flex items-center gap-2">
        <input readOnly value={link} className="flex-1 bg-slate-950/60 border border-slate-700 rounded-md px-2 py-1.5 text-[11px] text-slate-300 font-mono truncate" onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copy} className="text-[11px] bg-amber-500/90 hover:bg-amber-500 text-slate-900 font-semibold px-3 py-1.5 rounded-md shrink-0">{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      <p className="text-[10px] text-slate-500 mt-1">Submissions land here under “Import from Carrier Packet.” Each workspace has its own link — carriers only ever reach you.</p>
    </div>
  );
}

function CarriersView({ onNavigate }) {
  const [list, setList] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const blank = {
    name: '', mcNumber: '', dotNumber: '', ein: '', driverName: '', phone: '', email: '', homeBase: '', trailerType: '',
    mpg: '', numTrucks: '', maxCapacity: '', minRpm: '', factoringCompany: '', hazmat: false, twic: false,
    preferredLanes: '', noGo: '', multiStop: '',
    linkedDriverUid: '', currentDriveHours: '', feePct: '10', vipConcierge: false, availability: 'Available',
    newLoginEmail: '', newLoginPw: '',
  };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleField = (k) => () => setForm((f) => ({ ...f, [k]: !f[k] }));
  const [createdLogin, setCreatedLogin] = useState(null);
  const [carrierSearch, setCarrierSearch] = useState('');
  const [orgInfo, setOrgInfo] = useState({ name: '', dispatchPhone: '' });
  useEffect(() => { (async () => {
    if (!ACTIVE_ORG) return;
    try { const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (o.exists()) setOrgInfo({ name: o.data().name || '', dispatchPhone: o.data().dispatchPhone || '' }); } catch (_) {}
  })(); }, []);
  const genPw = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setForm((f) => ({ ...f, newLoginPw: p }));
  };

  // Guided Mode: soft carrier-verification checklist (Workflow A).
  const guided = useGuided();
  const [verify, setVerify] = useState({ authority: false, w9: false, coi: false, noa: false });
  const VERIFY_ITEMS = [
    ['authority', 'MC/DOT active authority verified (FMCSA SAFER)'],
    ['w9', 'W-9 on file'],
    ['coi', 'Certificate of Insurance (COI) on file'],
    ['noa', 'Notice of Assignment / voided check on file'],
  ];
  const allVerified = VERIFY_ITEMS.every(([k]) => verify[k]);

  const [packet, setPacket] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const fetchCarriers = async () => {
    setLoading(true);
    try {
      const [cSnap, uSnap] = await Promise.all([
        getDocs(orgScoped('carriers')),
        getDocs(orgScoped('users')),
      ]);
      setList(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setDrivers(uSnap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    } catch (e) {
      console.error('Error loading carriers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCarriers(); }, []);

  const [appliedPacketId, setAppliedPacketId] = useState(null);

  const loadPacket = async () => {
    setImportMsg('');
    setImporting(true);
    try {
      const snap = await getDocs(orgScoped('carrier_packets'));
      const arr = snap.docs
        .map((d) => ({ _id: d.id, ...d.data() }))
        .filter((p) => p.status !== 'imported')
        .sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
      setPacket(arr);
      setImportMsg(arr.length ? `${arr.length} new submission(s) — pick one below.` : 'No new carrier packet submissions yet.');
    } catch (e) {
      console.error('Packet load failed:', e);
      setImportMsg('Could not load submissions. ' + (e.message || ''));
    } finally {
      setImporting(false);
    }
  };

  const applyPacket = (i) => {
    const p = packet[i];
    if (!p) return;
    setAppliedPacketId(p._id || null);
    setForm((f) => ({
      ...f,
      name: p.name || f.name,
      mcNumber: p.mcNumber || f.mcNumber,
      dotNumber: p.dotNumber || f.dotNumber,
      ein: p.ein || f.ein,
      driverName: p.driverName || f.driverName,
      phone: p.phone || f.phone,
      email: p.email || f.email,
      // Pre-fill the inline login email with what the carrier submitted, unless
      // you've already picked/typed one — saves re-keying it.
      newLoginEmail: f.newLoginEmail || p.email || '',
      homeBase: p.homeBase || f.homeBase,
      trailerType: p.trailerType || f.trailerType,
      numTrucks: p.numTrucks ? String(p.numTrucks) : f.numTrucks,
      maxCapacity: p.maxCapacity ? String(p.maxCapacity) : f.maxCapacity,
      minRpm: p.minRpm ? String(p.minRpm) : f.minRpm,
      factoringCompany: p.factoringCompany || f.factoringCompany,
      hazmat: typeof p.hazmat === 'boolean' ? p.hazmat : f.hazmat,
      twic: typeof p.twic === 'boolean' ? p.twic : f.twic,
      preferredLanes: p.preferredLanes || f.preferredLanes,
      noGo: p.noGo || f.noGo,
      multiStop: p.multiStop || f.multiStop,
    }));
  };

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    // Guided Mode: soft nudge if verification isn't complete (never a hard block).
    if (guided && !allVerified) {
      const missing = VERIFY_ITEMS.filter(([k]) => !verify[k]).map(([, l]) => '• ' + l).join('\n');
      if (!window.confirm('Some verification steps aren’t checked yet:\n\n' + missing + '\n\nSave this carrier anyway? (You can verify later.)')) {
        return;
      }
    }
    setSaving(true);
    setCreatedLogin(null);
    let linkedUid = form.linkedDriverUid;
    try {
      // Optionally create the portal login right here, then auto-link it —
      // no need to bounce over to the Logins & Access tab first.
      if (!linkedUid && form.newLoginEmail.trim() && form.newLoginPw) {
        if (form.newLoginPw.length < 6) { toast('Temporary password must be at least 6 characters.', 'error'); setSaving(false); return; }
        try {
          const uid = await createDriverAccount(form.newLoginEmail.trim(), form.newLoginPw);
          await setDoc(doc(db, 'users', uid), stampOrg({
            email: form.newLoginEmail.trim(), approved: true, mustChangePassword: true,
            role: 'driver', vipConcierge: !!form.vipConcierge, createdAt: serverTimestamp(),
          }), { merge: true });
          linkedUid = uid;
          setCreatedLogin({ email: form.newLoginEmail.trim(), pw: form.newLoginPw });
          queueEmail(form.newLoginEmail.trim(), `Welcome to ${orgInfo.name || 'Forward Motion Freight'} — your portal is ready`,
            welcomeCarrierEmail({ name: form.driverName.trim() || form.name.trim(), email: form.newLoginEmail.trim(), tempPw: form.newLoginPw, company: orgInfo.name, phone: orgInfo.dispatchPhone }));
        } catch (err) {
          console.error('inline login creation failed', err);
          const inUse = err.code === 'auth/email-already-in-use';
          alert(inUse
            ? 'That email already has a portal login — you don\'t need to create it again.\n\nClear the "create login" fields and pick the existing account from "Linked Driver Login" above instead. If it was revoked, re-enable it in Logins & Access (the login is kept when you revoke or remove a carrier).\n\nThe carrier was NOT saved yet.'
            : 'Could not create the login: ' + (err.message || '').replace('Firebase: ', '') + '\n\nThe carrier was NOT saved — fix the email/password and try again.');
          setSaving(false);
          return;
        }
      }
      await addDoc(collection(db, 'carriers'), stampOrg({
        name: form.name.trim(),
        mcNumber: form.mcNumber.trim(),
        dotNumber: form.dotNumber.trim(),
        ein: form.ein.trim(),
        driverName: form.driverName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        homeBase: form.homeBase.trim(),
        trailerType: form.trailerType.trim(),
        mpg: Number(form.mpg) || 0,
        numTrucks: Number(form.numTrucks) || 0,
        maxCapacity: Number(form.maxCapacity) || 0,
        minRpm: Number(form.minRpm) || 0,
        factoringCompany: form.factoringCompany.trim(),
        hazmat: !!form.hazmat,
        twic: !!form.twic,
        preferredLanes: form.preferredLanes.trim(),
        noGo: form.noGo.trim(),
        multiStop: form.multiStop.trim(),
        linkedDriverUid: linkedUid,
        currentDriveHours: Number(form.currentDriveHours) || 0,
        feePct: feePctOf(form.feePct),
        vipConcierge: !!form.vipConcierge,
        availability: form.availability || 'Available',
        verification: verify,
        verified: allVerified,
        createdAt: serverTimestamp(),
      }));
      // Mirror the VIP flag onto the linked driver's user doc so their portal reflects it.
      if (linkedUid) {
        try { await setDoc(doc(db, 'users', linkedUid), { vipConcierge: !!form.vipConcierge }, { merge: true }); } catch (_) {}
      }
      // If this carrier came from an intake submission, mark it imported so it
      // drops off the list and can't be double-added.
      if (appliedPacketId) {
        try { await updateDoc(doc(db, 'carrier_packets', appliedPacketId), { status: 'imported', importedAt: serverTimestamp() }); } catch (_) {}
        setAppliedPacketId(null);
      }
      setForm(blank);
      setVerify({ authority: false, w9: false, coi: false, noa: false });
      setPacket([]);
      setImportMsg('');
      fetchCarriers();
    } catch (e) {
      console.error('Error adding carrier:', e);
      toast('Error adding carrier — check the console.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this carrier profile?\n\nThis only removes them from your Carriers list. Their login, signed agreements, and past loads/invoices are all kept on record — nothing legal or financial is deleted.')) return;
    try {
      await deleteDoc(doc(db, 'carriers', id));
      setList((p) => p.filter((c) => c.id !== id));
    } catch (e) {
      console.error('Error removing carrier:', e);
    }
  };

  // Trigger a password-reset email to a carrier who's locked out. Firebase
  // sends it directly; no temp password to relay.
  const [resetMsg, setResetMsg] = useState('');
  const sendReset = async (email) => {
    if (!email) return;
    try { await sendPasswordResetEmail(auth, email); setResetMsg('Reset link sent to ' + email); }
    catch (e) { console.error('reset failed', e); setResetMsg('Could not send reset — ' + (e.code || e.message)); }
    setTimeout(() => setResetMsg(''), 4000);
  };

  const flash = (msg) => { setResetMsg(msg); setTimeout(() => setResetMsg(''), 2500); };

  const updateHours = async (id, hours) => {
    try {
      await updateDoc(doc(db, 'carriers', id), { currentDriveHours: Number(hours) || 0 });
      setList((p) => p.map((c) => (c.id === id ? { ...c, currentDriveHours: Number(hours) || 0 } : c)));
      flash('Drive hours saved ✓');
    } catch (e) {
      console.error('Error updating hours:', e);
    }
  };

  const updateFee = async (id, pct) => {
    const v = feePctOf(pct);
    try {
      await updateDoc(doc(db, 'carriers', id), { feePct: v });
      setList((p) => p.map((c) => (c.id === id ? { ...c, feePct: v } : c)));
      flash(`Fee updated to ${v}% ✓`);
    } catch (e) { console.error('Error updating fee:', e); }
  };

  const updateAvailability = async (id, value) => {
    try {
      await updateDoc(doc(db, 'carriers', id), { availability: value });
      setList((p) => p.map((c) => (c.id === id ? { ...c, availability: value } : c)));
      flash('Status updated ✓');
    } catch (e) { console.error('Error updating availability:', e); }
  };

  // Toggle VIP for a carrier AND mirror it onto their linked driver login.
  const toggleVip = async (c) => {
    const next = !c.vipConcierge;
    // Enabling VIP raises the dispatch fee — ask for the new % right here so it
    // never gets forgotten. Suggest current + 2 points.
    let feePatch = {};
    if (next) {
      const cur = feePctOf(c.feePct);
      const suggested = cur + 2;
      const input = window.prompt(`Enabling VIP for ${c.name}.\n\nVIP is a premium tier — set this carrier's new dispatch fee % (currently ${cur}%):`, String(suggested));
      if (input === null) return; // cancelled
      const v = Number(input);
      if (!isNaN(v) && v > 0 && v <= 100) feePatch = { feePct: v };
    }
    try {
      await updateDoc(doc(db, 'carriers', c.id), { vipConcierge: next, ...feePatch });
      if (c.linkedDriverUid) {
        try { await setDoc(doc(db, 'users', c.linkedDriverUid), { vipConcierge: next }, { merge: true }); } catch (_) {}
      }
      setList((p) => p.map((x) => (x.id === c.id ? { ...x, vipConcierge: next, ...feePatch } : x)));
      if (feePatch.feePct) flash(`VIP on · fee set to ${feePatch.feePct}% ✓`);
    } catch (e) { console.error('Error toggling VIP:', e); }
  };

  // Onboarding-packet status from the linked driver's user doc.
  const agreementStatus = (c) => {
    if (!c.linkedDriverUid) return null;
    const d = drivers.find((x) => x.uid === c.linkedDriverUid);
    if (!d) return null;
    const rr = d.resignRequest || {};
    const a = !!d.dispatchAgreement && !rr.dispatchAgreement, p = !!d.lpoa && !rr.lpoa;
    if (a && p) return 'signed';
    if (a || p) return 'partial';
    return 'none';
  };

  const driverEmail = (uid) => {
    const d = drivers.find((x) => x.uid === uid);
    return d ? d.email : '';
  };

  const field = INPUT_CLS;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Carriers</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400"><strong className="text-slate-300">This is the carrier's business profile</strong> — equipment, rates, lanes, VIP &amp; fee. Save each once, then pick them in the Rate Calculator to auto-fill specs and one-click assign loads. (Their <strong className="text-slate-300">login</strong> is created separately in <strong className="text-slate-300">Logins &amp; Access</strong>.)</p>

      <Card className="p-6">
        <form onSubmit={add} className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold">Add a Carrier</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={loadPacket} disabled={importing}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-1.5 rounded-lg disabled:opacity-50">
              {importing ? 'Loading…' : '⬇ Import from Carrier Packet'}
            </button>
            {packet.length > 0 && (
              <select className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5" onChange={(e) => applyPacket(Number(e.target.value))} defaultValue="">
                <option value="" disabled>Pick a submission…</option>
                {packet.map((p, i) => <option key={i} value={i}>{p.name || ('Submission ' + (i + 1))}</option>)}
              </select>
            )}
          </div>
        </div>
        {importMsg && <p className="text-[11px] text-slate-400">{importMsg}</p>}
        <IntakeLink />
        <div className="border-t border-slate-800" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-xs text-slate-400 mb-1">Carrier / Business Name</label><input className={field} value={form.name} onChange={set('name')} placeholder="Bell Trucking LLC" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">MC Number</label><input className={field} value={form.mcNumber} onChange={set('mcNumber')} placeholder="MC-123456" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">DOT Number</label><input className={field} value={form.dotNumber} onChange={set('dotNumber')} placeholder="1234567" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">EIN (Tax ID)</label><input className={field} value={form.ein} onChange={set('ein')} placeholder="12-3456789" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Factoring Company</label><input className={field} value={form.factoringCompany} onChange={set('factoringCompany')} placeholder="RTS / Apex / None" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Driver Name</label><input className={field} value={form.driverName} onChange={set('driverName')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Driver Cell Phone</label><input className={field} value={form.phone} onChange={set('phone')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Home Base (City, State)</label><input className={field} value={form.homeBase} onChange={set('homeBase')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Trailer Type</label><input className={field} value={form.trailerType} onChange={set('trailerType')} placeholder="Dry Van / Reefer / Flatbed" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Truck Avg MPG</label><input className={field} type="number" inputMode="decimal" value={form.mpg} onChange={set('mpg')} placeholder="6.5" /></div>
          <div><label className="block text-xs text-slate-400 mb-1"># of Trucks</label><input className={field} type="number" inputMode="numeric" value={form.numTrucks} onChange={set('numTrucks')} placeholder="1" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Max Capacity (lbs)</label><input className={field} type="number" inputMode="decimal" value={form.maxCapacity} onChange={set('maxCapacity')} placeholder="45000" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Minimum RPM ($)</label><input className={field} type="number" inputMode="decimal" value={form.minRpm} onChange={set('minRpm')} placeholder="2.00" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Current Drive Hours Available</label><input className={field} type="number" inputMode="decimal" value={form.currentDriveHours} onChange={set('currentDriveHours')} placeholder="8" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Preferred Lanes / Regions</label><input className={field} value={form.preferredLanes} onChange={set('preferredLanes')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">No-Go States / Cities</label><input className={field} value={form.noGo} onChange={set('noGo')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Dispatch Fee (%)</label><input className={field} type="number" inputMode="decimal" value={form.feePct} onChange={set('feePct')} placeholder="10" /></div>
          <div className="flex items-end">
            <button type="button" onClick={() => setForm((f) => ({ ...f, vipConcierge: !f.vipConcierge }))}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${form.vipConcierge ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
              <span className="flex items-center gap-1.5"><HeartPulse size={15} /> VIP Concierge</span>
              <span className={`w-8 h-4 rounded-full relative transition-colors ${form.vipConcierge ? 'bg-amber-500' : 'bg-slate-600'}`}><span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.vipConcierge ? 'left-4' : 'left-0.5'}`} /></span>
            </button>
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button type="button" onClick={toggleField('hazmat')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${form.hazmat ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${form.hazmat ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-500'}`}>{form.hazmat ? '✓' : ''}</span>
              Hazmat endorsement
            </button>
            <button type="button" onClick={toggleField('twic')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${form.twic ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
              <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${form.twic ? 'bg-amber-500 border-amber-500 text-slate-950' : 'border-slate-500'}`}>{form.twic ? '✓' : ''}</span>
              TWIC card
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Linked Driver Login (for assigning loads)</label>
            <select className={field} value={form.linkedDriverUid} onChange={set('linkedDriverUid')}>
              <option value="">— none —</option>
              {drivers.map((d) => <option key={d.uid} value={d.uid}>{d.email}</option>)}
            </select>
          </div>

          {!form.linkedDriverUid && (
            <div className="sm:col-span-2 bg-slate-800/40 border border-slate-700/60 border-l-2 border-l-amber-500 rounded-lg p-4">
              <div className="text-xs font-semibold text-amber-300 mb-1">…or create their login right here</div>
              <p className="text-[11px] text-slate-400 mb-3">No existing login? Create the carrier's portal account inline — it'll be linked to this profile automatically. (Leave blank if you'll link one later.)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={field} type="email" value={form.newLoginEmail} onChange={set('newLoginEmail')} placeholder="driver@example.com" />
                <div className="flex gap-2">
                  <input className={field} value={form.newLoginPw} onChange={set('newLoginPw')} placeholder="Temp password (6+ chars)" />
                  <button type="button" onClick={genPw} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 rounded-lg shrink-0">Generate</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <GuidedHint>VIP Concierge is a premium upsell: turn it on for carriers you've agreed to give white-glove service, and bump their <strong>Dispatch Fee</strong> 1–2% (e.g. 8% → 10%). That upcharge typically covers your monthly subscription — the platform pays for itself.</GuidedHint>

        {guided && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-300"><ShieldCheck size={16} /> Verification Checklist <span className="text-[10px] font-normal text-slate-400">(Guided Mode)</span></div>
            <p className="text-[11px] text-slate-400">Confirm each before clearing a carrier for loads. This is a soft check — you can still save, but verifying protects you from fraud and uninsured freight.</p>
            <div className="space-y-2">
              {VERIFY_ITEMS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-3 text-sm text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={verify[k]} onChange={(e) => setVerify((v) => ({ ...v, [k]: e.target.checked }))}
                    className="w-4 h-4 rounded accent-amber-500" />
                  {label}
                  {k === 'authority' && (
                    <span className="flex items-center gap-2 shrink-0">
                      <a href="https://safer.fmcsa.dot.gov/CompanySnapshot.aspx" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-amber-400 hover:underline">open SAFER ↗</a>
                      <span className="text-slate-600 text-[11px]">·</span>
                      <a href="https://www.fmcsa.dot.gov/registration" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-amber-400 hover:underline">FMCSA Register ↗</a>
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div className={`text-xs font-semibold ${allVerified ? 'text-emerald-400' : 'text-slate-500'}`}>{allVerified ? '✓ All verifications complete — carrier will be marked Verified' : 'Verification incomplete'}</div>
          </div>
        )}

        <PrimaryButton type="submit" disabled={saving} className="px-5 py-2.5">
          {saving ? 'Saving…' : 'Save Carrier'}
        </PrimaryButton>

        {createdLogin && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-sm">
            <div className="font-semibold text-emerald-400 mb-2">✓ Carrier saved &amp; login created — share these with the driver:</div>
            <div className="font-mono text-slate-200">Email: {createdLogin.email}</div>
            <div className="font-mono text-slate-200">Temp password: {createdLogin.pw}</div>
            <div className="text-xs text-slate-400 mt-2">They'll set their own password on first login.</div>
            <button type="button"
              onClick={() => {
                const txt = welcomeCarrierText({ email: createdLogin.email, tempPw: createdLogin.pw, company: orgInfo.name, phone: orgInfo.dispatchPhone });
                if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Welcome email copied to your clipboard.', 'success')).catch(() => {});
              }}
              className="mt-3 text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg">
              📋 Copy welcome email
            </button>
          </div>
        )}
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h3 className="font-bold">Saved Carriers <span className="text-slate-500 font-normal text-sm">({list.length})</span></h3>
          {list.length > 0 && (
            <input value={carrierSearch} onChange={(e) => setCarrierSearch(e.target.value)} placeholder="Search name, MC, driver…"
              className="text-sm bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500 w-full sm:w-64" />
          )}
        </div>
        {resetMsg && <div className="mb-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">{resetMsg}</div>}
        {loading ? (
          <SkelRows rows={3} />
        ) : list.length === 0 ? (
          <div className="text-slate-500 text-sm">No carriers saved yet.</div>
        ) : (() => {
          const shown = list.filter((c) => `${c.name || ''} ${c.mcNumber || ''} ${c.driverName || ''}`.toLowerCase().includes(carrierSearch.toLowerCase()));
          if (shown.length === 0) return <div className="text-slate-500 text-sm">No carriers match “{carrierSearch}”.</div>;
          return (
          <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1 -mr-1">
            {shown.map((c) => (
              <div key={c.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate flex items-center gap-2">{c.name} {c.mcNumber ? <span className="text-slate-500 font-normal">· {c.mcNumber}</span> : null}{c.verified && <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 shrink-0"><CheckCircle2 size={11} /> Verified</span>}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{c.mpg || '—'} mpg · {c.maxCapacity ? Number(c.maxCapacity).toLocaleString() : '—'} lbs · ${Number(c.minRpm || 0).toFixed(2)}/mi min · {c.trailerType || '—'}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Driver: {c.linkedDriverUid ? (driverEmail(c.linkedDriverUid) || 'linked') : <span className="text-amber-400">not linked</span>}</span>
                      {(() => {
                        const st = agreementStatus(c);
                        if (st === 'signed') return <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">Agreements ✓</span>;
                        if (st === 'partial') return <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">Agreements: partial</span>;
                        if (st === 'none') return <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">Agreements: pending</span>;
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                      {c.linkedDriverUid && driverEmail(c.linkedDriverUid) && (
                        <button onClick={() => sendReset(driverEmail(c.linkedDriverUid))} title="Email this carrier a password-reset link"
                          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1.5 rounded-lg">Reset PW</button>
                      )}
                      <button onClick={() => remove(c.id)} className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg">Remove</button>
                    </div>
                    {c.vipConcierge && <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"><HeartPulse size={10} /> VIP</span>}
                    {agreementStatus(c) === 'signed' && onNavigate && (
                      <button onClick={() => onNavigate('calc')} className="text-[11px] text-amber-400 hover:text-amber-300">Ready — price a load →</button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] text-slate-400">Drive hrs:</span>
                  <input className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                    type="number" defaultValue={c.currentDriveHours ?? ''} onBlur={(e) => updateHours(c.id, e.target.value)} />
                  <span className="text-[11px] text-slate-400 ml-2">Fee %:</span>
                  <input className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
                    type="number" defaultValue={c.feePct ?? DEFAULT_FEE_PCT} onBlur={(e) => updateFee(c.id, e.target.value)} />
                  <button type="button" onClick={() => toggleVip(c)}
                    className={`ml-2 text-[11px] px-2 py-1 rounded border transition-colors ${c.vipConcierge ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                    VIP {c.vipConcierge ? 'On' : 'Off'}
                  </button>
                  <span className="text-[11px] text-slate-400 ml-2">Status:</span>
                  <select className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                    value={c.availability || 'Available'} onChange={(e) => updateAvailability(c.id, e.target.value)}>
                    <option>Available</option>
                    <option>On Break</option>
                    <option>Off Duty</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
          );
        })()}
      </Card>
    </div>
  );
}

// ---------- ADMIN: TRIHAUL PLANNER ----------
// Seeded intermediate-market (Point C) suggestions by the destination's state.
// Heuristic, not live data — true load-to-truck ratios need a DAT feed (backend).
const TRIHAUL_MARKETS = {
  FL: ['Atlanta, GA', 'Charlotte, NC', 'Nashville, TN', 'Savannah, GA', 'Jacksonville, FL'],
  TX: ['Dallas, TX', 'Memphis, TN', 'Oklahoma City, OK', 'Laredo, TX', 'Houston, TX'],
  CA: ['Phoenix, AZ', 'Las Vegas, NV', 'Salt Lake City, UT', 'Denver, CO', 'Ontario, CA'],
  GA: ['Charlotte, NC', 'Nashville, TN', 'Memphis, TN', 'Jacksonville, FL', 'Birmingham, AL'],
  IL: ['Indianapolis, IN', 'Columbus, OH', 'Kansas City, MO', 'St. Louis, MO', 'Memphis, TN'],
  PA: ['Columbus, OH', 'Charlotte, NC', 'Chicago, IL', 'Buffalo, NY', 'Harrisburg, PA'],
  NJ: ['Columbus, OH', 'Charlotte, NC', 'Chicago, IL', 'Atlanta, GA', 'Pittsburgh, PA'],
  OH: ['Chicago, IL', 'Atlanta, GA', 'Charlotte, NC', 'Indianapolis, IN', 'Nashville, TN'],
  TN: ['Atlanta, GA', 'Dallas, TX', 'Chicago, IL', 'Charlotte, NC', 'Memphis, TN'],
  NC: ['Atlanta, GA', 'Charlotte, NC', 'Nashville, TN', 'Columbus, OH', 'Jacksonville, FL'],
  AZ: ['Dallas, TX', 'El Paso, TX', 'Las Vegas, NV', 'Salt Lake City, UT', 'Denver, CO'],
};
const TRIHAUL_FALLBACK = ['Atlanta, GA', 'Dallas, TX', 'Chicago, IL', 'Memphis, TN', 'Columbus, OH'];

function TriHaulView() {
  const DEFAULTS = {
    originCity: '', destCity: '', abMiles: '', headhaulRate: '', backhaulRate: '',
    pointC: '', bcMiles: '', bcRate: '', caMiles: '', caRate: '',
    deadhead: '', mpg: '6.5', fuelPrice: '5.35', driveAvail: '', speed: '50', equipment: 'Dry Van',
  };
  const [t, setT] = useState(DEFAULTS);
  const set = (k) => (e) => setT((s) => ({ ...s, [k]: e.target.value }));
  const n = (x) => parseFloat(x) || 0;
  const [pulled, setPulled] = useState('');

  const pullFromCalc = React.useCallback((announce) => {
    try {
      const saved = JSON.parse(localStorage.getItem('fm_ratecalc_v1') || '{}');
      const v = saved.v || {};
      setT((s) => ({
        ...s,
        originCity: v.originCity || s.originCity,
        destCity: v.destCity || s.destCity,
        abMiles: v.loadedMiles ? String(v.loadedMiles) : s.abMiles,
        headhaulRate: (v.finalOffer || v.brokerOffer) ? String(v.finalOffer || v.brokerOffer) : s.headhaulRate,
        mpg: v.mpg || s.mpg,
        fuelPrice: v.fuelPrice || s.fuelPrice,
        driveAvail: (v.driveAvail || v.driveAvail === 0) ? String(v.driveAvail) : s.driveAvail,
      }));
      if (announce) setPulled('Pulled the current lane from the Rate Calculator ✓');
    } catch (_) { /* ignore */ }
  }, []);
  // Auto-update from the Rate Calculator on open.
  useEffect(() => { pullFromCalc(false); }, [pullFromCalc]);

  // Fill each leg's miles from Google Maps (A->B, and B->C / C->A once Point C is set).
  const [mapsBusy, setMapsBusy] = useState(false);
  const [mapsMsg, setMapsMsg] = useState('');
  const autoDistances = async () => {
    setMapsMsg('');
    const A = t.originCity.trim(), B = t.destCity.trim(), C = t.pointC.trim();
    if (!A || !B) { setMapsMsg('Enter Point A and Point B first.'); return; }
    setMapsBusy(true);
    try {
      const ab = await getDrivingMiles(A, B);
      const updates = { abMiles: String(Math.round(ab)) };
      if (C) {
        const [bc, ca] = await Promise.all([getDrivingMiles(B, C), getDrivingMiles(C, A)]);
        updates.bcMiles = String(Math.round(bc));
        updates.caMiles = String(Math.round(ca));
      }
      setT((s) => ({ ...s, ...updates }));
      setMapsMsg(C ? 'All three legs filled from Google Maps ✓' : 'A→B filled — add Point C and re-run for all three legs.');
    } catch (e) {
      setMapsMsg('Couldn’t fetch distances: ' + (e.message || 'error') + '. Check that the Maps APIs + billing are on.');
    } finally { setMapsBusy(false); }
  };

  const stateOf = (city) => { const m = (city || '').match(/,\s*([A-Za-z]{2})\b/); return m ? m[1].toUpperCase() : ''; };
  const suggestions = TRIHAUL_MARKETS[stateOf(t.destCity)] || TRIHAUL_FALLBACK;

  // Economics
  const rtRevenue = n(t.headhaulRate) + n(t.backhaulRate);
  const rtMiles = n(t.abMiles) * 2;
  const rtRpm = rtMiles > 0 ? rtRevenue / rtMiles : 0;
  const rtFuel = n(t.mpg) > 0 ? (rtMiles / n(t.mpg)) * n(t.fuelPrice) : 0;
  const rtNet = rtRevenue - rtFuel;

  const triMiles = n(t.abMiles) + n(t.bcMiles) + n(t.caMiles) + n(t.deadhead);
  const triRevenue = n(t.headhaulRate) + n(t.bcRate) + n(t.caRate);
  const triRpm = triMiles > 0 ? triRevenue / triMiles : 0;
  const triFuel = n(t.mpg) > 0 ? (triMiles / n(t.mpg)) * n(t.fuelPrice) : 0;
  const triNet = triRevenue - triFuel;

  const haveTri = n(t.bcRate) > 0 && n(t.caRate) > 0 && triMiles > 0;
  const haveRt = n(t.backhaulRate) > 0 && rtMiles > 0;
  const triWins = haveTri && haveRt && triRpm >= rtRpm;

  // HOS across the triangle
  const speed = n(t.speed) || 50;
  const triDriveH = speed > 0 ? triMiles / speed : 0;
  const daysNeeded = triDriveH > 0 ? Math.ceil(triDriveH / 11) : 0;
  const leg1H = speed > 0 ? n(t.abMiles) / speed : 0;
  const leg1Fits = t.driveAvail !== '' ? leg1H <= Math.min(n(t.driveAvail), 11) : null;

  const money = (x) => '$' + Math.round(x || 0).toLocaleString('en-US');
  const rpm = (x) => '$' + (x || 0).toFixed(2);
  const field = INPUT_CLS;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">TriHaul Planner</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Beat the cheap direct backhaul. Build a triangle (A → B → C → A) that keeps the truck loaded and lifts your rate-per-mile.</p>
      <GuidedHint>The trap is taking a cheap B→A backhaul just to get home. A third leg through a strong freight market (Point C) usually earns more total revenue at a higher RPM — even after the extra miles. This tool compares the two so you book the smarter triangle.</GuidedHint>

      <div className="flex flex-wrap gap-2 items-center">
        <GhostButton onClick={() => pullFromCalc(true)} className="text-sm">⤵ Pull current lane from Rate Calculator</GhostButton>
        <GhostButton onClick={autoDistances} disabled={mapsBusy} className="text-sm">{mapsBusy ? 'Calculating…' : '📍 Auto-fill leg distances'}</GhostButton>
        {pulled && <span className="text-xs text-emerald-400">{pulled}</span>}
        {mapsMsg && <span className="text-xs text-slate-400">{mapsMsg}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* INPUTS */}
        <Card className="p-6 space-y-4">
          <PanelHeader icon={<Navigation size={18} />} title="Trip Inputs" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Origin — Point A"><input className={field} value={t.originCity} onChange={set('originCity')} placeholder="Atlanta, GA" /></Field>
            <Field label="Destination — Point B"><input className={field} value={t.destCity} onChange={set('destCity')} placeholder="Miami, FL" /></Field>
            <Field label="Headhaul rate A→B ($)"><input className={field} type="number" inputMode="decimal" value={t.headhaulRate} onChange={set('headhaulRate')} placeholder="1750" /></Field>
            <Field label="A→B loaded miles"><input className={field} type="number" inputMode="decimal" value={t.abMiles} onChange={set('abMiles')} placeholder="660" /></Field>
            <Field label="Avg direct backhaul B→A ($)" className="sm:col-span-2"><input className={field} type="number" inputMode="decimal" value={t.backhaulRate} onChange={set('backhaulRate')} placeholder="950 (the cheap one to beat)" /></Field>
          </div>

          <div className="pt-1">
            <div className="text-xs font-semibold text-amber-400 mb-2">① Pick an intermediate market — Point C</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {suggestions.map((c) => (
                <button key={c} type="button" onClick={() => setT((s) => ({ ...s, pointC: c }))}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${t.pointC === c ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}`}>{c}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Point C"><input className={field} value={t.pointC} onChange={set('pointC')} placeholder="Atlanta, GA" /></Field>
              <Field label="Equipment"><input className={field} value={t.equipment} onChange={set('equipment')} placeholder="Dry Van" /></Field>
              <Field label="B→C rate ($)"><input className={field} type="number" inputMode="decimal" value={t.bcRate} onChange={set('bcRate')} placeholder="1900" /></Field>
              <Field label="B→C miles"><input className={field} type="number" inputMode="decimal" value={t.bcMiles} onChange={set('bcMiles')} placeholder="660" /></Field>
              <Field label="C→A rate ($)"><input className={field} type="number" inputMode="decimal" value={t.caRate} onChange={set('caRate')} placeholder="700" /></Field>
              <Field label="C→A miles"><input className={field} type="number" inputMode="decimal" value={t.caMiles} onChange={set('caMiles')} placeholder="250" /></Field>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Deadhead mi"><input className={field} type="number" inputMode="decimal" value={t.deadhead} onChange={set('deadhead')} placeholder="50" /></Field>
            <Field label="MPG"><input className={field} type="number" inputMode="decimal" value={t.mpg} onChange={set('mpg')} /></Field>
            <Field label="Fuel $/gal"><input className={field} type="number" inputMode="decimal" value={t.fuelPrice} onChange={set('fuelPrice')} /></Field>
            <Field label="Avg mph"><input className={field} type="number" inputMode="decimal" value={t.speed} onChange={set('speed')} /></Field>
          </div>
        </Card>

        {/* RESULTS */}
        <div className="space-y-4">
          {/* ② Economic comparison */}
          <Card className="p-5">
            <PanelHeader icon={<Wallet size={18} />} title="Round Trip vs. TriHaul" />
            <div className="grid grid-cols-3 gap-px bg-slate-800 rounded-lg overflow-hidden mt-4 text-center">
              <div className="bg-slate-900/60 p-3"><div className="text-[10px] uppercase text-slate-500">Metric</div></div>
              <div className="bg-slate-900/60 p-3"><div className="text-[10px] uppercase text-slate-500">Round Trip</div><div className="text-[10px] text-slate-600">A→B→A</div></div>
              <div className="bg-slate-900/60 p-3"><div className="text-[10px] uppercase text-amber-400">TriHaul</div><div className="text-[10px] text-slate-600">A→B→C→A</div></div>

              <div className="bg-slate-800/40 p-3 text-left text-xs text-slate-400">Revenue</div>
              <div className="bg-slate-800/40 p-3 text-sm font-semibold text-white">{haveRt ? money(rtRevenue) : '—'}</div>
              <div className="bg-amber-500/5 p-3 text-sm font-semibold text-white">{haveTri ? money(triRevenue) : '—'}</div>

              <div className="bg-slate-800/40 p-3 text-left text-xs text-slate-400">Total miles</div>
              <div className="bg-slate-800/40 p-3 text-sm text-slate-200">{rtMiles ? rtMiles.toLocaleString() : '—'}</div>
              <div className="bg-amber-500/5 p-3 text-sm text-slate-200">{triMiles ? Math.round(triMiles).toLocaleString() : '—'}</div>

              <div className="bg-slate-800/40 p-3 text-left text-xs text-slate-400">Rate / mile</div>
              <div className="bg-slate-800/40 p-3 text-sm font-bold text-white">{haveRt ? rpm(rtRpm) : '—'}</div>
              <div className={`bg-amber-500/5 p-3 text-sm font-bold ${haveTri && triWins ? 'text-emerald-400' : 'text-amber-400'}`}>{haveTri ? rpm(triRpm) : '—'}</div>

              <div className="bg-slate-800/40 p-3 text-left text-xs text-slate-400">Net after fuel</div>
              <div className="bg-slate-800/40 p-3 text-sm text-slate-200">{haveRt ? money(rtNet) : '—'}</div>
              <div className="bg-amber-500/5 p-3 text-sm text-slate-200">{haveTri ? money(triNet) : '—'}</div>
            </div>
            {haveTri && haveRt && (
              <div className={`mt-4 rounded-lg border p-3 text-sm ${triWins ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`}>
                {triWins
                  ? `🟢 TriHaul wins — ${rpm(triRpm - rtRpm)}/mi better and ${money(triRevenue - rtRevenue)} more revenue. Book the triangle.`
                  : `🟡 The round trip is ahead by ${rpm(rtRpm - triRpm)}/mi here — find a stronger C→A leg or a closer Point C.`}
              </div>
            )}
          </Card>

          {/* ③ Deadhead & fuel */}
          <Card className="p-5">
            <PanelHeader icon={<CreditCard size={18} />} title="Deadhead & Fuel" />
            <div className="grid grid-cols-2 gap-3 mt-4">
              <StatTile label="TriHaul fuel cost" value={haveTri ? money(triFuel) : '—'} accent="amber" />
              <StatTile label="Deadhead miles" value={t.deadhead ? Number(t.deadhead).toLocaleString() : '0'} />
            </div>
            <p className="text-[11px] text-slate-500 mt-3">Quote each leg <strong>all-in</strong> — confirm the fuel surcharge with the broker on top of linehaul, and don't forget the deadhead between legs when you compare.</p>
          </Card>

          {/* ④ HOS */}
          <Card className="p-5">
            <PanelHeader icon={<Activity size={18} />} title="HOS Compliance" />
            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              <div><div className="text-[10px] text-slate-500">DRIVE TIME</div><div className="font-bold text-white text-sm">{triDriveH ? triDriveH.toFixed(1) + 'h' : '—'}</div></div>
              <div><div className="text-[10px] text-slate-500">DAYS NEEDED</div><div className="font-bold text-white text-sm">{daysNeeded || '—'}</div></div>
              <div><div className="text-[10px] text-slate-500">1ST LEG FITS</div><div className={`font-bold text-sm ${leg1Fits === null ? 'text-slate-400' : leg1Fits ? 'text-emerald-400' : 'text-red-400'}`}>{leg1Fits === null ? '—' : leg1Fits ? 'Yes' : 'No'}</div></div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3">Estimate only — {daysNeeded ? `~${daysNeeded} driving day${daysNeeded === 1 ? '' : 's'} at 11h/day` : 'enter miles & speed'}. Confirm each leg against the 11-hour drive limit, the 14-hour duty window, and the 70-hour/8-day cycle in the driver's ELD before committing.</p>
          </Card>

          {/* ⑤ Market viability */}
          <Card className="p-5">
            <PanelHeader icon={<Map size={18} />} title="Market Viability" accent="blue" />
            <p className="text-sm text-slate-300 mt-3">{t.pointC ? `Make sure ${t.pointC} has outbound freight back toward ${t.originCity || 'Point A'} before you route through it — you don't want the driver stranded.` : 'Pick a Point C above to assess.'}</p>
            <p className="text-[11px] text-slate-500 mt-2">The suggested markets are strong general freight hubs, but <strong>check the live load-to-truck ratio and demand</strong> for your equipment before committing. Real-time DAT/market data feeds this section in the backend phase; for now, verify on your load board.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- ADMIN: LANE INTEL ----------
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const INTEL_CATEGORIES = ['Market / Lane', 'Shipper', 'Receiver', 'Route Hazard'];

function LaneIntelView() {
  const [t, setT] = useState({ origin: '', dest: '', miles: '', perDay: '500', pickup: '' });
  const setTf = (k) => (e) => setT((s) => ({ ...s, [k]: e.target.value }));
  const num = (x) => parseFloat(x) || 0;

  // Pull the current lane from the Rate Calculator (saved in localStorage).
  const stateFrom = (cityStr) => {
    const m = (cityStr || '').match(/,\s*([A-Za-z]{2})\b/);
    return m ? m[1].toUpperCase() : '';
  };
  const pullFromCalc = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('fm_ratecalc_v1') || '{}');
      const v = saved.v || {};
      const totalMi = (num(v.loadedMiles) + num(v.deadheadMiles)) || num(v.loadedMiles);
      setT((s) => ({
        ...s,
        origin: stateFrom(v.originCity) || s.origin,
        dest: stateFrom(v.destCity) || s.dest,
        miles: totalMi ? String(Math.round(totalMi)) : s.miles,
        pickup: v.pickupAt ? v.pickupAt.slice(0, 10) : s.pickup,
      }));
    } catch (_) { /* ignore */ }
  };
  const miles = num(t.miles);
  const perDay = num(t.perDay) || 500;
  const transitDays = miles > 0 ? miles / perDay : 0;
  const daysCeil = Math.ceil(transitDays);
  const deliveryEst = (() => {
    if (!t.pickup || transitDays <= 0) return '';
    const d = new Date(t.pickup + 'T00:00:00');
    d.setDate(d.getDate() + daysCeil);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  })();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ location: '', category: 'Market / Lane', note: '' });
  const setFf = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(orgScoped('lane_intel'));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      setNotes(rows);
    } catch (e) {
      console.error('Error loading lane intel:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotes(); }, []);

  const addNote = async (e) => {
    e.preventDefault();
    if (!form.location.trim() || !form.note.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'lane_intel'), stampOrg({
        location: form.location.trim(),
        category: form.category,
        note: form.note.trim(),
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      }));
      setForm({ location: '', category: 'Market / Lane', note: '' });
      fetchNotes();
    } catch (e) {
      console.error('Error saving intel:', e);
      toast('Error saving — check the console.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeNote = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteDoc(doc(db, 'lane_intel', id));
      setNotes((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      console.error('Error deleting intel:', e);
    }
  };

  const catStyle = (c) => {
    if (c === 'Market / Lane') return 'bg-blue-500/15 text-blue-400';
    if (c === 'Shipper') return 'bg-emerald-500/15 text-emerald-400';
    if (c === 'Receiver') return 'bg-amber-500/15 text-amber-400';
    if (c === 'Route Hazard') return 'bg-red-500/15 text-red-400';
    return 'bg-slate-700 text-slate-300';
  };

  const filtered = notes.filter((nt) =>
    `${nt.location} ${nt.note} ${nt.category}`.toLowerCase().includes(search.toLowerCase())
  );

  const field = INPUT_CLS;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Lane Intel</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Know the business of the road — transit days and the facility/market intel your team learns one load at a time.</p>
      <GuidedHint>Specializing in a few lanes is how dispatchers earn more. Log what you learn — slow shippers, no-parking receivers, cold markets — so the whole team stops repeating mistakes.</GuidedHint>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold">Transit Day Estimator</h3>
          <button type="button" onClick={pullFromCalc} className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-1.5 rounded-lg">⤵ Pull from Rate Calculator</button>
        </div>
        <p className="text-xs text-slate-500">Turn miles into realistic transit days so you never overpromise a broker on delivery time.</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Origin State</label>
            <select className={field} value={t.origin} onChange={setTf('origin')}>
              <option value="">—</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Dest State</label>
            <select className={field} value={t.dest} onChange={setTf('dest')}>
              <option value="">—</option>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-slate-400 mb-1">Total Miles</label><input className={field} type="number" inputMode="decimal" value={t.miles} onChange={setTf('miles')} placeholder="1200" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Miles / Day</label><input className={field} type="number" inputMode="decimal" value={t.perDay} onChange={setTf('perDay')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Pickup Date</label><input className={field} type="date" value={t.pickup} onChange={setTf('pickup')} /></div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <div className="text-xs text-slate-400">{t.origin || '—'} → {t.dest || '—'} · {miles > 0 ? miles.toLocaleString() + ' mi' : '— mi'}</div>
            <div className="text-2xl font-bold text-white">
              {transitDays > 0 ? `${transitDays.toFixed(1)} days` : '—'}
              {transitDays > 0 && <span className="text-sm text-slate-400 font-normal"> (plan for {daysCeil})</span>}
            </div>
          </div>
          {deliveryEst && (
            <div>
              <div className="text-xs text-slate-400">Realistic delivery by</div>
              <div className="text-lg font-bold text-emerald-400">{deliveryEst}</div>
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-600">~500 mi/day is a safe solo-driver assumption once you factor HOS, fuel, and loading. Auto-distance from state selection arrives when the maps API is connected.</p>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-bold">Facility & Market Intel</h3>
        <p className="text-xs text-slate-500">Log what your team learns: cold markets, slow shippers, no-parking receivers, rough routes. Searchable for the whole team.</p>

        <form onSubmit={addNote} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input className={`${field} sm:col-span-3`} value={form.location} onChange={setFf('location')} placeholder="City / facility (e.g. Miami, FL)" />
          <select className={`${field} sm:col-span-3`} value={form.category} onChange={setFf('category')}>
            {INTEL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className={`${field} sm:col-span-4`} value={form.note} onChange={setFf('note')} placeholder="e.g. Cold flatbed market — cover deadhead out" />
          <PrimaryButton type="submit" disabled={saving} className="sm:col-span-2 px-3 py-2">
            {saving ? '…' : 'Add'}
          </PrimaryButton>
        </form>

        <input className={field} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search intel…" />

        {loading ? (
          <SkelRows rows={3} />
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 text-sm py-4 text-center">{notes.length === 0 ? 'No intel logged yet. Add your first note above.' : 'No notes match that search.'}</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((nt) => (
              <div key={nt.id} className="flex items-start justify-between gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{nt.location}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${catStyle(nt.category)}`}>{nt.category}</span>
                  </div>
                  <div className="text-sm text-slate-300 mt-1">{nt.note}</div>
                </div>
                <button onClick={() => removeNote(nt.id)} className="text-xs text-slate-500 hover:text-red-400 shrink-0">Delete</button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- ONBOARDING WIZARD (first carrier login) ----------
// Pre-fills from the carrier profile the admin already created (Carriers tab,
// linked by linkedDriverUid). The driver confirms it and adds only what the
// dispatcher can't: documents + banking. Avoids re-asking for packet info.
function OnboardingWizard({ onDone }) {
  const uid = auth.currentUser?.uid;
  const email = auth.currentUser?.email || '';
  const STORAGE_KEY = 'fm_onboarding_' + (uid || 'anon');

  const EQUIPMENT = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Power Only', 'Box Truck', 'Tanker', 'Hotshot'];
  const ENDORSEMENTS = ['Hazmat', 'Tanker', 'TWIC', 'Doubles/Triples', 'Oversize/Overweight'];
  const HOME_TIME = ['Every weekend', 'Every 2 weeks', 'OTR 3+ weeks', 'Flexible'];

  const blank = {
    companyName: '', mcNumber: '', dotNumber: '', homeBase: '',
    dispatchName: '', dispatchPhone: '', dispatchEmail: email,
    emergencyName: '', emergencyPhone: '',
    equipmentType: '', maxWeight: '', endorsements: [],
    targetRate: '', preferredLanesText: '', avoidText: '', homeTime: 'Flexible',
    usesFactoring: 'yes', factorName: '', factorEmail: '', factorPhone: '',
    achRouting: '', achAccount: '',
  };

  const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (_) { return {}; } };
  const savedAtInit = loadSaved();
  const hasSaved = !!savedAtInit.f;

  const [step, setStep] = useState(0);
  const [f, setF] = useState(() => ({ ...blank, ...(savedAtInit.f || {}) }));
  const [docs, setDocs] = useState(() => savedAtInit.docs || {});
  const [carrierDoc, setCarrierDoc] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [uploading, setUploading] = useState({});
  const [uploadErr, setUploadErr] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  // Pull the carrier profile the dispatcher already created/imported.
  useEffect(() => {
    (async () => {
      try {
        if (uid) {
          const snap = await getDocs(query(collection(db, 'carriers'), where('linkedDriverUid', '==', uid)));
          if (!snap.empty) {
            const c = { id: snap.docs[0].id, ...snap.docs[0].data() };
            setCarrierDoc(c);
            if (!hasSaved) {
              setF((prev) => ({
                ...prev,
                companyName: c.name || prev.companyName,
                mcNumber: c.mcNumber || prev.mcNumber,
                dispatchName: c.driverName || prev.dispatchName,
                dispatchPhone: c.phone || prev.dispatchPhone,
                homeBase: c.homeBase || prev.homeBase,
                equipmentType: c.trailerType || prev.equipmentType,
                maxWeight: c.maxCapacity ? String(c.maxCapacity) : prev.maxWeight,
                targetRate: c.minRpm ? String(c.minRpm) : prev.targetRate,
                preferredLanesText: c.preferredLanes || prev.preferredLanesText,
                avoidText: c.noGo || prev.avoidText,
              }));
            }
          }
        }
      } catch (e) {
        console.error('Carrier prefill failed:', e);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ f, docs })); } catch (_) {}
  }, [f, docs]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const toggleArr = (k, val) => setF((s) => {
    const arr = s[k] || [];
    return { ...s, [k]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
  });

  const uploadDoc = (key) => async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploadErr((u) => ({ ...u, [key]: '' }));
    setUploading((u) => ({ ...u, [key]: true }));
    try {
      const path = `carrier_docs/${uid}/${key}_${Date.now()}_${file.name}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setDocs((d) => ({ ...d, [key]: { name: file.name, url } }));
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadErr((u) => ({ ...u, [key]: err.code === 'storage/unauthorized' ? 'Upload blocked — enable Firebase Storage + rules.' : (err.message || 'Upload failed') }));
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  };

  const STEPS = ['Confirm', 'Documents', 'Payment'];
  const field = INPUT_CLS;

  const next = () => setStep((s) => Math.min(s + 1, 4));
  const back = () => setStep((s) => Math.max(s - 1, 0));
  const canProceed = () => (step === 1 ? (f.companyName.trim() && f.mcNumber.trim()) : true);

  const submit = async () => {
    setSubmitErr('');
    setSubmitting(true);
    try {
      await setDoc(doc(db, 'users', uid), {
        email,
        onboardingComplete: true,
        onboardingStatus: 'under_review',
        onboardingSubmittedAt: serverTimestamp(),
        carrierProfile: { ...f, documents: docs, carrierId: carrierDoc ? carrierDoc.id : null },
      }, { merge: true });
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      onDone();
    } catch (err) {
      console.error('Onboarding submit failed:', err);
      setSubmitErr(err.message || 'Could not save. Please try again.');
      setSubmitting(false);
    }
  };

  const DocRow = ({ k, label, hint, templateUrl }) => (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            {label}
            {docs[k] && <CheckCircle2 size={16} className="text-emerald-400" />}
          </div>
          {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
          {docs[k] && <div className="text-xs text-emerald-400 mt-1 truncate">✓ {docs[k].name}</div>}
          {uploadErr[k] && <div className="text-xs text-red-400 mt-1">{uploadErr[k]}</div>}
          {templateUrl && <a href={templateUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400 hover:underline mt-1 inline-block">Download blank template →</a>}
        </div>
        <label className="shrink-0 text-xs bg-slate-700 hover:bg-slate-600 text-slate-100 px-3 py-2 rounded-lg cursor-pointer">
          {uploading[k] ? 'Uploading…' : (docs[k] ? 'Replace' : 'Upload')}
          <input type="file" className="hidden" onChange={uploadDoc(k)} disabled={uploading[k]} />
        </label>
      </div>
    </div>
  );

  const SummaryRow = ({ label, value }) => (
    <div className="flex justify-between gap-3 py-2 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-200 text-right">{value || <span className="text-slate-600">—</span>}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-pagedeep text-slate-100 font-sans flex flex-col">
      <div className="border-b border-slate-800/80 px-4 md:px-8 py-4 flex items-center justify-between">
        <BrandLockup size={30} branded />
        <button onClick={() => signOut(auth)} className="text-xs text-slate-400 hover:text-white">Sign out</button>
      </div>

      {step >= 1 && step <= 3 && (
        <div className="px-4 md:px-8 py-4 border-b border-slate-800">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            {STEPS.map((label, i) => {
              const num = i + 1;
              const done = step > num;
              const cur = step === num;
              return (
                <div key={label} className="flex-1 flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${cur ? 'bg-amber-500 text-slate-950' : done ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                    {done ? '✓' : num}
                  </div>
                  <span className={`text-[10px] mt-1 ${cur ? 'text-amber-400' : 'text-slate-500'}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
        <div className="max-w-2xl mx-auto">
          {step === 0 && (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mb-6"><Navigation size={32} /></div>
              <h2 className="text-3xl font-bold text-white mb-3">Welcome to the Fleet. Let's Get You Moving.</h2>
              <p className="text-slate-400 max-w-md mx-auto mb-8">
                {carrierDoc
                  ? "Your dispatcher already started your profile from your carrier packet. Confirm it's right and add your documents — takes about 2 minutes."
                  : "Let's get a few details on file so we can start aggressively negotiating your rates and securing your preferred lanes."}
              </p>
              <PrimaryButton onClick={() => setStep(1)} className="px-8 py-3">
                {profileLoaded ? 'Start →' : 'Loading…'}
              </PrimaryButton>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div><h2 className="text-2xl font-bold">Confirm Your Profile</h2><p className="text-slate-400 text-sm mt-1">{carrierDoc ? "Here's what we have on file. Make sure it's right." : "We don't have a profile on file yet — please fill in the basics."}</p></div>

              {carrierDoc && !editProfile ? (
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-amber-400 tracking-wide">FROM YOUR CARRIER PACKET</span>
                    <button type="button" onClick={() => setEditProfile(true)} className="text-xs text-slate-400 hover:text-white underline">Something's wrong? Edit</button>
                  </div>
                  <SummaryRow label="Company" value={f.companyName} />
                  <SummaryRow label="MC Number" value={f.mcNumber} />
                  <SummaryRow label="Home Base" value={f.homeBase} />
                  <SummaryRow label="Equipment" value={f.equipmentType} />
                  <SummaryRow label="Max Capacity" value={f.maxWeight ? Number(f.maxWeight).toLocaleString() + ' lbs' : ''} />
                  <SummaryRow label="Target Min Rate" value={f.targetRate ? '$' + f.targetRate + '/mi' : ''} />
                  <SummaryRow label="Preferred Lanes" value={f.preferredLanesText} />
                  <SummaryRow label="Avoid" value={f.avoidText} />
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs text-slate-400 mb-1">Legal Company Name *</label><input className={field} value={f.companyName} onChange={set('companyName')} /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">MC Number *</label><input className={field} value={f.mcNumber} onChange={set('mcNumber')} placeholder="MC-123456" /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Home Base (City, State)</label><input className={field} value={f.homeBase} onChange={set('homeBase')} /></div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Equipment Type</label>
                    <select className={field} value={f.equipmentType} onChange={set('equipmentType')}>
                      <option value="">Select…</option>
                      {EQUIPMENT.map((x) => <option key={x}>{x}</option>)}
                      {f.equipmentType && !EQUIPMENT.includes(f.equipmentType) && <option value={f.equipmentType}>{f.equipmentType}</option>}
                    </select>
                  </div>
                  <div><label className="block text-xs text-slate-400 mb-1">Max Weight Capacity (lbs)</label><input className={field} type="number" inputMode="decimal" value={f.maxWeight} onChange={set('maxWeight')} placeholder="45000" /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Target Minimum Rate ($/mile)</label><input className={field} type="number" inputMode="decimal" value={f.targetRate} onChange={set('targetRate')} placeholder="2.50" /></div>
                  <div className="sm:col-span-2"><label className="block text-xs text-slate-400 mb-1">Preferred Lanes / Regions</label><input className={field} value={f.preferredLanesText} onChange={set('preferredLanesText')} placeholder="e.g. Southeast, Midwest" /></div>
                  <div className="sm:col-span-2"><label className="block text-xs text-slate-400 mb-1">Areas to Avoid</label><input className={field} value={f.avoidText} onChange={set('avoidText')} placeholder="e.g. Northeast, NYC" /></div>
                  {carrierDoc && <div className="sm:col-span-2"><button type="button" onClick={() => setEditProfile(false)} className="text-xs text-amber-400 hover:underline">Done editing — back to summary</button></div>}
                </div>
              )}

              <Card className="p-5 space-y-4">
                <div className="text-xs font-semibold text-slate-400 tracking-wide">A FEW MORE DETAILS WE NEED</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs text-slate-400 mb-1">USDOT Number</label><input className={field} value={f.dotNumber} onChange={set('dotNumber')} /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Home Time Preference</label><select className={field} value={f.homeTime} onChange={set('homeTime')}>{HOME_TIME.map((x) => <option key={x}>{x}</option>)}</select></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Emergency Contact Name</label><input className={field} value={f.emergencyName} onChange={set('emergencyName')} /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Emergency Contact Phone</label><input className={field} value={f.emergencyPhone} onChange={set('emergencyPhone')} /></div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Specialized Endorsements</label>
                  <div className="flex flex-wrap gap-2">
                    {ENDORSEMENTS.map((x) => {
                      const on = f.endorsements.includes(x);
                      return (
                        <button key={x} type="button" onClick={() => toggleArr('endorsements', x)}
                          className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${on ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}`}>
                          {on ? '✓ ' : ''}{x}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div><h2 className="text-2xl font-bold">Your Documents</h2><p className="text-slate-400 text-sm mt-1">Upload your compliance paperwork so we can build your carrier packet and start booking.</p></div>
              <div className="space-y-3">
                <DocRow k="w9" label="W-9 Form" hint="IRS taxpayer ID form." templateUrl="https://www.irs.gov/pub/irs-pdf/fw9.pdf" />
                <DocRow k="coi" label="Certificate of Insurance (COI)" hint="Proof of active cargo & liability coverage." />
                <DocRow k="noa" label="Notice of Assignment / Voided Check" hint="From your factoring company, or a voided check for direct pay." />
              </div>
              <p className="text-[11px] text-slate-500">Documents are optional to continue — you can add them later, but we can't book loads until they're on file.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div><h2 className="text-2xl font-bold">Factoring &amp; Payment</h2><p className="text-slate-400 text-sm mt-1">How our back office handles your money.</p></div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Are you using a factoring company?</label>
                <div className="flex gap-2">
                  {['yes', 'no'].map((opt) => (
                    <button key={opt} type="button" onClick={() => setF((s) => ({ ...s, usesFactoring: opt }))}
                      className={`px-5 py-2 rounded-lg border text-sm font-semibold ${f.usesFactoring === opt ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                      {opt === 'yes' ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
              {f.usesFactoring === 'yes' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="block text-xs text-slate-400 mb-1">Factoring Company</label><input className={field} value={f.factorName} onChange={set('factorName')} /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Contact Email</label><input className={field} value={f.factorEmail} onChange={set('factorEmail')} /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">Contact Phone</label><input className={field} value={f.factorPhone} onChange={set('factorPhone')} /></div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-300">
                  No problem — you don’t enter any bank details here. We settle every load through your factoring company or a Notice of Assignment. If you’d rather set up direct pay, your dispatcher will arrange that with you separately. <span className="text-slate-400">Your bank account number is never stored in the app.</span>
                </div>
              )}
              <p className="text-[11px] text-slate-500">We never touch your bank account. Settlement runs through factoring/NOA, and your dispatch fee comes out of that payment.</p>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-10">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-6"><CheckCircle2 size={32} /></div>
              <h2 className="text-3xl font-bold text-white mb-3">You're Ready to Roll.</h2>
              <p className="text-slate-400 max-w-md mx-auto mb-8">Your profile is under review by our dispatch team. You'll be notified the moment you're cleared for your first load.</p>
              {submitErr && <p className="text-red-400 text-sm mb-4">{submitErr}</p>}
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setStep(3)} className="text-sm text-slate-400 hover:text-white px-4 py-2">← Back</button>
                <PrimaryButton onClick={submit} disabled={submitting} className="px-8 py-3">
                  {submitting ? 'Saving…' : 'Go to Dashboard →'}
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {step >= 1 && step <= 3 && (
        <div className="border-t border-slate-800 px-4 md:px-8 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button onClick={back} className="text-sm text-slate-400 hover:text-white px-4 py-2">← Back</button>
            <PrimaryButton onClick={next} disabled={!canProceed()} className="px-6 py-2.5">
              {step < 3 ? 'Continue' : 'Review & Finish'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- ADMIN: TRAINING / RESOURCE LIBRARY ----------
const GLOSSARY = [
  ['RPM (Rate Per Mile)', 'The load’s gross pay divided by total miles. The single most important number — it’s how you compare loads apples-to-apples.'],
  ['Deadhead', 'Empty miles driven to reach a pickup with no freight on the trailer. Deadhead burns fuel for $0, so always factor it into the true RPM.'],
  ['Detention', 'Pay owed when a facility holds the driver beyond the free window (usually 2 hours) to load or unload. Document time in/out to collect it.'],
  ['TONU (Truck Order Not Used)', 'A flat fee owed when a load is canceled after the driver was already dispatched/en route. Compensates for the wasted trip.'],
  ['Lumper', 'A third-party worker (or fee) that loads/unloads freight at a warehouse. The broker/shipper typically reimburses the lumper fee — get it in writing.'],
  ['Factoring', 'Selling your unpaid invoices to a factoring company for quick cash (usually 90–97%) instead of waiting 30–60 days for the broker to pay.'],
  ['NOA (Notice of Assignment)', 'A legal document telling brokers to pay the factoring company directly instead of the carrier. Required when a carrier factors their invoices.'],
  ['BOL (Bill of Lading)', 'The legal receipt and contract for the freight — signed at pickup and delivery. The signed BOL is proof of delivery and key to getting paid.'],
  ['RateCon (Rate Confirmation)', 'The binding agreement between broker and carrier for a specific load — rate, stops, times, and terms. Always verify it before the driver signs.'],
  ['Broker', 'The middleman who connects shippers with carriers. You negotiate the rate with the broker, not the shipper.'],
  ['Headhaul vs. Backhaul', 'Headhaul is a high-demand, well-paying lane out. Backhaul is the return trip back toward home base — usually cheaper. Aim to book strong headhauls.'],
  ['Reefer', 'A refrigerated trailer for temperature-controlled freight (produce, frozen, pharma). Pays more but adds fuel and washout costs.'],
  ['Accessorials', 'Extra charges beyond linehaul — detention, layover, lumper, tarps, extra stops, TONU. Always ask which accessorials the broker will cover.'],
  ['Spot Market / Spot Rate', 'The day-to-day load board pricing that fluctuates with supply and demand — where most new-authority carriers live. Contrast with contract freight.'],
  ['MC Number / Authority', 'The FMCSA operating license (Motor Carrier number) that lets a carrier haul for hire. “Active authority” means they’re legal to run today.'],
  ['Double Brokering', 'A fraud scheme where a bad actor poses as a carrier, accepts a load, then secretly re-brokers it to a real carrier for less and pockets the difference — leaving the real carrier unpaid and the original broker liable. The #1 fraud threat in 2026.'],
  ['Broker Bond (BMC-84)', 'The $75,000 surety bond/trust every freight broker must keep. If valid claims drop it below $75k, the broker has 7 business days to replenish or their authority is auto-suspended. Always confirm it’s active before booking.'],
  ['Broker Transparency (49 CFR 371.3)', 'A carrier’s right to see the broker’s records of what the shipper actually paid. 2026 rulemaking makes this a non-waivable duty with a 48-hour turnaround — giving dispatchers real leverage to audit lane margins.'],
  ['Negligent Hiring (Montgomery v. Caribe)', 'The 2026 Supreme Court ruling that lets brokers be sued in state court for hiring an unsafe carrier that causes a crash. It killed the old FAAAA shield — so forensic carrier vetting is now mandatory, not optional.'],
  ['Demurrage & Detention', 'Fees for holding equipment too long. The 2026 Evergreen v. FMC ruling set the “incentive principle”: fees are only fair when the carrier could actually have moved the freight — fees charged while a port/facility is closed are unjust and disputable.'],
  ['Nuclear Verdict', 'A jury award over $10M (often $100M+) in a trucking accident case, frequently fueled by third-party litigation funding. The main driver behind insurance premiums rising ~36% over eight years.'],
  ['SAFER / BASIC', 'FMCSA’s public safety systems. SAFER shows a carrier’s authority, insurance, and snapshot; BASIC (Behavior Analysis & Safety Improvement Categories) scores them on safety behaviors. Check both before clearing a carrier or broker.'],
  ['Proof Package', 'The airtight documentation set for every load: signed RateCon, timestamped check-calls, signed BOL/POD, and lumper receipts. Legally required to win a surety-bond claim if a broker defaults — build it on every load.'],
];

const SOPS = [
  {
    title: 'SOP — Vet a New Carrier’s Authority & Insurance',
    intro: 'Run this every time before you assign a carrier their first load. It protects you from double-brokering, fraud, and uninsured freight.',
    steps: [
      'Get the carrier’s MC and USDOT numbers and their company name.',
      'Look them up on the FMCSA SAFER snapshot (safer.fmcsa.dot.gov). Confirm Operating Authority is ACTIVE and Operation Classification allows for-hire.',
      'Check the authority age. Brand-new (<90–180 days) is normal — just be aware some shippers won’t accept it yet.',
      'Confirm the company name and address on SAFER match what the carrier gave you. Mismatches are a fraud red flag.',
      'Collect the Certificate of Insurance (COI). Verify cargo coverage (typically $100k+) and auto-liability ($1M) are active and not expired.',
      'Confirm you are listed (or can be added) as a certificate holder so you’re notified if coverage lapses.',
      'Collect a W-9 for tax/payment records.',
      'If they factor: collect the Notice of Assignment (NOA) so payments route correctly. If not: collect a voided check / ACH info.',
      'Only after all of the above checks pass, mark the carrier verified and clear them for loads.',
    ],
  },
  {
    title: 'SOP — Verify a Rate Confirmation Before Sending',
    intro: 'A 30-second check that prevents the most common (and expensive) dispatch mistakes. Do it before every RateCon goes to the driver to sign.',
    steps: [
      'Confirm the gross rate on the RateCon matches the number you verbally agreed with the broker — to the dollar.',
      'Verify pickup and delivery dates AND times. A wrong appointment time can cause a missed load or a late fee.',
      'Check pickup and drop-off addresses against what the driver expects — watch for the right city when a broker has multiple warehouses.',
      'Confirm the commodity and weight are correct and within the carrier’s equipment limits.',
      'Scan for hidden terms: detention policy, lumper responsibility, late penalties, and any “quick pay” fee deductions.',
      'Confirm the rate still clears the carrier’s minimum RPM after deadhead and accessorials.',
      'Make sure the broker’s MC and your carrier’s MC are both correct on the document.',
      'Only once it all matches, send it to the driver to sign — and save the executed copy to their Document Vault.',
    ],
  },
  {
    title: 'SOP — Vet a Broker Before You Book (2026)',
    intro: 'Booking with a suspended or fraudulent broker means your carrier doesn’t get paid. Since the Montgomery ruling and the $75k bond rule, this is non-negotiable. Use the Broker Check tab to run it.',
    steps: [
      'Get the broker’s company name and MC number.',
      'Confirm operating authority is ACTIVE on FMCSA SAFER and the name/address match what they gave you.',
      'Check FMCSA L&I that the $75,000 broker bond is active and NOT pending suspension.',
      'Run the broker’s MC through your factoring company — if they’re un-factorable or flagged, reject the load.',
      'Confirm they’re not on the FMCSA public suspended-broker list.',
      'Verify contact details independently: call the registered corporate number, don’t just trust the email signature.',
      'Scan for double-brokering red flags (urgency, too-good rate, last-minute equipment swap, generic email, no tracking). Two or more = walk away.',
      'Only after it clears, book — and start the proof package immediately.',
    ],
  },
  {
    title: 'SOP — Build an Airtight Proof Package',
    intro: 'If a broker defaults or disputes, this documentation is what gets your carrier paid (and is required to file a surety-bond claim). Build it on every load — don’t reconstruct it later.',
    steps: [
      'Save the signed Rate Confirmation (RateCon) the moment it’s executed.',
      'Log timestamped check-calls at pickup, in-transit, and delivery.',
      'Capture the signed Bill of Lading (BOL) at pickup and the signed POD at delivery.',
      'Collect lumper receipts and any accessorial/detention documentation with in/out times.',
      'Note the broker’s MC and bond status at time of booking (screenshot SAFER/L&I).',
      'Store everything against the load in the Document Vault so it’s one click to retrieve.',
    ],
  },
];

const TALK_TRACKS = [
  {
    title: 'Rate is below the carrier’s minimum',
    when: 'Broker’s offer is ~20¢/mile under your driver’s floor.',
    script: '“I appreciate the offer, but I can’t move my truck for that. My carrier’s operating cost puts the floor at $___ /mile on this lane, and after deadhead this doesn’t cover it. I can do this load at $____ all-in — that keeps my driver on schedule for your pickup window. Can you make that work?”',
    tip: 'Anchor to a specific number and a benefit to the broker (on-time pickup). Never just say “it’s too low.”',
  },
  {
    title: 'Requesting detention pay',
    when: 'Driver has been held at a facility past the 2-hour free window.',
    script: '“My driver checked in at ___ and is still not loaded — that’s over 2 hours past the appointment. I have the in-time documented on the BOL. Per standard terms I’m putting in for detention at $__/hour starting now. Can you open a detention case on your end so we’re aligned when the invoice comes through?”',
    tip: 'Lead with documented times. Detention is far easier to collect when you flag it live, not after delivery.',
  },
  {
    title: 'Requesting a TONU',
    when: 'Load is canceled after the driver was already dispatched.',
    script: '“Understood that the load fell through, but my driver was already dispatched and is en route / on-site. I’ll need a TONU to cover the truck I committed to you. Standard on a dispatched cancellation is $___ — can you get that on a confirmation so we keep things clean for next time?”',
    tip: 'Stay professional — you want repeat freight from this broker. Frame the TONU as standard, not a penalty.',
  },
  {
    title: 'Using broker transparency for leverage',
    when: 'A broker keeps lowballing a lane you suspect pays well.',
    script: '“Under the broker transparency rule I’m within my rights to request the transaction records on this load. I’d rather just work out a fair rate — the market on this lane is running $___/mile and I know there’s room. Let’s land at $____ and keep moving freight together.”',
    tip: 'You rarely need to actually pull records — invoking the right (49 CFR 371.3) plus a real market number is usually enough to move the rate.',
  },
  {
    title: 'Disputing an unfair detention/port fee',
    when: 'A broker or carrier is billed detention/demurrage while the facility or port was closed.',
    script: '“This detention was caused by the facility being closed — my driver physically could not return the equipment. Under the FMC’s incentive principle (Evergreen v. FMC, 2026), fees that don’t promote freight fluidity aren’t valid. I have the closure documented and I’m disputing this charge.”',
    tip: 'Document the closure/cause in real time. The 2026 ruling is on your side when the delay was outside the driver’s control.',
  },
];

// Knowledge check for new dispatchers — covers the job and the portal.
const QUIZ = [
  { q: 'A broker offers $1,650 on a 750-mile load. The carrier’s floor is $2.30/mi. What do you do?', options: ['Book it — it’s over $1,500', 'Counter — $1,650 ÷ 750 = $2.20/mi is below the $2.30 floor', 'Decline without countering'], answer: 1, why: '$1,650 ÷ 750 = $2.20/mi, under the $2.30 floor. Counter toward the floor — the portal’s guard will also warn you before you send.' },
  { q: 'Before you dispatch the driver to the shipper, what MUST be done?', options: ['Nothing — just send them', 'The Rate Confirmation is signed and returned to the broker', 'The driver texts you'], answer: 1, why: 'Never roll without a signed, returned RateCon. It’s your binding agreement and proof for payment.' },
  { q: 'Why verify a broker’s $75,000 bond in FMCSA before booking?', options: ['It’s optional paperwork', 'If the bond is suspended, your carrier won’t get paid', 'It sets the rate'], answer: 1, why: 'A suspended broker can’t pay claims — booking with one risks your carrier’s paycheck. Use Broker Check.' },
  { q: 'A broker pressures you to book fast, offers a suspiciously high rate, and emails from a gmail address. This is…', options: ['A great deal — book it', 'Classic double-brokering red flags — verify independently or walk', 'Normal'], answer: 1, why: 'Urgency + too-good rate + generic email are textbook fraud signals. Two or more = stop and verify.' },
  { q: 'The driver is held 3 hours past their appointment at the receiver. You should…', options: ['Ignore it', 'Log the in/out times and file a detention claim', 'Tell them to leave'], answer: 1, why: 'Documented times are what get detention paid. File it on the load — the dispatcher sees it instantly.' },
  { q: 'What turns a signed Bill of Lading into a Proof of Delivery (POD)?', options: ['The broker signs it', 'The receiver inspects and signs it at delivery', 'You print it'], answer: 1, why: 'At delivery the receiver’s signature on the BOL makes it the POD — your proof to invoice.' },
  { q: 'What is “deadhead” and why does it matter?', options: ['Bonus pay', 'Empty miles to a pickup — they burn fuel for $0 and lower your true RPM', 'A type of trailer'], answer: 1, why: 'Always factor deadhead into the true rate-per-mile; it’s where new carriers quietly lose money.' },
  { q: 'A TriHaul (A→B→C→A) is worth building when…', options: ['Never', 'The triangle’s total revenue and RPM beat a cheap direct backhaul', 'Only on flatbeds'], answer: 1, why: 'A third leg through a strong market usually earns more at a higher RPM than a cheap B→A backhaul. The TriHaul Planner compares them.' },
];

function DispatchQuiz() {
  const [picked, setPicked] = useState({});
  const choose = (qi, oi) => setPicked((p) => (p[qi] != null ? p : { ...p, [qi]: oi }));
  const score = QUIZ.reduce((s, q, i) => s + (picked[i] === q.answer ? 1 : 0), 0);
  const answered = Object.keys(picked).length;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="text-lg font-bold flex items-center gap-2"><BookOpen className="text-amber-500" size={20} /> Knowledge Check</h3>
        <Badge tone={answered === QUIZ.length ? (score >= 6 ? 'emerald' : 'amber') : 'slate'}>{score}/{QUIZ.length}</Badge>
      </div>
      <p className="text-sm text-slate-400 mb-4">Eight questions on the job and the portal. Tap an answer to lock it in and see why.</p>
      <div className="space-y-5">
        {QUIZ.map((q, qi) => {
          const sel = picked[qi];
          const done = sel != null;
          return (
            <div key={qi}>
              <div className="text-sm font-semibold text-white mb-2">{qi + 1}. {q.q}</div>
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const isAnswer = oi === q.answer;
                  const isSel = sel === oi;
                  let cls = 'bg-slate-800/50 border-slate-700 text-slate-200 hover:border-slate-600';
                  if (done && isAnswer) cls = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300';
                  else if (done && isSel && !isAnswer) cls = 'bg-red-500/10 border-red-500/40 text-red-300';
                  else if (done) cls = 'bg-slate-800/30 border-slate-700/60 text-slate-500';
                  return (
                    <button key={oi} type="button" onClick={() => choose(qi, oi)} disabled={done}
                      className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors ${cls}`}>
                      {done && isAnswer ? '✓ ' : done && isSel && !isAnswer ? '✕ ' : ''}{opt}
                    </button>
                  );
                })}
              </div>
              {done && <p className="text-xs text-slate-400 mt-2"><span className="text-amber-400 font-semibold">Why:</span> {q.why}</p>}
            </div>
          );
        })}
      </div>
      {answered === QUIZ.length && (
        <div className={`mt-5 rounded-lg border p-4 text-sm ${score >= 6 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`}>
          {score >= 6 ? `🟢 ${score}/${QUIZ.length} — you’ve got the fundamentals. Go book a real one.` : `🟡 ${score}/${QUIZ.length} — review the Glossary and SOPs, then run it again.`}
          <button onClick={() => setPicked({})} className="ml-2 underline hover:text-white">Retake</button>
        </div>
      )}
    </Card>
  );
}

// 2-week dispatcher crash course (PUBLIC edition). Industry strategy any
// dispatcher can learn — proprietary AI/automation playbook is kept separate.
const CRASH_COURSE = [
  ['Week 1 — Foundations & Setup', [
    { d: 'Day 1', t: 'What a Dispatcher Does & How You Get Paid', s: 'The business model, where you fit, and how the money flows.',
      p: 'A dispatcher finds and books freight for carriers, negotiates the rate, handles the paperwork, and keeps the truck moving — for a percentage of each load (commonly 5–10%). You’re a service the carrier hires, not an employee. The money flows: you book → the carrier hauls → the broker pays (often the carrier’s factoring company funds it next-day) → you invoice the carrier your fee. Make the carrier more money than you cost them and you never run out of clients.',
      b: ['You earn a % of gross per load — set your fee (5–10% is typical).', 'You bill the carrier; you never touch the broker’s money.', 'Your value = higher rates + fewer empty miles + zero paperwork stress.'] },
    { d: 'Day 2', t: 'The Core Math: True RPM & Your Floor', s: 'Calculate the real rate per mile and the number you never book under.',
      p: 'Profit lives in one number: True RPM = gross linehaul ÷ (loaded miles + deadhead miles). A $2,100 load over 715 loaded + 25 deadhead = 740 total → $2.83/mi. Rookies forget the deadhead and book “losers.” Know each carrier’s break-even RPM (their cost per mile) and treat it as a hard floor. Then add leverage: when capacity is tight (e.g., reefers in Southeast produce season), counter harder.',
      b: ['True RPM = gross ÷ (loaded + deadhead) miles.', 'Always know the carrier’s break-even — it’s your floor.', 'Tight capacity = leverage to push the rate up.'] },
    { d: 'Day 3', t: 'Strategic Routing: The Triangle Method', s: 'Stop booking cheap backhauls — build a loaded triangle home.',
      p: 'A premium dispatcher never traps a driver in a “dead zone” (no outbound freight). Instead of a simple out-and-back (which forces a cheap, money-losing backhaul), route through a strong secondary market before heading home — e.g., Atlanta → Chicago → Dallas → Atlanta. More revenue, loaded miles, and a higher blended RPM even with extra distance. Bonus: route around the driver’s life — end days near safe parking, gyms, or good food to keep them healthy and loyal.',
      b: ['Map multi-day operations, not one load at a time.', 'Triangle beats out-and-back when the backhaul is weak.', 'Route for driver wellness — it’s a retention edge.'] },
    { d: 'Day 4', t: 'Carrier Onboarding & the Paperwork Packet', s: 'Legally lock in the relationship before you book a single load.',
      p: 'Before booking freight, set the carrier up with a clean packet: a Dispatch Agreement (your fee %, payment terms, and a “No Forced Dispatch” clause that protects your liability) and a Limited Power of Attorney (LPOA) giving you authority strictly to sign rate confirmations on their behalf. Collect and vault their MC Authority, W-9, Certificate of Insurance (COI), and Notice of Assignment (NOA) so a broker setup takes 3 minutes, not 30. Have an attorney review your actual Dispatch Agreement and LPOA before relying on them.',
      b: ['Dispatch Agreement: fee %, terms, no-forced-dispatch.', 'LPOA: authority to sign RateCons only.', 'Vault MC Authority, W-9, COI, NOA for fast setups.'] },
    { d: 'Day 5', t: 'Broker Setup, RateCons & the Factoring Flow', s: 'Finding the load is step one; securing the contract and the cash is step two.',
      p: 'Use your document vault to rip through a broker’s onboarding portal — speed wins loads. On every load, audit the Rate Confirmation before signing: linehaul rate, pickup/delivery times, weight, and detention policy. Sign via e-sign using your LPOA. Carriers can’t wait 30–60 days for a broker check, so they submit the signed BOL to a factoring company for next-day payout — which is why you give the broker the NOA (so they pay the factor). Invoice the carrier your fee right after they’re funded.',
      b: ['Audit every RateCon line by line before signing.', 'The NOA tells the broker to pay the factoring company.', 'Invoice your fee the moment the carrier is funded.'] },
    { d: 'Day 6', t: 'Your Tech Stack: Work at the Speed of the Market', s: 'The tools that let one person dispatch like a team.',
      p: 'The market moves in minutes; your setup has to keep up. At minimum: a dispatch platform/TMS to run carriers, loads, and paperwork in one place (that’s what Forward OS does), a CRM so no broker or carrier lead slips, and a way to automate the busywork — check-call texts, load offers, notifications — so your time goes to deals, not data entry. A good AI assistant can speed up RPM math, draft counter-scripts, and triage messages. Principle: automate the repetitive so your hours go to negotiating and selling.',
      b: ['One system for carriers, loads, and documents (TMS).', 'A CRM so no broker or lead slips through.', 'Automate check-calls/notifications; use AI to move faster.'] },
    { d: 'Day 7', t: 'Week 1 Review & Self-Check', s: 'Lock in the foundation before you start dialing.',
      p: 'Before you hunt carriers, make sure you can do these cold: calculate True RPM in your head, explain why a backhaul can be a loser, name the four onboarding documents, and walk the factoring flow. If any are fuzzy, re-read the day. Then set up one test carrier end-to-end in your tools so the mechanics are muscle memory before real money is on the line.',
      b: ['Can you calc True RPM instantly?', 'Can you explain triangle vs. backhaul?', 'Do you know the packet (Authority, W-9, COI, NOA) + factoring flow?'] },
  ]],
  ['Week 2 — Acquisition & Operations', [
    { d: 'Day 8', t: 'Finding Carriers: Sourcing & the “Sweet Spot”', s: 'Where good owner-operators actually come from.',
      p: 'Don’t buy generic lead lists. Pull carriers directly from the FMCSA SAFER database (or a tool like CarrierOK). Target the sweet spot: owner-operators with 1–3 trucks. Their MC authority should generally be older than 6 months — brokers reject brand-new MCs over fraud concerns (unless you run the new-authority play in Day 11). Filter to your local state/region; pitching as “a local dispatcher based out of [your city]” builds instant trust.',
      b: ['Source from FMCSA SAFER, not bought lists.', 'Sweet spot: 1–3 truck owner-operators, MC 6+ months.', 'Lead with local — it builds trust fast.'] },
    { d: 'Day 9', t: 'The Discovery Call', s: 'Don’t just sell — interview them to make sure they’re profitable.',
      p: 'When you get an owner-operator on the phone, qualify before you pitch. Phase 1 (hard qualifiers): “How old is your MC authority? Are you set up with factoring? What equipment are you running?” Phase 2 (operations): “What’s your bottom-dollar True RPM? Where’s home base? Any states you won’t run?” Phase 3 (pain point): “What’s the most frustrating part of your day out there?” — then pitch your service straight at that pain.',
      b: ['Qualify authority, factoring, and equipment first.', 'Get their floor RPM, home base, and no-go states.', 'Find the pain, then sell to it.'] },
    { d: 'Day 10', t: 'Outbound That Works: The Multi-Touch Campaign', s: 'A sequence that cuts through the spam every driver ignores.',
      p: 'One call won’t land a carrier — run a sequence. Tuesday AM, an SMS pattern-interrupt: “Hey [Name], I’m a local dispatcher based out of [city]. Looking for one reliable [equipment] owner-operator to feed direct freight. Running or parked?” Wednesday PM, a value-first call to non-responders — lead with market intel, not “how are you.” Thursday, the proof-of-work close: “Don’t sign anything. Let me run the board tomorrow; if I beat your usual rate I’ll text it. If you like it, we do paperwork. If not, we part as friends.”',
      b: ['Open with an SMS pattern-interrupt, not a cold call.', 'Follow with a value-first call (lead with intel).', 'Close with risk-free “proof of work.”'] },
    { d: 'Day 11', t: 'The New-Authority Opportunity', s: 'The market everyone else ignores — new carriers stuck waiting.',
      p: 'Major brokers make new carriers wait out a ~90-day window, leaving brand-new owner-operators stranded. That’s an opening. Build an internal list of brokers who accept day-one active authorities, and position yourself as the dispatcher who keeps a new truck moving while its authority matures. Pitch: “We don’t let a calendar hold your truck back — we have the broker connections to keep you rolling now.”',
      b: ['New MCs are blocked ~90 days by big brokers.', 'Build a list of day-one-friendly brokers.', 'Own the “stranded new authority” niche.'] },
    { d: 'Day 12', t: 'Content Marketing & Brand', s: 'Make leads come to you with short vertical video.',
      p: 'Generate inbound interest with 9:16 vertical videos (TikTok/Reels). Sell the premium, professional angle — not loud “cheap loads” pitches. Two formats that work: the silent-cinematic ad (a chaotic load board smoothly cutting to a clean golden-hour truck shot, with text like “Tired of the chaos? Upgrade your dispatch.”) and a hook that leads with your standard: “Most dispatchers guess. We run on SOPs. You drive — we’ve got it handled.” Consistency beats virality.',
      b: ['9:16 vertical video; premium tone, not loud sales.', 'Show the “chaos → calm” transformation.', 'Post consistently; brand beats one viral hit.'] },
    { d: 'Day 13', t: 'The Daily Operating Rhythm', s: 'A dispatcher without a routine drowns — here’s the schedule.',
      p: 'Run your day with structure so multiple trucks don’t overwhelm you. 0700–0800 Morning Audit: check-call texts; confirm every driver is loaded, rolling, and legal on HOS; check weather on routes. 0800–1100 War Room (peak market): cross-reference empty trucks with the board, calc True RPMs, negotiate, lock loads. 1100–1300 Admin: broker setups, RateCon audits, sign via LPOA, send pickup details, handle detention disputes. 1300–1500 Marketing Sprint: pull leads, send outbound, make calls. 1500–1700 Tomorrow’s Blueprint: check delivery progress, map tomorrow’s triangle routes, send your fee invoices for today’s funded loads.',
      b: ['Morning: audit every truck — loaded, rolling, legal.', 'Mid-day: hunt loads, then handle admin.', 'Afternoon: market, then blueprint tomorrow + invoice.'] },
    { d: 'Day 14', t: 'Going Live: Your Launch Checklist', s: 'Verify every system is green before your first live call.',
      p: 'Before you dial your first carrier, confirm: your tools are live (TMS/CRM, document vault organized to receive MC/COI paperwork), your intake link is ready to send prospects, your lead list is pulled and formatted for the outbound sprint, and your scripts are within reach. Then execute. The dispatchers who win aren’t the smartest — they’re the ones who start, stay consistent, and run their SOPs every single day.',
      b: ['Tools live: TMS/CRM + organized document vault.', 'Intake link + lead list ready to go.', 'Scripts handy — then start. Consistency wins.'] },
  ]],
];

// ---------- Practice Broker Call (AI negotiation simulator) ----------
// Flip to true once the practiceBrokerCall Cloud Function is deployed and
// the ANTHROPIC_API_KEY secret is funded — until then this stays a "coming
// soon" card so nobody hits a broken chat / undeployed-function error.
const PRACTICE_CALL_ENABLED = true;

const BROKER_CALL_DIFFICULTIES = [
  ['easy', 'Easy — flexible broker'],
  ['normal', 'Normal — firm but fair'],
  ['hard', 'Hard — tough, has other options'],
];

function PracticeCallComingSoon() {
  return (
    <Card className="p-8 text-center">
      <div className="text-3xl mb-2">🚧</div>
      <h3 className="text-xl font-bold mb-1">Practice Broker Call — Coming Soon</h3>
      <p className="text-slate-400 text-sm max-w-md mx-auto">
        An AI-powered negotiation simulator is on the way — practice working a rate against a
        simulated broker before you do it for real. We'll turn this on soon.
      </p>
    </Card>
  );
}

function PracticeCallView() {
  if (!PRACTICE_CALL_ENABLED) return <PracticeCallComingSoon />;
  const [phase, setPhase] = useState('setup'); // setup | call | scored
  const [scenario, setScenario] = useState({
    origin: '', destination: '', miles: '', brokerRate: '', floorRate: '', equipment: 'Dry Van', difficulty: 'normal',
  });
  const set = (k) => (e) => setScenario((s) => ({ ...s, [k]: e.target.value }));
  const [messages, setMessages] = useState([]); // [{role:'user'|'assistant', content}]
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [finalRate, setFinalRate] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const canStart = scenario.origin.trim() && scenario.destination.trim() && Number(scenario.miles) > 0
    && Number(scenario.brokerRate) > 0 && Number(scenario.floorRate) > 0;

  const startCall = () => {
    if (!canStart) return;
    const brokerName = ['Mike', 'Dana', 'Curtis', 'Renee', 'Sam'][Math.floor(Math.random() * 5)];
    const opener = `Hey, this is ${brokerName} — I've got a ${scenario.equipment} load from ${scenario.origin} to ${scenario.destination}, about ${scenario.miles} miles. Looking to move it for $${Number(scenario.brokerRate).toLocaleString()}. Can you run it?`;
    setMessages([{ role: 'assistant', content: opener }]);
    setPhase('call');
    setErr('');
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setDraft('');
    setSending(true);
    setErr('');
    try {
      const call = httpsCallable(functionsClient, 'practiceBrokerCall');
      const res = await call({ scenario, messages: next });
      const reply = (res.data && res.data.reply) || "Sorry, can you say that again?";
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (e) {
      console.error('practiceBrokerCall failed', e);
      setErr('The broker simulator is unavailable right now — make sure the practiceBrokerCall function is deployed.');
    } finally {
      setSending(false);
    }
  };

  const score = () => {
    const rate = Number(finalRate);
    if (!rate) return;
    setPhase('scored');
  };

  const resetAll = () => {
    setPhase('setup'); setMessages([]); setFinalRate(''); setErr('');
  };

  const field = INPUT_CLS;
  const rate = Number(finalRate);
  const floor = Number(scenario.floorRate);
  const miles = Number(scenario.miles);
  const beatFloor = rate >= floor;
  const rpm = miles > 0 ? (rate / miles) : 0;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <PanelHeader icon={<GraduationCap size={18} />} title="Practice Broker Call" badge={<Badge tone="indigo" className="text-[10px]">AI</Badge>} />
        <p className="text-sm text-slate-400 mt-2">Negotiate a made-up load against an AI broker before you do it for real. No live data touched — nothing here books a load or contacts anyone.</p>
      </Card>

      {phase === 'setup' && (
        <Card className="p-6">
          <h3 className="font-bold mb-4">Set up the scenario</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Origin"><input className={field} value={scenario.origin} onChange={set('origin')} placeholder="Atlanta, GA" /></Field>
            <Field label="Destination"><input className={field} value={scenario.destination} onChange={set('destination')} placeholder="Charlotte, NC" /></Field>
            <Field label="Miles"><input className={field} type="number" value={scenario.miles} onChange={set('miles')} placeholder="245" /></Field>
            <Field label="Equipment">
              <select className={SELECT_CLS} value={scenario.equipment} onChange={set('equipment')}>
                {['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Power Only'].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Broker's opening offer ($)"><input className={field} type="number" value={scenario.brokerRate} onChange={set('brokerRate')} placeholder="450" /></Field>
            <Field label="Your floor / break-even ($)"><input className={field} type="number" value={scenario.floorRate} onChange={set('floorRate')} placeholder="600" /></Field>
            <Field label="Difficulty" className="sm:col-span-2">
              <select className={SELECT_CLS} value={scenario.difficulty} onChange={set('difficulty')}>
                {BROKER_CALL_DIFFICULTIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
          </div>
          <PrimaryButton onClick={startCall} disabled={!canStart} className="mt-5 px-5">Start the call</PrimaryButton>
        </Card>
      )}

      {phase === 'call' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">{scenario.origin} → {scenario.destination} <span className="text-slate-500 font-normal text-sm">({scenario.miles} mi, {scenario.equipment})</span></h3>
            <button onClick={resetAll} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
          </div>
          <div ref={scrollRef} className="h-80 overflow-y-auto space-y-3 bg-slate-950/50 border border-slate-800 rounded-lg p-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-amber-500 text-slate-950 font-medium' : 'bg-slate-800 text-slate-200'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-slate-500">Broker is typing…</div>}
          </div>
          {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
          <div className="flex gap-2 mt-3">
            <input className={field} value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="Type your counter-offer or question…" disabled={sending} />
            <PrimaryButton onClick={send} disabled={sending || !draft.trim()} className="px-5 shrink-0">Send</PrimaryButton>
          </div>
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800">
            <input className={field + ' max-w-[160px]'} type="number" value={finalRate} onChange={(e) => setFinalRate(e.target.value)} placeholder="Agreed rate ($)" />
            <button onClick={score} disabled={!finalRate} className="text-sm bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-4 py-2 rounded-lg disabled:opacity-50">End call — score it</button>
          </div>
        </Card>
      )}

      {phase === 'scored' && (
        <Card className="p-6 text-center">
          <div className={`text-3xl mb-2`}>{beatFloor ? '🎉' : '⚠️'}</div>
          <h3 className="text-xl font-bold mb-1">{beatFloor ? 'You beat your floor' : 'You went below your floor'}</h3>
          <p className="text-slate-400 text-sm mb-4">
            Agreed rate: <strong className="text-white">${rate.toLocaleString()}</strong> ({rpm.toFixed(2)}/mi)
            {' — '}your floor was <strong className="text-white">${floor.toLocaleString()}</strong>.
          </p>
          <p className="text-sm text-slate-400 mb-6">
            {beatFloor
              ? `You cleared your floor by $${(rate - floor).toLocaleString()}. Nice work holding your ground.`
              : `You came in $${(floor - rate).toLocaleString()} under your floor — review the transcript above and see where you could've held firmer.`}
          </p>
          <PrimaryButton onClick={resetAll} className="px-5">Try another scenario</PrimaryButton>
        </Card>
      )}
    </div>
  );
}

function TrainingView() {
  const [tab, setTab] = useState('practice');
  const TABS = [
    ['practice', 'Practice & Quiz'],
    ['practice-call', 'Practice Broker Call'],
    ['course', '2-Week Crash Course'],
    ['guided', 'Guided Mode'],
    ['glossary', 'Freight Glossary'],
    ['sops', 'SOPs'],
    ['scripts', 'Negotiation Scripts'],
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <GraduationCap className="text-amber-500" size={26} />
        <h2 className="text-2xl font-bold">Dispatcher Training</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Your onboarding playbook — reference it anytime, and flip on <span className="text-amber-300 font-semibold">Guided Mode</span> in the header to get walked through workflows live.</p>
      <GuidedHint>New to dispatch? This is your playbook. Read the <strong>Glossary</strong> and <strong>SOPs</strong>, keep the <strong>Negotiation Scripts</strong> handy on broker calls — and with Guided Mode on, you’ll see tips like this on every tab.</GuidedHint>

      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-sm px-4 py-2 rounded-full border transition-colors ${tab === k ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'practice' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-1"><GraduationCap className="text-amber-500" size={20} /> Practice Run — Book Your First Load</h3>
            <p className="text-sm text-slate-400 mb-4">Follow these steps end-to-end with a test carrier. Flip <span className="text-amber-300 font-semibold">Guided Mode</span> on first — it’ll coach you through each screen. Nothing here is live until you assign a real load.</p>
            <ol className="space-y-3">
              {[
                ['Set up a test carrier', 'Carriers → Add a Carrier. Fill the specs and use “…or create their login right here” to make a test login in one step.'],
                ['Vet the broker', 'Broker Check → run the checklist and the double-broker red-flag scan. Two or more flags = walk away.'],
                ['Work the rate', 'Rate Calculator → pick your test carrier, enter the lane and the broker’s offer. Tap the market-rate suggestion. Watch the banner go red/yellow/green.'],
                ['Check the clock', 'Scroll to the HOS Validator — confirm the load is legal on the driver’s hours before you commit.'],
                ['Plan the triangle', 'TriHaul Planner → pull the lane and compare a round trip vs. a triangle so you’re not stuck with a cheap backhaul.'],
                ['Send it', 'Back in the Rate Calculator, set the Final Agreed Rate and “Send as Offer.” Try a below-floor rate first to see the safety guard fire.'],
                ['Follow the paperwork', 'Open the load and walk the “Paperwork to Collect & Confirm” stages — RateCon & NOA, then BOL, then POD & invoice.'],
              ].map(([title, body], i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <div><span className="text-sm font-semibold text-white">{title}.</span> <span className="text-sm text-slate-400">{body}</span></div>
                </li>
              ))}
            </ol>
          </Card>

          <DispatchQuiz />
        </div>
      )}

      {tab === 'practice-call' && <PracticeCallView />}

      {tab === 'course' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-1">The 2-Week Crash Course</h3>
            <p className="text-sm text-slate-400">Fourteen short lessons from zero to booking your first load. Work one a day, or binge it — each ties straight into a tab in this platform.</p>
          </Card>
          {CRASH_COURSE.map(([week, days]) => (
            <div key={week} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">{week}</div>
              {days.map((x) => (
                <details key={x.d} className="group rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <summary className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">{x.d}</span>
                      <span className="block font-bold text-white">{x.t}</span>
                      <span className="block text-xs text-slate-500 mt-0.5">{x.s}</span>
                    </span>
                    <span className="text-amber-400 transition-transform group-open:rotate-45 shrink-0">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-slate-300 leading-relaxed">{x.p}</p>
                  <ul className="mt-3 space-y-1.5">
                    {x.b.map((bullet, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-400"><span className="text-amber-400 shrink-0">•</span><span>{bullet}</span></li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === 'guided' && (
        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-3"><GraduationCap className="text-amber-500" size={20} /> What Guided Mode does</h3>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">Toggle <span className="text-amber-300 font-semibold">Guided Mode</span> in the top header. When it’s on, the portal adds soft checklists and contextual tips to the trickiest workflows — so new dispatchers build good habits without slowing down. It never hard-blocks you; it nudges.</p>
            <div className="space-y-3">
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <div className="font-semibold text-white text-sm">Workflow A — Carrier Verification</div>
                <div className="text-xs text-slate-400 mt-1">Adds a verification checklist to the Carriers tab (active authority, W-9, COI, NOA) and flags a carrier as “Verified” once everything’s confirmed.</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <div className="font-semibold text-white text-sm">Workflow B — Load Negotiation</div>
                <div className="text-xs text-slate-400 mt-1">The Rate Calculator surfaces your Target Floor and negotiation scripts, and reminds you to clear the carrier’s minimum before assigning.</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <div className="font-semibold text-white text-sm">Workflow C — RateCon Check</div>
                <div className="text-xs text-slate-400 mt-1">Before a load is sent, a quick checklist confirms the rate, times, and fees match what was agreed.</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'glossary' && (
        <Card className="p-6">
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><BookOpen className="text-amber-500" size={20} /> Freight Glossary — 15 Terms to Know</h3>
          <div className="space-y-3">
            {GLOSSARY.map(([term, def]) => (
              <div key={term} className="border-b border-slate-800 last:border-0 pb-3 last:pb-0">
                <div className="text-sm font-semibold text-amber-400">{term}</div>
                <div className="text-sm text-slate-300 mt-0.5">{def}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'sops' && (
        <div className="space-y-6">
          {SOPS.map((sop) => (
            <Card key={sop.title} className="p-6">
              <h3 className="text-lg font-bold flex items-center gap-2 mb-1"><ShieldCheck className="text-amber-500" size={20} /> {sop.title}</h3>
              <p className="text-sm text-slate-400 mb-4">{sop.intro}</p>
              <ol className="space-y-2">
                {sop.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-300">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}

      {tab === 'scripts' && (
        <div className="space-y-4">
          {TALK_TRACKS.map((t) => (
            <Card key={t.title} className="p-6">
              <h3 className="text-base font-bold text-white">{t.title}</h3>
              <div className="text-xs text-slate-500 mt-0.5 mb-3">Use when: {t.when}</div>
              <div className="bg-slate-800/50 border-l-2 border-amber-500 rounded-r-lg p-4 text-sm text-slate-200 italic leading-relaxed">{t.script}</div>
              <div className="text-xs text-emerald-400 mt-3">Tip: {t.tip}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- CARRIER: BUSINESS UPGRADES & CREDENTIALS ----------
const CREDENTIALS = [
  { key: 'TWIC', label: 'TWIC Card', find: true, steps: [
    'Pre-enroll online at universalenroll.dhs.gov and book an appointment.',
    'Visit a TSA enrollment center with ID/citizenship docs and the fee (~$125, valid 5 yrs).',
    'Your card arrives in ~2–3 weeks — activate it and you can run port/secure facility loads.',
  ] },
  { key: 'Hazmat', label: 'Hazmat (H)', steps: [
    'Apply for the Hazmat (H) endorsement on your CDL at your state DMV.',
    'Complete the TSA Hazmat background check (fingerprints + fee).',
    'Pass the hazmat knowledge test — the endorsement is added to your CDL.',
  ] },
  { key: 'Tanker', label: 'Tanker (N)', steps: [
    'Study the tanker section of your state CDL manual.',
    'Pass the tanker (N) knowledge test at the DMV.',
    'Endorsement added — you can now haul liquid/gas in bulk for higher-paying loads.',
  ] },
  { key: 'SCAC', label: 'SCAC Code', steps: [
    'A SCAC is a 2–4 letter carrier code from the NMFTA (not a TSA credential).',
    'Apply at nmfta.org and pay the annual fee.',
    'Receive your code — required for many intermodal, government, and EDI loads.',
  ] },
];

// ---------- CARRIER: AGREEMENTS & W-9 (onboarding packet, e-signed) ----------
// Captures the W-9 once, then reuses that data to fill the Dispatch Agreement
// and Limited Power of Attorney — both e-signed (typed legal name + intent +
// timestamp, ESIGN/UETA-valid). All stored on the carrier's own user doc.
const W9_CLASSES = ['Individual / Sole Proprietor', 'Single-Member LLC', 'LLC — taxed as C-corp', 'LLC — taxed as S-corp', 'C Corporation', 'S Corporation', 'Partnership'];

// Module-level so they keep a stable identity (no input remount/focus loss).
function ESignBox({ value, onChange, agree, onAgree, onSign, label }) {
  return (
    <div className="mt-4 rounded-lg bg-slate-800/50 border border-slate-700 p-4">
      <label className="block text-xs text-slate-400 mb-1">Type your full legal name to sign</label>
      <input className={INPUT_CLS} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Full legal name" />
      <label className="flex items-start gap-2 mt-3 text-xs text-slate-400 cursor-pointer">
        <input type="checkbox" checked={agree} onChange={(e) => onAgree(e.target.checked)} className="mt-0.5 accent-amber-500" />
        <span>{label}</span>
      </label>
      <PrimaryButton onClick={onSign} disabled={!value.trim() || !agree} className="mt-3 px-5">✍️ Sign &amp; Submit</PrimaryButton>
    </div>
  );
}
function ESigned({ rec }) {
  const when = rec.signedAtMs ? new Date(rec.signedAtMs).toLocaleString() : '';
  return (
    <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm text-emerald-300">
      ✓ Signed by <strong>{rec.signedName}</strong> on {when}{rec.company ? ` · ${rec.company}` : ''}
    </div>
  );
}

// ---- Agreement templates ----
// The built-in defaults below are what carriers sign unless the workspace's
// dispatcher saves their own text (Settings → Carrier agreements). Tokens
// {{company}} {{carrier}} {{mc}} {{fee}} are filled in per carrier at render
// AND at signing time — the signature record stores a snapshot of the exact
// text that was signed.
const DEFAULT_AGREEMENT_TEXT = `**DISPATCH SERVICE AGREEMENT**

This Agreement is between **{{company}}** ("Dispatcher") and **{{carrier}}**, MC# {{mc}} ("Carrier").

**1. Services.** Dispatcher will locate and book freight, negotiate rates, and provide administrative support on Carrier's behalf.

**2. Fee.** Carrier agrees to pay Dispatcher a dispatch fee of **{{fee}}%** of the gross linehaul revenue of each load booked by Dispatcher, due within 24 hours of Carrier's receipt of payment (including factoring advances).

**3. No Forced Dispatch.** Carrier is never obligated to accept any load and may decline any load for any reason.

**4. Independent Contractors.** The parties are independent contractors; nothing here creates employment, partnership, or joint venture (other than the limited authority granted in the Power of Attorney).

**5. Authority & Insurance.** Carrier represents it holds active operating authority and required insurance and will keep them current.

**6. Term.** Either party may terminate with written notice; fees earned before termination remain due.

**7. Liability.** Dispatcher is not a motor carrier or broker and assumes no liability for cargo, freight charges, or Carrier's operations.`;

const DEFAULT_LPOA_TEXT = `**LIMITED POWER OF ATTORNEY**

**{{carrier}}**, MC# {{mc}} ("Carrier"), appoints **{{company}}** as its limited attorney-in-fact for the sole and limited purpose of:

• signing rate confirmations and broker-carrier load agreements on Carrier's behalf, and

• completing broker setup packets using Carrier's documents already on file.

This authority does **not** extend to banking, to any contract unrelated to load booking, or to any obligation beyond load tender. Carrier may revoke this authority at any time in writing.`;

function fillAgreementTokens(text, vals) {
  return String(text || '').replace(/\{\{(company|carrier|mc|fee)\}\}/g, (_, k) => String(vals[k] ?? ''));
}

// Renders agreement text: paragraphs split on blank lines, **bold** spans.
function AgreementText({ text }) {
  const paras = String(text || '').trim().split(/\n\s*\n/);
  return (
    <div className="mt-3 rounded-sm bg-slate-950/50 border border-slate-800 p-4 text-sm text-slate-300 leading-relaxed space-y-2 max-h-72 overflow-y-auto">
      {paras.map((p, i) => (
        <p key={i}>
          {p.split(/\*\*(.+?)\*\*/g).map((seg, j) => (j % 2 ? <strong key={j} className={i === 0 ? 'text-white' : ''}>{seg}</strong> : seg))}
        </p>
      ))}
    </div>
  );
}

// ---------- FMF DISPATCHER: REVENUE-SHARE AGREEMENT (e-signed in-portal) ----------
// FMF dispatchers dispatch under Forward Motion Freight's brand/authority and
// owe FMF a share of their dispatch-fee income. They e-sign this in the portal
// before they can book real freight. Reuses the append-only signed_agreements
// record and the same e-sign components as the carrier agreements (no rule
// change needed — a dispatcher may create a signed record for her own uid).
const FMF_REVSHARE_PCT = 20;  // FMF's % of the dispatcher's dispatch-fee income
const FMF_REVSHARE_MIN = 50;  // monthly floor in $ (raise as per-dispatcher cost firms up)

const DEFAULT_REVSHARE_TEXT = `**FORWARD MOTION FREIGHT — DISPATCHER REVENUE-SHARE AGREEMENT**

This Agreement is between **{{company}}** ("FMF") and **{{dispatcher}}** ({{email}}) ("Dispatcher"), effective **{{effective}}**.

**1. Relationship.** Dispatcher is an independent contractor who dispatches freight under the Forward Motion Freight brand and operating authority using the Forward OS portal and FMF's support. Dispatcher brings and manages her own carriers; FMF does not supply carriers or leads under this Agreement.

**2. What FMF provides.** Use of the FMF brand and authority, access to the Forward OS dispatch platform, and reasonable operational support.

**3. Revenue share.** FMF receives **{{sharePct}}% of Dispatcher's dispatch-fee income** — {{sharePct}}% of the fees Dispatcher earns from her carriers. This is calculated on Dispatcher's dispatch fee, NOT on the gross value of the load. Example: a {{exGross}} load at a {{exFeePct}}% dispatch fee earns {{exFee}} in fee income, so FMF's {{sharePct}}% share is **{{exShare}}**.

**4. Monthly minimum.** If {{sharePct}}% of Dispatcher's dispatch-fee income for a month is below **{{minimum}}/month**, the {{minimum}} minimum applies for that month instead.

**5. Reporting & payment.** Dispatcher books loads through Forward OS, which records each load's gross and dispatch fee. Each month FMF totals Dispatcher's dispatch-fee income from the portal and Dispatcher remits the amount due. Dispatcher agrees to run loads dispatched under FMF's authority through Forward OS and to keep accurate records.

**6. Change of arrangement.** If FMF later begins supplying leads or carriers to Dispatcher, the parties will renegotiate the revenue share in writing before that arrangement begins.

**7. Term & termination.** Either party may terminate with written notice. Fees earned before termination remain due. On termination Dispatcher's access to Forward OS and the FMF brand/authority ends; Dispatcher's own carrier relationships remain hers.

**8. Confidentiality.** Dispatcher will keep FMF's non-public business information confidential and will not copy or repurpose the Forward OS platform or FMF's processes outside this Agreement.

By typing your full legal name below and signing, Dispatcher agrees to the terms of this Agreement.`;

function fillRevShareTokens(text, v) {
  return String(text || '').replace(/\{\{(company|dispatcher|email|sharePct|minimum|effective|exGross|exFeePct|exFee|exShare)\}\}/g, (_, k) => String(v[k] ?? ''));
}

// Shown in place of Assign Load when an FMF dispatcher hasn't signed yet.
function AgreementRequired({ onNavigate }) {
  return (
    <div className="max-w-xl mx-auto mt-10">
      <Card className="p-8 text-center border-amber-500/40">
        <div className="text-4xl mb-3">✍️</div>
        <h2 className="text-xl font-bold text-white mb-2">Sign your agreement to go live</h2>
        <p className="text-slate-400 text-sm mb-5">Booking real freight under Forward Motion Freight’s authority requires your signed revenue-share agreement. Review the terms and e-sign — it takes a minute.</p>
        <PrimaryButton onClick={() => onNavigate && onNavigate('fmfagreement')} className="px-6">Review &amp; sign the agreement</PrimaryButton>
      </Card>
    </div>
  );
}

// The FMF dispatcher's own view: auto-filled revenue-share agreement, e-signed
// in the portal. Signing writes the append-only record + a marker on her user
// doc, which lifts the go-live gate (dashboard banner + Assign Load block).
function DispatcherAgreementView({ onSigned }) {
  const uid = auth.currentUser?.uid;
  const [loading, setLoading] = useState(true);
  const [signed, setSigned] = useState(null);
  const [dispName, setDispName] = useState('');
  const [email, setEmail] = useState('');
  const [sig, setSig] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState(''); // per-workspace override; '' → built-in default
  const company = 'Forward Motion Freight';

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const uSnap = await getDoc(doc(db, 'users', uid));
      const ud = uSnap.exists() ? uSnap.data() : {};
      // Prefer the append-only record over the user-doc marker — under the
      // new rules the marker write in doSign can silently fail (self-write
      // denied), so relying on it here would wrongly show "not yet signed"
      // to someone who already has signed.
      let rec = ud.revShareAgreement || null;
      try {
        const sa = await getDocs(query(collection(db, 'signed_agreements'), where('uid', '==', uid), where('type', '==', 'revShareAgreement')));
        if (!sa.empty) {
          const recs = sa.docs.map((d) => d.data()).sort((a, b) => (b.signedAtMs || 0) - (a.signedAtMs || 0));
          rec = recs[0];
        }
      } catch (_) { /* fall back to the marker read above */ }
      setSigned(rec);
      const nm = ud.displayName || (ud.email ? ud.email.split('@')[0] : '') || '';
      setDispName(nm);
      setEmail(ud.email || auth.currentUser?.email || '');
      setSig(rec ? rec.signedName : nm);
      if (ACTIVE_ORG) { try { const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (o.exists()) setTpl(o.data().revShareText || ''); } catch (_) { /* falls back to default */ } }
    } catch (e) { console.error('agreement load failed', e); }
    finally { setLoading(false); }
  })(); }, [uid]);

  const exGross = 2000, exFeePct = 8;
  const exFee = exGross * (exFeePct / 100);
  const exShare = exFee * (FMF_REVSHARE_PCT / 100);
  const usd = (n) => '$' + Number(n).toLocaleString('en-US');
  const today = (() => { try { return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (_) { return ''; } })();
  const tokenVals = {
    company, dispatcher: dispName || 'Dispatcher', email, sharePct: FMF_REVSHARE_PCT,
    minimum: usd(FMF_REVSHARE_MIN), effective: today,
    exGross: usd(exGross), exFeePct, exFee: usd(exFee), exShare: usd(exShare),
  };
  const body = fillRevShareTokens((tpl && tpl.trim()) || DEFAULT_REVSHARE_TEXT, tokenVals);

  const doSign = async () => {
    if (!sig.trim() || !agree || busy) return;
    setBusy(true);
    const rec = { signedName: sig.trim(), company, sharePct: FMF_REVSHARE_PCT, minimum: FMF_REVSHARE_MIN, email, signedAtMs: Date.now(), signedAt: serverTimestamp(), textSnapshot: body };
    try {
      // The append-only record is authoritative — write it first, and gate
      // the signed state / onSigned callback on THIS succeeding, not the marker.
      await addDoc(collection(db, 'signed_agreements'), stampOrg({ ...rec, uid, type: 'revShareAgreement' }));
      // The user-doc marker is now a display convenience only — self-write is
      // no longer allowed by rules (super-only). Never let its failure block
      // signing; every real gate reads the record above, not this marker.
      try { await setDoc(doc(db, 'users', uid), { revShareAgreement: rec }, { merge: true }); } catch (_) { /* denied under the new rules — fine, record already saved */ }
      setSigned(rec);
      if (onSigned) onSigned();
    } catch (e) { console.error('revshare sign failed', e); alert('Could not record your signature — try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Dispatcher Agreement</h2>
        {signed ? <Badge tone="emerald">Signed</Badge> : <Badge tone="amber">Needs signature</Badge>}
      </div>
      <p className="text-slate-400">Your revenue-share agreement with Forward Motion Freight. Review the terms and e-sign — this is required before you dispatch real freight under FMF’s authority.</p>
      {loading ? <SkelRows rows={5} className="py-6" /> : (
        <Card className="p-6">
          <AgreementText text={signed ? signed.textSnapshot : body} />
          {signed
            ? <ESigned rec={signed} />
            : <ESignBox value={sig} onChange={setSig} agree={agree} onAgree={setAgree} onSign={doSign}
                label="Typing my full legal name is my electronic signature accepting this agreement." />}
        </Card>
      )}
    </div>
  );
}

function CarrierAgreementsView({ uid, isAdmin }) {
  const targetUid = uid || auth.currentUser?.uid;
  const canSign = !isAdmin; // a dispatcher viewing-as sees it read-only
  const [loading, setLoading] = useState(true);
  const [carrier, setCarrier] = useState(null);
  const [company, setCompany] = useState('your dispatcher');
  const [orgTpl, setOrgTpl] = useState({ agreementText: '', lpoaText: '' });
  const [resign, setResign] = useState({});       // { dispatchAgreement?: true, lpoa?: true }
  const [history, setHistory] = useState([]);     // immutable signed_agreements records
  const [w9, setW9] = useState({ legalName: '', businessName: '', ein: '', address: '', city: '', state: '', zip: '', classification: 'Single-Member LLC' });
  const [agreement, setAgreement] = useState(null);
  const [lpoa, setLpoa] = useState(null);
  const [w9Msg, setW9Msg] = useState('');
  const [sigA, setSigA] = useState(''); const [agreeA, setAgreeA] = useState(false);
  const [sigP, setSigP] = useState(''); const [agreeP, setAgreeP] = useState(false);
  const set = (k) => (e) => setW9((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const [uSnap, cSnap] = await Promise.all([
        getDoc(doc(db, 'users', targetUid)),
        getDocs(query(collection(db, 'carriers'), where('linkedDriverUid', '==', targetUid))),
      ]);
      const ud = uSnap.exists() ? uSnap.data() : {};
      const c = cSnap.docs[0] ? { id: cSnap.docs[0].id, ...cSnap.docs[0].data() } : null;
      setCarrier(c);
      setAgreement(ud.dispatchAgreement || null);
      setLpoa(ud.lpoa || null);
      setResign(ud.resignRequest || {});
      try {
        const hs = await getDocs(query(collection(db, 'signed_agreements'), where('uid', '==', targetUid)));
        setHistory(hs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.signedAtMs || 0) - (a.signedAtMs || 0)));
      } catch (_) { /* history is best-effort */ }
      const name = (ud.w9 && ud.w9.legalName) || (c && c.driverName) || ud.displayName || '';
      setW9({
        legalName: name, businessName: (ud.w9 && ud.w9.businessName) || (c && c.name) || '',
        ein: (ud.w9 && ud.w9.ein) || (c && c.ein) || '', address: (ud.w9 && ud.w9.address) || '',
        city: (ud.w9 && ud.w9.city) || '', state: (ud.w9 && ud.w9.state) || '', zip: (ud.w9 && ud.w9.zip) || '',
        classification: (ud.w9 && ud.w9.classification) || 'Single-Member LLC',
      });
      setSigA(name); setSigP(name);
      if (ACTIVE_ORG) { try {
        const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG));
        if (o.exists()) {
          if (o.data().name) setCompany(o.data().name);
          setOrgTpl({ agreementText: o.data().agreementText || '', lpoaText: o.data().lpoaText || '' });
        }
      } catch (_) {} }
    } catch (e) { console.error('agreements load failed', e); } finally { setLoading(false); }
  })(); }, [targetUid]);

  const feePct = feePctOf(carrier && carrier.feePct);
  const mc = (carrier && carrier.mcNumber) || '—';
  const legal = w9.legalName || (carrier && carrier.driverName) || 'Carrier';
  const biz = w9.businessName || (carrier && carrier.name) || legal;
  const fmt = (ms) => ms ? new Date(ms).toLocaleString() : '';

  // Workspace override (Settings → Carrier agreements) or built-in default,
  // with this carrier's details filled in.
  const tokenVals = { company, carrier: biz, mc, fee: feePct };
  const agreementBody = fillAgreementTokens((orgTpl.agreementText || '').trim() || DEFAULT_AGREEMENT_TEXT, tokenVals);
  const lpoaBody = fillAgreementTokens((orgTpl.lpoaText || '').trim() || DEFAULT_LPOA_TEXT, tokenVals);

  const saveW9 = async () => {
    try { await setDoc(doc(db, 'users', targetUid), { w9: { ...w9, updatedAt: serverTimestamp() } }, { merge: true }); setW9Msg('Saved ✓'); setTimeout(() => setW9Msg(''), 2000); }
    catch (e) { console.error('w9 save failed', e); setW9Msg('Could not save'); }
  };
  const signAgreement = async () => {
    if (!sigA.trim() || !agreeA) return;
    // textSnapshot preserves the exact wording signed — the template is
    // per-workspace editable, so the record must not depend on it.
    const rec = { signedName: sigA.trim(), feePct, company, signedAtMs: Date.now(), signedAt: serverTimestamp(), textSnapshot: agreementBody };
    try {
      // Append-only legal record first (rules forbid editing/deleting it),
      // then the mutable pointer used for badges + display.
      await addDoc(collection(db, 'signed_agreements'), stampOrg({ ...rec, uid: targetUid, type: 'dispatchAgreement' }));
      await setDoc(doc(db, 'users', targetUid), { dispatchAgreement: rec, resignRequest: { dispatchAgreement: false } }, { merge: true });
      setAgreement(rec); setResign((r) => ({ ...r, dispatchAgreement: false }));
      setHistory((h) => [{ ...rec, uid: targetUid, type: 'dispatchAgreement' }, ...h]);
    }
    catch (e) { console.error('agreement sign failed', e); toast('Could not record signature.', 'error'); }
  };
  const signLpoa = async () => {
    if (!sigP.trim() || !agreeP) return;
    const rec = { signedName: sigP.trim(), company, signedAtMs: Date.now(), signedAt: serverTimestamp(), textSnapshot: lpoaBody };
    try {
      await addDoc(collection(db, 'signed_agreements'), stampOrg({ ...rec, uid: targetUid, type: 'lpoa' }));
      await setDoc(doc(db, 'users', targetUid), { lpoa: rec, resignRequest: { lpoa: false } }, { merge: true });
      setLpoa(rec); setResign((r) => ({ ...r, lpoa: false }));
      setHistory((h) => [{ ...rec, uid: targetUid, type: 'lpoa' }, ...h]);
    }
    catch (e) { console.error('lpoa sign failed', e); toast('Could not record signature.', 'error'); }
  };

  // Dispatcher (view-as): terms changed after this carrier signed — ask them
  // to re-sign the CURRENT template. The old signed record stays in history.
  const requestResign = async (key) => {
    try {
      await setDoc(doc(db, 'users', targetUid), { resignRequest: { [key]: true } }, { merge: true });
      setResign((r) => ({ ...r, [key]: true }));
    } catch (e) { console.error('resign request failed', e); alert('Could not request re-signature.'); }
  };

  const SignHistory = ({ type }) => {
    const rows = history.filter((h) => h.type === type);
    if (rows.length < 2) return null;
    return (
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Signature history ({rows.length})</summary>
        <div className="mt-2 space-y-1">
          {rows.map((h, i) => (
            <div key={h.id || i} className="text-xs text-slate-400">
              ✍️ {h.signedName} — {h.signedAtMs ? new Date(h.signedAtMs).toLocaleString() : ''}{h.feePct ? ` · ${h.feePct}%` : ''}{i === 0 ? ' (current)' : ''}
            </div>
          ))}
        </div>
      </details>
    );
  };

  const field = INPUT_CLS;
  if (loading) return <div className="max-w-3xl mx-auto text-slate-400">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Agreements &amp; W-9</h2>
        {isAdmin && <Badge tone="amber" className="font-bold tracking-wide">CARRIER VIEW</Badge>}
      </div>
      <p className="text-slate-400">Complete this once. Your W-9 details fill the Dispatch Agreement and Power of Attorney automatically — no re-typing.</p>
      <GuidedHint>The carrier completes their W-9, then e-signs the Dispatch Agreement and a Limited Power of Attorney (so you can sign rate confirmations on their behalf). Everything’s captured one time and reused.</GuidedHint>

      {/* W-9 */}
      <Card className="p-6">
        <PanelHeader icon={<FileText size={18} />} title="W-9 Information" />
        <p className="text-sm text-slate-400 mt-1 mb-4">Used for tax reporting and to pre-fill your agreements. Stored privately on your account.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Legal name (as on tax return)"><input className={field} value={w9.legalName} onChange={set('legalName')} disabled={!canSign} /></Field>
          <Field label="Business name (if different)"><input className={field} value={w9.businessName} onChange={set('businessName')} disabled={!canSign} /></Field>
          <Field label="EIN / Tax ID"><input className={field} value={w9.ein} onChange={set('ein')} placeholder="12-3456789" disabled={!canSign} /></Field>
          <Field label="Federal tax classification">
            <select className={SELECT_CLS} value={w9.classification} onChange={set('classification')} disabled={!canSign}>
              {W9_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Street address" className="sm:col-span-2"><input className={field} value={w9.address} onChange={set('address')} disabled={!canSign} /></Field>
          <Field label="City"><input className={field} value={w9.city} onChange={set('city')} disabled={!canSign} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="State"><input className={field} value={w9.state} onChange={set('state')} disabled={!canSign} /></Field>
            <Field label="ZIP"><input className={field} value={w9.zip} onChange={set('zip')} disabled={!canSign} /></Field>
          </div>
        </div>
        {canSign && (
          <div className="flex items-center gap-3 mt-4">
            <PrimaryButton onClick={saveW9} className="px-5">Save W-9</PrimaryButton>
            {w9Msg && <span className="text-xs text-emerald-400">{w9Msg}</span>}
          </div>
        )}
      </Card>

      {/* Dispatch Agreement */}
      <Card className="p-6">
        <PanelHeader icon={<FileText size={18} />} title="Dispatch Service Agreement"
          badge={(orgTpl.agreementText || '').trim() ? <Badge tone="blue" className="text-[10px]">Custom terms</Badge> : null} />
        {/* re-sign pending → show the NEW terms to sign; otherwise a signed doc shows its immutable snapshot */}
        <AgreementText text={agreement && agreement.textSnapshot && !resign.dispatchAgreement ? agreement.textSnapshot : agreementBody} />
        {agreement && resign.dispatchAgreement && (
          <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-300">
            📝 Your dispatcher updated the terms — review the agreement above and sign again. Your previous signature ({agreement.signedName}, {fmt(agreement.signedAtMs)}) stays on record.
          </div>
        )}
        {agreement && !resign.dispatchAgreement ? <ESigned rec={agreement} />
          : canSign ? <ESignBox value={sigA} onChange={setSigA} agree={agreeA} onAgree={setAgreeA} onSign={signAgreement} label="I have read and agree to this Dispatch Service Agreement, and I’m signing it electronically." />
          : !agreement ? <p className="mt-4 text-sm text-amber-400">Not signed yet.</p>
          : <p className="mt-4 text-sm text-amber-400">Awaiting re-signature.</p>}
        {isAdmin && agreement && !resign.dispatchAgreement && (
          <button type="button" onClick={() => requestResign('dispatchAgreement')}
            className="mt-3 text-xs text-amber-400 hover:text-amber-300 underline">
            Terms changed? Request re-signature (keeps the old record)
          </button>
        )}
        <SignHistory type="dispatchAgreement" />
      </Card>

      {/* LPOA */}
      <Card className="p-6">
        <PanelHeader icon={<FileText size={18} />} title="Limited Power of Attorney"
          badge={(orgTpl.lpoaText || '').trim() ? <Badge tone="blue" className="text-[10px]">Custom terms</Badge> : null} />
        <AgreementText text={lpoa && lpoa.textSnapshot && !resign.lpoa ? lpoa.textSnapshot : lpoaBody} />
        {lpoa && resign.lpoa && (
          <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-amber-300">
            📝 Your dispatcher updated the terms — review the document above and sign again. Your previous signature ({lpoa.signedName}, {fmt(lpoa.signedAtMs)}) stays on record.
          </div>
        )}
        {(!lpoa || resign.lpoa) && canSign && (
          <p className="mt-3 text-xs text-slate-400 rounded-md bg-slate-800/50 border border-slate-700 px-3 py-2">
            💡 In plain terms: this only lets your dispatcher sign <strong className="text-slate-200">rate confirmations</strong> and broker load paperwork for you. It does <strong className="text-slate-200">not</strong> touch your bank account or money, and you can revoke it in writing anytime.
          </p>
        )}
        {lpoa && !resign.lpoa ? <ESigned rec={lpoa} />
          : canSign ? <ESignBox value={sigP} onChange={setSigP} agree={agreeP} onAgree={setAgreeP} onSign={signLpoa} label="I grant this Limited Power of Attorney and I’m signing it electronically." />
          : !lpoa ? <p className="mt-4 text-sm text-amber-400">Not signed yet.</p>
          : <p className="mt-4 text-sm text-amber-400">Awaiting re-signature.</p>}
        {isAdmin && lpoa && !resign.lpoa && (
          <button type="button" onClick={() => requestResign('lpoa')}
            className="mt-3 text-xs text-amber-400 hover:text-amber-300 underline">
            Terms changed? Request re-signature (keeps the old record)
          </button>
        )}
        <SignHistory type="lpoa" />
      </Card>
    </div>
  );
}

function UpgradesView({ uid }) {
  const targetUid = uid || auth.currentUser?.uid;
  const [profile, setProfile] = useState(null);
  const [creds, setCreds] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // credential key
  const [tsa, setTsa] = useState({ loading: false, err: '', list: null });
  const [uploading, setUploading] = useState({});
  const [uploadErr, setUploadErr] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', targetUid));
        const d = snap.exists() ? snap.data() : {};
        setProfile(d.carrierProfile || {});
        setCreds(d.credentials || {});
      } catch (e) { console.error('Upgrades load failed:', e); }
      finally { setLoading(false); }
    })();
  }, []);

  const endorsements = (profile && profile.endorsements) || [];
  const hasCred = (key) => (key === 'SCAC' ? !!(profile && profile.scac) : endorsements.includes(key)) || !!creds[key];

  const findTSA = async () => {
    setTsa({ loading: true, err: '', list: null });
    try {
      const pos = await getPosition();
      const results = await placesNear('TSA TWIC enrollment center', pos.latitude, pos.longitude, 80000);
      setTsa({ loading: false, err: '', list: results.slice(0, 5) });
    } catch (e) {
      setTsa({ loading: false, err: e.message || 'Could not find centers (enable the Places API + allow location).', list: null });
    }
  };

  const uploadCred = (key) => async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploadErr((u) => ({ ...u, [key]: '' }));
    setUploading((u) => ({ ...u, [key]: true }));
    try {
      const path = `credentials/${targetUid}/${key}_${Date.now()}_${file.name}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const rec = { name: file.name, url };
      await setDoc(doc(db, 'users', targetUid), { credentials: { [key]: rec } }, { merge: true });
      setCreds((c) => ({ ...c, [key]: rec }));
    } catch (err) {
      setUploadErr((u) => ({ ...u, [key]: err.code === 'storage/unauthorized' ? 'Enable Firebase Storage + rules to upload.' : (err.message || 'Upload failed') }));
    } finally {
      setUploading((u) => ({ ...u, [key]: false }));
    }
  };

  const copyDetails = () => {
    const p = profile || {};
    const txt = `Company: ${p.companyName || ''}\nMC: ${p.mcNumber || ''}\nUSDOT: ${p.dotNumber || ''}`;
    try { navigator.clipboard.writeText(txt); alert('Copied your company details to the clipboard.'); } catch (_) {}
  };

  if (loading) return <div className="max-w-4xl mx-auto text-slate-400">Loading upgrades…</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Business Upgrades &amp; Credentials</h2>
        <p className="text-slate-400">Unlock better fuel discounts and specialized, higher-paying freight.</p>
        <GuidedHint>Guide carriers into higher-paying niches — fuel cards, TWIC/Hazmat/Tanker endorsements, a SCAC. Tap any credential for a step-by-step how-to.</GuidedHint>
      </div>

      {/* B1 — Fuel Card Fast-Track */}
      <div className="bg-gradient-to-r from-amber-500/10 to-slate-900 border border-amber-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2"><CreditCard className="text-amber-400" size={20} /><h3 className="text-lg font-bold">Fuel Card Fast-Track</h3></div>
        <p className="text-sm text-slate-300 mb-4">No fuel card yet? A commercial card saves you cents-per-gallon on every fill. Apply with your saved details:</p>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          <div><span className="text-slate-500 text-xs">Company</span><div className="text-white font-semibold">{(profile && profile.companyName) || '—'}</div></div>
          <div><span className="text-slate-500 text-xs">MC</span><div className="text-white font-semibold">{(profile && profile.mcNumber) || '—'}</div></div>
          <div><span className="text-slate-500 text-xs">USDOT</span><div className="text-white font-semibold">{(profile && profile.dotNumber) || '—'}</div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="https://www.atob.com" target="_blank" rel="noopener noreferrer" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm">Apply with AtoB ↗</a>
          <a href="https://mudflapinc.com" target="_blank" rel="noopener noreferrer" className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-lg text-sm">Apply with Mudflap ↗</a>
          <button onClick={copyDetails} className="text-slate-300 hover:text-white px-3 py-2 text-sm">Copy my details</button>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Tip: keep your EIN handy — providers ask for it on the application.</p>
      </div>

      {/* B2 — Credential Checklist */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-1">Credential Checklist</h3>
        <p className="text-sm text-slate-400 mb-4">Green = on file. Tap a missing one for a quick how-to guide.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CREDENTIALS.map((c) => {
            const have = hasCred(c.key);
            return (
              <button key={c.key} onClick={() => { setModal(c.key); setTsa({ loading: false, err: '', list: null }); }}
                className={`rounded-xl border p-4 text-left transition-colors ${have ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-slate-800/50 border-slate-700 hover:border-amber-500/40'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-sm">{c.label}</span>
                  {have ? <CheckCircle2 size={16} className="text-emerald-400" /> : <span className="text-[10px] text-amber-400">Get it →</span>}
                </div>
                <div className={`text-[11px] mt-1 ${have ? 'text-emerald-400' : 'text-slate-500'}`}>{have ? 'On file' : 'Not yet'}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* B3 — Credential Document Uploads */}
      <Card className="p-6">
        <h3 className="text-lg font-bold mb-1">Upload Your Credential Docs</h3>
        <p className="text-sm text-slate-400 mb-4">Store photos of your cards so dispatch can bid on specialized loads immediately.</p>
        <div className="space-y-3">
          {CREDENTIALS.filter((c) => c.key !== 'SCAC').map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white flex items-center gap-2">{c.label}{creds[c.key] && <CheckCircle2 size={14} className="text-emerald-400" />}</div>
                {creds[c.key] && <div className="text-xs text-emerald-400 mt-0.5 truncate">✓ {creds[c.key].name}</div>}
                {uploadErr[c.key] && <div className="text-xs text-red-400 mt-0.5">{uploadErr[c.key]}</div>}
              </div>
              <label className="shrink-0 text-xs bg-slate-700 hover:bg-slate-600 text-slate-100 px-3 py-2 rounded-lg cursor-pointer">
                {uploading[c.key] ? 'Uploading…' : (creds[c.key] ? 'Replace' : 'Upload')}
                <input type="file" className="hidden" onChange={uploadCred(c.key)} disabled={uploading[c.key]} />
              </label>
            </div>
          ))}
        </div>
      </Card>

      {/* Credential how-to modal */}
      {modal && (() => {
        const c = CREDENTIALS.find((x) => x.key === modal);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
            <Card className="p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">How to get your {c.label}</h3>
                <button onClick={() => setModal(null)} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
              </div>
              <ol className="space-y-3">
                {c.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-300">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              {c.find && (
                <div className="mt-5">
                  <PrimaryButton onClick={findTSA} disabled={tsa.loading} className="w-full py-2.5">
                    {tsa.loading ? 'Finding…' : '📍 Find nearest TSA enrollment center'}
                  </PrimaryButton>
                  {tsa.err && <p className="text-xs text-red-400 mt-2">{tsa.err}</p>}
                  {tsa.list && tsa.list.length === 0 && <p className="text-xs text-slate-400 mt-2">No centers found nearby.</p>}
                  {tsa.list && tsa.list.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {tsa.list.map((r, i) => (
                        <a key={i} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + (r.formatted_address || ''))}`} target="_blank" rel="noopener noreferrer"
                          className="block bg-slate-800/50 border border-slate-700 rounded-lg p-3 hover:border-amber-500/40">
                          <div className="text-sm font-semibold text-white">{r.name}</div>
                          <div className="text-xs text-slate-400">{r.formatted_address}</div>
                          <div className="text-[11px] text-amber-400 mt-1">Get directions ↗</div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

// ---------- ADMIN: EXPENSE TRACKER ----------
const EXPENSE_CATEGORIES = ['Fuel', 'Tolls', 'Maintenance', 'Insurance', 'Subscriptions', 'Software', 'Office', 'Other'];

function ExpensesView() {
  const [expenses, setExpenses] = useState([]);
  const [feesThisMonth, setFeesThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgInfo, setOrgInfo] = useState({ name: '' });
  const today = new Date().toISOString().slice(0, 10);
  const blank = { category: 'Fuel', amount: '', date: today, note: '' };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

  useEffect(() => { (async () => {
    if (!ACTIVE_ORG) return;
    try { const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (o.exists()) setOrgInfo({ name: o.data().name || '' }); } catch (_) {}
  })(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Carriers alongside loads (one extra org-scoped read) so a load
      // booked without its own feePct still resolves to the carrier's
      // actual fee instead of the 10% default — matches Invoices' fallback.
      const [eSnap, lSnap, cSnap] = await Promise.all([
        getDocs(orgScoped('expenses')),
        getDocs(orgScoped('loads')),
        getDocs(orgScoped('carriers')),
      ]);
      const rows = eSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setExpenses(rows);
      const carrierByUid = {};
      cSnap.docs.forEach((d) => { const c = d.data(); if (c.linkedDriverUid) carrierByUid[c.linkedDriverUid] = c; });
      const som = startOfMonth();
      let fees = 0;
      lSnap.docs.forEach((d) => {
        const l = d.data();
        const delivered = l.status === 'Delivered' || l.status === 'Cleared';
        const inMonth = l.delivery_date && new Date(l.delivery_date + 'T00:00:00') >= som;
        if (delivered && inMonth) fees += (Number(l.gross_pay) || 0) * (loadFeePctOf(l, carrierByUid[l.uid]) / 100);
      });
      setFeesThisMonth(fees);
    } catch (e) { console.error('Error loading expenses:', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.date) return;
    setSaving(true);
    try {
      const payload = { category: form.category, amount: Number(form.amount) || 0, date: form.date, note: form.note.trim(), createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, 'expenses'), stampOrg(payload));
      setExpenses((p) => [{ id: ref.id, ...payload }, ...p]);
      setForm({ ...blank, date: form.date });
      setShowForm(false);
      fetchAll();
    } catch (err) { console.error('Error adding expense:', err); alert('Could not save — check the console.'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await deleteDoc(doc(db, 'expenses', id)); setExpenses((p) => p.filter((x) => x.id !== id)); fetchAll(); }
    catch (e) { console.error('Error deleting expense:', e); }
  };

  const som = startOfMonth();
  const monthExpenses = expenses.filter((x) => x.date && new Date(x.date + 'T00:00:00') >= som);
  const totalMonth = monthExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const byCat = {};
  monthExpenses.forEach((x) => { byCat[x.category] = (byCat[x.category] || 0) + (Number(x.amount) || 0); });
  const profit = feesThisMonth - totalMonth;

  const exportCsv = () => {
    const header = 'Date,Category,Amount,Note\n';
    const rows = expenses.map((x) => `${x.date || ''},${x.category || ''},${Number(x.amount) || 0},"${(x.note || '').replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slugifyOrgName(orgInfo.name)}-expenses.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const field = INPUT_CLS;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Expenses</h2>
          <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
        </div>
        <div className="flex gap-2">
          <GhostButton onClick={exportCsv} className="text-sm border border-slate-700 px-3 py-2">Export CSV</GhostButton>
          <PrimaryButton onClick={() => setShowForm((s) => !s)} className="text-sm"><Plus size={18} /> Add</PrimaryButton>
        </div>
      </div>
      <p className="text-slate-400 text-sm">Track your business costs. Bank-feed auto-import (Plaid) comes in the backend phase — for now, log them here and export to QuickBooks.</p>
      <GuidedHint>Your monthly profit = dispatch fees earned − these expenses. Log every business cost (fuel card, software, insurance) so your net is real, and export to CSV at tax time.</GuidedHint>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatTile label="Dispatch Fees (this month)" value={money(feesThisMonth)} accent="emerald" className="p-5" />
        <StatTile label="Expenses (this month)" value={money(totalMonth)} accent="amber" className="p-5" />
        <StatTile label="Net Profit (this month)" value={money(profit)} accent={profit >= 0 ? 'emerald' : 'red'} className="p-5 col-span-2 sm:col-span-1" />
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={add} className="space-y-4">
          <h3 className="font-bold">New Expense</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Field label="Category"><select className={field} value={form.category} onChange={set('category')}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Amount ($)"><input className={field} type="number" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" /></Field>
            <Field label="Date"><input className={field} type="date" value={form.date} onChange={set('date')} /></Field>
            <Field label="Note"><input className={field} value={form.note} onChange={set('note')} placeholder="optional" /></Field>
          </div>
          <div className="flex items-center gap-3">
            <PrimaryButton type="submit" disabled={saving} className="px-5 py-2.5">{saving ? 'Saving…' : 'Add Expense'}</PrimaryButton>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
          </div>
          </form>
        </Card>
      )}

      {Object.keys(byCat).length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold mb-3">This Month by Category</h3>
          <div className="space-y-2">
            {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{cat}</span>
                <span className="font-semibold text-white">{money(amt)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="font-bold mb-4">All Expenses</h3>
        {loading ? <SkelRows rows={3} />
          : expenses.length === 0 ? <div className="text-slate-500 text-sm">No expenses logged yet.</div>
          : (
            <div className="space-y-2">
              {expenses.map((x) => (
                <div key={x.id} className="flex items-center justify-between gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{money(x.amount)} <span className="text-slate-500 font-normal">· {x.category}</span></div>
                    <div className="text-xs text-slate-400">{x.date}{x.note ? ` · ${x.note}` : ''}</div>
                  </div>
                  <button onClick={() => remove(x.id)} className="text-slate-500 hover:text-red-400 text-sm shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  );
}

// ---------- ADMIN: BROKER CHECK (vetting + anti-fraud, storage-free) ----------
function BrokerCheckView() {
  const [b, setB] = useState({ name: '', mc: '' });
  const set = (k) => (e) => setB((s) => ({ ...s, [k]: e.target.value }));
  const [checks, setChecks] = useState({});
  const [flags, setFlags] = useState({});
  const [saved, setSaved] = useState([]);
  const [saveMsg, setSaveMsg] = useState('');
  const [savingChk, setSavingChk] = useState(false);
  const chkMs = (t) => { try { return t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds * 1000 : 0); } catch (_) { return 0; } };
  const fmtChkDate = (t) => { try { const d = t?.toDate ? t.toDate() : null; return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'just now'; } catch (_) { return '—'; } };
  const loadSaved = async () => {
    try { const snap = await getDocs(orgScoped('broker_checks')); setSaved(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, c) => chkMs(c.createdAt) - chkMs(a.createdAt)).slice(0, 10)); }
    catch (e) { console.error('broker_checks load failed', e); }
  };
  useEffect(() => { loadSaved(); }, []);

  const CHECKS = [
    ['authority', 'Operating authority is ACTIVE on FMCSA SAFER'],
    ['bond', '$75k broker bond active & not pending suspension (FMCSA L&I)'],
    ['factorable', 'Broker MC approved by your factoring company'],
    ['notSuspended', 'Not on the FMCSA suspended-broker list'],
    ['insurance', 'Carrier carries ≥ $1M liability (2026 broker minimum)'],
    ['contact', 'Contact verified via SAFER + independent callback to the registered number'],
  ];
  const RED_FLAGS = [
    ['urgency', 'Unusual urgency — "cover it right now," pressure to skip steps'],
    ['tooGood', 'Rate is suspiciously high for the lane (bait to bypass vetting)'],
    ['equipSwap', 'Last-minute equipment or pickup-location change'],
    ['genericEmail', 'Generic email domain (gmail/yahoo) instead of a corporate address'],
    ['noTracking', 'Refuses tracking app / live location'],
    ['mismatch', 'Phone/email don’t match the SAFER-registered company'],
  ];

  const allClear = CHECKS.every(([k]) => checks[k]);
  const flagCount = RED_FLAGS.filter(([k]) => flags[k]).length;
  let verdict;
  if (flagCount >= 2) verdict = { tone: 'red', label: '🔴 HIGH RISK — do not book', sub: 'Multiple double-brokering / fraud red flags. Verify independently or walk away.' };
  else if (!allClear || flagCount === 1) verdict = { tone: 'amber', label: '🟡 Caution — finish vetting', sub: 'Complete every check and clear all red flags before you tender this load.' };
  else verdict = { tone: 'emerald', label: '🟢 Cleared to book', sub: 'All checks pass and no red flags. Keep the proof package for this load.' };
  const verdictCls = { red: 'bg-red-500/15 border-red-500/40 text-red-300', amber: 'bg-warn-500/15 border-warn-500/40 text-warn-300', emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' }[verdict.tone];

  const reset = () => { setB({ name: '', mc: '' }); setChecks({}); setFlags({}); setSaveMsg(''); };
  const save = async () => {
    if (!b.name.trim() && !b.mc.trim()) { setSaveMsg('Enter the broker name or MC first.'); return; }
    setSavingChk(true); setSaveMsg('');
    try {
      await addDoc(collection(db, 'broker_checks'), stampOrg({
        brokerName: b.name.trim(), brokerMc: b.mc.trim(),
        verdict: verdict.label, verdictTone: verdict.tone,
        checksPassed: CHECKS.filter(([k]) => checks[k]).length, checksTotal: CHECKS.length,
        flagCount, checks, flags,
        savedBy: auth.currentUser ? auth.currentUser.uid : null,
        createdAt: serverTimestamp(),
      }));
      setSaveMsg('Saved to your vetting record ✓');
      loadSaved();
    } catch (e) { console.error('save broker check failed', e); setSaveMsg('Could not save — check the console (is the broker_checks rule published?).'); }
    finally { setSavingChk(false); }
  };
  const saferUrl = 'https://safer.fmcsa.dot.gov/CompanySnapshot.aspx';
  const liUrl = 'https://li-public.fmcsa.dot.gov/LIVIEW/pkg_menu.prc_menu';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Broker Check</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Vet a broker before you book. In 2026, booking with a suspended or fraudulent broker means your carrier doesn't get paid — and negligent-hiring liability is real. Run this every time.</p>

      <GuidedHint>The 2026 Supreme Court ruling (<strong>Montgomery v. Caribe</strong>) and the FMCSA's $75k bond rule make broker vetting non-optional. Booking with a suspended or double-brokering middleman can leave your carrier unpaid and you exposed. Two or more red flags below = walk away.</GuidedHint>

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Broker / Company Name"><input className={INPUT_CLS} value={b.name} onChange={set('name')} placeholder="ACME Logistics LLC" /></Field>
          <Field label="Broker MC Number"><input className={INPUT_CLS} value={b.mc} onChange={set('mc')} placeholder="MC-123456" /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={saferUrl} target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg">Open FMCSA SAFER ↗</a>
          <a href={liUrl} target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg">Open FMCSA L&amp;I (bond/authority) ↗</a>
          <a href="https://www.fmcsa.dot.gov/registration" target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg">FMCSA Register ↗</a>
        </div>
      </Card>

      <div className={`rounded-2xl border p-5 ${verdictCls}`}>
        <div className="font-bold text-base">{verdict.label}</div>
        <div className="text-sm opacity-80 mt-1">{verdict.sub}</div>
      </div>

      <Card className="p-6">
        <PanelHeader icon={<ShieldCheck size={20} />} title="Vetting Checklist" badge={<Badge tone={allClear ? 'emerald' : 'slate'}>{CHECKS.filter(([k]) => checks[k]).length}/{CHECKS.length}</Badge>} />
        <div className="space-y-2 mt-4">
          {CHECKS.map(([k, label]) => (
            <label key={k} className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2.5">
              <input type="checkbox" checked={!!checks[k]} onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))} className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <PanelHeader icon={<Activity size={20} />} title="Double-Brokering Red Flags" accent="red" badge={<Badge tone={flagCount === 0 ? 'emerald' : flagCount === 1 ? 'amber' : 'red'}>{flagCount} flagged</Badge>} />
        <p className="text-xs text-slate-500 mt-2">Check anything you're seeing. Two or more is a strong signal to stop and verify independently.</p>
        <div className="space-y-2 mt-4">
          {RED_FLAGS.map(([k, label]) => (
            <label key={k} className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2.5">
              <input type="checkbox" checked={!!flags[k]} onChange={(e) => setFlags((c) => ({ ...c, [k]: e.target.checked }))} className="w-4 h-4 mt-0.5 rounded accent-red-500 shrink-0" />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <PrimaryButton onClick={save} disabled={savingChk} className="text-sm px-4 py-2">{savingChk ? 'Saving…' : 'Save this check'}</PrimaryButton>
          <GhostButton onClick={reset} className="text-sm">Reset for next broker</GhostButton>
          {saveMsg && <span className={`text-sm ${saveMsg.includes('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>{saveMsg}</span>}
        </div>
      </Card>

      {saved.length > 0 && (
        <Card className="p-6">
          <PanelHeader icon={<FileText size={20} />} title="Saved Checks" badge={<Badge tone="slate">{saved.length}</Badge>} />
          <p className="text-xs text-slate-500 mt-2">Your produceable vetting trail — one record per broker you've checked, with the verdict and date.</p>
          <div className="mt-4 space-y-2">
            {saved.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <span className="font-semibold text-white">{r.brokerName || '—'}</span>
                  {r.brokerMc && <span className="text-slate-500 ml-2">{r.brokerMc}</span>}
                  <span className="text-slate-500 ml-2">· {r.checksPassed}/{r.checksTotal} checks · {r.flagCount} flag{r.flagCount === 1 ? '' : 's'}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded ${({ red: 'bg-red-500/15 text-red-300', amber: 'bg-warn-500/15 text-warn-300', emerald: 'bg-emerald-500/15 text-emerald-300' })[r.verdictTone] || 'bg-slate-700 text-slate-300'}`}>{r.verdict}</span>
                  <span className="text-[11px] text-slate-500">{fmtChkDate(r.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-[11px] text-slate-600">Manual vetting for now. Live SAFER lookups, the public suspended-broker list, and automatic factorability checks arrive with the backend phase.</p>
    </div>
  );
}

// ---------- ADMIN: FIRST LOAD WALKTHROUGH (animated training, hosted page) ----------
// The animated scene-by-scene story of one load — find it, vet the broker,
// negotiate, RateCon, dispatch, deliver, invoice, get paid. The page itself is
// the self-contained dispatch-walkthrough.html on the marketing site (deploys
// with it); this tab frames it inside the portal.
const WALKTHROUGH_URL = 'https://forwardmotionfreight.com/dispatch-walkthrough.html';
function WalkthroughView() {
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">First Load Walkthrough</h2>
          <p className="text-slate-400 text-sm mt-1">One load, start to finish — negotiation, paperwork, dispatch, and how everyone gets paid. Step through it with the arrows.</p>
        </div>
        <a href={WALKTHROUGH_URL} target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg shrink-0">Open full screen ↗</a>
      </div>
      <Card className="p-0 overflow-hidden">
        <iframe
          src={WALKTHROUGH_URL}
          title="First Load Walkthrough"
          className="w-full block border-0"
          style={{ height: 'calc(100vh - 220px)', minHeight: 480 }}
        />
      </Card>
    </div>
  );
}

// ---------- BREAK ROOM: "NIGHT RUN" (local arcade game, v1 — no Firestore) ----------
// A phone-first canvas runner. Local-only by design: scores live in
// localStorage (`fm_nightrun_scores`), so v1 ships with zero new Firestore
// collections/rules. Everything below — persistence, theming, the loop — is
// self-contained in this one component so it drops into the single-file
// paste cleanly. Visible to every signed-in user, both roles.

const NIGHTRUN_SCORES_KEY = 'fm_nightrun_scores';
const NIGHTRUN_INITIALS_KEY = 'fm_nightrun_initials';
const NIGHTRUN_MAX_SCORES = 10;

function loadNightRunScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(uidKey(NIGHTRUN_SCORES_KEY)) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((r) => r && typeof r.score === 'number' && typeof r.initials === 'string').slice(0, NIGHTRUN_MAX_SCORES);
  } catch (_) { return []; }
}
// Inserts a score into the local top-10, sorted desc, and persists it.
// Returns { list, rank } — rank is 1-based, or null if it didn't place.
function saveNightRunScore(initials, score) {
  const list = loadNightRunScores();
  const entry = { initials: (initials || '---').toUpperCase().slice(0, 3), score: Math.max(0, Math.floor(score)), at: Date.now() };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, NIGHTRUN_MAX_SCORES);
  try { localStorage.setItem(uidKey(NIGHTRUN_SCORES_KEY), JSON.stringify(trimmed)); } catch (_) {}
  const idx = trimmed.findIndex((r) => r.at === entry.at);
  return { list: trimmed, rank: idx === -1 ? null : idx + 1 };
}

// Pull the live theme tokens straight off :root so the canvas always matches
// Night Haul / Classic without hardcoding either palette. Read once at game
// start and again on every `fm-themechange` (see NightRunGame).
function readNightRunColors() {
  const toRgb = (name, fallback) => {
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const parts = raw.split(/\s+/).filter(Boolean);
      return parts.length === 3 ? `rgb(${parts.join(',')})` : fallback;
    } catch (_) { return fallback; }
  };
  return {
    gold: toRgb('--tw-amber-500', '#f59e0b'),
    goldBright: toRgb('--tw-amber-400', '#fbbf24'),
    goldSoft: toRgb('--tw-amber-300', '#fcd34d'),
    ink: toRgb('--tw-white', '#f8fafc'),
    road: toRgb('--tw-s1', '#0f172a'),
    roadDeep: toRgb('--tw-s0', '#020617'),
    shoulder: toRgb('--tw-s2', '#1e293b'),
    dash: toRgb('--tw-slate-500', '#64748b'),
    hazard: toRgb('--tw-warn-500', '#f59e0b'),
    hazardDim: toRgb('--tw-warn-600', '#d97706'),
    danger: toRgb('--tw-red-500', '#ef4444'),
    fuel: toRgb('--tw-emerald-500', '#10b981'),
    fuelDim: toRgb('--tw-emerald-700', '#047857'),
  };
}

// Tuning — kept together so difficulty is easy to eyeball/adjust.
const NR_LANES = 3;
const NR_MARGIN = 0.11;      // shoulder width, fraction of canvas width per side
const NR_BASE_SPEED = 210;   // px/sec at game start
const NR_MAX_SPEED = 620;    // px/sec speed cap
const NR_RAMP = 5.2;         // px/sec gained per second elapsed
const NR_SCORE_PER_PX = 0.075;
const NR_FUEL_BONUS = 250;
const NR_LANE_LERP = 11;     // higher = snappier lane changes
const NR_SWIPE_PX = 26;
const NR_CRASH_SEC = 0.5;
const NR_DASH_PERIOD = 46;

// The playfield's max width in px — width-capped (420, or 560 for `big` on
// md+) AND height-capped on md+ so the 3:4 board always fits a short desktop
// viewport. Shared by the lazy initial state and the resize listener.
function nrBoardCap(big) {
  try {
    const md = window.matchMedia('(min-width: 768px)').matches;
    const capW = big && md ? 560 : 420;
    if (!md) return capW; // phones: width-only cap, unchanged behavior
    return Math.max(280, Math.min(capW, Math.floor((window.innerHeight - 250) * 0.75)));
  } catch (_) { return big ? 560 : 420; }
}

// `big` (Break Room dedicated view): lets the playfield grow on md+ screens
// only — below md the cap is the same 420px as always, so phones render
// pixel-identical either way. The ResizeObserver handles the rest.
function NightRunGame({ big = false }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  // React state — only what the overlay UI needs to re-render on. Everything
  // the 60fps loop touches lives in refs below so gameplay never triggers a
  // React re-render mid-frame.
  const [gameState, setGameState] = useState('idle'); // idle | playing | paused | gameover
  const [displayScore, setDisplayScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [best, setBest] = useState(0);
  const [scores, setScores] = useState(() => loadNightRunScores());
  const [initials, setInitials] = useState(() => {
    try { return (localStorage.getItem(uidKey(NIGHTRUN_INITIALS_KEY)) || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); }
    catch (_) { return ''; }
  });
  const [justRank, setJustRank] = useState(null);
  const [qualifies, setQualifies] = useState(false); // does this run's score even crack the local top 10?
  const [skipped, setSkipped] = useState(false);      // player chose not to save a qualifying score

  // ---- simulation state (refs — no re-render on write) ----
  const sizeRef = useRef({ w: 360, h: 480 });
  const colorsRef = useRef(readNightRunColors());
  const laneRef = useRef(1);
  const playerXRef = useRef(0);
  const playerYRef = useRef(0);
  const elapsedRef = useRef(0);
  const speedRef = useRef(NR_BASE_SPEED);
  const offsetRef = useRef(0);
  const scoreRef = useRef(0);
  const spawnTimerRef = useRef(0.6);
  const obstaclesRef = useRef([]); // {lane, x, y, w, h, kind, closing}
  const popRef = useRef([]);       // brief fuel-pickup flashes {x,y,t}
  const phaseRef = useRef('running'); // running | crashing | done
  const shakeRef = useRef(0);
  const lastTsRef = useRef(null);
  const scoreTickRef = useRef(0);
  const pointerRef = useRef(null); // {x,y} on pointerdown, for tap vs swipe

  useEffect(() => { setBest(scores.length ? scores[0].score : 0); }, [scores]);

  // Height-aware playfield cap (md+ only): the 3:4 board plus ~250px of page
  // chrome (top bar, back link + title, caption) must fit the viewport, so on
  // a short laptop (768px tall) the board shrinks to fit instead of pushing
  // the controls/caption off-screen. width = (viewportHeight − 250) × 3/4,
  // clamped to the original 420/560 caps and a 280px floor. Below md nothing
  // changes — phones keep the width-only cap they've always had (that
  // behavior was fine). The canvas ResizeObserver below picks up the new
  // wrapper size automatically, and the lazy initializer means the first
  // paint is already the right size (no resize flash).
  const [boardMax, setBoardMax] = useState(() => nrBoardCap(big));
  useEffect(() => {
    const calc = () => setBoardMax(nrBoardCap(big));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [big]);

  // Responsive backing store: crisp on retina, resizes with the Card.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const doResize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = Math.max(240, Math.round(rect.width));
      const h = Math.max(320, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
      playerYRef.current = h * 0.80;
      if (!playerXRef.current) playerXRef.current = laneCenterX(laneRef.current, w);
    };
    doResize();
    const ro = new ResizeObserver(doResize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Theme sync — re-read tokens on every skin flip so an in-progress run
  // never looks stale after switching Night Haul <-> Classic.
  useEffect(() => {
    const onTheme = () => { colorsRef.current = readNightRunColors(); };
    window.addEventListener('fm-themechange', onTheme);
    return () => window.removeEventListener('fm-themechange', onTheme);
  }, []);

  // Auto-pause when the tab/page is hidden — always listening while mounted,
  // independent of gameState, so it can't be missed mid-run.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setGameState((s) => (s === 'playing' ? 'paused' : s));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const laneCenterX = (lane, w) => {
    const margin = w * NR_MARGIN;
    const roadW = w - margin * 2;
    const laneW = roadW / NR_LANES;
    return margin + laneW * (lane + 0.5);
  };

  const stepLane = (dir) => {
    if (phaseRef.current !== 'running') return;
    laneRef.current = Math.max(0, Math.min(NR_LANES - 1, laneRef.current + dir));
  };

  const togglePause = () => {
    setGameState((s) => (s === 'playing' ? 'paused' : s === 'paused' ? 'playing' : s));
  };

  const startGame = () => {
    obstaclesRef.current = [];
    popRef.current = [];
    laneRef.current = 1;
    playerXRef.current = laneCenterX(1, sizeRef.current.w);
    elapsedRef.current = 0;
    speedRef.current = NR_BASE_SPEED;
    offsetRef.current = 0;
    scoreRef.current = 0;
    spawnTimerRef.current = 0.6;
    phaseRef.current = 'running';
    shakeRef.current = 0;
    scoreTickRef.current = 0;
    setDisplayScore(0);
    setJustRank(null);
    setQualifies(false);
    setSkipped(false);
    // initials field intentionally NOT reset — it stays prefilled with the
    // last-used (or last-typed) value across runs in the same session.
    setGameState('playing');
  };

  const triggerCrash = () => {
    if (phaseRef.current !== 'running') return;
    phaseRef.current = 'crashing';
    shakeRef.current = NR_CRASH_SEC;
  };

  const finalizeGameOver = () => {
    const s = Math.floor(scoreRef.current);
    setFinalScore(s);
    // Only worth an initials prompt if it actually cracks the local top 10.
    const worst = scores.length >= NIGHTRUN_MAX_SCORES ? scores[NIGHTRUN_MAX_SCORES - 1].score : -1;
    setQualifies(s > 0 && (scores.length < NIGHTRUN_MAX_SCORES || s > worst));
    setGameState('gameover');
  };

  // ---- keyboard: only ever attached while a session is active (playing or
  // paused, i.e. never idle/gameover), so the command palette, Ctrl/Cmd+K,
  // and every form field elsewhere in the app are completely untouched. ----
  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'paused') return;
    const onKeyDown = (e) => {
      const ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return; // never steal focus from a real field
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); togglePause(); return; }
      if (gameState !== 'playing') return; // arrows only steer mid-run, not while paused
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); stepLane(-1); }
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); stepLane(1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState]);

  // ---- the 60fps loop: lives entirely inside one effect keyed off
  // gameState==='playing', so pausing, game-over, and unmount all clean it
  // up via the exact same return function — one guaranteed teardown path. ----
  useEffect(() => {
    if (gameState !== 'playing') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    lastTsRef.current = null;
    let raf = requestAnimationFrame(loop);
    function loop(ts) {
      raf = requestAnimationFrame(loop);
      if (lastTsRef.current == null) { lastTsRef.current = ts; return; } // first frame after start/resume: just timestamp
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      dt = Math.min(dt, 0.05); // clamp so a stalled tab never causes a giant leap
      step(dt);
      render(ctx);
    }
    return () => cancelAnimationFrame(raf);
  }, [gameState]);

  function spawnObstacle(speed) {
    const w = sizeRef.current.w;
    const margin = w * NR_MARGIN;
    const laneW = (w - margin * 2) / NR_LANES;
    // Avoid stacking a wall the player can't get through: skip this spawn if
    // two lanes already have something near the top of the screen.
    const crowded = obstaclesRef.current.filter((o) => o.y < 170).length;
    if (crowded >= 2) return;
    const busyLanes = new Set(obstaclesRef.current.filter((o) => o.y < 170).map((o) => o.lane));
    let lane = Math.floor(Math.random() * NR_LANES);
    for (let i = 0; i < NR_LANES && busyLanes.has(lane); i++) lane = (lane + 1) % NR_LANES;
    if (busyLanes.has(lane)) return;

    const roll = Math.random();
    const kind = roll < 0.22 ? 'fuel' : roll < 0.60 ? 'car' : 'truck';
    let cw, ch, closing;
    if (kind === 'fuel') { cw = laneW * 0.30; ch = cw * 1.35; closing = 1.05; }
    else if (kind === 'car') { cw = laneW * 0.52; ch = cw * 1.35; closing = 1.55; }
    else { cw = laneW * 0.66; ch = cw * 1.65; closing = 0.55; }

    obstaclesRef.current.push({ lane, x: laneCenterX(lane, w), y: -ch, w: cw, h: ch, kind, closing });
  }

  function nextSpawnGap(speed) {
    const t = Math.max(0, Math.min(1, (speed - NR_BASE_SPEED) / (NR_MAX_SPEED - NR_BASE_SPEED)));
    const base = 1.05 - t * 0.62; // tightens from ~1.05s to ~0.43s as speed ramps
    return base * (0.8 + Math.random() * 0.4);
  }

  function collides(o) {
    const w = sizeRef.current.w;
    const margin = w * NR_MARGIN;
    const laneW = (w - margin * 2) / NR_LANES;
    const pw = laneW * 0.50, ph = pw * 1.5;
    const dx = Math.abs(playerXRef.current - o.x);
    const dy = Math.abs(playerYRef.current - o.y);
    return dx < (pw + o.w) * 0.34 && dy < (ph + o.h) * 0.36;
  }

  function step(dt) {
    if (phaseRef.current === 'done') return;
    if (phaseRef.current === 'crashing') {
      shakeRef.current -= dt;
      if (shakeRef.current <= 0) { phaseRef.current = 'done'; finalizeGameOver(); }
      return; // freeze the world during the crash beat
    }

    elapsedRef.current += dt;
    const speed = Math.min(NR_MAX_SPEED, NR_BASE_SPEED + elapsedRef.current * NR_RAMP);
    speedRef.current = speed;
    offsetRef.current = (offsetRef.current + speed * dt) % NR_DASH_PERIOD;
    scoreRef.current += speed * dt * NR_SCORE_PER_PX;

    const targetX = laneCenterX(laneRef.current, sizeRef.current.w);
    playerXRef.current += (targetX - playerXRef.current) * Math.min(1, NR_LANE_LERP * dt);

    spawnTimerRef.current -= dt;
    if (spawnTimerRef.current <= 0) { spawnObstacle(speed); spawnTimerRef.current = nextSpawnGap(speed); }

    const H = sizeRef.current.h;
    const keep = [];
    for (const o of obstaclesRef.current) {
      o.y += speed * o.closing * dt;
      if (o.y > H + 60) continue;
      if (collides(o)) {
        if (o.kind === 'fuel') {
          scoreRef.current += NR_FUEL_BONUS;
          popRef.current.push({ x: o.x, y: o.y, t: 0 });
          continue;
        }
        triggerCrash();
      }
      keep.push(o);
    }
    obstaclesRef.current = keep;
    popRef.current = popRef.current.map((p) => ({ ...p, t: p.t + dt })).filter((p) => p.t < 0.35);

    scoreTickRef.current += dt;
    if (scoreTickRef.current > 0.12) { scoreTickRef.current = 0; setDisplayScore(Math.floor(scoreRef.current)); }
  }

  function drawTruck(ctx, x, y, w, h, c, shakeX) {
    const bx = x + shakeX;
    ctx.save();
    ctx.translate(bx, y);
    // trailer
    ctx.fillStyle = c.ink;
    ctx.globalAlpha = 0.92;
    roundRectPath(ctx, -w / 2, -h / 2 + h * 0.16, w, h * 0.62, w * 0.10);
    ctx.fill();
    // cab
    const cabH = h * 0.30;
    ctx.fillStyle = c.gold;
    roundRectPath(ctx, -w / 2, -h / 2, w, cabH, w * 0.14);
    ctx.fill();
    // windshield
    ctx.fillStyle = c.roadDeep;
    ctx.globalAlpha = 0.85;
    roundRectPath(ctx, -w * 0.34, -h / 2 + cabH * 0.22, w * 0.68, cabH * 0.42, w * 0.06);
    ctx.fill();
    ctx.globalAlpha = 1;
    // headlight cones (gold, fading forward)
    const coneH = h * 0.9;
    for (const side of [-1, 1]) {
      const gx = side * w * 0.30;
      const grad = ctx.createLinearGradient(gx, -h / 2, gx + side * w * 0.55, -h / 2 - coneH);
      grad.addColorStop(0, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(gx - w * 0.05, -h / 2);
      ctx.lineTo(gx + w * 0.05, -h / 2);
      ctx.lineTo(gx + side * w * 0.42, -h / 2 - coneH);
      ctx.lineTo(gx + side * w * 0.14, -h / 2 - coneH);
      ctx.closePath();
      ctx.fill();
    }
    // headlight dots
    ctx.fillStyle = c.goldBright;
    ctx.beginPath(); ctx.arc(-w * 0.30, -h / 2 + 1, w * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.30, -h / 2 + 1, w * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawTraffic(ctx, o, c) {
    ctx.save();
    ctx.translate(o.x, o.y);
    const isTruck = o.kind === 'truck';
    ctx.fillStyle = isTruck ? c.dash : c.danger;
    ctx.globalAlpha = 0.9;
    roundRectPath(ctx, -o.w / 2, -o.h / 2, o.w, o.h, o.w * 0.16);
    ctx.fill();
    ctx.globalAlpha = 1;
    // taillights (facing the player = bottom edge)
    ctx.fillStyle = c.hazard;
    roundRectPath(ctx, -o.w * 0.36, o.h / 2 - o.h * 0.10, o.w * 0.22, o.h * 0.09, 2);
    ctx.fill();
    roundRectPath(ctx, o.w * 0.14, o.h / 2 - o.h * 0.10, o.w * 0.22, o.h * 0.09, 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFuel(ctx, o, c) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.shadowColor = c.fuel;
    ctx.shadowBlur = 10;
    ctx.fillStyle = c.fuel;
    roundRectPath(ctx, -o.w / 2, -o.h / 2, o.w, o.h * 0.82, o.w * 0.28);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = c.fuelDim;
    roundRectPath(ctx, -o.w * 0.22, -o.h / 2 - o.h * 0.14, o.w * 0.44, o.h * 0.16, 2);
    ctx.fill();
    ctx.restore();
  }

  function render(ctx) {
    const { w, h } = sizeRef.current;
    const c = colorsRef.current;
    const shakeAmt = phaseRef.current === 'crashing' ? (shakeRef.current / NR_CRASH_SEC) * 6 : 0;
    const shakeX = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;
    const shakeY = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // sky/shoulders
    ctx.fillStyle = c.roadDeep;
    ctx.fillRect(-shakeAmt, -shakeAmt, w + shakeAmt * 2, h + shakeAmt * 2);
    const margin = w * NR_MARGIN;
    ctx.fillStyle = c.shoulder;
    ctx.fillRect(0, 0, margin, h);
    ctx.fillRect(w - margin, 0, margin, h);
    // road
    ctx.fillStyle = c.road;
    ctx.fillRect(margin, 0, w - margin * 2, h);

    // lane dashes
    const roadW = w - margin * 2;
    const laneW = roadW / NR_LANES;
    ctx.strokeStyle = c.dash;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(2, laneW * 0.03);
    for (let l = 1; l < NR_LANES; l++) {
      const x = margin + laneW * l;
      ctx.beginPath();
      for (let y = -NR_DASH_PERIOD + (offsetRef.current % NR_DASH_PERIOD); y < h; y += NR_DASH_PERIOD) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + NR_DASH_PERIOD * 0.55);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // obstacles + pickups
    for (const o of obstaclesRef.current) {
      if (o.kind === 'fuel') drawFuel(ctx, o, c);
      else drawTraffic(ctx, o, c);
    }
    // fuel pickup flashes
    for (const p of popRef.current) {
      const a = 1 - p.t / 0.35;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a) * 0.6;
      ctx.strokeStyle = c.fuel;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10 + p.t * 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // player
    if (phaseRef.current !== 'done') {
      const laneW2 = (w - margin * 2) / NR_LANES;
      const pw = laneW2 * 0.56, ph = pw * 1.55;
      drawTruck(ctx, playerXRef.current, playerYRef.current, pw, ph, c, 0);
    }

    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Draw one static frame whenever we're not looping (idle/paused/gameover)
  // so the canvas never looks blank or frozen mid-motion.
  useEffect(() => {
    if (gameState === 'playing') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    render(canvas.getContext('2d'));
  }, [gameState, displayScore]);

  // ---- touch: tap left/right half, or swipe — both work, both guarded to
  // only act while a run is actually in progress. React's synthetic pointer
  // handlers are unmounted automatically with the canvas, no manual cleanup
  // needed. ----
  const onPointerDown = (e) => {
    pointerRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    if (gameState !== 'playing' || !pointerRef.current) { pointerRef.current = null; return; }
    const dx = e.clientX - pointerRef.current.x;
    pointerRef.current = null;
    if (Math.abs(dx) > NR_SWIPE_PX) { stepLane(dx > 0 ? 1 : -1); return; }
    const rect = canvasRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    stepLane(localX < rect.width / 2 ? -1 : 1);
  };

  const submitScore = (e) => {
    e.preventDefault();
    const chars = (initials || 'YOU').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'YOU';
    try { localStorage.setItem(uidKey(NIGHTRUN_INITIALS_KEY), chars); } catch (_) {}
    const { list, rank } = saveNightRunScore(chars, finalScore);
    setScores(list);
    setJustRank(rank);
  };

  const skipScore = () => setSkipped(true);

  const resetScores = () => {
    if (!window.confirm('Clear all Night Run high scores on this device?')) return;
    try { localStorage.removeItem(uidKey(NIGHTRUN_SCORES_KEY)); } catch (_) {}
    setScores([]);
  };

  const playAgain = () => startGame();

  return (
    <div className={`grid ${big ? 'md:grid-cols-[minmax(0,560px)_1fr]' : 'md:grid-cols-[minmax(0,420px)_1fr]'} gap-5 items-start`}>
      <div>
        <div
          ref={wrapRef}
          className="relative w-full mx-auto rounded-lg overflow-hidden border border-slate-700/70 bg-slate-950 select-none touch-none"
          style={{ aspectRatio: '3 / 4', maxWidth: boardMax + 'px' }}
        >
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            aria-label="Night Run game canvas"
            role="img"
          />

          {/* HUD */}
          {(gameState === 'playing' || gameState === 'paused') && (
            <div className="absolute top-0 inset-x-0 flex items-center justify-between px-3 py-2 pointer-events-none">
              <div className="font-data text-xs bg-black/40 backdrop-blur px-2 py-1 rounded text-amber-300 font-semibold tracking-wide">
                {displayScore.toLocaleString()}
              </div>
              <button
                onClick={togglePause}
                className="pointer-events-auto bg-black/40 backdrop-blur hover:bg-black/60 text-slate-200 rounded p-1.5 transition-colors"
                aria-label={gameState === 'paused' ? 'Resume' : 'Pause'}
                title={gameState === 'paused' ? 'Resume (Space)' : 'Pause (Space)'}
              >
                {gameState === 'paused' ? <Play size={14} /> : <Pause size={14} />}
              </button>
            </div>
          )}

          {/* Overlays */}
          {gameState === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 backdrop-blur-sm text-center px-6">
              <Gamepad2 size={30} className="text-amber-400" />
              <h3 className="text-lg font-bold text-white">Night Run</h3>
              <p className="text-xs text-slate-400 max-w-[240px]">Dodge traffic, grab fuel, don't jackknife. Arrows/A·D to steer, or tap/swipe on mobile.</p>
              <PrimaryButton onClick={startGame} className="mt-1">Start Run</PrimaryButton>
              {best > 0 && <p className="text-[11px] text-slate-500">Local best: <span className="text-amber-400 font-semibold">{best.toLocaleString()}</span></p>}
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 backdrop-blur-sm text-center px-6">
              <Pause size={26} className="text-amber-400" />
              <h3 className="text-base font-bold text-white">Paused</h3>
              <PrimaryButton onClick={togglePause}><Play size={14} /> Resume</PrimaryButton>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-slate-950/88 backdrop-blur-sm text-center px-6">
              <Badge tone="red" className="font-bold tracking-widest">RUN OVER</Badge>
              <div className="font-data text-2xl font-bold text-white">{finalScore.toLocaleString()}</div>
              {!qualifies ? (
                <>
                  <p className="text-xs text-slate-500">{finalScore > 0 ? "Didn't crack the local top 10 this time." : 'No score this run.'}</p>
                  <GhostButton onClick={playAgain} className="mt-1"><RotateCcw size={14} /> Run Again</GhostButton>
                </>
              ) : skipped ? (
                <>
                  <p className="text-xs text-slate-500">Score not saved.</p>
                  <GhostButton onClick={playAgain} className="mt-1"><RotateCcw size={14} /> Run Again</GhostButton>
                </>
              ) : justRank === null ? (
                <form onSubmit={submitScore} className="flex flex-col items-center gap-2 mt-1">
                  <p className="text-[11px] text-amber-400 font-semibold">Top 10 on this device — nice run.</p>
                  <label className="text-[11px] text-slate-400">Enter your initials</label>
                  <input
                    autoFocus
                    value={initials}
                    onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g, '').slice(0, 3))}
                    maxLength={3}
                    placeholder="YOU"
                    className={`${INPUT_CLS} w-24 text-center text-lg font-data font-bold tracking-[0.3em] uppercase py-2`}
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <PrimaryButton type="submit">Save Score</PrimaryButton>
                    <GhostButton type="button" onClick={skipScore}>Skip</GhostButton>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-xs text-emerald-400 font-semibold">
                    {justRank <= NIGHTRUN_MAX_SCORES ? `Saved — #${justRank} on this device` : 'Saved'}
                  </p>
                  <GhostButton onClick={playAgain} className="mt-1"><RotateCcw size={14} /> Run Again</GhostButton>
                </>
              )}
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-500 text-center mt-2">
          {gameState === 'playing' ? 'Space to pause · Arrows / A·D to steer' : 'Scores are saved on this device only.'}
        </p>
      </div>

      <Card className="p-5">
        <PanelHeader
          icon={<Trophy size={18} />}
          title="Local High Scores"
          accent="amber"
          action={scores.length > 0 ? (
            <button onClick={resetScores} className="text-[11px] text-slate-600 hover:text-red-400 transition-colors">Reset scores</button>
          ) : null}
        />
        {scores.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">No runs yet — be the first name on the board.</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {scores.map((s, i) => (
              <li key={s.at + '-' + i} className={`flex items-center justify-between px-3 py-2 rounded-sm text-sm ${i === 0 ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-800/40 border border-slate-700/60'}`}>
                <span className="flex items-center gap-3">
                  <span className={`font-data text-xs w-4 text-right ${i === 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>{i + 1}</span>
                  <span className="font-data font-semibold tracking-[0.2em]">{s.initials}</span>
                </span>
                <span className={`font-data font-bold ${i === 0 ? 'text-amber-400' : 'text-slate-300'}`}>{s.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 pt-4 border-t border-slate-800 flex items-start gap-2 text-[11px] text-slate-500">
          <Fuel size={13} className="mt-0.5 shrink-0 text-emerald-500" />
          <span>Fuel cans are worth +250. Traffic in your lane ends the run — swerve early, the highway gets faster the longer you last.</span>
        </div>
      </Card>
    </div>
  );
}

// ---------- BREAK ROOM: "FREIGHT FIVE" (daily word puzzle, v1 — no Firestore) ----------
// Same local-first design as Night Run: today's puzzle, guesses, and stats
// all live in localStorage — zero new Firestore collections or rules. One
// curated freight/trucking/logistics word a day, with a one-line "why it
// matters in dispatch" note that unlocks once the puzzle ends — the
// educational payoff behind the game.

const FF_STATE_KEY = 'fm_freightfive';
const FF_STATS_KEY = 'fm_freightfive_stats';
const FF_MAX_GUESSES = 6;
const FF_WORD_LEN = 5;

// Curated word bank — every entry is a real, dictionary-valid, exactly-5-letter
// freight/trucking/logistics term (verified with a node one-liner, not just by
// eye — see the Phase 2 handoff notes). [WORD, "why it matters in dispatch"].
const FREIGHT_FIVE_WORDS = [
  ['CARGO', "The freight itself — what you're actually getting paid to move."],
  ['LADEN', 'A laden truck is loaded and running heavy, not deadheading empty.'],
  ['ROUTE', 'The path from pickup to delivery — plan it before you roll.'],
  ['MILES', "Rate per mile (RPM) is the number every driver does math on."],
  ['TRUCK', 'The whole business runs on wheels — no truck, no freight.'],
  ['CRATE', 'Sturdy freight packaging — count the crates before you sign.'],
  ['FLEET', 'Every truck under one operation, big or small.'],
  ['AUDIT', 'A freight bill audit catches shortpays before they cost you.'],
  ['BULKY', 'Oversized, awkward freight that needs extra care to load.'],
  ['AXLES', 'More axles, more weight allowed — know your configuration.'],
  ['BRAKE', 'Air brakes get a hard look at every pre-trip inspection.'],
  ['CABIN', "Where the driver lives on the road — keep it road-ready."],
  ['CHAIN', 'Tire chains in winter, or the supply chain you\'re a link in.'],
  ['CLAIM', 'File it fast when freight arrives damaged — paper trail matters.'],
  ['DEPOT', 'A hub where freight or equipment gets staged.'],
  ['DELAY', 'Weather, traffic, or a late dock — the enemy of on-time delivery.'],
  ['DECAL', 'DOT numbers go on the door — required, not optional.'],
  ['DOLLY', 'Converts a set of doubles — or just rolls freight across a dock.'],
  ['DOCKS', 'Where the trailer backs in and the real work begins.'],
  ['DRAYS', 'Short drayage hauls, usually port-to-warehouse.'],
  ['DRIVE', "Hours of service caps how long you can legally drive."],
  ['EMPTY', 'Running empty (deadhead) earns nothing — avoid it when you can.'],
  ['FLOOR', "Your rate floor is the lowest number you'll say yes to."],
  ['FUELS', 'Diesel prices move the whole cost equation.'],
  ['GAUGE', 'Watch the fuel gauge — running dry on the interstate is a bad day.'],
  ['GRADE', 'A steep mountain grade demands a downshift, not the brakes alone.'],
  ['GROSS', 'Gross pay before the dispatch fee and expenses come out.'],
  ['HAULS', 'What a carrier does for a living — hauls freight, plain and simple.'],
  ['HITCH', 'The connection point between tractor and trailer — inspect it.'],
  ['IDLES', 'An idling engine burns fuel for nothing — shut it down when you can.'],
  ['LANES', 'Your preferred lanes are the freight you actually want.'],
  ['LEASE', 'Owner-operators often lease their truck instead of buying outright.'],
  ['LOADS', 'The whole job in one word — book them, haul them, get paid.'],
  ['MOTOR', "The engine — keep it maintained or it keeps you parked."],
  ['ORDER', 'A purchase order backs up the rate you agreed to.'],
  ['PIECE', 'Piece count on the BOL should match what\'s actually on the truck.'],
  ['QUOTA', 'A weekly load quota keeps revenue predictable.'],
  ['STACK', "Stack it right or it shifts — and shifted freight is a safety risk."],
  ['STORE', 'Freight sits in storage before it ever sees a truck.'],
  ['TRACK', 'GPS tracking tells the broker exactly where the load is.'],
  ['TRADE', 'A trade lane you run often builds relationships on both ends.'],
  ['TREND', 'Watch the rate trend before you commit to a long lane.'],
  ['VALUE', 'Declared cargo value determines how much insurance actually covers.'],
  ['YIELD', 'Yield the right of way — and think about yield per mile too.'],
  ['AGENT', "A broker's agent is who you actually negotiate with."],
  ['CLERK', 'The dock clerk signs off on what came off your trailer.'],
  ['OWNER', 'An owner-operator owns the truck and runs the business.'],
  ['STAFF', 'Dispatch staff keep the whole operation moving.'],
  ['BILLS', 'The bill of lading is the single most important paper on the truck.'],
  ['DRAFT', "A fuel advance draft gets wired before you've even delivered."],
  ['FUNDS', "Factoring turns an invoice into funds in your account today."],
  ['LEGAL', 'Legal weight limits vary by state — know before you cross the line.'],
  ['NOTES', 'Dispatch notes on a load can save you from a bad surprise at the dock.'],
  ['QUOTE', 'A rate quote is the opening move in every negotiation.'],
  ['RATES', 'What the market will pay, lane by lane, day by day.'],
  ['SPLIT', 'Team drivers split the miles — and the paycheck.'],
  ['TERMS', 'Net 30 payment terms mean you wait a month unless you factor.'],
  ['TOTAL', 'The total on the rate confirmation better match what you agreed to.'],
  ['WAIVE', 'Some brokers waive the quick-pay fee for good carriers.'],
  ['PRICE', 'The price of a load moves with fuel, weather, and demand.'],
  ['FORKS', 'Forklift forks load and unload pallets at the dock.'],
  ['HOSES', "Air hoses connect the tractor's brakes to the trailer's."],
  ['PLATE', 'Your license plate is checked at every weigh station.'],
  ['RADIO', 'CB radio still warns you about traffic and scales up ahead.'],
  ['SPARE', 'A spare tire (and knowing how to change it) saves a roadside call.'],
  ['TANKS', 'Fuel tanks on a Class 8 truck can hold well over 100 gallons each.'],
  ['TIRES', 'Tire pressure and tread depth are checked at every DOT inspection.'],
  ['TREAD', 'Bald tread on a steer tire is an out-of-service violation.'],
  ['WHEEL', 'Behind the wheel is where the job actually happens.'],
  ['WIPER', "A working wiper blade matters more than you'd think in a storm."],
  ['VALVE', 'A stuck relief valve can shut your brakes down fast.'],
  ['GEARS', 'Ten, thirteen, eighteen — knowing your gears matters on a grade.'],
  ['ROADS', 'Not every road is legal for an oversized load — check first.'],
  ['SCALE', "A CAT scale confirms you're legal before the state does it for you."],
  ['SHOPS', 'A good repair shop on your route can save a whole day.'],
  ['SPOTS', "Safe parking spots are scarce — plan your stop, don't just find one."],
  ['STATE', 'Cross a state line and the permit rules can change completely.'],
  ['YARDS', 'A truck yard is where equipment sits between loads.'],
  ['ZONES', 'Delivery time zones matter more than you\'d think on a coast run.'],
  ['CURVE', 'A sharp curve at highway speed is where rollovers happen.'],
  ['NORTH', "Northbound freight doesn't always pay the same as southbound."],
  ['SOUTH', 'Southbound lanes often soften in the off-season — know the pattern.'],
  ['COAST', 'East Coast to West Coast is one of the longest hauls in the business.'],
  ['STORM', 'A storm system can shut down an entire interstate corridor.'],
  ['WINDS', 'High wind advisories are serious business for a high-profile trailer.'],
  ['FROST', "Black ice from an overnight frost is invisible until it isn't."],
  ['SLEET', 'Sleet turns a normal stop into a slow, careful one.'],
  ['SMOKE', 'Wildfire smoke can close a route almost as fast as a flood.'],
  ['FLOOD', 'A flooded route means a detour — and a later delivery.'],
  ['BELTS', "Seatbelts aren't optional — DOT and common sense agree."],
  ['ALARM', "A backup alarm warns everyone on the dock you're reversing."],
  ['ALERT', 'A safety alert from your carrier can change your whole route.'],
  ['CHECK', 'A thorough pre-trip check catches problems before the highway does.'],
  ['GUARD', 'A cargo guard keeps a shifted load from flying into the cab.'],
  ['LIMIT', 'Weight limits, speed limits — the two numbers that follow you all day.'],
  ['RESET', 'A 34-hour restart resets your weekly drive-time clock.'],
  ['SLEEP', 'The sleeper berth is where the hours-of-service clock lets you rest.'],
  ['SPEED', 'Speed limits for trucks are sometimes lower than for cars.'],
  ['STOPS', 'Planned stops beat scrambling for parking at 11pm.'],
  ['TIRED', 'A tired driver is the single biggest risk on the road — pull over.'],
  ['WEIGH', 'Every truck rolls through a weigh station sooner or later.'],
  ['FLARE', 'A road flare kit is part of every roadside emergency setup.'],
  ['CONES', 'Safety cones around a breakdown buy you time and visibility.'],
  ['CLOCK', 'Hours of service runs on a strict clock — know where you stand.'],
  ['PANEL', "The dash panel's warning lights are trying to tell you something."],
  ['PHONE', 'Half of dispatch happens over the phone before it ever hits an app.'],
  ['PRINT', 'Print the BOL before you leave the shipper, just in case.'],
  ['RADAR', "What a trooper points at your bumper — know your limit."],
  ['SCANS', 'A quick scan of the signed POD gets you paid faster.'],
  ['SETUP', 'A carrier setup packet is the paperwork every new broker wants first.'],
  ['TOLLS', 'Toll roads cut time but cut into the margin too.'],
  ['RANGE', 'Fuel range planning keeps you from coasting in on fumes.'],
  ['BOXES', 'Palletized boxes move faster through a dock than loose freight.'],
  ['DRUMS', 'Hazmat drums need the right placards and the right paperwork.'],
  ['SKIDS', "Skids is just trucker-speak for pallets."],
  ['HOIST', "A hoist does the heavy lifting a person's back shouldn't."],
  ['RAMPS', 'Loading ramps let a forklift roll straight into the trailer.'],
  ['BERTH', 'A dock berth is the exact bay your trailer backs into.'],
  ['QUEUE', 'A long dock queue can eat your whole appointment window.'],
  ['SLOTS', 'Delivery slots at a big-box DC book up fast — don\'t be late.'],
  ['BONDS', "A surety bond protects shippers if a broker doesn't pay out."],
  ['TARPS', "Flatbed freight isn't legal to run without the right tarps."],
  ['STRAP', "A tie-down strap failing mid-highway is every flatbed driver's nightmare."],
  ['UNITS', 'More units in the fleet means more freight the dispatcher can move.'],
  ['SEMIS', "Semis, tractors, rigs — same truck, different name."],
  ['DECKS', 'A step-deck lowers the deck height for taller freight.'],
  ['SEALS', 'A broken security seal on arrival is a claim waiting to happen.'],
  ['LOCKS', 'A cargo lock is cheap insurance against a break-in at a truck stop.'],
  ['SHIFT', 'A night shift driver keeps freight moving while the world sleeps.'],
  ['BREAK', 'Mark yourself On Break and dispatch knows not to call — yet.'],
  ['HOURS', "Hours of service is the rulebook every driver's day runs on."],
  ['POUND', 'Weight limits are measured right down to the pound at some scales.'],
  ['TONNE', 'Cross-border freight often gets weighed out in tonnes, not pounds.'],
  ['CUBIC', 'Cubic capacity matters as much as weight for a bulky, light load.'],
  ['METER', "The odometer's not just for mileage pay — it's proof of the route."],
  ['RURAL', 'Rural delivery routes trade traffic for tighter roads.'],
  ['URBAN', 'Urban deliveries mean tight docks, tow zones, and patience.'],
  ['METRO', 'A metro-area run is short miles but long minutes in traffic.'],
  ['FINES', 'DOT fines for a blown inspection add up fast — keep the truck clean.'],
  ['SCORE', "Your carrier's CSA score follows you into every broker's decision."],
  ['CROSS', 'Cross-docking moves freight from inbound to outbound without a shelf.'],
  ['TRAIL', 'A paper trail on every load protects you if a payment dispute comes up.'],
  ['SHEET', 'A rate sheet gives you a starting point before you pick up the phone.'],
  ['TIMES', "Appointment times at a DC are rarely flexible — plan your ETA."],
  ['WATCH', 'Keep a watch on the weather radar before you commit to a route.'],
  ['NIGHT', 'Night runs mean lighter traffic — and headlights doing all the work.'],
  ['LIGHT', 'A lighter load still needs to be secured just as tight as a heavy one.'],
  ['TRACE', "A trace number ties a factored invoice back to the exact wire it produced."],
  ['STAGE', "Staged freight is ready and waiting the moment your trailer backs in."],
  ['FIRST', "First come, first served is how a lot of live-load docks actually work."],
  ['FINAL', 'The final mile is often the slowest, most expensive part of the trip.'],
  ['WORTH', "Know what your lane is worth before a broker tells you what it's worth."],
  ['EARLY', 'Some docks charge you for showing up ahead of your appointment.'],
  ['LATER', 'A later pickup can still make an on-time delivery if the math works.'],
  ['FAULT', 'Figuring out fault on a damaged shipment is half of every freight claim.'],
];

// Deterministic "today" bits — local calendar date, computed from Y/M/D
// components (not raw epoch ms) so a DST transition never causes an
// off-by-one day. NEVER uses Math.random for puzzle selection.
function ffLocalDateStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function ffDayNumber(d = new Date()) {
  const start = new Date(2026, 0, 1); // local Jan 1, 2026 = Puzzle #1
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.max(1, Math.round((a - b) / 86400000) + 1);
}
function ffYesterday(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  dt.setDate(dt.getDate() - 1);
  return ffLocalDateStr(dt);
}

function loadFFState() {
  const today = ffLocalDateStr();
  try {
    const raw = JSON.parse(localStorage.getItem(uidKey(FF_STATE_KEY)) || 'null');
    if (raw && raw.date === today && Array.isArray(raw.guesses)) return raw;
  } catch (_) { /* fall through to a fresh board */ }
  return { date: today, guesses: [], done: false, won: false };
}
function saveFFState(state) {
  try { localStorage.setItem(uidKey(FF_STATE_KEY), JSON.stringify(state)); } catch (_) {}
}
function loadFFStats() {
  const fallback = { played: 0, won: 0, currentStreak: 0, maxStreak: 0, lastPlayedDate: null };
  try {
    const raw = JSON.parse(localStorage.getItem(uidKey(FF_STATS_KEY)) || 'null');
    if (raw && typeof raw === 'object') return { ...fallback, ...raw };
  } catch (_) {}
  return fallback;
}
function saveFFStats(stats) {
  try { localStorage.setItem(uidKey(FF_STATS_KEY), JSON.stringify(stats)); } catch (_) {}
}

// Standard Wordle-style scoring with correct duplicate-letter handling:
// exact-position matches are claimed first, then leftover letters are
// matched against whatever target letters aren't already claimed.
function evaluateGuess(guess, target) {
  const res = new Array(FF_WORD_LEN).fill('absent');
  const t = target.split('');
  const g = guess.split('');
  const used = new Array(FF_WORD_LEN).fill(false);
  for (let i = 0; i < FF_WORD_LEN; i++) {
    if (g[i] === t[i]) { res[i] = 'correct'; used[i] = true; }
  }
  for (let i = 0; i < FF_WORD_LEN; i++) {
    if (res[i] === 'correct') continue;
    const idx = t.findIndex((ch, j) => ch === g[i] && !used[j]);
    if (idx !== -1) { res[i] = 'present'; used[idx] = true; }
  }
  return res;
}
// Best-status-per-letter across every guess so far, for the on-screen keyboard.
function ffKeyboardStatuses(guesses, target) {
  const rank = { absent: 0, present: 1, correct: 2 };
  const map = {};
  guesses.forEach((g) => {
    const res = evaluateGuess(g, target);
    g.split('').forEach((ch, i) => {
      if (!map[ch] || rank[res[i]] > rank[map[ch]]) map[ch] = res[i];
    });
  });
  return map;
}

const FF_KEY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
];

function FreightFiveGame() {
  // The day number (and therefore the target word) is fixed for the life of
  // this mount — a fresh mount past midnight naturally picks up the new day.
  const dayNum = React.useMemo(() => ffDayNumber(), []);
  const puzzle = FREIGHT_FIVE_WORDS[(dayNum - 1) % FREIGHT_FIVE_WORDS.length];
  const target = puzzle[0];
  const clue = puzzle[1];

  const [state, setState] = useState(() => loadFFState());
  const [stats, setStats] = useState(() => loadFFStats());
  const [current, setCurrent] = useState('');
  const [shakeRow, setShakeRow] = useState(false);
  const [message, setMessage] = useState('');

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { saveFFState(state); }, [state]);

  const timeoutsRef = useRef([]);
  useEffect(() => () => { timeoutsRef.current.forEach(clearTimeout); }, []);

  const done = state.done;

  const flashMessage = (msg) => {
    setMessage(msg);
    setShakeRow(true);
    timeoutsRef.current.push(setTimeout(() => setShakeRow(false), 350));
    timeoutsRef.current.push(setTimeout(() => setMessage(''), 1400));
  };

  // Records today's result exactly once, even if this component remounts —
  // guarded on stats.lastPlayedDate rather than any in-memory flag.
  const commitStats = (won) => {
    setStats((prev) => {
      const today = ffLocalDateStr();
      if (prev.lastPlayedDate === today) return prev;
      const yest = ffYesterday(today);
      const nextStreak = won ? (prev.lastPlayedDate === yest ? prev.currentStreak + 1 : 1) : 0;
      const next = {
        played: prev.played + 1,
        won: prev.won + (won ? 1 : 0),
        currentStreak: nextStreak,
        maxStreak: Math.max(prev.maxStreak, nextStreak),
        lastPlayedDate: today,
      };
      saveFFStats(next);
      return next;
    });
  };

  const applyGuess = (guess) => {
    const s = stateRef.current;
    if (s.done) return;
    const guesses = [...s.guesses, guess];
    const won = guess === target;
    const nextDone = won || guesses.length >= FF_MAX_GUESSES;
    setState({ ...s, guesses, done: nextDone, won });
    if (nextDone) commitStats(won);
  };

  // ---- input: on-screen keys call this directly; the physical listener
  // (below) routes through it too, so there's exactly one code path. ----
  const onKey = (key) => {
    if (stateRef.current.done) return;
    if (key === 'BACK') { setCurrent((c) => c.slice(0, -1)); return; }
    if (key === 'ENTER') {
      setCurrent((c) => {
        if (c.length !== FF_WORD_LEN) { flashMessage(`Need ${FF_WORD_LEN} letters`); return c; }
        applyGuess(c.toUpperCase());
        return '';
      });
      return;
    }
    if (/^[A-Z]$/.test(key)) setCurrent((c) => (c.length < FF_WORD_LEN ? c + key : c));
  };

  // ---- keyboard: gated exactly like Night Run — only attached while this
  // puzzle isn't finished, always ignoring a focused real form field, and
  // never touching a modifier combo (so Ctrl/Cmd+K reaches the command
  // palette untouched). Removed the instant the puzzle is done or unmounts. ----
  useEffect(() => {
    if (done) return;
    const onKeyDown = (e) => {
      const ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); onKey('ENTER'); return; }
      if (e.key === 'Backspace') { e.preventDefault(); onKey('BACK'); return; }
      if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); onKey(e.key.toUpperCase()); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [done]);

  const keyStatuses = React.useMemo(() => ffKeyboardStatuses(state.guesses, target), [state.guesses, target]);

  const shareText = React.useMemo(() => {
    const rows = state.guesses.map((g) => evaluateGuess(g, target).map((r) => (r === 'correct' ? '🟩' : r === 'present' ? '🟨' : '⬛')).join(''));
    const tries = state.won ? state.guesses.length : 'X';
    return `Freight Five #${dayNum} ${tries}/${FF_MAX_GUESSES}\n\n${rows.join('\n')}`;
  }, [state.guesses, state.won, target, dayNum]);

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast('Result copied to clipboard', 'success');
    } catch (_) {
      toast('Could not copy — select and copy manually.', 'error');
    }
  };

  const tileCls = (status) => {
    if (status === 'correct') return 'bg-emerald-600 border-emerald-500 text-white';
    if (status === 'present') return 'bg-amber-500 border-amber-400 text-slate-950';
    if (status === 'absent') return 'bg-slate-700/70 border-slate-600 text-slate-300';
    return 'border-slate-700 text-slate-100';
  };
  const keyCls = (status) => {
    if (status === 'correct') return 'bg-emerald-600 text-white';
    if (status === 'present') return 'bg-amber-500 text-slate-950';
    if (status === 'absent') return 'bg-slate-800/70 text-slate-500';
    return 'bg-slate-700 text-slate-100 hover:bg-slate-600';
  };

  const rows = Array.from({ length: FF_MAX_GUESSES }, (_, i) => {
    if (i < state.guesses.length) return { letters: state.guesses[i].split(''), statuses: evaluateGuess(state.guesses[i], target) };
    if (i === state.guesses.length) return { letters: current.split(''), statuses: null, active: true };
    return { letters: [], statuses: null };
  });

  const winPct = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  return (
    <Card className="p-5">
      <PanelHeader
        icon={<Target size={18} />}
        title="Freight Five"
        accent="emerald"
        badge={<Badge tone="slate" className="font-normal">#{dayNum}</Badge>}
        action={stats.currentStreak > 0 ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-400"><Flame size={14} /> {stats.currentStreak}</span>
        ) : null}
      />
      <p className="text-xs text-slate-400 -mt-2 mb-4">One freight word a day, six guesses. New word at midnight.</p>

      <div className="relative">
        {message && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-10 bg-slate-100 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded shadow-lg whitespace-nowrap">
            {message}
          </div>
        )}
        <div className={`grid grid-rows-6 gap-1.5 max-w-[280px] mx-auto ${shakeRow ? 'fm-ff-shake' : ''}`}>
          {rows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: FF_WORD_LEN }, (_, ci) => {
                const letter = row.letters[ci] || '';
                const status = row.statuses ? row.statuses[ci] : null;
                return (
                  <div
                    key={ci}
                    className={`aspect-square rounded-sm border-2 flex items-center justify-center font-data font-bold text-lg uppercase select-none transition-colors ${tileCls(status)} ${row.active && letter ? 'border-slate-400' : ''}`}
                  >
                    {letter}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {!done ? (
        <div className="mt-5 space-y-1.5" aria-hidden={false}>
          {FF_KEY_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {row.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onKey(k)}
                  aria-label={k === 'BACK' ? 'Backspace' : k === 'ENTER' ? 'Enter guess' : `Letter ${k}`}
                  className={`${k === 'ENTER' || k === 'BACK' ? 'flex-[1.6] text-[10px] font-bold' : 'flex-1 text-xs font-bold'} h-11 rounded-md uppercase transition-colors ${keyCls(keyStatuses[k])}`}
                >
                  {k === 'BACK' ? <Delete size={15} className="mx-auto" /> : k === 'ENTER' ? 'ENTER' : k}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className={`text-center rounded-lg border p-4 ${state.won ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
            <div className={`text-sm font-bold ${state.won ? 'text-emerald-400' : 'text-slate-300'}`}>
              {state.won ? `Solved in ${state.guesses.length}/${FF_MAX_GUESSES}` : `The word was ${target}`}
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">{clue}</p>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center">
            <div><div className="font-data text-lg font-bold text-white">{stats.played}</div><div className="text-[10px] text-slate-500 uppercase tracking-wide">Played</div></div>
            <div><div className="font-data text-lg font-bold text-white">{winPct}%</div><div className="text-[10px] text-slate-500 uppercase tracking-wide">Win Rate</div></div>
            <div><div className="font-data text-lg font-bold text-amber-400">{stats.currentStreak}</div><div className="text-[10px] text-slate-500 uppercase tracking-wide">Streak</div></div>
            <div><div className="font-data text-lg font-bold text-white">{stats.maxStreak}</div><div className="text-[10px] text-slate-500 uppercase tracking-wide">Max Streak</div></div>
          </div>

          <GhostButton onClick={copyResult} className="w-full"><Share2 size={14} /> Copy Result</GhostButton>
          <p className="text-[11px] text-slate-600 text-center">Come back after midnight for the next word.</p>
        </div>
      )}
    </Card>
  );
}

// ---------- BREAK ROOM: "SUDOKU" (classic 9×9, local-only — no Firestore) ----------
// Same local-first contract as the other Break Room games: the board, notes,
// timer, and difficulty all live in localStorage (fm_sudoku_*), zero new
// collections or rules. Every puzzle is generated fresh (solved grid via
// randomized backtracking, then cells removed one at a time) and every
// removal is verified against a solution-counting solver so the shipped
// puzzle ALWAYS has exactly one solution — no hardcoded boards anywhere.

const SUDOKU_STATE_KEY = 'fm_sudoku_state';
// Target clue counts per difficulty. The digger stops early if removing any
// further cell would break uniqueness, so these are floors, not guarantees —
// a board can ship with a few more clues than the target, never fewer.
const SUDOKU_CLUES = { easy: 40, medium: 32, hard: 26 };
const SUDOKU_DIFFS = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];

function sdkShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Can `v` legally go in empty cell `idx` of grid `g` (81 flat, 0 = empty)?
function sdkValidAt(g, idx, v) {
  const r = Math.floor(idx / 9), c = idx % 9;
  for (let i = 0; i < 9; i++) {
    if (g[r * 9 + i] === v) return false;            // row
    if (g[i * 9 + c] === v) return false;            // column
  }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (g[(br + i) * 9 + (bc + j)] === v) return false; // 3×3 box
    }
  }
  return true;
}

// Fills grid `g` in place into a complete valid solution. Randomized digit
// order at every cell = a different solved grid every call.
function sdkFill(g) {
  const idx = g.indexOf(0);
  if (idx === -1) return true;
  for (const v of sdkShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (sdkValidAt(g, idx, v)) {
      g[idx] = v;
      if (sdkFill(g)) return true;
      g[idx] = 0;
    }
  }
  return false;
}

// Counts solutions up to `limit` (2 is all uniqueness needs). Backtracking
// with most-constrained-cell-first ordering so even sparse Hard boards
// resolve in a few milliseconds — this runs ~50× per generated puzzle.
function sdkCountSolutions(grid, limit = 2) {
  const g = grid.slice();
  let count = 0;
  const rec = () => {
    if (count >= limit) return;
    let best = -1, bestCands = null;
    for (let i = 0; i < 81; i++) {
      if (g[i] !== 0) continue;
      const cands = [];
      for (let v = 1; v <= 9; v++) { if (sdkValidAt(g, i, v)) cands.push(v); }
      if (cands.length === 0) return; // contradiction — dead branch
      if (!bestCands || cands.length < bestCands.length) {
        best = i; bestCands = cands;
        if (cands.length === 1) break; // can't do better than forced
      }
    }
    if (best === -1) { count++; return; } // no empties — one full solution
    for (const v of bestCands) {
      g[best] = v;
      rec();
      g[best] = 0;
      if (count >= limit) return;
    }
  };
  rec();
  return count;
}

// Generate { puzzle, solution }: solve a full grid, then dig cells out in
// random order down toward the difficulty's clue target — but a cell only
// stays removed if the board still counts exactly ONE solution without it.
function sdkGenerate(difficulty) {
  const solution = new Array(81).fill(0);
  sdkFill(solution);
  const puzzle = solution.slice();
  const target = SUDOKU_CLUES[difficulty] || SUDOKU_CLUES.medium;
  let clues = 81;
  for (const i of sdkShuffle(Array.from({ length: 81 }, (_, k) => k))) {
    if (clues <= target) break;
    const saved = puzzle[i];
    puzzle[i] = 0;
    if (sdkCountSolutions(puzzle, 2) === 1) clues--;
    else puzzle[i] = saved; // removal breaks uniqueness — keep the clue
  }
  return { puzzle, solution };
}

// Restore a saved board, or null. Strict shape check so a corrupt/legacy
// blob can never crash the Break Room — worst case we just deal fresh.
function loadSudokuState() {
  try {
    const raw = JSON.parse(localStorage.getItem(uidKey(SUDOKU_STATE_KEY)) || 'null');
    if (raw && [raw.puzzle, raw.solution, raw.entries].every((a) => Array.isArray(a) && a.length === 81)) {
      return { difficulty: 'medium', seconds: 0, solved: false, notes: {}, ...raw };
    }
  } catch (_) { /* fall through to a fresh board */ }
  return null;
}
function saveSudokuState(s) {
  try { localStorage.setItem(uidKey(SUDOKU_STATE_KEY), JSON.stringify(s)); } catch (_) {}
}

// The grid's max width in px — 400 everywhere except short md+ viewports,
// where it's height-capped so grid + pad + controls fit without clipping.
function sdkGridCap() {
  try {
    if (!window.matchMedia('(min-width: 768px)').matches) return 400; // phones unchanged
    return Math.max(260, Math.min(400, window.innerHeight - 440));
  } catch (_) { return 400; }
}

function sdkFmtTime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function SudokuGame() {
  const [game, setGame] = useState(() => {
    const saved = loadSudokuState();
    if (saved) return saved; // refresh mid-puzzle → exact board, notes, and clock restored
    const { puzzle, solution } = sdkGenerate('medium');
    return { puzzle, solution, entries: new Array(81).fill(0), notes: {}, difficulty: 'medium', seconds: 0, solved: false };
  });
  const [selected, setSelected] = useState(null);
  const [notesMode, setNotesMode] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Height-aware board cap (md+ only): grid + number pad + controls carry
  // ~440px of fixed chrome around the square grid, so cap the grid at
  // (viewportHeight − 440) — a 768px laptop gets a ~328px grid and the whole
  // card fits without the page scroll clipping the pad. 260px floor keeps
  // cells tappable; below that the card itself scrolls (fm-fit-vh), never
  // the page. Below md phones keep the original 400px width-only cap.
  const [gridMax, setGridMax] = useState(() => sdkGridCap());
  useEffect(() => {
    const calc = () => setGridMax(sdkGridCap());
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // Persist every change (board, notes, timer tick) — cheap, and it's what
  // makes a refresh land back exactly where you left off.
  useEffect(() => { saveSudokuState(game); }, [game]);

  // Timer: one interval while unsolved, torn down on solve/unmount. Skips
  // ticks while the tab is hidden so walking away doesn't inflate the clock.
  useEffect(() => {
    if (game.solved) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      setGame((g) => (g.solved ? g : { ...g, seconds: g.seconds + 1 }));
    }, 1000);
    return () => clearInterval(t);
  }, [game.solved]);

  const cellVal = (g, i) => (g.puzzle[i] !== 0 ? g.puzzle[i] : g.entries[i]);

  // Place a digit (or toggle it as a pencil-mark in notes mode) into the
  // selected non-given cell, then check for the win.
  const place = (v) => {
    setGame((g) => {
      if (g.solved || selected == null || g.puzzle[selected] !== 0) return g;
      if (notesMode) {
        const cur = g.notes[selected] || [];
        const next = cur.includes(v) ? cur.filter((n) => n !== v) : [...cur, v].sort();
        return { ...g, notes: { ...g.notes, [selected]: next } };
      }
      const entries = g.entries.slice();
      entries[selected] = entries[selected] === v ? 0 : v; // same digit again = clear it
      const notes = { ...g.notes };
      if (entries[selected] !== 0) delete notes[selected];
      let solved = true;
      for (let i = 0; i < 81; i++) {
        if ((g.puzzle[i] !== 0 ? g.puzzle[i] : entries[i]) !== g.solution[i]) { solved = false; break; }
      }
      return { ...g, entries, notes, solved };
    });
  };
  const erase = () => {
    setGame((g) => {
      if (g.solved || selected == null || g.puzzle[selected] !== 0) return g;
      const entries = g.entries.slice();
      entries[selected] = 0;
      const notes = { ...g.notes };
      delete notes[selected];
      return { ...g, entries, notes };
    });
  };
  // Refs so the (deliberately sparse-dep) keyboard effect always calls the
  // latest handlers — selected/notesMode live in their closures.
  const placeRef = useRef(place); placeRef.current = place;
  const eraseRef = useRef(erase); eraseRef.current = erase;

  const newPuzzle = (diff) => {
    if (generating) return;
    const hasProgress = !game.solved && (game.entries.some((v) => v !== 0) || Object.keys(game.notes).length > 0);
    if (hasProgress && !window.confirm('Start a new puzzle? Your current board will be lost.')) return;
    setGenerating(true);
    setSelected(null);
    // Generation is synchronous (~tens of ms on Hard) — yield one frame so
    // the "Dealing…" state paints before the work runs.
    setTimeout(() => {
      const { puzzle, solution } = sdkGenerate(diff);
      setGame({ puzzle, solution, entries: new Array(81).fill(0), notes: {}, difficulty: diff, seconds: 0, solved: false });
      setNotesMode(false);
      setGenerating(false);
    }, 30);
  };

  // ---- keyboard: gated exactly like Night Run / Freight Five — attached
  // only while this sub-view is mounted and the puzzle is live, a no-op when
  // a real form field has focus, and never touching modifier combos so the
  // command palette (Ctrl/Cmd+K) is completely untouched. ----
  useEffect(() => {
    if (game.solved) return;
    const onKeyDown = (e) => {
      const ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= '1' && e.key <= '9') { e.preventDefault(); placeRef.current(Number(e.key)); return; }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); eraseRef.current(); return; }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setNotesMode((m) => !m); return; }
      const moves = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
      if (moves[e.key] !== undefined) {
        e.preventDefault();
        setSelected((s) => {
          if (s == null) return 40; // first arrow press lands center-board
          if (e.key === 'ArrowLeft' && s % 9 === 0) return s;
          if (e.key === 'ArrowRight' && s % 9 === 8) return s;
          const next = s + moves[e.key];
          return next < 0 || next > 80 ? s : next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [game.solved]);

  // Live mistake feedback, kept gentle: a cell is "in conflict" when its
  // digit repeats in a shared row/column/box. Recomputed per board change.
  const conflicts = React.useMemo(() => {
    const bad = new Set();
    for (let i = 0; i < 81; i++) {
      const v = cellVal(game, i);
      if (!v) continue;
      const r = Math.floor(i / 9), c = i % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      for (let j = i + 1; j < 81; j++) {
        if (cellVal(game, j) !== v) continue;
        const r2 = Math.floor(j / 9), c2 = j % 9, b2 = Math.floor(r2 / 3) * 3 + Math.floor(c2 / 3);
        if (r === r2 || c === c2 || b === b2) { bad.add(i); bad.add(j); }
      }
    }
    return bad;
  }, [game]);

  // Digit usage — the pad dims a number once all nine are on the board.
  const digitCounts = React.useMemo(() => {
    const m = {};
    for (let i = 0; i < 81; i++) { const v = cellVal(game, i); if (v) m[v] = (m[v] || 0) + 1; }
    return m;
  }, [game]);

  const selVal = selected != null ? cellVal(game, selected) : 0;
  const selR = selected != null ? Math.floor(selected / 9) : -1;
  const selC = selected != null ? selected % 9 : -1;
  const selB = selected != null ? Math.floor(selR / 3) * 3 + Math.floor(selC / 3) : -1;

  const cellCls = (i) => {
    const r = Math.floor(i / 9), c = i % 9, b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const given = game.puzzle[i] !== 0;
    const v = cellVal(game, i);
    const conflict = !given && conflicts.has(i);
    let cls = 'relative aspect-square flex items-center justify-center font-data select-none border-slate-800 border transition-colors ';
    if (c % 3 === 2 && c !== 8) cls += 'border-r-2 border-r-slate-500 ';
    if (r % 3 === 2 && r !== 8) cls += 'border-b-2 border-b-slate-500 ';
    // background priority: selected > same digit > peers > given shading
    if (i === selected) cls += 'bg-amber-500/25 ';
    else if (selVal && v === selVal) cls += 'bg-amber-500/10 ';
    else if (selected != null && (r === selR || c === selC || b === selB)) cls += 'bg-slate-800/60 ';
    else if (given) cls += 'bg-slate-800/30 ';
    if (conflict) cls += 'bg-red-500/10 ';
    // ink: givens read solid, your entries read gold, conflicts read soft red
    cls += given ? 'text-slate-100 font-bold ' : conflict ? 'text-red-400 font-semibold ' : 'text-amber-300 font-semibold ';
    return cls;
  };

  return (
    <Card className="p-4 sm:p-5 max-w-md mx-auto fm-fit-vh">
      <PanelHeader
        icon={<Grid3x3 size={18} />}
        title="Sudoku"
        accent="blue"
        badge={<Badge tone="slate" className="font-normal capitalize">{game.difficulty}</Badge>}
        action={
          <span className="flex items-center gap-1.5 text-xs font-data text-slate-400" aria-label={`Time: ${sdkFmtTime(game.seconds)}`}>
            <Clock size={13} /> {sdkFmtTime(game.seconds)}
          </span>
        }
      />
      <p className="text-xs text-slate-400 mt-1 mb-3">Classic 9×9. Tap a cell, then a number — givens are locked. Progress saves on this device.</p>

      {/* the board — big enough cells at 390px to be thumb-usable; gridMax
          shrinks it on short desktop viewports so the pad stays on-screen */}
      <div
        className="grid grid-cols-9 w-full mx-auto rounded-md overflow-hidden border-2 border-slate-500 bg-slate-950"
        style={{ maxWidth: gridMax + 'px' }}
        role="grid"
        aria-label="Sudoku board"
      >
        {Array.from({ length: 81 }, (_, i) => {
          const v = cellVal(game, i);
          const given = game.puzzle[i] !== 0;
          const notes = !v ? (game.notes[i] || []) : [];
          const r = Math.floor(i / 9), c = i % 9;
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              onClick={() => setSelected(i)}
              aria-label={`Row ${r + 1}, column ${c + 1}${v ? `, ${given ? 'given ' : ''}${v}` : ', empty'}`}
              className={cellCls(i) + ' text-base sm:text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:z-10'}
            >
              {v ? v : notes.length > 0 ? (
                <span className="grid grid-cols-3 w-full h-full p-[2px] text-[8px] leading-none text-slate-400 font-semibold" aria-hidden="true">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span key={n} className="flex items-center justify-center">{notes.includes(n) ? n : ''}</span>
                  ))}
                </span>
              ) : ''}
            </button>
          );
        })}
      </div>

      {game.solved ? (
        <div className="mt-5 space-y-4">
          <div className="text-center rounded-lg border bg-emerald-500/10 border-emerald-500/30 p-4">
            <div className="text-sm font-bold text-emerald-400">Solved!</div>
            <p className="text-xs text-slate-400 mt-1">
              <span className="capitalize">{game.difficulty}</span> board in <span className="font-data text-slate-200">{sdkFmtTime(game.seconds)}</span> — clean grid, no leftovers.
            </p>
          </div>
          <PrimaryButton onClick={() => newPuzzle(game.difficulty)} disabled={generating} className="w-full">
            {generating ? 'Dealing…' : 'New Puzzle'}
          </PrimaryButton>
        </div>
      ) : (
        <>
          {/* number pad — required on phones, handy everywhere. h-11 keeps
              the 44px phone tap target; md:h-10 buys back height on laptops */}
          <div className="mt-3 grid grid-cols-5 gap-1.5 mx-auto" style={{ maxWidth: gridMax + 'px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => place(n)}
                aria-label={notesMode ? `Pencil-mark ${n}` : `Place ${n}`}
                className={`h-11 md:h-10 rounded-md font-data font-bold text-base transition-colors ${(digitCounts[n] || 0) >= 9 ? 'bg-slate-800/50 text-slate-600' : 'bg-slate-700 text-slate-100 hover:bg-slate-600 active:bg-slate-500'}`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={erase}
              aria-label="Erase cell"
              className="h-11 md:h-10 rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors flex items-center justify-center"
            >
              <Eraser size={16} />
            </button>
          </div>

          {/* controls: notes toggle · difficulty · new puzzle */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 mx-auto" style={{ maxWidth: gridMax + 'px' }}>
            <button
              type="button"
              onClick={() => setNotesMode((m) => !m)}
              aria-pressed={notesMode}
              aria-label="Toggle notes mode"
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors ${notesMode ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'}`}
            >
              <NotebookPen size={13} /> Notes {notesMode ? 'on' : 'off'}
            </button>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-md border border-slate-700 overflow-hidden">
                {SUDOKU_DIFFS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { if (key !== game.difficulty) newPuzzle(key); }}
                    aria-pressed={game.difficulty === key}
                    className={`text-[11px] px-2.5 py-1.5 transition-colors ${game.difficulty === key ? 'bg-slate-700 text-white font-semibold' : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => newPuzzle(game.difficulty)}
                disabled={generating}
                aria-label="New puzzle"
                title="New puzzle"
                className="text-xs px-2.5 py-1.5 rounded-md border border-slate-700 bg-slate-800/60 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
              >
                {generating ? '…' : <RotateCcw size={13} />}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-600 text-center mt-2">Keys 1–9 place · Backspace erases · N toggles notes · arrows move</p>
        </>
      )}
    </Card>
  );
}

// ============================================================================
// ===== BREAK ROOM: "HAUL BUDDY" (v1 — a tiny trucker who lives on this
// device, no Firestore, no rules) ============================================
// A pocket-sized care-and-personality toy. He has three needs (Coffee / Rest
// / Company), a mood driven purely by real elapsed time since he was last
// cared for, and a mouth on him. Contained ENTIRELY inside the Break Room —
// the only other place he's allowed to show his face is the one sanctioned
// "peek" on the dashboard (HaulBuddyDashboardPeek, below), which only ever
// appears in a good mood. Nothing here ever badges the nav, toasts outside
// this tab, or otherwise nags — that's the deal that makes the rest of the
// Break Room work, and this game has to honor it too.
//
// Storage: fm_haulbuddy_state (the current trucker), fm_haulbuddy_wall (past
// truckers), fm_haulbuddy_dashpeek_pref / _stamp (the peek's on/off + daily
// gate). All localStorage, every key suffixed per-account via uidKey() at
// read/write time, nothing here ever touches Firestore, org data, or the
// multi-tenant helpers.
// ============================================================================

const HB_STATE_KEY = 'fm_haulbuddy_state';
const HB_WALL_KEY = 'fm_haulbuddy_wall';
const HB_PEEK_PREF_KEY = 'fm_haulbuddy_dashpeek_pref'; // 'on' | 'off' — default on
const HB_PEEK_STAMP_KEY = 'fm_haulbuddy_dashpeek_stamp'; // { date, shown } — the peek's once-a-day gate
const HB_DEEPLINK_KEY = 'fm_hb_deeplink'; // sessionStorage — "open his page" flag set by the dashboard peek

// ---- decay tuning — the whole game lives in four numbers. A need's bar
// drains 100 -> 0 over HB_NEED_DECAY_HOURS (cosmetic — just the meter math).
// Mood is driven by real elapsed hours since the LEAST-recently-cared-for
// of the three needs (i.e. however long it's genuinely been since you last
// did anything for him):
//   0–24h   -> Thriving / Content — a daily check-in comfortably lives here.
//   24–72h  -> Grumpy   — the "gone all weekend" case (~34h) lands here,
//                          fully recoverable in one visit, zero punishment.
//   72–144h -> Fed Up   — still one visit from fine, but he has Opinions.
//   >144h   -> Gone     — six full days of nothing. Genuine neglect only.
// ----
const HB_NEED_DECAY_HOURS = 48;
const HB_GRUMPY_AFTER_H = 24;
const HB_FEDUP_AFTER_H = 72;
const HB_GONE_AFTER_H = 144;

const HB_FIRST_NAMES = ['Dale', 'Ray', 'Earl', 'Vernon', 'Wade', 'Hoyt', 'Merle', 'Gus', 'Roy', 'Duane', 'Cletus', 'Boone', 'Otis', 'Walt', 'Lonnie', 'Hank', 'Fritz', 'Dutch', 'Norm', 'Stan', 'Doyle', 'Ruby', 'Wanda', 'Fern', 'Peggy', 'Dot', 'Odessa', 'Mabel', 'Gary', 'Chuck'];
const HB_HANDLES = ['Thermos', 'Slow Lane', 'Two Napkins', "Momma's Boy", 'Lucky Strike', 'Ten-Four', 'Sundown', 'Gravy', 'Big Sky', 'Cricket', 'Doodle', 'Rooster', 'Snapback', 'Pothole', 'Whistler', 'Biscuit', 'Cornbread', 'Lonestar', 'Highbeam', 'Tumbleweed', 'Radio Silence', 'Doubleclutch', 'Shortstack', 'Nightowl', 'Gumdrop', 'Sasquatch'];
const HB_SURNAMES = ['McGraw', 'Delgado', 'Vance', 'Whitfield', 'Boyle', 'Kowalski', 'Fenwick', 'Okafor', 'Marsh', 'Tran', 'Dunmore', 'Ortega', 'Sturgess', 'Callahan', 'Brandt', 'Nakamura', 'Silva', 'Reyes', 'Halloran', 'Petrova', 'Odom', 'Doss', 'Ferris', 'Gutierrez'];

const HB_SKIN_TONES = ['#E8B48C', '#C98A56', '#8D5A3B', '#F1C9A0', '#A9744F'];
const HB_SHIRT_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444', '#6366F1', '#64748B'];

// Eight quirks — flavors roughly a third of his lines (HB_QUIRK_LINES below).
// The coffee-machine feud is canon: it's the same coffee machine referenced
// in the quit note, whether or not this particular trucker has the quirk.
const HB_QUIRKS = {
  ohio: 'Has an unexplained grudge against the entire state of Ohio.',
  weigh: 'Convinced every weigh station is part of a bigger conspiracy.',
  haunted: 'Fully convinced his rig is haunted. Friendly ghost, he insists.',
  amarillo: 'Will not stop talking about a diner in Amarillo.',
  sunset: 'Rates every sunset out of ten. Very few tens.',
  coffeefeud: 'In a long, bitter feud with the break room coffee machine.',
  nap: 'Believes he is one good nap away from a world record.',
  weather: 'Self-appointed meteorologist. Consistently, confidently wrong.',
};
const HB_QUIRK_IDS = Object.keys(HB_QUIRKS);

// ---- the dialogue bank — ~134 lines across mood + quirk + action pools.
// Deadpan CB-radio delivery, warm underneath, never needy. Picked at random
// per moment so nothing repeats predictably. ----
const HB_LINES = {
  thriving: [
    "Sunset tonight was a 9.4. I don't hand those out.",
    'I have never felt more alive. Or more caffeinated. Possibly the same thing.',
    "Told the GPS 'recalculating' back today. It did not appreciate that.",
    'Best. Day. Of my career. Second best, technically. First was a Tuesday in March.',
    'I did a little dance at the fuel pump. No, I will not do it again on request.',
    'The open road and I are, once again, on speaking terms.',
    "I've decided today is a Hallmark-movie kind of day. No notes.",
    'Somebody give this man a parade. That somebody is me. I am the somebody.',
    'Cruise control, clear skies, and a full thermos. I am basically a king.',
    'I waved at a trucker going the other way and they waved BACK. Made my whole week.',
    'The mirrors are clean, the coffee is hot, and my heart is FULL.',
    'Living my best life at sixty-two miles an hour, thank you for asking.',
    'I passed a hundred billboards today and every single one felt like a compliment.',
    "Today I'm unbothered, un-caffeinated-anxious, and unashamed of my snack choices.",
    'The audacity of this beautiful morning. I love it here.',
    'I gave a truck stop biscuit a standing ovation. It deserved it.',
    'Somebody roll out the red carpet — I parked PERFECTLY on the first try.',
    "I am thriving. Emotionally. Financially, we don't ask. But emotionally? Thriving.",
  ],
  content: [
    "Hit traffic on I-40. Don't wanna talk about it.",
    "Ate a gas station burrito. It was fine. We don't need to make it a whole thing.",
    "CB's been quiet today. Kind of nice, kind of eerie.",
    'Logged some miles, saw a hawk, called it even.',
    "Nothing dramatic to report. I know, I'm as surprised as you.",
    'Rolled through three states before lunch. Very normal Tuesday behavior.',
    "The weigh station waved me through. We're not friends, but we're cordial.",
    "Coffee's decent today. The machine and I have a truce. For now.",
    'Saw a deer. It saw me. We had a moment. Then it left.',
    "Doing fine. Not thriving, not dying. Just... trucking along. Ha. Get it.",
    "Radio's playing something I've heard four hundred times. It still slaps.",
    'Parked, stretched, cracked my back in at least two new places. Fine.',
    'Somebody let their dog out the window at a rest stop. Best five minutes of my day.',
    "Got a decent lane, a full tank, and zero complaints. Suspicious, honestly.",
    'Ordinary day. Wheels turned, bills got paid, nobody yelled at me. A win.',
    'I let a merge happen without honking. Growth.',
    'Cruised past mile marker two hundred and felt a small, private accomplishment.',
    'Not much to report. The road was road-shaped and I drove on it.',
  ],
  grumpy: [
    'Oh, NOW you show up. ...Fine. Pour the coffee.',
    "I've been sitting here composing a strongly worded letter to nobody in particular.",
    "This is not a tear. It's diesel fumes. I don't even know why I'm defending myself to you.",
    "You know what would've been nice? A visit yesterday. Just saying.",
    'I ate a gas station egg salad. By CHOICE. Think about what that says about my state of mind.',
    "The coffee machine and I are fighting again. It started it. It's always the machine.",
    'I have SO many notes for you. So. Many. Notes.',
    "Don't 'hey buddy' me. I've been here. Alone. With my thoughts.",
    "I rehearsed being mad at you and now you're here and I've forgotten all of it. Infuriating.",
    'Somebody left me on read. The somebody was you. The read was several days long.',
    "I'm not sulking, I'm 'reflecting.' There's a difference. Barely.",
    'The bunk and I have gotten VERY well acquainted lately. Too well acquainted.',
    "I've started narrating my own life out loud. It's not going great, narratively.",
    'Nothing personal. Everything personal, actually. But go on, act surprised.',
    'This diesel-fume situation on my face has been happening a lot this week.',
    'You missed the sunset. It was a 9.2. I forgive you. Mostly.',
  ],
  fedup: [
    'The AUDACITY. I have been here. Alone. With a cold thermos and my regrets.',
    'I ate a gas-station egg salad AGAIN. This is a cry for help and also lunch.',
    "The coffee machine won. I'm saying it out loud. It finally won.",
    "I've composed, in my head, a full one-act play about being ignored. Reviews are strong.",
    "I'd like to file a formal complaint. With whom, I don't know. Just, generally.",
    "I've named the dashboard ornament my new best friend. He listens. Unlike SOME people.",
    "Don't touch the thermos. It's cold. It's been cold. It's basically a metaphor now.",
    "I'm not mad. I'm past mad. I've built a small emotional truck stop out here.",
    'Three days. THREE. I counted. I had time to count.',
    'The ghost in my cab is more present in my life right now than you are. No offense to the ghost.',
    'I rated a sunset a two out of ten yesterday. TWO. That is how bad it has gotten.',
    "I've started talking to the steering wheel. It has better listening skills, frankly.",
    "This isn't a tear, it's diesel fumes, and also I'm reconsidering my options.",
    "I wrote your name on a sticky note. It just says 'WHERE.' That's the whole note.",
    "The bunk has never seen so much of me. We're basically roommates now.",
    'I am one bad Tuesday away from a very dramatic exit. Just so you know.',
  ],
  action: {
    coffee: [
      'Ahhh. Yes. THAT is the stuff.',
      'Be honest — did you warm it up just right? Because it is perfect.',
      "This is, and I don't say this lightly, a truly excellent cup of coffee.",
      'I felt that in my SOUL.',
      "Okay. Okay okay okay. I'm back. I'm a person again.",
      'The coffee machine is going to hear about how good THIS was.',
    ],
    rest: [
      'Finally. My back has been asking about you.',
      '*dramatic sigh* ...Wake me when it is Tuesday. Or do not. I am flexible.',
      'This bunk understands me on a spiritual level.',
      'Five minutes. Ten, tops. ...Okay, maybe longer.',
      'I was NOT tired. I am, however, extremely comfortable now.',
      "Do not tell the coffee machine I napped. It'll never let me hear the end of it.",
    ],
    cb: [
      "Breaker breaker, it's you! I was starting to think you forgot the frequency.",
      'Ten-four, good buddy. Still the best sentence in the English language.',
      'You caught me mid-thought. Doesn’t matter. I’ll say it anyway.',
      "The CB's been quiet all week. This is the highlight of my week. Don't tell anyone.",
      'Copy that. Also — how ARE you? Genuinely. I have missed the chatter.',
      'Static is bad today but I heard every word. Every single one.',
    ],
  },
};

// Quirk lines — six per quirk, mixed in with the mood pool on ambient
// chatter and portrait taps so each trucker develops his own running bit.
const HB_QUIRK_LINES = {
  ohio: [
    'Drove past a WELCOME TO OHIO sign and did not wave back.',
    "I don't have a reason. I just know in my bones. Ohio knows what it did.",
    "Someone said 'Ohio's actually nice' and I had to leave the room. Metaphorically. I was already driving.",
    'Every rest stop in Ohio has personally wronged me. Every single one.',
    "I've never been able to explain the Ohio thing. I've stopped trying.",
    "If the load's going through Ohio, I need a moment first. Just a moment.",
  ],
  weigh: [
    'That weigh station has a LOOK in its eye. You don’t see it. I see it.',
    "I believe, deeply, that the scales are in on something. I won't elaborate.",
    'Passed a scale house today. It was closed. SUSPICIOUS. Very suspicious.',
    "I keep a mental file on every weigh station I've ever met. It's a thick file.",
    "They said 'it's just a scale.' That is exactly what they WANT you to think.",
    'I nodded politely at the inspector and made a note of everything. Everything.',
  ],
  haunted: [
    "The dome light flickered again. My guy's just saying hi. Friendly ghost. Chill vibes.",
    'Something moved the air freshener overnight. Rude, but not malicious. I respect the hustle.',
    "I've named him Gary. Gary the ghost. We're on good terms, mostly.",
    'Gary knocked twice on the door panel this morning. That means good weather, probably.',
    "People say it's 'just the truck settling.' People have clearly never met Gary.",
    'Gary does not love it when I play country music. Gary has taste, actually.',
  ],
  amarillo: [
    "There's a diner in Amarillo. I'm not going to describe the pie again. I am absolutely going to describe the pie.",
    'I measure all diners against The Diner in Amarillo. None of them measure up. None.',
    'I had a dream about the Amarillo pie last night. I woke up disappointed it was not real.',
    'If the route ever runs through Amarillo again, I am not saying I will cry, but I am not NOT saying that.',
    "The waitress in Amarillo remembers my order. That is basically a relationship at this point.",
    'I brought up the Amarillo diner unprompted again today. I have no plans to stop.',
  ],
  sunset: [
    "Tonight's sunset: 7.8. Strong color work, weak follow-through on the clouds.",
    "That was a career-best sunset. I'm calling my mother about it. I don't call my mother about much.",
    'Rated a sunset a three today. It phoned it in. We all know it phoned it in.',
    'I keep a running list of top-ten sunsets. This one did not make the cut. Brutal, but fair.',
    'Gave last night’s sunset a perfect ten. I do not do that lightly. Ask anyone. There is no one to ask.',
    'The sunset owes me an apology. It knows what it did with that gray patch on the left.',
  ],
  coffeefeud: [
    'The coffee machine spat lukewarm water at me again. This is personal now.',
    "I've stopped speaking to the coffee machine directly. We communicate through the thermos.",
    "It's not about the coffee anymore. It's about respect. The machine has none.",
    "I caught the coffee machine 'malfunctioning' right as I walked up. Sure. Coincidence.",
    'One day that machine and I are going to have it out. Today is not that day. But one day.',
    'The coffee machine and I called a temporary truce for the holidays. It will not last.',
  ],
  nap: [
    'I clocked eleven straight minutes in the bunk today. Personal best. Somebody alert someone.',
    'I believe, in my heart, that there is a nap record out there with my name on it.',
    'Woke up mid-nap convinced I had broken the record. I had not. Devastating.',
    'The bunk and I are training. This is training. This is very serious training.',
    'If napping were an Olympic sport I would already have a garage full of medals.',
    'I closed my eyes for what I believe was a world-class nap. No judges were present. Tragic oversight.',
  ],
  weather: [
    'My professional forecast: partly cloudy, chance of me being completely wrong.',
    'I predicted sun. It is currently sleeting. My credentials remain, somehow, unquestioned.',
    'As your unofficial meteorologist, I am calling for clear skies. Please do not hold me to this.',
    'I felt a change in the wind and declared a storm. There was no storm. I stand by the feeling.',
    'My forecast accuracy is roughly the same as a coin flip, and I am proud of that number.',
    'Radar shows nothing. My knee shows everything. I trust the knee.',
  ],
};

// Flavor text — separate from the main dialogue bank above.
const HB_QUIT_NOTES = [
  "I QUIT. Keys under the mat. Tell the coffee machine I said things I can't take back. — {name}",
  "Gone. Took the good thermos. Don't look for me in Ohio. — {name}",
  'This isn’t goodbye, it’s "see you at the next terminal." Mostly it’s goodbye. — {name}',
  'I left. The bunk and I needed space from you specifically. — {name}',
  'Quitting to pursue my nap career full time. No hard feelings. Some hard feelings. — {name}',
];
const HB_DEPARTURE_REASONS = [
  'Left to pursue competitive cornhole.',
  'Now a podcast guy.',
  'Went to find that diner in Amarillo. Godspeed.',
  'Retired undefeated in a feud with a coffee machine.',
  'Took a job as a professional napper. Reportedly thriving.',
  'Moved to Ohio, of all places, out of pure spite.',
  'Became a full-time weigh-station conspiracy blogger.',
  'Last seen rating a sunset a perfect ten and walking into it.',
  'Opened a diner. Rumor has it the pie is "fine."',
  'Took the ghost with him. Good for the ghost.',
  'Started a country music cover band called The Static.',
  'Now does weather for a local station. Accuracy unconfirmed.',
  'Left a single sticky note and several unresolved feelings.',
  'Currently attempting the world nap record. Unofficially. Personally.',
  'Simply vanished. The bunk was still warm.',
];
const HB_HIRE_INTROS = [
  'New guy reporting for duty. Try not to lose me.',
  "Heard the last guy had... a lot to say. I'm chill. Probably.",
  'First day nerves? Me? Never. (Yes.)',
  "Let's get one thing straight: I already have opinions about sunsets.",
  'Fresh face, same thermos energy. Let’s ride.',
  'New driver, new rig energy, unresolved feelings about Ohio pending.',
];

const HB_PATCHES = [
  { id: 'first-haul', miles: 1000, label: 'First Long Haul' },
  { id: 'road-regular', miles: 5000, label: 'Road Regular' },
  { id: 'gold-steer', miles: 10000, label: 'Gold Steer' },
  { id: 'million-cup', miles: 25000, label: 'Million-Cup Club' },
];

const HB_MOOD_META = {
  thriving: { label: 'Thriving', tone: 'emerald' },
  content: { label: 'Content', tone: 'blue' },
  grumpy: { label: 'Grumpy', tone: 'warn' },
  fedup: { label: 'Fed Up', tone: 'red' },
  gone: { label: 'Gone', tone: 'slate' },
};

function hbRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateTrucker(now = Date.now()) {
  return {
    v: 1,
    first: hbRandom(HB_FIRST_NAMES),
    handle: hbRandom(HB_HANDLES),
    last: hbRandom(HB_SURNAMES),
    quirk: hbRandom(HB_QUIRK_IDS),
    look: {
      skin: hbRandom(HB_SKIN_TONES),
      headwear: hbRandom(['none', 'cap', 'beanie']),
      beard: hbRandom(['none', 'stubble', 'full']),
      shirt: hbRandom(HB_SHIRT_COLORS),
    },
    hiredAt: now,
    needs: { coffee: now, rest: now, company: now },
    miles: 0,
    patches: [],
    lastMilesDate: null,
    archived: false,
  };
}

// Auto-hires on first-ever visit (nothing to show otherwise) — mirrors the
// rest of the Break Room's local-first load pattern (loadNightRunScores,
// loadFFState, etc).
function loadHBState() {
  try {
    const raw = JSON.parse(localStorage.getItem(uidKey(HB_STATE_KEY)) || 'null');
    if (raw && raw.needs && raw.first) return raw;
  } catch (_) { /* fall through to a fresh hire */ }
  const fresh = generateTrucker();
  try { localStorage.setItem(uidKey(HB_STATE_KEY), JSON.stringify(fresh)); } catch (_) {}
  return fresh;
}
function saveHBState(state) {
  try { localStorage.setItem(uidKey(HB_STATE_KEY), JSON.stringify(state)); } catch (_) {}
}
function loadHBWall() {
  try {
    const raw = JSON.parse(localStorage.getItem(uidKey(HB_WALL_KEY)) || '[]');
    if (Array.isArray(raw)) return raw;
  } catch (_) {}
  return [];
}
function saveHBWall(list) {
  try { localStorage.setItem(uidKey(HB_WALL_KEY), JSON.stringify(list.slice(0, 30))); } catch (_) {}
}

// Clock-safe elapsed hours: a missing/garbage timestamp reads as "just
// cared for" (never insta-quits anyone), and a clock running backwards
// clamps to 0 instead of going negative.
function hbHoursSince(ts, now) {
  if (!ts || !Number.isFinite(ts)) return 0;
  const diff = now - ts;
  return diff > 0 ? diff / 3600000 : 0;
}
function hbNeedLevel(ts, now) {
  const h = hbHoursSince(ts, now);
  return Math.max(0, Math.min(100, 100 - (h / HB_NEED_DECAY_HOURS) * 100));
}

// The whole game's rules in one pure function — fed a state object + "now",
// returns need levels and the mood bucket. Shared by the page, the hub
// teaser, and the dashboard peek so mood logic can never drift between the
// three places that read it.
function computeHBDerived(state, now = Date.now()) {
  const n = state.needs || {};
  const levels = {
    coffee: hbNeedLevel(n.coffee, now),
    rest: hbNeedLevel(n.rest, now),
    company: hbNeedLevel(n.company, now),
  };
  const oldest = Math.min(n.coffee || now, n.rest || now, n.company || now);
  const hoursSinceCare = hbHoursSince(oldest, now);
  const avgLevel = (levels.coffee + levels.rest + levels.company) / 3;
  let mood;
  if (hoursSinceCare > HB_GONE_AFTER_H) mood = 'gone';
  else if (hoursSinceCare > HB_FEDUP_AFTER_H) mood = 'fedup';
  else if (hoursSinceCare > HB_GRUMPY_AFTER_H) mood = 'grumpy';
  else mood = avgLevel >= 65 ? 'thriving' : 'content';
  return { levels, avgLevel, hoursSinceCare, mood };
}

function useHBReducedMotion() {
  const [reduce, setReduce] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
  });
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (_) { return; }
    const onChange = () => setReduce(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange); };
  }, []);
  return reduce;
}

// Extra keyframes for Haul Buddy's micro-animations — a second small style
// tag, injected alongside PROFIT_GLOW_CSS (see the App() render). Kept
// separate so this whole feature stays easy to find/lift as one block.
const HAULBUDDY_CSS = `
@keyframes fmHbGasp{0%{transform:scale(1)}30%{transform:scale(1.12)}100%{transform:scale(1)}}
.fm-hb-gasp{animation:fmHbGasp .35s ease-out}
@keyframes fmHbTear{0%{opacity:0;transform:translateY(0)}15%{opacity:.9}100%{opacity:0;transform:translateY(14px)}}
.fm-hb-tear{animation:fmHbTear 2.6s ease-in infinite}
@keyframes fmHbSteam{0%{opacity:0;transform:translateY(0)}30%{opacity:.8}100%{opacity:0;transform:translateY(-10px)}}
.fm-hb-steam{animation:fmHbSteam 1.8s ease-out infinite}
@keyframes fmHbBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.fm-hb-bob{animation:fmHbBob 3.4s ease-in-out infinite}
@keyframes fmHbWalk{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-3px) rotate(-2deg)}75%{transform:translateY(-3px) rotate(2deg)}}
.fm-hb-walk{animation:fmHbWalk .5s ease-in-out infinite}
@keyframes fmHbWalkStrut{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-5px) rotate(-4deg)}75%{transform:translateY(-5px) rotate(4deg)}}
.fm-hb-strut{animation:fmHbWalkStrut .4s ease-in-out infinite}
@keyframes fmHbPace{0%,100%{transform:translateX(0)}50%{transform:translateX(7px)}}
.fm-hb-pace{animation:fmHbPace 1.6s ease-in-out infinite}
@keyframes fmHbMachineSteam{0%,60%,100%{opacity:0;transform:translateY(0) scale(.6)}75%{opacity:.8;transform:translateY(-6px) scale(1)}90%{opacity:0;transform:translateY(-14px) scale(1.1)}}
.fm-hb-machine-steam{animation:fmHbMachineSteam 6s ease-in-out infinite}
@keyframes fmHbTumbleweed{0%{left:-8%;transform:rotate(0deg)}100%{left:108%;transform:rotate(520deg)}}
.fm-hb-tumbleweed{animation:fmHbTumbleweed 10s linear infinite}
@keyframes fmHbZFloat{0%{opacity:0;transform:translate(0,0) scale(.7)}30%{opacity:1}100%{opacity:0;transform:translate(6px,-16px) scale(1.1)}}
.fm-hb-z{animation:fmHbZFloat 2.2s ease-out infinite}
@keyframes fmHbWipe{0%,100%{transform:rotate(-58deg)}50%{transform:rotate(-84deg)}}
.fm-hb-wipe{animation:fmHbWipe 1s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.fm-hb-gasp,.fm-hb-tear,.fm-hb-steam,.fm-hb-bob,.fm-hb-walk,.fm-hb-strut,.fm-hb-pace,.fm-hb-machine-steam,.fm-hb-tumbleweed,.fm-hb-z,.fm-hb-wipe{animation:none}}`;

// A small, parameterized, expressive trucker — pure SVG primitives (circles,
// rects, path arcs), no image assets. Reused at several sizes: the diorama
// (small), the hub teaser snapshot, and the hiring-board preview.
function TruckerSVG({ look, mood, pose = 'idle', size = 66, className = '' }) {
  const reduce = useHBReducedMotion();
  const face = pose === 'gasp' ? 'gasp' : pose === 'sleep' ? 'sleep' : mood;
  const cx = 80, cy = 74;

  const eyes = (() => {
    if (face === 'gasp') return (
      <React.Fragment>
        <circle cx={cx - 15} cy={cy - 4} r="7.5" fill="#1c1917" />
        <circle cx={cx + 15} cy={cy - 4} r="7.5" fill="#1c1917" />
        <circle cx={cx - 17} cy={cy - 7} r="2" fill="#fff" />
        <circle cx={cx + 13} cy={cy - 7} r="2" fill="#fff" />
      </React.Fragment>
    );
    if (face === 'sleep') return (
      <React.Fragment>
        <path d={`M ${cx - 20} ${cy - 4} Q ${cx - 15} ${cy - 1} ${cx - 10} ${cy - 4}`} stroke="#1c1917" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <path d={`M ${cx + 10} ${cy - 4} Q ${cx + 15} ${cy - 1} ${cx + 20} ${cy - 4}`} stroke="#1c1917" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      </React.Fragment>
    );
    if (face === 'thriving') return (
      <React.Fragment>
        <path d={`M ${cx - 21} ${cy - 4} Q ${cx - 15} ${cy - 12} ${cx - 9} ${cy - 4}`} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d={`M ${cx + 9} ${cy - 4} Q ${cx + 15} ${cy - 12} ${cx + 21} ${cy - 4}`} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" fill="none" />
      </React.Fragment>
    );
    if (face === 'grumpy') return (
      <React.Fragment>
        <line x1={cx - 20} y1={cy - 8} x2={cx - 9} y2={cy - 2} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" />
        <line x1={cx + 20} y1={cy - 8} x2={cx + 9} y2={cy - 2} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" />
      </React.Fragment>
    );
    if (face === 'fedup') return (
      <React.Fragment>
        <path d={`M ${cx - 20} ${cy - 3} Q ${cx - 15} ${cy - 8} ${cx - 9} ${cy - 3}`} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d={`M ${cx + 9} ${cy - 3} Q ${cx + 15} ${cy - 8} ${cx + 21} ${cy - 3}`} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" fill="none" />
      </React.Fragment>
    );
    return (
      <React.Fragment>
        <circle cx={cx - 15} cy={cy - 4} r="3.4" fill="#1c1917" />
        <circle cx={cx + 15} cy={cy - 4} r="3.4" fill="#1c1917" />
      </React.Fragment>
    );
  })();

  const mouth = (() => {
    if (face === 'gasp') return <ellipse cx={cx} cy={cy + 20} rx="6" ry="8" fill="#7c2d12" />;
    if (face === 'sleep') return <path d={`M ${cx - 7} ${cy + 18} Q ${cx} ${cy + 21} ${cx + 7} ${cy + 18}`} stroke="#1c1917" strokeWidth="2.6" strokeLinecap="round" fill="none" />;
    if (face === 'thriving') return <path d={`M ${cx - 16} ${cy + 15} Q ${cx} ${cy + 30} ${cx + 16} ${cy + 15} Q ${cx} ${cy + 24} ${cx - 16} ${cy + 15} Z`} fill="#7c2d12" />;
    if (face === 'grumpy') return <path d={`M ${cx - 12} ${cy + 22} Q ${cx} ${cy + 16} ${cx + 12} ${cy + 22}`} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" fill="none" />;
    if (face === 'fedup') return <path d={`M ${cx - 13} ${cy + 24} Q ${cx} ${cy + 14} ${cx + 13} ${cy + 24}`} stroke="#1c1917" strokeWidth="3.4" strokeLinecap="round" fill="none" />;
    return <path d={`M ${cx - 11} ${cy + 17} Q ${cx} ${cy + 23} ${cx + 11} ${cy + 17}`} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" fill="none" />;
  })();

  const brows = (pose !== 'sleep' && pose !== 'gasp' && (mood === 'grumpy' || mood === 'fedup')) ? (
    <React.Fragment>
      <line x1={cx - 23} y1={cy - 16} x2={cx - 8} y2={cy - 11} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" />
      <line x1={cx + 23} y1={cy - 16} x2={cx + 8} y2={cy - 11} stroke="#1c1917" strokeWidth="3" strokeLinecap="round" />
    </React.Fragment>
  ) : null;

  // Arm angles per pose — a small vocabulary reused across every activity:
  // idle/gasp (existing), plus cross (grumpy, arms folded), sip (coffee),
  // radio (CB), reach (leaning for the cones), sleep (tucked in), and wipe
  // (thriving polishing the rig — driven entirely by the fm-hb-wipe
  // keyframe on the right arm so the motion loops on its own).
  const armT = (side) => {
    if (pose === 'sleep') return { transform: side === 'r' ? 'rotate(-100deg)' : 'rotate(80deg)', transformOrigin: side === 'r' ? '112px 122px' : '48px 122px' };
    if (pose === 'cross') return { transform: side === 'r' ? 'rotate(-110deg)' : 'rotate(110deg)', transformOrigin: side === 'r' ? '112px 122px' : '48px 122px' };
    if (pose === 'sip' && side === 'r') return { transform: 'rotate(-150deg)', transformOrigin: '112px 122px' };
    if (pose === 'radio' && side === 'r') return { transform: 'rotate(-160deg)', transformOrigin: '112px 122px' };
    if (pose === 'reach') return { transform: side === 'r' ? 'rotate(-30deg)' : 'rotate(30deg)', transformOrigin: side === 'r' ? '112px 122px' : '48px 122px' };
    if (pose === 'wipe') return { transform: side === 'r' ? 'rotate(-70deg)' : 'rotate(4deg)', transformOrigin: side === 'r' ? '112px 122px' : '48px 122px' };
    if (pose === 'gasp') return { transform: side === 'r' ? 'rotate(-55deg)' : 'rotate(55deg)', transformOrigin: side === 'r' ? '112px 122px' : '48px 122px' };
    return { transform: 'rotate(4deg)', transformOrigin: side === 'r' ? '112px 122px' : '48px 122px' };
  };
  const armStyle = (side) => {
    const wipeAnim = pose === 'wipe' && side === 'r' && !reduce;
    if (wipeAnim) return { transformOrigin: '112px 122px' }; // transform fully owned by the fm-hb-wipe keyframe
    return { ...armT(side), transition: reduce ? 'none' : 'transform .45s cubic-bezier(.34,1.56,.64,1)' };
  };
  const headTilt = (() => {
    if (pose === 'sleep') return { transform: 'rotate(8deg) translate(2px,3px)', transformOrigin: `${cx}px ${cy}px`, transition: reduce ? 'none' : 'transform .4s ease-out' };
    if (pose === 'reach') return { transform: 'rotate(14deg) translate(0,4px)', transformOrigin: `${cx}px ${cy}px`, transition: reduce ? 'none' : 'transform .3s ease-out' };
    return { transform: 'rotate(0deg)', transformOrigin: `${cx}px ${cy}px`, transition: reduce ? 'none' : 'transform .3s ease-out' };
  })();

  return (
    <svg viewBox="0 0 160 210" width={size} height={Math.round(size * 210 / 160)} className={className} role="img" aria-label={`${mood} trucker`}>
      <rect x="46" y="112" width="68" height="72" rx="20" fill={look.shirt} />
      <rect x="32" y="118" width="18" height="56" rx="9" fill={look.skin} style={armStyle('l')} />
      <rect x="110" y="118" width="18" height="56" rx="9" fill={look.skin} style={armStyle('r')} className={pose === 'wipe' && !reduce ? 'fm-hb-wipe' : ''} />
      <g style={headTilt} className={pose === 'gasp' && !reduce ? 'fm-hb-gasp' : ''}>
        <circle cx={cx - 36} cy={cy + 2} r="7" fill={look.skin} />
        <circle cx={cx + 36} cy={cy + 2} r="7" fill={look.skin} />
        <circle cx={cx} cy={cy} r="38" fill={look.skin} />
        {look.beard === 'full' && <path d={`M ${cx - 26} ${cy + 10} Q ${cx} ${cy + 42} ${cx + 26} ${cy + 10} L ${cx + 22} ${cy + 2} Q ${cx} ${cy + 18} ${cx - 22} ${cy + 2} Z`} fill="#5b4636" />}
        {look.beard === 'stubble' && <ellipse cx={cx} cy={cy + 22} rx="22" ry="12" fill="#3f2f22" opacity="0.22" />}
        {brows}
        {eyes}
        {mouth}
        {pose !== 'sleep' && mood === 'grumpy' && (
          <ellipse cx={cx + 19} cy={cy + 2} rx="2.6" ry="4.6" fill="#5aa2ff" opacity="0.85" className={reduce ? '' : 'fm-hb-tear'} />
        )}
        {pose !== 'sleep' && mood === 'fedup' && !reduce && (
          <React.Fragment>
            <path d={`M ${cx - 30} ${cy - 34} q 5 -8 0 -16`} stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" fill="none" className="fm-hb-steam" style={{ animationDelay: '0s' }} />
            <path d={`M ${cx + 30} ${cy - 34} q -5 -8 0 -16`} stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" fill="none" className="fm-hb-steam" style={{ animationDelay: '.6s' }} />
          </React.Fragment>
        )}
        {look.headwear === 'cap' && (
          <React.Fragment>
            <path d={`M ${cx - 30} ${cy - 22} A 30 30 0 0 1 ${cx + 30} ${cy - 22} L ${cx + 30} ${cy - 30} L ${cx - 30} ${cy - 30} Z`} fill={look.shirt} fillOpacity="0.9" />
            <ellipse cx={cx + 14} cy={cy - 24} rx="16" ry="6" fill={look.shirt} fillOpacity="0.9" />
          </React.Fragment>
        )}
        {look.headwear === 'beanie' && (
          <React.Fragment>
            <path d={`M ${cx - 32} ${cy - 14} A 32 30 0 0 1 ${cx + 32} ${cy - 14} Z`} fill={look.shirt} fillOpacity="0.9" />
            <rect x={cx - 32} y={cy - 16} width="64" height="9" rx="4" fill={look.shirt} />
          </React.Fragment>
        )}
      </g>
    </svg>
  );
}

// ---- Diorama layout — a small side-view truck-stop yard. Stations sit at
// fixed percent-of-width positions; only the trucker moves. ----
const HB_STATION_X = { rig: 12, coffee: 40, cb: 65, cones: 89 };
const HB_WALK_MS = 1500;          // position transition + walk-bob duration
const HB_ACTIVITY_MIN_MS = 4000;  // how long he idles before picking a new spot
const HB_ACTIVITY_MAX_MS = 10000;
const HB_BUBBLE_MIN_MS = 15000;   // ambient thought-bubble cadence
const HB_BUBBLE_MAX_MS = 30000;

const HB_CONE_LINES = [
  'These cones were in the WRONG order. Fixed.',
  "A little feng shui for the yard. You're welcome.",
  'This one goes here now. Trust the process.',
  "I've rearranged these cones eleven times today. Eleven.",
  'Structural integrity: much improved.',
  'Nobody asked me to do this. I did it anyway.',
];

// Weighted pick, biased toward whichever need is lowest, with a strong
// penalty against repeating the station he's already at (so wandering
// actually reads as wandering). Purely cosmetic — visiting a station on
// his own never touches a need; only a tap does that (see HaulBuddyPage).
function hbPickNextStation(derived, current) {
  const weights = {
    rig: 1 + (100 - derived.levels.rest) / 40,
    coffee: 1 + (100 - derived.levels.coffee) / 40,
    cb: 1 + (100 - derived.levels.company) / 40,
    cones: 0.6,
  };
  if (current && weights[current] != null) weights[current] *= 0.35;
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) { r -= w; if (r <= 0) return key; }
  return entries[entries.length - 1][0];
}

// Unobtrusive corner readout — icon + a sliver of a bar, not a dominant UI
// element. Three of these stack in the diorama's top-left corner.
function HBNeedChip({ icon, value }) {
  const pct = Math.round(value);
  const tone = pct >= 60 ? 'bg-emerald-500' : pct >= 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1 bg-slate-950/60 backdrop-blur-sm rounded-full pl-1.5 pr-2 py-1">
      <span className="text-slate-400">{icon}</span>
      <span className="w-6 h-1 rounded-full bg-slate-700 overflow-hidden inline-block">
        <span className={`block h-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function HBPatchBoard({ patches }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {HB_PATCHES.map((p) => {
        const earned = patches.includes(p.id);
        return (
          <div key={p.id} title={earned ? p.label : `${p.label} — at ${p.miles.toLocaleString()} mi`}
            className={`aspect-square rounded-md border flex flex-col items-center justify-center gap-1 ${earned ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-800 bg-slate-900/40 opacity-50'}`}>
            <Award size={16} className={earned ? 'text-amber-400' : 'text-slate-600'} />
            <span className={`text-[8px] uppercase tracking-wide text-center leading-tight px-1 ${earned ? 'text-amber-300' : 'text-slate-600'}`}>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Full-bleed theme-reactive sky behind the whole yard — night stars under
// Night Haul, a bright day under Classic. Pure SVG, no assets.
function HaulBuddySky({ theme }) {
  const night = theme !== 'classic';
  return (
    <svg viewBox="0 0 400 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="0" width="400" height="100" fill={night ? '#14110c' : '#bae6fd'} />
      {night ? (
        <React.Fragment>
          <circle cx="335" cy="22" r="16" fill="#fde68a" />
          <circle cx="60" cy="18" r="1.6" fill="#fff" opacity=".8" />
          <circle cx="120" cy="34" r="1.3" fill="#fff" opacity=".6" />
          <circle cx="180" cy="14" r="1.5" fill="#fff" opacity=".7" />
          <circle cx="240" cy="40" r="1.3" fill="#fff" opacity=".5" />
          <circle cx="30" cy="46" r="1.4" fill="#fff" opacity=".6" />
          <circle cx="280" cy="16" r="1.2" fill="#fff" opacity=".55" />
        </React.Fragment>
      ) : (
        <React.Fragment>
          <circle cx="60" cy="22" r="17" fill="#fde68a" />
          <ellipse cx="260" cy="30" rx="34" ry="12" fill="#fff" opacity=".85" />
          <ellipse cx="335" cy="20" rx="24" ry="9" fill="#fff" opacity=".7" />
        </React.Fragment>
      )}
    </svg>
  );
}

// His rig — where he sleeps. Windshield dims while he's resting; a sticky
// note (short, symbolic — the full text lives in the Card below the scene)
// appears in the empty-yard state.
function HBRigStation({ sleeping, gone, noteText }) {
  return (
    <div className="relative" style={{ width: 74, height: 64 }}>
      <svg viewBox="0 0 74 64" width="74" height="64">
        <rect x="0" y="18" width="74" height="30" rx="3" fill="#334155" />
        <rect x="4" y="4" width="30" height="44" rx="4" fill="#475569" />
        <rect x="8" y="10" width="20" height="16" rx="2" fill={sleeping ? '#1e293b' : '#7dd3fc'} opacity={sleeping ? 0.5 : 0.85} style={{ transition: 'fill .4s ease, opacity .4s ease' }} />
        <circle cx="16" cy="52" r="8" fill="#0f172a" stroke="#475569" strokeWidth="2" />
        <circle cx="56" cy="52" r="8" fill="#0f172a" stroke="#475569" strokeWidth="2" />
      </svg>
      {sleeping && !gone && (
        <React.Fragment>
          <span className="absolute -top-1 left-3 text-[10px] font-bold text-blue-200 fm-hb-z" aria-hidden="true">Z</span>
          <span className="absolute -top-3 left-7 text-[12px] font-bold text-blue-200 fm-hb-z" style={{ animationDelay: '.5s' }} aria-hidden="true">Z</span>
        </React.Fragment>
      )}
      {gone && noteText && (
        <div className="absolute top-2 left-3 w-7 h-6 bg-amber-200 rotate-6 shadow flex items-center justify-center text-[5px] font-bold text-slate-800 leading-none text-center px-0.5" aria-hidden="true">
          {noteText}
        </div>
      )}
    </div>
  );
}

// His nemesis. Taunts him with an occasional puff of steam on its own —
// a pure CSS infinite loop, no JS timer.
function HBCoffeeStation({ reduce }) {
  return (
    <div className="relative" style={{ width: 40, height: 54 }}>
      <svg viewBox="0 0 40 54" width="40" height="54">
        <rect x="2" y="20" width="36" height="30" rx="3" fill="#57534e" />
        <rect x="8" y="8" width="24" height="16" rx="2" fill="#78716c" />
        <rect x="14" y="2" width="4" height="8" fill="#44403c" />
        <circle cx="20" cy="30" r="4" fill="#292524" />
      </svg>
      {!reduce && (
        <svg className="absolute -top-3 left-1/2 -translate-x-1/2" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 14 q-2 -5 0 -8" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" fill="none" className="fm-hb-machine-steam" />
          <path d="M10 14 q2 -5 0 -8" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" fill="none" className="fm-hb-machine-steam" style={{ animationDelay: '2s' }} />
        </svg>
      )}
    </div>
  );
}

function HBCbStation() {
  return (
    <svg width="30" height="58" viewBox="0 0 30 58">
      <line x1="15" y1="10" x2="15" y2="50" stroke="#475569" strokeWidth="3" />
      <rect x="4" y="4" width="22" height="16" rx="2" fill="#334155" stroke="#475569" strokeWidth="1.5" />
      <line x1="26" y1="6" x2="30" y2="0" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="12" r="2" fill="#f59e0b" />
    </svg>
  );
}

// The flavor station — traffic cones he "rearranges." No need attached;
// purely for personality (see HB_CONE_LINES).
function HBConeStation() {
  return (
    <svg width="46" height="30" viewBox="0 0 46 30">
      <path d="M6 28 L12 8 L18 28 Z" fill="#f97316" />
      <rect x="4" y="26" width="16" height="3" fill="#c2410c" />
      <path d="M28 28 L33 12 L38 28 Z" fill="#f97316" />
      <rect x="26" y="26" width="14" height="3" fill="#c2410c" />
    </svg>
  );
}

function HaulBuddyWall({ wall }) {
  if (!wall.length) {
    return <p className="text-xs text-slate-500 text-center py-3">No former drivers yet — treat this one well.</p>;
  }
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {wall.map((w, i) => (
        <div key={i} className="flex items-start justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-200 truncate">{w.name} &quot;{w.handle}&quot; {w.last}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{w.tenureDays} day{w.tenureDays === 1 ? '' : 's'} on the job &middot; {(w.miles || 0).toLocaleString()} mi &middot; {w.patchCount} patch{w.patchCount === 1 ? '' : 'es'}</div>
            <div className="text-[11px] text-slate-400 mt-1 italic">{w.reason}</div>
          </div>
          <StickyNote size={14} className="text-slate-600 shrink-0 mt-0.5" />
        </div>
      ))}
    </div>
  );
}

// The living diorama itself. Sky + yard + four fixed stations; the trucker
// (or, once he's gone, a sticky note + tumbleweed) is the only thing that
// moves, and only via CSS transitions/keyframes — this component holds no
// timers of its own, it just renders whatever HaulBuddyPage's timers drive.
function HaulBuddyDiorama({ theme, reduceMotion, state, derived, activity, reaction, sleeping, forcedPose, onTapRig, onTapCoffee, onTapCB, onTapCones, onTapSelf }) {
  const gone = derived.mood === 'gone';

  const bobClass = (() => {
    if (activity.phase === 'walking') return derived.mood === 'thriving' ? 'fm-hb-strut' : 'fm-hb-walk';
    if (activity.phase === 'idle' && derived.mood === 'fedup') return 'fm-hb-pace';
    return reduceMotion ? '' : 'fm-hb-bob';
  })();

  const pose = forcedPose || (() => {
    if (sleeping) return 'sleep';
    if (activity.phase === 'walking') return 'idle';
    switch (activity.station) {
      case 'coffee': return 'sip';
      case 'cb': return 'radio';
      case 'cones': return 'reach';
      case 'rig': return derived.mood === 'grumpy' ? 'cross' : derived.mood === 'thriving' ? 'wipe' : 'idle';
      default: return 'idle';
    }
  })();

  return (
    <div className="relative h-48 sm:h-56 overflow-hidden select-none">
      <HaulBuddySky theme={theme} />
      <div className="absolute inset-x-0" style={{ bottom: '32%', borderTop: '1px dashed rgba(255,255,255,.14)' }} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0" style={{ height: '30%', background: 'linear-gradient(180deg, #2a2318, #191510)' }} aria-hidden="true" />

      {!gone && (
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
          <HBNeedChip icon={<Coffee size={10} />} value={derived.levels.coffee} />
          <HBNeedChip icon={<BedDouble size={10} />} value={derived.levels.rest} />
          <HBNeedChip icon={<Radio size={10} />} value={derived.levels.company} />
        </div>
      )}

      <button type="button" onClick={onTapRig} aria-label="His rig — tap to send him to the bunk"
        className="absolute bottom-1 p-1.5" style={{ left: `${HB_STATION_X.rig}%`, transform: 'translateX(-50%)' }}>
        <HBRigStation sleeping={!!sleeping} gone={gone} noteText="I QUIT" />
      </button>

      {!gone && (
        <React.Fragment>
          <button type="button" onClick={onTapCoffee} aria-label="Coffee counter — tap to pour him a cup"
            className="absolute bottom-1 p-1.5" style={{ left: `${HB_STATION_X.coffee}%`, transform: 'translateX(-50%)' }}>
            <HBCoffeeStation reduce={reduceMotion} />
          </button>
          <button type="button" onClick={onTapCB} aria-label="CB radio — tap to key up"
            className="absolute bottom-1 p-1.5" style={{ left: `${HB_STATION_X.cb}%`, transform: 'translateX(-50%)' }}>
            <HBCbStation />
          </button>
          <button type="button" onClick={onTapCones} aria-label="Traffic cones — tap to see what he does with them"
            className="absolute bottom-1 p-1.5" style={{ left: `${HB_STATION_X.cones}%`, transform: 'translateX(-50%)' }}>
            <HBConeStation />
          </button>
        </React.Fragment>
      )}

      {gone ? (
        <svg width="26" height="26" viewBox="0 0 26 26" className={`absolute bottom-2 ${reduceMotion ? '' : 'fm-hb-tumbleweed'}`} style={reduceMotion ? { left: '55%' } : undefined} aria-hidden="true">
          <circle cx="13" cy="13" r="10" fill="none" stroke="#a8763e" strokeWidth="2" />
          <circle cx="13" cy="13" r="6" fill="none" stroke="#a8763e" strokeWidth="1.4" />
          <path d="M13 3 L13 23 M3 13 L23 13 M6 6 L20 20 M20 6 L6 20" stroke="#a8763e" strokeWidth="1" />
        </svg>
      ) : (
        <div
          className="absolute bottom-1"
          style={{ left: `${activity.x}%`, transform: 'translateX(-50%)', transition: reduceMotion ? 'none' : `left ${HB_WALK_MS}ms ease-in-out` }}
        >
          {reaction && (
            <div key={reaction.key} className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-[190px] text-center bg-slate-100 text-slate-900 text-[11px] leading-snug font-medium px-3 py-2 rounded-lg shadow-lg fm-toast z-20">
              {reaction.text}
            </div>
          )}
          <div style={{ transform: `scaleX(${activity.facing})` }}>
            <div className={bobClass}>
              <button type="button" onClick={onTapSelf} aria-label={`${state.first} — tap for a word`} className="block">
                <TruckerSVG look={state.look} mood={derived.mood} pose={pose} size={66} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The comedy beat, trimmed to fit under the (now visual) empty diorama
// above: the readable note text + tenure summary, then the hiring board.
function HaulBuddyQuitNote({ state, onHire }) {
  const [noteIdx, setNoteIdx] = useState(0);
  const [showBoard, setShowBoard] = useState(false);
  const [candidate, setCandidate] = useState(() => ({ ...generateTrucker(), intro: hbRandom(HB_HIRE_INTROS) }));
  const note = HB_QUIT_NOTES[noteIdx % HB_QUIT_NOTES.length].replace('{name}', state.first);
  const tenureDays = Math.max(1, Math.round((Date.now() - state.hiredAt) / 86400000));
  const reroll = () => setCandidate({ ...generateTrucker(), intro: hbRandom(HB_HIRE_INTROS) });

  return (
    <div className="space-y-5">
      <Card className="p-6 text-center space-y-4">
        <div className="max-w-sm mx-auto bg-amber-100 text-slate-900 rounded-sm shadow-lg px-5 py-4 -rotate-1 text-sm leading-relaxed font-medium">
          {note}
        </div>
        <p className="text-xs text-slate-500">
          {state.first} &quot;{state.handle}&quot; {state.last} — {tenureDays} day{tenureDays === 1 ? '' : 's'}, {(state.miles || 0).toLocaleString()} mi, {state.patches.length} patch{state.patches.length === 1 ? '' : 'es'}.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <GhostButton onClick={() => setNoteIdx((i) => i + 1)}>Read the note again</GhostButton>
          <PrimaryButton onClick={() => setShowBoard(true)}>Check the hiring board</PrimaryButton>
        </div>
      </Card>

      {showBoard && (
        <Card className="p-5 sm:p-6">
          <PanelHeader icon={<Users size={18} />} title="Hiring Board" accent="amber" />
          <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
            <TruckerSVG look={candidate.look} mood="content" size={90} />
            <div className="flex-1 text-center sm:text-left min-w-0">
              <div className="font-bold text-white">{candidate.first} &quot;{candidate.handle}&quot; {candidate.last}</div>
              <div className="text-xs text-slate-400 mt-0.5">{HB_QUIRKS[candidate.quirk]}</div>
              <p className="text-sm text-slate-300 italic mt-2">&quot;{candidate.intro}&quot;</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <GhostButton onClick={reroll} className="flex-1">Meet someone else</GhostButton>
            <PrimaryButton onClick={() => onHire(candidate)} className="flex-1">Hire {candidate.first}</PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}

// The dedicated full page — his whole world. Mounted by BreakRoomView when
// its local sub-view state is 'haulbuddy'; "onBack" returns to the hub.
//
// TIMER INVENTORY (kept deliberately small, per the diorama brief):
//   - one self-rescheduling setTimeout drives the "next activity" decision
//     while idle (HB_ACTIVITY_MIN_MS–MAX_MS), OR
//   - one setTimeout resolves the current walk (HB_WALK_MS) — never both
//     at once, they're mutually exclusive by activity.phase.
//   - one self-rescheduling setTimeout drives ambient thought bubbles
//     (HB_BUBBLE_MIN_MS–MAX_MS).
//   - a handful of short, one-shot setTimeouts clear transient visual state
//     (a shown reaction, the sleeping overlay, a forced gasp pose) — all
//     pushed into timeoutsRef and swept on unmount.
// No setInterval, no per-frame loop — every bit of motion is a CSS
// transition or an `animation: … infinite` keyframe (walk bob, pacing
// wiggle, the coffee machine's taunt, the tumbleweed).
function HaulBuddyPage({ onBack }) {
  const [state, setState] = useState(() => loadHBState());
  const [wall, setWall] = useState(() => loadHBWall());
  const [reaction, setReaction] = useState(null);
  const [sleeping, setSleeping] = useState(false);
  const [forcedPose, setForcedPose] = useState(null);
  const [activity, setActivity] = useState(() => ({ station: 'rig', phase: 'idle', x: HB_STATION_X.rig, facing: 1, reason: 'auto' }));
  const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden));
  const [peekPref, setPeekPref] = useState(() => {
    try { return localStorage.getItem(uidKey(HB_PEEK_PREF_KEY)) !== 'off'; } catch (_) { return true; }
  });
  const [theme] = useTheme();
  const reduceMotion = useHBReducedMotion();
  const timeoutsRef = useRef([]);

  useEffect(() => () => { timeoutsRef.current.forEach(clearTimeout); }, []);

  // Tab-hidden guarantee: every scheduling effect below is gated on
  // `visible` and lists it as a dependency, so the instant the tab is
  // hidden both self-rescheduling chains clear their pending timer and
  // decline to schedule a new one — and resume fresh the moment it's
  // visible again.
  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const derived = computeHBDerived(state);
  const dayCount = Math.max(1, Math.floor((Date.now() - state.hiredAt) / 86400000) + 1);

  // Archive to the Wall exactly once when he quits — guarded on
  // state.archived so re-renders (or a dev-mode double-invoke) can never
  // double-archive. Same guard pattern as Freight Five's commitStats.
  useEffect(() => {
    if (derived.mood !== 'gone' || state.archived) return;
    const days = Math.max(1, Math.round((Date.now() - state.hiredAt) / 86400000));
    const entry = { name: state.first, handle: state.handle, last: state.last, tenureDays: days, miles: state.miles, patchCount: state.patches.length, quirk: state.quirk, reason: hbRandom(HB_DEPARTURE_REASONS), endedAt: Date.now() };
    const nextWall = [entry, ...loadHBWall()].slice(0, 30);
    saveHBWall(nextWall);
    setWall(nextWall);
    const archived = { ...state, archived: true };
    setState(archived);
    saveHBState(archived);
  }, [derived.mood, state]);

  const showReaction = (text, holdMs = 3400) => {
    setReaction({ text, key: Date.now() });
    timeoutsRef.current.push(setTimeout(() => setReaction(null), holdMs));
  };

  // A dramatic line gets the theatrical gasp pose for a beat, then settles
  // back to whatever his activity pose would normally be.
  const sayLine = (line) => {
    if (/AUDACITY/.test(line) || Math.random() < 0.2) {
      setForcedPose('gasp');
      timeoutsRef.current.push(setTimeout(() => setForcedPose(null), 900));
    }
    showReaction(line);
  };

  const applyAction = (needKey, lines) => {
    const now = Date.now();
    const needs = { ...state.needs, [needKey]: now };
    let next = { ...state, needs };
    const nextDerived = computeHBDerived(next, now);
    const today = ffLocalDateStr();
    // Miles are earned by an actual action, once per calendar day — no
    // farming, and skipped days simply add nothing (miles never reset).
    if ((nextDerived.mood === 'thriving' || nextDerived.mood === 'content') && state.lastMilesDate !== today) {
      const gain = 450 + Math.floor(Math.random() * 200);
      const miles = state.miles + gain;
      next = { ...next, miles, patches: HB_PATCHES.filter((p) => miles >= p.miles).map((p) => p.id), lastMilesDate: today };
    }
    setState(next);
    saveHBState(next);
    showReaction(hbRandom(lines));
  };

  // Sends him toward a station. `reason: 'tap'` means the action fires the
  // instant he arrives (see the arrival effect below); autonomous
  // wandering (`reason: 'auto'`) is purely cosmetic and never touches a
  // need — only an explicit tap ever changes Coffee/Rest/Company.
  const goToStation = (key, reason) => {
    setActivity((a) => {
      if (a.phase === 'walking') return a;
      const targetX = HB_STATION_X[key];
      const facing = targetX >= a.x ? 1 : -1;
      return { station: key, phase: 'walking', x: targetX, facing, reason };
    });
  };

  // The only timer alive while he's mid-walk — flips 'walking' to 'idle'
  // once the CSS position transition has had time to finish.
  useEffect(() => {
    if (activity.phase !== 'walking') return;
    const t = setTimeout(() => {
      setActivity((a) => (a.phase === 'walking' ? { ...a, phase: 'idle' } : a));
    }, HB_WALK_MS);
    return () => clearTimeout(t);
  }, [activity]);

  // Runs the underlying care action exactly once when a TAPPED walk
  // arrives — autonomous arrivals (reason 'auto') do only the cosmetic
  // idle animation (driven by HaulBuddyDiorama's pose logic), never this.
  useEffect(() => {
    if (activity.phase !== 'idle' || activity.reason !== 'tap') return;
    if (activity.station === 'coffee') applyAction('coffee', HB_LINES.action.coffee);
    else if (activity.station === 'cb') applyAction('company', HB_LINES.action.cb);
    else if (activity.station === 'cones') showReaction(hbRandom(HB_CONE_LINES));
    else if (activity.station === 'rig') {
      applyAction('rest', HB_LINES.action.rest);
      setSleeping(true);
      timeoutsRef.current.push(setTimeout(() => setSleeping(false), 2600));
    }
    setActivity((a) => (a.reason === 'tap' ? { ...a, reason: 'auto' } : a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity.phase, activity.reason, activity.station]);

  // Autonomous wandering — picks a new station every ~4–10s, weighted
  // toward whichever need is lowest. One pending setTimeout at a time;
  // rebuilt whenever activity/state change (so it always has fresh mood
  // data), and — the hard requirement — never scheduled at all while the
  // tab is hidden, reduced motion is on, or he's already gone.
  useEffect(() => {
    if (!visible || reduceMotion || derived.mood === 'gone' || activity.phase === 'walking') return;
    const delay = HB_ACTIVITY_MIN_MS + Math.random() * (HB_ACTIVITY_MAX_MS - HB_ACTIVITY_MIN_MS);
    const t = setTimeout(() => {
      goToStation(hbPickNextStation(derived, activity.station), 'auto');
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduceMotion, derived.mood, activity, state]);

  // Ambient chatter — one pending setTimeout at a time, same tab-hidden
  // guarantee as above. Sparser than the wander loop by design (~15–30s)
  // so it never reads as a strobe of bubbles.
  useEffect(() => {
    if (!visible || derived.mood === 'gone' || reaction) return;
    const delay = HB_BUBBLE_MIN_MS + Math.random() * (HB_BUBBLE_MAX_MS - HB_BUBBLE_MIN_MS);
    const t = setTimeout(() => {
      const pool = [...(HB_LINES[derived.mood] || []), ...(HB_QUIRK_LINES[state.quirk] || [])];
      sayLine(hbRandom(pool));
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, derived.mood, state, reaction]);

  // Station taps. Under reduced motion he never moves — see the diorama's
  // note above; the action still fires immediately in place.
  const onTapStation = (key) => {
    if (derived.mood === 'gone') return;
    if (reduceMotion) {
      if (key === 'coffee') applyAction('coffee', HB_LINES.action.coffee);
      else if (key === 'cb') applyAction('company', HB_LINES.action.cb);
      else if (key === 'cones') showReaction(hbRandom(HB_CONE_LINES));
      else if (key === 'rig') {
        applyAction('rest', HB_LINES.action.rest);
        setSleeping(true);
        timeoutsRef.current.push(setTimeout(() => setSleeping(false), 2600));
      }
      return;
    }
    if (activity.phase === 'walking') return; // ignore taps mid-walk — simplest, avoids a race
    if (activity.station === key) { setActivity((a) => ({ ...a, reason: 'tap' })); return; } // already there — repeat the action, no walk needed
    goToStation(key, 'tap');
  };
  const onTapRig = () => onTapStation('rig');
  const onTapCoffee = () => onTapStation('coffee');
  const onTapCB = () => onTapStation('cb');
  const onTapCones = () => onTapStation('cones');
  const onTapSelf = () => {
    if (derived.mood === 'gone') return;
    const pool = [...(HB_LINES[derived.mood] || []), ...(HB_QUIRK_LINES[state.quirk] || [])];
    sayLine(hbRandom(pool));
  };

  const togglePeekPref = () => {
    const next = !peekPref;
    setPeekPref(next);
    try { localStorage.setItem(uidKey(HB_PEEK_PREF_KEY), next ? 'on' : 'off'); } catch (_) {}
  };

  const hireNew = (candidate) => {
    setState(candidate);
    saveHBState(candidate);
    setActivity({ station: 'rig', phase: 'idle', x: HB_STATION_X.rig, facing: 1, reason: 'auto' });
    setSleeping(false);
    setForcedPose(null);
    setReaction(null);
  };

  const milesUp = useCountUp(state.miles);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ChevronLeft size={16} /> Break Room
        </button>
        <Badge tone="amber" className="font-normal">Haul Buddy</Badge>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-white truncate">{state.first} &quot;{state.handle}&quot; {state.last}</h2>
            <Badge tone={HB_MOOD_META[derived.mood].tone}>{HB_MOOD_META[derived.mood].label}</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">{derived.mood === 'gone' ? 'The cab is empty.' : HB_QUIRKS[state.quirk]}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-data text-2xl font-bold text-emerald-400">{Math.round(milesUp).toLocaleString()}<span className="text-sm text-slate-500 font-normal"> mi</span></div>
          <div className="text-[11px] text-slate-500">Day {dayCount} with you</div>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <HaulBuddyDiorama
          theme={theme}
          reduceMotion={reduceMotion}
          state={state}
          derived={derived}
          activity={activity}
          reaction={reaction}
          sleeping={sleeping}
          forcedPose={forcedPose}
          onTapRig={onTapRig}
          onTapCoffee={onTapCoffee}
          onTapCB={onTapCB}
          onTapCones={onTapCones}
          onTapSelf={onTapSelf}
        />
      </Card>

      {derived.mood === 'gone' && <HaulBuddyQuitNote state={state} onHire={hireNew} />}

      {derived.mood !== 'gone' && (
        <Card className="p-4 sm:p-5">
          <PanelHeader icon={<Award size={18} />} title="Patch Board" accent="amber" />
          <div className="mt-3"><HBPatchBoard patches={state.patches} /></div>
        </Card>
      )}

      <Card className="p-4 sm:p-5">
        <PanelHeader icon={<StickyNote size={18} />} title="Wall of Former Drivers" accent="slate" badge={wall.length ? <Badge tone="slate" className="font-normal">{wall.length}</Badge> : null} />
        <div className="mt-3"><HaulBuddyWall wall={wall} /></div>
      </Card>

      <Card className="p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-200">Dashboard visits</div>
          <p className="text-[11px] text-slate-500 mt-0.5">Let him peek in on your dashboard once in a while — only ever when he's happy. He lives on this device only; a different phone or a cleared browser means starting over with someone new.</p>
        </div>
        <button type="button" onClick={togglePeekPref} role="switch" aria-checked={peekPref} aria-label="Toggle dashboard visits"
          className={`shrink-0 w-10 h-5 rounded-full relative transition-colors ${peekPref ? 'bg-amber-500' : 'bg-slate-700'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${peekPref ? 'left-5' : 'left-0.5'}`} />
        </button>
      </Card>
    </div>
  );
}

// The hub teaser — a static snapshot (name + mood + a hint of the yard),
// deliberately NOT a live glimpse: he already gets a full living diorama
// one tap away, and running that behavior loop before anyone has even
// opened his page would mean a background timer chain ticking every time
// someone's just bouncing between Night Run and Freight Five. Small, cheap,
// still charming.
function HaulBuddyTeaserCard({ onOpen }) {
  const [state] = useState(() => loadHBState());
  const [theme] = useTheme();
  const derived = computeHBDerived(state);
  const gone = derived.mood === 'gone';
  const meta = HB_MOOD_META[derived.mood];
  const night = theme !== 'classic';
  return (
    <button type="button" onClick={onOpen} className="w-full text-left bg-slate-900/60 border border-slate-800/80 rounded-md shadow-e1 hover:border-amber-500/40 transition-colors p-4 flex items-center gap-4">
      <div className="shrink-0 w-16 h-16 rounded-md overflow-hidden relative" style={{ background: night ? 'linear-gradient(180deg,#14110c 55%,#211a12 100%)' : 'linear-gradient(180deg,#bae6fd 55%,#c9a876 100%)' }}>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-0.5">
          {gone ? <StickyNote size={22} className="text-slate-400" /> : <TruckerSVG look={state.look} mood={derived.mood} size={54} />}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white truncate">{gone ? 'The yard is quiet' : `${state.first} "${state.handle}"`}</span>
          <Badge tone={meta.tone} className="font-normal">{meta.label}</Badge>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{gone ? 'He left a note. The hiring board is open.' : `${(state.miles || 0).toLocaleString()} mi logged · watch him live in his yard`}</p>
      </div>
      <ChevronRight size={18} className="text-slate-600 shrink-0" />
    </button>
  );
}

// ---- The one sanctioned appearance outside the Break Room. Mounted only
// from DashboardView, and only when NOT viewing as a carrier (see the call
// site). GUARANTEE, spelled out: this component only ever shows itself when
// (a) a trucker exists, (b) his computed mood is 'thriving' or 'content'
// (never grumpy/fedup/gone — those moods render nothing, silently), (c) the
// dashboard-visits preference is on, (d) today hasn't already used its one
// appearance, and (e) a fresh coin flip comes up heads. Every line it can
// show comes from the happy mood pools only (HB_LINES[mood] where mood is
// thriving/content) — never a need-based or action line. ----
function HaulBuddyDashboardPeek({ onNavigate }) {
  const [show, setShow] = useState(false);
  const [line, setLine] = useState('');
  const [entered, setEntered] = useState(false);
  const reduceMotion = useHBReducedMotion();

  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem(uidKey(HB_PEEK_PREF_KEY)) === 'off') return;
      const state = JSON.parse(localStorage.getItem(uidKey(HB_STATE_KEY)) || 'null');
      if (!state || !state.needs) return; // no trucker hired yet — nothing to peek about
      const derived = computeHBDerived(state);
      if (derived.mood !== 'thriving' && derived.mood !== 'content') return; // hard mood gate

      const today = ffLocalDateStr();
      const stamp = JSON.parse(localStorage.getItem(uidKey(HB_PEEK_STAMP_KEY)) || 'null');
      if (stamp && stamp.date === today && stamp.shown) return; // today's one appearance is used

      if (Math.random() < 0.5) return; // "not every session even then" — leave today's stamp unset so a later session can still roll

      const pool = HB_LINES[derived.mood] || [];
      if (!pool.length || cancelled) return;
      setLine(hbRandom(pool));
      setShow(true);
      try { localStorage.setItem(uidKey(HB_PEEK_STAMP_KEY), JSON.stringify({ date: today, shown: true })); } catch (_) {}
    } catch (_) { /* the peek is best-effort — it must never throw into the dashboard */ }
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 8000);
    return () => clearTimeout(t);
  }, [show]);

  useEffect(() => {
    if (!show) { setEntered(false); return; }
    if (reduceMotion) { setEntered(true); return; }
    const t = setTimeout(() => setEntered(true), 20);
    return () => clearTimeout(t);
  }, [show, reduceMotion]);

  if (!show) return null;

  const goToHim = () => {
    try { sessionStorage.setItem(HB_DEEPLINK_KEY, '1'); } catch (_) {}
    setShow(false);
    onNavigate && onNavigate('breakroom');
  };

  return (
    <div className="fixed bottom-0 left-3 sm:left-6 z-20 pointer-events-none">
      <div
        className="relative pointer-events-auto"
        style={{ transform: entered ? 'translateY(14px)' : 'translateY(64px)', transition: reduceMotion ? 'none' : 'transform .5s cubic-bezier(.34,1.56,.64,1)' }}
      >
        <div className="absolute -top-14 left-1/2 -translate-x-1/2 w-[190px] bg-slate-100 text-slate-900 text-[11px] leading-snug font-medium px-3 py-2 rounded-lg shadow-lg text-center">
          {line}
        </div>
        <button type="button" onClick={() => setShow(false)} aria-label="Dismiss"
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center shadow z-10">
          <X size={11} />
        </button>
        <button type="button" onClick={goToHim} aria-label="Visit your Haul Buddy" className="block">
          <svg width="76" height="60" viewBox="0 0 76 60">
            <circle cx="38" cy="46" r="26" fill="#E8B48C" />
            <rect x="8" y="34" width="10" height="16" rx="5" fill="#E8B48C" />
            <rect x="58" y="34" width="10" height="16" rx="5" fill="#E8B48C" />
            <circle cx="28" cy="40" r="3" fill="#1c1917" />
            <circle cx="48" cy="40" r="3" fill="#1c1917" />
            <path d="M 30 50 Q 38 56 46 50" stroke="#1c1917" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// One launcher card in the Break Room hub — icon well, title, one-line
// description, and a small status cue (best score, streak, in-progress…).
// Same tappable-card anatomy as HaulBuddyTeaserCard so the grid reads as one
// family.
function BreakRoomGameCard({ icon, title, desc, accent = 'amber', cue, onOpen }) {
  const wellCls = {
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  }[accent] || 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return (
    <button type="button" onClick={onOpen} className="w-full text-left bg-slate-900/60 border border-slate-800/80 rounded-md shadow-e1 hover:border-amber-500/40 transition-colors p-4 flex items-center gap-4">
      <div className={`shrink-0 w-16 h-16 rounded-md border flex items-center justify-center ${wellCls}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white truncate">{title}</span>
          {cue}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      <ChevronRight size={18} className="text-slate-600 shrink-0" />
    </button>
  );
}

// Shared frame for a game opened from the hub: the "← Break Room" back
// control plus an optional page title (games whose Card already carries its
// own header skip the title to avoid saying everything twice).
function BreakRoomSubView({ title, subtitle, onBack, children }) {
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Break Room"
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={16} /> Break Room
        </button>
        {title && <h2 className="text-2xl font-bold mt-2">{title}</h2>}
        {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// Break Room tab — visible to every signed-in user (admin or driver), no
// role gate. The hub is a game LAUNCHER: a menu of cards, one per game, and
// picking one opens that game in its own dedicated sub-view with a back
// control (Night Run gets a bigger desktop playfield when it has the page to
// itself — see NightRunGame's `big` prop). Haul Buddy is SUPER-ADMIN ONLY
// for now: non-super users never see his card, and his page won't render for
// them even via the deep link. The deep link itself comes from the one
// sanctioned dashboard peek via a one-shot sessionStorage flag
// (HB_DEEPLINK_KEY), read once here and cleared.
function BreakRoomView({ isSuper = false }) {
  const [view, setView] = useState(() => { // 'hub' | 'nightrun' | 'freightfive' | 'sudoku' | 'haulbuddy'
    try {
      if (sessionStorage.getItem(HB_DEEPLINK_KEY)) {
        sessionStorage.removeItem(HB_DEEPLINK_KEY);
        return 'haulbuddy';
      }
    } catch (_) { /* ignore — default to the hub */ }
    return 'hub';
  });
  const back = () => setView('hub');

  if (view === 'haulbuddy' && isSuper) {
    return <HaulBuddyPage onBack={back} />;
  }
  if (view === 'nightrun') {
    return (
      <BreakRoomSubView title="Night Run" subtitle="Dodge traffic, grab fuel, don't jackknife." onBack={back}>
        <NightRunGame big />
      </BreakRoomSubView>
    );
  }
  if (view === 'freightfive') {
    return (
      <BreakRoomSubView onBack={back}>
        <div className="max-w-md mx-auto"><FreightFiveGame /></div>
      </BreakRoomSubView>
    );
  }
  if (view === 'sudoku') {
    return (
      <BreakRoomSubView onBack={back}>
        <SudokuGame />
      </BreakRoomSubView>
    );
  }

  // ---- the hub: launcher cards only. Status cues are read fresh on every
  // hub render (cheap localStorage reads) so returning from a game shows
  // up-to-date bests/streaks without any shared state. ----
  const nrScores = loadNightRunScores();
  const nrBest = nrScores.length ? nrScores[0].score : 0;
  const ffState = loadFFState();
  const sdk = loadSudokuState();
  const sdkInProgress = !!sdk && !sdk.solved && (sdk.entries.some((v) => v !== 0) || Object.keys(sdk.notes || {}).length > 0);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Break Room</h2>
          <Badge tone="amber" className="font-normal">v2</Badge>
        </div>
        <p className="text-slate-400 text-sm mt-1">Off the clock. Pick a game — high scores are forever.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BreakRoomGameCard
          icon={<Gamepad2 size={26} />}
          accent="amber"
          title="Night Run"
          desc="Dodge traffic, grab fuel — the highway only gets faster."
          cue={nrBest > 0 ? <Badge tone="amber" className="font-normal">Best {nrBest.toLocaleString()}</Badge> : null}
          onOpen={() => setView('nightrun')}
        />
        <BreakRoomGameCard
          icon={<Target size={26} />}
          accent="emerald"
          title="Freight Five"
          desc="One freight word a day, six guesses. New word at midnight."
          cue={ffState.done
            ? <Badge tone="emerald" className="font-normal">Done today</Badge>
            : <Badge tone="slate" className="font-normal">#{ffDayNumber()}</Badge>}
          onOpen={() => setView('freightfive')}
        />
        <BreakRoomGameCard
          icon={<Grid3x3 size={26} />}
          accent="blue"
          title="Sudoku"
          desc="Classic 9×9, three difficulties. Your board saves itself."
          cue={sdkInProgress
            ? <Badge tone="amber" className="font-normal">In progress</Badge>
            : sdk && sdk.solved ? <Badge tone="emerald" className="font-normal">Solved</Badge> : null}
          onOpen={() => setView('sudoku')}
        />
        {isSuper && <HaulBuddyTeaserCard onOpen={() => setView('haulbuddy')} />}
      </div>
      {isSuper && <p className="text-center text-[11px] text-slate-600">Four games deep — he's the one with feelings.</p>}
    </div>
  );
}

// ---------- ADMIN: CARRIER CHECK (vet a carrier before onboarding/dispatching) ----------
// Mirror of Broker Check for the other side of the deal: verify a carrier's
// authority, insurance, and identity before you put freight on their truck.
// Saves to carrier_checks (same rule shape as broker_checks).
function CarrierCheckView() {
  const [c, setC] = useState({ name: '', mc: '', dot: '' });
  const set = (k) => (e) => setC((s) => ({ ...s, [k]: e.target.value }));
  const [checks, setChecks] = useState({});
  const [flags, setFlags] = useState({});
  const [saved, setSaved] = useState([]);
  const [saveMsg, setSaveMsg] = useState('');
  const [savingChk, setSavingChk] = useState(false);
  const chkMs = (t) => { try { return t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds * 1000 : 0); } catch (_) { return 0; } };
  const fmtChkDate = (t) => { try { const d = t?.toDate ? t.toDate() : null; return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'just now'; } catch (_) { return '—'; } };
  const loadSaved = async () => {
    try { const snap = await getDocs(orgScoped('carrier_checks')); setSaved(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, x) => chkMs(x.createdAt) - chkMs(a.createdAt)).slice(0, 10)); }
    catch (e) { console.error('carrier_checks load failed', e); }
  };
  useEffect(() => { loadSaved(); }, []);

  const CHECKS = [
    ['authority', 'Operating authority is ACTIVE on FMCSA SAFER (MC/DOT not revoked or pending)'],
    ['oos', 'Not out-of-service; safety rating is not "Unsatisfactory"'],
    ['insurance', 'Auto liability ≥ $1M and cargo ≥ $100k — COI verified WITH THE ISSUING AGENT, not just the PDF'],
    ['docs', 'Onboarding packet complete: W-9, authority letter, COI, NOA (if factoring)'],
    ['equipment', 'Equipment verified — truck/trailer type and count match what they claim'],
    ['identity', 'Contact identity matches FMCSA-registered info (callback to the registered number)'],
  ];
  const RED_FLAGS = [
    ['newAuthority', 'Authority is brand new (< 6 months) with no inspection history'],
    ['fakeCoi', "COI won't verify with the issuing agent, or the agent number is unreachable"],
    ['mismatch', 'Phone/email don’t match the FMCSA-registered company'],
    ['chameleon', 'Chameleon signs — same address/officers as a revoked or shut-down carrier'],
    ['noTracking', 'Refuses tracking or won’t share the actual driver’s contact'],
    ['advances', 'Pushes hard for big fuel advances before pickup'],
  ];

  const allClear = CHECKS.every(([k]) => checks[k]);
  const flagCount = RED_FLAGS.filter(([k]) => flags[k]).length;
  let verdict;
  if (flagCount >= 2) verdict = { tone: 'red', label: '🔴 HIGH RISK — do not dispatch', sub: 'Multiple identity/insurance red flags. A stolen load or a fake COI lands on you. Verify independently or walk away.' };
  else if (!allClear || flagCount === 1) verdict = { tone: 'amber', label: '🟡 Caution — finish vetting', sub: 'Complete every check and clear all red flags before you put freight on this truck.' };
  else verdict = { tone: 'emerald', label: '🟢 Cleared to dispatch', sub: 'All checks pass and no red flags. Keep this record with the carrier’s onboarding packet.' };
  const verdictCls = { red: 'bg-red-500/15 border-red-500/40 text-red-300', amber: 'bg-warn-500/15 border-warn-500/40 text-warn-300', emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' }[verdict.tone];

  const reset = () => { setC({ name: '', mc: '', dot: '' }); setChecks({}); setFlags({}); setSaveMsg(''); };
  const save = async () => {
    if (!c.name.trim() && !c.mc.trim() && !c.dot.trim()) { setSaveMsg('Enter the carrier name, MC, or DOT first.'); return; }
    setSavingChk(true); setSaveMsg('');
    try {
      await addDoc(collection(db, 'carrier_checks'), stampOrg({
        carrierName: c.name.trim(), carrierMc: c.mc.trim(), carrierDot: c.dot.trim(),
        verdict: verdict.label, verdictTone: verdict.tone,
        checksPassed: CHECKS.filter(([k]) => checks[k]).length, checksTotal: CHECKS.length,
        flagCount, checks, flags,
        savedBy: auth.currentUser ? auth.currentUser.uid : null,
        createdAt: serverTimestamp(),
      }));
      setSaveMsg('Saved to your vetting record ✓');
      loadSaved();
    } catch (e) { console.error('save carrier check failed', e); setSaveMsg('Could not save — check the console (is the carrier_checks rule published?).'); }
    finally { setSavingChk(false); }
  };
  const saferUrl = 'https://safer.fmcsa.dot.gov/CompanySnapshot.aspx';
  const liUrl = 'https://li-public.fmcsa.dot.gov/LIVIEW/pkg_menu.prc_menu';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Carrier Check</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Vet a carrier before you onboard them or put a load on their truck. Fake COIs, chameleon authorities, and identity theft are how loads get stolen — and the vetting trail is your proof you did the work.</p>

      <GuidedHint>Run this when a new carrier wants on your board, and re-run it if their insurance renews or anything smells off. Two or more red flags = stop and verify with FMCSA + the insurance agent directly.</GuidedHint>

      <Card className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Carrier / Company Name"><input className={INPUT_CLS} value={c.name} onChange={set('name')} placeholder="Rolling Thunder LLC" /></Field>
          <Field label="MC Number"><input className={INPUT_CLS} value={c.mc} onChange={set('mc')} placeholder="MC-654321" /></Field>
          <Field label="DOT Number"><input className={INPUT_CLS} value={c.dot} onChange={set('dot')} placeholder="1234567" /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={saferUrl} target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg">Open FMCSA SAFER ↗</a>
          <a href={liUrl} target="_blank" rel="noopener noreferrer" className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg">Open FMCSA L&amp;I (insurance/authority) ↗</a>
        </div>
      </Card>

      <div className={`rounded-2xl border p-5 ${verdictCls}`}>
        <div className="font-bold text-base">{verdict.label}</div>
        <div className="text-sm opacity-80 mt-1">{verdict.sub}</div>
      </div>

      <Card className="p-6">
        <PanelHeader icon={<ShieldCheck size={20} />} title="Vetting Checklist" badge={<Badge tone={allClear ? 'emerald' : 'slate'}>{CHECKS.filter(([k]) => checks[k]).length}/{CHECKS.length}</Badge>} />
        <div className="space-y-2 mt-4">
          {CHECKS.map(([k, label]) => (
            <label key={k} className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2.5">
              <input type="checkbox" checked={!!checks[k]} onChange={(e) => setChecks((s) => ({ ...s, [k]: e.target.checked }))} className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <PanelHeader icon={<Activity size={20} />} title="Carrier-Fraud Red Flags" accent="red" badge={<Badge tone={flagCount === 0 ? 'emerald' : flagCount === 1 ? 'amber' : 'red'}>{flagCount} flagged</Badge>} />
        <p className="text-xs text-slate-500 mt-2">Check anything you're seeing. Two or more is a strong signal to stop and verify independently.</p>
        <div className="space-y-2 mt-4">
          {RED_FLAGS.map(([k, label]) => (
            <label key={k} className="flex items-start gap-3 text-sm text-slate-200 cursor-pointer bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2.5">
              <input type="checkbox" checked={!!flags[k]} onChange={(e) => setFlags((s) => ({ ...s, [k]: e.target.checked }))} className="w-4 h-4 mt-0.5 rounded accent-red-500 shrink-0" />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <PrimaryButton onClick={save} disabled={savingChk} className="text-sm px-4 py-2">{savingChk ? 'Saving…' : 'Save this check'}</PrimaryButton>
          <GhostButton onClick={reset} className="text-sm">Reset for next carrier</GhostButton>
          {saveMsg && <span className={`text-sm ${saveMsg.includes('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>{saveMsg}</span>}
        </div>
      </Card>

      {saved.length > 0 && (
        <Card className="p-6">
          <PanelHeader icon={<FileText size={20} />} title="Saved Checks" badge={<Badge tone="slate">{saved.length}</Badge>} />
          <p className="text-xs text-slate-500 mt-2">Your produceable vetting trail — one record per carrier you've checked, with the verdict and date.</p>
          <div className="mt-4 space-y-2">
            {saved.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <span className="font-semibold text-white">{r.carrierName || '—'}</span>
                  {r.carrierMc && <span className="text-slate-500 ml-2">{r.carrierMc}</span>}
                  {r.carrierDot && <span className="text-slate-500 ml-2">DOT {r.carrierDot}</span>}
                  <span className="text-slate-500 ml-2">· {r.checksPassed}/{r.checksTotal} checks · {r.flagCount} flag{r.flagCount === 1 ? '' : 's'}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded ${({ red: 'bg-red-500/15 text-red-300', amber: 'bg-warn-500/15 text-warn-300', emerald: 'bg-emerald-500/15 text-emerald-300' })[r.verdictTone] || 'bg-slate-700 text-slate-300'}`}>{r.verdict}</span>
                  <span className="text-[11px] text-slate-500">{fmtChkDate(r.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-[11px] text-slate-600">Manual vetting for now. Live SAFER/insurance lookups arrive with the backend phase.</p>
    </div>
  );
}

// ---------- CARRIER: MY CPM & EXPENSES ----------
function DriverExpensesView({ uid }) {
  const targetUid = uid || auth.currentUser?.uid;
  const DEFAULTS = { truckPayment: '', insurance: '', otherFixed: '', mpg: '6.5', fuelPrice: '5.35', maintPerMile: '', otherVarPerMile: '', milesPerMonth: '', checkRate: '', checkMiles: '' };
  const [f, setF] = useState(DEFAULTS);
  const [saved, setSaved] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const n = (x) => parseFloat(x) || 0;

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', targetUid));
        if (snap.exists() && snap.data().cpm) setF((s) => ({ ...s, ...snap.data().cpm }));
      } catch (e) { console.error('CPM load failed', e); }
    })();
  }, []);

  const fixedMonthly = n(f.truckPayment) + n(f.insurance) + n(f.otherFixed);
  const miles = n(f.milesPerMonth);
  const fixedPerMile = miles > 0 ? fixedMonthly / miles : 0;
  const fuelPerMile = n(f.mpg) > 0 ? n(f.fuelPrice) / n(f.mpg) : 0;
  const variablePerMile = fuelPerMile + n(f.maintPerMile) + n(f.otherVarPerMile);
  const breakeven = fixedPerMile + variablePerMile;

  const checkRpm = n(f.checkMiles) > 0 ? n(f.checkRate) / n(f.checkMiles) : 0;
  const profitPerMile = checkRpm - breakeven;
  const checkReady = checkRpm > 0 && breakeven > 0;

  const save = async () => {
    try { await setDoc(doc(db, 'users', targetUid), { cpm: f }, { merge: true }); setSaved('Saved ✓'); setTimeout(() => setSaved(''), 2000); }
    catch (e) { console.error('CPM save failed', e); setSaved('Could not save'); }
  };
  // Push the updated break-even to the dispatcher (stored on the carrier's own
  // user doc, which the dispatcher reads) so they negotiate from the real floor.
  const shareWithDispatcher = async () => {
    try {
      await setDoc(doc(db, 'users', targetUid), {
        cpm: f,
        cpmShared: { breakeven: Number(breakeven.toFixed(2)), milesPerMonth: n(f.milesPerMonth), at: serverTimestamp() },
      }, { merge: true });
      setSaved('Sent to your dispatcher ✓'); setTimeout(() => setSaved(''), 2500);
    } catch (e) { console.error('CPM share failed', e); setSaved('Could not send'); }
  };
  const money = (x) => '$' + (x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rpm = (x) => '$' + (x || 0).toFixed(2);
  const field = INPUT_CLS;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">My CPM &amp; Expenses</h2>
        <p className="text-slate-400">Know your real cost per mile. Enter your monthly costs once and the calculator shows the rate you must beat to make money.</p>
      </div>
      <GuidedHint>This is the carrier’s own break-even number. Encourage drivers to fill it in — a carrier who knows their CPM negotiates harder and never hauls a losing load.</GuidedHint>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-bold">Your Costs</h3>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fixed (per month)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Truck / trailer payment"><input className={field} type="number" inputMode="decimal" value={f.truckPayment} onChange={set('truckPayment')} placeholder="2200" /></Field>
            <Field label="Insurance"><input className={field} type="number" inputMode="decimal" value={f.insurance} onChange={set('insurance')} placeholder="1400" /></Field>
            <Field label="Other fixed (permits, ELD, parking…)" className="sm:col-span-2"><input className={field} type="number" inputMode="decimal" value={f.otherFixed} onChange={set('otherFixed')} placeholder="600" /></Field>
          </div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">Variable (per mile)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Truck avg MPG"><input className={field} type="number" inputMode="decimal" value={f.mpg} onChange={set('mpg')} /></Field>
            <Field label="Fuel price ($/gal)"><input className={field} type="number" inputMode="decimal" value={f.fuelPrice} onChange={set('fuelPrice')} /></Field>
            <Field label="Maintenance / tires ($/mi)"><input className={field} type="number" inputMode="decimal" value={f.maintPerMile} onChange={set('maintPerMile')} placeholder="0.20" /></Field>
            <Field label="Other variable ($/mi)"><input className={field} type="number" inputMode="decimal" value={f.otherVarPerMile} onChange={set('otherVarPerMile')} placeholder="0.05" /></Field>
          </div>
          <Field label="Miles you drive per month"><input className={field} type="number" inputMode="decimal" value={f.milesPerMonth} onChange={set('milesPerMonth')} placeholder="10000" /></Field>
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={save} className="px-5">Save</PrimaryButton>
            <GhostButton onClick={shareWithDispatcher} className="px-4">📤 Send updated CPM to dispatcher</GhostButton>
            {saved && <span className="text-sm text-emerald-400">{saved}</span>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <div className="text-sm text-slate-400">Your break-even cost per mile</div>
            <div className="text-4xl font-extrabold text-amber-400 mt-1">{breakeven > 0 ? rpm(breakeven) : '—'}<span className="text-lg text-slate-500 font-bold">/mi</span></div>
            <p className="text-xs text-slate-500 mt-2">Run a mile below this and you lose money. This is your hard floor — never book under it.</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <StatTile label="Fixed cost / mi" value={miles > 0 ? rpm(fixedPerMile) : '—'} />
              <StatTile label="Variable cost / mi" value={variablePerMile > 0 ? rpm(variablePerMile) : '—'} />
              <StatTile label="Fuel / mi" value={fuelPerMile > 0 ? rpm(fuelPerMile) : '—'} />
              <StatTile label="Fixed / month" value={fixedMonthly > 0 ? money(fixedMonthly) : '—'} />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold mb-3">Quick Rate Check</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Load pays ($)"><input className={field} type="number" inputMode="decimal" value={f.checkRate} onChange={set('checkRate')} placeholder="2000" /></Field>
              <Field label="Total miles"><input className={field} type="number" inputMode="decimal" value={f.checkMiles} onChange={set('checkMiles')} placeholder="800" /></Field>
            </div>
            {checkReady ? (
              <div className={`mt-4 rounded-xl border p-4 ${profitPerMile >= 0 ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
                <div className={`text-sm font-bold text-white ${profitPerMile >= 0 ? 'fm-profit' : ''}`}>{rpm(checkRpm)}/mi — {profitPerMile >= 0 ? `${rpm(profitPerMile)}/mi profit ✓` : `${rpm(Math.abs(profitPerMile))}/mi LOSS ✕`}</div>
                <div className="text-xs text-slate-400 mt-1">{profitPerMile >= 0 ? 'This load clears your break-even. Good to run.' : 'This load is below your cost — pass or negotiate up.'}</div>
              </div>
            ) : <p className="text-xs text-slate-500 mt-3">Enter a load's pay and miles to see if it beats your break-even.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- ADMIN: VIP SERVICES (requests + active concierge) ----------
function VipServicesView() {
  const [reqs, setReqs] = useState([]);
  const [activeVip, setActiveVip] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [uSnap, cSnap] = await Promise.all([getDocs(orgScoped('users')), getDocs(orgScoped('carriers'))]);
      const carriers = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const byUid = {};
      carriers.forEach((c) => { if (c.linkedDriverUid) byUid[c.linkedDriverUid] = c; });
      const users = uSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      setReqs(users.filter((u) => u.vipRequested).map((u) => ({ ...u, carrier: byUid[u.uid] || null })));
      setActiveVip(carriers.filter((c) => c.vipConcierge));
    } catch (e) { console.error('VIP load failed', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const enableVip = async (r) => {
    // Set the new (higher) dispatch fee at the moment VIP turns on.
    let feePatch = {};
    if (r.carrier) {
      const cur = feePctOf(r.carrier.feePct);
      const input = window.prompt(`Enabling VIP for ${nameOf(r)}.\n\nVIP is a premium tier — set their new dispatch fee % (currently ${cur}%):`, String(cur + 2));
      if (input === null) return;
      const v = Number(input);
      if (!isNaN(v) && v > 0 && v <= 100) feePatch = { feePct: v };
    }
    setBusyId(r.uid);
    try {
      await setDoc(doc(db, 'users', r.uid), { vipConcierge: true, vipRequested: false }, { merge: true });
      if (r.carrier) await updateDoc(doc(db, 'carriers', r.carrier.id), { vipConcierge: true, ...feePatch });
      await fetchAll();
    } catch (e) { console.error('enable VIP failed', e); alert('Could not enable — check the console.'); }
    finally { setBusyId(null); }
  };
  const dismiss = async (r) => {
    setBusyId(r.uid);
    try { await setDoc(doc(db, 'users', r.uid), { vipRequested: false }, { merge: true }); await fetchAll(); }
    catch (e) { console.error('dismiss failed', e); }
    finally { setBusyId(null); }
  };

  const nameOf = (r) => (r.carrier && r.carrier.name) || r.email || r.uid;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">VIP Services</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Carriers who asked for the VIP concierge upsell, and exactly what they want. Enable VIP to turn on their concierge experience.</p>
      <GuidedHint>VIP is your highest-margin upsell. When you enable it, bump that carrier's <strong>dispatch fee</strong> a point or two in the Carriers tab to cover the concierge work — the fee bump usually pays for the whole platform.</GuidedHint>

      {loading ? <SkelRows rows={3} /> : (
        <>
          <Card className="p-6">
            <PanelHeader icon={<HeartPulse size={20} />} title="Pending Requests" badge={reqs.length > 0 ? <Badge tone="amber">{reqs.length}</Badge> : null} />
            {reqs.length === 0 ? (
              <div className="text-slate-500 text-sm mt-4">No open VIP requests right now.</div>
            ) : (
              <div className="space-y-4 mt-4">
                {reqs.map((r) => {
                  const a = r.vipRequest || {};
                  const empty = (!a.services || a.services.length === 0) && !a.diet && !a.pet && !a.fitness && !a.notes;
                  return (
                    <div key={r.uid} className="bg-slate-800/40 border border-slate-700 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-semibold text-white">{nameOf(r)}</div>
                          <div className="text-xs text-slate-500">{r.email}{r.carrier ? ` · ${r.carrier.mcNumber || ''}` : ' · not linked to a carrier yet'}</div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <PrimaryButton onClick={() => enableVip(r)} disabled={busyId === r.uid} className="text-sm">{busyId === r.uid ? '…' : 'Enable VIP'}</PrimaryButton>
                          <GhostButton onClick={() => dismiss(r)} disabled={busyId === r.uid} className="text-sm">Dismiss</GhostButton>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        {a.services && a.services.length > 0 && <div className="sm:col-span-2"><span className="text-slate-500 text-xs">Services: </span><span className="text-slate-200">{a.services.join(', ')}</span></div>}
                        {a.diet && <div><span className="text-slate-500 text-xs">Diet: </span><span className="text-slate-200">{a.diet}</span></div>}
                        {a.pet && <div><span className="text-slate-500 text-xs">Pet: </span><span className="text-slate-200">{a.pet}</span></div>}
                        {a.fitness && <div><span className="text-slate-500 text-xs">Fitness: </span><span className="text-slate-200">{a.fitness}</span></div>}
                        {a.notes && <div className="sm:col-span-2"><span className="text-slate-500 text-xs">Notes: </span><span className="text-slate-200">{a.notes}</span></div>}
                        {empty && <div className="text-slate-500 text-xs">No questionnaire details provided.</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="font-bold mb-4">Active VIP Carriers ({activeVip.length})</h3>
            {activeVip.length === 0 ? (
              <div className="text-slate-500 text-sm">No carriers on VIP yet.</div>
            ) : (
              <div className="space-y-2">
                {activeVip.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 bg-slate-800/40 border border-slate-700 rounded-xl p-3">
                    <div className="text-sm font-semibold text-white">{c.name}</div>
                    <Badge tone="amber"><HeartPulse size={11} /> VIP · {feePctOf(c.feePct)}% fee</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ---------- SETTINGS ----------
function SettingsView({ isAdmin, myStatus, onSetStatus, vipOn, vipRequested, onRequestVip, onCancelVip, guidedMode, toggleGuided, onNavigate, onReplayTour }) {
  const [paperwork, setPaperwork] = useState(() => { try { return localStorage.getItem('fm_paperwork') !== '0'; } catch (_) { return true; } });
  const togglePaperwork = () => setPaperwork((p) => { const nv = !p; try { localStorage.setItem('fm_paperwork', nv ? '1' : '0'); } catch (_) {} return nv; });
  const u = auth.currentUser;

  // Per-workspace dispatch phone — what carriers dial on "Call Dispatcher".
  const [phone, setPhone] = useState('');
  const [phoneMsg, setPhoneMsg] = useState('');
  // Per-workspace legal/business name — the "Dispatcher" party on every carrier agreement & LPOA.
  const [companyName, setCompanyName] = useState('');
  const [companyMsg, setCompanyMsg] = useState('');
  // Per-workspace agreement text overrides (empty = built-in defaults).
  const [agrTxt, setAgrTxt] = useState('');
  const [lpoaTxt, setLpoaTxt] = useState('');
  const [agrMsg, setAgrMsg] = useState('');
  // Per-workspace VIP services menu (empty = platform defaults).
  const [vipRows, setVipRows] = useState(DEFAULT_VIP_MENU);
  const [vipMsg, setVipMsg] = useState('');
  useEffect(() => {
    if (!isAdmin || !ACTIVE_ORG) return;
    (async () => { try {
      const s = await getDoc(doc(db, 'orgs', ACTIVE_ORG));
      if (s.exists()) {
        setPhone(s.data().dispatchPhone || '');
        setCompanyName(s.data().name || '');
        setAgrTxt(s.data().agreementText || '');
        setLpoaTxt(s.data().lpoaText || '');
        if (Array.isArray(s.data().vipMenu) && s.data().vipMenu.length) setVipRows(s.data().vipMenu);
      }
    } catch (_) {} })();
  }, [isAdmin]);
  const setVipRow = (i, k, v) => setVipRows((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const saveVipMenu = async () => {
    if (!ACTIVE_ORG) { setVipMsg('Create your workspace first (Workspaces tab).'); return; }
    const clean = vipRows.map((r) => ({ icon: (r.icon || '').trim(), name: (r.name || '').trim(), desc: (r.desc || '').trim() })).filter((r) => r.name);
    if (!clean.length) { setVipMsg('Add at least one service (or reset to defaults).'); return; }
    try {
      await setDoc(doc(db, 'orgs', ACTIVE_ORG), { vipMenu: clean }, { merge: true });
      setVipRows(clean);
      setVipMsg('Saved ✓ — carriers now see this menu');
      setTimeout(() => setVipMsg(''), 3000);
    } catch (e) { console.error('vip menu save failed', e); setVipMsg('Could not save — make sure the updated org rules are published.'); }
  };
  const saveAgreements = async () => {
    if (!ACTIVE_ORG) { setAgrMsg('Create your workspace first (Workspaces tab).'); return; }
    try {
      await setDoc(doc(db, 'orgs', ACTIVE_ORG), { agreementText: agrTxt.trim(), lpoaText: lpoaTxt.trim() }, { merge: true });
      setAgrMsg('Saved ✓ — new carriers now sign this text');
      setTimeout(() => setAgrMsg(''), 3000);
    } catch (e) { console.error('agreement text save failed', e); setAgrMsg('Could not save — make sure the updated org rules are published.'); }
  };
  const previewVals = { company: companyName || 'Your Company, LLC', carrier: 'Sample Carrier LLC', mc: 'MC-123456', fee: '10' };
  const savePhone = async () => {
    if (!ACTIVE_ORG) { setPhoneMsg('Create your workspace first (Workspaces tab).'); return; }
    try { await setDoc(doc(db, 'orgs', ACTIVE_ORG), { dispatchPhone: phone.trim() }, { merge: true }); setPhoneMsg('Saved ✓'); setTimeout(() => setPhoneMsg(''), 2000); }
    catch (e) { console.error('phone save failed', e); setPhoneMsg('Could not save — make sure the updated org rules are published.'); }
  };
  const saveCompanyName = async () => {
    if (!ACTIVE_ORG) { setCompanyMsg('Create your workspace first (Workspaces tab).'); return; }
    if (!companyName.trim()) { setCompanyMsg('Enter a company name.'); return; }
    try { await setDoc(doc(db, 'orgs', ACTIVE_ORG), { name: companyName.trim() }, { merge: true }); setCompanyMsg('Saved ✓'); setTimeout(() => setCompanyMsg(''), 2000); }
    catch (e) { console.error('company name save failed', e); setCompanyMsg('Could not save — make sure the updated org rules are published.'); }
  };
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      {!isAdmin && (
        <Card className="p-6">
          <h3 className="font-bold mb-3">My Availability</h3>
          <p className="text-sm text-slate-400 mb-3">Set your status so your dispatcher knows when you're ready for a load.</p>
          <div className="flex flex-wrap gap-2">
            {['Available', 'On Break', 'Off Duty'].map((s) => (
              <button key={s} onClick={() => onSetStatus && onSetStatus(s)}
                className={`text-sm px-4 py-2 rounded-lg border transition-colors ${myStatus === s ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}`}>
                {s}
              </button>
            ))}
          </div>
        </Card>
      )}

      {!isAdmin && !vipOn && (
        <Card className="p-6">
          <h3 className="font-bold mb-2">VIP Concierge</h3>
          <p className="text-sm text-slate-400 mb-4">Premium white-glove support (safe parking, Healthy Hub, shower queue, pet logistics). It raises your dispatch fee a point or two to cover the concierge work.</p>
          <VipRequestButton requested={vipRequested} onRequest={onRequestVip} onCancel={onCancelVip} />
        </Card>
      )}

      {isAdmin && (
        <Card className="p-6">
          <h3 className="font-bold mb-3">Dispatcher Settings</h3>
          <div className="flex items-center justify-between gap-3 py-2">
            <div>
              <div className="text-sm font-semibold text-white">Guided Mode</div>
              <div className="text-xs text-slate-400">Show step-by-step tips across every tab — great for training new dispatchers.</div>
            </div>
            <button onClick={toggleGuided} className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${guidedMode ? 'bg-amber-500' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${guidedMode ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="text-sm font-semibold text-white mb-1">Dispatch phone</div>
            <div className="text-xs text-slate-400 mb-2">The number your carriers reach when they tap “Call Dispatcher” on a load offer. This is per-workspace, so each dispatcher sets their own.</div>
            <div className="flex flex-wrap items-center gap-2">
              <input className={INPUT_CLS + ' max-w-xs'} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
              <PrimaryButton onClick={savePhone} className="px-4">Save</PrimaryButton>
              {phoneMsg && <span className="text-xs text-emerald-400">{phoneMsg}</span>}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="text-sm font-semibold text-white mb-1">Company / legal business name</div>
            <div className="text-xs text-slate-400 mb-2">This is the “Dispatcher” party your carriers see on their Dispatch Service Agreement and Power of Attorney — set it to your own business name if you're running independently rather than under Forward Motion Freight.</div>
            <div className="flex flex-wrap items-center gap-2">
              <input className={INPUT_CLS + ' max-w-xs'} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your Dispatch Co., LLC" />
              <PrimaryButton onClick={saveCompanyName} className="px-4">Save</PrimaryButton>
              {companyMsg && <span className="text-xs text-emerald-400">{companyMsg}</span>}
            </div>
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card className="p-6">
          <h3 className="font-bold mb-1">Carrier Agreements</h3>
          <p className="text-xs text-slate-400 mb-1">
            This is the exact text your carriers e-sign on their <strong className="text-slate-300">Agreements &amp; W-9</strong> tab. Amend it to fit your business, or paste in your own
            agreement — leave a box empty to use the built-in default. Placeholders fill in automatically per carrier:
            <code className="text-amber-300"> {'{{company}}'}</code> (you), <code className="text-amber-300">{'{{carrier}}'}</code>, <code className="text-amber-300">{'{{mc}}'}</code>, <code className="text-amber-300">{'{{fee}}'}</code>.
            Use <code className="text-amber-300">**bold**</code> for headings. Carriers who already signed keep the text they signed —
            to put new terms into effect for an existing carrier, open <strong className="text-slate-300">Carriers → View as → Agreements &amp; W-9</strong> and
            use “Request re-signature.” Every signature is stored as a permanent, uneditable record.
          </p>
          <p className="text-[11px] text-amber-400/80 mb-4">Have an attorney review any custom agreement before you use it.</p>

          <Field label="Dispatch Service Agreement">
            <textarea rows={9} className={INPUT_CLS + ' font-data text-xs leading-relaxed'} value={agrTxt}
              onChange={(e) => setAgrTxt(e.target.value)} placeholder="Empty = built-in default agreement" />
          </Field>
          <div className="flex flex-wrap items-center gap-2 mt-1 mb-4">
            <button type="button" onClick={() => setAgrTxt(DEFAULT_AGREEMENT_TEXT)} className="text-[11px] text-slate-400 hover:text-slate-200 underline">Load default into editor</button>
            <button type="button" onClick={() => setAgrTxt('')} className="text-[11px] text-slate-400 hover:text-slate-200 underline">Clear (use default)</button>
          </div>

          <Field label="Limited Power of Attorney">
            <textarea rows={7} className={INPUT_CLS + ' font-data text-xs leading-relaxed'} value={lpoaTxt}
              onChange={(e) => setLpoaTxt(e.target.value)} placeholder="Empty = built-in default LPOA" />
          </Field>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <button type="button" onClick={() => setLpoaTxt(DEFAULT_LPOA_TEXT)} className="text-[11px] text-slate-400 hover:text-slate-200 underline">Load default into editor</button>
            <button type="button" onClick={() => setLpoaTxt('')} className="text-[11px] text-slate-400 hover:text-slate-200 underline">Clear (use default)</button>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-amber-400 hover:text-amber-300">👁 Preview as your carrier will see it</summary>
            <div className="mt-2 space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-400">Dispatch Service Agreement</div>
                <AgreementText text={fillAgreementTokens(agrTxt.trim() || DEFAULT_AGREEMENT_TEXT, previewVals)} />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400">Limited Power of Attorney</div>
                <AgreementText text={fillAgreementTokens(lpoaTxt.trim() || DEFAULT_LPOA_TEXT, previewVals)} />
              </div>
            </div>
          </details>

          <div className="flex items-center gap-3 mt-5">
            <PrimaryButton onClick={saveAgreements} className="px-5">Save agreements</PrimaryButton>
            {agrMsg && <span className="text-xs text-emerald-400">{agrMsg}</span>}
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card className="p-6">
          <h3 className="font-bold mb-1">VIP Services Menu</h3>
          <p className="text-xs text-slate-400 mb-4">
            The concierge services <strong className="text-slate-300">you</strong> offer your carriers — shown on their VIP card and request form.
            You deliver these personally, so only list what you'll actually do. VIP still works the same way: enabling it bumps that carrier's dispatch fee a point or two.
          </p>

          <div className="space-y-3">
            {vipRows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2">
                <input className={INPUT_CLS + ' w-14 text-center shrink-0'} value={r.icon || ''} onChange={(e) => setVipRow(i, 'icon', e.target.value)} placeholder="🛡" title="Emoji icon" />
                <input className={INPUT_CLS + ' flex-1 min-w-[160px]'} value={r.name || ''} onChange={(e) => setVipRow(i, 'name', e.target.value)} placeholder="Service name" />
                <input className={INPUT_CLS + ' flex-[2] min-w-[200px]'} value={r.desc || ''} onChange={(e) => setVipRow(i, 'desc', e.target.value)} placeholder="One-line description your carrier sees" />
                <button type="button" onClick={() => setVipRows((rows) => rows.filter((_, j) => j !== i))}
                  className="text-red-400/80 hover:text-red-400 px-2 py-2 shrink-0" title="Remove service">✕</button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <GhostButton type="button" onClick={() => setVipRows((rows) => [...rows, { icon: '', name: '', desc: '' }])} className="text-sm">+ Add a service</GhostButton>
            <button type="button" onClick={() => setVipRows(DEFAULT_VIP_MENU)} className="text-[11px] text-slate-400 hover:text-slate-200 underline">Reset to defaults</button>
          </div>

          <div className="flex items-center gap-3 mt-5">
            <PrimaryButton onClick={saveVipMenu} className="px-5">Save VIP menu</PrimaryButton>
            {vipMsg && <span className="text-xs text-emerald-400">{vipMsg}</span>}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 py-1">
          <div>
            <div className="text-sm font-semibold text-white">Paperwork reminders</div>
            <div className="text-xs text-slate-400">Show the “collect &amp; confirm these documents” prompt on each load. Turn off if you’ve got the workflow down.</div>
          </div>
          <button onClick={togglePaperwork} className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${paperwork ? 'bg-amber-500' : 'bg-slate-600'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${paperwork ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 py-1 mt-2 pt-3 border-t border-slate-800">
          <div>
            <div className="text-sm font-semibold text-white">Dashboard tour</div>
            <div className="text-xs text-slate-400">Replay the first-login walkthrough anytime.</div>
          </div>
          {onReplayTour && <GhostButton onClick={onReplayTour} className="text-sm shrink-0">Replay tour</GhostButton>}
        </div>
        <div className="flex items-center justify-between gap-3 py-1 mt-2 pt-3 border-t border-slate-800">
          <div>
            <div className="text-sm font-semibold text-white">Portal theme</div>
            <div className="text-xs text-slate-400">Night Haul is the new warm-dark look; Classic is the original slate. Saved on this device.</div>
          </div>
          <ThemeToggle />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold mb-3">Account</h3>
        <div className="text-sm text-slate-300">{u?.email}</div>
        <div className="text-xs text-slate-500 mt-1">{isAdmin ? 'Admin / Dispatcher' : 'Carrier / Driver'}</div>
        <GhostButton onClick={() => signOut(auth)} className="mt-4">Sign Out</GhostButton>
      </Card>
    </div>
  );
}

// ---------- FIRST-LOGIN TOUR ----------
const TOUR_STEPS = {
  admin: [
    { icon: '👋', title: 'Welcome to Forward OS', body: 'This is your dispatch command center. Here’s a 60-second tour — skip anytime.' },
    { icon: '🧮', title: 'The Deal Desk', body: 'Work every load in the Rate Calculator: break-even RPM, live market rate, and an HOS legality check — then send it to the carrier as an offer.' },
    { icon: '🛡️', title: 'Vet before you book', body: 'Broker Check screens a broker’s $75k bond and double-brokering red flags. In 2026 that’s how you keep your carrier from getting stiffed.' },
    { icon: '🏢', title: 'Carriers & Access', body: 'Build a carrier’s profile and create their login in one place, then assign loads straight from the calculator.' },
    { icon: '🔔', title: 'Stay on top of it', body: 'The bell flags offers awaiting a response, expiring compliance, detention claims, and VIP requests — all deep-linked.' },
    { icon: '🎓', title: 'Guided Mode', body: 'New to dispatch? Flip on Guided Mode (top bar) for step-by-step tips on every single tab.' },
  ],
  carrier: [
    { icon: '👋', title: 'Welcome to your portal', body: 'Everything for your loads lives here. Quick tour — skip anytime.' },
    { icon: '🚚', title: 'Your active load', body: 'Your current load shows on the dashboard. Tap it to open Lane Management and update your status as you roll.' },
    { icon: '📄', title: 'Paperwork made simple', body: 'Each load reminds you exactly which documents to collect — RateCon, BOL, POD — then you confirm before moving on.' },
    { icon: '💵', title: 'Know your numbers', body: 'My CPM & Expenses shows your true cost per mile, so you never haul a load that loses money.' },
    { icon: '🟢', title: 'Set your status', body: 'Mark yourself Available, On Break, or Off Duty so your dispatcher knows when you’re ready for freight.' },
    { icon: '⭐', title: 'Want the VIP treatment?', body: 'Request concierge services — safe parking, Healthy Hub, shower queue, and more — anytime from your dashboard.' },
  ],
};

function TourOverlay({ role, onClose }) {
  const steps = TOUR_STEPS[role] || TOUR_STEPS.carrier;
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md p-7 text-center border-amber-500/30">
        <div className="text-5xl mb-4">{step.icon}</div>
        <h3 className="text-xl font-bold text-white">{step.title}</h3>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-center gap-1.5 mt-5">
          {steps.map((_, idx) => <span key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === i ? 'bg-amber-500' : 'bg-slate-600'}`} />)}
        </div>
        <div className="flex items-center justify-between gap-3 mt-6">
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-white">Skip tour</button>
          <div className="flex items-center gap-2">
            {i > 0 && <GhostButton onClick={() => setI((n) => n - 1)} className="text-sm">Back</GhostButton>}
            {last
              ? <PrimaryButton onClick={onClose} className="text-sm px-5">Get started →</PrimaryButton>
              : <PrimaryButton onClick={() => setI((n) => n + 1)} className="text-sm px-5">Next</PrimaryButton>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------- SUPER-ADMIN: WORKSPACES (multi-tenant provisioning) ----------
// ---------- SUPER-ADMIN: ACCESS REQUESTS (dispatcher_leads) ----------
// Everyone who submits the Request Dispatcher Access form (or finishes the
// crash course) lands in dispatcher_leads. This is the super-admin's pipeline
// so requests don't sit unseen in Firestore — with a "handled" toggle to work
// them and keep the 24–48h provisioning promise.

// One-request handoff from Access Requests → Workspaces: "Set up workspace"
// stashes the lead here, jumps to the Workspaces tab, and the provision form
// reads + clears it on mount so the dispatcher's name/email/relationship are
// pre-filled (and the lead auto-marked handled once the workspace is created).
let _provisionPrefill = null;

function AccessRequestsView({ onNavigate }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState('');
  const [gradSet, setGradSet] = useState(() => new Set()); // emailKeys that finished the course (incl. final exam)

  // course_progress is keyed by a normalized email — mirror that key here so a
  // lead can be matched to their completion record even if the lead row itself
  // isn't flagged (e.g. they requested access before passing the final exam).
  const emailKey = (e) => String(e || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const [snap, cp] = await Promise.all([
        getDocs(collection(db, 'dispatcher_leads')),
        getDocs(collection(db, 'course_progress')).catch(() => ({ docs: [] })),
      ]);
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const g = new Set();
      cp.docs.forEach((d) => { const v = d.data(); if (v.completed === true && v.email) g.add(emailKey(v.email)); });
      setGradSet(g);
    } catch (e) { console.error('access requests load failed', e); setErr('Could not load — check that the dispatcher_leads rule is published.'); }
    finally { setLoading(false); }
  })(); }, []);

  // A lead has graduated (passed the final exam) if their lead row is flagged
  // OR their course_progress record is marked completed.
  const isGrad = (r) => !!r.courseCompleted || gradSet.has(emailKey(r.email));

  const toDate = (t) => { try { return t && t.toDate ? t.toDate() : (t ? new Date(t) : null); } catch (_) { return null; } };
  const ago = (t) => {
    const d = toDate(t); if (!d) return '—';
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };
  const SIT = { independent: 'Independent dispatcher', fmf: 'Dispatch for FMF', new: 'New / deciding' };
  const sitLabel = (s) => SIT[s] || s || '—';

  const term = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !term || `${r.name || ''} ${r.email || ''} ${r.phone || ''}`.toLowerCase().includes(term))
    .sort((a, b) => {
      // Open requests first, then newest.
      if (!!a.handled !== !!b.handled) return a.handled ? 1 : -1;
      return ((toDate(b.createdAt) || 0) && toDate(b.createdAt).getTime() || 0) - ((toDate(a.createdAt) || 0) && toDate(a.createdAt).getTime() || 0);
    });

  const total = rows.length;
  const grads = rows.filter((r) => isGrad(r)).length;
  const weekAgo = Date.now() - 7 * 86400000;
  const newWeek = rows.filter((r) => { const d = toDate(r.createdAt); return d && d.getTime() >= weekAgo; }).length;
  const open = rows.filter((r) => !r.handled).length;

  const toggleHandled = async (r) => {
    const next = !r.handled;
    setBusyId(r.id);
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, handled: next } : x)));
    try { await updateDoc(doc(db, 'dispatcher_leads', r.id), { handled: next, handledAt: next ? serverTimestamp() : null }); }
    catch (e) { console.error('toggle handled failed', e); setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, handled: !next } : x))); }
    finally { setBusyId(''); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Access Requests</h2>
        <Badge tone="amber" className="font-bold tracking-wide">SUPER</Badge>
      </div>
      <p className="text-slate-400">Everyone who asked for a workspace or finished the crash course. Work them here — mark each one handled once you’ve set them up.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile label="Total Requests" value={total} />
        <StatTile label="Open" value={open} accent="amber" />
        <StatTile label="New (7 days)" value={newWeek} accent="emerald" />
        <StatTile label="Course Grads" value={grads} accent="emerald" />
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, or phone…" className={`${INPUT_CLS} w-full sm:w-72`} />

      {err && <p className="text-amber-400 text-sm">{err}</p>}
      {loading ? <SkelRows rows={5} className="py-6" />
        : filtered.length === 0 ? <Card className="p-10 text-center text-slate-400">No access requests yet.</Card>
        : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <Card key={r.id} className={`p-4 ${r.handled ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold text-white flex items-center gap-2 flex-wrap">
                      {r.name || <span className="text-slate-500">—</span>}
                      {isGrad(r)
                        ? <Badge tone="emerald" className="text-[10px]">🎓 Course grad</Badge>
                        : <Badge tone="amber" className="text-[10px]" title="No completed crash-course record — final exam not confirmed">⚠ Exam not confirmed</Badge>}
                      <Badge tone="slate" className="text-[10px]">{sitLabel(r.situation)}</Badge>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {r.email && <a href={`mailto:${r.email}`} className="hover:text-amber-400">{r.email}</a>}
                      {r.phone && <a href={`tel:${r.phone}`} className="hover:text-amber-400">{r.phone}</a>}
                      <span className="text-slate-500">{ago(r.createdAt)}</span>
                    </div>
                    {r.message && <p className="text-sm text-slate-300 mt-2">{r.message}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!r.handled && (
                      <button
                        onClick={() => {
                          if (!isGrad(r) && !window.confirm(`${r.name || 'This person'} isn't confirmed to have passed the final exam — no completed crash-course record was found for ${r.email || 'their email'}.\n\nSet up their workspace anyway? (They can finish the exam later; this just skips the graduation check.)`)) return;
                          _provisionPrefill = { name: r.name || '', email: r.email || '', situation: r.situation || '', leadId: r.id };
                          if (onNavigate) onNavigate('workspaces');
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400">
                        Set up workspace →
                      </button>
                    )}
                    <button onClick={() => toggleHandled(r)} disabled={busyId === r.id}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 ${r.handled ? 'border border-slate-700 text-slate-400 hover:bg-slate-800' : 'border border-slate-600 text-slate-300 hover:bg-slate-800'}`}>
                      {r.handled ? 'Reopen' : 'Mark handled'}
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}

// ---------- SUPER-ADMIN: CRASH-COURSE PROGRESS ----------
// Reads the global course_progress collection (one row per learner email) so
// the super-admin can see who's mid-course, who stalled, and who finished.
function CourseProgressView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'course_progress'));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('course progress load failed', e); setErr('Could not load — check that the course_progress rule is published.'); }
    finally { setLoading(false); }
  })(); }, []);

  const toDate = (t) => { try { return t && t.toDate ? t.toDate() : (t ? new Date(t) : null); } catch (_) { return null; } };
  const ago = (t) => {
    const d = toDate(t); if (!d) return '—';
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };
  const fmtDate = (t) => { const d = toDate(t); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; };

  const term = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !term || `${r.name || ''} ${r.email || ''}`.toLowerCase().includes(term))
    .sort((a, b) => ((toDate(b.lastActiveAt) || 0) && toDate(b.lastActiveAt).getTime() || 0) - ((toDate(a.lastActiveAt) || 0) && toDate(a.lastActiveAt).getTime() || 0));

  const total = rows.length;
  const completed = rows.filter((r) => r.completed).length;
  const inProgress = total - completed;
  const rate = total ? Math.round((completed / total) * 100) : 0;

  const statusBadge = (r) => r.completed
    ? <Badge tone="emerald">✓ Completed</Badge>
    : ((r.pct || 0) >= 1 ? <Badge tone="amber">In progress</Badge> : <Badge tone="slate">Signed up</Badge>);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Course Progress</h2>
        <Badge tone="amber" className="font-bold tracking-wide">SUPER</Badge>
      </div>
      <p className="text-slate-400">Every crash-course learner, how far they’ve gotten, and when they were last active — one row per email.</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatTile label="Learners" value={total} />
        <StatTile label="In Progress" value={inProgress} accent="amber" />
        <StatTile label="Completed" value={completed} accent="emerald" />
        <StatTile label="Completion Rate" value={rate + '%'} accent="emerald" />
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className={`${INPUT_CLS} w-full sm:w-72`} />

      {err && <p className="text-amber-400 text-sm">{err}</p>}
      {loading ? <SkelRows rows={5} className="py-6" />
        : filtered.length === 0 ? <Card className="p-10 text-center text-slate-400">No course activity yet. Signups appear here as learners start the course.</Card>
        : (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[640px]">
              <thead><tr className="border-b border-slate-800 bg-slate-800/30">
                <Th>Learner</Th><Th>Progress</Th><Th>Status</Th><Th>Started</Th><Th>Last active</Th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                    <Td>
                      <div className="font-medium text-white">{r.name || <span className="text-slate-500">—</span>}</div>
                      <div className="text-xs text-slate-500">{r.email}</div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: Math.min(100, r.pct || 0) + '%' }} /></div>
                        <span className="text-xs text-slate-400 font-data">{r.pct || 0}%</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{r.daysPassed || 0}/{r.totalDays || 14} days completed</div>
                    </Td>
                    <Td>{statusBadge(r)}</Td>
                    <Td className="text-slate-400">{fmtDate(r.startedAt)}</Td>
                    <Td className="text-slate-400">{ago(r.lastActiveAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
    </div>
  );
}

// ---------- SUPER-ADMIN: FMF REVENUE-SHARE (amount due per dispatcher) ----------
// Per FMF dispatcher, sums their dispatch-fee income for a month (from loads
// booked in the portal) and applies the 20% share + monthly minimum, so the
// self-report becomes a system-computed "amount due." Read-only; mirrors the
// dashboard's fee logic (Delivered/Cleared loads, delivery_date in the month).
function FmfRevShareView() {
  const [orgs, setOrgs] = useState([]);
  const [loads, setLoads] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [signedUids, setSignedUids] = useState(new Set()); // uids with a tamper-evident revShareAgreement record
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [month, setMonth] = useState(() => {
    try { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); } catch (_) { return ''; }
  });

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      // Super can read across every workspace, so the tamper-evident record
      // (not the self-writable user-doc marker) is the real source of truth
      // here — the marker is kept as a fallback OR for any legacy/super-
      // written markers that predate this change.
      const [oSnap, lSnap, uSnap, saSnap] = await Promise.all([
        getDocs(collection(db, 'orgs')),
        getDocs(collection(db, 'loads')),
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'signed_agreements'), where('type', '==', 'revShareAgreement'))),
      ]);
      setOrgs(oSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((o) => o.orgType === 'fmf'));
      setLoads(lSnap.docs.map((d) => d.data()));
      const um = {}; uSnap.docs.forEach((d) => { um[d.id] = d.data(); });
      setUserMap(um);
      setSignedUids(new Set(saSnap.docs.map((d) => d.data().uid)));
    } catch (e) { console.error('revshare load failed', e); setErr('Could not load — check that the multi-tenant rules are published.'); }
    finally { setLoading(false); }
  })(); }, []);

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const inMonth = (dateStr) => !!dateStr && !!month && String(dateStr).slice(0, 7) === month;
  const monthLabel = (m) => { try { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch (_) { return m; } };
  const monthOpts = (() => {
    const out = []; try {
      const d = new Date(); d.setDate(1);
      for (let i = 0; i < 12; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); d.setMonth(d.getMonth() - 1); }
    } catch (_) {}
    return out;
  })();

  const rows = orgs.map((o) => {
    const mine = loads.filter((l) => l.orgId === o.id && (l.status === 'Delivered' || l.status === 'Cleared') && inMonth(l.delivery_date));
    const feeIncome = mine.reduce((s, l) => s + (Number(l.gross_pay) || 0) * (feePctOf(l.feePct) / 100), 0);
    const share = feeIncome * (FMF_REVSHARE_PCT / 100);
    const minApplied = share < FMF_REVSHARE_MIN;
    const due = Math.max(share, FMF_REVSHARE_MIN);
    const u = userMap[o.ownerUid] || {};
    const who = u.displayName || o.ownerEmail || o.name || '—';
    const signed = signedUids.has(o.ownerUid) || !!u.revShareAgreement;
    return { id: o.id, who, workspace: o.name, count: mine.length, feeIncome, share, minApplied, due, signed };
  }).sort((a, b) => b.due - a.due);

  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const totalFee = rows.reduce((s, r) => s + r.feeIncome, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-2xl font-bold">FMF Rev-Share</h2>
        <Badge tone="indigo" className="font-bold tracking-wide">SUPER-ADMIN</Badge>
      </div>
      <p className="text-slate-400">What each FMF dispatcher owes for the month — {FMF_REVSHARE_PCT}% of their dispatch-fee income, or the {money(FMF_REVSHARE_MIN)} minimum, whichever is greater. Computed from loads booked in Forward OS.</p>

      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-400">Month</label>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${SELECT_CLS} w-52`}>
          {monthOpts.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatTile label={`Total Due (${monthLabel(month)})`} value={money(totalDue)} accent="emerald" />
        <StatTile label="Total Fee Income" value={money(totalFee)} />
        <StatTile label="FMF Dispatchers" value={orgs.length} />
      </div>

      {err && <p className="text-amber-400 text-sm">{err}</p>}
      {loading ? <SkelRows rows={4} className="py-6" />
        : orgs.length === 0 ? <Card className="p-10 text-center text-slate-400">No FMF dispatchers yet. Classify a workspace as “Forward Motion Freight” to see it here.</Card>
        : (
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  <th className="px-4 py-3">Dispatcher</th>
                  <th className="px-4 py-3 text-right">Loads</th>
                  <th className="px-4 py-3 text-right">Fee income</th>
                  <th className="px-4 py-3 text-right">FMF {FMF_REVSHARE_PCT}%</th>
                  <th className="px-4 py-3 text-right">Amount due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white flex items-center gap-2">{r.who}
                        {!r.signed && <Badge tone="amber" className="text-[10px]">unsigned</Badge>}
                      </div>
                      <div className="text-[11px] text-slate-500">{r.workspace}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">{r.count}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{money(r.feeIncome)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{money(r.share)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-400">
                      {money(r.due)}
                      {r.minApplied && <span className="ml-1 text-[10px] text-amber-400" title={`Below the ${money(FMF_REVSHARE_MIN)} minimum`}>min</span>}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-700">
                  <td className="px-4 py-3 font-bold text-white">Total</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-300">{money(totalFee)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-400">{money(totalDue)}</td>
                </tr>
              </tbody>
            </table>
          </Card>
        )}

      <p className="text-[11px] text-slate-500">Counts loads booked through Forward OS and marked <span className="text-slate-400">Delivered</span> or <span className="text-slate-400">Cleared</span> with a delivery date in the selected month. Loads booked off-platform won’t appear — reconcile against factoring statements if a total looks low. The “min” tag means the {money(FMF_REVSHARE_MIN)} floor applied because {FMF_REVSHARE_PCT}% came out lower.</p>
    </div>
  );
}

function WorkspacesView() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ workspaceName: '', name: '', email: '', pw: '', orgType: 'independent' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [created, setCreated] = useState(null);
  const [err, setErr] = useState('');
  const [prefillLeadId, setPrefillLeadId] = useState(null); // access-request this workspace fulfills
  const [tplText, setTplText] = useState(null);   // editable FMF dispatcher agreement (null = not loaded)
  const [tplSaving, setTplSaving] = useState(false);
  const [tplMsg, setTplMsg] = useState('');
  const newPw = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = ''; for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    return p;
  };
  const genPw = () => setForm((f) => ({ ...f, pw: newPw() }));

  // Pull in a lead handed over from Access Requests ("Set up workspace"): fill
  // the dispatcher's name/email/relationship (FMF also names the workspace so
  // carriers see the FMF brand) and pre-generate a temp password. Runs once.
  useEffect(() => {
    const p = _provisionPrefill;
    if (!p) return;
    _provisionPrefill = null;
    const orgType = p.situation === 'fmf' ? 'fmf' : 'independent';
    setForm((f) => ({
      ...f,
      name: p.name || '',
      email: p.email || '',
      orgType,
      workspaceName: orgType === 'fmf' ? 'Forward Motion Freight' : f.workspaceName,
      pw: f.pw || newPw(),
    }));
    if (p.leadId) setPrefillLeadId(p.leadId);
  }, []);

  // Seed the agreement editor from an existing FMF workspace's saved text (or
  // the built-in default), once the workspaces have loaded. Only sets it once
  // so it never clobbers edits in progress.
  useEffect(() => {
    if (tplText !== null || loading) return;
    const withText = orgs.find((o) => o.orgType === 'fmf' && o.revShareText);
    setTplText(withText ? withText.revShareText : DEFAULT_REVSHARE_TEXT);
  }, [loading, orgs, tplText]);

  const saveTemplate = async () => {
    const fmfOrgs = orgs.filter((o) => o.orgType === 'fmf');
    if (!fmfOrgs.length) { setTplMsg('No FMF workspaces yet — this text will apply to the next FMF dispatcher you provision.'); return; }
    if (!window.confirm(`Update the dispatcher agreement for ${fmfOrgs.length} FMF workspace(s)? New signatures use the new text; already-signed records keep their original wording.`)) return;
    setTplSaving(true); setTplMsg('');
    try {
      for (const o of fmfOrgs) { await updateDoc(doc(db, 'orgs', o.id), { revShareText: tplText }); }
      setOrgs((prev) => prev.map((o) => (o.orgType === 'fmf' ? { ...o, revShareText: tplText } : o)));
      setTplMsg(`Saved to ${fmfOrgs.length} workspace(s) ✓`);
      setTimeout(() => setTplMsg(''), 3000);
    } catch (e) { console.error('agreement template save failed', e); setTplMsg('Could not save — check the console.'); }
    finally { setTplSaving(false); }
  };

  const [ownerStatus, setOwnerStatus] = useState({}); // uid -> active(bool)
  const [ownerActivity, setOwnerActivity] = useState({}); // uid -> { lastLogin, mustChangePassword }
  const fetchOrgs = async () => {
    setLoading(true);
    try {
      // Super can read across every workspace, so the tamper-evident record
      // (not the self-writable user-doc marker) is the real source of truth
      // here — the marker is kept as a fallback OR for any legacy/super-
      // written markers that predate this change.
      const [oSnap, uSnap, saSnap] = await Promise.all([
        getDocs(collection(db, 'orgs')),
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'signed_agreements'), where('type', '==', 'revShareAgreement'))),
      ]);
      setOrgs(oSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const signedUids = new Set(saSnap.docs.map((d) => d.data().uid));
      const st = {}, act = {};
      uSnap.docs.forEach((d) => {
        const u = d.data();
        st[d.id] = u.approved !== false;
        act[d.id] = { lastLogin: u.lastLogin || null, mustChangePassword: u.mustChangePassword === true, revShareSigned: signedUids.has(d.id) || !!u.revShareAgreement };
      });
      setOwnerStatus(st);
      setOwnerActivity(act);
    } catch (e) { console.error('orgs load failed', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchOrgs(); }, []);

  const setOrgType = async (o, value) => {
    try { await updateDoc(doc(db, 'orgs', o.id), { orgType: value }); setOrgs((prev) => prev.map((x) => (x.id === o.id ? { ...x, orgType: value } : x))); }
    catch (e) { console.error('orgType update failed', e); alert('Could not update — check the console.'); }
  };

  // Deactivate / reactivate a dispatcher's access (login can't be hard-deleted
  // from the browser, so we revoke approval — their workspace data is kept).
  const toggleDispatcher = async (o) => {
    if (!o.ownerUid) { alert('No owner on file for this workspace.'); return; }
    const active = ownerStatus[o.ownerUid] !== false;
    const next = !active;
    if (!window.confirm(next
      ? `Reactivate ${o.ownerEmail}? They'll be able to log in again.`
      : `Deactivate ${o.ownerEmail}? They'll be blocked from logging in (their workspace data is kept).`)) return;
    try {
      await setDoc(doc(db, 'users', o.ownerUid), { approved: next }, { merge: true });
      setOwnerStatus((s) => ({ ...s, [o.ownerUid]: next }));
    } catch (e) { console.error('toggle dispatcher failed', e); alert('Could not update — check the console.'); }
  };

  // ---- permanent workspace deletion (super-admin, DEACTIVATED workspaces
  // only) ----
  // Cascade order: every orgId-stamped collection first, then the workspace's
  // user docs (owner + drivers, matched on orgId), then the org doc itself
  // LAST — and only if the sweep was clean, so a partial failure keeps the
  // workspace row around to retry against. Each collection is best-effort:
  // one failing never aborts the rest, failures are reported by name.
  //
  // Two things this CANNOT do from the browser (also spelled out in the UI,
  // both in the confirm panel and the completion summary):
  //   1. The Firebase Auth login still exists — Console → Authentication.
  //   2. Uploaded Storage files (vault docs, PODs) are separate from
  //      Firestore — Console → Storage.
  // WIPE_COLS = BACKFILL_COLS minus `users` (handled separately, last) plus
  // every other orgId-stamped collection in the app: crm_contacts,
  // broker_checks, carrier_checks, schedule_events, vault_docs,
  // signed_agreements, and carrier_packets (public intake stamps orgId).
  // NOT swept (Locke review): `mail` — its rules are read/delete:false for
  // everyone including super (write-only outbox), so even querying it is
  // denied and would wedge the cascade forever; and users/{uid}/private/*
  // (My Corner) — owner-only by design. Both are disclosed in the UI as
  // surviving this delete.
  const WIPE_COLS = ['loads', 'carriers', 'expenses', 'lane_intel', 'compliance', 'safe_parking', 'vehicles', 'fleet_drivers', 'hos_status', 'crm_contacts', 'broker_checks', 'carrier_checks', 'schedule_events', 'vault_docs', 'signed_agreements', 'carrier_packets'];
  const [delTarget, setDelTarget] = useState(null); // org id whose confirm panel is open
  const [delName, setDelName] = useState('');       // typed-name confirmation
  const [delBusy, setDelBusy] = useState(false);
  const [delLog, setDelLog] = useState('');         // live per-collection progress
  const [delDone, setDelDone] = useState(null);     // { name, ownerEmail, total, log } after a clean delete

  const openDelete = (o) => { setDelTarget(o.id); setDelName(''); setDelLog(''); };
  const closeDelete = () => { if (delBusy) return; setDelTarget(null); setDelName(''); setDelLog(''); };

  const deleteWorkspace = async (o) => {
    if (delBusy || !(o.name || '').trim() || delName.trim() !== (o.name || '')) return;
    // Re-check deactivation at execution time (not just at render) so a
    // stale tab can never fire the cascade on a workspace that was
    // reactivated elsewhere in the meantime.
    try {
      const owner = o.ownerUid ? await getDoc(doc(db, 'users', o.ownerUid)) : null;
      if (!owner || !owner.exists() || owner.data().approved !== false) {
        alert('This workspace is not deactivated (or its owner record changed). Deactivate it first, then delete.');
        return;
      }
    } catch (e) { console.error('pre-delete recheck failed', e); alert('Could not verify the workspace is deactivated — try again.'); return; }
    if (!window.confirm(`FINAL CHECK: permanently delete "${o.name}" and every Firestore record in it? This cannot be undone.`)) return;
    setDelBusy(true);
    const lines = [];
    const log = (line) => { lines.push(line); setDelLog(lines.join('\n')); };
    const failures = [];
    let total = 0;
    // `users` is deliberately last in the sweep: data first, people second,
    // and the org doc only after everything else is gone.
    for (const col of [...WIPE_COLS, 'users']) {
      try {
        const snap = await getDocs(query(collection(db, col), where('orgId', '==', o.id)));
        let n = 0, errs = 0;
        for (const d of snap.docs) {
          try { await deleteDoc(doc(db, col, d.id)); n++; }
          catch (e) { errs++; console.error(`delete ${col}/${d.id} failed`, e); }
        }
        total += n;
        if (errs) { failures.push(col); log(`${col}: deleted ${n}, FAILED on ${errs} — left in place`); }
        else log(`${col}: deleted ${n}`);
      } catch (e) {
        console.error(`workspace wipe: ${col} sweep failed`, e);
        failures.push(col);
        log(`${col}: FAILED to query (${e.code || e.message || 'error'}) — skipped, continuing`);
      }
    }
    if (failures.length === 0) {
      try {
        await deleteDoc(doc(db, 'orgs', o.id));
        log('orgs: workspace record deleted');
        setDelDone({ name: o.name, ownerEmail: o.ownerEmail, total, log: lines.join('\n') });
        setDelTarget(null); setDelName(''); setDelLog('');
        fetchOrgs(); // refresh — the deleted workspace drops out of the list
      } catch (e) {
        console.error('org doc delete failed', e);
        log(`orgs: FAILED (${e.code || e.message || 'error'}) — the data sweep finished; retry to remove the workspace record.`);
      }
    } else {
      log(`\nKept the workspace record because ${failures.length} collection(s) had failures: ${failures.join(', ')}. The sweep is safe to re-run — fix (check the console) and retry.`);
    }
    setDelBusy(false);
  };

  // ---- one-time data backfill (super-admin) ----
  const [bfOrg, setBfOrg] = useState('');
  const [bfBusy, setBfBusy] = useState(false);
  const [bfLog, setBfLog] = useState('');
  const BACKFILL_COLS = ['users', 'carriers', 'loads', 'lane_intel', 'expenses', 'compliance', 'safe_parking', 'vehicles', 'fleet_drivers', 'hos_status'];

  const createHomeOrg = async () => {
    setErr('');
    if (!form.workspaceName.trim()) { setErr('Enter a workspace name above first (used as your home workspace name).'); return; }
    setBfBusy(true);
    try {
      const me = auth.currentUser;
      const orgRef = await addDoc(collection(db, 'orgs'), { name: form.workspaceName.trim(), ownerUid: me.uid, ownerEmail: me.email, createdAt: serverTimestamp(), config: {} });
      await setDoc(doc(db, 'users', me.uid), { orgId: orgRef.id, role: 'admin' }, { merge: true });
      setBfLog(`Home workspace created (${orgRef.id.slice(0, 8)}…). Now run the backfill into it, then reload.`);
      setBfOrg(orgRef.id);
      fetchOrgs();
    } catch (e2) { console.error('home org failed', e2); setErr(e2.message || 'Failed to create home workspace.'); }
    finally { setBfBusy(false); }
  };

  const runBackfill = async () => {
    setErr('');
    if (!bfOrg) { setErr('Pick the workspace to stamp existing data into.'); return; }
    if (!window.confirm(`Stamp every unscoped document with orgId "${bfOrg.slice(0, 8)}…"? Run this ONCE, as a one-time migration.`)) return;
    setBfBusy(true); setBfLog('Starting…');
    try {
      let total = 0;
      for (const col of BACKFILL_COLS) {
        const snap = await getDocs(collection(db, col));
        let stamped = 0;
        for (const d of snap.docs) {
          if (!d.data().orgId) { await setDoc(doc(db, col, d.id), { orgId: bfOrg }, { merge: true }); stamped++; }
        }
        total += stamped;
        setBfLog((prev) => `${prev}\n${col}: stamped ${stamped} / ${snap.size}`);
      }
      setBfLog((prev) => `${prev}\n\n✓ Done — ${total} document(s) stamped. Publish the multi-tenant rules, then reload.`);
    } catch (e2) { console.error('backfill failed', e2); setErr(e2.message || 'Backfill failed — check the console.'); }
    finally { setBfBusy(false); }
  };

  const provision = async (e) => {
    e.preventDefault(); setErr(''); setCreated(null);
    if (!form.workspaceName.trim() || !form.email.trim() || form.pw.length < 6) { setErr('Workspace name, dispatcher email, and a 6+ character password are all required.'); return; }
    setSaving(true);
    try {
      const uid = await createDriverAccount(form.email.trim(), form.pw, form.name.trim());
      const orgPayload = { name: form.workspaceName.trim(), ownerUid: uid, ownerEmail: form.email.trim(), orgType: form.orgType, createdAt: serverTimestamp(), config: {} };
      // Seed FMF workspaces with the current (possibly edited) agreement text.
      if (form.orgType === 'fmf') orgPayload.revShareText = (tplText && tplText.trim()) || DEFAULT_REVSHARE_TEXT;
      const orgRef = await addDoc(collection(db, 'orgs'), orgPayload);
      await setDoc(doc(db, 'users', uid), { email: form.email.trim(), displayName: form.name.trim(), approved: true, mustChangePassword: true, orgId: orgRef.id, role: 'admin', createdAt: serverTimestamp() }, { merge: true });
      setCreated({ email: form.email.trim(), pw: form.pw, workspace: form.workspaceName.trim() });
      queueEmail(form.email.trim(), 'Your Forward OS dispatcher access is ready',
        welcomeDispatcherEmail({ name: form.name.trim(), email: form.email.trim(), tempPw: form.pw }));
      setForm({ workspaceName: '', name: '', email: '', pw: '', orgType: 'independent' });
      // Close the loop: if this came from an access request, mark it handled.
      if (prefillLeadId) {
        try { await updateDoc(doc(db, 'dispatcher_leads', prefillLeadId), { handled: true, handledAt: serverTimestamp() }); } catch (_) { /* best-effort */ }
        setPrefillLeadId(null);
      }
      fetchOrgs();
    } catch (e2) {
      console.error('provision failed', e2);
      setErr(e2.code === 'auth/email-already-in-use'
        ? 'That email already has a login. Use a different email, or assign the existing user to a workspace directly in Firestore.'
        : (e2.message || 'Failed').replace('Firebase: ', ''));
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Workspaces</h2>
        <Badge tone="indigo" className="font-bold tracking-wide">SUPER-ADMIN</Badge>
      </div>
      <p className="text-slate-400">Provision an isolated workspace for each dispatcher you onboard. Each workspace only ever sees its own carriers, loads, and intel.</p>
      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs px-4 py-3">
        ⚠️ Provisioning writes to the <strong>orgs</strong> collection and sets each user's <strong>orgId/role</strong>. It only works once the <strong>multi-tenant Firestore rules are published</strong>. Don't switch everyone over until the full conversion + data backfill is done.
      </div>

      <Card className="p-6">
        <form onSubmit={provision} className="space-y-4">
          <h3 className="font-bold">Provision a Dispatcher Workspace</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Dispatcher name"><input className={INPUT_CLS} value={form.name} onChange={set('name')} placeholder="Tanisha Nicholas" /></Field>
            <Field label="Dispatcher email"><input className={INPUT_CLS} type="email" value={form.email} onChange={set('email')} placeholder="dispatcher@example.com" /></Field>
            <Field label="Workspace name" className="sm:col-span-2">
              <input className={INPUT_CLS} value={form.workspaceName} onChange={set('workspaceName')} placeholder="Cole Dispatch Co." />
              <p className="text-[11px] text-slate-500 mt-1">This is the brand their carriers see (header + emails). For an <span className="text-amber-300">FMF dispatcher</span>, use <span className="text-slate-300">“Forward Motion Freight”</span> so carriers see the FMF brand — not the dispatcher’s own name.</p>
            </Field>
            <Field label="Relationship" className="sm:col-span-2">
              <select className={SELECT_CLS} value={form.orgType} onChange={set('orgType')}>
                <option value="independent">Independent — runs their own dispatch business</option>
                <option value="fmf">Working for Forward Motion Freight</option>
              </select>
            </Field>
            <Field label="Temporary password" className="sm:col-span-2">
              <div className="flex gap-2">
                <input className={INPUT_CLS} value={form.pw} onChange={set('pw')} placeholder="6+ characters" />
                <button type="button" onClick={genPw} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 rounded-lg shrink-0">Generate</button>
              </div>
            </Field>
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <PrimaryButton type="submit" disabled={saving} className="px-5">{saving ? 'Provisioning…' : 'Create Workspace + Dispatcher'}</PrimaryButton>

          {created && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-sm">
              <div className="font-semibold text-emerald-400 mb-2">✓ Workspace “{created.workspace}” created — share these with the dispatcher:</div>
              <div className="font-mono text-slate-200">Email: {created.email}</div>
              <div className="font-mono text-slate-200">Temp password: {created.pw}</div>
              <div className="text-xs text-slate-400 mt-2">They'll set their own password on first login.</div>
            </div>
          )}
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold mb-4">Workspaces ({orgs.length})</h3>
        {delDone && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 mb-4 text-xs text-slate-300 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-emerald-400">✓ “{delDone.name}” permanently deleted — {delDone.total} Firestore document(s) removed.</span>
              <button type="button" onClick={() => setDelDone(null)} aria-label="Dismiss summary" className="text-slate-500 hover:text-white shrink-0"><X size={14} /></button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-slate-400 bg-slate-950/60 border border-slate-800 rounded-lg p-3">{delDone.log}</pre>
            <p className="text-amber-300 flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>What this could <strong>not</strong> remove — finish in the Firebase Console if needed: the Auth login for <span className="font-mono text-amber-200">{delDone.ownerEmail}</span> (Authentication → find the user → delete), any uploaded files like vault docs and PODs (Storage), queued outbound email records (the mail collection is write-only), and any private My Corner notes (owner-only by design).</span>
            </p>
          </div>
        )}
        {loading ? <SkelRows rows={3} />
          : orgs.length === 0 ? <div className="text-slate-500 text-sm">No workspaces yet. (Or the orgs rule isn't published.)</div>
          : (
            <div className="space-y-2">
              {orgs.map((o) => {
                const isMe = o.ownerUid && o.ownerUid === auth.currentUser?.uid;
                const active = !o.ownerUid || ownerStatus[o.ownerUid] !== false;
                const activity = (o.ownerUid && ownerActivity[o.ownerUid]) || {};
                const loginMs = activity.lastLogin && activity.lastLogin.toDate ? activity.lastLogin.toDate().getTime() : null;
                return (
                  <div key={o.id}>
                  <div className="flex items-center justify-between gap-3 bg-slate-800/40 border border-slate-700 rounded-xl p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-white truncate">{o.name}</div>
                        {!isMe && (
                          o.orgType === 'fmf'
                            ? <Badge tone="amber" className="text-[10px] shrink-0">Forward Motion Freight</Badge>
                            : o.orgType === 'independent'
                              ? <Badge tone="slate" className="text-[10px] shrink-0">Independent</Badge>
                              : <Badge tone="slate" className="text-[10px] shrink-0 text-amber-300">Unclassified</Badge>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{o.ownerEmail} · {o.id.slice(0, 8)}…</div>
                      {!isMe && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {loginMs
                            ? <span>Last login: {new Date(loginMs).toLocaleString()}</span>
                            : <span className="text-amber-400">Never logged in yet</span>}
                          {' · '}
                          {activity.mustChangePassword
                            ? <span className="text-amber-400">Profile setup pending</span>
                            : loginMs ? <span className="text-emerald-400">Profile set up ✓</span> : null}
                          {o.orgType === 'fmf' && (
                            <>
                              {' · '}
                              {activity.revShareSigned
                                ? <span className="text-emerald-400">Agreement signed ✓</span>
                                : <span className="text-amber-400">Agreement unsigned</span>}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isMe ? <span className="text-[11px] text-slate-400">You</span>
                        : active ? <span className="text-[11px] text-emerald-400">● Active</span>
                        : <span className="text-[11px] text-red-400">● Deactivated</span>}
                      {!isMe && (
                        <select value={o.orgType || ''} onChange={(e) => setOrgType(o, e.target.value)}
                          className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300">
                          <option value="" disabled>Classify…</option>
                          <option value="independent">Independent</option>
                          <option value="fmf">Forward Motion Freight</option>
                        </select>
                      )}
                      {!isMe && (
                        <button onClick={() => toggleDispatcher(o)}
                          className={`text-xs border px-2.5 py-1 rounded-lg ${active ? 'text-red-400 border-red-500/30 hover:bg-red-500/10' : 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                          {active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                      {/* the destructive path only exists once a workspace is
                          already deactivated — an active workspace can never
                          be deleted directly */}
                      {!isMe && !active && delTarget !== o.id && (
                        <button onClick={() => openDelete(o)}
                          className="text-xs border px-2.5 py-1 rounded-lg text-red-400 border-red-500/40 hover:bg-red-500/10 flex items-center gap-1">
                          <Trash2 size={12} /> Delete permanently
                        </button>
                      )}
                    </div>
                  </div>

                  {!isMe && !active && delTarget === o.id && (
                    <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/5 p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                          <p className="font-semibold text-red-300">Permanently delete “{o.name}” — this cannot be undone.</p>
                          <p>
                            <span className="text-slate-100 font-semibold">Deleted:</span> every Firestore record in this workspace — loads, carriers, expenses, lane intel, compliance, safe parking, fleet (vehicles, drivers, HOS), CRM contacts, broker &amp; carrier checks, schedule events, document records, signed agreements, intake packets, and the portal user records (owner + drivers).
                          </p>
                          <p>
                            <span className="text-slate-100 font-semibold">NOT deleted (can’t be done from the browser):</span> the Firebase Auth login for <span className="font-mono text-slate-200">{o.ownerEmail}</span> — remove it in <span className="text-slate-200">Firebase Console → Authentication</span> if you want the email fully gone; any uploaded files (vault docs, PODs), which live in <span className="text-slate-200">Firebase Console → Storage</span>; queued outbound email records (the <span className="font-mono text-slate-200">mail</span> collection is write-only by design); and any private My&nbsp;Corner notes (owner-only by design — even super-admin can’t reach them from the browser; use the Console if they must go).
                          </p>
                        </div>
                      </div>
                      <Field label={`Type the workspace name to confirm: ${o.name}`}>
                        <input className={INPUT_CLS} value={delName} onChange={(e) => setDelName(e.target.value)} placeholder={o.name} disabled={delBusy} autoComplete="off" />
                      </Field>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => deleteWorkspace(o)} disabled={delBusy || delName.trim() !== (o.name || '')}
                          className="text-xs font-semibold bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors">
                          <Trash2 size={13} /> {delBusy ? 'Deleting…' : 'Delete permanently'}
                        </button>
                        <button type="button" onClick={closeDelete} disabled={delBusy}
                          className="text-xs text-slate-400 border border-slate-700 hover:bg-slate-800 px-3 py-2 rounded-lg disabled:opacity-50">
                          Cancel
                        </button>
                      </div>
                      {delLog && <pre className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg p-3 whitespace-pre-wrap font-mono">{delLog}</pre>}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
      </Card>

      <Card className="p-6">
        <h3 className="font-bold mb-1">FMF Dispatcher Agreement</h3>
        <p className="text-slate-400 text-sm mb-3">The revenue-share agreement your FMF dispatchers review and e-sign in the portal. Edit it here, then save. New signatures use the latest text; already-signed records keep the exact wording they signed.</p>
        <div className="rounded-lg bg-slate-800/60 border border-slate-700 text-[11px] text-slate-400 px-3 py-2 mb-3">
          Merge fields (auto-filled per dispatcher — leave them in): <span className="text-slate-300 font-mono">{'{{dispatcher}} {{email}} {{company}} {{sharePct}} {{minimum}} {{effective}} {{exGross}} {{exFeePct}} {{exFee}} {{exShare}}'}</span>. Wrap headings in <span className="text-slate-300 font-mono">**bold**</span>; separate paragraphs with a blank line.
        </div>
        <textarea
          value={tplText || ''}
          onChange={(e) => setTplText(e.target.value)}
          className="w-full h-72 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
          spellCheck={false}
        />
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <PrimaryButton onClick={saveTemplate} disabled={tplSaving || tplText === null} className="px-5">{tplSaving ? 'Saving…' : 'Save agreement text'}</PrimaryButton>
          <button type="button" onClick={() => setTplText(DEFAULT_REVSHARE_TEXT)} className="text-xs text-slate-400 border border-slate-700 hover:bg-slate-800 px-3 py-2 rounded-lg">Reset to default</button>
          {tplMsg && <span className="text-xs text-emerald-400">{tplMsg}</span>}
        </div>
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-slate-400 mb-1">Preview (sample dispatcher)</div>
          <AgreementText text={fillRevShareTokens(tplText || '', { company: 'Forward Motion Freight', dispatcher: 'Tanisha Nicholas', email: 'tanisha@example.com', sharePct: FMF_REVSHARE_PCT, minimum: '$' + FMF_REVSHARE_MIN, effective: '[date signed]', exGross: '$2,000', exFeePct: 8, exFee: '$160', exShare: '$32' })} />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold mb-1">One-Time Data Migration</h3>
        <p className="text-slate-400 text-sm mb-4">
          Your existing carriers, loads, and intel were created before workspaces existed, so they have no <code className="text-slate-300">orgId</code>.
          Stamp them all into your home workspace once, then publish the multi-tenant rules. Order matters: <strong>create home workspace → backfill → publish rules → reload</strong>.
        </p>
        <div className="space-y-3">
          <button type="button" onClick={createHomeOrg} disabled={bfBusy}
            className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 px-4 py-2 rounded-lg disabled:opacity-50">
            1. Create my home workspace
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-400">2. Stamp existing data into</span>
            <select className={SELECT_CLS + ' max-w-xs'} value={bfOrg} onChange={(e) => setBfOrg(e.target.value)}>
              <option value="">Select workspace…</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.id.slice(0, 8)}…)</option>)}
            </select>
            <button type="button" onClick={runBackfill} disabled={bfBusy || !bfOrg}
              className="text-sm bg-amber-500/90 hover:bg-amber-500 text-slate-900 font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
              {bfBusy ? 'Working…' : 'Run backfill'}
            </button>
          </div>
          {bfLog && <pre className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg p-3 whitespace-pre-wrap font-mono">{bfLog}</pre>}
        </div>
      </Card>
    </div>
  );
}

// ---------- NAV ITEM ----------
function NavItem({ icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-3 mx-3 my-0.5 px-3 py-2.5 rounded-md transition-all duration-150 ${
        isActive
          ? 'fm-glow-nav bg-amber-500/10 text-white ring-1 ring-amber-500/30'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
      }`}
      style={{ width: 'calc(100% - 1.5rem)' }}
    >
      <span className={isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}>{icon}</span>
      <span className="font-medium text-sm">{label}</span>
      {isActive && <span className="ml-auto w-1.5 h-1.5 bg-amber-400" />}
    </button>
  );
}

// ============================================================================
// ===== Pass 2 — shared UI primitives (consistent component patterns) ========
// Presentational only; adopt across screens so every panel/form/table matches.
// ============================================================================

// Standardized control styling, reused by every form in the app.
const INPUT_CLS = 'w-full bg-slate-800/80 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-colors';
const SELECT_CLS = INPUT_CLS;
const LABEL_CLS = 'block text-xs font-medium text-slate-400 mb-1.5';

// Standard surface panel. Pass 3: flatter, squarer "operations console" look
// (hairline border, no drop shadow) so the portal reads like a tool, not a
// brochure — deliberately distinct from the rounded marketing-site cards.
function Card({ children, className = '', ...rest }) {
  return (
    <div className={`bg-slate-900/60 border border-slate-800/80 rounded-md shadow-e1 transition-colors ${className}`} {...rest}>
      {children}
    </div>
  );
}

// Panel/section header: a vertical accent rail + title, optional icon, inline
// badge, right-aligned action. The rail gives screens a console-like structure.
function PanelHeader({ icon, title, accent = 'amber', badge, action, className = '' }) {
  // NOTE: `warn` is the coral warning hue (amber in Classic) — use it for
  // caution states so the brand gold stays reserved for brand/primary.
  const accentCls = { amber: 'text-amber-500', blue: 'text-blue-400', emerald: 'text-emerald-400', slate: 'text-slate-400', warn: 'text-warn-500', red: 'text-red-400' }[accent] || 'text-amber-500';
  const railCls = { amber: 'bg-amber-500', blue: 'bg-blue-400', emerald: 'bg-emerald-400', slate: 'bg-slate-500', warn: 'bg-warn-500', red: 'bg-red-500' }[accent] || 'bg-amber-500';
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h3 className="text-base font-semibold text-white flex items-center gap-2.5 min-w-0">
        <span className={`w-1 h-4 shrink-0 ${railCls}`} />
        {icon && <span className={`${accentCls} shrink-0`}>{icon}</span>}
        <span className="truncate">{title}</span>
        {badge}
      </h3>
      {action}
    </div>
  );
}

// Compact stat tile — label over a bold value, with a left accent rail so a
// row of metrics reads like a dashboard readout.
function StatTile({ label, value, accent = 'white', className = '', glow = false }) {
  const v = { white: 'text-white', emerald: 'text-emerald-400', amber: 'text-amber-400', blue: 'text-blue-400', red: 'text-red-400', slate: 'text-slate-300', warn: 'text-warn-400' }[accent] || 'text-white';
  const rail = { white: 'border-l-slate-600', emerald: 'border-l-emerald-500', amber: 'border-l-amber-500', blue: 'border-l-blue-400', red: 'border-l-red-500', slate: 'border-l-slate-600', warn: 'border-l-warn-500' }[accent] || 'border-l-slate-600';
  return (
    <div className={`bg-slate-800/40 border border-slate-700/60 border-l-2 ${rail} rounded-sm p-4 ${className}`}>
      <div className="font-data text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">{label}</div>
      <div className={`font-data text-xl font-semibold ${v} ${glow ? 'fm-profit' : ''}`}>{value}</div>
    </div>
  );
}

// Injected once at the app root: tabular numerals for data figures plus the
// micro-interaction keyframes. Lives here — not in index.html/tailwind
// config — so the whole skin still deploys by pasting this one file.
const PROFIT_GLOW_CSS = `
.font-data{font-variant-numeric:tabular-nums}
@keyframes fmProfitGlow{0%,100%{text-shadow:0 0 0 rgb(var(--tw-emerald-500) / 0)}50%{text-shadow:0 0 16px rgb(var(--tw-emerald-500) / .6)}}
.fm-profit{animation:fmProfitGlow 2.6s ease-in-out infinite}
@keyframes fmViewIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.fm-view{animation:fmViewIn .22s ease-out both}
@keyframes fmShimmer{from{background-position:-200% 0}to{background-position:200% 0}}
.fm-skel{background:linear-gradient(90deg,rgb(var(--tw-slate-400) / .08) 25%,rgb(var(--tw-slate-400) / .18) 50%,rgb(var(--tw-slate-400) / .08) 75%);background-size:200% 100%;animation:fmShimmer 1.4s linear infinite;border-radius:3px}
.fm-press{transition:transform .08s ease}
.fm-press:active{transform:translateY(1px)}
@keyframes fmToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.fm-toast{animation:fmToastIn .18s ease-out both}
@keyframes fmFFShake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
.fm-ff-shake{animation:fmFFShake .35s linear}
@media (min-width:768px){.fm-fit-vh{max-height:calc(100vh - 150px);max-height:calc(100svh - 150px);overflow-y:auto}}
@media (prefers-reduced-motion: reduce){.fm-profit,.fm-view,.fm-skel,.fm-toast,.fm-ff-shake{animation:none}}`;

// Animate a number toward its target (eased, ~0.7s). Respects reduced motion.
// Use on headline money figures so totals "roll in" instead of popping.
function useCountUp(target, dur = 700) {
  const [val, setVal] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const to = Number(target) || 0;
    prevRef.current = to;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    if (reduce || from === to) { setVal(to); return; }
    let raf;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setVal(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
}

// Colored status pill.
function Badge({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    // Decoupled warning hue — coral in Night Haul, amber in Classic.
    warn: 'bg-warn-500/20 text-warn-400 border-warn-500/30',
  };
  return <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-sm border ${tones[tone] || tones.slate} ${className}`}>{children}</span>;
}

// Shimmer placeholder rows shown while a list loads — reads as "the console
// is working," not frozen. Drop-in replacement for the plain "Loading…" text.
function SkelRows({ rows = 3, className = '' }) {
  return (
    <div className={`space-y-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="fm-skel h-10 w-full" style={{ opacity: 1 - i * 0.22 }} />
      ))}
    </div>
  );
}

// Labeled form field wrapper.
function Field({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label className={LABEL_CLS}>{label}</label>}
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1.5">{hint}</p>}
    </div>
  );
}

// Buttons — consistent primary / ghost treatments.
function PrimaryButton({ children, className = '', ...rest }) {
  // `fm-glow-cta`: breathing gold halo in Night Haul only (inert in Classic).
  return <button className={`fm-press fm-glow-cta inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded transition-colors disabled:opacity-50 ${className}`} {...rest}>{children}</button>;
}
function GhostButton({ children, className = '', ...rest }) {
  return <button className={`fm-press inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2 rounded transition-colors disabled:opacity-50 ${className}`} {...rest}>{children}</button>;
}

// Table primitives — consistent header + cell styling.
function Th({ children, className = '' }) {
  return <th className={`font-data text-left text-[10px] font-medium text-slate-500 uppercase tracking-[0.14em] px-4 py-3 ${className}`}>{children}</th>;
}
function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 text-sm text-slate-300 align-middle ${className}`}>{children}</td>;
}

// ---------- LOAD PAPERWORK: COLLECT & CONFIRM ----------
// Storage-free reminder keyed to load status. Each stage lists the documents
// to collect, then you CONFIRM the stage (not a per-item checklist). Shown to
// BOTH the dispatcher (All Loads) and the carrier (Lane Management); the
// confirmation persists on the load doc so both sides share it. Carriers and
// dispatchers can hide it in Settings once they've got the workflow down.
const LOAD_STEPS = [
  { key: 'dispatched', label: 'Before you dispatch the driver (broker paperwork)', items: [
    'First load with this broker? Complete the Carrier Setup Packet: signed Broker-Carrier Agreement, W-9, Certificate of Insurance (COI) & a copy of the carrier’s FMCSA operating authority',
    'Rate Confirmation received — review it line-by-line against the verbal deal (rate, freight details, pickup/delivery times, accessorials like fuel surcharge & detention)',
    'RateCon signed and returned to the broker — do NOT send the driver to the shipper until it’s signed & returned',
    'Broker’s $75,000 surety bond verified active in FMCSA (use the Broker Check tab) to protect against non-payment',
    'Proof package started: save the RateCon, load-board screenshot & communication logs to guard against double-brokering',
    'Pickup number, appointment time & facility address confirmed',
  ] },
  { key: 'shipper', label: 'At the shipper / pickup (BOL)', items: [
    'Bill of Lading (BOL) received from the shipper',
    'Commodity, weight & piece count on the BOL verified against the freight actually loaded',
    'Freight inspected for visible damage — note any exceptions or shortages on the BOL BEFORE signing (protects the carrier from liability)',
    'BOL signed by BOTH the driver and the shipper',
    'If the trailer was pre-loaded & sealed: the seal number on the trailer matches the seal number on the BOL',
    'Driver check-in / arrival time logged (protects detention pay)',
  ] },
  { key: 'delivered', label: 'At the receiver / delivery (POD → invoice)', items: [
    'Driver presents the BOL; the receiver inspects and signs — the signed BOL becomes the Proof of Delivery (POD)',
    'Any damage or missing freight documented factually on the BOL before the receiver signs',
    'Lumper receipts & any detention documentation collected',
    'Combine the signed RateCon + signed POD + invoice (+ lumper receipts) and send to the broker/factoring company for payment',
    'Every document saved to the Document Vault',
  ] },
];

function LoadStepChecklist({ load, onPersist, title = 'Paperwork to Collect', forCarrier = false }) {
  // The broker-paperwork stage (Carrier Setup Packet, RateCon to broker, surety
  // bond) is the dispatcher's job — carriers only see the pickup (BOL) and
  // delivery (POD) stages.
  const stages = forCarrier ? LOAD_STEPS.filter((m) => m.key !== 'dispatched') : LOAD_STEPS;
  const remindersOn = (() => { try { return localStorage.getItem('fm_paperwork') !== '0'; } catch (_) { return true; } })();
  const [steps, setSteps] = useState(() => (load && load.steps) || {});
  useEffect(() => { setSteps((load && load.steps) || {}); }, [load && load.id]);
  if (!remindersOn) return null;

  const st = (load && load.status) || '';
  const currentKey = (st === 'Delivered' || st === 'Cleared') ? 'delivered'
    : (st === 'Arrived at Shipper' || st === 'Loaded' || st === 'In Transit') ? 'shipper'
    : forCarrier ? 'shipper' // carriers don't see the broker stage — their first action is the BOL at pickup
    : 'dispatched';
  const confirmStage = (mk) => {
    setSteps((s) => {
      const ns = { ...s, [mk + ':confirmed']: true };
      if (onPersist) onPersist(ns);
      return ns;
    });
  };

  return (
    <Card className="p-6">
      <PanelHeader icon={<FileText size={20} />} title={title} />
      <p className="text-sm text-slate-400 mt-1">Make sure you have these in hand, then confirm before moving the load forward. (Turn these reminders off in Settings anytime.)</p>
      <GuidedHint>Missing paperwork is the #1 reason a load pays late — or not at all. Secure the RateCon and send your NOA the moment an offer is accepted, get the BOL signed at pickup, and the signed POD at delivery.</GuidedHint>
      <div className="space-y-4 mt-4">
        {stages.map((m) => {
          const confirmed = !!steps[m.key + ':confirmed'];
          const isCurrent = m.key === currentKey;
          return (
            <div key={m.key} className={`rounded-xl border p-4 ${confirmed ? 'border-emerald-500/30 bg-emerald-500/5' : isCurrent ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-700 bg-slate-800/40'}`}>
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="font-semibold text-white text-sm flex items-center gap-2">
                  {m.label}
                  {confirmed ? <Badge tone="emerald"><CheckCircle2 size={11} /> Confirmed</Badge> : isCurrent ? <Badge tone="amber">Do this now</Badge> : null}
                </div>
              </div>
              <ul className="space-y-1.5">
                {m.items.map((it, i) => (
                  <li key={i} className={`flex items-start gap-2.5 text-sm ${confirmed ? 'text-slate-500' : 'text-slate-200'}`}>
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${confirmed ? 'bg-emerald-500/60' : 'bg-amber-400'}`} />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
              {!confirmed && (
                <PrimaryButton onClick={() => confirmStage(m.key)} className="mt-3 text-sm">✓ Confirm I have these</PrimaryButton>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ---------- ADMIN: CRM / NETWORK ----------
const LEAD_STATUSES = ['New Lead', 'Contacted', 'Negotiating', 'Onboarded'];
const LEAD_STATUS_TONE = {
  'New Lead': 'bg-slate-700 text-slate-200',
  'Contacted': 'bg-blue-500/20 text-blue-300',
  'Negotiating': 'bg-amber-500/20 text-amber-300',
  'Onboarded': 'bg-emerald-500/20 text-emerald-300',
};

function CrmView({ onNavigate }) {
  const [tab, setTab] = useState('lead'); // 'lead' | 'broker'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent'); // 'recent' | 'name' | 'status'
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const blank = { name: '', company: '', phone: '', email: '', mc: '', equipment: '', serviceAreas: '', notes: '' };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [tagDraft, setTagDraft] = useState({}); // id -> draft tag text

  const fetchRows = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(orgScoped('crm_contacts'));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error('crm load failed', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchRows(); }, []);

  const addContact = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = stampOrg({
        type: tab, name: form.name.trim(), company: form.company.trim(), phone: form.phone.trim(),
        email: form.email.trim(), mc: form.mc.trim(), equipment: form.equipment.trim(),
        serviceAreas: form.serviceAreas.trim(), notes: form.notes.trim(), tags: [],
        status: tab === 'lead' ? 'New Lead' : '', lastContact: '',
        createdAtMs: Date.now(), createdAt: serverTimestamp(),
      });
      const ref = await addDoc(collection(db, 'crm_contacts'), payload);
      setRows((p) => [{ id: ref.id, ...payload }, ...p]);
      setForm(blank); setShowForm(false);
    } catch (e2) { console.error('crm add failed', e2); alert('Could not save — check the console.'); }
    finally { setSaving(false); }
  };

  const patch = async (row, changes) => {
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, ...changes } : r)));
    try { await updateDoc(doc(db, 'crm_contacts', row.id), changes); }
    catch (e) { console.error('crm update failed', e); fetchRows(); }
  };
  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.name} from your network?`)) return;
    setRows((p) => p.filter((r) => r.id !== row.id));
    try { await deleteDoc(doc(db, 'crm_contacts', row.id)); } catch (e) { console.error('crm delete failed', e); }
  };
  const addTag = (row) => {
    const t = (tagDraft[row.id] || '').trim();
    if (!t) return;
    const tags = Array.from(new Set([...(row.tags || []), t]));
    patch(row, { tags });
    setTagDraft((s) => ({ ...s, [row.id]: '' }));
  };
  const removeTag = (row, t) => patch(row, { tags: (row.tags || []).filter((x) => x !== t) });

  // Lead -> Onboarded auto-creates a carrier so there's no double entry.
  const setStatus = async (row, status) => {
    await patch(row, { status });
    if (status === 'Onboarded' && !row.convertedCarrierId) {
      if (window.confirm(`Mark ${row.name} as onboarded and add them to your Carriers list now?`)) {
        try {
          const cref = await addDoc(collection(db, 'carriers'), stampOrg({
            name: row.company || row.name, mcNumber: row.mc || '', driverName: row.name || '',
            phone: row.phone || '', trailerType: row.equipment || '', preferredLanes: row.serviceAreas || '',
            feePct: DEFAULT_FEE_PCT, availability: 'Available', vipConcierge: false,
            fromCrm: true, createdAt: serverTimestamp(),
          }));
          await patch(row, { convertedCarrierId: cref.id });
          alert(`${row.name} added to Carriers. Open the Carriers tab to finish their profile & create a login.`);
        } catch (e) { console.error('convert failed', e); alert('Could not auto-create the carrier — add them manually in Carriers.'); }
      }
    }
  };

  const list = rows
    .filter((r) => (r.type || 'lead') === tab)
    .filter((r) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [r.name, r.company, r.serviceAreas, r.equipment, (r.tags || []).join(' ')].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'status') return LEAD_STATUSES.indexOf(a.status) - LEAD_STATUSES.indexOf(b.status);
      return (b.createdAtMs || 0) - (a.createdAtMs || 0);
    });

  const field = INPUT_CLS;
  const today = () => { try { return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) { return ''; } };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">CRM / Network</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Your relationships are your business. Track the brokers you trust and the carriers you're courting — searchable, taggable, and always growing.</p>
      <GuidedHint>Log every broker you'd work with again and every carrier lead you cold-call. Tag them ("Quick Pay", "Heavy Haul", "Difficult Access") so when a load hits your desk you can filter your network in seconds. Move a lead to "Onboarded" and it drops straight into your Carriers list.</GuidedHint>

      <div className="flex items-center gap-2">
        <button onClick={() => setTab('lead')} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${tab === 'lead' ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'}`}>Lead Pipeline</button>
        <button onClick={() => setTab('broker')} className={`px-4 py-2 rounded-lg text-sm font-semibold border ${tab === 'broker' ? 'bg-amber-500 text-slate-950 border-amber-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'}`}>Trusted Brokers</button>
        <PrimaryButton onClick={() => { setForm(blank); setShowForm((s) => !s); }} className="ml-auto text-sm"><Plus size={16} /> Add {tab === 'lead' ? 'Lead' : 'Broker'}</PrimaryButton>
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={addContact} className="space-y-4">
            <h3 className="font-bold">{tab === 'lead' ? 'New Carrier Lead' : 'New Trusted Broker'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={tab === 'lead' ? 'Contact / Driver name' : 'Contact name'}><input className={field} value={form.name} onChange={set('name')} placeholder="Jordan Bell" /></Field>
              <Field label={tab === 'lead' ? 'Company (carrier)' : 'Brokerage'}><input className={field} value={form.company} onChange={set('company')} placeholder={tab === 'lead' ? 'Bell Trucking LLC' : 'TQL / RXO / Coyote'} /></Field>
              <Field label="Phone"><input className={field} value={form.phone} onChange={set('phone')} /></Field>
              <Field label="Email"><input className={field} type="email" value={form.email} onChange={set('email')} /></Field>
              <Field label={tab === 'lead' ? 'MC / DOT' : 'Brokerage MC'}><input className={field} value={form.mc} onChange={set('mc')} placeholder="MC-123456" /></Field>
              {tab === 'lead' && <Field label="Equipment"><input className={field} value={form.equipment} onChange={set('equipment')} placeholder="Reefer / Flatbed" /></Field>}
              <Field label={tab === 'lead' ? 'Service areas / lanes' : 'Lanes they cover'} className="sm:col-span-2"><input className={field} value={form.serviceAreas} onChange={set('serviceAreas')} placeholder="TX ↔ Southeast" /></Field>
              <Field label="Notes" className="sm:col-span-2"><input className={field} value={form.notes} onChange={set('notes')} placeholder={tab === 'lead' ? 'Where you found them, follow-up timing…' : 'Reliability, pay speed, accessorials…'} /></Field>
            </div>
            <div className="flex items-center gap-3">
              <PrimaryButton type="submit" disabled={saving} className="px-5">{saving ? 'Saving…' : 'Save'}</PrimaryButton>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input className={field + ' max-w-xs'} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab === 'lead' ? 'leads' : 'brokers'} or tags…`} />
        <select className={SELECT_CLS + ' max-w-[10rem]'} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Newest first</option>
          <option value="name">Name A–Z</option>
          {tab === 'lead' && <option value="status">By stage</option>}
        </select>
        <span className="text-xs text-slate-500 ml-auto">{list.length} {tab === 'lead' ? 'lead(s)' : 'broker(s)'}</span>
      </div>

      {loading ? <div className="text-slate-500 text-center py-12">Loading your network…</div>
        : list.length === 0 ? <div className="text-slate-500 text-center py-12">No {tab === 'lead' ? 'leads' : 'brokers'} yet — add your first.</div>
        : (
          <div className="space-y-3">
            {list.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold text-white">{r.name}{r.company ? <span className="text-slate-400 font-normal"> · {r.company}</span> : ''}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {r.phone && <a href={`tel:${r.phone}`} className="hover:text-amber-400">{r.phone}</a>}
                      {r.email && <span>{r.email}</span>}
                      {r.mc && <span>{r.mc}</span>}
                      {r.equipment && <span>{r.equipment}</span>}
                      {r.serviceAreas && <span>{r.serviceAreas}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tab === 'lead' && (
                      <select value={r.status || 'New Lead'} onChange={(e) => setStatus(r, e.target.value)}
                        className={`text-xs font-semibold rounded-lg px-2 py-1.5 border border-slate-700 ${LEAD_STATUS_TONE[r.status] || 'bg-slate-700 text-slate-200'}`}>
                        {LEAD_STATUSES.map((s) => <option key={s} value={s} className="bg-slate-900 text-white">{s}</option>)}
                      </select>
                    )}
                    {tab === 'broker' && (
                      <button onClick={() => onNavigate && onNavigate('brokercheck')} className="text-xs text-blue-300 border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 rounded-lg hover:bg-blue-500/20">Check authority</button>
                    )}
                    <button onClick={() => remove(r)} className="text-xs text-red-400 border border-red-500/30 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10">Remove</button>
                  </div>
                </div>

                {r.notes && <p className="text-sm text-slate-300 mt-3">{r.notes}</p>}

                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  {(r.tags || []).map((t) => (
                    <span key={t} className="text-[11px] bg-slate-800 text-slate-300 border border-slate-700 rounded-full pl-2.5 pr-1 py-0.5 flex items-center gap-1">
                      {t}<button onClick={() => removeTag(r, t)} className="text-slate-500 hover:text-red-400 w-4">×</button>
                    </span>
                  ))}
                  <input value={tagDraft[r.id] || ''} onChange={(e) => setTagDraft((s) => ({ ...s, [r.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(r); } }}
                    placeholder="+ tag" className="text-[11px] bg-slate-900 border border-slate-800 rounded-full px-2.5 py-1 w-20 focus:w-28 transition-all outline-none" />
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs">
                  <button onClick={() => patch(r, { lastContact: today() })} className="text-amber-400 hover:underline">Log contact today</button>
                  {r.lastContact && <span className="text-slate-500">Last contact: {r.lastContact}</span>}
                  {r.convertedCarrierId && <span className="text-emerald-400">✓ In Carriers</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}

// ---------- ADMIN: WEEKLY DISPATCH INVOICES ----------
// Auto-builds a per-carrier invoice from delivered loads in a week (gross × the
// load's fee %). Export to CSV or print/Save-PDF. No new collection — derived
// entirely from existing loads/carriers.
function InvoicesView() {
  const [loads, setLoads] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [emailByUid, setEmailByUid] = useState({});
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [open, setOpen] = useState(null); // expanded carrier uid
  const [orgInfo, setOrgInfo] = useState({ name: '' });
  const brandName = orgInfo.name || 'Forward Motion Freight';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [lSnap, cSnap, uSnap] = await Promise.all([getDocs(orgScoped('loads')), getDocs(orgScoped('carriers')), getDocs(orgScoped('users'))]);
        setLoads(lSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarriers(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        const em = {}; uSnap.docs.forEach((d) => { em[d.id] = d.data().email || d.id; });
        setEmailByUid(em);
      } catch (e) { console.error('invoices load failed', e); }
      finally { setLoading(false); }
    })();
  }, []);

  // Co-brand the invoice email/print to the workspace, not a hardcoded name.
  useEffect(() => { (async () => {
    if (!ACTIVE_ORG) return;
    try { const o = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (o.exists()) setOrgInfo({ name: o.data().name || '' }); } catch (_) {}
  })(); }, []);

  const weekRange = (offset) => {
    const d = new Date();
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - day + offset * 7); d.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setDate(end.getDate() + 7);
    return { start: d, end };
  };
  const { start, end } = weekRange(weekOffset);
  const fmtD = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const money = (x) => '$' + (Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const weekLabel = `${fmtD(start)} – ${fmtD(new Date(end.getTime() - 86400000))}`;

  const carrierByUid = {};
  carriers.forEach((c) => { if (c.linkedDriverUid) carrierByUid[c.linkedDriverUid] = c; });

  const inWeek = (l) => {
    const delivered = l.status === 'Delivered' || l.status === 'Cleared';
    if (!delivered) return false;
    const ds = l.delivery_date ? new Date(l.delivery_date + 'T00:00:00') : null;
    return ds && ds >= start && ds < end;
  };
  const groups = {};
  loads.filter(inWeek).forEach((l) => { const k = l.uid || 'unknown'; (groups[k] = groups[k] || []).push(l); });

  const invoiceFor = (uid, items) => {
    const c = carrierByUid[uid];
    const name = (c && c.name) || emailByUid[uid] || 'Carrier';
    const lines = items.map((l) => {
      const gross = Number(l.gross_pay) || 0;
      // Load's own fee % if it was actually set (0 counts as set), else the
      // carrier's fee %, else the default — feePctOf handles each fallback
      // step without letting a deliberate 0 get coerced to DEFAULT_FEE_PCT.
      const loadFeeSet = l.feePct !== '' && l.feePct !== null && l.feePct !== undefined && Number.isFinite(Number(l.feePct));
      const pct = loadFeeSet ? feePctOf(l.feePct) : feePctOf(c && c.feePct);
      return { loadId: l.loadId || l.id, lane: `${l.origin || '?'} → ${l.destination || '?'}`, date: l.delivery_date || '', gross, pct, fee: gross * pct / 100 };
    });
    return { uid, name, mc: c && c.mcNumber, email: emailByUid[uid], lines,
      loadIds: items.map((l) => l.id),
      paid: items.length > 0 && items.every((l) => l.invoicePaid === true),
      totalGross: lines.reduce((s, x) => s + x.gross, 0), totalFee: lines.reduce((s, x) => s + x.fee, 0) };
  };
  const invoices = Object.entries(groups).map(([uid, items]) => invoiceFor(uid, items)).sort((a, b) => b.totalFee - a.totalFee);
  const weekFee = invoices.reduce((s, i) => s + i.totalFee, 0);
  const collectedFee = invoices.filter((i) => i.paid).reduce((s, i) => s + i.totalFee, 0);
  const outstandingFee = weekFee - collectedFee;

  // Mark every load on this invoice paid/unpaid. Persists on the loads
  // themselves so the status is remembered across weeks and sessions.
  const setInvoicePaid = async (inv, paid) => {
    setLoads((prev) => prev.map((l) => (inv.loadIds.includes(l.id) ? { ...l, invoicePaid: paid } : l)));
    try {
      await Promise.all(inv.loadIds.map((id) => updateDoc(doc(db, 'loads', id), { invoicePaid: paid, invoicePaidAt: paid ? serverTimestamp() : null })));
    } catch (e) { console.error('mark paid failed', e); }
  };

  const exportCsv = (inv) => {
    const rows = [['Load', 'Lane', 'Delivered', 'Gross', 'Fee %', 'Dispatch Fee']];
    inv.lines.forEach((x) => rows.push([x.loadId, x.lane, x.date, x.gross.toFixed(2), x.pct + '%', x.fee.toFixed(2)]));
    rows.push(['', '', 'TOTAL', inv.totalGross.toFixed(2), '', inv.totalFee.toFixed(2)]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `invoice_${inv.name.replace(/\s+/g, '_')}_${weekLabel.replace(/[^\w]+/g, '-')}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  // Open a pre-addressed email to the carrier with the invoice itemized in the
  // body. Uses the dispatcher's own email client (mailto:) so it works today
  // with no backend/cost; when the Trigger Email extension is live this can be
  // swapped for a true one-click auto-send.
  const emailInvoice = (inv) => {
    if (!inv.email) { toast(`No email on file for ${inv.name}. Add the carrier's email (Carriers tab) to send their invoice.`, 'info'); return; }
    const lines = inv.lines.map((x) => `  • ${x.loadId}  ${x.lane}  (${x.date})  gross ${money(x.gross)} × ${x.pct}% = ${money(x.fee)}`).join('\n');
    const subject = `${brandName} — Dispatch Invoice · Week of ${weekLabel}`;
    const body =
`Hi ${inv.name},

Here is your dispatch invoice for the week of ${weekLabel}.

Loads delivered:
${lines}

Total gross: ${money(inv.totalGross)}
Dispatch fee due: ${money(inv.totalFee)}

Payable per your dispatch agreement. Reply here with any questions.

Thank you,
${brandName}`;
    window.location.href = `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const printInvoice = (inv) => {
    const w = window.open('', '_blank'); if (!w) { toast('Allow pop-ups to print the invoice.', 'info'); return; }
    // Self-XSS today (it's the dispatcher's own popup), but escape at the
    // document.write boundary anyway — same rule as the email templates.
    const safeName = escapeHtml(inv.name);
    const safeMc = escapeHtml(inv.mc);
    const safeBrand = escapeHtml(brandName);
    const rowsHtml = inv.lines.map((x) => `<tr><td>${escapeHtml(x.loadId)}</td><td>${escapeHtml(x.lane)}</td><td>${escapeHtml(x.date)}</td><td style="text-align:right">${money(x.gross)}</td><td style="text-align:right">${x.pct}%</td><td style="text-align:right">${money(x.fee)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>Invoice — ${safeName}</title><style>body{font-family:Arial,sans-serif;color:#111;max-width:720px;margin:30px auto;padding:0 16px}h1{color:#0a0f1a;margin-bottom:2px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:13px}th{background:#f4f4f4}.tot{font-weight:bold;font-size:15px;text-align:right;margin-top:10px}.muted{color:#666;font-size:12px}</style></head><body><h1>${safeBrand}</h1><div class="muted">Dispatch Invoice · Week of ${weekLabel}</div><h2>Bill to: ${safeName}${inv.mc ? ' (' + safeMc + ')' : ''}</h2><table><thead><tr><th>Load</th><th>Lane</th><th>Delivered</th><th>Gross</th><th>Fee %</th><th>Dispatch Fee</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="tot">Total gross: ${money(inv.totalGross)}</div><div class="tot">Dispatch fee due: ${money(inv.totalFee)}</div><p class="muted">Generated by Forward OS. Payable per your dispatch agreement.</p></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (_) {} }, 300);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Weekly Invoices</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Auto-built from each carrier's delivered loads this week — ready to export and bill.</p>
      <GuidedHint>Pick a week, and the system totals each carrier's delivered loads × your dispatch fee. <strong>Email</strong> sends the invoice straight to the carrier, or export to CSV / Print-PDF for your records. This is your weekly billing, done.</GuidedHint>

      <div className="flex items-center gap-3">
        <GhostButton onClick={() => setWeekOffset((w) => w - 1)} className="text-sm">← Prev</GhostButton>
        <div className="text-center">
          <div className="font-semibold text-white">Week of {weekLabel}</div>
          <div className="text-xs text-slate-500">{weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : `${Math.abs(weekOffset)} weeks ${weekOffset < 0 ? 'ago' : 'ahead'}`}</div>
        </div>
        <GhostButton onClick={() => setWeekOffset((w) => w + 1)} className="text-sm">Next →</GhostButton>
        <div className="ml-auto flex items-center gap-5 text-right">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Outstanding</div>
            <div className="text-lg font-bold text-amber-400">{money(outstandingFee)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">Collected</div>
            <div className="text-lg font-bold text-emerald-400">{money(collectedFee)}</div>
          </div>
        </div>
      </div>

      {loading ? <SkelRows rows={4} className="py-6" />
        : invoices.length === 0 ? <div className="text-slate-500 text-center py-12">No delivered loads in this week.</div>
        : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <Card key={inv.uid} className={`p-5 ${inv.paid ? 'border-emerald-500/30' : ''}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button onClick={() => setOpen(open === inv.uid ? null : inv.uid)} className="text-left min-w-0">
                    <div className="font-bold text-white flex items-center gap-2">{inv.name}{inv.mc ? <span className="text-slate-400 font-normal"> · {inv.mc}</span> : ''}
                      {inv.paid ? <Badge tone="emerald" className="text-[10px]">Paid</Badge> : <Badge tone="amber" className="text-[10px]">Unpaid</Badge>}
                    </div>
                    <div className="text-xs text-slate-400">{inv.lines.length} load(s) · gross {money(inv.totalGross)}</div>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Fee due</div>
                      <div className={`text-lg font-bold ${inv.paid ? 'text-slate-500 line-through' : 'text-emerald-400'}`}>{money(inv.totalFee)}</div>
                    </div>
                    <button onClick={() => setInvoicePaid(inv, !inv.paid)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${inv.paid ? 'border border-slate-700 text-slate-400 hover:bg-slate-800' : 'bg-emerald-500 text-slate-950'}`}>
                      {inv.paid ? 'Mark unpaid' : 'Mark paid'}
                    </button>
                    <button onClick={() => exportCsv(inv)} className="text-xs border border-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg hover:bg-slate-800">CSV</button>
                    <button onClick={() => emailInvoice(inv)} title={inv.email ? `Email to ${inv.email}` : 'No carrier email on file'}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border ${inv.email ? 'border-blue-500/40 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20' : 'border-slate-800 text-slate-600'}`}>Email</button>
                    <button onClick={() => printInvoice(inv)} className="text-xs bg-amber-500 text-slate-950 font-semibold px-3 py-1.5 rounded-lg">Print / PDF</button>
                  </div>
                </div>
                {open === inv.uid && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-[11px] uppercase text-slate-500 text-left"><th className="py-1.5 pr-3">Load</th><th className="py-1.5 pr-3">Lane</th><th className="py-1.5 pr-3">Delivered</th><th className="py-1.5 pr-3 text-right">Gross</th><th className="py-1.5 pr-3 text-right">Fee%</th><th className="py-1.5 text-right">Fee</th></tr></thead>
                      <tbody>
                        {inv.lines.map((x, i) => (
                          <tr key={i} className="border-t border-slate-800">
                            <td className="py-1.5 pr-3 font-mono text-amber-400">{x.loadId}</td>
                            <td className="py-1.5 pr-3 text-slate-300">{x.lane}</td>
                            <td className="py-1.5 pr-3 text-slate-400">{x.date}</td>
                            <td className="py-1.5 pr-3 text-right text-slate-200">{money(x.gross)}</td>
                            <td className="py-1.5 pr-3 text-right text-slate-400">{x.pct}%</td>
                            <td className="py-1.5 text-right font-semibold text-white">{money(x.fee)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}

// ---------- NOTIFICATIONS BELL ----------
// Live header alerts built entirely from existing Firestore data (no new
// collections, rules, or Storage). Admin sees fleet-wide signals; a driver
// sees their own. Each item deep-links to the relevant tab.
function NotificationsBell({ isAdmin, uid, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef(null);
  // Dismissed notification ids persist per-user so "cleared" alerts stay gone
  // (a genuinely new event has a new id and still shows).
  const dismissKey = 'fm_notif_dismissed_' + (uid || 'me');
  const [dismissed, setDismissed] = useState(() => { try { return JSON.parse(localStorage.getItem(dismissKey) || '[]'); } catch (_) { return []; } });
  const persistDismissed = (arr) => { setDismissed(arr); try { localStorage.setItem(dismissKey, JSON.stringify(arr)); } catch (_) {} };
  const dismissOne = (id) => persistDismissed([...new Set([...dismissed, id])]);
  const clearAll = () => persistDismissed([...new Set([...dismissed, ...items.map((i) => i.id)])]);

  const daysUntil = (str) => str ? Math.ceil((new Date(str + 'T00:00:00') - new Date()) / 86400000) : null;
  const complianceItems = (c, who, idPrefix) => {
    const out = [];
    [['CDL', c.cdl_expiration_date], ['Medical card', c.medical_card_expiration], ['Insurance', c.insurance_expiration]].forEach(([label, date]) => {
      const dd = daysUntil(date);
      if (dd === null || dd > 30) return;
      out.push({
        id: `${idPrefix}-${label}`, tone: dd < 0 ? 'red' : 'amber', icon: '🛡',
        text: `${who} ${label} ${dd < 0 ? 'has expired' : `expires in ${dd} day${dd === 1 ? '' : 's'}`}`,
        tab: 'compliance',
      });
    });
    return out;
  };

  const build = React.useCallback(async () => {
    setLoaded(false);
    const out = [];
    try {
      if (isAdmin) {
        const [loadSnap, carrierSnap, compSnap, userSnap] = await Promise.all([
          getDocs(orgScoped('loads')),
          getDocs(orgScoped('carriers')),
          getDocs(orgScoped('compliance')),
          getDocs(orgScoped('users')),
        ]);
        const emailByUid = {};
        userSnap.docs.forEach((d) => { emailByUid[d.id] = d.data().email || d.id; });
        const loads = loadSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        loads.filter((l) => l.offerStatus === 'pending').forEach((l) => {
          const age = l.offerSentAt ? ` · sent ${timeAgo(l.offerSentAt)}` : '';
          out.push({ id: 'offer-' + l.id, tone: 'amber', icon: '📣', text: `Offer ${l.loadId || ''} awaiting ${emailByUid[l.uid] || 'carrier'}${age}`, tab: 'allloads' });
        });
        loads.filter((l) => l.offerStatus === 'declined').forEach((l) => {
          out.push({ id: 'declined-' + l.id, tone: 'red', icon: '✕', text: `${emailByUid[l.uid] || 'Carrier'} declined ${l.loadId || ''}${l.declineReason ? ' — ' + l.declineReason : ''}`, tab: 'allloads' });
        });
        // The good news too — a carrier accepting an offer is the alert
        // dispatchers most want. Skip loads already Delivered/Cleared so old
        // wins don't linger (and each id is dismissible like the rest).
        loads.filter((l) => l.offerStatus === 'accepted' && l.status !== 'Delivered' && l.status !== 'Cleared').forEach((l) => {
          out.push({ id: 'accepted-' + l.id, tone: 'emerald', icon: '🚚', text: `${emailByUid[l.uid] || 'Carrier'} accepted offer ${l.loadId || ''}${l.offerAcceptedBy === 'dispatcher' ? ' (recorded on their behalf)' : ''}`, tab: 'allloads' });
        });
        loads.filter((l) => l.detention && l.detention.status === 'filed').forEach((l) => {
          out.push({ id: 'det-' + l.id, tone: 'amber', icon: '⏱', text: `Detention filed on ${l.loadId || 'a load'} — $${Number(l.detention.amount || 0).toLocaleString()} (${emailByUid[l.uid] || 'carrier'})`, tab: 'allloads' });
        });
        // Any recorded RateCon signature counts — signed in-app by the carrier,
        // or recorded on their behalf (LPOA), with or without a broker PDF attached.
        loads.filter((l) => l.rateConSigned).forEach((l) => {
          out.push({ id: 'rcsign-' + l.id, tone: 'emerald', icon: '✍️', text: `${l.rateConSigned.name || emailByUid[l.uid] || 'Carrier'} e-signed the RateCon on ${l.loadId || 'a load'}`, tab: 'allloads' });
        });
        compSnap.docs.forEach((d) => { complianceItems(d.data(), (emailByUid[d.id] || 'Carrier') + ':', 'comp-' + d.id).forEach((x) => out.push(x)); });
        carrierSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.availability && c.availability !== 'Available').forEach((c) => {
          out.push({ id: 'avail-' + c.id, tone: 'slate', icon: '⏸', text: `${c.name || 'Carrier'} is ${c.availability}`, tab: 'carriers' });
        });
        userSnap.docs.forEach((d) => {
          const ud = d.data();
          if (ud.vipRequested) out.push({ id: 'vip-' + d.id, tone: 'amber', icon: '⭐', text: `${ud.email || 'A carrier'} requested VIP concierge`, tab: 'vip' });
          if (ud.cpmShared && ud.cpmShared.breakeven) out.push({ id: 'cpm-' + d.id, tone: 'blue', icon: '📤', text: `${ud.email || 'A carrier'} shared an updated break-even: $${Number(ud.cpmShared.breakeven).toFixed(2)}/mi`, tab: 'carriers' });
        });
      } else if (uid) {
        const [compSnap, loadSnap] = await Promise.all([
          getDoc(doc(db, 'compliance', uid)),
          getDocs(query(collection(db, 'loads'), where('uid', '==', uid))),
        ]);
        if (compSnap.exists()) complianceItems(compSnap.data(), 'Your', 'comp').forEach((x) => out.push(x));
        const loads = loadSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const offer = loads.find((l) => l.offerStatus === 'pending');
        if (offer) out.push({ id: 'pending-offer', tone: 'amber', icon: '📣', text: `New load offer ${offer.loadId || ''} — respond to lock it in`, tab: 'dashboard' });
        const active = loads.find((l) => l.status !== 'Delivered' && l.status !== 'Cleared' && l.offerStatus !== 'pending' && l.offerStatus !== 'declined');
        if (active) out.push({ id: 'active-' + active.id, tone: 'blue', icon: '🚚', text: `Active load ${active.loadId || ''}: ${active.status}`, tab: 'lanes' });
      }
    } catch (e) {
      console.error('Notifications build failed:', e);
    }
    setItems(out);
    setLoaded(true);
  }, [isAdmin, uid]);

  useEffect(() => { build(); }, [build]);

  // LIVE: rebuild the bell whenever loads OR user docs change — so a carrier
  // accepting/declining, signing a RateCon, filing detention, requesting VIP,
  // or sharing a CPM all update the badge without a refresh. Debounced so a
  // burst of writes triggers a single rebuild.
  useEffect(() => {
    const queries = [];
    if (isAdmin) { queries.push(orgScoped('loads')); queries.push(orgScoped('users')); queries.push(orgScoped('carriers')); }
    else if (uid) { queries.push(query(collection(db, 'loads'), where('uid', '==', uid))); }
    if (!queries.length) return;
    let t = null; const firsts = queries.map(() => true);
    const unsubs = queries.map((q, i) => onSnapshot(q, () => {
      if (firsts[i]) { firsts[i] = false; return; } // build() already ran on mount
      clearTimeout(t); t = setTimeout(() => build(), 400);
    }, (e) => console.error('bell live listener failed', e)));
    return () => { clearTimeout(t); unsubs.forEach((u) => u()); };
  }, [isAdmin, uid, build]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toneDot = { amber: 'bg-amber-400', red: 'bg-red-400', blue: 'bg-blue-400', emerald: 'bg-emerald-400', slate: 'bg-slate-500' };
  const visible = items.filter((it) => !dismissed.includes(it.id));
  const count = visible.length;

  return (
    <div className="relative" ref={wrapRef}>
      <button onClick={() => setOpen((o) => !o)} className="relative hover:text-white transition-colors" aria-label="Notifications" title="Notifications">
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">{count > 9 ? '9+' : count}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-white">Notifications{count > 0 ? ` (${count})` : ''}</span>
            <div className="flex items-center gap-3">
              {count > 0 && <button onClick={clearAll} className="text-xs text-slate-400 hover:text-amber-400 transition-colors">Clear all</button>}
              <button onClick={() => build()} className="text-xs text-slate-400 hover:text-amber-400 transition-colors">Refresh</button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!loaded ? (
              <div className="px-4 py-4"><SkelRows rows={2} /></div>
            ) : count === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500 text-center">You're all caught up. 🎉</div>
            ) : (
              visible.map((it) => (
                <div key={it.id} className="group w-full flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/50 transition-colors">
                  <button onClick={() => { setOpen(false); onNavigate && onNavigate(it.tab); }} className="flex items-start gap-3 text-left flex-1 min-w-0">
                    <span className="text-base leading-none shrink-0">{it.icon}</span>
                    <span className="text-sm text-slate-200 leading-snug">{it.text}</span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`mt-1.5 w-2 h-2 rounded-full ${toneDot[it.tone] || toneDot.slate}`} />
                    <button onClick={() => dismissOne(it.id)} title="Dismiss" className="text-slate-600 hover:text-slate-300 text-sm leading-none">✕</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ===== TOASTS — module-level, dependency-free notification system =========
// Replaces jarring alert() confirmations/errors with slim, auto-dismissing
// toasts in the app's own tone language (same colors as Badge). `toast()` can
// be called from any component; <ToastHost/> (mounted once in the App shell)
// is the only thing that actually renders — a tiny listener array stands in
// for a context/provider so no wiring is needed at call sites.
// ============================================================================
let _toastListeners = [];
let _toastSeq = 0;
function toast(message, tone = 'info') {
  const id = ++_toastSeq;
  _toastListeners.forEach((fn) => fn({ id, message, tone }));
  return id;
}
function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (item) => {
      // Cap the stack at 3 — a burst of saves shouldn't wall off the screen.
      setItems((prev) => [...prev.slice(-2), item]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== item.id)), 3500);
    };
    _toastListeners.push(onToast);
    return () => { _toastListeners = _toastListeners.filter((f) => f !== onToast); };
  }, []);
  if (!items.length) return null;
  const toneCls = {
    success: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
    error: 'bg-red-500/15 border-red-500/40 text-red-200',
    info: 'bg-slate-800/95 border-slate-700 text-slate-200',
  };
  return (
    <div
      className="fixed z-[70] bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:right-4 sm:translate-x-0 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none"
      aria-live="polite"
    >
      {items.map((it) => (
        <div key={it.id} role="status" className={`fm-toast pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg shadow-black/30 backdrop-blur ${toneCls[it.tone] || toneCls.info}`}>
          <span className="flex-1 leading-snug">{it.message}</span>
          <button onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))} aria-label="Dismiss notification" className="shrink-0 opacity-70 hover:opacity-100 transition-opacity">✕</button>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// ===== COMMAND PALETTE (Ctrl/Cmd+K) =========================================
// A fast, keyboard-first way to jump to any tab the sidebar already exposes.
// The item list is built in App from the same flags the sidebar nav uses, so
// this can never surface a tab the sidebar wouldn't show. Defined at module
// level — not nested inside App — so the search input keeps a stable
// identity across renders instead of remounting (see the ESignBox note on
// why that matters for a focused text input).
// ============================================================================
function CommandPalette({ open, items, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    const t = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 10);
    return () => clearTimeout(t);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = !q ? items : items.filter((it) =>
    it.label.toLowerCase().includes(q) || (it.keywords || []).some((k) => k.toLowerCase().includes(q))
  );

  useEffect(() => { if (index >= filtered.length) setIndex(0); }, [filtered.length, index]);

  if (!open) return null;

  const choose = (it) => { if (!it) return; onSelect(it.tab); onClose(); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(filtered[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden fm-view"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search size={16} className="text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page…"
            aria-label="Search pages"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500 text-center">No matches for “{query}”.</div>
          ) : (
            filtered.map((it, i) => (
              <button
                key={it.tab}
                type="button"
                onClick={() => choose(it)}
                onMouseEnter={() => setIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${i === index ? 'bg-amber-500/15 text-white' : 'text-slate-300 hover:bg-slate-800/70'}`}
              >
                <span className={i === index ? 'text-amber-400 shrink-0' : 'text-slate-500 shrink-0'}>{it.icon}</span>
                <span className="truncate">{it.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}







