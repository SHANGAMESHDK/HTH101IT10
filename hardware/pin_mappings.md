# Smart Parking Hardware Pin Mappings

This document details the wiring and GPIO pin mappings for the three main ESP32 nodes in the system.

## 1. Gate Entry Node (ESP32-CAM)
This node is responsible for number plate capture and initial RFID tap-in.

### Camera (Internal)
*   Standard ESP32-CAM AI-Thinker pinout (D0-D7, VSYNC, HREF, PCLK, XCLK, SIOD, SIOC).

### RFID Module (RC522)
*   **VCC**: 3.3V
*   **GND**: GND
*   **RST**: GPIO 12
*   **SDA (SS)**: GPIO 13
*   **MOSI**: GPIO 15
*   **MISO**: GPIO 2
*   **SCK**: GPIO 14
*(Note: ESP32-CAM has limited GPIOs; microSD card pins are reused for SPI).*

---

## 2. Route Guidance Node (Standard ESP32)
This node tracks the vehicle along the path and controls the RGB LED strips.

### RGB LED Strip (WS2812B)
*   **VCC**: 5V (External Power Supply)
*   **GND**: GND (Common with ESP32)
*   **DATA_PIN**: GPIO 5

### IR Sensors (Tracking)
*   **IR Sensor 1 (Zone A)**: GPIO 12
*   **IR Sensor 2 (Zone B)**: GPIO 14
*   **IR Sensor 3 (Zone C)**: GPIO 27
*   **IR Sensor 4 (Zone D)**: GPIO 26
*   *(VCC and GND to 3.3V/5V and GND respectively)*

---

## 3. Parking Slot Node (Standard ESP32)
This node verifies the correct parking slot, checks posture, and displays the timer.

### RFID Module (RC522)
*   **VCC**: 3.3V
*   **GND**: GND
*   **RST**: GPIO 22
*   **SDA (SS)**: GPIO 21
*   **MOSI**: GPIO 23
*   **MISO**: GPIO 19
*   **SCK**: GPIO 18

### Ultrasonic Sensor (HC-SR04)
*   **VCC**: 5V
*   **GND**: GND
*   **TRIG**: GPIO 32
*   **ECHO**: GPIO 33

### 16x2 LCD Display (with I2C Module)
*   **VCC**: 5V
*   **GND**: GND
*   **SDA**: GPIO 26
*   **SCL**: GPIO 27
