import React, { useState, useEffect } from 'react';
import {
  Map, FileText, Wallet, HeartPulse, Dog, LayoutDashboard, Bell, Settings,
  Upload, CheckCircle2, Navigation, Activity, ShieldCheck, CreditCard, Building,
  MapPin, User, Calendar, Wrench, Plus
} from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, doc, getDoc, getDocs, collection, setDoc, addDoc,
  query, where, serverTimestamp, updateDoc, deleteDoc
} from 'firebase/firestore';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword
} from 'firebase/auth';

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
const googleProvider = new GoogleAuthProvider();

// --- Google Maps (client-side distance lookup) ---
// Paste your referrer-restricted Maps JavaScript API key between the quotes.
const GOOGLE_MAPS_API_KEY = '';

let mapsLoaderPromise = null;
function loadGoogleMaps() {
  if (typeof window !== 'undefined' && window.google && window.google.maps) return Promise.resolve();
  if (mapsLoaderPromise) return mapsLoaderPromise;
  mapsLoaderPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
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
    const svc = new window.google.maps.DistanceMatrixService();
    svc.getDistanceMatrix({
      origins: [originZip + ', USA'],
      destinations: [destZip + ', USA'],
      travelMode: window.google.maps.TravelMode.DRIVING,
      unitSystem: window.google.maps.UnitSystem.IMPERIAL,
    }, (res, status) => {
      if (status !== 'OK') return reject(new Error(status));
      const el = res.rows && res.rows[0] && res.rows[0].elements && res.rows[0].elements[0];
      if (!el || el.status !== 'OK') return reject(new Error(el ? el.status : 'NO_RESULT'));
      resolve(el.distance.value / 1609.344);
    });
  });
}
// Creates a driver's auth account WITHOUT signing the admin out,
// by using a throwaway secondary Firebase app instance.
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
// Anyone whose login email is in this list sees the Admin tools.
const ADMIN_EMAILS = [
  'prince.younger3@gmail.com',
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [paymentMethod, setPaymentMethod] = useState('factoring');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [needsPwChange, setNeedsPwChange] = useState(false);

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
          // Not invited — kick them back out.
          await signOut(auth);
          setUser(null);
          setAccessDenied(true);
          setAuthLoading(false);
          return;
        }

        // Approved: record the login and let them in.
        await setDoc(
          doc(db, 'users', u.uid),
          { email: u.email, approved: true, lastLogin: serverTimestamp() },
          { merge: true }
        );
        setNeedsPwChange(!admin && data && data.mustChangePassword === true);
        setUser(u);
        setAccessDenied(false);
      } catch (e) {
        console.error('access check failed', e);
        setUser(u); // fail open so a glitch doesn't lock you out; rules will enforce
      } finally {
        setAuthLoading(false);
      }
    });
  }, []);

  const isAdmin = !!user && isAdminEmail(user.email);

  const go = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView />;
      case 'newauthority': return <NewAuthorityView />;
      case 'profile': return <ProfileView />;
      case 'schedule': return <ScheduleView />;
      case 'lanes': return <LaneManagementView />;
      case 'parking': return <SafeParkingView />;
      case 'compliance': return <ComplianceView />;
      case 'vault': return <DigitalVaultView />;
      case 'financials': return <FinancialsView paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />;
      case 'wellness': return <WellnessView />;
      case 'pets': return <PetLogisticsView />;
      case 'assign': return isAdmin ? <AssignLoadView /> : <DashboardView />;
      case 'allloads': return isAdmin ? <AllLoadsView /> : <DashboardView />;
      case 'drivers': return isAdmin ? <ManageDriversView /> : <DashboardView />;
      case 'fleet': return isAdmin ? <FleetView /> : <DashboardView />;
      case 'carriers': return isAdmin ? <CarriersView /> : <DashboardView />;
      case 'laneintel': return isAdmin ? <LaneIntelView /> : <DashboardView />;
      case 'calc': return isAdmin ? <NegotiationCalcView /> : <DashboardView />;
      default: return <DashboardView />;
    }
  };

  if (authLoading) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 font-sans">Loading…</div>;
  }
  if (!user) {
    return <LoginView accessDenied={accessDenied} />;
  }
  if (needsPwChange) {
    return <ChangePasswordView onDone={() => setNeedsPwChange(false)} />;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transform transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="p-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-wider text-white">FORWARD MOTION</h1>
            <p className="text-xs text-amber-500 tracking-widest font-semibold mt-1">VIP FREIGHT</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-white text-3xl leading-none -mt-1"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {isAdmin && (
            <>
              <div className="px-4 mb-2 text-xs font-semibold text-amber-500 tracking-wider">ADMIN</div>
              <NavItem icon={<Plus size={18} />} label="Assign Load" isActive={activeTab === 'assign'} onClick={() => go('assign')} />
              <NavItem icon={<Navigation size={18} />} label="All Loads" isActive={activeTab === 'allloads'} onClick={() => go('allloads')} />
              <NavItem icon={<User size={18} />} label="Manage Drivers" isActive={activeTab === 'drivers'} onClick={() => go('drivers')} />
              <NavItem icon={<Activity size={18} />} label="Fleet (ELD)" isActive={activeTab === 'fleet'} onClick={() => go('fleet')} />
              <NavItem icon={<Building size={18} />} label="Carriers" isActive={activeTab === 'carriers'} onClick={() => go('carriers')} />
              <NavItem icon={<Map size={18} />} label="Lane Intel" isActive={activeTab === 'laneintel'} onClick={() => go('laneintel')} />
              <NavItem icon={<Wallet size={18} />} label="Rate Calculator" isActive={activeTab === 'calc'} onClick={() => go('calc')} />
              <div className="mt-6" />
            </>
          )}

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

          <div className="px-4 mt-6 mb-2 text-xs font-semibold text-amber-500/80 tracking-wider">VIP CONCIERGE</div>
          <NavItem icon={<HeartPulse size={18} />} label="Wellness & Diet" isActive={activeTab === 'wellness'} onClick={() => go('wellness')} />
          <NavItem icon={<Dog size={18} />} label="Pet Logistics" isActive={activeTab === 'pets'} onClick={() => go('pets')} />
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
            <a href="https://forwardmotionfreight.com" target="_blank" rel="noopener noreferrer"
              className="text-sm flex items-center gap-1.5 hover:text-white transition-colors">
              ← <span className="hidden sm:inline">Back to Website</span>
            </a>
            <button className="hover:text-white transition-colors"><Bell size={20} /></button>
            <button className="hover:text-white transition-colors"><Settings size={20} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

// ---------- DASHBOARD ----------
function DashboardView() {
  const u = auth.currentUser;
  const [earnings, setEarnings] = useState(0);
  const [active, setActive] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const prettyName = (handle) =>
    handle.replace(/[0-9]/g, '')
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  const name = u?.displayName || (u?.email ? prettyName(u.email.split('@')[0]) : 'Driver');

  // Monday 00:00 of the current week
  const startOfWeek = () => {
    const d = new Date();
    const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', u.uid)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Active load = first non-delivered load by delivery date
        const pending = rows
          .filter((l) => l.status !== 'Delivered' && l.status !== 'Cleared')
          .sort((a, b) => (a.delivery_date || '').localeCompare(b.delivery_date || ''));
        setActive(pending[0] || null);

        // Earnings = loads delivered/cleared this week
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
    };
    if (u) fetchData();
  }, [u]);

  const money = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const statusBadge = (s) => {
    if (s === 'In Transit') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (s === 'Delivered' || s === 'Cleared') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700/50 shadow-xl flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Safe travels, {name}.</h2>
          <p className="text-slate-400">Your next mandatory rest stop is in 3 hours. We've got everything handled.</p>
        </div>
        <div className="md:text-right">
          <div className="text-sm text-slate-400 mb-1">Gross Earnings (This Week)</div>
          <div className="text-3xl font-bold text-emerald-400">{money(earnings)}</div>
        </div>
      </div>
      <QuoteOfTheDay />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Map className="text-blue-400" size={20} /> Active Load</h3>
            {active && (
              <span className={`text-xs px-3 py-1 rounded-full border ${statusBadge(active.status)}`}>{active.status}</span>
            )}
          </div>

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
        </div>

        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-6"><HeartPulse className="text-amber-500" size={20} /> VIP Concierge Updates</h3>
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
        </div>
      </div>
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start gap-4">
      <div className="text-amber-500 text-4xl leading-none font-serif select-none mt-[-4px]">&ldquo;</div>
      <div>
        <p className="text-slate-200 text-sm sm:text-base italic leading-relaxed">{q.text}</p>
        <p className="text-amber-500/80 text-xs font-semibold mt-2 tracking-wide">— {q.author}</p>
        <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-1">Quote of the Day</p>
      </div>
    </div>
  );
}
// ---------- PROFILE ----------
function ProfileView() {
  const u = auth.currentUser;
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">My Profile</h2>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-2xl font-bold uppercase">
            {u?.email ? u.email[0] : 'D'}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold truncate">{u?.email || 'Driver'}</div>
            <div className="text-sm text-emerald-400">● Active</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Info label="Email" value={u?.email || '—'} />
          <Info label="Account ID" value={u?.uid ? u.uid.slice(0, 10) + '…' : '—'} />
          <Info label="Role" value="Carrier / Driver" />
          <Info label="Member Since" value={u?.metadata?.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString() : '—'} />
        </div>
      </div>
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
const SAMPLE_EVENTS = [
  { id: 'm1', type: 'Maintenance', title: 'Oil change & DOT inspection', date: '2026-06-26' },
  { id: 'm2', type: 'Maintenance', title: 'Tire rotation', date: '2026-06-30' },
];

function ScheduleView() {
  const [events, setEvents] = useState(SAMPLE_EVENTS);
  const [loadEvents, setLoadEvents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'Maintenance', date: '' });

  useEffect(() => {
    const fetchLoads = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', auth.currentUser.uid)));
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
  }, []);

  const all = [...events, ...loadEvents];
  const groups = {};
  all.forEach((e) => {
    const key = e.date || 'Unscheduled';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  const dateKeys = Object.keys(groups).sort();

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.title || !form.date) return;
    setEvents([{ id: 'e' + Date.now(), ...form }, ...events]);
    setForm({ title: '', type: 'Maintenance', date: '' });
    setShowForm(false);
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
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors shrink-0"
        >
          <Plus size={18} /> Add Event
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold">New Event</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 md:col-span-2"
              placeholder="Event title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
              value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option>Maintenance</option>
              <option>Load</option>
              <option>Other</option>
            </select>
            <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 md:col-span-3"
              type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="submit" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors">Add to Calendar</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
            <span className="text-xs text-slate-500">Demo — added events reset on refresh.</span>
          </div>
        </form>
      )}

      {dateKeys.length === 0 ? (
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
function LaneManagementView() {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const STATUS_FLOW = ['Dispatched', 'Arrived at Shipper', 'Loaded', 'In Transit', 'Delivered'];

  const fetchLoads = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', auth.currentUser.uid)));
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400">
          No active load right now. Your dispatcher will assign one shortly.
        </div>
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-amber-500 font-bold">{active.loadId}</span>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">Active Load</span>
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
      </div>

      {/* Route Map placeholder */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
      </div>
    </div>
  );
}

// ---------- SAFE PARKING ----------
function SafeParkingView() {
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    fetchSpots();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold mb-2">Trusted Safe Parking</h2>
      <p className="text-slate-400 mb-6">Pre-verified, high-security stops for your route.</p>

      {loading && <div className="text-slate-400">Loading parking spots…</div>}
      {!loading && spots.length === 0 && <div className="text-slate-400">No parking spots available yet.</div>}

      {spots.map((spot) => (
        <div key={spot.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="flex gap-4 items-center">
            <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-xl"><MapPin size={24} /></div>
            <div>
              <h3 className="text-xl font-bold text-white">{spot.name}</h3>
              <p className="text-slate-400 text-sm">{spot.highway_exit} • {spot.state}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {spot.security_level && <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">{spot.security_level} Security</span>}
                {spot.has_showers && <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">Showers</span>}
              </div>
            </div>
          </div>
          <button className="bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-lg shrink-0">Reserve Spot</button>
        </div>
      ))}
    </div>
  );
}

// ---------- COMPLIANCE ----------
function ComplianceView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompliance = async () => {
      try {
        const snap = await getDoc(doc(db, 'compliance', auth.currentUser.uid));
        if (snap.exists()) setData(snap.data());
      } catch (err) {
        console.error('Error loading compliance:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCompliance();
  }, []);

  const formatDate = (str) =>
    str ? new Date(str + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const isValid = (str) => str && new Date(str + 'T00:00:00') > new Date();

  if (loading) return <div className="max-w-4xl mx-auto text-slate-400">Loading compliance data…</div>;
  if (!data) return <div className="max-w-4xl mx-auto text-slate-400">No compliance record found yet.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold mb-2">Compliance Dashboard</h2>
      <p className="text-slate-400 mb-6">Stay ahead of expiration dates and keep your status green.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="text-slate-400 mb-2">CDL Expiration</div>
          <div className="text-2xl font-bold text-white">{formatDate(data.cdl_expiration_date)}</div>
          <div className={`text-sm mt-2 ${isValid(data.cdl_expiration_date) ? 'text-emerald-400' : 'text-red-400'}`}>
            {isValid(data.cdl_expiration_date) ? 'Valid' : 'Expired'}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="text-slate-400 mb-2">Medical Card</div>
          <div className="text-2xl font-bold text-white">{formatDate(data.medical_card_expiration)}</div>
          <div className={`text-sm mt-2 ${isValid(data.medical_card_expiration) ? 'text-emerald-400' : 'text-red-400'}`}>
            {isValid(data.medical_card_expiration) ? 'Valid' : 'Expired'}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="text-slate-400 mb-2">Insurance Status</div>
          <div className="text-2xl font-bold text-white">{data.insurance_status}</div>
          <div className="text-emerald-400 text-sm mt-2">On file</div>
        </div>
      </div>
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
        <button onClick={() => setShowForm((s) => !s)}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors shrink-0">
          <Upload size={18} /> Upload
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleUpload} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold">New Document</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-2">File</label>
              <input type="file" onChange={handleFile}
                className="block w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200 file:cursor-pointer hover:file:bg-slate-700" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-2">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
                {VAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-2">Load ID</label>
              <input type="text" value={loadId} onChange={(e) => setLoadId(e.target.value)} placeholder="e.g. FM-8831"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="submit" className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors">Add to Vault</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm">Cancel</button>
            <span className="text-xs text-slate-500">Demo — the file isn't stored yet; this adds the record only.</span>
          </div>
        </form>
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
            <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start gap-4">
              <div className="p-3 bg-slate-800 text-amber-500 rounded-xl shrink-0"><FileText size={22} /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white truncate">{d.name}</div>
                <div className="text-xs text-slate-400 mt-1">Load {d.loadId} • {d.date}</div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">{d.category}</span>
                  <span className={`text-xs px-2 py-1 rounded ${statusStyle(d.status)}`}>{d.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- FINANCIALS ----------
function FinancialsView({ paymentMethod, setPaymentMethod }) {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLoads = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'loads'), where('uid', '==', auth.currentUser.uid)));
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
  const FEE_RATE = 0.10;
  const settled = loads.filter((l) => l.status === 'Delivered' || l.status === 'Cleared');
  const totalGross = settled.reduce((s, l) => s + (Number(l.gross_pay) || 0), 0);
  const totalFee = totalGross * FEE_RATE;
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-500 mb-1">Gross Earned (Delivered)</div>
          <div className="text-2xl font-bold text-white">{money(totalGross)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-500 mb-1">Dispatch Fees (10%)</div>
          <div className="text-2xl font-bold text-amber-400">{money(totalFee)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-500 mb-1">Your Net Payout (90%)</div>
          <div className="text-2xl font-bold text-emerald-400">{money(totalNet)}</div>
        </div>
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 overflow-x-auto">
        <h3 className="text-lg font-bold mb-4">Settlements Ledger</h3>
        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : loads.length === 0 ? (
          <div className="text-slate-500 text-sm py-6 text-center">No loads yet. Settlements appear here once your dispatcher assigns and delivers loads.</div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-sm">
                <th className="pb-3 font-medium">Load</th>
                <th className="pb-3 font-medium">Delivery</th>
                <th className="pb-3 font-medium">Gross</th>
                <th className="pb-3 font-medium">Fee (10%)</th>
                <th className="pb-3 font-medium">Your Net</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loads.map((l) => {
                const gross = Number(l.gross_pay) || 0;
                const fee = gross * FEE_RATE;
                return (
                  <tr key={l.id} className="border-b border-slate-800/50">
                    <td className="py-4 font-mono text-amber-500">{l.loadId || '—'}</td>
                    <td className="py-4 text-slate-400">{fmtDate(l.delivery_date)}</td>
                    <td className="py-4 font-semibold text-white">{money(gross)}</td>
                    <td className="py-4 text-slate-400">{money(fee)}</td>
                    <td className="py-4 font-semibold text-emerald-400">{money(gross - fee)}</td>
                    <td className="py-4"><span className={`px-2 py-1 rounded text-xs ${statusStyle(l.status)}`}>{l.status || '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
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
          <h2 className="text-2xl font-bold mb-2">Pet Logistics Dashboard</h2>
          <p className="text-slate-400">Managing Lady's road life so you don't have to worry.</p>
        </div>
        <button className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors shrink-0">
          <ShieldCheck size={18} /> Emergency Vet Connect
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-slate-800 rounded-full border-4 border-amber-500/30 flex items-center justify-center mb-4">
            <Dog size={48} className="text-amber-500/80" />
          </div>
          <h3 className="text-xl font-bold">Lady</h3>
          <p className="text-sm text-slate-400 mb-4">Golden Retriever • 4 yrs</p>
          <div className="w-full bg-slate-800 rounded-lg p-3 text-left space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Vaccines</span><span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={14} /> Up to date</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Diet</span><span className="text-slate-200">Fresh Sub</span></div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
          </div>
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

  const field = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Assign a Load</h2>
        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold tracking-wide">ADMIN</span>
      </div>
      <p className="text-slate-400">Create a load and assign it to a driver — it appears instantly in their Lane Management & Schedule.</p>

      {loading ? (
        <div className="text-slate-400">Loading drivers…</div>
      ) : (
        <form onSubmit={submit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-xs text-slate-400 mb-2">Driver</label>
            <select className={field} value={form.driverUid} onChange={(e) => set('driverUid', e.target.value)} required>
              <option value="">Select a driver…</option>
              {drivers.map((d) => <option key={d.uid} value={d.uid}>{d.email || d.uid}</option>)}
            </select>
            {drivers.length === 0 && <p className="text-xs text-amber-400 mt-2">No drivers yet — a driver has to log in once before they show up here.</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-2">Load ID</label><input className={field} value={form.loadId} onChange={(e) => set('loadId', e.target.value)} /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Gross Pay ($)</label><input className={field} type="number" value={form.gross_pay} onChange={(e) => set('gross_pay', e.target.value)} placeholder="2450" /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Origin (Pickup)</label><input className={field} value={form.origin} onChange={(e) => set('origin', e.target.value)} placeholder="Atlanta, GA" required /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Destination (Delivery)</label><input className={field} value={form.destination} onChange={(e) => set('destination', e.target.value)} placeholder="Dallas, TX" required /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Commodity</label><input className={field} value={form.commodity} onChange={(e) => set('commodity', e.target.value)} placeholder="Dry goods" /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Weight</label><input className={field} value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="42,000 lbs" /></div>
            <div><label className="block text-xs text-slate-400 mb-2">PO Number</label><input className={field} value={form.po_number} onChange={(e) => set('po_number', e.target.value)} /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Pickup Number</label><input className={field} value={form.pickup_number} onChange={(e) => set('pickup_number', e.target.value)} /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Pickup Time</label><input className={field} value={form.pickup_time} onChange={(e) => set('pickup_time', e.target.value)} placeholder="Oct 24, 8:00 AM" /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Delivery Time</label><input className={field} value={form.delivery_time} onChange={(e) => set('delivery_time', e.target.value)} placeholder="Oct 25, 4:00 PM" /></div>
            <div><label className="block text-xs text-slate-400 mb-2">Delivery Date</label><input className={field} type="date" value={form.delivery_date} onChange={(e) => set('delivery_date', e.target.value)} /></div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
              {saving ? 'Assigning…' : 'Assign Load'}
            </button>
            {done && <span className="text-sm text-emerald-400">{done}</span>}
          </div>
        </form>
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
      status: l.status || 'Dispatched',
    });
  };

  const closeEdit = () => { setEditing(null); setForm(null); };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, uid: form.driverUid, gross_pay: Number(form.gross_pay) || 0 };
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

  const field = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';

  if (loading) return <div className="text-slate-400">Loading all loads…</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">All Loads</h2>
          <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold tracking-wide">ADMIN</span>
        </div>
        <button onClick={fetchAll} className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg transition-colors">Refresh</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">Total Loads</div><div className="text-xl font-bold">{filtered.length}</div></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">In Transit</div><div className="text-xl font-bold text-blue-400">{filtered.filter((l) => l.status === 'In Transit').length}</div></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">Delivered</div><div className="text-xl font-bold text-emerald-400">{filtered.filter((l) => l.status === 'Delivered').length}</div></div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4"><div className="text-xs text-slate-500">Gross (shown)</div><div className="text-xl font-bold text-emerald-400">{money(totalGross)}</div></div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
          <option value="All">All drivers</option>
          {driverEmails.map((em) => <option key={em} value={em}>{em}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
          <option value="All">All statuses</option>
          {STATUS_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400">No loads match these filters.</div>
      ) : (
        <>
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="p-4 font-medium">Load</th>
                  <th className="p-4 font-medium">Driver</th>
                  <th className="p-4 font-medium">Route</th>
                  <th className="p-4 font-medium">Delivery</th>
                  <th className="p-4 font-medium">Gross</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b border-slate-800/50 last:border-0">
                    <td className="p-4 font-mono text-amber-500 font-semibold">{l.loadId || '—'}</td>
                    <td className="p-4 text-slate-300">{users[l.uid] || <span className="text-slate-500">unknown</span>}</td>
                    <td className="p-4 text-slate-300">{l.origin || '—'} <span className="text-slate-600">→</span> {l.destination || '—'}</td>
                    <td className="p-4 text-slate-400">{l.delivery_date || '—'}</td>
                    <td className="p-4 font-semibold text-white">{money(l.gross_pay)}</td>
                    <td className="p-4"><StatusSelect l={l} /></td>
                    <td className="p-4">
                      <button onClick={() => openEdit(l)} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg transition-colors">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filtered.map((l) => (
              <div key={l.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-amber-500 font-semibold text-sm">{l.loadId || '—'}</span>
                  <span className="font-semibold text-white text-sm">{money(l.gross_pay)}</span>
                </div>
                <div className="text-sm text-slate-300">{l.origin || '—'} → {l.destination || '—'}</div>
                <div className="text-xs text-slate-400">Driver: {users[l.uid] || 'unknown'}</div>
                <div className="text-xs text-slate-400">Delivery: {l.delivery_date || '—'}</div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1"><StatusSelect l={l} full /></div>
                  <button onClick={() => openEdit(l)} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg transition-colors shrink-0">Edit</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit modal */}
      {editing && form && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={closeEdit}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
            className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 my-8 space-y-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Edit Load <span className="font-mono text-amber-500">{form.loadId}</span></h3>
              <button type="button" onClick={closeEdit} className="text-slate-400 hover:text-white text-2xl leading-none">×</button>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Driver</label>
              <select className={field} value={form.driverUid} onChange={(e) => setField('driverUid', e.target.value)} required>
                <option value="">Select a driver…</option>
                {userList.map((d) => <option key={d.uid} value={d.uid}>{d.email}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-slate-400 mb-2">Load ID</label><input className={field} value={form.loadId} onChange={(e) => setField('loadId', e.target.value)} /></div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Status</label>
                <select className={field} value={form.status} onChange={(e) => setField('status', e.target.value)}>
                  {STATUS_FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="Cleared">Cleared</option>
                </select>
              </div>
              <div><label className="block text-xs text-slate-400 mb-2">Gross Pay ($)</label><input className={field} type="number" value={form.gross_pay} onChange={(e) => setField('gross_pay', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">Delivery Date</label><input className={field} type="date" value={form.delivery_date} onChange={(e) => setField('delivery_date', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">Origin (Pickup)</label><input className={field} value={form.origin} onChange={(e) => setField('origin', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">Destination (Delivery)</label><input className={field} value={form.destination} onChange={(e) => setField('destination', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">Commodity</label><input className={field} value={form.commodity} onChange={(e) => setField('commodity', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">Weight</label><input className={field} value={form.weight} onChange={(e) => setField('weight', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">PO Number</label><input className={field} value={form.po_number} onChange={(e) => setField('po_number', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">Pickup Number</label><input className={field} value={form.pickup_number} onChange={(e) => setField('pickup_number', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">Pickup Time</label><input className={field} value={form.pickup_time} onChange={(e) => setField('pickup_time', e.target.value)} /></div>
              <div><label className="block text-xs text-slate-400 mb-2">Delivery Time</label><input className={field} value={form.delivery_time} onChange={(e) => setField('delivery_time', e.target.value)} /></div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
              <button type="button" onClick={deleteLoad} disabled={saving} className="text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                Delete Load
              </button>
              <div className="flex items-center gap-3">
                <button type="button" onClick={closeEdit} className="text-slate-400 hover:text-white text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
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
  const [busy, setBusy] = useState(false);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100 font-sans p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-wider text-white">FORWARD MOTION</h1>
          <p className="text-xs text-amber-500 tracking-widest font-semibold mt-1">VIP FREIGHT</p>
        </div>

        <h2 className="text-xl font-bold mb-2">Driver Sign In</h2>
        <p className="text-sm text-slate-400 mb-6">Access is invite-only. Use the email and temporary password your dispatcher gave you.</p>

        {accessDenied && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            This account isn't authorized for the portal yet. Contact your dispatcher to get access.
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-amber-500" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-amber-500" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
            {busy ? 'Please wait…' : 'Sign In'}
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
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100 font-sans p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <h2 className="text-xl font-bold mb-2">Set Your Password</h2>
        <p className="text-sm text-slate-400 mb-6">You're using a temporary password. Choose a new one to continue.</p>
        <form onSubmit={submit} className="space-y-4">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-amber-500" />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm new password" required
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-amber-500" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
            {busy ? 'Saving…' : 'Save & Continue'}
          </button>
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
  const field = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Manage Drivers</h2>
        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold tracking-wide">ADMIN</span>
      </div>
      <p className="text-slate-400">Create driver accounts and control who can sign in. Drivers can't self-register.</p>

      <form onSubmit={createDriver} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold">Add a New Driver</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-2">Driver Email</label>
            <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="driver@example.com" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">Temporary Password</label>
            <div className="flex gap-2">
              <input className={field} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" />
              <button type="button" onClick={genPw} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 rounded-lg shrink-0">Generate</button>
            </div>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Driver Account'}
        </button>

        {created && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-sm">
            <div className="font-semibold text-emerald-400 mb-2">✓ Account created — share these with the driver:</div>
            <div className="font-mono text-slate-200">Email: {created.email}</div>
            <div className="font-mono text-slate-200">Temp password: {created.pw}</div>
            <div className="text-xs text-slate-400 mt-2">They'll be asked to set their own password on first login.</div>
          </div>
        )}
      </form>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
      </div>
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
          <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold tracking-wide">DEMO</span>
        </div>
        <div className="flex gap-2">
          <button onClick={loadDemo} disabled={busy}
            className="text-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            {busy ? 'Working…' : 'Load Demo Data'}
          </button>
          <button onClick={clearDemo} disabled={busy}
            className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            Clear
          </button>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- ADMIN: FREIGHT NEGOTIATION CALCULATOR ----------
function NegotiationCalcView() {
  const [v, setV] = useState({
    selectedCarrier: '',
    originZip: '', destZip: '', pickupAt: '', deliveryAt: '',
    brokerOffer: '', loadedMiles: '', deadheadMiles: '', tolls: '',
    mpg: '6.5', fuelPrice: '3.80', weight: '', maxCapacity: '', minRpm: '',
    commodity: 'General Dry Freight',
  });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const n = (x) => parseFloat(x) || 0;

  // Saved carriers — pick one to auto-fill truck specs.
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
      };
    });
  };

  // Delivery window (hours) from pickup & delivery date/times — shared into the HOS validator.
  const windowHours = (() => {
    if (!v.pickupAt || !v.deliveryAt) return 0;
    const diff = (new Date(v.deliveryAt).getTime() - new Date(v.pickupAt).getTime()) / 3600000;
    return diff > 0 ? diff : 0;
  })();

  // Auto-calc loaded miles from the two zip codes via Google Maps.
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsErr, setMapsErr] = useState('');
  const calcMiles = async () => {
    setMapsErr('');
    if (!v.originZip.trim() || !v.destZip.trim()) { setMapsErr('Enter both zip codes first.'); return; }
    if (!GOOGLE_MAPS_API_KEY) { setMapsErr('Add your Google Maps API key in the code (GOOGLE_MAPS_API_KEY).'); return; }
    setMapsLoading(true);
    try {
      const mi = await getDrivingMiles(v.originZip.trim(), v.destZip.trim());
      setV((s) => ({ ...s, loadedMiles: String(Math.round(mi)) }));
    } catch (e) {
      setMapsErr('Could not get distance (' + (e.message || 'error') + '). Check the zips and key restrictions.');
    } finally {
      setMapsLoading(false);
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
  const maxCap = n(v.maxCapacity);
  const weight = n(v.weight);
  const totalMiles = n(v.loadedMiles) + n(v.deadheadMiles);

  const trueRpm = totalMiles > 0 ? brokerOffer / totalMiles : 0;
  const tripCost = (mpg > 0 ? (totalMiles / mpg) * fuelPrice : 0) + tolls + surcharge;
  const targetOffer = minRpm * totalMiles + tolls + surcharge;
  const gap = targetOffer - brokerOffer;
  const weightFactor = maxCap > 0 ? (weight / maxCap) * 100 : 0;

  const ready = brokerOffer > 0 && totalMiles > 0 && minRpm > 0;

  // Traffic-light status
  let status = 'idle';
  if (ready) {
    if (trueRpm >= minRpm && weightFactor < 85) status = 'green';
    else if (trueRpm < minRpm && gap > 0.15 * brokerOffer) status = 'red';
    else status = 'yellow';
  }

  const money = (x) => '$' + (x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rpm = (x) => '$' + (x || 0).toFixed(2);

  const banner = {
    idle: { cls: 'bg-slate-800 border-slate-700 text-slate-300', title: 'Enter load details to analyze', sub: 'Fill in the broker offer, miles, and carrier minimum RPM to see the math.' },
    green: { cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300', title: '🟢 Profitable Load — Proceed', sub: 'The numbers work. Book it — or push for a little extra.' },
    yellow: {
      cls: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
      title: gap > 0 ? `🟡 Counter Offer Required — Ask for ${money(gap)}` : '🟡 Heavy Load — Leverage the Weight',
      sub: gap > 0 ? 'The rate is close. Counter the broker to reach your floor.' : 'Freight is over 85% of capacity. Use the weight to justify a higher rate.',
    },
    red: { cls: 'bg-red-500/15 border-red-500/40 text-red-300', title: '🔴 Unprofitable — Walk Away', sub: `This offer is well below your floor — you'd need ${money(gap)} more. Politely pass.` },
  }[status];

  const field = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';

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
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Rate Calculator</h2>
        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold tracking-wide">ADMIN</span>
      </div>
      <p className="text-slate-400">Punch in the broker's numbers live on the call — see instantly if the load works and exactly what to counter.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — inputs */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold">Load Inputs</h3>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Saved Carrier (auto-fills truck specs)</label>
            <select className={field} value={v.selectedCarrier} onChange={(e) => applyCarrier(e.target.value)}>
              <option value="">Manual entry…</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {carriers.length === 0 && <p className="text-[11px] text-amber-400 mt-1">No saved carriers yet — add them in the Carriers tab.</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs text-slate-400 mb-1">Origin Zip Code</label><input className={field} inputMode="numeric" value={v.originZip} onChange={set('originZip')} placeholder="30301" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Destination Zip Code</label><input className={field} inputMode="numeric" value={v.destZip} onChange={set('destZip')} placeholder="75201" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Pickup Date &amp; Time</label><input className={field} type="datetime-local" value={v.pickupAt} onChange={set('pickupAt')} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Delivery Date &amp; Time</label><input className={field} type="datetime-local" value={v.deliveryAt} onChange={set('deliveryAt')} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Broker Offer ($)</label><input className={field} type="number" inputMode="decimal" value={v.brokerOffer} onChange={set('brokerOffer')} placeholder="2000" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Carrier Minimum RPM ($)</label><input className={field} type="number" inputMode="decimal" value={v.minRpm} onChange={set('minRpm')} placeholder="2.00" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Loaded Miles</label><input className={field} type="number" inputMode="decimal" value={v.loadedMiles} onChange={set('loadedMiles')} placeholder="800" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Deadhead Miles</label><input className={field} type="number" inputMode="decimal" value={v.deadheadMiles} onChange={set('deadheadMiles')} placeholder="50" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Estimated Tolls ($)</label><input className={field} type="number" inputMode="decimal" value={v.tolls} onChange={set('tolls')} placeholder="40" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Truck Avg MPG</label><input className={field} type="number" inputMode="decimal" value={v.mpg} onChange={set('mpg')} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Fuel Price ($/gal)</label><input className={field} type="number" inputMode="decimal" value={v.fuelPrice} onChange={set('fuelPrice')} /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Freight Weight (lbs)</label><input className={field} type="number" inputMode="decimal" value={v.weight} onChange={set('weight')} placeholder="42000" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Carrier Max Capacity (lbs)</label><input className={field} type="number" inputMode="decimal" value={v.maxCapacity} onChange={set('maxCapacity')} placeholder="45000" /></div>
          </div>

          <button type="button" onClick={calcMiles} disabled={mapsLoading}
            className="text-sm bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            {mapsLoading ? 'Calculating…' : '🧭 Auto-Calc Loaded Miles from Zips'}
          </button>
          {mapsErr && <p className="text-[11px] text-red-400">{mapsErr}</p>}

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
        </div>

        {/* RIGHT — smart output */}
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
          <Metric label="Target Offer (Floor)" value={money(targetOffer)}
            guide="Your negotiation floor. Don't accept below this — counter the broker slightly higher than this number." />
          {gap > 0 && (
            <Metric label="The Gap (Counter By)" value={money(gap)} accent="text-amber-400"
              guide="Ask the broker for exactly this much more to make the load viable." />
          )}
          <Metric label="Weight Factor" value={weightFactor.toFixed(0) + '%'}
            accent={weightFactor >= 85 ? 'text-amber-400' : 'text-white'}
            guide="Over 85% means heavy freight that burns more fuel. Use it to justify asking for a higher rate." />
          {surcharge > 0 && (
            <Metric label="Equipment Accessorial" value={money(surcharge)} accent="text-amber-400"
              guide={`Built into Trip Cost and your floor. Required: ${commodityInfo.equip}`} />
          )}
        </div>
      </div>

      <HosValidator totalMiles={totalMiles} windowHours={windowHours} />
    </div>
  );
}

// ---------- ADMIN: TRANSIT & HOS VALIDATOR ----------
function HosValidator({ totalMiles = 0, windowHours = 0 }) {
  const [v, setV] = useState({ driveAvail: '', speed: '55' });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const n = (x) => parseFloat(x) || 0;

  const miles = totalMiles;
  const windowHrs = windowHours;
  const speed = n(v.speed);
  const avail = Math.min(n(v.driveAvail), 11); // FMCSA caps daily driving at 11 hrs

  const requiredDrive = speed > 0 ? miles / speed : 0;

  // After the driver's available hours run out, each new driving window (11 hrs)
  // requires a mandatory 10-hour reset before it.
  let resets = 0;
  let remaining = requiredDrive - avail;
  while (remaining > 0 && resets < 100) { resets += 1; remaining -= 11; }
  const totalTransit = requiredDrive + resets * 10;

  const ready = miles > 0 && windowHrs > 0 && speed > 0 && v.driveAvail !== '';
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

  const field = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';
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
        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold tracking-wide">ADMIN</span>
      </div>
      <p className="text-slate-400 mb-4">Can the driver legally make this delivery window? Get a yes/no in seconds — before you commit to the broker.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — inputs */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
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
            <div><label className="block text-xs text-slate-400 mb-1">Drive Hours Available (max 11)</label><input className={field} type="number" inputMode="decimal" value={v.driveAvail} onChange={set('driveAvail')} placeholder="8" /></div>
            <div><label className="block text-xs text-slate-400 mb-1">Avg Truck Speed (mph)</label><input className={field} type="number" inputMode="decimal" value={v.speed} onChange={set('speed')} /></div>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            Tip: keep avg speed at 50–55 — a truck cruising 65 averages far less once you add fuel stops, scales, and traffic.
          </p>
        </div>

        {/* RIGHT — output */}
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
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
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold mb-4">What we're doing about it — for you</h3>
        <div className="space-y-2">
          {helps.map((h) => (
            <div key={h} className="flex gap-3 items-start text-sm">
              <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
              <span className="text-slate-300">{h}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700/50 rounded-2xl p-6 text-center">
        <p className="text-white font-semibold">Keep the wheels turning. Stay clean, stay consistent, and let the calendar do its work.</p>
        <p className="text-sm text-slate-400 mt-1">Every established carrier on the road today started exactly where you are.</p>
      </div>
    </div>
  );
}

// ---------- ADMIN: CARRIERS ----------
function CarriersView() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', mcNumber: '', mpg: '', maxCapacity: '', minRpm: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fetchCarriers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'carriers'));
      setList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Error loading carriers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCarriers(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'carriers'), {
        name: form.name.trim(),
        mcNumber: form.mcNumber.trim(),
        mpg: Number(form.mpg) || 0,
        maxCapacity: Number(form.maxCapacity) || 0,
        minRpm: Number(form.minRpm) || 0,
        createdAt: serverTimestamp(),
      });
      setForm({ name: '', mcNumber: '', mpg: '', maxCapacity: '', minRpm: '' });
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

  const field = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Carriers</h2>
        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold tracking-wide">ADMIN</span>
      </div>
      <p className="text-slate-400">Save each carrier's truck specs once. Pick them in the Rate Calculator to auto-fill MPG, capacity, and minimum RPM.</p>

      <form onSubmit={add} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold">Add a Carrier</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-xs text-slate-400 mb-1">Carrier Name</label><input className={field} value={form.name} onChange={set('name')} placeholder="Bell Trucking LLC" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">MC Number</label><input className={field} value={form.mcNumber} onChange={set('mcNumber')} placeholder="MC-123456" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Truck Avg MPG</label><input className={field} type="number" inputMode="decimal" value={form.mpg} onChange={set('mpg')} placeholder="6.5" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Max Capacity (lbs)</label><input className={field} type="number" inputMode="decimal" value={form.maxCapacity} onChange={set('maxCapacity')} placeholder="45000" /></div>
          <div><label className="block text-xs text-slate-400 mb-1">Minimum RPM ($)</label><input className={field} type="number" inputMode="decimal" value={form.minRpm} onChange={set('minRpm')} placeholder="2.00" /></div>
        </div>
        <button type="submit" disabled={saving} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Carrier'}
        </button>
      </form>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="font-bold mb-4">Saved Carriers</h3>
        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-slate-500 text-sm">No carriers saved yet.</div>
        ) : (
          <div className="space-y-2">
            {list.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{c.name} {c.mcNumber ? <span className="text-slate-500 font-normal">· {c.mcNumber}</span> : null}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{c.mpg || '—'} mpg · {c.maxCapacity ? Number(c.maxCapacity).toLocaleString() : '—'} lbs · ${Number(c.minRpm || 0).toFixed(2)}/mi min</div>
                </div>
                <button onClick={() => remove(c.id)} className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg shrink-0">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- ADMIN: LANE INTEL ----------
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const INTEL_CATEGORIES = ['Market / Lane', 'Shipper', 'Receiver', 'Route Hazard'];

function LaneIntelView() {
  // --- Transit estimator (pure math, no API needed) ---
  const [t, setT] = useState({ origin: '', dest: '', miles: '', perDay: '500', pickup: '' });
  const setTf = (k) => (e) => setT((s) => ({ ...s, [k]: e.target.value }));
  const num = (x) => parseFloat(x) || 0;
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

  // --- Facility & lane intel notes (Firestore) ---
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

  const field = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold">Lane Intel</h2>
        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold tracking-wide">ADMIN</span>
      </div>
      <p className="text-slate-400">Know the business of the road — transit days and the facility/market intel your team learns one load at a time.</p>

      {/* TRANSIT ESTIMATOR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold">Transit Day Estimator</h3>
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
      </div>

      {/* INTEL NOTES */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="font-bold">Facility & Market Intel</h3>
        <p className="text-xs text-slate-500">Log what your team learns: cold markets, slow shippers, no-parking receivers, rough routes. Searchable for the whole team.</p>

        <form onSubmit={addNote} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <input className={`${field} sm:col-span-3`} value={form.location} onChange={setFf('location')} placeholder="City / facility (e.g. Miami, FL)" />
          <select className={`${field} sm:col-span-3`} value={form.category} onChange={setFf('category')}>
            {INTEL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className={`${field} sm:col-span-4`} value={form.note} onChange={setFf('note')} placeholder="e.g. Cold flatbed market — cover deadhead out" />
          <button type="submit" disabled={saving} className="sm:col-span-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            {saving ? '…' : 'Add'}
          </button>
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
      </div>
    </div>
  );
}

// ---------- NAV ITEM ----------
function NavItem({ icon, label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-6 py-3 transition-all duration-200 border-l-2 ${
        isActive
          ? 'bg-slate-800/50 text-white border-amber-500'
          : 'text-slate-400 border-transparent hover:bg-slate-800/30 hover:text-slate-200'
      }`}
    >
      <span className={isActive ? 'text-amber-500' : 'text-slate-500'}>{icon}</span>
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}
