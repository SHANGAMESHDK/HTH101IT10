/*
 * =====================================================================
 * SMART PARKING SYSTEM - PURE SERIAL COM PORT FIRMWARE
 * Controlled 100% via USB COM Port by Node.js Backend & Dashboard
 * NO WI-FI REQUIRED! ZERO NETWORK LATENCY!
 * =====================================================================
 * 
 * Hardware Connections:
 * 1. MFRC522 RFID:
 *    - SS (SDA)  -> GPIO 5
 *    - SCK       -> GPIO 18
 *    - MOSI      -> GPIO 23
 *    - MISO      -> GPIO 19
 *    - RST       -> GPIO 22
 *    - 3.3V & GND
 * 
 * 2. WS2812B NeoPixel RGB LED Strip (75 LEDs):
 *    - DATA      -> GPIO 21
 *    - 5V & GND
 * 
 * 3. Ultrasonic Sensors:
 *    - Slot P-01: TRIG -> GPIO 13, ECHO -> GPIO 12
 *    - Slot P-02: TRIG -> GPIO 14, ECHO -> GPIO 27
 * 
 * 4. IR Sensor (Entrance Gate):
 *    - OUT       -> GPIO 26
 * 
 * 5. Optional 16x2 I2C LCD Display:
 *    - SDA       -> GPIO 32
 *    - SCL       -> GPIO 33
 * =====================================================================
 */

#include <SPI.h>
#include <MFRC522.h>
#include <FastLED.h>
#include <Wire.h>

// -------------------------------------------------------------
// PIN DEFINITIONS
// -------------------------------------------------------------
#define SS_PIN       5
#define RST_PIN      22
MFRC522 rfid(SS_PIN, RST_PIN);

#define IR_PIN       21   // Gate IR Sensor moved to GPIO 21 as requested
#define LED_PIN      26   // WS2812B NeoPixel RGB LED Strip moved to GPIO 26
#define NUM_LEDS     75 
#define BRIGHTNESS   180
#define LED_TYPE     WS2812B
#define COLOR_ORDER  GRB
CRGB leds[NUM_LEDS];

#define TRIG_1       13
#define ECHO_1       12
#define TRIG_2       14
#define ECHO_2       27

// -------------------------------------------------------------
// -------------------------------------------------------------
// STATE VARIABLES
// -------------------------------------------------------------
bool irLastDetected = false;
bool irActiveLow = true; // default: LOW (0) = Object Detected. Configurable live via Dashboard!
unsigned long lastSensorPoll = 0;
const unsigned long SENSOR_POLL_INTERVAL = 120; // ms (Fast LED distance updates on hand motion)
unsigned long lastTelemetrySent = 0;
const unsigned long TELEMETRY_INTERVAL = 500;   // ms (Dashboard telemetry every 0.5s)

// Manual Dashboard Test Hold State (prevents sensors from wiping manual tests immediately)
bool isManualTestActive = false;
unsigned long manualTestTimeout = 0;

int lastDist1 = 999;
int lastDist2 = 999;

// Route Animation State
bool isRoutingActive = false;
unsigned long routingTimeout = 0;
CRGB assignedRouteColor = CRGB::Cyan;
int currentRoutingSlot = 1;
int routingEndLed = 74;          // Shortens dynamically based on distance!
String routingTurn = "RIGHT";    // "RIGHT" (Bays 1-20) vs "LEFT" (Bays 21-40)
unsigned long lastAnimStep = 0;
int animPosition = 20;

// -------------------------------------------------------------
// HELPER: Read Ultrasonic Distance in cm
// -------------------------------------------------------------
long readUltrasonicDistance(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 25000); // 25ms timeout (~4m max)
  if (duration == 0) return 999;
  return duration * 0.034 / 2;
}

// -------------------------------------------------------------
// HELPER: Convert Hex Color String (e.g. "#FF0055") to CRGB
// -------------------------------------------------------------
CRGB parseHexColor(String hexStr) {
  if (hexStr.startsWith("#")) {
    hexStr = hexStr.substring(1);
  }
  long number = strtol(hexStr.c_str(), NULL, 16);
  long r = (number >> 16) & 0xFF;
  long g = (number >> 8) & 0xFF;
  long b = number & 0xFF;
  return CRGB(r, g, b);
}

// -------------------------------------------------------------
// SERIAL COMMAND PROCESSOR (Backend -> ESP32)
// -------------------------------------------------------------
void processIncomingSerialCommand(String json) {
  json.trim();
  if (json.length() == 0) return;

  // 1. ROUTE_LED: Start dynamic route guidance in the vehicle's unique color!
  if (json.indexOf("\"cmd\":\"ROUTE_LED\"") >= 0) {
    int colorStart = json.indexOf("\"color\":\"");
    if (colorStart >= 0) {
      colorStart += 9;
      int colorEnd = json.indexOf("\"", colorStart);
      String hexColor = json.substring(colorStart, colorEnd);
      assignedRouteColor = parseHexColor(hexColor);
    }

    // Parse Left vs Right turn direction
    if (json.indexOf("\"turn\":\"LEFT\"") >= 0) {
      routingTurn = "LEFT";
    } else {
      routingTurn = "RIGHT";
    }

    // Parse dynamic track length (shortens based on distance!)
    int endIdx = json.indexOf("\"ledEnd\":");
    if (endIdx >= 0) {
      routingEndLed = json.substring(endIdx + 9).toInt();
      if (routingEndLed < 22) routingEndLed = 22;
      if (routingEndLed >= NUM_LEDS) routingEndLed = NUM_LEDS - 1;
    } else {
      routingEndLed = (routingTurn == "LEFT") ? 35 : 74;
    }

    if (json.indexOf("\"slot\":\"P-02\"") >= 0) {
      currentRoutingSlot = 2;
    } else {
      currentRoutingSlot = 1;
    }

    isRoutingActive = true;
    routingTimeout = millis() + 15000; // Auto-clear after 15 seconds so sensors are never locked
    animPosition = 22;
    Serial.println("{\"status\":\"ACK\",\"cmd\":\"ROUTE_LED\",\"turn\":\"" + routingTurn + "\",\"end\":" + String(routingEndLed) + "}");
  }

  // 2. CLEAR_LEDS: Guidance completed, clear route
  else if (json.indexOf("\"cmd\":\"CLEAR_LEDS\"") >= 0) {
    isRoutingActive = false;
    // Clear pathway LEDs (20-74)
    for (int i = 20; i < NUM_LEDS; i++) {
      leds[i] = CRGB::Black;
    }
    FastLED.show();
    Serial.println("{\"status\":\"ACK\",\"cmd\":\"CLEAR_LEDS\"}");
  }

  // 3. SET_LED_TEST: Live Hardware Configuration from Dashboard!
  else if (json.indexOf("\"cmd\":\"SET_LED_TEST\"") >= 0) {
    isRoutingActive = false;
    if (json.indexOf("\"mode\":\"ALL_ON\"") >= 0) {
      isManualTestActive = true;
      manualTestTimeout = millis() + 25000; // Hold test glow for 25s
      CRGB testColor = CRGB::White;
      int cIdx = json.indexOf("\"color\":\"");
      if (cIdx >= 0) {
        testColor = parseHexColor(json.substring(cIdx + 9, json.indexOf("\"", cIdx + 9)));
      }
      for (int i = 0; i < NUM_LEDS; i++) leds[i] = testColor;
      FastLED.show();
      Serial.println("{\"status\":\"ACK\",\"cmd\":\"SET_LED_TEST\",\"mode\":\"ALL_ON\"}");
    } else if (json.indexOf("\"mode\":\"ALL_OFF\"") >= 0) {
      isManualTestActive = false;
      FastLED.clear();
      FastLED.show();
      Serial.println("{\"status\":\"ACK\",\"cmd\":\"SET_LED_TEST\",\"mode\":\"ALL_OFF\"}");
    } else if (json.indexOf("\"mode\":\"RAINBOW\"") >= 0) {
      isManualTestActive = true;
      manualTestTimeout = millis() + 25000;
      fill_rainbow(leds, NUM_LEDS, 0, 7);
      FastLED.show();
      Serial.println("{\"status\":\"ACK\",\"cmd\":\"SET_LED_TEST\",\"mode\":\"RAINBOW\"}");
    } else if (json.indexOf("\"mode\":\"SLOT_PREVIEW\"") >= 0) {
      isManualTestActive = false; // Restore sensor-driven one-by-one mode
      FastLED.clear();
      leds[0] = CRGB(0, 40, 0);
      leds[10] = CRGB(0, 40, 0);
      FastLED.show();
      Serial.println("{\"status\":\"ACK\",\"cmd\":\"SET_LED_TEST\",\"mode\":\"SLOT_PREVIEW\"}");
    }
  }

  // 4. SET_BRIGHTNESS: Adjust strip brightness from 10 to 255
  else if (json.indexOf("\"cmd\":\"SET_BRIGHTNESS\"") >= 0) {
    int bIdx = json.indexOf("\"val\":");
    if (bIdx >= 0) {
      int bVal = json.substring(bIdx + 6).toInt();
      if (bVal < 10) bVal = 10;
      if (bVal > 255) bVal = 255;
      FastLED.setBrightness(bVal);
      FastLED.show();
      Serial.println("{\"status\":\"ACK\",\"cmd\":\"SET_BRIGHTNESS\",\"val\":" + String(bVal) + "}");
    }
  }

  // 5. SET_IR_POLARITY: Live Invert IR Sensor Polarity (solves 'IR always stays on' instantly)
  else if (json.indexOf("\"cmd\":\"SET_IR_POLARITY\"") >= 0) {
    if (json.indexOf("\"activeLow\":false") >= 0) {
      irActiveLow = false;
    } else {
      irActiveLow = true;
    }
    Serial.println("{\"status\":\"ACK\",\"cmd\":\"SET_IR_POLARITY\",\"activeLow\":" + String(irActiveLow ? "true" : "false") + "}");
  }

  // 6. LCD_PRINT: Output text for display or monitoring
  else if (json.indexOf("\"cmd\":\"LCD_PRINT\"") >= 0) {
    Serial.println("{\"status\":\"ACK\",\"cmd\":\"LCD_PRINT\"}");
  }

  // 7. BUZZER_ALERT: Wrong slot or security warning
  else if (json.indexOf("\"cmd\":\"BUZZER_ALERT\"") >= 0) {
    for (int i = 0; i < NUM_LEDS; i++) leds[i] = CRGB::Red;
    FastLED.show();
    delay(200);
    FastLED.clear();
    FastLED.show();
    Serial.println("{\"status\":\"ACK\",\"cmd\":\"BUZZER_ALERT\"}");
  }
}

// -------------------------------------------------------------
// HELPER: OPERATE SLOT LEDS ONE BY ONE BASED ON DISTANCE!
// -------------------------------------------------------------
void updateSlotLedsOneByOne(int slotNum, int dist) {
  int startLed = (slotNum == 1) ? 0 : 10;
  int endLed   = (slotNum == 1) ? 10 : 20;

  // Empty Bay (> 50cm or invalid reading)
  if (dist > 50 || dist <= 0) {
    for (int i = startLed; i < endLed; i++) {
      leds[i] = CRGB::Black;
    }
    // Single bright green marker at bay entrance: Slot is Available!
    leds[startLed] = CRGB(0, 180, 0);
    return;
  }

  // Car approaching or parking (4cm to 50cm)
  // Maps distance into 1 to 10 LEDs progressively ONE BY ONE!
  int numToLight = map(constrain(dist, 4, 50), 50, 4, 1, 10);

  for (int i = 0; i < 10; i++) {
    int ledIdx = startLed + i;
    if (i < numToLight) {
      if (i < 4) {
        // LEDs 0..3 (36cm down to 50cm): Vibrant Green (Approaching)
        leds[ledIdx] = CRGB(0, 220, 0);
      } else if (i < 7) {
        // LEDs 4..6 (18cm down to 35cm): Amber / Orange (Aligning)
        leds[ledIdx] = CRGB(255, 140, 0);
      } else {
        // LEDs 7..9 (5cm down to 17cm): Solid Warning Red (Close / Bay Depth Reached)
        leds[ledIdx] = CRGB(255, 0, 0);
      }
    } else {
      leds[ledIdx] = CRGB::Black;
    }
  }

  // Danger proximity (< 5cm): Flash all 10 LEDs in warning red!
  if (dist < 5) {
    static bool blinkState = false;
    blinkState = !blinkState;
    CRGB alertColor = blinkState ? CRGB(255, 0, 0) : CRGB::Black;
    for (int i = startLed; i < endLed; i++) {
      leds[i] = alertColor;
    }
  }
}

// -------------------------------------------------------------
// SETUP
// -------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  // Initialize Sensors with INPUT_PULLUP (prevents floating to LOW)
  pinMode(IR_PIN, INPUT_PULLUP);
  pinMode(TRIG_1, OUTPUT);
  pinMode(ECHO_1, INPUT);
  pinMode(TRIG_2, OUTPUT);
  pinMode(ECHO_2, INPUT);

  // Initialize FastLED dedicated on GPIO 26 (WS2812B Data In)
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.clear();

  // Set default slot markers: 1 soft green available marker per bay
  leds[0] = CRGB(0, 40, 0);   // Slot P-01
  leds[10] = CRGB(0, 40, 0);  // Slot P-02
  FastLED.show();

  // Initialize RFID Reader
  SPI.begin();
  rfid.PCD_Init();

  Serial.println("{\"system\":\"SMART_PARKING_FIRMWARE\",\"mode\":\"SERIAL_COM\",\"status\":\"READY\",\"ledPin\":26}");
}

// -------------------------------------------------------------
// MAIN LOOP
// -------------------------------------------------------------
void loop() {
  // Check if manual dashboard test has expired
  if (isManualTestActive && millis() > manualTestTimeout) {
    isManualTestActive = false;
  }

  // Auto-expire route guidance after 15 seconds so pathway clears and never stays locked
  if (isRoutingActive && millis() > routingTimeout) {
    isRoutingActive = false;
    for (int i = 20; i < NUM_LEDS; i++) leds[i] = CRGB::Black;
    FastLED.show();
  }

  // 1. READ SERIAL COMMANDS FROM BACKEND (COM Port)
  while (Serial.available() > 0) {
    String incomingLine = Serial.readStringUntil('\n');
    processIncomingSerialCommand(incomingLine);
  }

  // 2. ENTRANCE GATE IR SENSOR at GPIO 21
  int rawIr = digitalRead(IR_PIN);
  bool isDetected = (irActiveLow) ? (rawIr == LOW) : (rawIr == HIGH);

  if (isDetected != irLastDetected) {
    irLastDetected = isDetected;
    if (isDetected) {
      Serial.println("{\"event\":\"GATE_ARRIVAL\",\"pin\":21,\"val\":" + String(rawIr) + ",\"detected\":true}");
    } else {
      Serial.println("{\"event\":\"GATE_CLEAR\",\"pin\":21,\"val\":" + String(rawIr) + ",\"detected\":false}");
    }
  }

  // 3. RFID SCANNER (Gate & Slot Tap-in)
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uidStr = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      uidStr += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
      uidStr += String(rfid.uid.uidByte[i], HEX);
      if (i < rfid.uid.size - 1) uidStr += ":";
    }
    uidStr.toUpperCase();

    // Check if car is already routed to a slot to distinguish Gate vs Slot tap
    if (isRoutingActive) {
      String targetSlot = (currentRoutingSlot == 1) ? "P-01" : "P-02";
      Serial.println("{\"event\":\"SLOT_RFID\",\"slot\":\"" + targetSlot + "\",\"uid\":\"" + uidStr + "\"}");
    } else {
      Serial.println("{\"event\":\"GATE_RFID\",\"uid\":\"" + uidStr + "\"}");
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(200);
  }

  // 4. PERIODIC ULTRASONIC & TELEMETRY STREAMING (120ms fast response)
  unsigned long now = millis();
  if (now - lastSensorPoll >= SENSOR_POLL_INTERVAL) {
    lastSensorPoll = now;

    int dist1 = readUltrasonicDistance(TRIG_1, ECHO_1);
    int dist2 = readUltrasonicDistance(TRIG_2, ECHO_2);

    // Filter sensor noise: clamp any empty reading (> 200cm or 0) to 999
    if (dist1 > 200 || dist1 <= 0) dist1 = 999;
    if (dist2 > 200 || dist2 <= 0) dist2 = 999;

    // OPERATE THE SLOT LEDS ONE BY ONE BASED ON DISTANCE!
    // (Slot 1 LEDs 0..9 and Slot 2 LEDs 10..19 ALWAYS update unless manual full-strip test is on)
    if (!isManualTestActive) {
      updateSlotLedsOneByOne(1, dist1);
      updateSlotLedsOneByOne(2, dist2);
      FastLED.show();
    }

    // Send complete live TELEMETRY packet to Dashboard every 500ms
    if (now - lastTelemetrySent >= TELEMETRY_INTERVAL) {
      lastTelemetrySent = now;
      Serial.println("{\"event\":\"TELEMETRY\",\"ir\":{\"pin\":21,\"detected\":" + String(isDetected ? "true" : "false") + ",\"val\":" + String(rawIr) + ",\"activeLow\":" + String(irActiveLow ? "true" : "false") + "},\"us1\":{\"slot\":\"P-01\",\"dist\":" + String(dist1) + "},\"us2\":{\"slot\":\"P-02\",\"dist\":" + String(dist2) + "}}");
    }

    // Report discrete changes
    if (abs(dist1 - lastDist1) >= 2) {
      lastDist1 = dist1;
      Serial.println("{\"event\":\"ULTRASONIC\",\"slot\":\"P-01\",\"dist\":" + String(dist1) + "}");
    }

    if (abs(dist2 - lastDist2) >= 2) {
      lastDist2 = dist2;
      Serial.println("{\"event\":\"ULTRASONIC\",\"slot\":\"P-02\",\"dist\":" + String(dist2) + "}");
    }
  }

  // 5. ANIMATE DYNAMIC ROUTE GUIDANCE LEDS (when route active)
  if (isRoutingActive && (now - lastAnimStep >= 50)) {
    lastAnimStep = now;

    // Clear pathway section (LEDs 20 to 74)
    for (int i = 20; i < NUM_LEDS; i++) {
      leds[i] = CRGB::Black;
    }

    // Dynamic track length: shortens based on allocated distance!
    // (Luxury=25, EV=35, Commercial=40, SUV=55, Sedan=65, Hatchback=74)
    int targetEnd = (routingEndLed >= 22 && routingEndLed < NUM_LEDS) ? routingEndLed : 74;

    // Junction Turn Indicator (LEDs 20-22):
    // Pulsing signal to clearly indicate LEFT vs RIGHT fork to the driver
    static uint8_t junctionPulse = 0;
    junctionPulse = (junctionPulse + 15) % 255;
    CRGB turnIndicatorColor = (routingTurn == "LEFT") ? CRGB::Magenta : CRGB::Orange;
    
    // Light up junction fork indicator
    if (routingTurn == "LEFT") {
      leds[20] = turnIndicatorColor; // Left indicator
    } else {
      leds[21] = turnIndicatorColor; // Right indicator
    }

    // Moving comet of 4 LEDs along the pathway in vehicle's assigned unique color
    for (int k = 0; k < 4; k++) {
      int pos = animPosition - k;
      if (pos >= 22 && pos <= targetEnd) {
        // Fade the tail of the comet
        CRGB cometColor = assignedRouteColor;
        if (k > 0) cometColor.fadeToBlackBy(k * 50);
        leds[pos] = cometColor;
      }
    }

    // Slot destination arrival marker: pulse target end LED
    leds[targetEnd] = assignedRouteColor;

    animPosition++;
    if (animPosition > targetEnd + 4) {
      animPosition = 22; // Loop back to start of pathway
    }

    FastLED.show();
  }

  delay(20);
}
