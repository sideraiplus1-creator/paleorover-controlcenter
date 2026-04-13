// ========================================================================
//  ROVER PALEO v3.5 - Control Center Compatible
//  Arduino Uno + Sensor Shield V5 + L298N + HC-SR04 + Servo + Buzzer
//  Comunicación: Bluetooth HC-05/06 (SoftwareSerial D11/D3)
// ========================================================================
//  CAMBIOS v3.5:
//  - Velocidad reducida: Manual 100 / Auto 80 (antes 180/150)
//  - Timeout modo manual: 30s
//  - IR: INPUT_PULLUP (sin resistencias externas)
//  - Servo: doble verificación para detenerse
//  - FIND: no se envía en status periódico
// ========================================================================

#include <SoftwareSerial.h>
#include <Servo.h>

// ═══════════════════════════════════════════════════════════════════════
// PINES DE HARDWARE
// ═══════════════════════════════════════════════════════════════════════

const int PIN_ENA    = 5;
const int PIN_IN3    = 7;
const int PIN_IN4    = 8;
const int PIN_IN1    = 2;
const int PIN_IN2    = 4;
const int PIN_ENB    = 6;

const int PIN_IR_IZQ = 9;
const int PIN_IR_DER = 10;

const int PIN_TRIG   = A1;
const int PIN_ECHO   = A0;

const int PIN_SERVO  = A2;
const int PIN_BUZZER = 12;

const int PIN_BT_RX  = 11;
const int PIN_BT_TX  = 3;

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN Y CONSTANTES
// ═══════════════════════════════════════════════════════════════════════

const int VEL_MINIMA         = 60;
const int VEL_MAXIMA         = 255;
const int VEL_DEFAULT_MANUAL = 100;  // FIX v3.5: Reducida de 180 a 100 para mejor control
const int VEL_DEFAULT_AUTO   = 80;   // FIX v3.5: Reducida de 150 a 80 para más torque

// FIX v3.4: Timeout aumentado a 30s para modo manual
// Esto evita que el robot vuelva a AUTO mientras el usuario
// está moviendo el D-Pad con pausas normales entre toques
const unsigned long TIMEOUT_RECONEXION   = 30000;

const unsigned long INTERVALO_SCAN_SERVO = 150;
const unsigned long INTERVALO_STATUS     = 800;  // FIX v3.3: 500→800ms, menos flood BLE
const unsigned long INTERVALO_SENSORES   = 30;
const unsigned long DURACION_BAILE       = 5000; // 5 segundos de baile

const int DISTANCIA_MINIMA  = 20;
const int DISTANCIA_EVASION = 30;

const int SERVO_IZQ    = 0;
const int SERVO_CENTRO = 90;
const int SERVO_DER    = 180;

const int IR_DEBOUNCE = 3;

// ═══════════════════════════════════════════════════════════════════════
// VARIABLES GLOBALES
// ═══════════════════════════════════════════════════════════════════════

SoftwareSerial bluetooth(PIN_BT_RX, PIN_BT_TX);
String bufferComando = "";

Servo servoRadar;
int  anguloServo         = 90;
int  direccionScan       = 1;
bool modoBusquedaActivo  = true;

enum EstadoRobot { IDLE, EXPLORANDO, MANUAL, HALLAZGO, EVITANDO, BAILANDO };
EstadoRobot estadoActual   = EXPLORANDO;
EstadoRobot estadoAnterior = EXPLORANDO;

int velocidadManual = VEL_DEFAULT_MANUAL;
int velocidadAuto   = VEL_DEFAULT_AUTO;

long distanciaUltrasonico = 0;
bool irIzquierdoDetecta   = false;
bool irDerechoDetecta     = false;
int  irIzqContador        = 0;
int  irDerContador        = 0;

unsigned long ultimoComandoRecibido = 0;
unsigned long ultimoEnvioStatus     = 0;
unsigned long ultimoMovimientoServo = 0;
unsigned long ultimoMovimientoBaile = 0;
unsigned long ultimoLecturaSensores = 0;
unsigned long tiempoInicioEvasion   = 0;
unsigned long tiempoInicioHallazgo  = 0;

int  contadorHallazgos = 0;
int  pasoBaile         = 0;
char ultimoMovimiento  = 'S';

// ═══════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(9600);
  Serial.println(F("Rover Paleo v3.3 iniciando..."));

  bluetooth.begin(9600);

  pinMode(PIN_IN1, OUTPUT); pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IN3, OUTPUT); pinMode(PIN_IN4, OUTPUT);
  pinMode(PIN_ENA, OUTPUT); pinMode(PIN_ENB, OUTPUT);

  // FIX v3.4: INPUT_PULLUP elimina resistencias externas y falsos contactos
  pinMode(PIN_IR_IZQ, INPUT_PULLUP);
  pinMode(PIN_IR_DER, INPUT_PULLUP);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  servoRadar.attach(PIN_SERVO);
  servoRadar.write(SERVO_CENTRO);

  detener();
  sonarInicio();

  delay(300);
  bluetooth.println(F("ST:EXPLORANDO"));
  bluetooth.println(F("MSG:Rover Paleo v3.3 listo"));

  Serial.println(F("Setup completo - Modo: EXPLORANDO"));
}

// ═══════════════════════════════════════════════════════════════════════
// LOOP PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

void loop() {
  unsigned long ahora = millis();

  leerBluetooth();

  if (ahora - ultimoLecturaSensores >= INTERVALO_SENSORES) {
    ultimoLecturaSensores = ahora;
    leerSensores();
  }

  verificarTimeoutConexion(ahora);
  ejecutarEstado(ahora);

  if (modoBusquedaActivo) {
    actualizarServo(ahora);
  }

  if (ahora - ultimoEnvioStatus >= INTERVALO_STATUS) {
    ultimoEnvioStatus = ahora;
    enviarStatus();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MÁQUINA DE ESTADOS
// ═══════════════════════════════════════════════════════════════════════

void ejecutarEstado(unsigned long ahora) {
  switch (estadoActual) {
    case IDLE:       detener();               break;
    case EXPLORANDO: ejecutarExplorando();    break;
    case MANUAL:     ejecutarManual();        break;
    case HALLAZGO:   ejecutarHallazgo(ahora); break;
    case EVITANDO:   ejecutarEvasion(ahora);  break;
    case BAILANDO:   ejecutarBaile(ahora);    break;
  }
}

void ejecutarExplorando() {
  if (distanciaUltrasonico > 0 && distanciaUltrasonico < DISTANCIA_MINIMA) {
    cambiarEstado(EVITANDO);
    return;
  }
  if (irIzquierdoDetecta || irDerechoDetecta) {
    String sensorStr = (irIzquierdoDetecta && irDerechoDetecta) ? "BOTH"
                     : (irIzquierdoDetecta ? "LEFT" : "RIGHT");
    contadorHallazgos++;
    bluetooth.print(F("FIND:"));
    bluetooth.print(contadorHallazgos);
    bluetooth.print(F(",SENSOR:"));
    bluetooth.println(sensorStr);
    sonarHallazgo();
    cambiarEstado(HALLAZGO);
    return;
  }
  if (distanciaUltrasonico > 0 && distanciaUltrasonico < DISTANCIA_EVASION) {
    if (anguloServo < 90) derecha();
    else                  izquierda();
  } else {
    adelante();
  }
}

void ejecutarManual() {
  switch (ultimoMovimiento) {
    case 'F': adelante();  break;
    case 'B': atras();     break;
    case 'L': izquierda(); break;
    case 'R': derecha();   break;
    default:  detener();   break;
  }
}

void ejecutarHallazgo(unsigned long ahora) {
  detener();
  if (ahora - tiempoInicioHallazgo > 3000) {
    cambiarEstado(estadoAnterior);
  }
}

void ejecutarEvasion(unsigned long ahora) {
  unsigned long t = ahora - tiempoInicioEvasion;
  if      (t < 500)  atras();
  else if (t < 1500) { if (anguloServo < 90) derecha(); else izquierda(); }
  else               cambiarEstado(EXPLORANDO);
}

void ejecutarBaile(unsigned long ahora) {
  // FIX: terminar baile automáticamente después de DURACION_BAILE
  if (ahora - tiempoInicioHallazgo > DURACION_BAILE) {
    detener();
    // Al terminar baile, no volver a AUTO por defecto
    cambiarEstado(IDLE);
    return;
  }
  if (ahora - ultimoMovimientoBaile > 400) {
    ultimoMovimientoBaile = ahora;
    switch (pasoBaile % 6) {
      case 0: adelante();      break;
      case 1: derecha();       break;
      case 2: atras();         break;
      case 3: izquierda();     break;
      case 4: giroIzquierda(); break;
      case 5: giroDerecha();   break;
    }
    pasoBaile++;
    sonarBaile();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CAMBIO DE ESTADO
// ═══════════════════════════════════════════════════════════════════════

void cambiarEstado(EstadoRobot nuevoEstado) {
  if (estadoActual != HALLAZGO && estadoActual != IDLE) {
    estadoAnterior = estadoActual;
  }
  estadoActual = nuevoEstado;
  unsigned long ahora = millis();

  switch (nuevoEstado) {
    case HALLAZGO: tiempoInicioHallazgo = ahora; detener(); break;
    case EVITANDO: tiempoInicioEvasion  = ahora; break;
    case BAILANDO: pasoBaile = 0; ultimoMovimientoBaile = ahora; tiempoInicioHallazgo = ahora; break;
    case MANUAL:
      detener();
      ultimoMovimiento = 'S';
      // FIX v3.3: Al entrar a MANUAL, detener servo automáticamente
      modoBusquedaActivo = false;
      servoRadar.write(SERVO_CENTRO);
      anguloServo = SERVO_CENTRO;
      break;
    case IDLE:     detener(); break;
    default: break;
  }

  bluetooth.print(F("ST:"));
  switch (nuevoEstado) {
    case IDLE:       bluetooth.println(F("IDLE"));       break;
    case EXPLORANDO: bluetooth.println(F("EXPLORANDO")); break;
    case MANUAL:     bluetooth.println(F("MANUAL"));     break;
    case HALLAZGO:   bluetooth.println(F("HALLAZGO"));   break;
    case EVITANDO:   bluetooth.println(F("EVITANDO"));   break;
    case BAILANDO:   bluetooth.println(F("BAILANDO"));   break;
  }

  Serial.print(F("Estado: "));
  Serial.println((int)nuevoEstado);
}

// ═══════════════════════════════════════════════════════════════════════
// CONTROL DE MOTORES
// ═══════════════════════════════════════════════════════════════════════

int getVel() {
  return (estadoActual == MANUAL) ? velocidadManual : velocidadAuto;
}

void adelante() {
  int v = getVel();
  digitalWrite(PIN_IN1, HIGH); digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, HIGH); digitalWrite(PIN_IN4, LOW);
  analogWrite(PIN_ENA, v);     analogWrite(PIN_ENB, v);
}

void atras() {
  int v = getVel();
  digitalWrite(PIN_IN1, LOW);  digitalWrite(PIN_IN2, HIGH);
  digitalWrite(PIN_IN3, LOW);  digitalWrite(PIN_IN4, HIGH);
  analogWrite(PIN_ENA, v);     analogWrite(PIN_ENB, v);
}

void izquierda() {
  int v = getVel();
  digitalWrite(PIN_IN1, HIGH); digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);  digitalWrite(PIN_IN4, HIGH);
  analogWrite(PIN_ENA, v);     analogWrite(PIN_ENB, v);
}

void derecha() {
  int v = getVel();
  digitalWrite(PIN_IN1, LOW);  digitalWrite(PIN_IN2, HIGH);
  digitalWrite(PIN_IN3, HIGH); digitalWrite(PIN_IN4, LOW);
  analogWrite(PIN_ENA, v);     analogWrite(PIN_ENB, v);
}

void giroIzquierda() {
  int v = getVel();
  digitalWrite(PIN_IN1, HIGH); digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);  digitalWrite(PIN_IN4, HIGH);
  analogWrite(PIN_ENA, v);     analogWrite(PIN_ENB, v);
}

void giroDerecha() {
  int v = getVel();
  digitalWrite(PIN_IN1, LOW);  digitalWrite(PIN_IN2, HIGH);
  digitalWrite(PIN_IN3, HIGH); digitalWrite(PIN_IN4, LOW);
  analogWrite(PIN_ENA, v);     analogWrite(PIN_ENB, v);
}

void detener() {
  digitalWrite(PIN_IN1, LOW); digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW); digitalWrite(PIN_IN4, LOW);
  analogWrite(PIN_ENA, 0);    analogWrite(PIN_ENB, 0);
}

// ═══════════════════════════════════════════════════════════════════════
// SENSORES
// ═══════════════════════════════════════════════════════════════════════

void leerSensores() {
  distanciaUltrasonico = leerUltrasonico();

  bool izqRaw = (digitalRead(PIN_IR_IZQ) == LOW);
  bool derRaw = (digitalRead(PIN_IR_DER) == LOW);

  irIzqContador = izqRaw ? min(irIzqContador + 1, IR_DEBOUNCE)
                         : max(irIzqContador - 1, 0);
  irDerContador = derRaw ? min(irDerContador + 1, IR_DEBOUNCE)
                         : max(irDerContador - 1, 0);

  irIzquierdoDetecta = (irIzqContador >= IR_DEBOUNCE);
  irDerechoDetecta   = (irDerContador >= IR_DEBOUNCE);
}

long leerUltrasonico() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long dur = pulseIn(PIN_ECHO, HIGH, 30000);
  if (dur == 0) return -1;
  long dist = dur * 0.034 / 2;
  return (dist < 2 || dist > 400) ? -1 : dist;
}

// ═══════════════════════════════════════════════════════════════════════
// SERVO
// ═══════════════════════════════════════════════════════════════════════

void actualizarServo(unsigned long ahora) {
  // FIX v3.5: Doble verificación para detener servo inmediatamente
  if (!modoBusquedaActivo) return;
  if (ahora - ultimoMovimientoServo < INTERVALO_SCAN_SERVO) return;
  ultimoMovimientoServo = ahora;

  anguloServo += (10 * direccionScan);

  if      (anguloServo >= SERVO_DER) { anguloServo = SERVO_DER; direccionScan = -1; }
  else if (anguloServo <= SERVO_IZQ) { anguloServo = SERVO_IZQ; direccionScan =  1; }

  servoRadar.write(anguloServo);
}

// ═══════════════════════════════════════════════════════════════════════
// BLUETOOTH - LECTURA
// ═══════════════════════════════════════════════════════════════════════

void leerBluetooth() {
  while (bluetooth.available()) {
    char c = bluetooth.read();
    if (c == '\n' || c == '\r') {
      if (bufferComando.length() > 0) {
        procesarComando(bufferComando);
        bufferComando = "";
      }
    } else {
      // Filtro anti-ruido: solo aceptar ASCII imprimible.
      // Si RX tiene falso contacto/ruido o baud incorrecto, pueden entrar bytes basura.
      if (c >= 32 && c <= 126) {
        bufferComando += c;
        // Evitar crecimiento infinito si llegan streams corruptos sin \n
        if (bufferComando.length() > 32) {
          bufferComando = "";
        }
      } else {
        // Byte no imprimible: descartar y resetear buffer para no mezclar comandos
        bufferComando = "";
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BLUETOOTH - PROCESAMIENTO DE COMANDOS
// ═══════════════════════════════════════════════════════════════════════

void procesarComando(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  // Validación extra: comandos solo con charset seguro
  for (unsigned int i = 0; i < cmd.length(); i++) {
    char ch = cmd.charAt(i);
    if (!(ch >= '0' && ch <= '9') &&
        !(ch >= 'A' && ch <= 'Z') &&
        ch != ':' && ch != ',' && ch != '_' && ch != '-') {
      // Comando corrupto/ruidoso: ignorar
      return;
    }
  }

  Serial.print(F("CMD: "));
  Serial.println(cmd);

  // FIX v3.3: Resetear timer en CUALQUIER comando válido
  ultimoComandoRecibido = millis();

  // ── Comandos de una sola letra ──────────────────────────────────────
  if (cmd == "F") { if (estadoActual == MANUAL) ultimoMovimiento = 'F'; return; }
  if (cmd == "B") { if (estadoActual == MANUAL) ultimoMovimiento = 'B'; return; }
  if (cmd == "L") { if (estadoActual == MANUAL) ultimoMovimiento = 'L'; return; }
  if (cmd == "R") { if (estadoActual == MANUAL) ultimoMovimiento = 'R'; return; }
  if (cmd == "S") { ultimoMovimiento = 'S'; detener(); return; }

  // FIX v3.3: BEEP como comando completo (no solo primer char)
  if (cmd == "BEEP") {
    sonarBeep();
    bluetooth.println(F("BEEP:OK"));
    return;
  }

  // FIX v3.3: RESET como comando completo (alias de X)
  if (cmd == "RESET") {
    contadorHallazgos = 0;
    bluetooth.println(F("RESET:OK"));
    return;
  }

  // ── Comandos con parámetro (X:valor) ───────────────────────────────
  char tipo = cmd.charAt(0);

  switch (tipo) {

    // E: Modo
    case 'E':
      procesarModo(cmd);
      break;

    // V: Velocidad global
    case 'V':
      if (cmd.length() > 2 && cmd.charAt(1) == ':') {
        int vel = cmd.substring(2).toInt();
        velocidadManual = constrain(vel, VEL_MINIMA, VEL_MAXIMA);
        velocidadAuto   = constrain(vel * 85 / 100, VEL_MINIMA, VEL_MAXIMA);
        bluetooth.print(F("VEL:"));
        bluetooth.print(velocidadManual);
        bluetooth.print(F(","));
        bluetooth.println(velocidadAuto);
      }
      break;

    // A: Velocidad solo automática (legacy)
    case 'A':
      if (cmd.length() > 2 && cmd.charAt(1) == ':') {
        velocidadAuto = constrain(cmd.substring(2).toInt(), VEL_MINIMA, VEL_MAXIMA);
        bluetooth.print(F("VELA:"));
        bluetooth.println(velocidadAuto);
      }
      break;

    // FIX v3.5: D: Servo escaneo (D:0=OFF+centro, D:1=ON, D:2=ON alias)
    case 'D':
      if (cmd.length() > 2 && cmd.charAt(1) == ':') {
        char val = cmd.charAt(2);
        if (val == '0') {
          // D:0 detiene servo INMEDIATAMENTE y lo centra
          modoBusquedaActivo = false;
          servoRadar.write(SERVO_CENTRO);
          anguloServo = SERVO_CENTRO;
          bluetooth.println(F("SCAN:OFF"));
        } else if (val == '1' || val == '2') {
          // D:1 y D:2 ambos activan el scan
          modoBusquedaActivo = true;
          bluetooth.println(F("SCAN:ON"));
        }
      }
      break;

    // FIX v3.3: MS: Toggle búsqueda (MS:1=ON, MS:0=OFF)
    // El JS envía MS:1 / MS:0 desde btnToggleSearch
    case 'M':
      if (cmd.length() > 3 && cmd.charAt(1) == 'S' && cmd.charAt(2) == ':') {
        bool activar = (cmd.charAt(3) == '1');
        modoBusquedaActivo = activar;
        if (!activar) {
          servoRadar.write(SERVO_CENTRO);
          anguloServo = SERVO_CENTRO;
        }
        bluetooth.print(F("SCAN:"));
        bluetooth.println(activar ? F("ON") : F("OFF"));
      }
      break;

    // C: Posición servo directa
    case 'C':
      if (cmd.length() > 2 && cmd.charAt(1) == ':') {
        modoBusquedaActivo = false;
        anguloServo = constrain(cmd.substring(2).toInt(), 0, 180);
        servoRadar.write(anguloServo);
      }
      break;

    // FIX v3.3: P = Ping — solo resetea timer, responde mínimo
    // NO envía status completo para no saturar BLE
    case 'P':
      bluetooth.println(F("P:OK"));
      break;

    // X: Reset contadores
    case 'X':
      contadorHallazgos = 0;
      bluetooth.println(F("RESET:OK"));
      break;

    default:
      bluetooth.print(F("ERR:Desconocido:"));
      bluetooth.println(cmd);
      break;
  }
}

void procesarModo(String cmd) {
  if (cmd.length() < 3 || cmd.charAt(1) != ':') return;
  int modo = cmd.substring(2).toInt();

  switch (modo) {
    case 0: cambiarEstado(IDLE);       break;
    case 1: cambiarEstado(EXPLORANDO); break;
    case 2: cambiarEstado(MANUAL);     break;
    case 3: cambiarEstado(BAILANDO);   break;
    default:
      bluetooth.print(F("ERR:Modo invalido:"));
      bluetooth.println(modo);
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TIMEOUT MODO MANUAL
// ═══════════════════════════════════════════════════════════════════════

void verificarTimeoutConexion(unsigned long ahora) {
  if (estadoActual != MANUAL) return;
  if (ahora - ultimoComandoRecibido > TIMEOUT_RECONEXION) {
    // No volver a AUTO automáticamente: solo cambiar a AUTO cuando lo ordene el usuario (E:1)
    Serial.println(F("Timeout BT - deteniendo (sin cambiar a AUTO)"));
    bluetooth.println(F("MSG:Timeout BT, deteniendo"));
    detener();
    cambiarEstado(IDLE);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// STATUS PERIÓDICO
// ═══════════════════════════════════════════════════════════════════════

void enviarStatus() {
  bluetooth.print(F("DIST:"));  bluetooth.println(distanciaUltrasonico);
  bluetooth.print(F("IR:"));    bluetooth.print(irIzquierdoDetecta ? 1 : 0);
                                bluetooth.print(F(","));
                                bluetooth.println(irDerechoDetecta ? 1 : 0);
  bluetooth.print(F("ANG:"));   bluetooth.println(anguloServo);
  bluetooth.print(F("VEL:"));   bluetooth.print(velocidadManual);
                                bluetooth.print(F(","));
                                bluetooth.println(velocidadAuto);
  // FIX: No enviar FIND aquí - solo se envía cuando hay descubrimiento real
  // en ejecutarExplorando() con formato FIND:count,SENSOR:xxx
}

// ═══════════════════════════════════════════════════════════════════════
// SONIDOS
// ═══════════════════════════════════════════════════════════════════════

void sonarInicio() {
  tone(PIN_BUZZER, 440, 200); delay(220);
  tone(PIN_BUZZER, 554, 200); delay(220);
  tone(PIN_BUZZER, 659, 200); delay(220);
  tone(PIN_BUZZER, 880, 400); delay(400);
  noTone(PIN_BUZZER);
}

void sonarHallazgo() {
  for (int i = 0; i < 3; i++) {
    tone(PIN_BUZZER, 1200, 150); delay(200);
    tone(PIN_BUZZER, 1500, 150); delay(200);
  }
  noTone(PIN_BUZZER);
}

void sonarBaile() {
  int notas[] = {440, 554, 659, 880, 1100};
  tone(PIN_BUZZER, notas[random(5)], 100);
  delay(100);
  noTone(PIN_BUZZER);
}

void sonarAlerta() {
  tone(PIN_BUZZER, 300, 500);
  delay(500);
  noTone(PIN_BUZZER);
}

// FIX v3.3: BEEP dedicado (antes no existía como función)
void sonarBeep() {
  tone(PIN_BUZZER, 1000, 100); delay(120);
  tone(PIN_BUZZER, 1200, 100); delay(120);
  noTone(PIN_BUZZER);
}

// ═══════════════════════════════════════════════════════════════════════
// FIN - Rover Paleo v3.3
// ═══════════════════════════════════════════════════════════════════════