import React, { useState } from 'react';
import {
  Map,
  FileText,
  Wallet,
  HeartPulse,
  Dog,
  LayoutDashboard,
  Bell,
  Settings,
  Upload,
  CheckCircle2,
  Navigation,
  Activity,
  ShieldCheck,
  CreditCard,
  Building
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [paymentMethod, setPaymentMethod] = useState('factoring');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'lanes':
        return <LaneManagementView />;
      case 'vault':
        return <DigitalVaultView />;
      case 'financials':
        return <FinancialsView paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />;
      case 'wellness':
        return <WellnessView />;
      case 'pets':
        return <PetLogisticsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-wider text-white">FORWARD MOTION</h1>
          <p className="text-xs text-amber-500 tracking-widest font-semibold mt-1">VIP FREIGHT</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <div className="px-4 mb-2 text-xs font-semibold text-slate-500 tracking-wider">OVERVIEW</div>
          <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />

          <div className="px-4 mt-6 mb-2 text-xs font-semibold text-slate-500 tracking-wider">LOGISTICS CORE</div>
          <NavItem icon={<Map size={18} />} label="Lane Management" isActive={activeTab === 'lanes'} onClick={() => setActiveTab('lanes')} />
          <NavItem icon={<FileText size={18} />} label="Digital Vault" isActive={activeTab === 'vault'} onClick={() => setActiveTab('vault')} />
          <NavItem icon={<Wallet size={18} />} label="Financial Routing" isActive={activeTab === 'financials'} onClick={() => setActiveTab('financials')} />

          <div className="px-4 mt-6 mb-2 text-xs font-semibold text-amber-500/80 tracking-wider">VIP CONCIERGE</div>
          <NavItem icon={<HeartPulse size={18} />} label="Wellness & Diet" isActive={activeTab === 'wellness'} onClick={() => setActiveTab('wellness')} />
          <NavItem icon={<Dog size={18} />} label="Pet Logistics" isActive={activeTab === 'pets'} onClick={() => setActiveTab('pets')} />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold">JD</div>
            <div>
              <div className="text-sm font-semibold">John Doe</div>
              <div className="text-xs text-emerald-400">● On Route</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-8">
          <h2 className="text-lg font-medium capitalize text-slate-200">
            {activeTab.replace('-', ' ')}
          </h2>
          <div className="flex items-center gap-4 text-slate-400">
            <button className="hover:text-white transition-colors"><Bell size={20} /></button>
            <button className="hover:text-white transition-colors"><Settings size={20} /></button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

// --- SUB-VIEWS ---

function DashboardView() {
  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700/50 shadow-xl flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Safe travels, John.</h2>
          <p className="text-slate-400">Your next mandatory rest stop is in 3 hours. We've got everything handled.</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-400 mb-1">Gross Weekly Earnings</div>
          <div className="text-3xl font-bold text-emerald-400">$8,450.00</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Logistics Snapshot */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Map className="text-blue-400" size={20}/> Active Load</h3>
            <span className="bg-blue-500/20 text-blue-400 text-xs px-3 py-1 rounded-full border border-blue-500/30">In Transit</span>
          </div>
          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-5 h-5 rounded-full border-4 border-slate-900 bg-blue-500 text-slate-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow" />
              <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-slate-700 bg-slate-800">
                <div className="text-xs text-slate-400">Origin</div>
                <div className="font-semibold">Atlanta, GA</div>
              </div>
            </div>
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-5 h-5 rounded-full border-4 border-slate-900 bg-slate-600 text-slate-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow" />
              <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <div className="text-xs text-slate-400">Destination (ETA: 4:00 PM)</div>
                <div className="font-semibold text-slate-300">Dallas, TX</div>
              </div>
            </div>
          </div>
        </div>

        {/* VIP Concierge Snapshot */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-6"><HeartPulse className="text-amber-500" size={20}/> VIP Concierge Updates</h3>

          <div className="space-y-3">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg"><Dog size={20} /></div>
              <div>
                <div className="font-semibold text-sm">Fresh Pet Food Delivery Scheduled</div>
                <div className="text-xs text-slate-400 mt-1">Lady's fresh meals have been successfully rerouted to your Dallas drop-off terminal tomorrow morning.</div>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><Activity size={20} /></div>
              <div>
                <div className="font-semibold text-sm">Gym Access Authorized</div>
                <div className="text-xs text-slate-400 mt-1">Found a rig-friendly parking spot 0.2mi from 'Power House Gym' along your I-20 route. Added to your GPS.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FinancialsView({ paymentMethod, setPaymentMethod }) {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Financial Routing</h2>
        <p className="text-slate-400">Manage how you get paid and how your Forward Motion dispatch fees are settled.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div
          onClick={() => setPaymentMethod('factoring')}
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'factoring' ? 'border-amber-500 bg-amber-500/5' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${paymentMethod === 'factoring' ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-400'}`}>
              <Building size={24} />
            </div>
            {paymentMethod === 'factoring' && <CheckCircle2 className="text-amber-500" size={24} />}
          </div>
          <h3 className="text-xl font-bold mb-2">The Factoring Split</h3>
          <p className="text-sm text-slate-400">Automated, invisible settlement. We submit your BOL to your factoring company with a Notice of Assignment. They send you 90% and us our 10% fee directly.</p>
        </div>

        <div
          onClick={() => setPaymentMethod('ach')}
          className={`p-6 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === 'ach' ? 'border-amber-500 bg-amber-500/5' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${paymentMethod === 'ach' ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-400'}`}>
              <CreditCard size={24} />
            </div>
            {paymentMethod === 'ach' && <CheckCircle2 className="text-amber-500" size={24} />}
          </div>
          <h3 className="text-xl font-bold mb-2">Smart ACH Auto-Pay</h3>
          <p className="text-sm text-slate-400">Keep your freight payouts whole. You get paid 100% directly from the broker. We run a weekly auto-draft for our percentage every Friday.</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold mb-4">Recent Settlements Ledger</h3>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 text-sm">
              <th className="pb-3 font-medium">Load Number</th>
              <th className="pb-3 font-medium">Delivery Date</th>
              <th className="pb-3 font-medium">Gross Pay</th>
              <th className="pb-3 font-medium">Dispatch Fee (10%)</th>
              <th className="pb-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            <tr className="border-b border-slate-800/50">
              <td className="py-4 font-mono text-slate-300">#FM-8829</td>
              <td className="py-4">Oct 24, 2024</td>
              <td className="py-4 font-semibold text-white">$2,450.00</td>
              <td className="py-4 text-slate-400">$245.00</td>
              <td className="py-4"><span className="text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded text-xs">Cleared</span></td>
            </tr>
            <tr className="border-b border-slate-800/50">
              <td className="py-4 font-mono text-slate-300">#FM-8830</td>
              <td className="py-4">Oct 26, 2024</td>
              <td className="py-4 font-semibold text-white">$3,100.00</td>
              <td className="py-4 text-slate-400">$310.00</td>
              <td className="py-4"><span className="text-amber-400 bg-amber-400/10 px-2 py-1 rounded text-xs">Processing Factoring</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PetLogisticsView() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold mb-2">Pet Logistics Dashboard</h2>
          <p className="text-slate-400">Managing Lady's road life so you don't have to worry about a thing.</p>
        </div>
        <button className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors">
          <ShieldCheck size={18} />
          Emergency Vet Connect
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-slate-800 rounded-full border-4 border-amber-500/30 flex items-center justify-center mb-4 overflow-hidden">
             {/* Fallback avatar icon since we don't have images */}
             <Dog size={48} className="text-amber-500/80" />
          </div>
          <h3 className="text-xl font-bold">Lady</h3>
          <p className="text-sm text-slate-400 mb-4">Golden Retriever • 4 yrs</p>
          <div className="w-full bg-slate-800 rounded-lg p-3 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Vaccines</span>
              <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={14}/> Up to date</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Diet</span>
              <span className="text-slate-200">Fresh Sub (Farmer's Dog)</span>
            </div>
          </div>
        </div>

        {/* Nutrition Logistics */}
        <div className="col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Activity className="text-amber-500" size={20}/> Predictive Nutrition Engine</h3>
            <div className="flex items-center gap-6">
              <div className="flex-1 bg-slate-800 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Current Cab Supply</div>
                <div className="text-2xl font-bold">3 Days <span className="text-sm text-slate-500 font-normal">Remaining</span></div>
                <div className="w-full bg-slate-700 h-2 mt-3 rounded-full overflow-hidden">
                  <div className="bg-amber-500 w-1/4 h-full rounded-full"></div>
                </div>
              </div>
              <div className="flex-1 bg-slate-800 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Next Automated Delivery</div>
                <div className="text-lg font-bold text-emerald-400">Oct 28th Intercept</div>
                <div className="text-sm text-slate-300 mt-1 line-clamp-1">Rerouted to Dallas Terminal</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
             <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><Map className="text-blue-500" size={20}/> Upcoming Pet-Friendly Waypoints</h3>
             <div className="space-y-3">
               <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                 <div>
                   <div className="font-semibold text-sm">Buc-ee's Dog Walk Area</div>
                   <div className="text-xs text-slate-400">I-20 East, Exit 45 • 120 miles away</div>
                 </div>
                 <button className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition-colors text-white">Add to GPS</button>
               </div>
               <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                 <div>
                   <div className="font-semibold text-sm">Rest Stop 44 (Fenced Green Space)</div>
                   <div className="text-xs text-slate-400">I-20 East, Exit 88 • 250 miles away</div>
                 </div>
                 <button className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition-colors text-white">Add to GPS</button>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- PLACEHOLDER COMPONENTS FOR REMAINING TABS ---
function WellnessView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500">
      <HeartPulse size={64} className="mb-4 text-slate-700" />
      <h2 className="text-xl font-bold text-slate-300 mb-2">Wellness & Diet Routing Module</h2>
      <p className="max-w-md text-center">Your plant-based diet preferences and functional gym requirements are actively filtering your current route.</p>
    </div>
  );
}

function DigitalVaultView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500">
      <FileText size={64} className="mb-4 text-slate-700" />
      <h2 className="text-xl font-bold text-slate-300 mb-2">The Digital Vault</h2>
      <p className="max-w-md text-center">Drag and drop BOLs, Rate Cons, and receipts here. We instantly process and push them to your factoring company.</p>
      <button className="mt-6 bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg flex items-center gap-2">
        <Upload size={18} /> Upload Document
      </button>
    </div>
  );
}

function LaneManagementView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500">
      <Navigation size={64} className="mb-4 text-slate-700" />
      <h2 className="text-xl font-bold text-slate-300 mb-2">Smart Lane Management</h2>
      <p className="max-w-md text-center">Predictive routing board. We're currently securing high-paying freight for your Dallas drop-off to minimize deadhead.</p>
    </div>
  );
}

// --- UTILITY COMPONENTS ---
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
