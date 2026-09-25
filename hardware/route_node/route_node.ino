#include <FastLED.h>
#include <WebSocketsClient.h>
#include <WiFi.h>

// WiFi Credentials
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";

// WebSocket Server
const char *ws_host = "YOUR_BACKEND_IP";
const uint16_t ws_port = 8080;
WebSocketsClient webSocket;

// FastLED Config
#define LED_PIN 5
#define NUM_LEDS 60 // Adjust based on your strip
#define BRIGHTNESS 128
#define LED_TYPE WS2812B
#define COLOR_ORDER GRB
CRGB leds[NUM_LEDS];

// IR Sensor Pins
const int irSensorPins[] = {12, 14, 27, 26};
const int numSensors = 4;
int lastSensorState[] = {HIGH, HIGH, HIGH, HIGH}; // Assuming active LOW

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  if (type == WStype_TEXT) {
    String msg = (char *)payload;
    Serial.println("WS msg: " + msg);

    // Example Payload: {"event":"LIGHT_ROUTE", "color":"#8b5cf6", "startLed":
    // 0, "endLed": 20} We will do a simple parsing here. In prod, use
    // ArduinoJson.
    if (msg.indexOf("LIGHT_ROUTE") > 0) {
      // Light up the path with the assigned unique color
      // Mocking the color to Purple for demo
      fill_solid(leds, NUM_LEDS, CRGB::Purple);
      FastLED.show();
    }

    if (msg.indexOf("CLEAR_ROUTE") > 0) {
      FastLED.clear();
      FastLED.show();
    }
  }
}

void setup() {
  Serial.begin(115200);

  // Setup IR Sensors
  for (int i = 0; i < numSensors; i++) {
    pinMode(irSensorPins[i], INPUT);
  }

  // Setup FastLED
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
      .setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.clear();
  FastLED.show();

  // Connect WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");

  // Connect WebSocket
  webSocket.begin(ws_host, ws_port, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();

  // Monitor IR Sensors for car tracking
  for (int i = 0; i < numSensors; i++) {
    int state = digitalRead(irSensorPins[i]);
    if (state == LOW && lastSensorState[i] == HIGH) { // Car detected
      Serial.printf("Car detected at Zone %d\n", i);
      String wsPayload =
          "{\"event\":\"CAR_TRACKED\", \"zone\":" + String(i) + "}";
      webSocket.sendTXT(wsPayload);
      delay(500); // Debounce
    }
    lastSensorState[i] = state;
  }
}
