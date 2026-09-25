#include <LiquidCrystal_I2C.h>
#include <MFRC522.h>
#include <NewPing.h>
#include <SPI.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <Wire.h>

// WiFi Credentials
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";

// WebSocket Server
const char *ws_host = "YOUR_BACKEND_IP";
const uint16_t ws_port = 8080;
WebSocketsClient webSocket;

// Slot Info
const String SLOT_ID = "S-12";

// RFID Pins
#define RST_PIN 22
#define SS_PIN 21
MFRC522 mfrc522(SS_PIN, RST_PIN);

// Ultrasonic Pins
#define TRIG_PIN 32
#define ECHO_PIN 33
#define MAX_DISTANCE 200 // Max distance to ping (cm)
NewPing sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE);

// LCD Display
LiquidCrystal_I2C lcd(0x27, 16, 2); // I2C address 0x27

// State variables
bool isParked = false;
unsigned long parkStartTime = 0;
String currentParkedRFID = "";

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  if (type == WStype_TEXT) {
    String msg = (char *)payload;
    if (msg.indexOf("INVALID_SLOT") > 0) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Wrong Slot!");
      delay(3000);
      updateLCDState();
    }
  }
}

void setup() {
  Serial.begin(115200);

  // Init LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.print("Slot: " + SLOT_ID);
  lcd.setCursor(0, 1);
  lcd.print("Status: Empty");

  // Connect WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  // Init SPI & RFID
  SPI.begin(18, 19, 23, 21); // SCK, MISO, MOSI, SS
  mfrc522.PCD_Init();

  // Connect WebSocket
  webSocket.begin(ws_host, ws_port, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void updateLCDState() {
  lcd.clear();
  lcd.setCursor(0, 0);
  if (isParked) {
    lcd.print("Parked: " + SLOT_ID);
  } else {
    lcd.print("Slot: " + SLOT_ID);
    lcd.setCursor(0, 1);
    lcd.print("Status: Empty");
  }
}

void loop() {
  webSocket.loop();

  // 1. Posture & Occupancy Check
  delay(50);
  unsigned int distance = sonar.ping_cm();
  bool carDetected = (distance > 0 && distance < 100); // Car is within 100cm

  if (!isParked && carDetected) {
    // Car just arrived but hasn't tapped yet
    // We can notify backend of a physical arrival without tap
  }

  if (isParked && !carDetected) {
    // Car left
    isParked = false;
    unsigned long duration = (millis() - parkStartTime) / 1000;
    String wsPayload = "{\"event\":\"SLOT_EXIT\", \"slot\":\"" + SLOT_ID +
                       "\", \"rfid\":\"" + currentParkedRFID +
                       "\", \"duration\":" + String(duration) + "}";
    webSocket.sendTXT(wsPayload);

    currentParkedRFID = "";
    updateLCDState();
  }

  // 2. RFID Tap Check (Confirm Parking)
  if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
    String rfid = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      rfid += String(mfrc522.uid.uidByte[i] < 0x10 ? "0" : "");
      rfid += String(mfrc522.uid.uidByte[i], HEX);
    }
    rfid.toUpperCase();

    if (!isParked && carDetected) {
      // Valid tap-in
      isParked = true;
      parkStartTime = millis();
      currentParkedRFID = rfid;

      String wsPayload = "{\"event\":\"SLOT_TAP\", \"slot\":\"" + SLOT_ID +
                         "\", \"rfid\":\"" + rfid + "\"}";
      webSocket.sendTXT(wsPayload);

      updateLCDState();
    }
    delay(2000);
  }

  // 3. Update Timer on LCD if parked
  if (isParked) {
    unsigned long duration = (millis() - parkStartTime) / 1000;
    int m = duration / 60;
    int s = duration % 60;

    char timeStr[10];
    sprintf(timeStr, "Time: %02d:%02d", m, s);

    lcd.setCursor(0, 1);
    lcd.print(timeStr);

    // Check posture logic (e.g. if distance is too close or too far while
    // parked)
    if (distance > 0 && distance < 10) {
      lcd.setCursor(15, 1);
      lcd.print("!"); // Warning indicator on LCD
      // Optionally send posture alert to backend
    } else {
      lcd.setCursor(15, 1);
      lcd.print(" ");
    }
  }
}
