import React, { useState, useEffect, useRef } from 'react';
import {
  Map, FileText, Wallet, HeartPulse, Dog, LayoutDashboard, Bell, Settings,
  Upload, CheckCircle2, Navigation, Activity, ShieldCheck, CreditCard, Building,
  MapPin, User, Calendar, Wrench, Plus, GraduationCap, BookOpen, Clock
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, getDocs, collection, setDoc, addDoc,
  query, where, serverTimestamp, updateDoc, deleteDoc
} from 'firebase/firestore';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
  sendPasswordResetEmail, updateProfile
} from 'firebase/auth';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

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
const googleProvider = new GoogleAuthProvider();

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
async function queueEmail(to, subject, html) {
  if (!to) return;
  try {
    await addDoc(collection(db, 'mail'), { to: [to], message: { subject, html } });
  } catch (e) {
    console.error('queueEmail failed (account still created):', e);
  }
}

function emailShell(bodyHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.6">
    <div style="background:#0a0f1a;padding:22px 24px;border-radius:12px 12px 0 0">
      <span style="color:#f59e0b;font-weight:bold;letter-spacing:2px;font-size:13px">FORWARD MOTION FREIGHT</span>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px">${bodyHtml}</div>
  </div>`;
}

function welcomeCarrierEmail({ name, email, tempPw }) {
  return emailShell(`
    <h2 style="margin:0 0 12px;font-size:20px">Welcome aboard, ${name || 'driver'}!</h2>
    <p>Your Forward Motion Freight driver portal is set up and ready. Here's how to get rolling:</p>
    <ol style="padding-left:18px">
      <li><strong>Sign in:</strong> <a href="${PORTAL_URL}" style="color:#2563eb">${PORTAL_URL}</a><br>
        Email: <strong>${email}</strong><br>
        Temporary password: <strong>${tempPw}</strong></li>
      <li>You'll be prompted to set your own password.</li>
      <li>A quick 2-minute setup confirms your carrier profile (equipment, lanes, docs).</li>
      <li>Take the optional dashboard tour — then you're ready to roll.</li>
    </ol>
    <p>Inside you'll find your assigned loads, pay, compliance dates, document vault, and your own cost-per-mile calculator — all in one place.</p>
    <p style="color:#6b7280;font-size:13px">Questions? Just reply to this email and we'll get you sorted.</p>
    <p style="margin-top:18px">Keep the wheels turning,<br><strong>Forward Motion Freight — Dispatch</strong></p>`);
}

function welcomeDispatcherEmail({ name, email, tempPw }) {
  return emailShell(`
    <h2 style="margin:0 0 12px;font-size:20px">Welcome to the deal desk${name ? ', ' + name : ''}.</h2>
    <p>Your Forward OS dispatcher account is ready.</p>
    <ol style="padding-left:18px">
      <li><strong>Sign in:</strong> <a href="${PORTAL_URL}" style="color:#2563eb">${PORTAL_URL}</a><br>
        Email: <strong>${email}</strong><br>
        Temporary password: <strong>${tempPw}</strong></li>
      <li>Set your own password when prompted.</li>
      <li>Flip on <strong>Guided Mode</strong> (top of the screen) — it walks you through every tab.</li>
      <li>Take the dashboard tour for a 60-second orientation.</li>
    </ol>
    <p>Your day starts on the Dashboard (weekly dispatch total + live Market Pulse). Work a deal in the Rate Calculator, vet the broker in Broker Check, then send the load. Carriers and their logins live under "Carriers &amp; Access."</p>
    <p style="margin-top:18px"><strong>Forward Motion Freight — Operations</strong></p>`);
}

async function createDriverAccount(email, password) {
  const secondary = initializeApp(firebaseConfig, 'driver-creator-' + Date.now());
  const secondaryAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
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

// ============================================================================
// ===== 2026 MARKET REFERENCE — UPDATE THESE NUMBERS WHEN THE MARKET MOVES ====
// This is the ONE place to edit market data. It feeds the Rate Calculator's
// market auto-suggest and the admin "Market Pulse" widget. Numbers are a
// point-in-time snapshot (estimates) — bump MARKET_AS_OF and the values each
// quarter. A live DAT/market feed replaces this in the backend phase.
// ============================================================================
const MARKET_AS_OF = 'Q2 2026';

// Suggested all-in market rate ($/mi) by commodity, keyed to the calculator's
// commodity list. Used only as a one-tap suggestion — never overwrites input.
const MARKET_RATES = {
  'General Dry Freight': 2.47,
  'Frozen Seafood/Poultry': 3.20,
  'Fresh Produce': 3.20,
  'Coiled Steel': 3.57,
  'High-Value Electronics': 2.60,
};

// Snapshot shown in the admin Market Pulse dashboard widget.
const MARKET_PULSE = {
  dieselPerGal: 5.35,
  spotAllIn: 3.83, // national truckload spot record ($/mi)
  trend: 'up', // 'up' | 'down' | 'flat'
  headline: 'Supply-constrained market — capacity is tight and rates favor carriers.',
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
};

// ============================================================================
// ===== Multi-tenancy (Lite) — org-scoping helpers ===========================
// ACTIVE_ORG is set from the signed-in user's doc after login. While it's null
// (single-tenant / pre-migration) the helpers fall back to unscoped behavior,
// so the app keeps working exactly as before until the full cutover.
// ============================================================================
let ACTIVE_ORG = null;
function setActiveOrg(orgId) { ACTIVE_ORG = orgId || null; }
// Org-filtered query for dispatcher-wide reads; unscoped when no org is set.
function orgScoped(name) {
  return ACTIVE_ORG ? query(collection(db, name), where('orgId', '==', ACTIVE_ORG)) : collection(db, name);
}
// Stamp the active org onto a document being created.
function stampOrg(obj) { return ACTIVE_ORG ? { ...obj, orgId: ACTIVE_ORG } : obj; }

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

function BrandLockup({ size = 34, stack = false }) {
  return (
    <div className={`flex items-center gap-2.5 ${stack ? 'flex-col text-center gap-2' : ''}`}>
      <ForwardOSLogo size={size} />
      <div className={stack ? '' : 'leading-none'}>
        <div className="text-base font-extrabold tracking-tight text-white leading-none">Forward<span className="text-amber-500">OS</span></div>
        <div className="text-[10px] text-slate-500 tracking-[0.18em] font-semibold mt-1">DISPATCH PLATFORM</div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [paymentMethod, setPaymentMethod] = useState('factoring');
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
  const [myOrgId, setMyOrgId] = useState(null); // multi-tenancy: the user's workspace
  const [myRole, setMyRole] = useState(null);   // 'admin' (dispatcher) | 'driver'
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
  };

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
      case 'dashboard': return <DashboardView key={'dash-' + viewUid} uid={viewUid} displayName={viewName} isAdmin={isAdmin && !viewAs} vipOn={vipOn} onNavigate={go} myStatus={myStatus} onSetStatus={updateMyStatus} vipRequested={vipRequested} onRequestVip={requestVip} onCancelVip={cancelVip} />;
      case 'newauthority': return <NewAuthorityView />;
      case 'profile': return <ProfileView key={'prof-' + viewUid} uid={viewUid} displayName={viewName} />;
      case 'schedule': return <ScheduleView key={'sched-' + viewUid} uid={viewUid} />;
      case 'lanes': return <LaneManagementView key={'lane-' + viewUid} uid={viewUid} />;
      case 'parking': return <SafeParkingView />;
      case 'compliance': return <ComplianceView key={'comp-' + viewUid} uid={viewUid} isAdmin={isAdmin && !!viewAs} />;
      case 'vault': return <DigitalVaultView key={'vault-' + viewUid} uid={viewUid} isAdmin={isAdmin && !!viewAs} />;
      case 'financials': return <FinancialsView key={'fin-' + viewUid} uid={viewUid} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />;
      case 'wellness': return <WellnessView />;
      case 'pets': return <PetLogisticsView />;
      case 'upgrades': return <UpgradesView key={'upg-' + viewUid} uid={viewUid} />;
      case 'mycpm': return <DriverExpensesView key={'cpm-' + viewUid} uid={viewUid} />;
      case 'settings': return <SettingsView isAdmin={isAdmin && !viewAs} myStatus={myStatus} onSetStatus={updateMyStatus} vipOn={vipOn} vipRequested={vipRequested} onRequestVip={requestVip} onCancelVip={cancelVip} guidedMode={guidedMode} toggleGuided={toggleGuided} onNavigate={go} onReplayTour={() => setShowTour(true)} />;
      case 'workspaces': return isSuper ? <WorkspacesView /> : <DashboardView />;
      case 'expenses': return isAdmin ? <ExpensesView /> : <DashboardView />;
      case 'invoices': return isAdmin ? <InvoicesView /> : <DashboardView />;
      case 'assign': return isAdmin ? <AssignLoadView /> : <DashboardView />;
      case 'allloads': return isAdmin ? <AllLoadsView /> : <DashboardView />;
      case 'drivers': return isAdmin ? <ManageDriversView /> : <DashboardView />;
      case 'fleet': return isAdmin ? <FleetView /> : <DashboardView />;
      case 'carriers': return isAdmin ? <CarriersView /> : <DashboardView />;
      case 'crm': return isAdmin ? <CrmView onNavigate={go} /> : <DashboardView />;
      case 'vip': return isAdmin ? <VipServicesView /> : <DashboardView />;
      case 'brokercheck': return isAdmin ? <BrokerCheckView /> : <DashboardView />;
      case 'laneintel': return isAdmin ? <LaneIntelView /> : <DashboardView />;
      case 'trihaul': return isAdmin ? <TriHaulView /> : <DashboardView />;
      case 'calc': return isAdmin ? <NegotiationCalcView /> : <DashboardView />;
      case 'training': return isAdmin ? <TrainingView /> : <DashboardView />;
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
    return <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 to-[#0b1220] text-slate-400 font-sans">Loading…</div>;
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
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 to-[#0b1220] text-slate-100 font-sans p-6">
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
    <div className="flex h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-[#0b1220] text-slate-100 font-sans overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-[#0b1220]/95 backdrop-blur border-r border-slate-800/80 flex flex-col transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="p-6 flex items-start justify-between">
          <BrandLockup size={34} />
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-white text-3xl leading-none -mt-1"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {isAdmin && !viewAs ? (
            /* ----- ADMIN sees only dispatch tools ----- */
            <>
              <div className="px-4 mb-2 text-xs font-semibold text-amber-500 tracking-wider">OVERVIEW</div>
              <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => go('dashboard')} />

              <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">THE DEAL DESK</div>
              <NavItem icon={<Wallet size={18} />} label="Rate Calculator" isActive={activeTab === 'calc'} onClick={() => go('calc')} />
              <NavItem icon={<Map size={18} />} label="Lane Intel" isActive={activeTab === 'laneintel'} onClick={() => go('laneintel')} />
              <NavItem icon={<Navigation size={18} />} label="TriHaul Planner" isActive={activeTab === 'trihaul'} onClick={() => go('trihaul')} />
              <NavItem icon={<ShieldCheck size={18} />} label="Broker Check" isActive={activeTab === 'brokercheck'} onClick={() => go('brokercheck')} />
              <NavItem icon={<Plus size={18} />} label="Assign Load" isActive={activeTab === 'assign'} onClick={() => go('assign')} />
              <NavItem icon={<Navigation size={18} />} label="All Loads" isActive={activeTab === 'allloads'} onClick={() => go('allloads')} />

              <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">CARRIERS &amp; ACCESS</div>
              <NavItem icon={<Building size={18} />} label="Carriers" isActive={activeTab === 'carriers'} onClick={() => go('carriers')} />
              <NavItem icon={<BookOpen size={18} />} label="CRM / Network" isActive={activeTab === 'crm'} onClick={() => go('crm')} />
              <NavItem icon={<User size={18} />} label="Logins &amp; Access" isActive={activeTab === 'drivers'} onClick={() => go('drivers')} />
              <NavItem icon={<HeartPulse size={18} />} label="VIP Services" isActive={activeTab === 'vip'} onClick={() => go('vip')} />

              <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">BUSINESS</div>
              <NavItem icon={<CreditCard size={18} />} label="Expenses" isActive={activeTab === 'expenses'} onClick={() => go('expenses')} />
              <NavItem icon={<FileText size={18} />} label="Invoices" isActive={activeTab === 'invoices'} onClick={() => go('invoices')} />
              <NavItem icon={<Activity size={18} />} label="Fleet (ELD)" isActive={activeTab === 'fleet'} onClick={() => go('fleet')} />
              <NavItem icon={<GraduationCap size={18} />} label="Training" isActive={activeTab === 'training'} onClick={() => go('training')} />
              {isSuper && <NavItem icon={<Building size={18} />} label="Workspaces" isActive={activeTab === 'workspaces'} onClick={() => go('workspaces')} />}
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
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold uppercase shrink-0">
              {user.email ? user.email[0] : 'D'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{user.email}</div>
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
                  if (c) { setViewAs({ id: c.id, uid: c.linkedDriverUid, name: c.name }); setActiveTab('dashboard'); }
                  else setViewAs(null);
                }}
                className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 max-w-[150px]"
                title="View a carrier's portal"
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
            <NotificationsBell isAdmin={isAdmin && !viewAs} uid={viewUid} onNavigate={go} />
            <button onClick={() => go('settings')} className={`transition-colors ${activeTab === 'settings' ? 'text-amber-400' : 'hover:text-white'}`} title="Settings" aria-label="Settings"><Settings size={20} /></button>
          </div>
        </header>

        {viewAs && (
          <div className="bg-indigo-600 text-white px-4 md:px-8 py-2 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold truncate">👁 CARRIER VIEW — {viewAs.name}<span className="font-normal opacity-80 hidden sm:inline"> · you're seeing their portal</span></div>
            <button onClick={() => { setViewAs(null); setActiveTab('dashboard'); }} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg shrink-0">Return to Admin</button>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${viewAs ? 'ring-2 ring-inset ring-indigo-600/50' : ''}`}>
          {renderContent()}
        </div>
      </main>

      {showTour && <TourOverlay role={isAdmin ? 'admin' : 'carrier'} onClose={closeTour} />}
    </div>
    </GuidedModeContext.Provider>
  );
}

// ---------- ADMIN: WEEKLY DISPATCH OVERVIEW ----------
function AdminWeeklyGross() {
  const [stats, setStats] = useState({ gross: 0, fee: 0, net: 0, count: 0 });
  const [loaded, setLoaded] = useState(false);

  const startOfWeek = () => {
    const d = new Date();
    const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(orgScoped('loads'));
        const rows = snap.docs.map((d) => d.data());
        const sow = startOfWeek();
        let gross = 0, fee = 0, count = 0;
        rows.forEach((l) => {
          const delivered = l.status === 'Delivered' || l.status === 'Cleared';
          const inWeek = l.delivery_date && new Date(l.delivery_date + 'T00:00:00') >= sow;
          if (delivered && inWeek) {
            const g = Number(l.gross_pay) || 0;
            gross += g;
            fee += g * ((Number(l.feePct) || DEFAULT_FEE_PCT) / 100);
            count += 1;
          }
        });
        setStats({ gross, fee, net: gross - fee, count });
      } catch (e) {
        console.error('Error loading admin weekly gross:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50 p-6">
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
          <div className="text-sm text-slate-400 mb-1">Your Dispatch Total (This Week)</div>
          <div className="text-3xl font-bold text-amber-400">{money(stats.fee)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
        <StatTile label="Gross Booked" value={money(stats.gross)} />
        <StatTile label="Your Dispatch Fee" value={money(stats.fee)} accent="amber" />
        <StatTile label="Net to Carriers" value={money(stats.net)} accent="emerald" />
      </div>
    </Card>
  );
}

// ---------- ADMIN: 2026 MARKET PULSE (seeded snapshot, see MARKET_PULSE) ----------
function MarketPulse() {
  const p = MARKET_PULSE;
  const trend = { up: { t: '▲ Rising', c: 'text-emerald-400' }, down: { t: '▼ Falling', c: 'text-red-400' }, flat: { t: '▬ Flat', c: 'text-slate-400' } }[p.trend] || { t: '', c: 'text-slate-400' };
  return (
    <Card className="p-6">
      <PanelHeader
        icon={<Activity size={20} />}
        title="Market Pulse"
        badge={<Badge tone="slate" className="font-normal">as of {MARKET_AS_OF}</Badge>}
        action={<span className={`text-sm font-bold ${trend.c}`}>{trend.t}</span>}
      />
      <p className="text-sm text-slate-400 mt-2">{p.headline}</p>

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
                <span className="text-white font-semibold">{m.rpm} <span className="text-slate-500 font-normal text-xs">({m.yoy})</span></span>
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
      <p className="text-[10px] text-slate-600 mt-3">Estimates for guidance — update the snapshot in code (MARKET_PULSE) each quarter. Live market data arrives with the backend phase.</p>
    </Card>
  );
}

// ---------- DASHBOARD ----------
function DashboardView({ uid, displayName, isAdmin, vipOn = true, onNavigate, myStatus = 'Available', onSetStatus, vipRequested = false, onRequestVip, onCancelVip }) {
  const u = auth.currentUser;
  const targetUid = uid || (u && u.uid);
  const [earnings, setEarnings] = useState(0);
  const [active, setActive] = useState(null);
  const [pendingOffer, setPendingOffer] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const prettyName = (handle) =>
    handle.replace(/[0-9]/g, '')
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const name = displayName || u?.displayName || (u?.email ? prettyName(u.email.split('@')[0]) : 'Driver');

  const startOfWeek = () => {
    const d = new Date();
    const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const fetchData = React.useCallback(async () => {
    if (!targetUid || isAdmin) return;
    try {
      const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', targetUid)));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    } catch (e) {
      console.error('Error loading dashboard:', e);
    } finally {
      setLoaded(true);
    }
  }, [targetUid, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

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
      {isAdmin && <AdminWeeklyGross />}
      {isAdmin && <MarketPulse />}

      {!isAdmin && (
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50 p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{myStatus === 'Off Duty' ? `Rest up, ${name}.` : myStatus === 'On Break' ? `Enjoy the break, ${name}.` : `Safe travels, ${name}.`}</h2>
            <p className="text-slate-400">{statusLine}</p>
            <div className="mt-3"><GuidedHint>This is the carrier’s home screen — active load, weekly earnings, and VIP updates. A pending offer takes over this screen until they accept or decline.</GuidedHint></div>
          </div>
          <div className="md:text-right">
            <div className="text-sm text-slate-400 mb-1">Gross Earnings (This Week)</div>
            <div className="text-3xl font-bold text-emerald-400">{money(earnings)}</div>
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
              <div className="text-slate-500 text-sm">Loading…</div>
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

// ---------- VIP: shared request button + questionnaire ----------
const VIP_SERVICES = ['Safe parking scouting', 'Healthy Hub (gyms, grocers, dining)', 'Shower queue at stops', 'Pet logistics', 'Priority concierge line'];

function VipRequestButton({ requested, onRequest, onCancel, className = '' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [svc, setSvc] = useState({});
  const [form, setForm] = useState({ diet: '', pet: '', fitness: '', notes: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (s) => setSvc((x) => ({ ...x, [s]: !x[s] }));

  const submit = async () => {
    setBusy(true);
    const answers = {
      services: VIP_SERVICES.filter((s) => svc[s]),
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
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => !busy && setOpen(false)}>
          <Card className="w-full max-w-lg p-6 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><HeartPulse size={18} className="text-amber-500" /> VIP Concierge Request</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
            </div>
            <p className="text-sm text-slate-400 mb-4">Tell your dispatcher what you'd like so they can set up your concierge. <span className="text-slate-500">(VIP is a premium tier — it raises your dispatch fee a point or two.)</span></p>
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLS}>Which services interest you?</label>
                <div className="flex flex-wrap gap-2">
                  {VIP_SERVICES.map((s) => (
                    <button key={s} type="button" onClick={() => toggle(s)} className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${svc[s] ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'}`}>{svc[s] ? '✓ ' : ''}{s}</button>
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
  const BENEFITS = [
    ['🛡', 'Trusted safe-parking scouting on every route'],
    ['🏋️', 'Healthy Hub — gyms, grocers & clean dining near your delivery'],
    ['🚿', 'Shower requests queued at your next stop'],
    ['🐾', 'Pet logistics — food intercepts & pet-friendly waypoints'],
    ['📞', 'Priority concierge line for layovers & last-minute needs'],
  ];
  return (
    <Card className="p-6 border-amber-500/30">
      <PanelHeader icon={<HeartPulse size={20} />} title="VIP Concierge" badge={<Badge tone="amber">Premium</Badge>} />
      <p className="text-sm text-slate-400 mt-2">White-glove support so you can focus on driving. Available as a premium add-on.</p>
      <div className="space-y-2.5 mt-4">
        {BENEFITS.map(([icon, text]) => (
          <div key={text} className="flex items-start gap-3 text-sm text-slate-200">
            <span className="text-base leading-none shrink-0">{icon}</span>
            <span>{text}</span>
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
  const REASONS = ['Rate too low', 'Bad location', 'Weight too high'];

  const accept = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'loads', offer.id), {
        offerStatus: 'accepted', status: 'Dispatched', offerRespondedAt: serverTimestamp(),
      });
      onResolved && onResolved();
    } catch (e) { console.error('Accept failed:', e); alert('Could not accept — please try again.'); setBusy(false); }
  };
  const decline = async (reason) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'loads', offer.id), {
        offerStatus: 'declined', status: 'Declined', declineReason: reason, offerRespondedAt: serverTimestamp(),
      });
      onResolved && onResolved();
    } catch (e) { console.error('Decline failed:', e); alert('Could not decline — please try again.'); setBusy(false); }
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

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-5">
        <Badge tone="amber" className="font-bold tracking-widest uppercase">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Pending Offer
        </Badge>
        <h2 className="text-2xl font-bold text-white mt-3">Review Your Load Offer</h2>
        <p className="text-slate-400 text-sm mt-1">Your dispatcher is holding this load for you. Respond to lock it in.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500/10 to-transparent px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <span className="font-mono text-amber-500 font-bold">{offer.loadId || 'New Load'}</span>
          <div className="text-right">
            <div className="text-xs text-slate-500">Gross Rate</div>
            <div className="text-xl font-bold text-emerald-400 fm-profit">{money(gross)}</div>
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
            <div><div className="text-[10px] text-slate-500">LOADED</div><div className="font-bold text-white text-sm">{loadedMi ? loadedMi.toLocaleString() + ' mi' : '—'}</div></div>
            <div><div className="text-[10px] text-slate-500">DEADHEAD</div><div className="font-bold text-white text-sm">{deadMi ? deadMi.toLocaleString() + ' mi' : '—'}</div></div>
            <div><div className="text-[10px] text-slate-500">RPM</div><div className="font-bold text-amber-400 text-sm">{rpm > 0 ? '$' + rpm.toFixed(2) : '—'}</div></div>
            <div><div className="text-[10px] text-slate-500">WEIGHT</div><div className="font-bold text-white text-sm">{offer.weight || '—'}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-[10px] text-slate-500">COMMODITY</div><div className="text-sm text-slate-200">{offer.commodity || '—'}</div></div>
            <div><div className="text-[10px] text-slate-500">DELIVERY</div><div className="text-sm text-slate-200">{offer.delivery_date || offer.delivery_time || '—'}</div></div>
          </div>
        </div>
        {hos && (
          <div className={`mx-6 mb-2 rounded-lg border px-3 py-2.5 text-xs font-medium ${hosCls[hos.tone]}`}>
            <span className="font-semibold">Hours of Service:</span> {hos.text}
          </div>
        )}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <PrimaryButton onClick={accept} disabled={busy} className="w-full py-3">
            {busy ? 'Working…' : '✓ Accept Offer'}
          </PrimaryButton>
          <div className="grid grid-cols-2 gap-2">
            <GhostButton onClick={() => setShowDecline(true)} disabled={busy} className="py-2.5">Decline</GhostButton>
            <a href={callPhone ? `tel:${callPhone}` : undefined}
              className={`text-center border border-slate-700 text-slate-300 font-semibold py-2.5 rounded-lg transition-colors ${callPhone ? 'hover:bg-slate-800' : 'opacity-50 pointer-events-none'}`}>
              Call Dispatcher
            </a>
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
          <button onClick={() => submit(true)} disabled={busy} className="w-full text-slate-400 hover:text-white text-sm py-1">Skip</button>
        </div>
      </Card>
    </div>
  );
}

// ---------- RATE CONFIRMATION E-SIGN (carrier accepts the binding terms) ----------
function RateConCard({ load, onSigned }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const signed = load.rateConSigned;
  const money = (x) => Number(x || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const sign = async () => {
    if (!name.trim() || !agree) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'loads', load.id), { rateConSigned: { name: name.trim(), at: serverTimestamp() } });
      if (onSigned) await onSigned();
    } catch (e) { console.error('ratecon sign failed', e); alert('Could not save your signature — try again.'); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-6">
      <PanelHeader icon={<FileText size={20} />} title="Rate Confirmation" badge={signed ? <Badge tone="emerald"><CheckCircle2 size={11} /> Signed</Badge> : <Badge tone="amber">Needs signature</Badge>} />
      <p className="text-sm text-slate-400 mt-1">Your binding acceptance of this load. Review the terms, then e-sign before you roll.</p>
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
        <div className="mt-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm px-4 py-3">✓ E-signed by <strong>{signed.name}</strong>. Your dispatcher has been notified.</div>
      ) : (
        <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-400">Confirm the rate, stops, and times match what you agreed. Typing your name below is a legal electronic signature accepting these terms.</p>
          <input className={INPUT_CLS} value={name} onChange={(e) => setName(e.target.value)} placeholder="Type your full legal name to sign" />
          <label className="flex items-start gap-2.5 text-sm text-slate-200 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0" />
            <span>I confirm these terms are correct and I accept this Rate Confirmation.</span>
          </label>
          <PrimaryButton onClick={sign} disabled={busy || !name.trim() || !agree} className="px-5">{busy ? 'Signing…' : '✍️ E-sign Rate Confirmation'}</PrimaryButton>
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
function LaneManagementView({ uid }) {
  const targetUid = uid || auth.currentUser?.uid;
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [debriefLoad, setDebriefLoad] = useState(null);

  const STATUS_FLOW = ['Dispatched', 'Arrived at Shipper', 'Loaded', 'In Transit', 'Delivered'];

  const fetchLoads = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', targetUid)));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.delivery_date || '').localeCompare(b.delivery_date || ''));
      setLoads(rows);
    } catch (err) {
      console.error('Error loading lanes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLoads(); }, []);

  const pending = loads.filter((l) => l.status !== 'Delivered' && l.status !== 'Cleared');
  const active = pending[0] || null;
  const upcoming = pending.slice(1);

  const setStatus = async (newStatus) => {
    if (!active) return;
    setUpdating(true);
    const justDelivered = newStatus === 'Delivered' && active.status !== 'Delivered';
    const deliveredLoad = justDelivered ? active : null;
    try {
      await updateDoc(doc(db, 'loads', active.id), { status: newStatus });
      // Capture a quick debrief before the active load disappears from the screen.
      if (deliveredLoad) setDebriefLoad(deliveredLoad);
      await fetchLoads();
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="max-w-4xl mx-auto text-slate-400">Loading lane…</div>;

  // Delivery debrief takes priority — collect feedback right after delivery.
  if (debriefLoad) {
    return <DeliveryDebriefModal load={debriefLoad} onClose={() => setDebriefLoad(null)} />;
  }

  if (!active) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <h2 className="text-2xl font-bold">Lane Management</h2>
        <Card className="p-10 text-center text-slate-400">
          No active load right now. Your dispatcher will assign one shortly.
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
        <p className="text-slate-400">Everything you need to execute your current load.</p>
        <div className="mt-3"><GuidedHint>The carrier’s execution screen for the active load — status updates, route, the paperwork checklist, and VIP stops. Walk a new driver through advancing the status as the load moves.</GuidedHint></div>
      </div>

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

      <RateConCard load={active} onSigned={fetchLoads} />

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
            <button className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg shrink-0">Reserve Spot</button>
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
          <div className="mt-3"><GuidedHint>Keep CDL, medical card, and insurance dates current. The portal warns 30 days out, the bell flags anything expired, and the dispatch guard stops you sending a load to a carrier with expired docs.</GuidedHint></div>
        </div>
        {admin && !editing && (
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
function FinancialsView({ uid, paymentMethod, setPaymentMethod }) {
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
  const feeRateOf = (l) => (Number(l.feePct) || DEFAULT_FEE_PCT) / 100;
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
        <p className="text-slate-400">Manage how you get paid and how your dispatch fees are settled.</p>
        <GuidedHint>Shows the carrier how they get paid and their settlement ledger. Factoring vs. ACH is their choice — the math (gross, your fee, their net) is automatic.</GuidedHint>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Gross Earned (Delivered)" value={money(totalGross)} className="p-5" />
        <StatTile label="Dispatch Fees" value={money(totalFee)} accent="amber" className="p-5" />
        <StatTile label="Your Net Payout" value={money(totalNet)} accent="emerald" className="p-5" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div onClick={() => setPaymentMethod('factoring')}
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'factoring' ? 'border-amber-500 bg-amber-500/5' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${paymentMethod === 'factoring' ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-400'}`}><Building size={24} /></div>
            {paymentMethod === 'factoring' && <CheckCircle2 className="text-amber-500" size={24} />}
          </div>
          <h3 className="text-xl font-bold mb-2">The Factoring Split</h3>
          <p className="text-sm text-slate-400">Automated, invisible settlement. We submit your BOL with a Notice of Assignment. They send you 90% and us our 10% directly.</p>
        </div>

        <div onClick={() => setPaymentMethod('ach')}
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'ach' ? 'border-amber-500 bg-amber-500/5' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}>
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${paymentMethod === 'ach' ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-400'}`}><CreditCard size={24} /></div>
            {paymentMethod === 'ach' && <CheckCircle2 className="text-amber-500" size={24} />}
          </div>
          <h3 className="text-xl font-bold mb-2">Smart ACH Auto-Pay</h3>
          <p className="text-sm text-slate-400">Keep your payouts whole. You get paid 100% from the broker. We run a weekly auto-draft for our percentage every Friday.</p>
        </div>
      </div>

      <Card className="p-6 overflow-x-auto">
        <h3 className="text-lg font-bold mb-4">Settlements Ledger</h3>
        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState('');

  const blank = {
    driverUid: '',
    loadId: 'FM-' + Math.floor(1000 + Math.random() * 9000),
    origin: '', destination: '', commodity: '', weight: '',
    po_number: '', pickup_number: '', pickup_time: '',
    delivery_time: '', delivery_date: '', gross_pay: '',
  };
  const [form, setForm] = useState(blank);

  useEffect(() => {
    const loadDrivers = async () => {
      try {
        const snap = await getDocs(orgScoped('users'));
        setDrivers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
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
      await addDoc(collection(db, 'loads'), stampOrg({
        ...form,
        uid: form.driverUid,
        gross_pay: Number(form.gross_pay) || 0,
        status: 'Dispatched',
        createdAt: serverTimestamp(),
      }));
      const drv = drivers.find((d) => d.uid === form.driverUid);
      setDone(`Load ${form.loadId} assigned to ${drv?.email || 'driver'} ✓`);
      setForm({ ...blank, loadId: 'FM-' + Math.floor(1000 + Math.random() * 9000) });
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
      <GuidedHint>Assign Load creates a load <strong>directly</strong> (no accept/decline). For a load the carrier should review and accept first, build it in the <strong>Rate Calculator</strong> and use “Send as Offer” instead.</GuidedHint>

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
// ---------- ADMIN: ALL LOADS ----------
function AllLoadsView() {
  const [loads, setLoads] = useState([]);
  const [users, setUsers] = useState({});
  const [userList, setUserList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [driverFilter, setDriverFilter] = useState('All');
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
      alert('Upload failed: ' + (err.code === 'storage/unauthorized' ? 'check the Storage rules allow admin write to load_docs.' : (err.message || 'try again')));
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

  const changeStatus = async (loadDocId, newStatus) => {
    if (!newStatus) return;
    setUpdatingId(loadDocId);
    try {
      await updateDoc(doc(db, 'loads', loadDocId), { status: newStatus });
      setLoads((prev) => prev.map((l) => (l.id === loadDocId ? { ...l, status: newStatus } : l)));
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
      closeEdit();
    } catch (err) {
      console.error('Error saving load:', err);
      alert('Error saving — check the console.');
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
      alert('Error deleting — check the console.');
    } finally {
      setSaving(false);
    }
  };

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const driverEmails = Array.from(new Set(loads.map((l) => users[l.uid] || l.uid).filter(Boolean)));

  const filtered = loads.filter((l) => {
    const okStatus = statusFilter === 'All' || l.status === statusFilter;
    const okDriver = driverFilter === 'All' || (users[l.uid] || l.uid) === driverFilter;
    return okStatus && okDriver;
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

  if (loading) return <div className="text-slate-400">Loading all loads…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">All Loads</h2>
          <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
        </div>
        <GhostButton onClick={fetchAll} className="text-sm px-3 py-2">Refresh</GhostButton>
      </div>

      <GuidedHint>Your command center for every load. Use the <strong>Status</strong> dropdown to advance a load, <strong>Edit</strong> to fix details or work the paperwork checklist, and <strong>Cancel Offer</strong> to pull back a pending offer.</GuidedHint>

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
      </div>

      {filtered.length === 0 ? (
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
                  <tr key={l.id} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                    <Td className="font-mono text-amber-500 font-semibold">{l.loadId || '—'}</Td>
                    <Td className="text-slate-300">{users[l.uid] || <span className="text-slate-500">unknown</span>}</Td>
                    <Td className="text-slate-300">{l.origin || '—'} <span className="text-slate-600">→</span> {l.destination || '—'}</Td>
                    <Td className="text-slate-400">{l.delivery_date || '—'}</Td>
                    <Td className="font-semibold text-white">{money(l.gross_pay)}</Td>
                    <Td><StatusSelect l={l} />{offerBadge(l.offerStatus) && <div className="mt-1">{offerBadge(l.offerStatus)}</div>}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <OfferButton l={l} />
                        <button onClick={() => openEdit(l)} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition-colors">Edit</button>
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
                <div className="flex items-center justify-between">
                  <span className="font-mono text-amber-500 font-semibold text-sm">{l.loadId || '—'}</span>
                  <span className="font-semibold text-white text-sm">{money(l.gross_pay)}</span>
                </div>
                <div className="text-sm text-slate-300">{l.origin || '—'} → {l.destination || '—'}</div>
                <div className="text-xs text-slate-400">Driver: {users[l.uid] || 'unknown'}</div>
                <div className="text-xs text-slate-400">Delivery: {l.delivery_date || '—'}</div>
                {offerBadge(l.offerStatus) && <div>{offerBadge(l.offerStatus)}{l.offerStatus === 'declined' && l.declineReason ? <span className="text-[10px] text-slate-500 ml-2">({l.declineReason})</span> : null}</div>}
                <div className="flex gap-2 items-center">
                  <div className="flex-1"><StatusSelect l={l} full /></div>
                  <OfferButton l={l} />
                  <button onClick={() => openEdit(l)} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg transition-colors shrink-0">Edit</button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {editing && form && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={closeEdit}>
          <Card
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl p-6 my-8"
          >
            <form onSubmit={saveEdit} className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Load <span className="font-mono text-amber-500">{form.loadId}</span></h3>
              <button type="button" onClick={closeEdit} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
            </div>

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
                  {editing.rateConSigned ? <Badge tone="emerald"><CheckCircle2 size={11} /> Signed by {editing.rateConSigned.name}</Badge>
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
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
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
    <div className="relative flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-950 to-[#0b1220] text-slate-100 font-sans p-4 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
      <div className="relative w-full max-w-md bg-slate-900/80 backdrop-blur border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/40">
        <div className="flex justify-center mb-8"><BrandLockup size={42} stack /></div>

        <h2 className="text-xl font-bold mb-2">Sign In</h2>
        <p className="text-sm text-slate-400 mb-6">Access is invite-only. Use the email and temporary password your dispatcher gave you.</p>

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
          Need access? Ask your dispatcher to add you.
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
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-950 to-[#0b1220] text-slate-100 font-sans p-4">
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
      queueEmail(email.trim(), 'Welcome to Forward Motion Freight — your portal is ready',
        welcomeCarrierEmail({ name: '', email: email.trim(), tempPw: pw }));
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
                const txt = `Welcome to Forward Motion Freight!\n\nYour driver portal is ready. Here's how to get started:\n\n1) Sign in: https://portal.forwardmotionfreight.com\n     Email: ${created.email}\n     Temporary password: ${created.pw}\n\n2) You'll be prompted to set your own password.\n3) A quick 2-minute setup confirms your carrier profile.\n4) Take the optional dashboard tour, and you're ready to roll.\n\nFrom there you'll see your assigned loads, pay, compliance, and more — all in one place.\n\nQuestions? Just reply to this email.\n\n— Forward Motion Freight Dispatch`;
                if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => alert('Welcome email copied to your clipboard.')).catch(() => {});
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
          <div className="text-slate-400 text-sm">Loading…</div>
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
function NegotiationCalcView() {
  const guided = useGuided();
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

  const [v, setV] = useState(() => ({ ...DEFAULTS, ...(loadSaved().v || {}) }));
  const [stops, setStops] = useState(() => loadSaved().stops || []);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const n = (x) => parseFloat(x) || 0;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ v, stops })); } catch (_) {}
  }, [v, stops]);

  const clearAll = () => { setV(DEFAULTS); setStops([]); try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} };
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
      const loadId = 'FM-' + Math.floor(1000 + Math.random() * 9000);
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
        feePct: Number(selectedCarrierObj.feePct) || DEFAULT_FEE_PCT,
        pickup_time: v.pickupAt ? new Date(v.pickupAt).toLocaleString() : '',
        delivery_time: v.deliveryAt ? new Date(v.deliveryAt).toLocaleString() : '',
        delivery_date: v.deliveryAt ? v.deliveryAt.slice(0, 10) : '',
        status: asOffer ? 'Offered' : 'Dispatched',
        ...(asOffer ? { offerStatus: 'pending', offerSentAt: serverTimestamp() } : {}),
        createdAt: serverTimestamp(),
      }));
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

  const brokerOffer = n(v.brokerOffer);
  const tolls = n(v.tolls);
  const mpg = n(v.mpg);
  const fuelPrice = n(v.fuelPrice);
  const minRpm = n(v.minRpm);
  const marketRpm = n(v.marketRpm);
  const maxCap = n(v.maxCapacity);
  const weight = n(v.weight);
  const totalMiles = n(v.loadedMiles) + n(v.deadheadMiles);

  const trueRpm = totalMiles > 0 ? brokerOffer / totalMiles : 0;
  const tripCost = (mpg > 0 ? (totalMiles / mpg) * fuelPrice : 0) + tolls + surcharge;
  const targetOffer = minRpm * totalMiles + tolls + surcharge;
  const gap = targetOffer - brokerOffer;
  const weightFactor = maxCap > 0 ? (weight / maxCap) * 100 : 0;
  // Market comparison (manual rate now; live data later).
  const marketTarget = marketRpm > 0 ? marketRpm * totalMiles + tolls + surcharge : 0;
  const vsMarket = marketRpm > 0 ? trueRpm - marketRpm : 0;
  const marketGap = marketTarget > 0 ? marketTarget - brokerOffer : 0;

  const ready = brokerOffer > 0 && totalMiles > 0 && minRpm > 0;

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

  const Metric = ({ label, value, guide, accent, highlight }) => (
    <div className={`border rounded-xl p-4 ${highlight ? 'bg-amber-500/10 border-amber-500/40' : 'bg-slate-800/50 border-slate-700'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-xs ${highlight ? 'text-amber-300 font-semibold' : 'text-slate-400'}`}>{label}</span>
        <span className={`font-bold ${highlight ? 'text-2xl' : 'text-lg'} ${accent || 'text-white'}`}>{value}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2 leading-snug">{guide}</p>
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
        <strong>Negotiation tip:</strong> never accept the broker's first number. Counter toward your <strong>Target Offer (floor)</strong> below. If they're ~20¢/mi under the carrier's minimum, anchor to a real number: <em>"My carrier's floor on this lane is $___/mi; after deadhead I can do it at $____ all-in and keep your pickup on time."</em> See the <strong>Training → Negotiation Scripts</strong> tab for full talk-tracks.
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
              {MARKET_RATES[v.commodity] ? (
                <button type="button" onClick={() => setV((s) => ({ ...s, marketRpm: String(MARKET_RATES[v.commodity]) }))}
                  className="text-[10px] text-amber-400 hover:text-amber-300 mt-1">
                  Market ~${MARKET_RATES[v.commodity].toFixed(2)}/mi ({MARKET_AS_OF}) — tap to use
                </button>
              ) : <p className="text-[10px] text-slate-500 mt-1">Manual now — live market data later.</p>}
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
            guide="What the truck actually earns per mile driven. Compare to Carrier Min — if it's lower, you must negotiate." />
          <Metric label="Trip Cost" value={money(tripCost)}
            guide={`Hard cash to move the truck — fuel + tolls${surcharge > 0 ? ` + ${money(surcharge)} equipment accessorial` : ''}. The offer must cover this plus profit.`} />
          <Metric label="Target Offer (Floor)" value={money(targetOffer)} accent="text-amber-400" highlight
            guide="Your negotiation floor. Don't accept below this — counter the broker slightly higher than this number." />
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
            <PrimaryButton type="button" onClick={() => assignLoad(true)} disabled={assigning || !selectedCarrierObj} className="w-full px-4 py-2.5">
              {assigning ? 'Working…' : '📣 Send as Offer (carrier accepts/declines)'}
            </PrimaryButton>
            <GhostButton type="button" onClick={() => assignLoad(false)} disabled={assigning || !selectedCarrierObj} className="w-full border border-slate-700">
              ➕ Assign Directly (no offer)
            </GhostButton>
            <p className="text-[11px] text-slate-500">
              {selectedCarrierObj ? `Creates a dispatched load for ${selectedCarrierObj.name} and sends it to their portal.` : 'Pick a saved carrier above to enable.'}
            </p>
            {assignMsg && <p className={`text-sm ${assignMsg.includes('✓') ? 'text-emerald-400' : 'text-amber-400'}`}>{assignMsg}</p>}
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-950 to-[#0b1220] text-slate-100 font-sans p-6">
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-[#0b1220] text-slate-100 font-sans py-10 px-4">
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

function CarriersView() {
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
        if (form.newLoginPw.length < 6) { alert('Temporary password must be at least 6 characters.'); setSaving(false); return; }
        try {
          const uid = await createDriverAccount(form.newLoginEmail.trim(), form.newLoginPw);
          await setDoc(doc(db, 'users', uid), stampOrg({
            email: form.newLoginEmail.trim(), approved: true, mustChangePassword: true,
            role: 'driver', vipConcierge: !!form.vipConcierge, createdAt: serverTimestamp(),
          }), { merge: true });
          linkedUid = uid;
          setCreatedLogin({ email: form.newLoginEmail.trim(), pw: form.newLoginPw });
          queueEmail(form.newLoginEmail.trim(), 'Welcome to Forward Motion Freight — your portal is ready',
            welcomeCarrierEmail({ name: form.driverName.trim() || form.name.trim(), email: form.newLoginEmail.trim(), tempPw: form.newLoginPw }));
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
        feePct: Number(form.feePct) || DEFAULT_FEE_PCT,
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
      alert('Error adding carrier — check the console.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this carrier profile?')) return;
    try {
      await deleteDoc(doc(db, 'carriers', id));
      setList((p) => p.filter((c) => c.id !== id));
    } catch (e) {
      console.error('Error removing carrier:', e);
    }
  };

  const updateHours = async (id, hours) => {
    try {
      await updateDoc(doc(db, 'carriers', id), { currentDriveHours: Number(hours) || 0 });
      setList((p) => p.map((c) => (c.id === id ? { ...c, currentDriveHours: Number(hours) || 0 } : c)));
    } catch (e) {
      console.error('Error updating hours:', e);
    }
  };

  const updateFee = async (id, pct) => {
    const v = Number(pct) || DEFAULT_FEE_PCT;
    try {
      await updateDoc(doc(db, 'carriers', id), { feePct: v });
      setList((p) => p.map((c) => (c.id === id ? { ...c, feePct: v } : c)));
    } catch (e) { console.error('Error updating fee:', e); }
  };

  const updateAvailability = async (id, value) => {
    try {
      await updateDoc(doc(db, 'carriers', id), { availability: value });
      setList((p) => p.map((c) => (c.id === id ? { ...c, availability: value } : c)));
    } catch (e) { console.error('Error updating availability:', e); }
  };

  // Toggle VIP for a carrier AND mirror it onto their linked driver login.
  const toggleVip = async (c) => {
    const next = !c.vipConcierge;
    try {
      await updateDoc(doc(db, 'carriers', c.id), { vipConcierge: next });
      if (c.linkedDriverUid) {
        try { await setDoc(doc(db, 'users', c.linkedDriverUid), { vipConcierge: next }, { merge: true }); } catch (_) {}
      }
      setList((p) => p.map((x) => (x.id === c.id ? { ...x, vipConcierge: next } : x)));
    } catch (e) { console.error('Error toggling VIP:', e); }
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
                  {k === 'authority' && <a href="https://safer.fmcsa.dot.gov/CompanySnapshot.aspx" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-amber-400 hover:underline">open SAFER ↗</a>}
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
                const txt = `Welcome to Forward Motion Freight!\n\nYour driver portal is ready. Here's how to get started:\n\n1) Sign in: https://portal.forwardmotionfreight.com\n     Email: ${createdLogin.email}\n     Temporary password: ${createdLogin.pw}\n\n2) You'll be prompted to set your own password.\n3) A quick 2-minute setup confirms your carrier profile.\n4) Take the optional dashboard tour, and you're ready to roll.\n\nQuestions? Just reply to this email.\n\n— Forward Motion Freight Dispatch`;
                if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => alert('Welcome email copied to your clipboard.')).catch(() => {});
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
        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
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
                    <div className="text-xs text-slate-500 mt-0.5">Driver: {c.linkedDriverUid ? (driverEmail(c.linkedDriverUid) || 'linked') : <span className="text-amber-400">not linked</span>}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button onClick={() => remove(c.id)} className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg">Remove</button>
                    {c.vipConcierge && <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"><HeartPulse size={10} /> VIP</span>}
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
      alert('Error saving — check the console.');
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
          <div className="text-slate-400 text-sm">Loading…</div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-[#0b1220] text-slate-100 font-sans flex flex-col">
      <div className="border-b border-slate-800/80 px-4 md:px-8 py-4 flex items-center justify-between">
        <BrandLockup size={30} />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-xs text-slate-400 mb-1">ACH Routing Number</label><input className={field} value={f.achRouting} onChange={set('achRouting')} /></div>
                  <div><label className="block text-xs text-slate-400 mb-1">ACH Account Number</label><input className={field} value={f.achAccount} onChange={set('achAccount')} /></div>
                </div>
              )}
              <p className="text-[11px] text-slate-500">Your banking details are stored with your carrier profile for settlement only.</p>
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

function TrainingView() {
  const [tab, setTab] = useState('practice');
  const TABS = [
    ['practice', 'Practice & Quiz'],
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
  const today = new Date().toISOString().slice(0, 10);
  const blank = { category: 'Fuel', amount: '', date: today, note: '' };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [eSnap, lSnap] = await Promise.all([
        getDocs(orgScoped('expenses')),
        getDocs(orgScoped('loads')),
      ]);
      const rows = eSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setExpenses(rows);
      const som = startOfMonth();
      let fees = 0;
      lSnap.docs.forEach((d) => {
        const l = d.data();
        const delivered = l.status === 'Delivered' || l.status === 'Cleared';
        const inMonth = l.delivery_date && new Date(l.delivery_date + 'T00:00:00') >= som;
        if (delivered && inMonth) fees += (Number(l.gross_pay) || 0) * ((Number(l.feePct) || DEFAULT_FEE_PCT) / 100);
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
    a.download = 'forward-motion-expenses.csv';
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
        {loading ? <div className="text-slate-400 text-sm">Loading…</div>
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
  const verdictCls = { red: 'bg-red-500/15 border-red-500/40 text-red-300', amber: 'bg-amber-500/15 border-amber-500/40 text-amber-300', emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300' }[verdict.tone];

  const reset = () => { setB({ name: '', mc: '' }); setChecks({}); setFlags({}); };
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
        <div className="mt-4">
          <GhostButton onClick={reset} className="text-sm">Reset for next broker</GhostButton>
        </div>
      </Card>

      <p className="text-[11px] text-slate-600">Manual vetting for now. Live SAFER lookups, the public suspended-broker list, and automatic factorability checks arrive with the backend phase.</p>
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
    setBusyId(r.uid);
    try {
      await setDoc(doc(db, 'users', r.uid), { vipConcierge: true, vipRequested: false }, { merge: true });
      if (r.carrier) await updateDoc(doc(db, 'carriers', r.carrier.id), { vipConcierge: true });
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

      {loading ? <div className="text-slate-400">Loading…</div> : (
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
                    <Badge tone="amber"><HeartPulse size={11} /> VIP · {Number(c.feePct || DEFAULT_FEE_PCT)}% fee</Badge>
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
  useEffect(() => {
    if (!isAdmin || !ACTIVE_ORG) return;
    (async () => { try { const s = await getDoc(doc(db, 'orgs', ACTIVE_ORG)); if (s.exists()) setPhone(s.data().dispatchPhone || ''); } catch (_) {} })();
  }, [isAdmin]);
  const savePhone = async () => {
    if (!ACTIVE_ORG) { setPhoneMsg('Create your workspace first (Workspaces tab).'); return; }
    try { await setDoc(doc(db, 'orgs', ACTIVE_ORG), { dispatchPhone: phone.trim() }, { merge: true }); setPhoneMsg('Saved ✓'); setTimeout(() => setPhoneMsg(''), 2000); }
    catch (e) { console.error('phone save failed', e); setPhoneMsg('Could not save — make sure the updated org rules are published.'); }
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
function WorkspacesView() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ workspaceName: '', email: '', pw: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [created, setCreated] = useState(null);
  const [err, setErr] = useState('');
  const genPw = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = ''; for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setForm((f) => ({ ...f, pw: p }));
  };

  const [ownerStatus, setOwnerStatus] = useState({}); // uid -> active(bool)
  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const [oSnap, uSnap] = await Promise.all([getDocs(collection(db, 'orgs')), getDocs(collection(db, 'users'))]);
      setOrgs(oSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const st = {}; uSnap.docs.forEach((d) => { st[d.id] = d.data().approved !== false; });
      setOwnerStatus(st);
    } catch (e) { console.error('orgs load failed', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchOrgs(); }, []);

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
      const uid = await createDriverAccount(form.email.trim(), form.pw);
      const orgRef = await addDoc(collection(db, 'orgs'), { name: form.workspaceName.trim(), ownerUid: uid, ownerEmail: form.email.trim(), createdAt: serverTimestamp(), config: {} });
      await setDoc(doc(db, 'users', uid), { email: form.email.trim(), approved: true, mustChangePassword: true, orgId: orgRef.id, role: 'admin', createdAt: serverTimestamp() }, { merge: true });
      setCreated({ email: form.email.trim(), pw: form.pw, workspace: form.workspaceName.trim() });
      queueEmail(form.email.trim(), 'Your Forward OS dispatcher access is ready',
        welcomeDispatcherEmail({ name: '', email: form.email.trim(), tempPw: form.pw }));
      setForm({ workspaceName: '', email: '', pw: '' });
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
            <Field label="Workspace name"><input className={INPUT_CLS} value={form.workspaceName} onChange={set('workspaceName')} placeholder="Cole Dispatch Co." /></Field>
            <Field label="Dispatcher email"><input className={INPUT_CLS} type="email" value={form.email} onChange={set('email')} placeholder="dispatcher@example.com" /></Field>
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
        {loading ? <div className="text-slate-400 text-sm">Loading…</div>
          : orgs.length === 0 ? <div className="text-slate-500 text-sm">No workspaces yet. (Or the orgs rule isn't published.)</div>
          : (
            <div className="space-y-2">
              {orgs.map((o) => {
                const isMe = o.ownerUid && o.ownerUid === auth.currentUser?.uid;
                const active = !o.ownerUid || ownerStatus[o.ownerUid] !== false;
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 bg-slate-800/40 border border-slate-700 rounded-xl p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{o.name}</div>
                      <div className="text-xs text-slate-500">{o.ownerEmail} · {o.id.slice(0, 8)}…</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isMe ? <span className="text-[11px] text-slate-400">You</span>
                        : active ? <span className="text-[11px] text-emerald-400">● Active</span>
                        : <span className="text-[11px] text-red-400">● Deactivated</span>}
                      {!isMe && (
                        <button onClick={() => toggleDispatcher(o)}
                          className={`text-xs border px-2.5 py-1 rounded-lg ${active ? 'text-red-400 border-red-500/30 hover:bg-red-500/10' : 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                          {active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
      className={`group w-full flex items-center gap-3 mx-3 my-0.5 px-3 py-2.5 rounded-xl transition-all duration-150 ${
        isActive
          ? 'bg-amber-500/10 text-white ring-1 ring-amber-500/30'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
      }`}
      style={{ width: 'calc(100% - 1.5rem)' }}
    >
      <span className={isActive ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}>{icon}</span>
      <span className="font-medium text-sm">{label}</span>
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400" />}
    </button>
  );
}

// ============================================================================
// ===== Pass 2 — shared UI primitives (consistent component patterns) ========
// Presentational only; adopt across screens so every panel/form/table matches.
// ============================================================================

// Standardized control styling, reused by every form in the app.
const INPUT_CLS = 'w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-colors';
const SELECT_CLS = INPUT_CLS;
const LABEL_CLS = 'block text-xs font-medium text-slate-400 mb-1.5';

// Standard surface panel. Pass 3: flatter, squarer "operations console" look
// (hairline border, no drop shadow) so the portal reads like a tool, not a
// brochure — deliberately distinct from the rounded marketing-site cards.
function Card({ children, className = '', ...rest }) {
  return (
    <div className={`bg-slate-900/60 border border-slate-800/80 rounded-xl ${className}`} {...rest}>
      {children}
    </div>
  );
}

// Panel/section header: a vertical accent rail + title, optional icon, inline
// badge, right-aligned action. The rail gives screens a console-like structure.
function PanelHeader({ icon, title, accent = 'amber', badge, action, className = '' }) {
  const accentCls = { amber: 'text-amber-500', blue: 'text-blue-400', emerald: 'text-emerald-400', slate: 'text-slate-400' }[accent] || 'text-amber-500';
  const railCls = { amber: 'bg-amber-500', blue: 'bg-blue-400', emerald: 'bg-emerald-400', slate: 'bg-slate-500' }[accent] || 'bg-amber-500';
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h3 className="text-base font-semibold text-white flex items-center gap-2.5 min-w-0">
        <span className={`w-1 h-4 rounded-full shrink-0 ${railCls}`} />
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
  const v = { white: 'text-white', emerald: 'text-emerald-400', amber: 'text-amber-400', blue: 'text-blue-400', red: 'text-red-400', slate: 'text-slate-300' }[accent] || 'text-white';
  const rail = { white: 'border-l-slate-600', emerald: 'border-l-emerald-500', amber: 'border-l-amber-500', blue: 'border-l-blue-400', red: 'border-l-red-500', slate: 'border-l-slate-600' }[accent] || 'border-l-slate-600';
  return (
    <div className={`bg-slate-800/40 border border-slate-700/60 border-l-2 ${rail} rounded-lg p-4 ${className}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${v} ${glow ? 'fm-profit' : ''}`}>{value}</div>
    </div>
  );
}

// Subtle pulse on profit / "money in your pocket" figures. Injected once.
const PROFIT_GLOW_CSS = `@keyframes fmProfitGlow{0%,100%{text-shadow:0 0 0 rgba(16,185,129,0)}50%{text-shadow:0 0 16px rgba(16,185,129,.6)}}.fm-profit{animation:fmProfitGlow 2.6s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.fm-profit{animation:none}}`;

// Colored status pill.
function Badge({ children, tone = 'slate', className = '' }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  };
  return <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${tones[tone] || tones.slate} ${className}`}>{children}</span>;
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
  return <button className={`inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${className}`} {...rest}>{children}</button>;
}
function GhostButton({ children, className = '', ...rest }) {
  return <button className={`inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 ${className}`} {...rest}>{children}</button>;
}

// Table primitives — consistent header + cell styling.
function Th({ children, className = '' }) {
  return <th className={`text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 ${className}`}>{children}</th>;
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
      const pct = Number(l.feePct) || (c && Number(c.feePct)) || DEFAULT_FEE_PCT;
      return { loadId: l.loadId || l.id, lane: `${l.origin || '?'} → ${l.destination || '?'}`, date: l.delivery_date || '', gross, pct, fee: gross * pct / 100 };
    });
    return { uid, name, mc: c && c.mcNumber, email: emailByUid[uid], lines,
      totalGross: lines.reduce((s, x) => s + x.gross, 0), totalFee: lines.reduce((s, x) => s + x.fee, 0) };
  };
  const invoices = Object.entries(groups).map(([uid, items]) => invoiceFor(uid, items)).sort((a, b) => b.totalFee - a.totalFee);
  const weekFee = invoices.reduce((s, i) => s + i.totalFee, 0);

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
  const printInvoice = (inv) => {
    const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print the invoice.'); return; }
    const rowsHtml = inv.lines.map((x) => `<tr><td>${x.loadId}</td><td>${x.lane}</td><td>${x.date}</td><td style="text-align:right">${money(x.gross)}</td><td style="text-align:right">${x.pct}%</td><td style="text-align:right">${money(x.fee)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><title>Invoice — ${inv.name}</title><style>body{font-family:Arial,sans-serif;color:#111;max-width:720px;margin:30px auto;padding:0 16px}h1{color:#0a0f1a;margin-bottom:2px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:13px}th{background:#f4f4f4}.tot{font-weight:bold;font-size:15px;text-align:right;margin-top:10px}.muted{color:#666;font-size:12px}</style></head><body><h1>Forward Motion Freight</h1><div class="muted">Dispatch Invoice · Week of ${weekLabel}</div><h2>Bill to: ${inv.name}${inv.mc ? ' (' + inv.mc + ')' : ''}</h2><table><thead><tr><th>Load</th><th>Lane</th><th>Delivered</th><th>Gross</th><th>Fee %</th><th>Dispatch Fee</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="tot">Total gross: ${money(inv.totalGross)}</div><div class="tot">Dispatch fee due: ${money(inv.totalFee)}</div><p class="muted">Generated by Forward OS. Payable per your dispatch agreement.</p></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch (_) {} }, 300);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Weekly Invoices</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Auto-built from each carrier's delivered loads this week — ready to export and bill.</p>
      <GuidedHint>Pick a week, and the system totals each carrier's delivered loads × your dispatch fee. Export to CSV for your records or Print/Save-PDF to send the carrier. This is your weekly billing, done.</GuidedHint>

      <div className="flex items-center gap-3">
        <GhostButton onClick={() => setWeekOffset((w) => w - 1)} className="text-sm">← Prev</GhostButton>
        <div className="text-center">
          <div className="font-semibold text-white">Week of {weekLabel}</div>
          <div className="text-xs text-slate-500">{weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : `${Math.abs(weekOffset)} weeks ${weekOffset < 0 ? 'ago' : 'ahead'}`}</div>
        </div>
        <GhostButton onClick={() => setWeekOffset((w) => w + 1)} className="text-sm">Next →</GhostButton>
        <div className="ml-auto text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total fees this week</div>
          <div className="text-xl font-bold text-emerald-400 fm-profit">{money(weekFee)}</div>
        </div>
      </div>

      {loading ? <div className="text-slate-500 text-center py-12">Loading…</div>
        : invoices.length === 0 ? <div className="text-slate-500 text-center py-12">No delivered loads in this week.</div>
        : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <Card key={inv.uid} className="p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <button onClick={() => setOpen(open === inv.uid ? null : inv.uid)} className="text-left min-w-0">
                    <div className="font-bold text-white">{inv.name}{inv.mc ? <span className="text-slate-400 font-normal"> · {inv.mc}</span> : ''}</div>
                    <div className="text-xs text-slate-400">{inv.lines.length} load(s) · gross {money(inv.totalGross)}</div>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Fee due</div>
                      <div className="text-lg font-bold text-emerald-400">{money(inv.totalFee)}</div>
                    </div>
                    <button onClick={() => exportCsv(inv)} className="text-xs border border-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg hover:bg-slate-800">CSV</button>
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
          out.push({ id: 'offer-' + l.id, tone: 'amber', icon: '📣', text: `Offer ${l.loadId || ''} awaiting ${emailByUid[l.uid] || 'carrier'}`, tab: 'allloads' });
        });
        loads.filter((l) => l.offerStatus === 'declined').forEach((l) => {
          out.push({ id: 'declined-' + l.id, tone: 'red', icon: '✕', text: `${emailByUid[l.uid] || 'Carrier'} declined ${l.loadId || ''}${l.declineReason ? ' — ' + l.declineReason : ''}`, tab: 'allloads' });
        });
        loads.filter((l) => l.detention && l.detention.status === 'filed').forEach((l) => {
          out.push({ id: 'det-' + l.id, tone: 'amber', icon: '⏱', text: `Detention filed on ${l.loadId || 'a load'} — $${Number(l.detention.amount || 0).toLocaleString()} (${emailByUid[l.uid] || 'carrier'})`, tab: 'allloads' });
        });
        loads.filter((l) => l.rateConUrl && l.rateConSigned).forEach((l) => {
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

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toneDot = { amber: 'bg-amber-400', red: 'bg-red-400', blue: 'bg-blue-400', emerald: 'bg-emerald-400', slate: 'bg-slate-500' };
  const count = items.length;

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
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <span className="text-sm font-semibold text-white">Notifications{count > 0 ? ` (${count})` : ''}</span>
            <button onClick={() => build()} className="text-xs text-slate-400 hover:text-amber-400 transition-colors">Refresh</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!loaded ? (
              <div className="px-4 py-6 text-sm text-slate-500 text-center">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-500 text-center">You're all caught up. 🎉</div>
            ) : (
              items.map((it) => (
                <button key={it.id} onClick={() => { setOpen(false); onNavigate && onNavigate(it.tab); }}
                  className="w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/50 transition-colors">
                  <span className="text-base leading-none shrink-0">{it.icon}</span>
                  <span className="text-sm text-slate-200 leading-snug flex-1">{it.text}</span>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${toneDot[it.tone] || toneDot.slate}`} />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}








