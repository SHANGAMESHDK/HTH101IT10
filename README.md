# Smart Parking System Architecture

## 1. Hardware Components (IoT)
*   **Gate Entry**:
    *   ESP32-CAM: Number plate color detection (Yellow, Green, White) & classification (SUV, Hatchback, Sedan) using edge or backend processing.
    *   RFID Reader: Tap-in authentication for entry.
*   **Routing & Guidance**:
    *   ESP32 + IR Sensors: Tracks the car's location along the path.
    *   RGB LED Strips: Dynamic lighting to guide the user to the allocated unique parking slot.
*   **Parking Slots**:
    *   RFID Reader: Slot confirmation (tap to confirm correct spot).
    *   Ultrasonic Sensor: Checks parking posture and slot occupancy.
    *   16x2 LCD Display: Displays parking duration and timer.

## 2. Software & Backend Architecture
*   **Backend (Azure)**:
    *   REST/GraphQL APIs for user & admin operations.
    *   WebSocket Server: Real-time data streaming from ESP32s (gate entry, slot occupancy, IR tracking).
    *   Payment Gateway: Integration with Razorpay for RFID balance top-up.
    *   Classification Service: JSON-based model lookup for vehicle categorization.
*   **Frontend (React)**:
    *   **Admin Dashboard** (Gate): Manage RFID cards, process Razorpay recharges, monitor slots, view alerts.
    *   **User Dashboard** (Web/App): View available slots, check wallet balance, view current parking session and timer.

## 3. Business Logic & Allocation
*   **Vehicle Classification**:
    *   White Plate -> Car Model -> JSON lookup -> Category (SUV/Hatchback/Sedan).
    *   Yellow Plate -> Commercial (Shares Hatchback parking + driver rest center).
    *   Green Plate -> EV (Shares Hatchback parking + EV charging).
*   **Dynamic Faring**:
    *   **Sedan**: Short distance, high accessibility, high price.
    *   **SUV**: Moderate distance, moderate accessibility, moderate price.
    *   **Hatchback (incl. Yellow/EV)**: Long distance, lower accessibility, low price.
    *   **Premium**: Subscription-based, top-notch parking.
*   **Parking Workflow**:
    1.  Tap RFID at gate. (Check balance -> recharge if low).
    2.  Camera scans plate -> determine category.
    3.  Allocate slot & generate unique color.
    4.  RGB strips guide car to slot via IR tracking.
    5.  Tap RFID at slot to confirm.
    6.  Ultrasonic confirms posture, LCD starts timer.
    7.  On exit, stop timer and deduct dynamic fare.
