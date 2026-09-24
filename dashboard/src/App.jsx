import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Car, ShieldCheck, LayoutDashboard } from 'lucide-react';
import AdminDashboard from './pages/AdminDashboard';
import UserDashboard from './pages/UserDashboard';
import './index.css';

function Navbar() {
  const location = useLocation();
  
  return (
    <nav className="navbar glass-panel">
      <div className="flex items-center gap-2">
        <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '8px' }}>
          <Car size={24} color="white" />
        </div>
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Smart Reflex Parking</h2>
      </div>
      <div className="nav-links">
        <Link 
          to="/" 
          className={location.pathname === '/' ? 'active' : ''}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <LayoutDashboard size={18} /> User View
        </Link>
        <Link 
          to="/admin" 
          className={location.pathname === '/admin' ? 'active' : ''}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ShieldCheck size={18} /> Admin Console
        </Link>
      </div>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="container" style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<UserDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
