# Smart Parking Hardware Pin Mappings

## 1. Active Unified COM Port ESP32 Node (`hardware/FIRMWARE/FIRMWARE.ino`)
Direct USB-Serial COM Port communication at **115200 Baud** with telemetry streaming every **0.5 sec (500ms)**.

| Component | Pin / Signal | ESP32 GPIO | Operating Voltage | Function |
| :--- | :--- | :--- | :--- | :--- |
| **Entrance Gate IR Sensor** | OUT | **GPIO 21** | 3.3V / 5V | Detects vehicle arriving at entrance gate |
| **WS2812B NeoPixel Strip (75 LEDs)** | DIN (Data In) | **GPIO 26** | 5V (Ext. / USB) | Dynamic route comet & slot indicators |
| | **GND (Ground)** | **ESP32 GND** | 0V | **CRITICAL: Strip GND MUST connect to ESP32 GND!** |
| | VCC (Power) | +5V (Ext. Supply) | 5V DC | Positive power to LED strip |
| **Ultrasonic 1 (Slot P-01)** | TRIG | **GPIO 13** | 5V | Triggers 10µs ultrasonic pulse |
| | ECHO | **GPIO 12** | 5V (via divider) | Measures distance in cm to vehicle |
| **Ultrasonic 2 (Slot P-02)** | TRIG | **GPIO 14** | 5V | Triggers 10µs ultrasonic pulse |
| | ECHO | **GPIO 27** | 5V (via divider) | Measures distance in cm to vehicle |
| **MFRC522 RFID Reader** | SDA (SS) | **GPIO 5** | 3.3V | SPI Slave Select |
| | SCK | **GPIO 18** | 3.3V | SPI Clock |
| | MOSI | **GPIO 23** | 3.3V | SPI Master Out |
| | MISO | **GPIO 19** | 3.3V | SPI Master In |
| | RST | **GPIO 22** | 3.3V | RFID Reset |
| **16x2 I2C LCD Display (Optional)** | SDA | **GPIO 32** | 5V | I2C Data (Timer & Fare display) |
| | SCL | **GPIO 33** | 5V | I2C Clock |

> [!CAUTION]
> ### ⚡ Critical Hardware Rule: Common Ground (GND) Required!
> Because your WS2812B LED strip is powered by an **external 5V supply**, you **MUST connect a jumper wire from the External Supply GND (or strip GND) to an ESP32 GND pin**.
> 
> - **Why?** The data signal sent by ESP32 GPIO 26 is a 3.3V voltage measured *relative to the ESP32 GND*. If the LED strip and ESP32 do not share a common ground, the data pulses have no reference voltage, causing the LEDs to stay completely black or flicker erratically!
> 
> ```
> [External 5V Power Supply]
>    (+) 5V  -----------------------------> LED Strip VCC (+5V)
>    (-) GND -------------------+---------> LED Strip GND (-)
>                               |
>                               +---------> ESP32 GND Pin  <--- [CRITICAL COMMON GROUND JUMPER]
> 
> [ESP32 Board]
>    GPIO 26 -----------------------------> LED Strip DIN (Data In)
> ```

---

## 2. Vehicle Category Allocation, Mock Colors & Parking Lot Numbers
Every vehicle category has a fixed dedicated **Parking Lot Number** and signature **Mock LED Color**:

| Category | Parking Lot No. | Bay Slot ID | Signature Mock Color | Distance | Turn Direction | LED Strip Track Length | Features |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Luxury Cars** | **Lot #01** | `P-VIP` | **Royal Purple (`#A855F7`)** | 10m *(Nearest)* | **Turn LEFT** | **Ends at LED 25** (Ultra-short) | Dedicated Valet, CCTV Security |
| **EV Cars** | **Lot #05** | `P-EV` | **Electric Green (`#10B981`)** | 20m *(Nearer)* | **Turn LEFT** | **Ends at LED 35** (Short) | 60kW DC Fast Charger |
| **Commercial** | **Lot #10** | `P-COMM` | **Amber Yellow (`#F59E0B`)** | 25m *(Nearer)* | **Turn LEFT** | **Ends at LED 40** (Short) | Driver Rest Centre & Canteen |
| **SUV** | **Lot #15** | `P-01` | **Cobalt Blue (`#3B82F6`)** | 45m *(Middle)* | **Turn RIGHT** | **Ends at LED 55** (Medium) | High Clearance Bay |
| **Sedan** | **Lot #20** | `P-02` | **Executive Cyan (`#06B6D4`)** | 60m *(Far Middle)* | **Turn RIGHT** | **Ends at LED 65** (Medium-Long) | Standard Covered Bay |
| **Hatchback** | **Lot #30** | `P-03` | **Coral Pink (`#EC4899`)** | 80m *(Far End)* | **Turn RIGHT** | **Ends at LED 74** (Full length) | Compact Economic Bay |

### 🚗 Car-by-Car Parking ID & Mock Colour Allocation Registry

| Car Model | Example Plate No. | Vehicle Category | Allocated Parking ID | Parking Lot No. | Signature Mock Colour | Hardware Route Guidance |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **Mercedes-Benz C / E / S-Class** | `MH-02-CD-9999` | **LUXURY** | **`P-VIP`** | **Lot #01** | **Royal Purple (`#A855F7`)** | Turn LEFT • 10m • Comet ends at LED 25 |
| **BMW 3 / 5 / 7 / X5 Series** | `DL-01-LX-7777` | **LUXURY** | **`P-VIP`** | **Lot #01** | **Royal Purple (`#A855F7`)** | Turn LEFT • 10m • Comet ends at LED 25 |
| **Audi A4 / A6 / Q7** | `KA-01-LX-1111` | **LUXURY** | **`P-VIP`** | **Lot #01** | **Royal Purple (`#A855F7`)** | Turn LEFT • 10m • Comet ends at LED 25 |
| **Porsche Macan / Cayenne** | `MH-01-LX-9000` | **LUXURY** | **`P-VIP`** | **Lot #01** | **Royal Purple (`#A855F7`)** | Turn LEFT • 10m • Comet ends at LED 25 |
| **Tata Nexon EV / MG ZS EV** | `DL-04-EV-8821` | **EV** | **`P-EV`** | **Lot #05** | **Electric Green (`#10B981`)** | Turn LEFT • 20m • Comet ends at LED 35 |
| **Commercial Cabs (Yellow Board)** | `KA-05-TX-1002` | **COMMERCIAL** | **`P-COMM`** | **Lot #10** | **Amber Yellow (`#F59E0B`)** | Turn LEFT • 25m • Comet ends at LED 40 |
| **Honda CR-V** | `KA-01-MJ-5566` | **SUV** | **`P-01`** | **Lot #15** | **Cobalt Royal Blue (`#3B82F6`)** | Turn RIGHT • 45m • Comet ends at LED 55 |
| **Toyota Fortuner** | `KA-04-SV-2200` | **SUV** | **`P-01`** | **Lot #15** | **Cobalt Royal Blue (`#3B82F6`)** | Turn RIGHT • 45m • Comet ends at LED 55 |
| **Mahindra Scorpio / Tata Harrier** | `MH-12-SV-3300` | **SUV** | **`P-01`** | **Lot #15** | **Cobalt Royal Blue (`#3B82F6`)** | Turn RIGHT • 45m • Comet ends at LED 55 |
| **Hyundai Creta** | `DL-03-SV-4400` | **SUV** | **`P-01`** | **Lot #15** | **Cobalt Royal Blue (`#3B82F6`)** | Turn RIGHT • 45m • Comet ends at LED 55 |
| **Honda City** | `KA-02-SD-3344` | **SEDAN** | **`P-02`** | **Lot #20** | **Executive Cyan (`#06B6D4`)** | Turn RIGHT • 60m • Comet ends at LED 65 |
| **Hyundai Verna / Skoda Slavia** | `KA-01-SD-5566` | **SEDAN** | **`P-02`** | **Lot #20** | **Executive Cyan (`#06B6D4`)** | Turn RIGHT • 60m • Comet ends at LED 65 |
| **Volkswagen Virtus / Ciaz** | `MH-04-SD-7788` | **SEDAN** | **`P-02`** | **Lot #20** | **Executive Cyan (`#06B6D4`)** | Turn RIGHT • 60m • Comet ends at LED 65 |
| **Maruti Suzuki Swift** | `KA-03-HB-7890` | **HATCHBACK** | **`P-03`** | **Lot #30** | **Coral Pink (`#EC4899`)** | Turn RIGHT • 80m • Comet ends at LED 74 |
| **Hyundai i20 / Baleno** | `DL-08-HB-1020` | **HATCHBACK** | **`P-03`** | **Lot #30** | **Coral Pink (`#EC4899`)** | Turn RIGHT • 80m • Comet ends at LED 74 |
| **Tata Altroz / Polo** | `KA-05-HB-4050` | **HATCHBACK** | **`P-03`** | **Lot #30** | **Coral Pink (`#EC4899`)** | Turn RIGHT • 80m • Comet ends at LED 74 |

---

## 3. Ultrasonic Distance & Progressive "One-by-One" LED Mapping
Slot LEDs (**LEDs 0–9 for Slot 1 / Bay P-01**, **LEDs 10–19 for Slot 2 / Bay P-02**) update every **120ms** progressively **one-by-one**:
- **> 50cm (Empty Bay)**: 1 bright green LED (LED 0 or LED 10) indicates the slot is available.
- **46–50cm**: 1 LED turns Green.
- **41–45cm**: 2 LEDs turn Green.
- **36–40cm**: 3–4 LEDs turn Green.
- **28–35cm**: 5 LEDs turn Amber / Orange.
- **20–27cm**: 6 LEDs turn Amber / Orange.
- **12–19cm**: 7–8 LEDs turn Red.
- **5–11cm**: 9–10 LEDs turn Red.
- **< 5cm (Too Close)**: All 10 LEDs flash blinking Red alert (Stop!).

> [!NOTE]
> Slot 1 (LEDs 0–9) and Slot 2 (LEDs 10–19) operate independently of the pathway guidance comet (LEDs 20–74). They update continuously based on live ultrasonic sensor distance.

