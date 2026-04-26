// MREM_NRF24_Gateway.ino
// Multi-Radio Exposure Mapper v3 — Hardware Physical Energy Scanner
// Scans the full 2.4GHz spectrum using standard NRF24L01 modules.
// Works natively with MREM Serial Bridge auto-connect.

// ── Required Libraries ─────────────────────────────────────────────
// Install via Library Manager: "RF24", "Adafruit GFX Library", "Adafruit SSD1306"
#include <SPI.h>
#include <Wire.h>
#include <nRF24L01.h>
#include <RF24.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ── Wiring Instructions (Arduino Uno / Nano) ──────────────────────
// **NRF24L01+**
// CE   -> Pin 9
// CSN  -> Pin 10
// MOSI -> Pin 11
// MISO -> Pin 12
// SCK  -> Pin 13
// VCC  -> 3.3V (CRITICAL: Do NOT use 5V)
// GND  -> GND
//
// **0.91" I2C OLED (128x32)**
// SDA  -> A4
// SCL  -> A5
// VCC  -> 5V or 3.3V
// GND  -> GND
// ──────────────────────────────────────────────────────────────────

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define OLED_RESET -1 // Reset pin # (or -1 if sharing Arduino reset pin)
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

RF24 radio(9, 10); 

// Full band sweep: 128 channels (2400 MHz to 2527 MHz)
const int CHANNELS = 128;
int bins[CHANNELS];

// Sweeps per broadcast (controls how deep the variance sampling is).
// 35 pushes about 1-2 JSON payloads per second.
const int SWEEP_PASSES = 35; 
bool oledActive = false;

void setup() {
  Serial.begin(115200);

  // Initialize OLED
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { 
    // Fallback if OLED is disconnected, we won't halt, just skip rendering
    Serial.println("{\"type\":\"warning\",\"message\":\"OLED not found. Continuing headless.\"}");
  } else {
    oledActive = true;
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("MREM v3 GATEWAY");
    display.println("Booting NRF24...");
    display.display();
  }
  
  if (!radio.begin()) {
    // Fail safe output so the Node backend registers the hardware failure natively
    while (1) {
      Serial.println("{\"type\":\"error\",\"message\":\"NRF24 hardware not found! Check wiring and avoid 5V.\"}");
      delay(2000);
    }
  }
  
  radio.setAutoAck(false);
  radio.disableCRC(); // Fast analog RF energy mode (we are not decoding standard packet logic)
  radio.startListening();
  radio.stopListening();
  
  delay(100);
}

void loop() {
  memset(bins, 0, sizeof(bins));

  // Multipass channel sweep
  for(int pass = 0; pass < SWEEP_PASSES; pass++) {
    for (int i = 0; i < CHANNELS; i++) {
        radio.setChannel(i);
        radio.startListening();
        
        // Wait 200us for analog front-end frequency synthesizer to lock
        delayMicroseconds(200);
        
        // RF24 testCarrier() reads the RPD (Received Power Detector) register.
        // Returns 1 if RF energy on this channel exceeds -64dBm.
        if (radio.testCarrier()) {
            bins[i]++;
        }
        
        radio.stopListening();
    }
  }

  // Draw hardware spectrum analyzer on the OLED
  if (oledActive) {
    // The OLED is exactly 128 pixels wide, mapping 1:1 to our 128 channels!
    display.clearDisplay();
    
    // Draw top stats
    display.setCursor(0, 0);
    display.print("MREM LIVE  [");
    
    // Find highest spike for stats
    int maxHit = 0;
    for (int i = 0; i < CHANNELS; i++) {
       if (bins[i] > maxHit) maxHit = bins[i];
    }
    display.print(maxHit);
    display.print("]");

    // Draw the 128x32 histogram
    for (int i = 0; i < CHANNELS; i++) {
        // Map the sweep passes to a max height of 22 pixels (leaving top 10 for text)
        int h = map(bins[i], 0, SWEEP_PASSES, 0, 22);
        if (h > 22) h = 22; // strict bounding
        if (h > 0) {
            display.drawLine(i, SCREEN_HEIGHT - 1, i, (SCREEN_HEIGHT - 1) - h, SSD1306_WHITE);
        }
    }
    display.display();
  }

  // Print memory-safe JSON array directly to the Serial Port
  // Example output: {"type":"nrf","mode":"sweep","bins":[0,0,1,5,0,...]}
  Serial.print("{\"type\":\"nrf\",\"mode\":\"sweep\",\"bins\":[");
  for (int i = 0; i < CHANNELS; i++) {
    Serial.print(bins[i]);
    if (i < CHANNELS - 1) {
       Serial.print(",");
    }
  }
  Serial.println("]}");
}
