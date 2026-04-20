# 🔧 FIXES.md — Rover Paleo Control Center

> **Análisis completado:** 19 Abril 2026  
> **Archivos analizados:** 15 archivos JS + 1 Arduino INO  
> **Total bugs identificados:** 15 (12 originales + 3 nuevos)

---

## 📊 RESUMEN EJECUTIVO

### Estado General del Proyecto
- ✅ **8 bugs YA CORREGIDOS** en commits anteriores
- ⚠️ **4 bugs REQUIEREN ATENCIÓN** (3 son mejoras arquitectónicas)
- 🟡 **3 bugs IMPORTANTES** (mejoras de calidad)
- 🔴 **Descubrimiento crítico:** Protocolo v2 duplicado e incompatible

### Decisión Arquitectónica Confirmada
**PROTOCOLO OFICIAL v1 (Simple) ← Mantener**  
**PROTOCOLO v2 (Estructurado) ← Eliminar/Deprecar**

| Protocolo | Formato Comandos | Formato Respuestas | Estado |
|-----------|------------------|-------------------|--------|
| **v1 (ACTIVO)** | `F`, `E:1`, `V:100`, `D:1` | `ST:`, `DIST:45`, `IR:1,0`, `FIND:3,SENSOR:LEFT` | ✅ **Operativo** |
| **v2 (HUÉRFANO)** | `MV\|d=F\|s=255`, `MD\|m=1` | `TELEM\|D=45\|IRL=1`, `DISC\|N=3` | ❌ **No conecta con Arduino** |

**El Arduino v3.5 SOLO entiende v1**. El archivo `protocolhandler.js` contiene código muerto que genera confusión.

---

## 🐛 BUGS PENDIENTES POR PRIORIDAD

---

### 🔴 Bug #4 — Versión Incorrecta en Logs
**Estado:** Requiere fix simple  
**Impacto:** Medio (consistencia)

#### **Archivo:** `js/main.js`
#### **Línea:** 184

**PROBLEMA:**
El log dice "v2.0" pero el proyecto es "v3.1"

**CÓDIGO ACTUAL:**
```javascript
// Línea 184
console.log('✅ Paleo Rover v2.0 cargado');
```

**CÓDIGO CORREGIDO:**
```javascript
console.log('✅ Paleo Rover v3.1 cargado');
```

**ESFUERZO:** ⏱️ Bajo (1 minuto)

---

### 🔴 Bug #13 — Protocolo v2 Duplicado e Incompatible
**Estado:** Requiere eliminación/refactorización  
**Impacto:** Alto (confusión de arquitectura, código muerto)

#### **Archivo:** `js/modules/protocolhandler.js` (TODO)

**PROBLEMA:**
El archivo `protocolhandler.js` implementa un protocolo v2 estructurado que NUNCA se conecta con el Arduino v3.5. El código del lado del servidor (ConnectionManager, CommandSender) usa el protocolo v1 simple, mientras que `main.js` importa `ProtocolHandler` pero principalmente lo usa para pings (`protocol.getPing()`) y notificaciones.

**CÓDIGO ACTUAL (main.js líneas 12, 50, 56-59, 102, 136):**
```javascript
// Línea 12
import { ProtocolHandler } from './modules/protocolhandler.js';

// Línea 50
const protocol = new ProtocolHandler(robotState);

// Líneas 56-59
setInterval(() => {
  if (robotState.connected && !commandSender.isSimulation) {
    commandSender.send(protocol.getPing());
  }
}, 5000);

// Línea 102
document.getElementById('btnCalibrate')?.addEventListener('click', () => {
  commandSender.send('X');
  robotState.addLogMessage('🔧 Calibración IR iniciada');
});

// Línea 136
protocol.requestNotificationPermission();
```

**REVISIÓN NECESARIA:**
El `protocol.getPing()` genera `P\n` según el código de `protocolhandler.js` línea 290, que SÍ es compatible con el Arduino (comando `P` sin parámetros es válido en v1). Sin embargo, el resto del protocolo v2 no se usa para comunicación real.

**OPCIONES:**
1. **OPCIÓN A (Recomendada):** Eliminar completamente `protocolhandler.js` y mover funcionalidad útil (ping, notificaciones) a `commandSender.js` o crear `notifications.js` más simple.

2. **OPCIÓN B:** Mantener solo las funciones útiles de `protocolhandler.js` (ping, notificaciones) y eliminar todo el sistema de encode/decode del protocolo v2.

**DECISIÓN:** Ver sección "Archivos a Eliminar" al final.

**ESFUERZO:** ⏱️ Medio-Alto (requiere limpieza de dependencias)

---

### 🔴 Bug #14a — Acceso Directo a Estado Privado (StorageManager)
**Estado:** Requiere encapsulamiento  
**Impacto:** Medio (arquitectura, posible corrupción de estado)

#### **Archivo:** `js/modules/storagemanager.js`

**PROBLEMA:**
Accede directamente a `this.state._state.discoveries`, `this.state._state.position`, y `this.state._trail`, rompiendo el encapsulamiento de `RobotState`.

**CÓDIGO ACTUAL (líneas 68-86):**
```javascript
// Línea 68
this.state._state.discoveries = Array.isArray(data.discoveries)
  ? data.discoveries.map(d => ({
      ...d,
      position: d.position ? { x: d.position.x, y: d.position.y } : { x: 0, y: 0 }
    }))
  : [];

// Línea 75
this.state._trail = Array.isArray(data.trail)
  ? data.trail.map(point => ({ x: point.x, y: point.y }))
  : [{ x: 150, y: 150 }];

// Línea 79-83
this.state._state.position = data.position
  ? { x: data.position.x, y: data.position.y }
  : this.state._trail[this.state._trail.length - 1] || { x: 150, y: 150 };

this.state._state.angle = typeof data.angle === 'number' ? data.angle : 0;
this.state._notify('reset', null);
```

**CÓDIGO CORREGIDO:**

Primero, agregar métodos setter en `js/modules/robotstate.js` después de la clase existente:

```javascript
// AGREGAR en RobotState.js después de addDiscovery()

/**
 * Restaura hallazgos desde storage
 * @param {Array} discoveries - Array de objetos de hallazgo
 */
setDiscoveries(discoveries) {
  this._state.discoveries = Array.isArray(discoveries)
    ? discoveries.map(d => ({
        ...d,
        position: d.position ? { x: d.position.x, y: d.position.y } : { x: 0, y: 0 }
      }))
    : [];
  this._state.findCount = this._state.discoveries.length;
  this._notify('discoveries', this._state.discoveries);
}

/**
 * Establece el trail completo
 * @param {Array} trail - Array de puntos {x, y}
 */
setTrail(trail) {
  this._trail = Array.isArray(trail)
    ? trail.map(point => ({ x: point.x, y: point.y }))
    : [{ x: 150, y: 150 }];
  this._notify('trail', this._trail);
}

/**
 * Establece posición y ángulo del robot
 * @param {Object} position - {x, y}
 * @param {number} angle - Ángulo en grados
 */
setPosition(position, angle = 0) {
  this._state.position = position
    ? { x: position.x, y: position.y }
    : this._trail[this._trail.length - 1] || { x: 150, y: 150 };
  this._state.angle = typeof angle === 'number' ? angle : 0;
  this._notify('position', this._state.position);
  this._notify('reset', null);
}
```

Luego, actualizar `storagemanager.js`:

```javascript
// NUEVO (línea 65-87)
restoreDiscoveries(data) {
  if (!data) return;

  this.state.setDiscoveries(data.discoveries || []);
  this.state.setTrail(data.trail || [{ x: 150, y: 150 }]);
  this.state.setPosition(data.position, data.angle);

  this.state.addLogMessage('📥 Expedición restaurada desde el guardado');
}
```

**ESFUERZO:** ⏱️ Medio (requiere modificar 2 archivos, probar restauración)

---

### 🔴 Bug #14b — Acceso Directo a Estado Privado (MissionRecorder)
**Estado:** Requiere encapsulamiento  
**Impacto:** Medio

#### **Archivo:** `js/modules/missionrecorder.js`
#### **Línea:** 142

**PROBLEMA:**
Al reproducir misiones, accede directamente a `this.state._state.position`.

**CÓDIGO ACTUAL (línea 142-143):**
```javascript
case 'position':
  this.state._state.position = { ...entry.value };
  this.state._notify('position', entry.value);
  break;
```

**CÓDIGO CORREGIDO:**
```javascript
case 'position':
  this.state.setPosition(entry.value, this.state.angle);
  break;
```

*(Requiere el método `setPosition()` agregado en Bug #14a)*

**ESFUERZO:** ⏱️ Bajo (una vez implementado setPosition)

---

### 🔴 Bug #15 — AudioFeedback sin Cleanup
**Estado:** Requiere función destroy  
**Impacto:** Bajo-Medio (memory leak potencial)

#### **Archivo:** `js/modules/audiofeedback.js`

**PROBLEMA:**
Se suscribe a eventos de estado pero no guarda el handler de unsubscribe, y no hay método `destroy()` para limpieza.

**CÓDIGO ACTUAL (líneas 48-78):**
```javascript
_subscribeToEvents() {
  this._moveCounter = 0;

  this.state.subscribe((event, value) => {
    // ... código de switch ...
  });
}
```

**CÓDIGO CORREGIDO:**
```javascript
constructor(robotState) {
  this.state = robotState;
  this.enabled = true;
  this.volume = 0.3;
  this._initialized = false;
  this._unsubscribe = null;  // ← AGREGAR

  this.audioContext = null;
  this._setupUserInteraction();
  this._subscribeToEvents();
}

_subscribeToEvents() {
  this._moveCounter = 0;

  // ← GUARDAR unsubscribe
  this._unsubscribe = this.state.subscribe((event, value) => {
    if (!this.enabled) return;
    // ... código de switch sin cambios ...
  });
}

// AGREGAR al final de la clase
destroy() {
  if (this._unsubscribe) {
    this._unsubscribe();
    this._unsubscribe = null;
  }
  if (this.audioContext) {
    this.audioContext.close().catch(console.warn);
    this.audioContext = null;
  }
}
```

**USO en main.js:**
Agregar cleanup apropiado cuando se destruye la app (opcional, para apps de larga duración):
```javascript
// En main.js, opcionalmente agregar para cleanup:
window.addEventListener('beforeunload', () => {
  if (window.paleoRover?.audio) {
    window.paleoRover.audio.destroy();
  }
});
```

**ESFUERZO:** ⏱️ Bajo

---

## 🟡 IMPORTANTES

---

### 🟡 Bug #11 — Mapa Usa Simulación en Lugar de Odometría Real
**Estado:** Mejora de precisión  
**Impacto:** Medio-Alto (precisión del mapa)

#### **Archivo:** `js/modules/robotstate.js`
#### **Línea:** 135

**PROBLEMA:**
La función `updatePosition()` usa velocidad de simulación fija (`const speed = 2`) en lugar de datos reales del Arduino. Existe código para recibir `POS:` del Arduino (en `connectionmanager.js` líneas 389-396) pero se mezcla mal con la simulación.

**ANÁLISIS:**
En `connectionmanager.js` línea 389-396:
```javascript
case 'POS': {
  const [x, y, angle] = value.split(',').map(Number);
  if (!isNaN(x) && !isNaN(y)) {
    this.state._state.position = { x, y };        // ← Acceso directo (Bug #14 también)
    this.state._state.angle = angle || 0;
    this.state._notify('position', this.state.position);
  }
  break;
}
```

El Arduino v3.5 NO envía `POS:x,y,angle` actualmente - el tracking de posición es puramente simulado en lado JS.

**OPCIONES:**

1. **MANTENER SIMULACIÓN (Opción actual):**
   - Documentar que el mapa es aproximado/simulado
   - Aceptar limitaciones de precisión

2. **IMPLEMENTAR ODOMETRÍA REAL (Recomendado si Arduino lo soporta):**
   - Requiere modificar Arduino para enviar `POS:x,y,angle` periódicamente
   - O implementar contadores de encoder en Arduino (si el robot tiene encoders)

**DECISIÓN PENDIENTE:**¿El Arduino v3.5 puede enviar posición real? Si no tiene encoders de rueda, la simulación es la única opción.

**ESFUERZO:** ⏱️ Alto (si requiere modificar Arduino + calibración)

---

### 🟡 Bug #10 — Preferencia de Conexión No Persistente
**Estado:** Mejora UX  
**Impacto:** Bajo (conveniencia)

#### **Archivo:** `js/modules/commandsender.js`

**PROBLEMA:**
El tipo de conexión usada (Serial/BLE/Sim) no se guarda en localStorage. El usuario debe seleccionar cada vez.

**CÓDIGO ACTUAL (líneas 35-54 de commandsender.js):**
```javascript
async connectReal(type = 'serial') {
  this._simulationMode = false;
  this._stopAutoSimulation();

  let success = false;

  if (type === 'serial') {
    success = await this.connection.connectSerial();
  } else if (type === 'bluetooth') {
    success = await this.connection.connectBluetooth();
  }
  // ...
}
```

**CÓDIGO CORREGIDO:**
```javascript
async connectReal(type = 'serial') {
  this._simulationMode = false;
  this._stopAutoSimulation();

  let success = false;

  if (type === 'serial') {
    success = await this.connection.connectSerial();
  } else if (type === 'bluetooth') {
    success = await this.connection.connectBluetooth();
  }

  if (success) {
    localStorage.setItem('paleo_lastConnectionType', type);
  }

  return success;
}

// En constructor, agregar detección de último tipo:
constructor(robotState) {
  this.state = robotState;
  this.connection = new ConnectionManager(robotState);
  
  // ... código existente ...
  
  // Detectar último tipo usado (para UI)
  this._lastConnectionType = localStorage.getItem('paleo_lastConnectionType');
  if (this._lastConnectionType) {
    this.state.addLogMessage(`Última conexión usada: ${this._lastConnectionType}`);
  }
}
```

**ESFUERZO:** ⏱️ Bajo

---

### 🟡 Bug #12 — Confirmación de Comandos (ACK) Parcial
**Estado:** Mejora de fiabilidad  
**Impacto:** Medio

El Arduino YA responde ACKs (`P:OK`, `BEEP:OK`, `RESET:OK`, `SCAN:ON/OFF`) pero el cliente no los utiliza para confirmar entrega.

**IMPLEMENTACIÓN OPCIONAL:**
Agregar sistema de "comandos pendientes de ACK" con timeout y retry:

```javascript
// En CommandSender.js, opcional:
async sendWithRetry(command, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const result = await this.send(command);
    if (result.success) return result;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Max retries reached');
}
```

**ESFUERZO:** ⏱️ Medio

---

## ✅ BUGS YA CORREGIDOS (No requieren acción)

| # | Bug | Archivo | Estado |
|---|-----|---------|--------|
| #1 | Botón "Activar Búsqueda" activa baile | `eventhandlers.js` | ✅ CORREGIDO - Ahora envía `D:1`/`D:0` |
| #2 | UI bloqueada tras desconexión | `connectionmanager.js` + `eventhandlers.js` | ✅ CORREGIDO - Cleanup completo en `disconnect()` |
| #3 | UUID BLE incorrecto | `connectionmanager.js` | ✅ CORREGIDO - UUID v1: `0000ffe0...` |
| #5 | D-Pad sin Stop al soltar fuera | `eventhandlers.js` | ✅ CORREGIDO - Usa `mouseleave` + `touchcancel` |
| #6 | Sin validación de modo en movimiento | `commandsender.js` + `eventhandlers.js` | ✅ CORREGIDO - Verifica modo en línea 130 |
| #7 | Hallazgos sin timestamp | `robotstate.js` | ✅ CORREGIDO - `addDiscovery()` incluye timestamp línea 163 |
| #8 | Memory leak en observers | `robotstate.js` | ✅ CORREGIDO - `subscribe()` retorna cleanup línea 204-207 |
| #9 | Timestamp presente | N/A | ✅ CORREGIDO - Cubierto por #7 |

---

## 🗑️ ARCHIVOS A ELIMINAR O REFACTORIZAR

### 🗑️ ELIMINAR: `js/modules/protocolhandler.js`
**Razón:** Protocolo v2 incompatible con Arduino v3.5, código muerto genera confusión.

**Pasos para eliminación segura:**
1. Revisar que `protocol.getPing()` (línea 289) realmente genera solo `P\n` que ES compatible v1
2. Mover funcionalidad útil (notificaciones, ping) a archivos existentes
3. Actualizar `js/main.js` para remover import
4. Probar que el app sigue funcionando (simulación + conexión real)

**Funcionalidad a preservar de `protocolhandler.js`:**
- `requestNotificationPermission()` → Mover a `uicontroller.js` o nuevo `notificationmanager.js`
- `getPing()` → Reemplazar con simple `return 'P\n';` en `commandsender.js`

### 🔄 REFACTORIZAR: `js/modules/robotstate.js`
**Añadir métodos setter formales para mantener encapsulamiento:**
- `setDiscoveries(discoveries)`
- `setTrail(trail)`
- `setPosition(position, angle)`

### 🔄 REFACTORIZAR: `js/modules/audiofeedback.js`
**Añadir método:**
- `destroy()` para cleanup de suscripción

---

## ✅ DECISIÓN DE PROTOCOLO - CONFIRMADA

### Protocolo Oficial: v1 (Simple)

**Comandos App → Arduino:**
| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `F`, `B`, `L`, `R` | Movimiento direccional | `F` |
| `S` | Stop | `S` |
| `E:N` | Modo (0=IDLE, 1=EXPLORANDO, 2=MANUAL, 3=BAILANDO) | `E:1` |
| `V:N` | Velocidad manual | `V:100` |
| `D:N` | Servo (0=OFF, 1=ON, alias) | `D:1` |
| `BEEP` | Sonido beep | `BEEP` |
| `P` | Ping/keepalive | `P` |
| `RESET` | Reset contadores | `RESET` |
| `X` | Calibración IR | `X` |

**Respuestas Arduino → App:**
| Mensaje | Descripción |
|---------|-------------|
| `ST:ESTADO` | Cambio de estado (IDLE, EXPLORANDO, MANUAL, HALLAZGO, EVITANDO, BAILANDO) |
| `DIST:N` | Distancia ultrasónico en cm |
| `IR:0,1` | Estado sensores IR (izq,der) 0/1 |
| `FIND:N,SENSOR:X` | Hallazgo con número y sensor usado |
| `VEL:M,A` | Velocidades manual y auto |
| `ANG:N` | Ángulo actual del servo |
| `SCAN:ON/OFF` | Estado del escaneo |
| `P:OK` | Respuesta a ping |
| `MSG:texto` | Mensajes informativos |

### Protocolo v2 (ProtocolHandler.js) → DEPRECAR
**NO utilizar para comunicación Arduino.** Considerar eliminación completa o mantener solo para posible feature futuro si se actualiza Arduino.

---

## 📋 ORDEN RECOMENDADO PARA APLICAR FIXES

1. **Bug #4** (Trivial - 1 minuto)
2. **Bug #14a+b** (Encapsulamiento - requiere probar restauración)
3. **Bug #15** (Audio cleanup - simple)
4. **Bug #13** (Eliminar protocolhandler.js - último, requiere testing)
5. **Bug #10** (Preferencia de conexión - UX)
6. **Bug #11** (Odometría - solo si se modifica Arduino)
7. **Bug #12** (ACKs - mejora opcional)

---

## 🎯 NOTAS PARA DESARROLLO

### Antes de aplicar cualquier fix:
1. ✅ Crear rama git: `git checkout -b fixes/auditoria-2025`
2. ✅ Hacer commit después de cada fix
3. ✅ Probar en simulación antes de conectar hardware real
4. ✅ Verificar que todos los tests pasan (si existen)

### Testing Manual Sugerido:
- [ ] Conexión simulación funciona
- [ ] D-Pad mueve robot en simulación
- [ ] Cambio de modos (AUTO/MANUAL) funciona
- [ ] Hallazgos se registran con timestamp
- [ ] Exportación JSON/CSV/HTML funciona
- [ ] Desconexión/reconexión funciona
- [ ] (Si tienes hardware) Conexión BLE real funciona

---

**Generado por:** Cline (Kimi 2.5)  
**Fecha:** 19 Abril 2026  
**Contexto usado:** 87,814 / 128K tokens (70%)
