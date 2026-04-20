/*
  HM-10 AT Renamer / Serial Bridge

  Objetivo:
  - Entrar a modo AT del HM-10 y cambiar el nombre a "PaleoRover".

  Conexiones (Arduino UNO/NANO):
  - HM-10 TXD  -> Arduino D11 (RX del SoftwareSerial)
  - HM-10 RXD  -> Arduino D3  (TX del SoftwareSerial)  (usa divisor a 3.3V si tu HM-10 no es 5V tolerant)
  - HM-10 GND  -> Arduino GND
  - HM-10 VCC  -> 3.3V (o 5V solo si tu placa HM-10 lo soporta con regulador)
  - KEY/EN (si existe) -> HIGH al encender para modo AT (depende del módulo)

  Uso:
  1) Sube este sketch.
  2) Abre el Monitor Serie a 9600, "Both NL & CR".
  3) Escribe: AT   (debe responder OK)
  4) Escribe: RENAME   (envía AT+NAMEPaleoRover)
     Si tu firmware usa "AT+NAME=PaleoRover" escribe: RENAMEEQ
  5) Reinicia el HM-10.

  Nota:
  - Algunos HM-10 usan 38400 en modo AT. Si no responde en 9600:
    - Cambia HM10_AT_BAUD a 38400 y vuelve a subir.
*/

// Ajusta estos pines si lo necesitas
const uint8_t PIN_BT_RX = 11; // Arduino recibe (conectado a TXD del HM-10)
const uint8_t PIN_BT_TX = 3;  // Arduino envía  (conectado a RXD del HM-10)

// Baud típico AT del HM-10: 9600 (a veces 38400)
const unsigned long HM10_AT_BAUD = 9600;

#include <SoftwareSerial.h>
SoftwareSerial hm10(PIN_BT_RX, PIN_BT_TX);

String line = "";

static void sendToHm10(const String& s) {
  hm10.print(s);
  hm10.print("\r\n");
  Serial.print(F(">> "));
  Serial.println(s);
}

void setup() {
  Serial.begin(9600);
  while (!Serial) {}

  hm10.begin(HM10_AT_BAUD);

  Serial.println(F("HM-10 AT Bridge listo."));
  Serial.println(F("Monitor Serie: 9600 baud, Both NL & CR."));
  Serial.println(F("Comandos rapidos:"));
  Serial.println(F("  AT         -> prueba"));
  Serial.println(F("  RENAME     -> AT+NAMEPaleoRover"));
  Serial.println(F("  RENAMEEQ   -> AT+NAME=PaleoRover"));
  Serial.println(F("  NAME?      -> AT+NAME? (si tu firmware lo soporta)"));
  Serial.println(F("  HELP       -> ayuda"));
  Serial.println();
}

void loop() {
  // HM-10 -> USB Serial
  while (hm10.available()) {
    char c = (char)hm10.read();
    Serial.write(c);
  }

  // USB Serial -> HM-10 (por linea)
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (line.length() == 0) continue;

      String cmd = line;
      cmd.trim();
      line = "";

      if (cmd.equalsIgnoreCase("HELP")) {
        Serial.println(F("Comandos: AT | RENAME | RENAMEEQ | NAME? | (cualquier otro se envia tal cual)"));
        continue;
      }
      if (cmd.equalsIgnoreCase("RENAME")) {
        sendToHm10("AT+NAMEPaleoRover");
        continue;
      }
      if (cmd.equalsIgnoreCase("RENAMEEQ")) {
        sendToHm10("AT+NAME=PaleoRover");
        continue;
      }
      if (cmd.equalsIgnoreCase("NAME?")) {
        sendToHm10("AT+NAME?");
        continue;
      }

      // Si escribes AT+... u otro comando, se manda directo
      sendToHm10(cmd);
    } else {
      // Acumular solo imprimibles para evitar basura
      if (c >= 32 && c <= 126) line += c;
    }
  }
}

