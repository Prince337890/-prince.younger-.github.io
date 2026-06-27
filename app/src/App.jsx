import React, { useState, useEffect, useRef } from 'react';
import {
  Map, FileText, Wallet, HeartPulse, Dog, LayoutDashboard, Bell, Settings,
  Upload, CheckCircle2, Navigation, Activity, ShieldCheck, CreditCard, Building,
  MapPin, User, Calendar, Wrench, Plus, GraduationCap, BookOpen
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, getDocs, collection, setDoc, addDoc,
  query, where, serverTimestamp, updateDoc, deleteDoc
} from 'firebase/firestore';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
  sendPasswordResetEmail
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
const GOOGLE_MAPS_API_KEY = 'AIzaSyDhJu-V7Cth7A-VBvKkEbDIJzvMXPTN1J4';

// Apps Script /exec URL that returns carrier-packet form submissions (JSONP).
const CARRIER_PACKET_API_URL = 'https://script.google.com/macros/s/AKfycby0hAu4ahT-tn8GZRqeFmKxQS0i0snSdv1SQCxfBnU2moRT6XoIJnTl9NxnQVTr_E5J/exec';

// Loads JSON cross-origin via a <script> tag (JSONP) — bypasses CORS.
function jsonpFetch(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cb = 'fmPacketCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const sep = url.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    let done = false;
    const cleanup = () => {
      try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => { if (!done) { done = true; cleanup(); reject(new Error('Timed out')); } }, timeoutMs);
    window[cb] = (data) => { if (!done) { done = true; cleanup(); resolve(data); } };
    script.onerror = () => { if (!done) { done = true; cleanup(); reject(new Error('Script load error')); } };
    script.src = url + sep + 'callback=' + cb;
    document.body.appendChild(script);
  });
}

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
        setNeedsPwChange(!admin && data && data.mustChangePassword === true);
        setNeedsOnboarding(!admin && !(data && data.onboardingComplete === true));
        setVipOn(admin || !data || data.vipConcierge !== false); // off only when explicitly disabled
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

  const isAdmin = !!user && isAdminEmail(user.email);

  useEffect(() => {
    if (!isAdmin) { setCarrierOpts([]); return; }
    getDocs(collection(db, 'carriers'))
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

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView key={'dash-' + viewUid} uid={viewUid} displayName={viewName} isAdmin={isAdmin && !viewAs} vipOn={vipOn} />;
      case 'newauthority': return <NewAuthorityView />;
      case 'profile': return <ProfileView key={'prof-' + viewUid} uid={viewUid} displayName={viewName} />;
      case 'schedule': return <ScheduleView key={'sched-' + viewUid} uid={viewUid} />;
      case 'lanes': return <LaneManagementView key={'lane-' + viewUid} uid={viewUid} />;
      case 'parking': return <SafeParkingView />;
      case 'compliance': return <ComplianceView key={'comp-' + viewUid} uid={viewUid} />;
      case 'vault': return <DigitalVaultView />;
      case 'financials': return <FinancialsView key={'fin-' + viewUid} uid={viewUid} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />;
      case 'wellness': return <WellnessView />;
      case 'pets': return <PetLogisticsView />;
      case 'upgrades': return <UpgradesView key={'upg-' + viewUid} uid={viewUid} />;
      case 'expenses': return isAdmin ? <ExpensesView /> : <DashboardView />;
      case 'assign': return isAdmin ? <AssignLoadView /> : <DashboardView />;
      case 'allloads': return isAdmin ? <AllLoadsView /> : <DashboardView />;
      case 'drivers': return isAdmin ? <ManageDriversView /> : <DashboardView />;
      case 'fleet': return isAdmin ? <FleetView /> : <DashboardView />;
      case 'carriers': return isAdmin ? <CarriersView /> : <DashboardView />;
      case 'laneintel': return isAdmin ? <LaneIntelView /> : <DashboardView />;
      case 'calc': return isAdmin ? <NegotiationCalcView /> : <DashboardView />;
      case 'training': return isAdmin ? <TrainingView /> : <DashboardView />;
      default: return <DashboardView />;
    }
  };

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

  return (
    <GuidedModeContext.Provider value={isAdmin && guidedMode}>
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
              <div className="px-4 mb-2 text-xs font-semibold text-amber-500 tracking-wider">DISPATCH</div>
              <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => go('dashboard')} />
              <NavItem icon={<Plus size={18} />} label="Assign Load" isActive={activeTab === 'assign'} onClick={() => go('assign')} />
              <NavItem icon={<Navigation size={18} />} label="All Loads" isActive={activeTab === 'allloads'} onClick={() => go('allloads')} />
              <NavItem icon={<Wallet size={18} />} label="Rate Calculator" isActive={activeTab === 'calc'} onClick={() => go('calc')} />
              <NavItem icon={<CreditCard size={18} />} label="Expenses" isActive={activeTab === 'expenses'} onClick={() => go('expenses')} />
              <NavItem icon={<Building size={18} />} label="Carriers" isActive={activeTab === 'carriers'} onClick={() => go('carriers')} />
              <NavItem icon={<User size={18} />} label="Manage Drivers" isActive={activeTab === 'drivers'} onClick={() => go('drivers')} />
              <NavItem icon={<Map size={18} />} label="Lane Intel" isActive={activeTab === 'laneintel'} onClick={() => go('laneintel')} />
              <NavItem icon={<Activity size={18} />} label="Fleet (ELD)" isActive={activeTab === 'fleet'} onClick={() => go('fleet')} />
              <NavItem icon={<GraduationCap size={18} />} label="Training" isActive={activeTab === 'training'} onClick={() => go('training')} />
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
              <div className="text-xs text-emerald-400">{isAdmin ? '● Admin' : '● On Route'}</div>
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
            <button className="hover:text-white transition-colors"><Bell size={20} /></button>
            <button className="hover:text-white transition-colors"><Settings size={20} /></button>
          </div>
        </header>

        {viewAs && (
          <div className="bg-indigo-600 text-white px-4 md:px-8 py-2 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold truncate">👁 CARRIER VIEW — {viewAs.name}<span className="font-normal opacity-80 hidden sm:inline"> · you're seeing their portal</span></div>
            <button onClick={() => setViewAs(null)} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg shrink-0">Return to Admin</button>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${viewAs ? 'ring-2 ring-inset ring-indigo-600/50' : ''}`}>
          {renderContent()}
        </div>
      </main>
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
        const snap = await getDocs(collection(db, 'loads'));
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
          <div className="text-sm text-slate-400 mb-1">Gross Booked (This Week)</div>
          <div className="text-3xl font-bold text-emerald-400">{money(stats.gross)}</div>
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

// ---------- DASHBOARD ----------
function DashboardView({ uid, displayName, isAdmin, vipOn = true }) {
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

      {!isAdmin && (
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50 p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Safe travels, {name}.</h2>
            <p className="text-slate-400">Your next mandatory rest stop is in 3 hours. We've got everything handled.</p>
          </div>
          <div className="md:text-right">
            <div className="text-sm text-slate-400 mb-1">Gross Earnings (This Week)</div>
            <div className="text-3xl font-bold text-emerald-400">{money(earnings)}</div>
          </div>
        </Card>
      )}

      <QuoteOfTheDay />

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
              <div className="space-y-3">
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
              </div>
            )}
          </Card>

          {vipOn && (
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
          )}
        </div>
      )}
    </div>
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
            <div className="text-xl font-bold text-emerald-400">{money(gross)}</div>
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
        <div className="p-4 border-t border-slate-800 space-y-2">
          <PrimaryButton onClick={accept} disabled={busy} className="w-full py-3">
            {busy ? 'Working…' : '✓ Accept Offer'}
          </PrimaryButton>
          <div className="grid grid-cols-2 gap-2">
            <GhostButton onClick={() => setShowDecline(true)} disabled={busy} className="py-2.5">Decline</GhostButton>
            <a href={DISPATCHER_PHONE ? `tel:${DISPATCHER_PHONE}` : undefined}
              className={`text-center border border-slate-700 text-slate-300 font-semibold py-2.5 rounded-lg transition-colors ${DISPATCHER_PHONE ? 'hover:bg-slate-800' : 'opacity-50 pointer-events-none'}`}>
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

function QuoteOfTheDay() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const q = QUOTES[dayOfYear % QUOTES.length];

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
  const title = displayName || u?.email || 'Driver';
  const acctUid = uid || u?.uid;
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">{impersonating ? 'Carrier Profile' : 'My Profile'}</h2>
      <Card className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-2xl font-bold uppercase">
            {title ? title[0] : 'D'}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold truncate">{title}</div>
            <div className="text-sm text-emerald-400">● Active</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Info label={impersonating ? 'Carrier' : 'Email'} value={impersonating ? displayName : (u?.email || '—')} />
          <Info label="Account ID" value={acctUid ? acctUid.slice(0, 10) + '…' : '—'} />
          <Info label="Role" value="Carrier / Driver" />
          <Info label="Member Since" value={impersonating ? '—' : (u?.metadata?.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString() : '—')} />
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
// ---------- LANE MANAGEMENT ----------
function LaneManagementView({ uid }) {
  const targetUid = uid || auth.currentUser?.uid;
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

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
    try {
      await updateDoc(doc(db, 'loads', active.id), { status: newStatus });
      await fetchLoads();
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="max-w-4xl mx-auto text-slate-400">Loading lane…</div>;

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
      const snap = await getDocs(collection(db, 'safe_parking'));
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
      const ref = await addDoc(collection(db, 'safe_parking'), { ...form, createdAt: serverTimestamp() });
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
function ComplianceView({ uid }) {
  const targetUid = uid || auth.currentUser?.uid;
  const admin = ADMIN_EMAILS.map((e) => e.toLowerCase()).includes((auth.currentUser?.email || '').toLowerCase());
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
      await setDoc(doc(db, 'compliance', targetUid), { ...form, updatedAt: serverTimestamp() }, { merge: true });
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
const VAULT_CATEGORIES = ['BOL', 'Rate Con', 'Lumper Receipt', 'Scale Ticket'];
const SAMPLE_DOCUMENTS = [
  { id: 1, name: 'BOL_Atlanta-Dallas.pdf', category: 'BOL', loadId: 'FM-8829', date: 'Oct 24, 2024', status: 'Approved' },
  { id: 2, name: 'RateCon_FM-8829.pdf', category: 'Rate Con', loadId: 'FM-8829', date: 'Oct 24, 2024', status: 'Approved' },
  { id: 3, name: 'Lumper_Dallas.jpg', category: 'Lumper Receipt', loadId: 'FM-8830', date: 'Oct 26, 2024', status: 'Pending Approval' },
];

function DigitalVaultView() {
  const [docs, setDocs] = useState(SAMPLE_DOCUMENTS);
  const [filter, setFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [fileName, setFileName] = useState('');
  const [category, setCategory] = useState('BOL');
  const [loadId, setLoadId] = useState('');

  const filtered = filter === 'All' ? docs : docs.filter((d) => d.category === filter);

  const statusStyle = (status) => {
    if (status === 'Approved') return 'text-emerald-400 bg-emerald-400/10';
    if (status === 'Pending Approval') return 'text-amber-400 bg-amber-400/10';
    return 'text-red-400 bg-red-400/10';
  };

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (f) setFileName(f.name);
  };

  const handleUpload = (e) => {
    e.preventDefault();
    if (!fileName || !loadId) return;
    setDocs([{
      id: Date.now(), name: fileName, category, loadId,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      status: 'Pending Approval',
    }, ...docs]);
    setFileName(''); setLoadId(''); setCategory('BOL'); setShowForm(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">The Digital Vault</h2>
          <p className="text-slate-400">Your secure document cabinet — missing paperwork means missing pay.</p>
        </div>
        <PrimaryButton onClick={() => setShowForm((s) => !s)} className="shrink-0">
          <Upload size={18} /> Upload
        </PrimaryButton>
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={handleUpload} className="space-y-4">
          <h3 className="font-bold">New Document</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="File">
              <input type="file" onChange={handleFile}
                className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:cursor-pointer hover:file:bg-slate-700" />
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_CLS}>
                {VAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Load ID">
              <input type="text" value={loadId} onChange={(e) => setLoadId(e.target.value)} placeholder="e.g. FM-8831" className={INPUT_CLS} />
            </Field>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <PrimaryButton type="submit">Add to Vault</PrimaryButton>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
            <span className="text-xs text-slate-500">Demo — the file isn't stored yet; this adds the record only.</span>
          </div>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {['All', ...VAULT_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilter(c)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
              filter === c ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
            }`}>
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-slate-500 text-center py-12">No documents in this category yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((d) => (
            <Card key={d.id} className="p-5 flex items-start gap-4 hover:border-slate-700 transition-colors">
              <div className="p-3 bg-slate-800 text-amber-500 rounded-xl shrink-0"><FileText size={22} /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white truncate">{d.name}</div>
                <div className="text-xs text-slate-400 mt-1">Load {d.loadId} • {d.date}</div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">{d.category}</span>
                  <span className={`text-xs px-2 py-1 rounded ${statusStyle(d.status)}`}>{d.status}</span>
                </div>
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
        const snap = await getDocs(collection(db, 'users'));
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
      await addDoc(collection(db, 'loads'), {
        ...form,
        uid: form.driverUid,
        gross_pay: Number(form.gross_pay) || 0,
        status: 'Dispatched',
        createdAt: serverTimestamp(),
      });
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

  const STATUS_FLOW = ['Dispatched', 'Arrived at Shipper', 'Loaded', 'In Transit', 'Delivered'];

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [loadSnap, userSnap] = await Promise.all([
        getDocs(collection(db, 'loads')),
        getDocs(collection(db, 'users')),
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
      const snap = await getDocs(collection(db, 'users'));
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
      await setDoc(doc(db, 'users', uid), {
        email: email.trim(),
        approved: true,
        mustChangePassword: true,
        createdAt: serverTimestamp(),
      }, { merge: true });
      setCreated({ email: email.trim(), pw });
      setEmail(''); setPw('');
      fetchUsers();
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
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
        <h2 className="text-2xl font-bold">Manage Drivers</h2>
        <Badge tone="amber" className="font-bold tracking-wide">ADMIN</Badge>
      </div>
      <p className="text-slate-400">Create driver accounts and control who can sign in. Drivers can't self-register.</p>

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
        getDocs(collection(db, 'vehicles')),
        getDocs(collection(db, 'fleet_drivers')),
        getDocs(collection(db, 'hos_status')),
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
        ...DEMO_VEHICLES.map(({ id, ...data }) => setDoc(doc(db, 'vehicles', id), { ...data, syncedAt: ts }, { merge: true })),
        ...DEMO_DRIVERS.map(({ id, ...data }) => setDoc(doc(db, 'fleet_drivers', id), { ...data, syncedAt: ts }, { merge: true })),
        ...DEMO_HOS.map(({ id, ...data }) => setDoc(doc(db, 'hos_status', id), { ...data, syncedAt: ts }, { merge: true })),
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
    getDocs(collection(db, 'carriers'))
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
    // Guided Mode (Workflow C): RateCon pre-send checklist + minimum-rate guard.
    if (guided) {
      const finalRate = Number(v.finalOffer) || Number(v.brokerOffer) || 0;
      const miles = (Number(v.loadedMiles) || 0) + (Number(v.deadheadMiles) || 0);
      const minRpm = Number(v.minRpm) || 0;
      const rpm = miles > 0 ? finalRate / miles : 0;
      const belowMin = minRpm > 0 && rpm > 0 && rpm < minRpm;
      const msg = 'RateCon check before you send this load:\n\n'
        + '• Does the rate match what you agreed with the broker?\n'
        + '• Are the pickup & delivery times correct?\n'
        + '• Hidden fees / lumper / detention accounted for?\n'
        + `• $${finalRate.toLocaleString()} = $${rpm.toFixed(2)}/mi vs carrier min $${minRpm.toFixed(2)}/mi` + (belowMin ? '  ⚠️ BELOW MINIMUM' : '  ✓')
        + '\n\nSend this load to the carrier?';
      if (!window.confirm(msg)) return;
    }
    setAssigning(true);
    try {
      const loadId = 'FM-' + Math.floor(1000 + Math.random() * 9000);
      await addDoc(collection(db, 'loads'), {
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
      });
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
            <div><label className="block text-xs text-slate-400 mb-1">Current Market Rate ($/mi)</label><input className={field} type="number" inputMode="decimal" value={v.marketRpm} onChange={set('marketRpm')} placeholder="2.45" /><p className="text-[10px] text-slate-500 mt-1">Manual now — live market data later.</p></div>
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
function CarriersView() {
  const [list, setList] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const blank = {
    name: '', mcNumber: '', driverName: '', phone: '', homeBase: '', trailerType: '',
    mpg: '', maxCapacity: '', minRpm: '', preferredLanes: '', noGo: '', multiStop: '',
    linkedDriverUid: '', currentDriveHours: '', feePct: '10', vipConcierge: false, availability: 'Available',
  };
  const [form, setForm] = useState(blank);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
        getDocs(collection(db, 'carriers')),
        getDocs(collection(db, 'users')),
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

  const loadPacket = async () => {
    setImportMsg('');
    if (!CARRIER_PACKET_API_URL) { setImportMsg('Add CARRIER_PACKET_API_URL in the code.'); return; }
    setImporting(true);
    try {
      const data = await jsonpFetch(CARRIER_PACKET_API_URL);
      const arr = Array.isArray(data) ? data : [];
      setPacket(arr);
      setImportMsg(arr.length ? `Loaded ${arr.length} submission(s) — pick one below.` : 'No carrier packet submissions yet.');
    } catch (e) {
      console.error('Packet load failed:', e);
      setImportMsg('Could not load packets (possible CORS block). ' + (e.message || ''));
    } finally {
      setImporting(false);
    }
  };

  const applyPacket = (i) => {
    const p = packet[i];
    if (!p) return;
    setForm((f) => ({
      ...f,
      name: p.name || f.name,
      mcNumber: p.mcNumber || f.mcNumber,
      driverName: p.driverName || f.driverName,
      phone: p.phone || f.phone,
      homeBase: p.homeBase || f.homeBase,
      trailerType: p.trailerType || f.trailerType,
      maxCapacity: p.maxCapacity ? String(p.maxCapacity) : f.maxCapacity,
      minRpm: p.minRpm ? String(p.minRpm) : f.minRpm,
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
    try {
      await addDoc(collection(db, 'carriers'), {
        name: form.name.trim(),
        mcNumber: form.mcNumber.trim(),
        driverName: form.driverName.trim(),
        phone: form.phone.trim(),
        homeBase: form.homeBase.trim(),
        trailerType: form.trailerType.trim(),
        mpg: Number(form.mpg) || 0,
        maxCapacity: Number(form.maxCapacity) || 0,
        minRpm: Number(form.minRpm) || 0,
        preferredLanes: form.preferredLanes.trim(),
        noGo: form.noGo.trim(),
        multiStop: form.multiStop.trim(),
        linkedDriverUid: form.linkedDriverUid,
        currentDriveHours: Number(form.currentDriveHours) || 0,
        feePct: Number(form.feePct) || DEFAULT_FEE_PCT,
        vipConcierge: !!form.vipConcierge,
        availability: form.availability || 'Available',
        verification: verify,
        verified: allVerified,
        createdAt: serverTimestamp(),
      });
      // Mirror the VIP flag onto the linked driver's user doc so their portal reflects it.
      if (form.linkedDriverUid) {
        try { await setDoc(doc(db, 'users', form.linkedDriverUid), { vipConcierge: !!form.vipConcierge }, { merge: true }); } catch (_) {}
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
      <p className="text-slate-400">Save each carrier once. Pick them in the Rate Calculator to auto-fill specs and one-click assign loads.</p>

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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-xs text-slate-400 mb-1">Carrier / Business Name</label><input className={field} value={form.name} onChange={set('name')} placeholder="Bell Trucking LLC" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">MC Number</label><input className={field} value={form.mcNumber} onChange={set('mcNumber')} placeholder="MC-123456" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Driver Name</label><input className={field} value={form.driverName} onChange={set('driverName')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Driver Cell Phone</label><input className={field} value={form.phone} onChange={set('phone')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Home Base (City, State)</label><input className={field} value={form.homeBase} onChange={set('homeBase')} /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Trailer Type</label><input className={field} value={form.trailerType} onChange={set('trailerType')} placeholder="Dry Van / Reefer / Flatbed" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Truck Avg MPG</label><input className={field} type="number" inputMode="decimal" value={form.mpg} onChange={set('mpg')} placeholder="6.5" /></div>
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
          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Linked Driver Login (for assigning loads)</label>
            <select className={field} value={form.linkedDriverUid} onChange={set('linkedDriverUid')}>
              <option value="">— none —</option>
              {drivers.map((d) => <option key={d.uid} value={d.uid}>{d.email}</option>)}
            </select>
          </div>
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
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold mb-4">Saved Carriers</h3>
        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-slate-500 text-sm">No carriers saved yet.</div>
        ) : (
          <div className="space-y-2">
            {list.map((c) => (
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
        )}
      </Card>
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
      const snap = await getDocs(collection(db, 'lane_intel'));
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
      await addDoc(collection(db, 'lane_intel'), {
        location: form.location.trim(),
        category: form.category,
        note: form.note.trim(),
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });
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
];

function TrainingView() {
  const [tab, setTab] = useState('guided');
  const TABS = [
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

      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-sm px-4 py-2 rounded-full border transition-colors ${tab === k ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

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
        getDocs(collection(db, 'expenses')),
        getDocs(collection(db, 'loads')),
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
      const ref = await addDoc(collection(db, 'expenses'), payload);
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

// Standard surface card used across the app.
function Card({ children, className = '', ...rest }) {
  return (
    <div className={`bg-slate-900/70 border border-slate-800 rounded-2xl shadow-lg shadow-black/20 ${className}`} {...rest}>
      {children}
    </div>
  );
}

// Panel/section header: optional icon + accent, inline badge, right-aligned action.
function PanelHeader({ icon, title, accent = 'amber', badge, action, className = '' }) {
  const accentCls = { amber: 'text-amber-500', blue: 'text-blue-400', emerald: 'text-emerald-400', slate: 'text-slate-400' }[accent] || 'text-amber-500';
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 min-w-0">
        {icon && <span className={`${accentCls} shrink-0`}>{icon}</span>}
        <span className="truncate">{title}</span>
        {badge}
      </h3>
      {action}
    </div>
  );
}

// Compact stat tile — label over a bold value, optional accent color.
function StatTile({ label, value, accent = 'white', className = '' }) {
  const v = { white: 'text-white', emerald: 'text-emerald-400', amber: 'text-amber-400', blue: 'text-blue-400', red: 'text-red-400', slate: 'text-slate-300' }[accent] || 'text-white';
  return (
    <div className={`bg-slate-800/50 border border-slate-700 rounded-xl p-4 ${className}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${v}`}>{value}</div>
    </div>
  );
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








