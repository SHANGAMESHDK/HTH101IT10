import { useState, useEffect, useRef } from 'react';
import { Camera, CreditCard, CarFront, AlertCircle, Zap, ShieldAlert, BadgeCheck, Usb, RefreshCw, Unplug, Radio, Gauge, Activity, Cpu, Sliders, Lightbulb, Sun, ArrowRight, ArrowLeft, CheckCircle2, HelpCircle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export default function AdminDashboard() {
  const [logs, setLogs] = useState([
    { id: 1, plate: 'KA-01-HD-4321', type: 'White', category: 'SUV', time: '10:42 AM', status: 'Allocated' },
    { id: 2, plate: 'KA-02-EV-0912', type: 'Green', category: 'Hatchback', time: '10:40 AM', status: 'Charging' },
  ]);

  const [wsStatus, setWsStatus] = useState('Disconnected');
  const [serialInfo, setSerialInfo] = useState({ port: 'COM5', connected: true });
  const [availablePorts, setAvailablePorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState('COM5');
  const [isConnectingPort, setIsConnectingPort] = useState(false);

  // Live Hardware Sensor Telemetry
  const [telemetry, setTelemetry] = useState({
    ir: { pin: 21, detected: false, val: 1, lastTrigger: null, activeLow: true },
    us1: { slot: 'P-01', dist: 999, posture: 'EMPTY', trigPin: 13, echoPin: 12 },
    us2: { slot: 'P-02', dist: 999, posture: 'EMPTY', trigPin: 14, echoPin: 27 },
    rfid: { lastUid: null, lastTapTime: null, location: null }
  });

  // LED & Hardware Configuration States
  const [ledBrightness, setLedBrightness] = useState(180);
  const [irActiveLow, setIrActiveLow] = useState(true);
  const [testColor, setTestColor] = useState('#00E5FF');
  const [testTurn, setTestTurn] = useState('RIGHT');
  const [testEnd, setTestEnd] = useState(55);
  const [activeLedMode, setActiveLedMode] = useState('IDLE');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [rfidInput, setRfidInput] = useState('');
  const [amount, setAmount] = useState('');

  // Car Fleet & Allocated Parking ID Registry State
  const [fleetCars, setFleetCars] = useState([]);
  const [modelCatalog, setModelCatalog] = useState([]);
  const [activeRegistryTab, setActiveRegistryTab] = useState('FLEET'); // 'FLEET' or 'CATALOG'
  const [carSearchTerm, setCarSearchTerm] = useState('');

  // Map States
  const [slot1, setSlot1] = useState('AVAILABLE');
  const [slot2, setSlot2] = useState('AVAILABLE');
  const [gateStatus, setGateStatus] = useState('IDLE');
  const [isRouteActive, setIsRouteActive] = useState(false);
  const [currentCategory, setCurrentCategory] = useState('');
  const fileInputRef = useRef(null);

  const fetchCarRegistry = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/cars/registry');
      const data = await res.json();
      if (data.registeredFleet) setFleetCars(data.registeredFleet);
      if (data.modelsCatalog) setModelCatalog(data.modelsCatalog);
    } catch (e) {
      console.warn("Could not fetch car registry:", e);
    }
  };

  // LED Hardware Control Handlers
  const handleSetLedMode = async (mode, customColor = null) => {
    try {
      const color = customColor || testColor;
      const res = await fetch('http://localhost:8080/api/led/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          color,
          brightness: ledBrightness,
          turn: testTurn,
          end: testEnd
        })
      });
      const data = await res.json();
      setActiveLedMode(mode);
      toast.success(`LED Command: ${mode}`);
    } catch (e) {
      toast.error('Failed to dispatch LED command');
    }
  };

  const handleBrightnessChange = async (val) => {
    setLedBrightness(val);
    try {
      await fetch('http://localhost:8080/api/led/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brightness: parseInt(val, 10) })
      });
    } catch (e) {}
  };

  const handleToggleIrPolarity = async () => {
    const nextPolarity = !irActiveLow;
    try {
      const res = await fetch('http://localhost:8080/api/sensor/ir-polarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeLow: nextPolarity })
      });
      const data = await res.json();
      setIrActiveLow(nextPolarity);
      toast.success(`IR Polarity: ${nextPolarity ? 'Active LOW (0=Car)' : 'Active HIGH (1=Car)'}`);
    } catch (e) {
      toast.error('Failed to change IR polarity');
    }
  };

  const handleSimulateCategory = async (category) => {
    const toastId = toast.loading(`Simulating ${category} Vehicle Entry...`);
    try {
      const res = await fetch('http://localhost:8080/api/simulate-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Allocated ${data.result.lotNumber} (${data.result.allocatedSlot}) with color ${data.result.assignedColor}!`, {
          id: toastId,
          icon: '🚗',
          style: { borderLeft: `6px solid ${data.result.assignedColor}`, background: '#1E1B4B', color: '#fff' }
        });
      } else {
        toast.error('Simulation failed', { id: toastId });
      }
    } catch (e) {
      toast.error('Failed to reach backend', { id: toastId });
    }
  };

  const handleSimulateCar = async (car) => {
    const carName = car.vehicleModel || car.model || car.category;
    const toastId = toast.loading(`Routing ${carName} (${car.vehiclePlate || car.parkingId})...`);
    try {
      const res = await fetch('http://localhost:8080/api/simulate-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: car.category })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Allocated ${car.lotNumber || data.result.lotNumber} (${car.parkingId || data.result.allocatedSlot}) with color ${car.assignedColor || data.result.assignedColor}!`, {
          id: toastId,
          icon: '🚗',
          style: { borderLeft: `6px solid ${car.assignedColor || data.result.assignedColor}`, background: '#1E1B4B', color: '#fff' }
        });
      } else {
        toast.error('Simulation failed', { id: toastId });
      }
    } catch (e) {
      toast.error('Failed to reach backend', { id: toastId });
    }
  };

  const fetchAvailablePorts = async () => {
    try {
      const res = await fetch('http://localhost:8080/api/com-ports');
      const data = await res.json();
      if (data.availablePorts && data.availablePorts.length > 0) {
        setAvailablePorts(data.availablePorts);
        if (data.activePort) setSelectedPort(data.activePort);
      }
      if (data.connected !== undefined) {
        setSerialInfo({ port: data.activePort || selectedPort, connected: data.connected });
      }
    } catch (e) {
      console.warn("Could not fetch COM ports:", e);
    }
  };

  const handleConnectCom = async () => {
    setIsConnectingPort(true);
    const toastId = toast.loading(`Connecting to ${selectedPort}...`);
    try {
      const res = await fetch('http://localhost:8080/api/com-ports/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: selectedPort })
      });
      const data = await res.json();
      toast.success(`Connected to ${selectedPort}`, { id: toastId });
      setSerialInfo({ port: selectedPort, connected: true });
    } catch (err) {
      toast.error(`Could not connect to ${selectedPort}`, { id: toastId });
    } finally {
      setIsConnectingPort(false);
    }
  };

  const handleDisconnectCom = async () => {
    const toastId = toast.loading(`Disconnecting ${serialInfo.port}...`);
    try {
      await fetch('http://localhost:8080/api/com-ports/disconnect', { method: 'POST' });
      toast.success(`Port released (Ready for Arduino upload)`, { id: toastId });
      setSerialInfo(prev => ({ ...prev, connected: false }));
    } catch (err) {
      toast.error(`Error disconnecting port`, { id: toastId });
    }
  };

  const processImageBlob = (blob) => {
    const formData = new FormData();
    formData.append('image', blob, 'vehicle.jpg');
    
    const toastId = toast.loading("AI Analyzing vehicle...");
    
    fetch('http://localhost:8080/api/upload-cam', {
      method: 'POST',
      body: formData
    }).then(res => res.json())
      .then(data => {
        toast.success(`Analysis Complete: ${data.model || 'Car'}`, { id: toastId });
      })
      .catch(err => {
        toast.error("Scan failed - Check backend", { id: toastId });
        console.error(err);
      });
  };

  const captureAndUpload = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        toast.error("Webcam not ready. You can use 'Upload Photo' instead!");
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(blob => {
        if (blob) processImageBlob(blob);
      }, 'image/jpeg');
    } else {
      toast.error("Webcam unavailable. Try 'Upload Photo'.");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      processImageBlob(file);
    }
  };

  useEffect(() => {
    fetchAvailablePorts();
    fetchCarRegistry();

    // Start Laptop Webcam
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          console.warn("Webcam not accessible, file upload fallback ready:", err);
        });
    }

    let socket;
    let reconnectTimer;

    const connectWs = () => {
      socket = new WebSocket('ws://localhost:8080');

      socket.onopen = () => {
        setWsStatus('Active');
        toast.success('Connected to Backend System');
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.event === 'INIT_STATE') {
            if (msg.data?.cards) setFleetCars(msg.data.cards);
          }

          if (msg.event === 'CARD_ISSUED') {
            setFleetCars(prev => [msg.data, ...prev]);
          }

          if (msg.event === 'CAR_CLASSIFIED') {
            const { plateColor, model, category, plateNumber, allocatedSlot, assignedColor } = msg.data;
            toast.success(`Vehicle: ${model} (${category}) → Route to ${allocatedSlot || 'Slot'}`, { icon: '🚘' });
            setCurrentCategory(`${category} (${allocatedSlot || 'Slot'})`);
            setIsRouteActive(true);
            setGateStatus(`ACCESS GRANTED → ${allocatedSlot || 'SLOT'}`);

            const newLog = {
              id: `${Date.now()}-${Math.random()}`,
              plate: plateNumber || 'Unknown',
              type: plateColor || 'White',
              category: category || 'Sedan',
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              status: `Allocated: ${allocatedSlot || 'Bay'}`
            };
            setLogs(prev => [newLog, ...prev]);
          }

          if (msg.event === 'SLOT_UPDATE') {
            const slotNum = String(msg.slot);
            const status = msg.status;
            if (slotNum === '1') {
              setSlot1(status);
              toast(status === 'OCCUPIED' ? '🅿️ Slot P-01: Occupied' : '✅ Slot P-01: Available', {
                icon: status === 'OCCUPIED' ? '🔴' : '🟢'
              });
            } else if (slotNum === '2') {
              setSlot2(status);
              toast(status === 'OCCUPIED' ? '🅿️ Slot P-02: Occupied' : '✅ Slot P-02: Available', {
                icon: status === 'OCCUPIED' ? '🔴' : '🟢'
              });
            }
          }

          if (msg.event === 'GATE_ARRIVAL') {
            setGateStatus('CAR AT GATE');
            setTelemetry(prev => ({
              ...prev,
              ir: { pin: 21, detected: true, val: 0, lastTrigger: new Date().toLocaleTimeString() }
            }));
            toast('🚗 Vehicle arrived at Gate (IR GPIO 21)', { icon: '🚧' });
          }

          if (msg.event === 'GATE_CLEAR') {
            setTelemetry(prev => ({
              ...prev,
              ir: { ...prev.ir, detected: false, val: 1 }
            }));
          }

          if (msg.event === 'TELEMETRY') {
            setTelemetry(prev => ({
              ...prev,
              ...msg.data,
              ir: { ...prev.ir, ...(msg.data.ir || {}) },
              us1: { ...prev.us1, ...(msg.data.us1 || {}) },
              us2: { ...prev.us2, ...(msg.data.us2 || {}) }
            }));
            if (msg.data.us1 && msg.data.us1.dist !== undefined) {
              const d1 = msg.data.us1.dist;
              setSlot1(d1 > 25 || d1 <= 0 ? 'AVAILABLE' : (d1 < 5 ? 'TOO CLOSE' : (d1 <= 15 ? 'PERFECT' : 'IMPROPER')));
            }
            if (msg.data.us2 && msg.data.us2.dist !== undefined) {
              const d2 = msg.data.us2.dist;
              setSlot2(d2 > 25 || d2 <= 0 ? 'AVAILABLE' : (d2 < 5 ? 'TOO CLOSE' : (d2 <= 15 ? 'PERFECT' : 'IMPROPER')));
            }
          }

          if (msg.event === 'INIT_STATE') {
            if (msg.data.serialStatus) setSerialInfo(msg.data.serialStatus);
            if (msg.data.telemetry) setTelemetry(msg.data.telemetry);
          }

          if (msg.event === 'SERIAL_STATUS') {
            setSerialInfo({ port: msg.data.port, connected: msg.data.connected });
            if (msg.data.connected) {
              toast.success(`USB Serial ${msg.data.port} Connected`, { icon: '🔌' });
            }
          }

          if (msg.event === 'CAR_CLASSIFIED') {
            const { allocatedSlot, assignedColor, category, model, plateNumber, zoneInfo } = msg.data;
            setIsRouteActive(true);
            const turnInfo = zoneInfo?.turnDirection ? `Turn ${zoneInfo.turnDirection}` : '';
            const distInfo = zoneInfo?.distanceMeters ? `${zoneInfo.distanceMeters}m` : '';
            setCurrentCategory(`${category} -> ${allocatedSlot} (${turnInfo} | ${distInfo})`);
            setGateStatus(`GO TO ${allocatedSlot} [${turnInfo}]`);
            toast.success(`Vehicle Identified: ${model} (${category}) -> ${allocatedSlot} [${turnInfo}, ${distInfo}]`, {
              icon: '🚘',
              duration: 6000,
              style: { borderLeft: `6px solid ${assignedColor}`, background: '#1E1B4B', color: '#fff' }
            });

            const newLog = {
              id: `${Date.now()}-${Math.random()}`,
              plate: plateNumber || 'Detected',
              type: zoneInfo?.turnDirection === 'LEFT' ? 'Left Turn' : 'Right Turn',
              category: `${category} (${distInfo})`,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              status: `Assigned: ${allocatedSlot}`
            };
            setLogs(prev => [newLog, ...prev]);
          }

          if (msg.event === 'PARKING_ALLOCATED') {
            const { allocatedSlot, assignedColor, category, holderName, plate, zoneInfo } = msg.data;
            setIsRouteActive(true);
            const turn = zoneInfo?.turnDirection ? `Turn ${zoneInfo.turnDirection}` : '';
            setCurrentCategory(`${category} (${allocatedSlot})`);
            setGateStatus(`OPEN - GO TO ${allocatedSlot} ${turn ? '[' + turn + ']' : ''}`);
            toast.success(`Gate Opened! ${holderName} allocated ${allocatedSlot}`, {
              icon: '🚗',
              style: { borderLeft: `6px solid ${assignedColor}` }
            });

            const newLog = {
              id: `${Date.now()}-${Math.random()}`,
              plate: plate || 'Unknown',
              type: assignedColor,
              category: category,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              status: `Assigned: ${allocatedSlot}`
            };
            setLogs(prev => [newLog, ...prev]);
          }

          if (msg.event === 'POSTURE_UPDATE') {
            const { slot, distance, posture } = msg.data;
            if (slot === 'P-01' || slot === '1') {
              setSlot1(posture === 'EMPTY' ? 'AVAILABLE' : `${posture} (${distance}cm)`);
              setTelemetry(prev => ({
                ...prev,
                us1: { ...prev.us1, dist: distance, posture }
              }));
            } else if (slot === 'P-02' || slot === '2') {
              setSlot2(posture === 'EMPTY' ? 'AVAILABLE' : `${posture} (${distance}cm)`);
              setTelemetry(prev => ({
                ...prev,
                us2: { ...prev.us2, dist: distance, posture }
              }));
            }
          }

          if (msg.event === 'WRONG_SLOT_ALERT') {
            toast.error(msg.data.message || 'WRONG SLOT ALERT!', {
              duration: 8000,
              style: { background: '#EF4444', color: 'white', fontWeight: 'bold' }
            });
          }

          if (msg.event === 'INSUFFICIENT_BALANCE') {
            toast.error(`Low Balance for ${msg.data.holderName} (₹${msg.data.balance}). Please recharge!`, {
              duration: 6000
            });
            setRfidInput(msg.data.uid);
          }

          if (msg.event === 'SESSION_COMPLETED') {
            setIsRouteActive(false);
            setGateStatus('IDLE');
            toast.success(msg.data.message, { duration: 6000, icon: '🧾' });
          }

          if (msg.event === 'LIGHT_ROUTE') {
            setIsRouteActive(true);
            setGateStatus('GUIDING VEHICLE');
            toast('✨ LED Route Active', { icon: '💡' });
          }

          if (msg.event === 'CLEAR_ROUTE') {
            setIsRouteActive(false);
            setGateStatus('IDLE');
            toast('🚗 Vehicle Parked — Guidance Cleared', { icon: '🏁' });
          }

          if (msg.event === 'RFID_TAP') {
            toast.success(`💳 RFID Authenticated: ${msg.uid}`, { 
              duration: 5000, 
              style: { background: '#10B981', color: 'white', fontWeight: 'bold' }
            });
            setRfidInput(msg.uid);
          }

        } catch(e) {
          console.error("WS Parse error", e);
        }
      };

      socket.onclose = () => {
        setWsStatus('Disconnected');
        reconnectTimer = setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  const handleRecharge = async (e) => {
    e.preventDefault();
    if (!rfidInput || !amount) {
      toast.error('Please enter both RFID and Amount');
      return;
    }
    
    const toastId = toast.loading(`Processing ₹${amount} recharge via Razorpay...`);
    try {
      const res = await fetch('http://localhost:8080/api/cards/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: rfidInput, amount: parseFloat(amount) })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Recharged! New Balance: ₹${data.card.balance}`, { id: toastId });
        setRfidInput('');
        setAmount('');
      } else {
        toast.error(data.error || 'Recharge failed', { id: toastId });
      }
    } catch (err) {
      toast.error('Could not reach backend', { id: toastId });
    }
  };

  return (
    <div className="grid gap-4">
      <Toaster position="top-right" />
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Gate Command Center</h1>
          <p>Monitor incoming vehicles, manage RFID, and track anomalies.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* COM Port Controller & Connect Button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '0.35rem 0.6rem',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <Usb size={16} color={serialInfo.connected ? 'var(--success)' : '#999'} />
            
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.5)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                padding: '0.25rem 0.5rem',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              {availablePorts.length > 0 ? (
                availablePorts.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path} {p.friendlyName ? `(${p.friendlyName.substring(0, 15)}...)` : ''}
                  </option>
                ))
              ) : (
                <>
                  <option value="COM5">COM5 (CP210x ESP32)</option>
                  <option value="COM3">COM3</option>
                  <option value="COM4">COM4</option>
                </>
              )}
            </select>

            <button
              type="button"
              onClick={fetchAvailablePorts}
              title="Refresh COM Ports"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '4px',
                color: '#ddd',
                cursor: 'pointer',
                padding: '0.3rem',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <RefreshCw size={14} />
            </button>

            {serialInfo.connected ? (
              <button
                type="button"
                onClick={handleDisconnectCom}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#EF4444',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '6px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
                title="Disconnect port to upload code in Arduino IDE"
              >
                <Unplug size={14} /> Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectCom}
                disabled={isConnectingPort}
                style={{
                  background: 'var(--success)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)'
                }}
              >
                <Zap size={14} /> Connect COM
              </button>
            )}
          </div>

          {/* Backend Status Badge */}
          <div className="flex items-center gap-1.5">
            <div className="live-indicator" style={{ backgroundColor: wsStatus === 'Active' ? 'var(--success)' : 'var(--danger)' }}></div>
            <span className={`badge ${wsStatus === 'Active' ? 'badge-success' : 'badge-warning'}`}>Backend: {wsStatus}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Laptop Webcam Feed */}
        <div className="glass-card" style={{ gridColumn: 'span 2' }}>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Camera className="text-muted" />
              <h3 style={{ margin: 0 }}>Live Gate Camera (Webcam)</h3>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
              <button 
                type="button"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0.5rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                📁 Upload Photo
              </button>
              <button 
                type="button"
                onClick={captureAndUpload}
                style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
              >
                <Camera size={16} /> Capture Vehicle
              </button>
            </div>
          </div>
          <div 
            style={{ 
              width: '100%', 
              height: '350px', 
              background: 'rgba(0,0,0,0.8)', 
              borderRadius: '8px',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
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

      {/* Real-Time Hardware Sensor Inputs Telemetry */}
      <div className="glass-card mt-4" style={{ border: '1px solid rgba(139, 92, 246, 0.3)', background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)' }}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Activity color="var(--primary)" size={20} />
            <h3 style={{ margin: 0 }}>Live Hardware Sensor Inputs</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Radio size={12} className="pulse" /> Live Telemetry
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
          
          {/* 1. Gate IR Sensor (GPIO 21) */}
          <div style={{
            background: telemetry.ir.detected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.1)',
            border: `2px solid ${telemetry.ir.detected ? '#EF4444' : 'rgba(16, 185, 129, 0.4)'}`,
            borderRadius: '10px',
            padding: '1.25rem',
            boxShadow: telemetry.ir.detected ? '0 0 15px rgba(239, 68, 68, 0.3)' : 'none',
            transition: 'all 0.3s'
          }}>
            <div className="flex justify-between items-center mb-2">
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ENTRANCE GATE IR</span>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.7rem' }}>GPIO 21</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.5rem 0' }}>
              <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: telemetry.ir.detected ? '#EF4444' : '#10B981' }}>
                {telemetry.ir.detected ? 'CAR DETECTED' : 'GATE CLEAR'}
              </span>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
              <span>Pin Reading: <strong style={{ color: 'white' }}>{telemetry.ir.val} ({telemetry.ir.val === 0 ? 'LOW' : 'HIGH'})</strong></span>
              <span>Time: <strong style={{ color: 'white' }}>{telemetry.ir.lastTrigger || 'Idle'}</strong></span>
            </div>

            {/* Quick Polarity Invert Button (Solves 'IR always stays on' immediately!) */}
            <button
              type="button"
              onClick={handleToggleIrPolarity}
              style={{
                marginTop: '0.6rem',
                width: '100%',
                padding: '0.45rem 0.6rem',
                borderRadius: '6px',
                background: irActiveLow ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.25)',
                border: `1px solid ${irActiveLow ? '#3B82F6' : '#F59E0B'}`,
                color: '#fff',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem'
              }}
              title="Click if IR sensor is stuck ON"
            >
              <RefreshCw size={12} />
              {irActiveLow ? 'Logic: Active-LOW (0=Car)' : 'Logic: Active-HIGH (1=Car)'} ⇄ Invert
            </button>
          </div>

          {/* 2. Ultrasonic Sensor 1 (Slot P-01 - GPIO 13/12) */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '1.25rem'
          }}>
            <div className="flex justify-between items-center mb-2">
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ULTRASONIC 1 (P-01)</span>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.7rem' }}>T:13 | E:12</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', margin: '0.5rem 0' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: telemetry.us1.dist <= 25 && telemetry.us1.dist > 0 ? '#10B981' : '#fff' }}>
                {telemetry.us1.dist > 200 || telemetry.us1.dist <= 0 ? '---' : `${telemetry.us1.dist}`}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {telemetry.us1.dist > 200 || telemetry.us1.dist <= 0 ? '(Empty Bay)' : 'cm'}
              </span>
            </div>

            {/* Posture Mini Bar */}
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', margin: '0.5rem 0' }}>
              <div style={{
                width: `${Math.min(100, Math.max(5, (telemetry.us1.dist / 30) * 100))}%`,
                height: '100%',
                background: telemetry.us1.dist < 5 ? '#EF4444' : (telemetry.us1.dist <= 15 ? '#10B981' : '#F59E0B'),
                borderRadius: '3px'
              }}></div>
            </div>

            <div style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Posture: <strong style={{ color: telemetry.us1.dist <= 15 && telemetry.us1.dist >= 5 ? '#10B981' : '#F59E0B' }}>
                {telemetry.us1.dist < 5 && telemetry.us1.dist > 0 ? 'Too Close (<5cm)' : (telemetry.us1.dist <= 15 && telemetry.us1.dist >= 5 ? 'Perfect (5-15cm)' : (telemetry.us1.dist <= 25 ? 'Improper (16-25cm)' : 'Empty'))}
              </strong></span>
            </div>
          </div>

          {/* 3. Ultrasonic Sensor 2 (Slot P-02 - GPIO 14/27) */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '1.25rem'
          }}>
            <div className="flex justify-between items-center mb-2">
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ULTRASONIC 2 (P-02)</span>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.7rem' }}>T:14 | E:27</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', margin: '0.5rem 0' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: telemetry.us2.dist <= 25 && telemetry.us2.dist > 0 ? '#10B981' : '#fff' }}>
                {telemetry.us2.dist > 200 || telemetry.us2.dist <= 0 ? '---' : `${telemetry.us2.dist}`}
              </span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {telemetry.us2.dist > 200 || telemetry.us2.dist <= 0 ? '(Empty Bay)' : 'cm'}
              </span>
            </div>

            {/* Posture Mini Bar */}
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', margin: '0.5rem 0' }}>
              <div style={{
                width: `${Math.min(100, Math.max(5, (telemetry.us2.dist / 30) * 100))}%`,
                height: '100%',
                background: telemetry.us2.dist < 5 ? '#EF4444' : (telemetry.us2.dist <= 15 ? '#10B981' : '#F59E0B'),
                borderRadius: '3px'
              }}></div>
            </div>

            <div style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Posture: <strong style={{ color: telemetry.us2.dist <= 15 && telemetry.us2.dist >= 5 ? '#10B981' : '#F59E0B' }}>
                {telemetry.us2.dist < 5 && telemetry.us2.dist > 0 ? 'Too Close (<5cm)' : (telemetry.us2.dist <= 15 && telemetry.us2.dist >= 5 ? 'Perfect (5-15cm)' : (telemetry.us2.dist <= 25 ? 'Improper (16-25cm)' : 'Empty'))}
              </strong></span>
            </div>
          </div>

          {/* 4. RFID RC522 Reader */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '10px',
            padding: '1.25rem'
          }}>
            <div className="flex justify-between items-center mb-2">
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>RFID SCANNER</span>
              <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.7rem' }}>SPI RC522</span>
            </div>

            <div style={{ margin: '0.5rem 0' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 'bold', fontFamily: 'monospace', color: telemetry.rfid.lastUid ? 'var(--primary)' : 'var(--text-muted)' }}>
                {telemetry.rfid.lastUid || 'READY FOR SCAN'}
              </span>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.5rem' }}>
              <div>Zone: <strong style={{ color: 'white' }}>{telemetry.rfid.location || 'Entrance Gate'}</strong></div>
              <div>Last Tap: <strong style={{ color: 'white' }}>{telemetry.rfid.lastTapTime || 'Awaiting Card'}</strong></div>
            </div>
          </div>

        </div>
      </div>

      {/* LED Strip Hardware Studio & Diagnostic Control */}
      <div className="glass-card mt-4" style={{ border: '1px solid rgba(16, 185, 129, 0.35)', background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.25) 0%, rgba(15, 23, 42, 0.75) 100%)' }}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb color="#10B981" size={22} />
            <h3 style={{ margin: 0 }}>LED Strip Hardware Configuration & Live Diagnostics</h3>
          </div>
          <span className="badge badge-success">
            Data Pin: GPIO 26 • Common GND with ESP32 Required
          </span>
        </div>

        {/* Live Visual 75-LED Strip & Progressive One-by-One Bar */}
        <div style={{
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '10px',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div className="flex justify-between items-center mb-3">
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              LIVE WS2812B STRIP VISUALIZER (75 INDIVIDUAL PIXELS)
            </span>
            <span style={{ fontSize: '0.75rem', color: '#10B981' }}>
              Mode: <strong>{activeLedMode === 'ALL_ON' ? 'All On Glow' : (activeLedMode === 'RAINBOW' ? 'Rainbow' : 'Sensors One-by-One')}</strong>
            </span>
          </div>

          {/* Bay 1 LEDs (0-9) & Bay 2 LEDs (10-19) Proximity Bars */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            
            {/* Slot P-01 10-LED Progressive Bar */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex justify-between items-center mb-2">
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>SLOT P-01 DISTANCE LEDs (0-9)</span>
                <span style={{ fontSize: '0.72rem', color: telemetry.us1.dist <= 35 && telemetry.us1.dist > 0 ? '#10B981' : 'var(--text-muted)' }}>
                  {telemetry.us1.dist > 200 || telemetry.us1.dist <= 0 ? 'Empty (35cm+)' : `${telemetry.us1.dist}cm (${Math.min(10, Math.max(1, Math.round(10 - ((telemetry.us1.dist - 4) / 31) * 9)))}/10 LEDs)`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                {Array.from({ length: 10 }).map((_, idx) => {
                  const numLeds1 = (telemetry.us1.dist > 35 || telemetry.us1.dist <= 0) ? 0 : Math.min(10, Math.max(1, Math.round(10 - ((telemetry.us1.dist - 4) / 31) * 9)));
                  let dotColor = '#1e293b';
                  let glowColor = 'none';

                  if (activeLedMode === 'ALL_ON') {
                    dotColor = testColor || '#fff';
                    glowColor = `0 0 8px ${dotColor}`;
                  } else if (numLeds1 === 0 && idx === 0) {
                    dotColor = '#10B981';
                    glowColor = '0 0 6px #10B981';
                  } else if (idx < numLeds1) {
                    if (idx < 4) {
                      dotColor = '#10B981'; // Green
                      glowColor = '0 0 8px #10B981';
                    } else if (idx < 7) {
                      dotColor = '#F59E0B'; // Amber
                      glowColor = '0 0 8px #F59E0B';
                    } else {
                      dotColor = '#EF4444'; // Red
                      glowColor = '0 0 10px #EF4444';
                    }
                  }

                  return (
                    <div 
                      key={`slot1-led-${idx}`} 
                      title={`LED ${idx} (Slot 1)`}
                      style={{
                        flex: 1,
                        height: '22px',
                        borderRadius: '4px',
                        background: dotColor,
                        boxShadow: glowColor,
                        transition: 'all 0.15s ease-in-out',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Slot P-02 10-LED Progressive Bar */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex justify-between items-center mb-2">
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>SLOT P-02 DISTANCE LEDs (10-19)</span>
                <span style={{ fontSize: '0.72rem', color: telemetry.us2.dist <= 35 && telemetry.us2.dist > 0 ? '#10B981' : 'var(--text-muted)' }}>
                  {telemetry.us2.dist > 200 || telemetry.us2.dist <= 0 ? 'Empty (35cm+)' : `${telemetry.us2.dist}cm (${Math.min(10, Math.max(1, Math.round(10 - ((telemetry.us2.dist - 4) / 31) * 9)))}/10 LEDs)`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '5px' }}>
                {Array.from({ length: 10 }).map((_, idx) => {
                  const numLeds2 = (telemetry.us2.dist > 35 || telemetry.us2.dist <= 0) ? 0 : Math.min(10, Math.max(1, Math.round(10 - ((telemetry.us2.dist - 4) / 31) * 9)));
                  let dotColor = '#1e293b';
                  let glowColor = 'none';

                  if (activeLedMode === 'ALL_ON') {
                    dotColor = testColor || '#fff';
                    glowColor = `0 0 8px ${dotColor}`;
                  } else if (numLeds2 === 0 && idx === 0) {
                    dotColor = '#10B981';
                    glowColor = '0 0 6px #10B981';
                  } else if (idx < numLeds2) {
                    if (idx < 4) {
                      dotColor = '#10B981'; // Green
                      glowColor = '0 0 8px #10B981';
                    } else if (idx < 7) {
                      dotColor = '#F59E0B'; // Amber
                      glowColor = '0 0 8px #F59E0B';
                    } else {
                      dotColor = '#EF4444'; // Red
                      glowColor = '0 0 10px #EF4444';
                    }
                  }

                  return (
                    <div 
                      key={`slot2-led-${idx}`} 
                      title={`LED ${10 + idx} (Slot 2)`}
                      style={{
                        flex: 1,
                        height: '22px',
                        borderRadius: '4px',
                        background: dotColor,
                        boxShadow: glowColor,
                        transition: 'all 0.15s ease-in-out',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    />
                  );
                })}
              </div>
            </div>

          </div>

          {/* Full 75-LED Ribbon Visualization */}
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>LED 0 (Entrance)</span>
            <span>LED 20 (Fork: {testTurn})</span>
            <span>LED 74 (Far End: 80m)</span>
          </div>
          <div style={{
            display: 'flex',
            gap: '2px',
            background: 'rgba(0,0,0,0.5)',
            padding: '6px',
            borderRadius: '6px',
            overflowX: 'auto'
          }}>
            {Array.from({ length: 75 }).map((_, i) => {
              let c = '#111827';
              let glow = 'none';

              if (activeLedMode === 'ALL_ON') {
                c = testColor || '#fff';
                glow = `0 0 5px ${c}`;
              } else if (activeLedMode === 'RAINBOW') {
                const hue = Math.round((i / 75) * 360);
                c = `hsl(${hue}, 100%, 55%)`;
                glow = `0 0 4px ${c}`;
              } else if (i < 10) {
                const n1 = (telemetry.us1.dist > 35 || telemetry.us1.dist <= 0) ? 0 : Math.min(10, Math.max(1, Math.round(10 - ((telemetry.us1.dist - 4) / 31) * 9)));
                if (n1 === 0 && i === 0) c = '#10B981';
                else if (i < n1) c = i < 4 ? '#10B981' : (i < 7 ? '#F59E0B' : '#EF4444');
              } else if (i >= 10 && i < 20) {
                const n2 = (telemetry.us2.dist > 35 || telemetry.us2.dist <= 0) ? 0 : Math.min(10, Math.max(1, Math.round(10 - ((telemetry.us2.dist - 4) / 31) * 9)));
                const rel = i - 10;
                if (n2 === 0 && rel === 0) c = '#10B981';
                else if (rel < n2) c = rel < 4 ? '#10B981' : (rel < 7 ? '#F59E0B' : '#EF4444');
              } else if (i === 20 || i === 21) {
                c = testTurn === 'LEFT' ? '#A855F7' : '#F59E0B';
                glow = `0 0 6px ${c}`;
              } else if (i <= testEnd && (isRouteActive || activeLedMode === 'ROUTE')) {
                c = testColor || '#00E5FF';
                glow = `0 0 6px ${c}`;
              }

              return (
                <div 
                  key={`ribbon-led-${i}`}
                  title={`LED #${i}`}
                  style={{
                    flex: '1 0 7px',
                    height: '14px',
                    borderRadius: '2px',
                    background: c,
                    boxShadow: glow,
                    transition: 'all 0.1s'
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {/* 1. Quick Hardware Verification Tests */}
          <div>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Zap size={15} color="#10B981" /> 1. Instant Hardware Glow Tests
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              <button 
                type="button"
                onClick={() => handleSetLedMode('ALL_ON', '#FFFFFF')}
                style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid #fff', color: '#fff', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
              >
                💡 All White (Max Test)
              </button>
              <button 
                type="button"
                onClick={() => handleSetLedMode('ALL_ON', '#FF0000')}
                style={{ background: 'rgba(239, 68, 68, 0.25)', border: '1px solid #EF4444', color: '#EF4444', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
              >
                🔴 All Red
              </button>
              <button 
                type="button"
                onClick={() => handleSetLedMode('ALL_ON', '#00FF00')}
                style={{ background: 'rgba(16, 185, 129, 0.25)', border: '1px solid #10B981', color: '#10B981', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
              >
                🟢 All Green
              </button>
              <button 
                type="button"
                onClick={() => handleSetLedMode('ALL_ON', '#0099FF')}
                style={{ background: 'rgba(59, 130, 246, 0.25)', border: '1px solid #3B82F6', color: '#60A5FA', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
              >
                🔵 All Blue
              </button>
              <button 
                type="button"
                onClick={() => handleSetLedMode('RAINBOW')}
                style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.3), rgba(245,158,11,0.3), rgba(16,185,129,0.3), rgba(59,130,246,0.3))', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
              >
                🌈 Rainbow Cycle
              </button>
              <button 
                type="button"
                onClick={() => handleSetLedMode('SLOT_PREVIEW')}
                style={{ background: 'rgba(168, 85, 247, 0.25)', border: '1px solid #A855F7', color: '#D8B4FE', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}
              >
                🚗 Parking Bays Green
              </button>
            </div>
            <button 
              type="button"
              onClick={() => handleSetLedMode('ALL_OFF')}
              style={{ marginTop: '0.5rem', width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-muted)', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              ⬛ Turn All Off (Clear Strip)
            </button>
          </div>

          {/* 2. Brightness & Color Control */}
          <div>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sun size={15} color="#F59E0B" /> 2. Strip Brightness: {Math.round((ledBrightness / 255) * 100)}% ({ledBrightness}/255)
            </h4>
            <input 
              type="range" 
              min="10" 
              max="255" 
              value={ledBrightness} 
              onChange={(e) => handleBrightnessChange(e.target.value)}
              style={{ width: '100%', accentColor: '#10B981', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              <span>Dim (10)</span>
              <span>Standard (180)</span>
              <span>Max (255)</span>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Custom Comet Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input 
                  type="color" 
                  value={testColor} 
                  onChange={(e) => setTestColor(e.target.value)}
                  style={{ width: '40px', height: '35px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                />
                <input 
                  type="text" 
                  value={testColor} 
                  onChange={(e) => setTestColor(e.target.value)}
                  style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>
            </div>
          </div>

          {/* 3. Dynamic Route Simulation (Left vs Right & Distance Shortening) */}
          <div>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sliders size={15} color="#60A5FA" /> 3. Test Dynamic Shortened Track
            </h4>
            
            {/* Direction fork */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button 
                type="button"
                onClick={() => setTestTurn('RIGHT')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '6px',
                  background: testTurn === 'RIGHT' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${testTurn === 'RIGHT' ? '#3B82F6' : 'rgba(255,255,255,0.15)'}`,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.3rem'
                }}
              >
                <ArrowRight size={14} /> Turn RIGHT (1-20)
              </button>
              <button 
                type="button"
                onClick={() => setTestTurn('LEFT')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '6px',
                  background: testTurn === 'LEFT' ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${testTurn === 'LEFT' ? '#A855F7' : 'rgba(255,255,255,0.15)'}`,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.3rem'
                }}
              >
                <ArrowLeft size={14} /> Turn LEFT (21-40)
              </button>
            </div>

            {/* Distance Preset Selector */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Distance Shortening Target</label>
              <select 
                value={testEnd} 
                onChange={(e) => setTestEnd(parseInt(e.target.value, 10))}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.85rem' }}
              >
                <option value="25" style={{ background: '#1E1B4B' }}>Luxury VIP (10m - Ultra Short LED 25)</option>
                <option value="35" style={{ background: '#1E1B4B' }}>EV Bay (20m - Short LED 35)</option>
                <option value="40" style={{ background: '#1E1B4B' }}>Commercial Yellow (25m - Short LED 40)</option>
                <option value="55" style={{ background: '#1E1B4B' }}>SUV Bay (45m - Middle LED 55)</option>
                <option value="65" style={{ background: '#1E1B4B' }}>Sedan Bay (60m - Far Middle LED 65)</option>
                <option value="74" style={{ background: '#1E1B4B' }}>Hatchback Bay (80m - Far End LED 74)</option>
              </select>
            </div>

            <button 
              type="button"
              onClick={() => handleSetLedMode('ROUTE')}
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: '8px',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 0 15px rgba(139, 92, 246, 0.4)'
              }}
            >
              <Zap size={16} /> Run Dynamic LED Guidance Comet
            </button>
          </div>
        </div>

        {/* Hardware Wiring Checklist Banner */}
        <div style={{
          marginTop: '1.2rem',
          padding: '0.8rem 1rem',
          borderRadius: '8px',
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.6rem'
        }}>
          <HelpCircle size={16} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong style={{ color: '#fff' }}>Hardware Troubleshooting & Pin Guide:</strong>
            <span style={{ display: 'block', marginTop: '0.2rem' }}>
              • <strong>LED Data In (DIN):</strong> Firmware broadcasts to <strong>GPIO 26</strong>, <strong>GPIO 25</strong>, and <strong>GPIO 4</strong> simultaneously. Connect your WS2812B data wire to any of these pins.
            </span>
            <span style={{ display: 'block', marginTop: '0.2rem' }}>
              • <strong>Gate IR Sensor:</strong> OUT is connected to <strong>GPIO 21</strong>. If IR is stuck ON, click the <em>Invert</em> button above or turn the blue potentiometer screw counter-clockwise on the IR module.
            </span>
            <span style={{ display: 'block', marginTop: '0.2rem' }}>
              • <strong>Common Ground:</strong> The LED strip's GND pin <em>must</em> be connected to the ESP32 GND.
            </span>
          </div>
        </div>
      </div>

      {/* Vehicle Category Allocation & Mock Color Registry */}
      <div className="glass-card mt-4" style={{ border: '1px solid rgba(139, 92, 246, 0.3)', background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.3) 0%, rgba(15, 23, 42, 0.7) 100%)' }}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <CarFront color="var(--primary)" size={22} />
            <h3 style={{ margin: 0 }}>Vehicle Category Allocation & Mock Color Registry</h3>
          </div>
          <span className="badge badge-success">6 Categories Configured</span>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Every vehicle category is automatically mapped to a dedicated <strong>Parking Lot No.</strong>, spatial distance, turn direction, and unique <strong>Mock LED Color</strong>. Click any card to simulate vehicle entry and trigger dynamic hardware guidance.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem' }}>
          
          {/* 1. Luxury VIP */}
          <div style={{
            background: 'rgba(147, 51, 234, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.35)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 0 15px rgba(168, 85, 247, 0.15)'
          }}>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.25)', color: '#D8B4FE', fontWeight: 'bold' }}>
                  LUXURY CARS
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#D8B4FE', fontFamily: 'monospace' }}>
                  Lot #01 (P-VIP)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#A855F7',
                  boxShadow: '0 0 12px #A855F7, 0 0 24px #9333EA',
                  flexShrink: 0
                }}></div>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem' }}>Royal Purple (#A855F7)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>VIP Reserved Bay • Nearest to Gate</div>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '6px' }}>
                <div className="flex justify-between"><span>Distance:</span> <strong style={{ color: '#fff' }}>10 meters (Nearest)</strong></div>
                <div className="flex justify-between"><span>Fork Direction:</span> <strong style={{ color: '#D8B4FE' }}>Turn LEFT (1-20)</strong></div>
                <div className="flex justify-between"><span>LED Guidance:</span> <strong style={{ color: '#fff' }}>Track ends at LED 25</strong></div>
                <div className="flex justify-between"><span>Tariff:</span> <strong style={{ color: '#10B981' }}>₹100/hr (Valet Included)</strong></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSimulateCategory('LUXURY')}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.6rem',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 0 10px rgba(147, 51, 234, 0.4)'
              }}
            >
              <Zap size={14} /> Simulate Luxury Entry (Lot #01)
            </button>
          </div>

          {/* 2. EV Cars */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 0 15px rgba(16, 185, 129, 0.15)'
          }}>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#A7F3D0', fontWeight: 'bold' }}>
                  EV VEHICLES
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#A7F3D0', fontFamily: 'monospace' }}>
                  Lot #05 (P-EV)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#10B981',
                  boxShadow: '0 0 12px #10B981, 0 0 24px #059669',
                  flexShrink: 0
                }}></div>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem' }}>Electric Green (#10B981)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Green Plate • 60kW DC Fast Charger</div>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '6px' }}>
                <div className="flex justify-between"><span>Distance:</span> <strong style={{ color: '#fff' }}>20 meters (Nearer)</strong></div>
                <div className="flex justify-between"><span>Fork Direction:</span> <strong style={{ color: '#A7F3D0' }}>Turn LEFT (1-20)</strong></div>
                <div className="flex justify-between"><span>LED Guidance:</span> <strong style={{ color: '#fff' }}>Track ends at LED 35</strong></div>
                <div className="flex justify-between"><span>Tariff:</span> <strong style={{ color: '#10B981' }}>₹35/hr (Eco Subsidized)</strong></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSimulateCategory('EV')}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.6rem',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)'
              }}
            >
              <Zap size={14} /> Simulate EV Entry (Lot #05)
            </button>
          </div>

          {/* 3. Commercial Vehicles */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 0 15px rgba(245, 158, 11, 0.15)'
          }}>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.25)', color: '#FDE68A', fontWeight: 'bold' }}>
                  COMMERCIAL (YELLOW)
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#FDE68A', fontFamily: 'monospace' }}>
                  Lot #10 (P-COMM)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#F59E0B',
                  boxShadow: '0 0 12px #F59E0B, 0 0 24px #D97706',
                  flexShrink: 0
                }}></div>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem' }}>Amber Yellow (#F59E0B)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Yellow Plate • Driver Amenities Bay</div>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '6px' }}>
                <div className="flex justify-between"><span>Distance:</span> <strong style={{ color: '#fff' }}>25 meters (Nearer)</strong></div>
                <div className="flex justify-between"><span>Fork Direction:</span> <strong style={{ color: '#FDE68A' }}>Turn LEFT (1-20)</strong></div>
                <div className="flex justify-between"><span>LED Guidance:</span> <strong style={{ color: '#fff' }}>Track ends at LED 40</strong></div>
                <div className="flex justify-between"><span>Tariff:</span> <strong style={{ color: '#10B981' }}>₹20/hr (Fleet Concession)</strong></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSimulateCategory('COMMERCIAL')}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.6rem',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.4)'
              }}
            >
              <Zap size={14} /> Simulate Commercial Entry (Lot #10)
            </button>
          </div>

          {/* 4. SUV */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 0 15px rgba(59, 130, 246, 0.15)'
          }}>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.25)', color: '#BFDBFE', fontWeight: 'bold' }}>
                  SUV VEHICLES
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#BFDBFE', fontFamily: 'monospace' }}>
                  Lot #15 (P-01)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#3B82F6',
                  boxShadow: '0 0 12px #3B82F6, 0 0 24px #2563EB',
                  flexShrink: 0
                }}></div>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem' }}>Cobalt Blue (#3B82F6)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>High Clearance • Wide Turning Radius</div>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '6px' }}>
                <div className="flex justify-between"><span>Distance:</span> <strong style={{ color: '#fff' }}>45 meters (Middle)</strong></div>
                <div className="flex justify-between"><span>Fork Direction:</span> <strong style={{ color: '#BFDBFE' }}>Turn RIGHT (21-40)</strong></div>
                <div className="flex justify-between"><span>LED Guidance:</span> <strong style={{ color: '#fff' }}>Track ends at LED 55</strong></div>
                <div className="flex justify-between"><span>Tariff:</span> <strong style={{ color: '#10B981' }}>₹45/hr</strong></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSimulateCategory('SUV')}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.6rem',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 0 10px rgba(59, 130, 246, 0.4)'
              }}
            >
              <Zap size={14} /> Simulate SUV Entry (Lot #15)
            </button>
          </div>

          {/* 5. Sedan */}
          <div style={{
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.35)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 0 15px rgba(6, 182, 212, 0.15)'
          }}>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.25)', color: '#A5F3FC', fontWeight: 'bold' }}>
                  SEDAN CARS
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#A5F3FC', fontFamily: 'monospace' }}>
                  Lot #20 (P-02)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#06B6D4',
                  boxShadow: '0 0 12px #06B6D4, 0 0 24px #0891B2',
                  flexShrink: 0
                }}></div>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem' }}>Executive Cyan (#06B6D4)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Standard Covered Bay • Full Weather Protection</div>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '6px' }}>
                <div className="flex justify-between"><span>Distance:</span> <strong style={{ color: '#fff' }}>60 meters (Far Middle)</strong></div>
                <div className="flex justify-between"><span>Fork Direction:</span> <strong style={{ color: '#A5F3FC' }}>Turn RIGHT (21-40)</strong></div>
                <div className="flex justify-between"><span>LED Guidance:</span> <strong style={{ color: '#fff' }}>Track ends at LED 65</strong></div>
                <div className="flex justify-between"><span>Tariff:</span> <strong style={{ color: '#10B981' }}>₹50/hr</strong></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSimulateCategory('SEDAN')}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.6rem',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 0 10px rgba(6, 182, 212, 0.4)'
              }}
            >
              <Zap size={14} /> Simulate Sedan Entry (Lot #20)
            </button>
          </div>

          {/* 6. Hatchback */}
          <div style={{
            background: 'rgba(236, 72, 153, 0.08)',
            border: '1px solid rgba(236, 72, 153, 0.35)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 0 15px rgba(236, 72, 153, 0.15)'
          }}>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.25)', color: '#FBCFE8', fontWeight: 'bold' }}>
                  HATCHBACKS
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#FBCFE8', fontFamily: 'monospace' }}>
                  Lot #30 (P-03)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#EC4899',
                  boxShadow: '0 0 12px #EC4899, 0 0 24px #DB2777',
                  flexShrink: 0
                }}></div>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem' }}>Coral Pink (#EC4899)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compact Budget Bay • Full Track Route</div>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '6px' }}>
                <div className="flex justify-between"><span>Distance:</span> <strong style={{ color: '#fff' }}>80 meters (Far End)</strong></div>
                <div className="flex justify-between"><span>Fork Direction:</span> <strong style={{ color: '#FBCFE8' }}>Turn RIGHT (21-40)</strong></div>
                <div className="flex justify-between"><span>LED Guidance:</span> <strong style={{ color: '#fff' }}>Track ends at LED 74</strong></div>
                <div className="flex justify-between"><span>Tariff:</span> <strong style={{ color: '#10B981' }}>₹25/hr (Economic)</strong></div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSimulateCategory('HATCHBACK')}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.6rem',
                borderRadius: '6px',
                background: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.8rem',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 0 10px rgba(236, 72, 153, 0.4)'
              }}
            >
              <Zap size={14} /> Simulate Hatchback Entry (Lot #30)
            </button>
          </div>

        </div>
      </div>

      {/* Car Fleet & Allocated Parking ID + Mock Colour Registry */}
      <div className="glass-card mt-4" style={{ border: '1px solid rgba(59, 130, 246, 0.35)', background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.25) 0%, rgba(15, 23, 42, 0.8) 100%)' }}>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <CarFront color="#60A5FA" size={22} />
            <h3 style={{ margin: 0 }}>Allocated Parking ID & Mock Colour Registry (Every Car)</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveRegistryTab('FLEET')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: activeRegistryTab === 'FLEET' ? '#3B82F6' : 'rgba(255,255,255,0.08)',
                color: '#fff',
                transition: 'all 0.2s'
              }}
            >
              🚗 Registered Fleet ({fleetCars.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveRegistryTab('CATALOG')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: activeRegistryTab === 'CATALOG' ? '#3B82F6' : 'rgba(255,255,255,0.08)',
                color: '#fff',
                transition: 'all 0.2s'
              }}
            >
              📋 AI Models Catalog ({modelCatalog.length})
            </button>
          </div>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Every vehicle registered or detected by the Gate Camera / RFID is automatically allotted a permanent <strong>Parking Slot ID</strong>, <strong>Lot Number</strong>, and a dedicated <strong>Signature Mock Colour</strong> for hardware LED route guidance.
        </p>

        {/* Search Bar */}
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="🔍 Search by Car Model, Plate Number, Parking Lot, or Colour..."
            value={carSearchTerm}
            onChange={(e) => setCarSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          />
        </div>

        {/* Tab 1: Registered Fleet Cars */}
        {activeRegistryTab === 'FLEET' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Vehicle & Owner</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>License Plate</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Category</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Allocated Parking ID</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Parking Lot No.</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Assigned Mock Colour</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Route Guidance</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>Test Guidance</th>
                </tr>
              </thead>
              <tbody>
                {fleetCars
                  .filter(c => {
                    if (!carSearchTerm) return true;
                    const q = carSearchTerm.toLowerCase();
                    return (
                      (c.vehicleModel && c.vehicleModel.toLowerCase().includes(q)) ||
                      (c.vehiclePlate && c.vehiclePlate.toLowerCase().includes(q)) ||
                      (c.holderName && c.holderName.toLowerCase().includes(q)) ||
                      (c.parkingId && c.parkingId.toLowerCase().includes(q)) ||
                      (c.lotNumber && c.lotNumber.toLowerCase().includes(q)) ||
                      (c.category && c.category.toLowerCase().includes(q)) ||
                      (c.colorName && c.colorName.toLowerCase().includes(q))
                    );
                  })
                  .map((car, idx) => (
                    <tr key={car.uid || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{car.vehicleModel || 'Standard Vehicle'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Owner: {car.holderName}</div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontWeight: 'bold',
                          fontSize: '0.8rem',
                          background: car.category === 'EV' ? 'rgba(16, 185, 129, 0.2)' : (car.category === 'COMMERCIAL' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.15)'),
                          border: `1px solid ${car.category === 'EV' ? '#10B981' : (car.category === 'COMMERCIAL' ? '#F59E0B' : 'rgba(255, 255, 255, 0.3)')}`,
                          color: car.category === 'EV' ? '#A7F3D0' : (car.category === 'COMMERCIAL' ? '#FDE68A' : '#fff')
                        }}>
                          {car.vehiclePlate || 'KA-XX-XX-XXXX'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span className="badge" style={{
                          background: car.category === 'LUXURY' ? 'rgba(168, 85, 247, 0.25)' :
                                      car.category === 'EV' ? 'rgba(16, 185, 129, 0.25)' :
                                      car.category === 'COMMERCIAL' ? 'rgba(245, 158, 11, 0.25)' :
                                      car.category === 'SUV' ? 'rgba(59, 130, 246, 0.25)' :
                                      car.category === 'SEDAN' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(236, 72, 153, 0.25)',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: '0.75rem'
                        }}>
                          {car.category}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: '#60A5FA' }}>
                          {car.parkingId || (car.category === 'LUXURY' ? 'P-VIP' : car.category === 'EV' ? 'P-EV' : car.category === 'COMMERCIAL' ? 'P-COMM' : car.category === 'SUV' ? 'P-01' : car.category === 'SEDAN' ? 'P-02' : 'P-03')}
                        </strong>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <strong style={{ color: '#fff', fontSize: '0.9rem' }}>
                          {car.lotNumber || (car.category === 'LUXURY' ? 'Lot #01' : car.category === 'EV' ? 'Lot #05' : car.category === 'COMMERCIAL' ? 'Lot #10' : car.category === 'SUV' ? 'Lot #15' : car.category === 'SEDAN' ? 'Lot #20' : 'Lot #30')}
                        </strong>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: car.assignedColor || '#3B82F6',
                            boxShadow: `0 0 10px ${car.assignedColor || '#3B82F6'}`,
                            flexShrink: 0
                          }} />
                          <div>
                            <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.8rem' }}>{car.colorName || car.assignedColor}</span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{car.assignedColor}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <div>{car.category === 'LUXURY' || car.category === 'EV' || car.category === 'COMMERCIAL' ? 'Turn LEFT' : 'Turn RIGHT'}</div>
                        <div style={{ color: '#fff' }}>{car.category === 'LUXURY' ? '10m (LED 25)' : car.category === 'EV' ? '20m (LED 35)' : car.category === 'COMMERCIAL' ? '25m (LED 40)' : car.category === 'SUV' ? '45m (LED 55)' : car.category === 'SEDAN' ? '60m (LED 65)' : '80m (LED 74)'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleSimulateCar(car)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            background: `linear-gradient(135deg, ${car.assignedColor || '#3B82F6'} 0%, rgba(0,0,0,0.7) 100%)`,
                            border: `1px solid ${car.assignedColor || '#3B82F6'}`,
                            color: '#fff',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            boxShadow: `0 0 8px ${car.assignedColor || '#3B82F6'}40`
                          }}
                        >
                          <Zap size={12} /> Light Route
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: AI Models Catalog (suv.json, sedan.json, hatchback.json, luxury.json) */}
        {activeRegistryTab === 'CATALOG' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Car Model</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Category</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Allotted Parking ID</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Lot Number</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Allotted Mock Colour</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Turn & Distance</th>
                  <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>Test Guidance</th>
                </tr>
              </thead>
              <tbody>
                {modelCatalog
                  .filter(m => {
                    if (!carSearchTerm) return true;
                    const q = carSearchTerm.toLowerCase();
                    return (
                      m.model.toLowerCase().includes(q) ||
                      m.category.toLowerCase().includes(q) ||
                      m.parkingId.toLowerCase().includes(q) ||
                      m.lotNumber.toLowerCase().includes(q) ||
                      m.colorName.toLowerCase().includes(q)
                    );
                  })
                  .map((item, idx) => (
                    <tr key={`model-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600, color: '#fff' }}>
                        {item.model}
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <span className="badge" style={{
                          background: item.category === 'LUXURY' ? 'rgba(168, 85, 247, 0.25)' :
                                      item.category === 'EV' ? 'rgba(16, 185, 129, 0.25)' :
                                      item.category === 'COMMERCIAL' ? 'rgba(245, 158, 11, 0.25)' :
                                      item.category === 'SUV' ? 'rgba(59, 130, 246, 0.25)' :
                                      item.category === 'SEDAN' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(236, 72, 153, 0.25)',
                          color: '#fff',
                          fontSize: '0.72rem'
                        }}>
                          {item.category}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <strong style={{ fontFamily: 'monospace', color: '#60A5FA' }}>{item.parkingId}</strong>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <strong style={{ color: '#fff' }}>{item.lotNumber}</strong>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <div style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: item.assignedColor,
                            boxShadow: `0 0 8px ${item.assignedColor}`,
                            flexShrink: 0
                          }} />
                          <span style={{ fontSize: '0.8rem', color: '#fff' }}>{item.colorName}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Turn {item.turn} ({item.distance})
                      </td>
                      <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleSimulateCar(item)}
                          style={{
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.08)',
                            border: `1px solid ${item.assignedColor}`,
                            color: '#fff',
                            fontSize: '0.72rem',
                            cursor: 'pointer'
                          }}
                        >
                          <Zap size={11} style={{ display: 'inline', marginRight: '3px', color: item.assignedColor }} />
                          Route
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

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
