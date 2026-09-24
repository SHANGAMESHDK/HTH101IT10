import { useState } from 'react';
import { Camera, CreditCard, CarFront, AlertCircle, Zap, ShieldAlert, BadgeCheck } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export default function AdminDashboard() {
  const [logs, setLogs] = useState([
    { id: 1, plate: 'KA-01-HD-4321', type: 'White', category: 'SUV', time: '10:42 AM', status: 'Allocated' },
    { id: 2, plate: 'KA-02-EV-0912', type: 'Green', category: 'Hatchback', time: '10:40 AM', status: 'Charging' },
    { id: 3, plate: 'KA-51-AB-1234', type: 'Yellow', category: 'Sedan', time: '10:35 AM', status: 'Parked' },
  ]);

  const [rfidInput, setRfidInput] = useState('');
  const [amount, setAmount] = useState('');

  const handleRecharge = (e) => {
    e.preventDefault();
    if (!rfidInput || !amount) {
      toast.error('Please enter both RFID and Amount');
      return;
    }
    // Mocking razorpay integration
    toast.success(`Processing ₹${amount} recharge via Razorpay for RFID: ${rfidInput}...`);
    setTimeout(() => {
      toast.success('Recharge successful!');
      setRfidInput('');
      setAmount('');
    }, 1500);
  };

  return (
    <div className="grid gap-4">
      <Toaster position="top-right" />
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Gate Command Center</h1>
          <p>Monitor incoming vehicles, manage RFID, and track anomalies.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="live-indicator"></div>
          <span className="badge badge-success">ESP32 Cam Active</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* ESP32 Camera Feed Mock */}
        <div className="glass-card" style={{ gridColumn: 'span 2' }}>
          <div className="flex items-center gap-2 mb-4">
            <Camera className="text-muted" />
            <h3>Live Camera Feed (ESP32)</h3>
          </div>
          <div 
            style={{ 
              width: '100%', 
              height: '350px', 
              background: 'rgba(0,0,0,0.5)', 
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div className="scan-line" style={{
              position: 'absolute',
              top: 0, left: 0, right: 0,
              height: '2px',
              background: 'var(--primary)',
              boxShadow: '0 0 10px var(--primary)',
              animation: 'scan 2s linear infinite'
            }}></div>
            <CarFront size={64} style={{ color: 'rgba(255,255,255,0.2)', marginBottom: '1rem' }} />
            <p>Waiting for vehicle...</p>
            <style>{`
              @keyframes scan {
                0% { top: 0; }
                50% { top: 100%; }
                100% { top: 0; }
              }
            `}</style>
          </div>
        </div>

        {/* RFID Management */}
        <div className="grid gap-4" style={{ display: 'grid', gridTemplateRows: 'auto 1fr' }}>
          <div className="glass-card">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="text-muted" />
              <h3>RFID Recharge</h3>
            </div>
            <form onSubmit={handleRecharge} className="flex flex-col gap-4">
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>RFID Tag ID</label>
                <input 
                  type="text" 
                  value={rfidInput}
                  onChange={(e) => setRfidInput(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                  placeholder="e.g. 04 A1 B2 C3"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Amount (₹)</label>
                <input 
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                  placeholder="100"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                Recharge via Razorpay
              </button>
            </form>
          </div>

          <div className="glass-card" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert color="var(--danger)" />
              <h3 style={{ color: 'var(--danger)', margin: 0 }}>System Alerts</h3>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <li style={{ fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <AlertCircle size={16} color="var(--warning)" style={{ marginTop: '0.1rem' }} />
                <span>Wrong parking posture detected at Slot P-12.</span>
              </li>
              <li style={{ fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <AlertCircle size={16} color="var(--danger)" style={{ marginTop: '0.1rem' }} />
                <span>Unauthorized vehicle attempted entry. Gate locked.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="glass-card mt-4">
        <h3 className="mb-4">Recent Entries</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Plate No</th>
                <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Plate Color</th>
                <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Detected Category</th>
                <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Entry Time</th>
                <th style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '1rem 0.5rem', fontWeight: '500' }}>{log.plate}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <span className="flex items-center gap-2">
                      <div style={{ 
                        width: '12px', height: '12px', borderRadius: '50%', 
                        background: log.type === 'White' ? '#fff' : log.type === 'Green' ? 'var(--success)' : 'var(--warning)',
                        boxShadow: `0 0 5px ${log.type === 'White' ? '#fff' : log.type === 'Green' ? 'var(--success)' : 'var(--warning)'}`
                      }}></div>
                      {log.type}
                    </span>
                  </td>
                  <td style={{ padding: '1rem 0.5rem' }}>{log.category}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>{log.time}</td>
                  <td style={{ padding: '1rem 0.5rem' }}>
                    <span className={`badge ${log.status === 'Charging' ? 'badge-success' : 'badge-warning'}`}>
                      {log.status === 'Charging' && <Zap size={12} style={{ display: 'inline', marginRight: '4px' }} />}
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
