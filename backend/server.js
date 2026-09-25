const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
let SerialPort, ReadlineParser;
try {
  ({ SerialPort } = require('serialport'));
  ({ ReadlineParser } = require('@serialport/parser-readline'));
} catch (e) {
  console.warn('[Serial] serialport module not available (cloud mode). Hardware features disabled.');
  SerialPort = null;
  ReadlineParser = null;
}

// Initialize Gemini API
const ai = new GoogleGenAI({});

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Setup image upload storage
const upload = multer({ dest: 'uploads/' });

// Initialize Razorpay Client (supports live/test mode via environment variables)
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

let razorpayClient = null;
if (razorpayKeyId && razorpayKeySecret) {
  try {
    razorpayClient = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret
    });
    console.log(`[Razorpay Gateway] Initialized with Key: ${razorpayKeyId.slice(0, 10)}...`);
  } catch (err) {
    console.warn('[Razorpay] Client initialization warning:', err.message);
  }
}

// Broadcast helper for all connected WebSocket clients (Admin Dashboard & User Frontend)
function broadcast(event, data) {
  const payload = JSON.stringify({
    event,
    type: event,
    data,
    payload: data,
    timestamp: new Date().toISOString()
  });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// -------------------------------------------------------------
// 1. CAR CLASSIFICATION DATABASE
// -------------------------------------------------------------
// -------------------------------------------------------------
// 1. CAR CLASSIFICATION DATABASE
// -------------------------------------------------------------
let carData = { suv: [], hatchback: [], sedan: [], luxury: [] };

const loadCarData = () => {
  try {
    const suvPath = path.join(__dirname, 'data', 'suv.json');
    const hatchPath = path.join(__dirname, 'data', 'hatchback.json');
    const sedanPath = path.join(__dirname, 'data', 'sedan.json');
    const luxPath = path.join(__dirname, 'data', 'luxury.json');

    if (fs.existsSync(suvPath)) carData.suv = JSON.parse(fs.readFileSync(suvPath, 'utf8'));
    if (fs.existsSync(hatchPath)) carData.hatchback = JSON.parse(fs.readFileSync(hatchPath, 'utf8'));
    if (fs.existsSync(sedanPath)) carData.sedan = JSON.parse(fs.readFileSync(sedanPath, 'utf8'));
    if (fs.existsSync(luxPath)) carData.luxury = JSON.parse(fs.readFileSync(luxPath, 'utf8'));
    console.log('✓ Car classification database (SUV, Hatchback, Sedan, Luxury) loaded successfully.');
  } catch (err) {
    console.error('Error loading car classification JSON:', err.message);
  }
};
loadCarData();

// -------------------------------------------------------------
// 2. RFID CARDS & MEMBERSHIP DATABASE
// -------------------------------------------------------------
const cardsFilePath = path.join(__dirname, 'data', 'rfid_cards.json');
let rfidCards = [];

const loadCardsData = () => {
  try {
    if (fs.existsSync(cardsFilePath)) {
      rfidCards = JSON.parse(fs.readFileSync(cardsFilePath, 'utf8'));
      console.log(`✓ Loaded ${rfidCards.length} RFID cards from database.`);
    } else {
      rfidCards = [];
    }
  } catch (err) {
    console.error('Error loading RFID cards:', err.message);
    rfidCards = [];
  }
};

const saveCardsData = () => {
  try {
    fs.writeFileSync(cardsFilePath, JSON.stringify(rfidCards, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving RFID cards:', err.message);
  }
};
loadCardsData();

// -------------------------------------------------------------
// 3. DYNAMIC FARE & SPATIAL DISTANCE ALLOCATION ENGINE
// Vehicle Category Hierarchy & Mock Colors:
//  - Luxury Cars  : Lot #01 (Bay P-VIP)  - Royal Purple (#A855F7) - 10m (Turn LEFT - LED 25)
//  - EV Cars      : Lot #05 (Bay P-EV)   - Electric Green (#10B981) - 20m (Turn LEFT - LED 35)
//  - Commercial   : Lot #10 (Bay P-COMM) - Amber Yellow  (#F59E0B) - 25m (Turn LEFT - LED 40)
//  - SUV          : Lot #15 (Bay P-01)   - Cobalt Blue   (#3B82F6) - 45m (Turn RIGHT - LED 55)
//  - Sedan        : Lot #20 (Bay P-02)   - Cyan Aqua     (#06B6D4) - 60m (Turn RIGHT - LED 65)
//  - Hatchback    : Lot #30 (Bay P-03)   - Coral Pink    (#EC4899) - 80m (Turn RIGHT - LED 74)
// -------------------------------------------------------------
const ZONE_CONFIG = {
  LUXURY: {
    lotNumber: 'Lot #01',
    slotId: 'P-VIP',
    zoneName: 'VIP Luxury Bay P-VIP',
    mockColor: '#A855F7',
    colorName: 'Royal Purple',
    distanceMeters: 10,
    turnDirection: 'LEFT',
    ledEndIndex: 25,
    accessibility: 'Ultra High (Immediate/Valet)',
    baseRatePerHour: 100,
    rateMultiplier: 2.5,
    minBalanceRequired: 100,
    features: ['Reserved VIP Bay', 'Closest to Gate', 'CCTV Security', 'Dedicated Valet']
  },
  EV: {
    lotNumber: 'Lot #05',
    slotId: 'P-EV',
    zoneName: 'EV Green Bay P-EV',
    mockColor: '#10B981',
    colorName: 'Electric Neon Green',
    distanceMeters: 20,
    turnDirection: 'LEFT',
    ledEndIndex: 35,
    accessibility: 'High + 60kW DC Fast Charger',
    baseRatePerHour: 35,
    rateMultiplier: 1.0,
    minBalanceRequired: 35,
    features: ['EV Fast Charging Station', 'Nearer Bay', 'Green Tariff']
  },
  COMMERCIAL: {
    lotNumber: 'Lot #10',
    slotId: 'P-COMM',
    zoneName: 'Commercial Yellow Bay P-COMM',
    mockColor: '#F59E0B',
    colorName: 'Commercial Amber',
    distanceMeters: 25,
    turnDirection: 'LEFT',
    ledEndIndex: 40,
    accessibility: 'Driver Amenities Zone',
    baseRatePerHour: 20,
    rateMultiplier: 0.7,
    minBalanceRequired: 20,
    features: ['Driver Rest Centre Nearby', 'Subsidized Commercial Tariff', 'Drinking Water & Restrooms']
  },
  SUV: {
    lotNumber: 'Lot #15',
    slotId: 'P-01',
    zoneName: 'SUV Bay P-01',
    mockColor: '#3B82F6',
    colorName: 'Cobalt Royal Blue',
    distanceMeters: 45,
    turnDirection: 'RIGHT',
    ledEndIndex: 55,
    accessibility: 'Moderate (Wide Turning Radius)',
    baseRatePerHour: 45,
    rateMultiplier: 1.2,
    minBalanceRequired: 45,
    features: ['High Clearance Bay', 'Middle Distance', 'Wider Parking Slot']
  },
  SEDAN: {
    lotNumber: 'Lot #20',
    slotId: 'P-02',
    zoneName: 'Sedan Bay P-02',
    mockColor: '#06B6D4',
    colorName: 'Executive Cyan',
    distanceMeters: 60,
    turnDirection: 'RIGHT',
    ledEndIndex: 65,
    accessibility: 'Standard Covered Bay',
    baseRatePerHour: 50,
    rateMultiplier: 1.4,
    minBalanceRequired: 50,
    features: ['Far Middle Bay', 'Standard Covered Bay']
  },
  HATCHBACK: {
    lotNumber: 'Lot #30',
    slotId: 'P-03',
    zoneName: 'Hatchback Bay P-03',
    mockColor: '#EC4899',
    colorName: 'Vibrant Coral Pink',
    distanceMeters: 80,
    turnDirection: 'RIGHT',
    ledEndIndex: 74,
    accessibility: 'Low (Walking Distance)',
    baseRatePerHour: 25,
    rateMultiplier: 0.8,
    minBalanceRequired: 25,
    features: ['Far End Bay', 'Economic Budget Rate', 'Compact Bay']
  }
};

// -------------------------------------------------------------
// 4. PARKING LOTS & ACTIVE SESSIONS STATE
// -------------------------------------------------------------
const parkingLots = {
  'P-VIP': { id: 'P-VIP', lotNumber: 'Lot #01', zone: 'LUXURY', status: 'AVAILABLE', mockColor: '#A855F7', allocatedToUid: null, assignedColor: '#A855F7', distance: 0, posture: 'EMPTY' },
  'P-EV': { id: 'P-EV', lotNumber: 'Lot #05', zone: 'EV', status: 'AVAILABLE', mockColor: '#10B981', allocatedToUid: null, assignedColor: '#10B981', distance: 0, posture: 'EMPTY' },
  'P-COMM': { id: 'P-COMM', lotNumber: 'Lot #10', zone: 'COMMERCIAL', status: 'AVAILABLE', mockColor: '#F59E0B', allocatedToUid: null, assignedColor: '#F59E0B', distance: 0, posture: 'EMPTY' },
  'P-01': { id: 'P-01', lotNumber: 'Lot #15', zone: 'SUV', status: 'AVAILABLE', mockColor: '#3B82F6', allocatedToUid: null, assignedColor: '#3B82F6', distance: 0, posture: 'EMPTY' },
  'P-02': { id: 'P-02', lotNumber: 'Lot #20', zone: 'SEDAN', status: 'AVAILABLE', mockColor: '#06B6D4', allocatedToUid: null, assignedColor: '#06B6D4', distance: 0, posture: 'EMPTY' },
  'P-03': { id: 'P-03', lotNumber: 'Lot #30', zone: 'HATCHBACK', status: 'AVAILABLE', mockColor: '#EC4899', allocatedToUid: null, assignedColor: '#EC4899', distance: 0, posture: 'EMPTY' },
};

// Active parking sessions (indexed by slot ID)
let activeSessions = {};

// Customer-facing bay dataset for the consumer website
let customerSlots = [
  // Luxury VIP Bays (Level 1 - Front Executive Lounge)
  { id: 'VIP-01', category: 'Luxury', distance: 15, accessibility: 'Ultra High', ratePerHour: 120, status: 'available', level: 'L1', assignedTo: null, colorCode: null, rgbLane: 'Lane-A' },
  { id: 'VIP-02', category: 'Luxury', distance: 20, accessibility: 'Ultra High', ratePerHour: 120, status: 'occupied', level: 'L1', assignedTo: { plate: 'TN-01-VIP-007', model: 'Rolls-Royce Ghost', cardId: 'CMRL-PK-9042-8821', timeParked: '2h 15m' }, colorCode: '#d4af37', rgbLane: 'Lane-A' },
  { id: 'VIP-03', category: 'Luxury', distance: 25, accessibility: 'Ultra High', ratePerHour: 120, status: 'available', level: 'L1', assignedTo: null, colorCode: null, rgbLane: 'Lane-A' },
  { id: 'VIP-04', category: 'Luxury', distance: 30, accessibility: 'Ultra High', ratePerHour: 120, status: 'reserved', level: 'L1', assignedTo: { plate: 'TN-09-LX-4411', model: 'BMW 7 Series' }, colorCode: '#ffd700', rgbLane: 'Lane-A' },

  // Sedan Bays (Level 1 - Near Entry Gate)
  { id: 'S-01', category: 'Sedan', distance: 40, accessibility: 'High', ratePerHour: 60, status: 'available', level: 'L1', assignedTo: null, colorCode: null, rgbLane: 'Lane-B' },
  { id: 'S-02', category: 'Sedan', distance: 45, accessibility: 'High', ratePerHour: 60, status: 'occupied', level: 'L1', assignedTo: { plate: 'TN-07-CS-2024', model: 'Honda City', cardId: 'CMRL-PK-3319-1044', timeParked: '1h 10m' }, colorCode: '#00f0ff', rgbLane: 'Lane-B' },
  { id: 'S-03', category: 'Sedan', distance: 50, accessibility: 'High', ratePerHour: 60, status: 'available', level: 'L1', assignedTo: null, colorCode: null, rgbLane: 'Lane-B' },
  { id: 'S-04', category: 'Sedan', distance: 55, accessibility: 'High', ratePerHour: 60, status: 'available', level: 'L1', assignedTo: null, colorCode: null, rgbLane: 'Lane-B' },
  { id: 'S-05', category: 'Sedan', distance: 60, accessibility: 'High', ratePerHour: 60, status: 'reserved', level: 'L1', assignedTo: null, colorCode: null, rgbLane: 'Lane-B' },
  { id: 'S-06', category: 'Sedan', distance: 65, accessibility: 'High', ratePerHour: 60, status: 'available', level: 'L1', assignedTo: null, colorCode: null, rgbLane: 'Lane-B' },

  // SUV Bays (Level 2 - Mid Distance)
  { id: 'SUV-01', category: 'SUV', distance: 80, accessibility: 'Moderate', ratePerHour: 50, status: 'available', level: 'L2', assignedTo: null, colorCode: null, rgbLane: 'Lane-C' },
  { id: 'SUV-02', category: 'SUV', distance: 85, accessibility: 'Moderate', ratePerHour: 50, status: 'occupied', level: 'L2', assignedTo: { plate: 'TN-10-AZ-9988', model: 'Mahindra XUV700', cardId: 'CMRL-PK-7741-2099', timeParked: '45m' }, colorCode: '#a855f7', rgbLane: 'Lane-C' },
  { id: 'SUV-03', category: 'SUV', distance: 90, accessibility: 'Moderate', ratePerHour: 50, status: 'available', level: 'L2', assignedTo: null, colorCode: null, rgbLane: 'Lane-C' },
  { id: 'SUV-04', category: 'SUV', distance: 95, accessibility: 'Moderate', ratePerHour: 50, status: 'available', level: 'L2', assignedTo: null, colorCode: null, rgbLane: 'Lane-C' },
  { id: 'SUV-05', category: 'SUV', distance: 100, accessibility: 'Moderate', ratePerHour: 50, status: 'available', level: 'L2', assignedTo: null, colorCode: null, rgbLane: 'Lane-C' },
  { id: 'SUV-06', category: 'SUV', distance: 105, accessibility: 'Moderate', ratePerHour: 50, status: 'available', level: 'L2', assignedTo: null, colorCode: null, rgbLane: 'Lane-C' },

  // Hatchback Bays (Level 3 - Further Distance)
  { id: 'H-01', category: 'Hatchback', distance: 140, accessibility: 'Normal', ratePerHour: 35, status: 'available', level: 'L3', assignedTo: null, colorCode: null, rgbLane: 'Lane-D' },
  { id: 'H-02', category: 'Hatchback', distance: 145, accessibility: 'Normal', ratePerHour: 35, status: 'occupied', level: 'L3', assignedTo: { plate: 'TN-05-BX-1122', model: 'Maruti Swift', cardId: 'CMRL-PK-5512-8801', timeParked: '3h 20m' }, colorCode: '#3b82f6', rgbLane: 'Lane-D' },
  { id: 'H-03', category: 'Hatchback', distance: 150, accessibility: 'Normal', ratePerHour: 35, status: 'available', level: 'L3', assignedTo: null, colorCode: null, rgbLane: 'Lane-D' },
  { id: 'H-04', category: 'Hatchback', distance: 155, accessibility: 'Normal', ratePerHour: 35, status: 'available', level: 'L3', assignedTo: null, colorCode: null, rgbLane: 'Lane-D' },
  { id: 'H-05', category: 'Hatchback', distance: 160, accessibility: 'Normal', ratePerHour: 35, status: 'available', level: 'L3', assignedTo: null, colorCode: null, rgbLane: 'Lane-D' },

  // EV Bays (Shared with Hatchback Wing - Next to 60kW DC Fast Chargers)
  { id: 'EV-01', category: 'EV', distance: 130, accessibility: 'Dedicated Charger', ratePerHour: 45, status: 'available', level: 'L3', assignedTo: null, colorCode: null, rgbLane: 'Lane-E', chargerStatus: 'Available 60kW' },
  { id: 'EV-02', category: 'EV', distance: 135, accessibility: 'Dedicated Charger', ratePerHour: 45, status: 'occupied', level: 'L3', assignedTo: { plate: 'TN-02-EV-4400', model: 'Tata Nexon EV', cardId: 'CMRL-PK-8812-4411', timeParked: '1h 05m' }, colorCode: '#10b981', rgbLane: 'Lane-E', chargerStatus: 'Charging (72%)' },
  { id: 'EV-03', category: 'EV', distance: 138, accessibility: 'Dedicated Charger', ratePerHour: 45, status: 'available', level: 'L3', assignedTo: null, colorCode: null, rgbLane: 'Lane-E', chargerStatus: 'Available 60kW' },

  // Yellow Board / Commercial Bays
  { id: 'COM-01', category: 'Commercial', distance: 165, accessibility: 'Rest Lounge Access', ratePerHour: 30, status: 'available', level: 'L3', assignedTo: null, colorCode: null, rgbLane: 'Lane-F', amenity: 'Driver Cafeteria & Rest Suite' },
  { id: 'COM-02', category: 'Commercial', distance: 170, accessibility: 'Rest Lounge Access', ratePerHour: 30, status: 'occupied', level: 'L3', assignedTo: { plate: 'TN-01-T-8877', model: 'Maruti Tour S', cardId: 'CMRL-PK-1100-3344', timeParked: '2h 50m' }, colorCode: '#eab308', rgbLane: 'Lane-F', amenity: 'Driver Cafeteria & Rest Suite' },
  { id: 'COM-03', category: 'Commercial', distance: 175, accessibility: 'Rest Lounge Access', ratePerHour: 30, status: 'available', level: 'L3', assignedTo: null, colorCode: null, rgbLane: 'Lane-F', amenity: 'Driver Cafeteria & Rest Suite' }
];

let systemState = {
  slots: customerSlots,
  gate: {
    isOpen: false,
    esp32CamStatus: 'Online - 1080p 30fps',
    lastDetected: null,
    activeRouteGuidance: null
  },
  hardwareTelemetry: {
    irSensors: { IR1: false, IR2: false, IR3: false },
    activeRgbStrip: { color: null, activeSection: null },
    ultrasonicSensor: { distanceCm: 25, posture: 'Properly Aligned' },
    lcdDisplay: {
      line1: 'AURA SMART PARK ',
      line2: 'SYSTEM READY 2026',
      isActive: false,
      timerSeconds: 0
    }
  },
  alerts: []
};

// Palette of vivid colors to uniquely identify each car
const UNIQUE_CAR_COLORS = [
  '#FF0055', // Neon Pink
  '#00E5FF', // Cyan Glow
  '#FFB300', // Amber Gold
  '#7C4DFF', // Deep Purple
  '#00E676', // Emerald Green
  '#FF3D00'  // Fiery Orange
];
let colorIndex = 0;
const getNextUniqueColor = () => {
  const color = UNIQUE_CAR_COLORS[colorIndex % UNIQUE_CAR_COLORS.length];
  colorIndex++;
  return color;
};

// -------------------------------------------------------------
// 5. SERIAL COM PORT MANAGER
// Pure USB Serial control - NO WiFi!
// -------------------------------------------------------------
let serialPort = null;
let serialParser = null;
let currentComPort = process.env.COM_PORT || 'COM5';
let isSerialConnected = false;

function sendToSerial(cmdObj) {
  const line = JSON.stringify(cmdObj) + '\n';
  console.log('[COM OUT -> ESP32]:', line.trim());
  if (serialPort && serialPort.isOpen) {
    serialPort.write(line, (err) => {
      if (err) console.error('Serial write error:', err.message);
    });
  } else {
    console.warn(`⚠️ [COM PORT CLOSED]: Cannot send to ESP32 on ${currentComPort}. Port is closed or disconnected.`);
    broadcast('SERIAL_STATUS', { port: currentComPort, connected: false, message: 'Port closed. Connect COM port in dashboard.' });
  }
}

function disconnectSerialPort() {
  return new Promise((resolve) => {
    if (serialPort && serialPort.isOpen) {
      serialPort.close((err) => {
        isSerialConnected = false;
        broadcast('SERIAL_STATUS', { port: currentComPort, connected: false, message: 'Disconnected' });
        resolve(true);
      });
    } else {
      isSerialConnected = false;
      broadcast('SERIAL_STATUS', { port: currentComPort, connected: false, message: 'Disconnected' });
      resolve(true);
    }
  });
}

async function initSerialPort(portName) {
  if (!SerialPort) {
    console.warn('[Serial] SerialPort not available — running in cloud/mock mode.');
    isSerialConnected = false;
    return;
  }

  if (serialPort && serialPort.isOpen) {
    await disconnectSerialPort();
  }

  currentComPort = portName || currentComPort;
  console.log(`Connecting to Serial COM Port: ${currentComPort} at 115200 baud...`);

  try {
    serialPort = new SerialPort({
      path: currentComPort,
      baudRate: 115200,
      autoOpen: false
    });

    serialParser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    serialPort.open((err) => {
      if (err) {
        console.warn(`Could not open ${currentComPort} (${err.message}). System is in STANDBY/MOCK mode.`);
        isSerialConnected = false;
        broadcast('SERIAL_STATUS', { port: currentComPort, connected: false, message: err.message });
        return;
      }

      console.log(`✓ Serial COM Port ${currentComPort} OPEN and listening!`);
      isSerialConnected = true;
      broadcast('SERIAL_STATUS', { port: currentComPort, connected: true, message: 'Connected' });
    });

    serialParser.on('data', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      console.log(`[COM IN]: ${trimmed}`);

      try {
        const eventData = JSON.parse(trimmed);
        handleHardwareEvent(eventData);
      } catch (e) {
        // Raw log from firmware
        // console.log(`[RAW SERIAL LOG]: ${trimmed}`);
      }
    });

    serialPort.on('close', () => {
      console.warn(`Serial port ${currentComPort} closed.`);
      isSerialConnected = false;
      broadcast('SERIAL_STATUS', { port: currentComPort, connected: false, message: 'Port closed' });
    });

    serialPort.on('error', (err) => {
      console.error(`Serial port error on ${currentComPort}:`, err.message);
      isSerialConnected = false;
    });

  } catch (err) {
    console.error('Fatal Serial Port Error:', err.message);
    isSerialConnected = false;
  }
}

let latestTelemetry = {
  ir: { pin: 21, detected: false, val: 1, lastTrigger: null },
  us1: { slot: 'P-01', dist: 999, posture: 'EMPTY', trigPin: 13, echoPin: 12 },
  us2: { slot: 'P-02', dist: 999, posture: 'EMPTY', trigPin: 14, echoPin: 27 },
  rfid: { lastUid: null, lastTapTime: null, holderName: null, slot: null }
};

// Auto-start serial connection
initSerialPort(currentComPort);

// -------------------------------------------------------------
// 6. HARDWARE EVENT HANDLER
// Processes messages from ESP32 via Serial
// -------------------------------------------------------------
function handleHardwareEvent(data) {
  broadcast('HARDWARE_EVENT', data);

  // 1. CAR ARRIVES AT ENTRANCE GATE (IR Sensor at GPIO 21)
  if (data.event === 'GATE_ARRIVAL') {
    latestTelemetry.ir = { pin: 21, detected: true, val: 0, lastTrigger: new Date().toLocaleTimeString() };
    systemState.hardwareTelemetry.irSensors = { IR1: true, IR2: false, IR3: false };
    console.log('🚗 Car arrived at Entry Gate (IR GPIO 21 triggered).');
    broadcast('GATE_ARRIVAL', { status: 'VEHICLE_PRESENT', pin: 21, val: 0, message: 'Vehicle waiting at entrance gate (GPIO 21)' });
    broadcast('HARDWARE_UPDATE', systemState.hardwareTelemetry);
  }

  if (data.event === 'GATE_CLEAR') {
    latestTelemetry.ir.detected = false;
    latestTelemetry.ir.val = 1;
    systemState.hardwareTelemetry.irSensors = { IR1: false, IR2: false, IR3: false };
    broadcast('GATE_CLEAR', { status: 'GATE_CLEAR', pin: 21, val: 1, message: 'Gate clear' });
    broadcast('HARDWARE_UPDATE', systemState.hardwareTelemetry);
  }

  // 2. LIVE CONTINUOUS TELEMETRY STREAM
  if (data.event === 'TELEMETRY') {
    if (data.ir) {
      latestTelemetry.ir.detected = Boolean(data.ir.detected);
      latestTelemetry.ir.val = data.ir.val;
      if (data.ir.detected) latestTelemetry.ir.lastTrigger = new Date().toLocaleTimeString();
      systemState.hardwareTelemetry.irSensors.IR1 = Boolean(data.ir.detected);
    }
    if (data.us1 && data.us1.dist !== undefined) {
      const d1 = parseInt(data.us1.dist, 10);
      latestTelemetry.us1.dist = d1;
      systemState.hardwareTelemetry.ultrasonicSensor.distanceCm = d1;
      handleUltrasonicUpdate('P-01', d1);
    }
    if (data.us2 && data.us2.dist !== undefined) {
      const d2 = parseInt(data.us2.dist, 10);
      latestTelemetry.us2.dist = d2;
      handleUltrasonicUpdate('P-02', d2);
    }
    broadcast('TELEMETRY', latestTelemetry);
    broadcast('HARDWARE_UPDATE', systemState.hardwareTelemetry);
  }

  // 3. RFID TAPPED AT GATE
  if (data.event === 'GATE_RFID') {
    latestTelemetry.rfid = { lastUid: data.uid, lastTapTime: new Date().toLocaleTimeString(), location: 'GATE' };
    handleGateRfidTap(data.uid);
  }

  // 4. RFID TAPPED AT PARKING LOT
  if (data.event === 'SLOT_RFID') {
    latestTelemetry.rfid = { lastUid: data.uid, lastTapTime: new Date().toLocaleTimeString(), location: data.slot };
    handleSlotRfidTap(data.slot, data.uid);
  }

  // 5. ULTRASONIC SENSOR DISTANCE
  if (data.event === 'ULTRASONIC') {
    const d = parseInt(data.dist, 10);
    if (data.slot === 'P-01') latestTelemetry.us1.dist = d;
    if (data.slot === 'P-02') latestTelemetry.us2.dist = d;
    handleUltrasonicUpdate(data.slot, d);
  }
}

// -------------------------------------------------------------
// 7. GATE RFID TAP LOGIC
// Checks balance, membership, allocates slot & triggers LED route
// -------------------------------------------------------------
function handleGateRfidTap(uid, requestedCategory = null) {
  console.log(`💳 RFID Tapped at Gate: ${uid}`);
  let card = rfidCards.find(c => c.uid.toUpperCase() === uid.toUpperCase());

  // If card is not in database, alert admin to issue a new card
  if (!card) {
    console.log(`Unregistered RFID tapped: ${uid}`);
    broadcast('UNREGISTERED_CARD', { uid, message: 'Card not registered. Admin issuance required.' });
    sendToSerial({ cmd: 'GATE_SERVO', action: 'CLOSE' });
    sendToSerial({ cmd: 'LCD_PRINT', line1: 'CARD NOT FOUND', line2: 'SEE GATE ADMIN' });
    return;
  }

  // Determine category
  const category = requestedCategory || card.category || 'SEDAN';
  const config = ZONE_CONFIG[category] || ZONE_CONFIG.SEDAN;

  // Check balance
  if (card.balance < config.minBalanceRequired) {
    console.log(`Insufficient balance for ${card.holderName} (Balance: ₹${card.balance}, Required: ₹${config.minBalanceRequired})`);
    broadcast('INSUFFICIENT_BALANCE', {
      uid: card.uid,
      holderName: card.holderName,
      balance: card.balance,
      required: config.minBalanceRequired,
      category: category,
      message: 'Please recharge card via Razorpay to proceed'
    });
    sendToSerial({ cmd: 'LCD_PRINT', line1: 'LOW BALANCE', line2: `Bal: Rs ${card.balance}` });
    return;
  }

  // Find suitable parking slot
  let allocatedSlotId = null;
  if (category === 'PREMIUM' && parkingLots['P-VIP'].status === 'AVAILABLE') {
    allocatedSlotId = 'P-VIP';
  } else if ((category === 'HATCHBACK' || category === 'COMMERCIAL') && parkingLots['P-02'].status === 'AVAILABLE') {
    allocatedSlotId = 'P-02';
  } else if (category === 'EV' && parkingLots['P-EV'] && parkingLots['P-EV'].status === 'AVAILABLE') {
    allocatedSlotId = 'P-EV';
  } else if (parkingLots['P-01'].status === 'AVAILABLE') {
    allocatedSlotId = 'P-01';
  } else {
    // Fallback to any available slot
    allocatedSlotId = Object.keys(parkingLots).find(s => parkingLots[s].status === 'AVAILABLE');
  }

  if (!allocatedSlotId) {
    broadcast('PARKING_FULL', { message: 'All parking bays are currently occupied!' });
    sendToSerial({ cmd: 'LCD_PRINT', line1: 'PARKING FULL', line2: 'TRY LATER' });
    return;
  }

  // Generate unique vehicle guidance color
  const assignedColor = getNextUniqueColor();

  // Update Slot
  parkingLots[allocatedSlotId].status = 'RESERVED';
  parkingLots[allocatedSlotId].allocatedToUid = card.uid;
  parkingLots[allocatedSlotId].assignedColor = assignedColor;

  // Open Gate & Light Route
  sendToSerial({ cmd: 'GATE_SERVO', action: 'OPEN' });
  sendToSerial({ 
    cmd: 'ROUTE_LED', 
    color: assignedColor, 
    slot: allocatedSlotId,
    turn: config.turnDirection || 'RIGHT',
    ledEnd: config.ledEndIndex || 74,
    distance: config.distanceMeters || 45
  });
  sendToSerial({ cmd: 'LCD_PRINT', line1: `${category} (${config.turnDirection || 'RIGHT'})`, line2: `FOLLOW ${allocatedSlotId}` });

  console.log(`✓ Allocated ${allocatedSlotId} to ${card.holderName} with color ${assignedColor} [Turn: ${config.turnDirection}, End: ${config.ledEndIndex}]`);

  broadcast('PARKING_ALLOCATED', {
    uid: card.uid,
    holderName: card.holderName,
    plate: card.vehiclePlate,
    category: category,
    allocatedSlot: allocatedSlotId,
    assignedColor: assignedColor,
    fareConfig: config,
    zoneInfo: config,
    message: `Allocated Slot ${allocatedSlotId}. Follow the ${assignedColor} LED path!`
  });
}

// -------------------------------------------------------------
// 8. PARKING LOT RFID TAP & WRONG SLOT ALERT
// Verifies correct lot & starts parking timer
// -------------------------------------------------------------
function handleSlotRfidTap(slotId, tappedUid) {
  console.log(`💳 RFID Tapped at Parking Slot ${slotId}: ${tappedUid}`);
  const slot = parkingLots[slotId];

  if (!slot) {
    console.error(`Unknown slot ${slotId}`);
    return;
  }

  // Check if this card was actually allocated to this slot!
  if (!slot.allocatedToUid || slot.allocatedToUid.toUpperCase() !== tappedUid.toUpperCase()) {
    // ⚠️ WRONG SLOT ALERT!
    console.warn(`🚨 WRONG PARKING SLOT DETECTED! Card ${tappedUid} tapped at ${slotId}, expected ${slot.allocatedToUid}`);
    
    broadcast('WRONG_SLOT_ALERT', {
      slot: slotId,
      tappedUid: tappedUid,
      expectedUid: slot.allocatedToUid,
      severity: 'CRITICAL',
      message: `ALERT: Vehicle tapped in WRONG bay (${slotId})! Please park in your allocated spot.`
    });

    sendToSerial({ cmd: 'BUZZER_ALERT', slot: slotId });
    sendToSerial({ cmd: 'LCD_PRINT', line1: 'WRONG SLOT!', line2: 'PARK IN CORRECT BAY' });
    return;
  }

  // Correct slot confirmed!
  console.log(`✓ Correct slot ${slotId} confirmed for ${tappedUid}`);
  slot.status = 'CONFIRMED_PARKED';

  // Start Session Timer
  startParkingSession(slotId, tappedUid);

  broadcast('SLOT_CONFIRMED', {
    slot: slotId,
    uid: tappedUid,
    message: `Correct slot confirmed! Parking session started for ${slotId}.`
  });
}

// -------------------------------------------------------------
// 9. ULTRASONIC SENSOR & POSTURE GUIDANCE
// Distances:
//   < 5cm: TOO CLOSE / RISK
//   5-15cm: PERFECT POSTURE
//   16-25cm: IMPROPER / ADJUST
//   > 25cm: EMPTY / CAR LEFT
// -------------------------------------------------------------
function handleUltrasonicUpdate(slotId, distanceCm) {
  const slot = parkingLots[slotId];
  if (!slot) return;

  slot.distance = distanceCm;
  let posture = 'EMPTY';

  if (distanceCm > 0 && distanceCm < 5) {
    posture = 'TOO_CLOSE';
  } else if (distanceCm >= 5 && distanceCm <= 15) {
    posture = 'PERFECT_POSTURE';
  } else if (distanceCm > 15 && distanceCm <= 25) {
    posture = 'IMPROPER_ALIGNMENT';
  } else {
    posture = 'EMPTY';
  }

  if (slot.posture !== posture) {
    slot.posture = posture;
    console.log(`[POSTURE] Slot ${slotId}: ${distanceCm}cm -> ${posture}`);

    // Map hardware bay to consumer website bay
    const mappedCustId = slotId === 'P-01' ? 'SUV-01' : (slotId === 'P-02' ? 'S-01' : null);
    if (mappedCustId) {
      const cSlot = customerSlots.find(s => s.id === mappedCustId);
      if (cSlot) {
        cSlot.status = posture === 'EMPTY' ? 'available' : 'occupied';
      }
    }

    broadcast('POSTURE_UPDATE', {
      slot: slotId,
      distance: distanceCm,
      posture: posture,
      status: posture === 'EMPTY' ? 'AVAILABLE' : 'OCCUPIED'
    });

    broadcast('INIT_STATE', {
      slots: customerSlots,
      systemState
    });

    // Check if car left the parking lot
    if (posture === 'EMPTY' && activeSessions[slotId]) {
      // Car has left the bay! Stop session and charge fare.
      stopParkingSession(slotId);
    }
  }
}

// -------------------------------------------------------------
// 10. SESSION TIMER & DYNAMIC FARE CHARGING
// -------------------------------------------------------------
function startParkingSession(slotId, uid) {
  if (activeSessions[slotId]) return;

  const card = rfidCards.find(c => c.uid.toUpperCase() === uid.toUpperCase());
  const category = (card && card.category) || parkingLots[slotId].zone || 'SEDAN';
  const config = ZONE_CONFIG[category] || ZONE_CONFIG.SEDAN;

  activeSessions[slotId] = {
    slotId,
    uid,
    holderName: card ? card.holderName : 'Guest',
    startTime: Date.now(),
    category: category,
    ratePerHour: config.baseRatePerHour,
    ratePerSec: (config.baseRatePerHour / 3600) * 10, // Accelerated for live demo
    timerHandle: null
  };

  // Live timer tick every second
  activeSessions[slotId].timerHandle = setInterval(() => {
    const session = activeSessions[slotId];
    if (!session) return;

    const elapsedSeconds = Math.floor((Date.now() - session.startTime) / 1000);
    const dynamicFare = Math.max(10, Math.floor(elapsedSeconds * 1.5)); // Demo calculation

    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
    const timerFormatted = `${minutes}:${seconds}`;

    // Send to 16x2 LCD via Serial
    sendToSerial({
      cmd: 'LCD_PRINT',
      line1: `${slotId} | T: ${timerFormatted}`,
      line2: `Fare: Rs ${dynamicFare}`
    });

    broadcast('TIMER_TICK', {
      slotId,
      elapsedSeconds,
      timerFormatted,
      dynamicFare
    });
  }, 1000);

  console.log(`✓ Parking session started for ${slotId} (${card ? card.holderName : uid})`);
}

function stopParkingSession(slotId) {
  const session = activeSessions[slotId];
  if (!session) return;

  clearInterval(session.timerHandle);
  const elapsedSeconds = Math.floor((Date.now() - session.startTime) / 1000);
  const finalFare = Math.max(15, Math.floor(elapsedSeconds * 1.5));

  // Deduct from card balance
  const card = rfidCards.find(c => c.uid.toUpperCase() === session.uid.toUpperCase());
  if (card) {
    card.balance = Math.max(0, card.balance - finalFare);
    saveCardsData();
    console.log(`✓ Deducted ₹${finalFare} from ${card.holderName}. Remaining Balance: ₹${card.balance}`);
  }

  // Reset slot state
  parkingLots[slotId].status = 'AVAILABLE';
  parkingLots[slotId].allocatedToUid = null;
  parkingLots[slotId].assignedColor = null;
  parkingLots[slotId].posture = 'EMPTY';

  delete activeSessions[slotId];

  // Clear LEDs and show exit receipt on LCD
  sendToSerial({ cmd: 'CLEAR_LEDS' });
  sendToSerial({ cmd: 'LCD_PRINT', line1: 'FARE DEDUCTED', line2: `Paid: Rs ${finalFare}` });

  broadcast('SESSION_COMPLETED', {
    slotId,
    uid: session.uid,
    holderName: session.holderName,
    elapsedSeconds,
    finalFare,
    remainingBalance: card ? card.balance : 0,
    message: `Vehicle exited ${slotId}. Total Fare: ₹${finalFare} deducted successfully.`
  });
}

// -------------------------------------------------------------
// 11. GEMINI VISION AI: NUMBER PLATE & CAR CLASSIFICATION
// -------------------------------------------------------------
app.post('/api/upload-cam', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }

  console.log(`[AI SCAN] Image received: ${req.file.filename}`);
  const imagePath = req.file.path;
  
  let detectedColor = 'White';
  let detectedModel = 'Unknown';
  let detectedPlateNumber = 'Unknown';
  let category = 'SEDAN';
  let isCommercial = false;
  let isEV = false;
  
  try {
    const imageBytes = fs.readFileSync(imagePath);
    const candidateModels = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let aiData = null;

    for (const modelName of candidateModels) {
      try {
        console.log(`Analyzing image with Gemini Vision (${modelName})...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                data: imageBytes.toString("base64"),
                mimeType: req.file.mimetype || "image/jpeg",
              }
            },
            `You are an expert car and number plate identifier for an autonomous smart parking system.
            Look closely at the image:
            1. Examine the license plate background color: is it 'Yellow' (commercial), 'Green' (EV), or 'White' (private)?
            2. Read the exact registration number if visible (e.g., 'KA 01 AB 1234').
            3. Identify the car make and model from the vehicle rear/front/badges (e.g., 'Hyundai Creta', 'Tata Nexon', 'Honda City', 'Maruti Swift').
            Respond ONLY with a valid JSON object in this format:
            {"plateColor": "Yellow|Green|White", "plateNumber": "string", "model": "string"}`
          ]
        });

        const rawText = response.text || '';
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          aiData = JSON.parse(match[0]);
          console.log(`✓ Gemini AI (${modelName}) Result:`, aiData);
          break;
        }
      } catch (err) {
        console.warn(`Model ${modelName} attempt failed:`, err.message);
      }
    }

    if (aiData) {
      detectedModel = aiData.model || 'Unknown';
      detectedColor = aiData.plateColor || 'White';
      detectedPlateNumber = aiData.plateNumber || 'Unknown';
    }

  } catch (error) {
    console.error("AI Analysis error, using smart fallback:", error.message);
  } finally {
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }

  // 1. Check plate color rules
  const colorLower = detectedColor.toLowerCase();
  if (colorLower.includes('yellow')) {
    category = 'COMMERCIAL';
    isCommercial = true;
  } else if (colorLower.includes('green')) {
    category = 'EV';
    isEV = true;
  } else {
    // 2. White plate -> Search 3 JSON files (suv.json, hatchback.json, sedan.json)
    const matchesCarModel = (jsonModel, detectedStr) => {
      if (!detectedStr || detectedStr === 'Unknown') return false;
      const jm = jsonModel.toLowerCase().trim();
      const dm = detectedStr.toLowerCase().trim();
      if (jm.includes(dm) || dm.includes(jm)) return true;
      const jmWords = jm.split(/[\s-]+/).filter(w => w.length > 2 && !['maruti', 'suzuki', 'hyundai', 'tata', 'honda', 'toyota', 'mahindra'].includes(w));
      return jmWords.some(w => dm.includes(w));
    };

    // Priority 1: Luxury car check -> allocate closest VIP zone
    if (carData.luxury && carData.luxury.some(m => matchesCarModel(m, detectedModel))) {
      category = 'LUXURY';
    } else if (carData.suv.some(m => matchesCarModel(m, detectedModel))) {
      category = 'SUV';
    } else if (carData.sedan.some(m => matchesCarModel(m, detectedModel))) {
      category = 'SEDAN';
    } else if (carData.hatchback.some(m => matchesCarModel(m, detectedModel))) {
      category = 'HATCHBACK';
    } else {
      category = 'SEDAN';
    }
  }

  const zoneInfo = ZONE_CONFIG[category] || ZONE_CONFIG.SEDAN;

  // Determine target slot & unique route color based on spatial distance
  let targetSlot = 'P-01';
  if (category === 'LUXURY') targetSlot = 'P-VIP';
  else if (category === 'EV') targetSlot = 'P-EV';
  else if (category === 'COMMERCIAL') targetSlot = 'P-COMM';
  else if (category === 'SUV') targetSlot = 'P-01';
  else if (category === 'SEDAN') targetSlot = 'P-02';
  else if (category === 'HATCHBACK') targetSlot = 'P-03';

  const assignedColor = zoneInfo.mockColor || '#00E5FF';

  // Trigger Hardware Route LEDs over COM Port with Turn Direction and dynamic track length!
  sendToSerial({
    cmd: 'ROUTE_LED',
    color: assignedColor,
    slot: targetSlot,
    turn: zoneInfo.turnDirection || 'RIGHT',
    ledEnd: zoneInfo.ledEndIndex || 74,
    distance: zoneInfo.distanceMeters
  });
  sendToSerial({ cmd: 'LCD_PRINT', line1: `${category} (${zoneInfo.lotNumber})`, line2: `FOLLOW ${targetSlot}` });

  const result = {
    plateNumber: detectedPlateNumber,
    plateColor: detectedColor,
    model: detectedModel,
    category: category,
    allocatedSlot: targetSlot,
    lotNumber: zoneInfo.lotNumber,
    assignedColor: assignedColor,
    zoneInfo: zoneInfo,
    message: `Allocated ${zoneInfo.lotNumber} (${targetSlot}) for ${category}`
  };

  console.log('✓ Final Vehicle Classification:', result);
  broadcast('CAR_CLASSIFIED', result);

  res.json(result);
});

// Quick Simulation & Route Trigger API for Specific Vehicle Category
app.post('/api/simulate-category', (req, res) => {
  const { category } = req.body;
  const cat = (category || 'SEDAN').toUpperCase();
  const zoneInfo = ZONE_CONFIG[cat] || ZONE_CONFIG.SEDAN;
  const targetSlot = zoneInfo.slotId;
  const assignedColor = zoneInfo.mockColor;

  sendToSerial({
    cmd: 'ROUTE_LED',
    color: assignedColor,
    slot: targetSlot,
    turn: zoneInfo.turnDirection || 'RIGHT',
    ledEnd: zoneInfo.ledEndIndex || 74,
    distance: zoneInfo.distanceMeters
  });
  sendToSerial({ cmd: 'LCD_PRINT', line1: `${cat} (${zoneInfo.lotNumber})`, line2: `FOLLOW ${targetSlot}` });

  const result = {
    plateNumber: `KA-01-${cat.substring(0,3)}-${Math.floor(1000 + Math.random() * 9000)}`,
    plateColor: cat === 'EV' ? 'Green' : (cat === 'COMMERCIAL' ? 'Yellow' : 'White'),
    model: cat === 'LUXURY' ? 'Mercedes S-Class' : (cat === 'EV' ? 'Tata Nexon EV' : (cat === 'SUV' ? 'Hyundai Creta' : (cat === 'HATCHBACK' ? 'Maruti Swift' : 'Honda City'))),
    category: cat,
    allocatedSlot: targetSlot,
    lotNumber: zoneInfo.lotNumber,
    assignedColor: assignedColor,
    zoneInfo: zoneInfo,
    message: `Allocated ${zoneInfo.lotNumber} (${targetSlot}) with Mock Color ${zoneInfo.colorName} (${assignedColor})`
  };

  broadcast('CAR_CLASSIFIED', result);
  res.json({ success: true, result });
});

// -------------------------------------------------------------
// 12. REST APIS FOR DASHBOARDS & HARDWARE SIMULATION
// -------------------------------------------------------------

// System Health & COM Port Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    comPort: currentComPort,
    serialConnected: isSerialConnected,
    wsClients: wss.clients.size,
    totalCards: rfidCards.length,
    activeSessions: Object.keys(activeSessions).length,
    parkingLots: parkingLots,
    telemetry: latestTelemetry,
    timestamp: new Date().toISOString()
  });
});

// List all available COM Ports
app.get('/api/com-ports', async (req, res) => {
  try {
    const ports = SerialPort ? await SerialPort.list() : [];
    res.json({
      activePort: currentComPort,
      connected: isSerialConnected,
      availablePorts: ports
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connect to a specific COM Port
app.post('/api/com-ports/connect', async (req, res) => {
  const { port } = req.body;
  if (!port) return res.status(400).json({ error: 'Port name required (e.g. COM5)' });
  await initSerialPort(port);
  res.json({ message: `Initiating connection to ${port}`, port });
});

// Disconnect active COM Port (free up port for flashing in Arduino IDE)
app.post('/api/com-ports/disconnect', async (req, res) => {
  await disconnectSerialPort();
  res.json({ success: true, message: `Disconnected ${currentComPort}` });
});

// Live LED Strip Configuration & Diagnostics Endpoint
app.post('/api/led/control', (req, res) => {
  const { mode, color, brightness, turn, end } = req.body;
  
  if (brightness !== undefined) {
    sendToSerial({ cmd: 'SET_BRIGHTNESS', val: parseInt(brightness, 10) });
  }

  if (mode === 'ROUTE') {
    sendToSerial({
      cmd: 'ROUTE_LED',
      color: color || '#00E5FF',
      slot: 'P-01',
      turn: turn || 'RIGHT',
      ledEnd: end || 55
    });
  } else if (mode) {
    sendToSerial({
      cmd: 'SET_LED_TEST',
      mode: mode,
      color: color || '#FFFFFF'
    });
  }

  res.json({ success: true, message: `Dispatched LED command: ${mode || 'BRIGHTNESS'}` });
});

// Live IR Sensor Polarity & Calibration Endpoint
app.post('/api/sensor/ir-polarity', (req, res) => {
  const { activeLow } = req.body;
  const isLow = Boolean(activeLow);
  sendToSerial({ cmd: 'SET_IR_POLARITY', activeLow: isLow });
  if (latestTelemetry.ir) {
    latestTelemetry.ir.activeLow = isLow;
  }
  broadcast('IR_CONFIG_UPDATED', { activeLow: isLow });
  res.json({ success: true, activeLow: isLow, message: `IR polarity set to ${isLow ? 'Active LOW (0=Detected)' : 'Active HIGH (1=Detected)'}` });
});

// List RFID Cards
app.get('/api/cards', (req, res) => {
  res.json(rfidCards);
});

// Razorpay Recharge API for RFID Cards
app.post('/api/cards/recharge', (req, res) => {
  const { uid, amount } = req.body;
  if (!uid || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid UID and amount required' });
  }

  const card = rfidCards.find(c => c.uid.toUpperCase() === uid.toUpperCase());
  if (!card) {
    return res.status(404).json({ error: 'Card not found' });
  }

  card.balance += parseFloat(amount);
  saveCardsData();

  console.log(`✓ Razorpay Recharge: Added ₹${amount} to ${card.holderName} (${card.uid}). New Balance: ₹${card.balance}`);

  broadcast('CARD_RECHARGED', {
    uid: card.uid,
    holderName: card.holderName,
    addedAmount: amount,
    newBalance: card.balance
  });

  res.json({
    success: true,
    message: `Successfully recharged ₹${amount} via Razorpay`,
    card
  });
});

// Issue New RFID Card (Admin Feature)
app.post('/api/cards/create', (req, res) => {
  const { uid, holderName, balance, isPremiumMember, vehiclePlate, vehicleModel, category } = req.body;
  if (!uid || !holderName) {
    return res.status(400).json({ error: 'UID and Holder Name required' });
  }

  const existing = rfidCards.find(c => c.uid.toUpperCase() === uid.toUpperCase());
  if (existing) {
    return res.status(400).json({ error: 'Card with this UID already exists' });
  }

  const cat = (category || 'SEDAN').toUpperCase();
  const zoneInfo = ZONE_CONFIG[cat] || ZONE_CONFIG.SEDAN;

  const newCard = {
    uid: uid.toUpperCase(),
    holderName,
    balance: parseFloat(balance || 100),
    isPremiumMember: Boolean(isPremiumMember),
    vehiclePlate: vehiclePlate || 'Unknown',
    vehicleModel: vehicleModel || 'Standard Vehicle',
    category: cat,
    parkingId: zoneInfo.slotId,
    lotNumber: zoneInfo.lotNumber,
    assignedColor: zoneInfo.mockColor,
    colorName: zoneInfo.colorName
  };

  rfidCards.push(newCard);
  saveCardsData();

  console.log(`✓ Admin issued new RFID card for ${holderName} (${newCard.uid}) with Slot ${newCard.parkingId} (${newCard.assignedColor})`);
  broadcast('CARD_ISSUED', newCard);
  res.json({ success: true, card: newCard });
});

// All Car Models & Allocated Parking ID + Mock Colour Registry
app.get('/api/cars/registry', (req, res) => {
  const modelsCatalog = [
    ...(carData.luxury || []).map(model => ({ model, category: 'LUXURY', parkingId: 'P-VIP', lotNumber: 'Lot #01', assignedColor: '#A855F7', colorName: 'Royal Purple', turn: 'LEFT', distance: '10m' })),
    { model: 'Tata Nexon EV / MG ZS EV / All Electric Vehicles', category: 'EV', parkingId: 'P-EV', lotNumber: 'Lot #05', assignedColor: '#10B981', colorName: 'Electric Green', turn: 'LEFT', distance: '20m' },
    { model: 'Commercial Taxis / Cabs (Yellow Number Plates)', category: 'COMMERCIAL', parkingId: 'P-COMM', lotNumber: 'Lot #10', assignedColor: '#F59E0B', colorName: 'Amber Yellow', turn: 'LEFT', distance: '25m' },
    ...(carData.suv || []).map(model => ({ model, category: 'SUV', parkingId: 'P-01', lotNumber: 'Lot #15', assignedColor: '#3B82F6', colorName: 'Cobalt Royal Blue', turn: 'RIGHT', distance: '45m' })),
    ...(carData.sedan || []).map(model => ({ model, category: 'SEDAN', parkingId: 'P-02', lotNumber: 'Lot #20', assignedColor: '#06B6D4', colorName: 'Executive Cyan', turn: 'RIGHT', distance: '60m' })),
    ...(carData.hatchback || []).map(model => ({ model, category: 'HATCHBACK', parkingId: 'P-03', lotNumber: 'Lot #30', assignedColor: '#EC4899', colorName: 'Coral Pink', turn: 'RIGHT', distance: '80m' }))
  ];

  res.json({
    registeredFleet: rfidCards,
    modelsCatalog,
    zoneConfig: ZONE_CONFIG
  });
});

// Simulate Serial Hardware Events from Frontend / Curl
app.post('/api/simulate-serial', (req, res) => {
  const event = req.body;
  console.log('[SIMULATED HARDWARE EVENT]:', event);
  handleHardwareEvent(event);
  res.json({ success: true, simulated: event });
});

// -------------------------------------------------------------
// CONSUMER WEBSITE REST ENDPOINTS (Vaygo Smart Parking Portal)
// -------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Vaygo Smart Parking Backend', azureReady: true });
});

app.get('/api/slots', (req, res) => {
  res.json(customerSlots);
});

// Dynamic Mock Data Pricing Engine Endpoint
app.get('/api/pricing/dynamic', (req, res) => {
  const total = customerSlots.length || 27;
  const occupied = customerSlots.filter(s => s.status === 'occupied').length;
  const occupancyPercent = Math.round((occupied / total) * 100);

  const now = new Date();
  const currentHour = now.getHours();
  const isPeakHour = (currentHour >= 8 && currentHour <= 11) || (currentHour >= 17 && currentHour <= 20);

  let surgeMultiplier = 1.0;
  let surgeTier = 'STANDARD';
  let surgeLabel = 'Standard Tariff';

  if (occupancyPercent >= 70 || isPeakHour) {
    surgeMultiplier = 1.35;
    surgeTier = 'HIGH_SURGE';
    surgeLabel = isPeakHour ? 'Peak Hour Rush Surge (1.35x)' : 'High Occupancy Surge (1.35x)';
  } else if (occupancyPercent >= 40) {
    surgeMultiplier = 1.15;
    surgeTier = 'MODERATE';
    surgeLabel = 'Moderate Demand Surge (1.15x)';
  } else {
    surgeMultiplier = 1.0;
    surgeTier = 'STANDARD';
    surgeLabel = 'Standard Flat Tariff (1.0x)';
  }

  const baseRates = {
    Luxury: 120,
    Sedan: 60,
    SUV: 50,
    EV: 45,
    Hatchback: 35,
    Commercial: 25
  };

  const dynamicRates = {};
  for (const [cat, base] of Object.entries(baseRates)) {
    dynamicRates[cat] = {
      baseRate: base,
      surgeMultiplier,
      dynamicRate: Math.round(base * surgeMultiplier),
      currency: 'INR'
    };
  }

  res.json({
    success: true,
    timestamp: now.toISOString(),
    occupancyPercent,
    occupiedBays: occupied,
    totalBays: total,
    currentHour,
    isPeakHour,
    surgeTier,
    surgeLabel,
    surgeMultiplier,
    rates: dynamicRates,
    hourlyForecast: [
      { time: '06:00', multiplier: 0.9, demand: 'Off-Peak' },
      { time: '08:00', multiplier: 1.3, demand: 'Morning Rush' },
      { time: '10:00', multiplier: 1.35, demand: 'Peak Demand' },
      { time: '12:00', multiplier: 1.1, demand: 'Standard' },
      { time: '14:00', multiplier: 1.0, demand: 'Standard' },
      { time: '16:00', multiplier: 1.15, demand: 'Moderate' },
      { time: '18:00', multiplier: 1.4, demand: 'Evening Rush' },
      { time: '20:00', multiplier: 1.25, demand: 'Moderate' },
      { time: '22:00', multiplier: 0.95, demand: 'Off-Peak' }
    ]
  });
});

// 1. Razorpay: Create Order API
app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes = {} } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount is required' });
    }

    const amountInPaise = Math.round(numAmount * 100);

    if (razorpayClient) {
      const order = await razorpayClient.orders.create({
        amount: amountInPaise,
        currency,
        receipt: receipt || `rcpt_${Date.now()}`,
        notes: {
          app: 'Vaygo Smart Parking Transit',
          ...notes
        }
      });

      return res.json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: razorpayKeyId,
        isLiveGateway: true
      });
    }

    // Simulation Order Fallback
    const mockOrderId = `order_sim_${Date.now()}`;
    return res.json({
      success: true,
      orderId: mockOrderId,
      amount: amountInPaise,
      currency: currency || 'INR',
      keyId: razorpayKeyId || 'rzp_test_placeholder',
      isLiveGateway: false,
      message: 'Generated simulation order (keys not set in backend/.env).'
    });
  } catch (error) {
    console.error('[Razorpay Order Creation Error]:', error);
    return res.status(500).json({ error: 'Failed to create Razorpay order', details: error.message });
  }
});

// 2. Razorpay: Verify Payment Signature (HMAC SHA-256)
app.post('/api/payment/verify', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ error: 'Missing payment verification details' });
    }

    if (razorpayKeySecret && razorpay_signature) {
      const hmac = crypto.createHmac('sha256', razorpayKeySecret);
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const generatedSignature = hmac.digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payment signature. Verification failed.'
        });
      }
    }

    console.log(`[Razorpay Payment Verified] Payment ID: ${razorpay_payment_id} for Order: ${razorpay_order_id}`);

    return res.json({
      success: true,
      verified: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('[Razorpay Verification Error]:', error);
    return res.status(500).json({ error: 'Failed to verify Razorpay signature', details: error.message });
  }
});

// 3. Google OAuth 2.0 Token Verification
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential ID token' });
    }

    let payload = null;
    try {
      const googleVerifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
      const googleRes = await fetch(googleVerifyUrl);
      if (googleRes.ok) {
        payload = await googleRes.json();
      }
    } catch (e) {
      console.warn("Could not reach Google tokeninfo, using fallback");
    }

    const sub = (payload && payload.sub) || `${Date.now()}`;
    const verifiedUser = {
      id: `usr_goog_${sub.slice(-6)}`,
      name: (payload && payload.name) || req.body.name || 'Google Commuter',
      givenName: (payload && payload.given_name) || (req.body.name ? req.body.name.split(' ')[0] : 'Commuter'),
      familyName: (payload && payload.family_name) || (req.body.name ? req.body.name.split(' ').slice(1).join(' ') : ''),
      email: (payload && payload.email) || req.body.email || 'commuter@gmail.com',
      picture: (payload && payload.picture) || req.body.picture || null,
      googleId: sub,
      emailVerified: true,
      phone: 'Linked via Google',
      isLuxuryMember: false,
      authProvider: 'google',
      activeCard: {
        cardNumber: `VYG-GOOG-${sub.slice(-4)}`,
        balance: 500.0,
        nfcUid: `04:${sub.slice(-2)}:A8:${sub.slice(-4, -2)}`,
        issuedDate: new Date().toISOString().split('T')[0],
        type: 'Smart Transit RFID (Google Linked)'
      },
      vehiclePlate: 'TN 07 BZ 4912',
      vehicleCategory: 'Sedan',
      vehicles: [
        { plate: 'TN 07 BZ 4912', model: 'Honda City', type: 'Sedan', isLuxury: false, tagAttached: true }
      ],
      registeredVehicles: [
        { plate: 'TN 07 BZ 4912', model: 'Honda City', type: 'Sedan', isLuxury: false }
      ],
      parkingHistory: [],
      transactions: [
        {
          id: `txn_g_${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          type: 'Google Account Sign-In',
          amount: 500.0,
          method: 'Welcome Transit Balance',
          status: 'Success'
        }
      ]
    };

    return res.json({
      success: true,
      user: verifiedUser,
      verifiedViaGoogleApi: Boolean(payload)
    });
  } catch (error) {
    console.error('[Google Auth API] Error:', error);
    return res.status(500).json({ error: 'Server error while verifying Google token' });
  }
});

// 4. Gate Classification endpoint (called by Vaygo UI)
app.post('/api/gate/classify', (req, res) => {
  const { plateColor = 'white', carRearQuery = '', wantsPremium = false, isPremiumMember = false, cardBalance = 0 } = req.body;
  const normColor = plateColor.toLowerCase();

  let assignedCategory = 'Sedan';
  let reason = '';

  if (normColor === 'yellow') {
    assignedCategory = 'Commercial';
    reason = 'ESP32Cam Yellow Board identification -> Commercial fleet routing to Hatchback wing with driver rest station.';
  } else if (normColor === 'green') {
    assignedCategory = 'EV';
    reason = 'ESP32Cam Green Board identification -> Electric vehicle routing to 60kW DC charging wing.';
  } else {
    const q = (carRearQuery || '').toLowerCase().trim();
    const isSuv = (carData.suv || []).some(s => `${s}`.toLowerCase().includes(q) || q.includes(`${s}`.toLowerCase()));
    const isHatch = (carData.hatchback || []).some(h => `${h}`.toLowerCase().includes(q) || q.includes(`${h}`.toLowerCase()));
    const isLux = (carData.luxury || []).some(l => `${l}`.toLowerCase().includes(q) || q.includes(`${l}`.toLowerCase()));

    if (isLux || wantsPremium) assignedCategory = 'Luxury';
    else if (isSuv) assignedCategory = 'SUV';
    else if (isHatch) assignedCategory = 'Hatchback';
    else assignedCategory = 'Sedan';

    reason = `ESP32Cam White Board identification -> Matched category: ${assignedCategory}.`;
  }

  const zoneInfo = ZONE_CONFIG[assignedCategory.toUpperCase()] || ZONE_CONFIG.SEDAN;
  sendToSerial({
    cmd: 'ROUTE_LED',
    color: zoneInfo.mockColor,
    slot: zoneInfo.slotId,
    turn: zoneInfo.turnDirection,
    ledEnd: zoneInfo.ledEndIndex,
    distance: zoneInfo.distanceMeters
  });

  systemState.gate.lastDetected = {
    plateColor: normColor,
    category: assignedCategory,
    query: carRearQuery,
    timestamp: new Date().toISOString()
  };

  broadcast('GATE_DETECTION', systemState.gate.lastDetected);
  res.json({ category: assignedCategory, reason, lastDetected: systemState.gate.lastDetected, zoneInfo });
});

// 5. Gate Tap-In endpoint (called by Vaygo UI)
app.post('/api/gate/tap-in', (req, res) => {
  const { cardId, plateNumber, model, category, rgbColor = '#00f0ff' } = req.body;
  
  const targetCategory = category || 'Sedan';
  let slot = customerSlots.find(s => s.category.toLowerCase() === targetCategory.toLowerCase() && s.status === 'available');

  if (!slot) {
    slot = customerSlots.find(s => s.status === 'available');
  }

  if (!slot) {
    return res.status(400).json({ error: 'Parking full! No available slots currently.' });
  }

  slot.status = 'occupied';
  slot.assignedTo = {
    cardId: cardId || 'CMRL-PK-GEN-1001',
    plate: plateNumber || 'TN-07-DEMO-2026',
    model: model || 'Sedan Vehicle',
    entryTime: new Date().toLocaleTimeString(),
    startTime: Date.now()
  };
  slot.colorCode = rgbColor;

  systemState.gate.isOpen = true;
  systemState.hardwareTelemetry.activeRgbStrip = {
    color: rgbColor,
    slotId: slot.id,
    lane: slot.rgbLane
  };
  systemState.hardwareTelemetry.lcdDisplay = {
    line1: `SLOT: ${slot.id} [OCC]`,
    line2: `GUIDE: ${rgbColor}`,
    isActive: true,
    timerSeconds: 0
  };

  // Trigger Hardware LEDs
  const catUpper = (category || 'SEDAN').toUpperCase();
  const zoneInfo = ZONE_CONFIG[catUpper] || ZONE_CONFIG.SEDAN;
  sendToSerial({
    cmd: 'ROUTE_LED',
    color: rgbColor,
    slot: slot.id,
    turn: zoneInfo.turnDirection || 'RIGHT',
    ledEnd: zoneInfo.ledEndIndex || 65,
    distance: zoneInfo.distanceMeters || 50
  });
  sendToSerial({ cmd: 'GATE_SERVO', action: 'OPEN' });
  sendToSerial({ cmd: 'LCD_PRINT', line1: `${slot.id} ALLOCATED`, line2: `FOLLOW ${rgbColor}` });

  broadcast('SLOT_ALLOCATED', { slot, rgbColor });
  broadcast('HARDWARE_UPDATE', systemState.hardwareTelemetry);
  broadcast('INIT_STATE', { slots: customerSlots, systemState });

  setTimeout(() => {
    systemState.gate.isOpen = false;
    sendToSerial({ cmd: 'GATE_SERVO', action: 'CLOSE' });
    broadcast('GATE_STATE', { isOpen: false });
  }, 4000);

  res.json({ success: true, slot, rgbColor, message: `Access granted! Follow ${rgbColor} LED strip to Slot ${slot.id}` });
});

// 6. Slot RFID Verification endpoint
app.post('/api/slot/verify', (req, res) => {
  const { slotId, scannedCardId, ultrasonicDistance = 24 } = req.body;
  const slot = customerSlots.find(s => s.id === slotId);

  if (!slot) {
    return res.status(404).json({ error: 'Slot not found' });
  }

  if (slot.assignedTo && slot.assignedTo.cardId === scannedCardId) {
    systemState.hardwareTelemetry.lcdDisplay = {
      line1: `SLOT: ${slot.id} [VERIFIED]`,
      line2: `PARKED: T:00:00 ₹00`,
      isActive: true,
      timerSeconds: 1
    };
    sendToSerial({ cmd: 'LCD_PRINT', line1: `${slot.id} VERIFIED`, line2: 'PARK CONFIRMED' });
    broadcast('SLOT_VERIFIED', { slotId, status: 'CORRECT' });
    return res.json({ status: 'CORRECT', message: `Confirmed: Car parked correctly in ${slotId}!` });
  } else {
    const alert = {
      id: `ALT_${Date.now()}`,
      time: new Date().toLocaleTimeString(),
      type: 'WRONG_PARKING_ALERT',
      message: `CRITICAL: Car with Card ${scannedCardId} tapped into Wrong Slot (${slotId})!`,
      slotId
    };
    systemState.alerts.unshift(alert);
    sendToSerial({ cmd: 'BUZZER_ALERT', slot: slotId });
    sendToSerial({ cmd: 'LCD_PRINT', line1: 'WRONG SLOT!', line2: 'PARK IN CORRECT BAY' });
    broadcast('ADMIN_ALERT', alert);
    return res.status(400).json({ status: 'WRONG_SLOT', alert });
  }
});

// 7. Ultrasonic sensor posture guidance update
app.post('/api/slot/ultrasonic', (req, res) => {
  const { distanceCm } = req.body;
  let posture = 'Properly Aligned';
  if (distanceCm < 15) posture = 'Too Close! Reverse slightly';
  else if (distanceCm > 50) posture = 'Misaligned! Move forward';

  systemState.hardwareTelemetry.ultrasonicSensor = { distanceCm, posture };
  broadcast('ULTRASONIC_UPDATE', systemState.hardwareTelemetry.ultrasonicSensor);
  res.json(systemState.hardwareTelemetry.ultrasonicSensor);
});

// 8. Slot Exit & Card Auto-Debit endpoint
app.post('/api/slot/exit', (req, res) => {
  const { slotId } = req.body;
  const slot = customerSlots.find(s => s.id === slotId);

  if (!slot || slot.status !== 'occupied') {
    return res.status(400).json({ error: 'Slot is not currently occupied' });
  }

  const durationHours = 2.5;
  const fare = (slot.ratePerHour || 60) * durationHours;

  slot.status = 'available';
  slot.assignedTo = null;
  slot.colorCode = null;

  systemState.hardwareTelemetry.lcdDisplay = {
    line1: `PAID: Rs ${fare.toFixed(2)}`,
    line2: `SLOT ${slotId} FREE`,
    isActive: false,
    timerSeconds: 0
  };

  sendToSerial({ cmd: 'LCD_PRINT', line1: `PAID Rs ${fare.toFixed(0)}`, line2: `${slotId} AVAILABLE` });

  broadcast('SLOT_FREED', { slotId, fare, durationHours });
  broadcast('HARDWARE_UPDATE', systemState.hardwareTelemetry);
  broadcast('INIT_STATE', { slots: customerSlots, systemState });

  res.json({
    success: true,
    slotId,
    duration: `${durationHours} hours`,
    fareDeducted: fare,
    message: `Payment of ₹${fare.toFixed(2)} auto-debited from Smart RFID Card.`
  });
});

// WebSocket Connection
wss.on('connection', (ws) => {
  console.log('✓ New WebSocket client connected to Smart Parking Backend.');
  
  // Send unified initial state to both dashboards and user website
  ws.send(JSON.stringify({
    event: 'INIT_STATE',
    type: 'INIT_STATE',
    data: {
      parkingLots,
      zoneConfig: ZONE_CONFIG,
      cards: rfidCards,
      activeSessions: Object.values(activeSessions),
      serialStatus: { port: currentComPort, connected: isSerialConnected },
      telemetry: latestTelemetry,
      slots: customerSlots,
      systemState
    },
    payload: {
      slots: customerSlots,
      systemState,
      cards: rfidCards,
      parkingLots,
      telemetry: latestTelemetry
    }
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
      // Route commands from frontend to hardware
      if (data.cmd) {
        sendToSerial(data);
      }
    } catch (e) {}
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 SMART PARKING RAW BACKEND RUNNING ON http://localhost:${PORT}`);
  console.log(`🔌 SERIAL COM PORT: ${currentComPort} (Status: ${isSerialConnected ? 'CONNECTED' : 'DISCONNECTED/STANDBY'})`);
  console.log(`🌐 WEBSOCKET SERVER: ws://localhost:${PORT}`);
  console.log(`=======================================================`);
});
