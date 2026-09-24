import { useState, useEffect } from 'react';
import { Wallet, Clock, MapPin, Zap, Crown, ArrowRight, CarFront } from 'lucide-react';

export default function UserDashboard() {
  const [balance, setBalance] = useState(350);
  const [sessionTime, setSessionTime] = useState(0);
  const [activeSession, setActiveSession] = useState(true);

  // Simulate parking timer
  useEffect(() => {
    let interval;
    if (activeSession) {
      interval = setInterval(() => {
        setSessionTime((prev) => prev + 1);
      }, 1000); // Fast forward for demo
    }
    return () => clearInterval(interval);
  }, [activeSession]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentFare = Math.floor(sessionTime * 0.5); // 0.5 per sec for demo

  const parkingCategories = [
    { name: 'Premium', available: 2, total: 10, icon: <Crown size={20} />, color: 'var(--premium)', gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' },
    { name: 'Sedan', available: 15, total: 20, icon: <MapPin size={20} />, color: 'var(--primary)', gradient: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)' },
    { name: 'SUV', available: 8, total: 20, icon: <MapPin size={20} />, color: 'var(--text-main)', gradient: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)' },
    { name: 'EV / Hatchback', available: 5, total: 15, icon: <Zap size={20} />, color: 'var(--success)', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>User View</h1>
          <p>Find your slot, follow the lights, and track your session.</p>
        </div>
        <div className="glass-card flex items-center gap-4" style={{ padding: '0.75rem 1.5rem', borderRadius: '99px' }}>
          <Wallet color="var(--success)" />
          <div className="flex flex-col">
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Wallet Balance</span>
            <span style={{ fontWeight: '600', fontSize: '1.25rem' }}>₹{balance}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Active Session */}
        <div className="glass-card" style={{ gridColumn: 'span 2', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, padding: '1.5rem' }}>
            <span className="badge badge-success" style={{ animation: 'pulse-ring 2s infinite' }}>Live Session</span>
          </div>
          
          <h3 className="mb-4">Current Parking Status</h3>
          <div className="flex items-center gap-6 mb-6">
            <div className="flex flex-col">
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Allocated Slot</span>
              <span style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary)' }}>S-12</span>
            </div>
            <ArrowRight className="text-muted" />
            <div className="flex flex-col">
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Zone Category</span>
              <span style={{ fontSize: '1.5rem', fontWeight: '600' }}>Sedan</span>
            </div>
          </div>

          <div className="flex gap-4">
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Clock color="var(--accent)" size={32} />
              <div>
                <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Duration</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '600', fontFamily: 'monospace' }}>{formatTime(sessionTime)}</span>
              </div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '0.5rem', borderRadius: '50%' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--danger)' }}>₹</span>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Dynamic Fare</span>
                <span style={{ fontSize: '1.5rem', fontWeight: '600' }}>₹{currentFare.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* LED Routing Guide */}
        <div className="glass-card flex flex-col justify-center items-center text-center" style={{ border: '2px solid var(--primary)', boxShadow: '0 0 20px rgba(139, 92, 246, 0.1)' }}>
          <h3 style={{ marginBottom: '1rem' }}>Follow the Lights</h3>
          <div style={{ 
            width: '100px', height: '100px', borderRadius: '50%', 
            background: 'var(--primary)',
            boxShadow: '0 0 40px var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '1rem',
            animation: 'pulse-ring 1.5s infinite'
          }}>
            <CarFront size={48} color="white" />
          </div>
          <p style={{ fontSize: '0.875rem' }}>Your route is highlighted in <strong>Purple</strong>.</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>ESP32 IR tracking active</p>
        </div>
      </div>

      <h3 className="mt-6 mb-2">Live Availability</h3>
      <div className="grid grid-cols-4 gap-4">
        {parkingCategories.map((cat, i) => (
          <div key={i} className="glass-card" style={{ 
            borderTop: `4px solid ${cat.color}`,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div className="flex justify-between items-start mb-4">
              <div style={{ background: cat.gradient, padding: '0.5rem', borderRadius: '8px', color: 'white' }}>
                {cat.icon}
              </div>
              <span style={{ fontWeight: '600', fontSize: '1.25rem' }}>{cat.available}/{cat.total}</span>
            </div>
            <h4>{cat.name}</h4>
            <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '3px', marginTop: '0.5rem' }}>
              <div style={{ width: `${(cat.available/cat.total)*100}%`, background: cat.color, height: '100%', borderRadius: '3px' }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
