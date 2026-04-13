# Paleo Rover Control Center 🦕

Una interfaz web moderna de control para un robot paleontológico basado en Arduino. Control de exploración con mapas en tiempo real, detección de fósiles, múltiples modos de operación, sonidos, gráficos y exportación de datos.

## Características principales

✨ **Interfaz intuitiva**
- Diseño temático paleontológico con paleta de colores tierra-arena-hueso
- Grid responsivo de 3 columnas + panel de estadísticas (Mapa | Controles | Hallazgos | Gráficos)
- Canvas interactivo con visualización en tiempo real

🦕 **Funcionalidades del robot**
- Modo AUTO: exploración automática con evasión de obstáculos
- Modo MANUAL: control con D-Pad, teclado o botones táctiles
- Detección de fósiles con sensores IR
- Medición de distancia ultrasónica
- Registro de hallazgos con localización

🔗 **Conectividad flexible**
- **Simulación**: pruebas sin hardware (por defecto)
- **USB-Serial**: conexión por cable (Web Serial API)
- **Bluetooth BLE**: conexión inalámbrica con HM-10, JDY-08 (Web Bluetooth API)

📊 **Visualización (Fase 4)**
- Mapa con cuadrícula de excavación
- Rastro del robot en tiempo real
- Indicadores de sensores (distancia, IR izq/der)
- **Gráficos en vivo de distancia ultrasónica**
- **Estadísticas en tiempo real (tiempo, distancia, velocidad)**
- Log en vivo de eventos
- Brújula con orientación del robot
- Animaciones de hallazgo

🔊 **Audio y Feedback (Fase 4)**
- Sonidos dinámicos con Web Audio API
- Fanfarria personalizada para hallazgos
- Sonidos de conexión/desconexión
- Control de volumen ajustable
- Toggle mute/unmute

💾 **Persistencia y Exportación (Fase 4)**
- Guardado automático en localStorage
- Exportación de reportes en **HTML** (documento interactivo)
- Exportación de datos en **CSV** (hoja de cálculo)
- Exportación en **JSON** (datos brutos)
- Restauración de expediciones previas

## Requisitos

- **Navegador**: Chrome, Chromium o Microsoft Edge (versión 64+)
  - Para USB-Serial: Web Serial API requerida
  - Para Bluetooth: Web Bluetooth API requerida
  - Web Audio API para sonidos
- **Hardware Arduino** (opcional):
  - Arduino UNO/NANO + driver de motores + sensores
  - HC-05/HC-06 (Bluetooth clásico) o HM-10 (Bluetooth BLE)

## Estructura del proyecto

```
paleo-rover/
├── index.html              # HTML principal
├── css/
│   └── styles.css          # Estilos paleontológicos
├── js/
│   ├── main.js             # Punto de entrada
│   └── modules/
│       ├── RobotState.js   # Gestión de estado (patrón Observer)
│       ├── UIController.js # Actualización de DOM
│       ├── MapRenderer.js  # Canvas del mapa
│       ├── CommandSender.js# Envío de comandos
│       ├── ConnectionManager.js  # Serial/Bluetooth
│       ├── EventHandlers.js # Eventos de usuario
│       ├── StorageManager.js      # Persistencia y exportación
│       ├── AudioFeedback.js       # Sonidos Web Audio
│       └── ChartManager.js        # Gráficos Canvas
└── .github/
    └── copilot-instructions.md
```

## Cómo usar

### 1. Abrir localmente
```bash
# Opción A: Servidor Python
python -m http.server 8000

# Opción B: Servidor Node (http-server)
npx http-server

# Opción C: VS Code Live Server
# (click derecho en index.html > Open with Live Server)
```

Luego abre en tu navegador:
```
http://localhost:8000
```

### 2. Modo Simulación (sin hardware)

1. Abre `index.html`
2. El sistema se conecta automáticamente en modo simulación
3. Prueba los botones:
   - 🤖 AUTO: inicia exploración automática
   - 🕹️ MANUAL: controla con D-Pad o teclado (↑↓←→)
   - 💃 Baile: empieza rutina de celebración
   - 🔍 Escaneo: servos de escaneo
   - 📢 Llamar: emite una señal
   - 🔄 Reset: reinicia la expedición
   - 🔊 Controla el volumen con el slider
   - 📄/📊/💾 Exporta reportes en diferentes formatos

### 3. Conexión real con Arduino

#### A) USB-Serial (con cable)

1. Conéctate con Arduino mediante USB
2. Haz clic en "Conectar" → "USB-Serial"
3. Selecciona el puerto en el diálogo del navegador
4. Código Arduino mínimo:
```cpp
void setup() {
  Serial.begin(9600); // HC-05/HC-06 típicamente usan 9600
}

void loop() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    // Procesar comandos: F, B, L, R, S, D:1, D:2, BEEP, RESET
  }
  
  // Enviar datos al navegador (uno por línea):
  // DIST:45      (distancia ultrasónica)
  // IR:L         (sensor izquierdo: L, R, B, N)
  // ST:EXPLORANDO (estado)
  // POS:150,150,45 (posición X,Y,ángulo)
  // LOG:mensaje  (log custom)
}
```

#### B) Bluetooth BLE (HM-10 con inalambricidad)

1. Haz clic en "Conectar" → "Bluetooth BLE"
2. Selecciona tu dispositivo HM-10
3. Conexión automática a servicio UART (UUID: 0000ffe0)

## Protocolo de comunicación

### Comandos desde navegador → Arduino

| Comando | Descripción |
|---------|-------------|
| `F` | Adelante |
| `B` | Atrás |
| `L` | Girar izquierda |
| `R` | Girar derecha |
| `S` | Detener |
| `M:0` | Modo IDLE |
| `M:1` | Modo EXPLORANDO (AUTO) |
| `M:2` | Modo MANUAL |
| `D:1` | Ejecutar danza 1 (baile) |
| `D:2` | Ejecutar danza 2 (escaneo) |
| `BEEP` | Emitir sonido |
| `RESET` | Reiniciar |

### Datos desde Arduino → Navegador

Enviar líneas con formato `CLAVE:VALOR`

| Formato | Ejemplo | Descripción |
|---------|---------|-------------|
| `DIST:valor` | `DIST:45` | Distancia en cm (0-400) |
| `IR:sensor` | `IR:L` | Sensor IR (L=izq, R=der, B=ambos, N=ninguno) |
| `ST:modo` | `ST:EXPLORANDO` | Estado actual |
| `POS:x,y,angulo` | `POS:150,150,45` | Posición y orientación |
| `LOG:mensaje` | `LOG:Hallazgo!` | Mensaje custom |

## Paleta de colores (tema paleontológico)

```css
--color-earth-dark: #3D2914    /* Tierra oscura */
--color-sand: #C4A35A         /* Arena */
--color-bone: #E8DCC4         /* Hueso */
--color-rust: #8B4513         /* Óxido/botones */
--color-moss: #6B8E23         /* Verde musgo */
--color-clay: #A0522D         /* Arcilla roja */
```

## API JavaScript

### Acceso desde consola

```javascript
// Estado global
window.paleoRover.state          // RobotState
window.paleoRover.sender         // CommandSender
window.paleoRover.map            // MapRenderer
window.paleoRover.storage        // StorageManager (NEW)
window.paleoRover.audio          // AudioFeedback (NEW)
window.paleoRover.charts         // ChartManager (NEW)

// Conexión
await window.paleoRover.connect('serial')      // USB
await window.paleoRover.connect('bluetooth')   // BLE
await window.paleoRover.disconnect()

// Control
window.paleoRover.state.setMode('MANUAL')
window.paleoRover.state.addDiscovery('LEFT')
window.paleoRover.state.updatePosition(0, -1)  // Adelante

// Exportación (NEW - Fase 4)
window.paleoRover.export('html')  // HTML report
window.paleoRover.export('csv')   // CSV data
window.paleoRover.export('json')  // JSON data

// Audio (NEW - Fase 4)
window.paleoRover.testAudio()     // Demo de sonidos
window.paleoRover.audio.toggle()  // Mute/unmute
window.paleoRover.audio.setVolume(0.5) // 0-1
```

## Características avanzadas

### Modo Observer del estado
```javascript
const unsub = robotState.subscribe((evento, valor, estado) => {
  console.log(`Cambio: ${evento} = ${valor}`);
});

// Desuscribirse
unsub();
```

### Extensión con nuevos sensores

1. Agregar a `RobotState.js`:
```javascript
this._state.nuevoSensor = 0;
get nuevoSensor() { return this._state.nuevoSensor; }
setNuevoSensor(val) {
  this._state.nuevoSensor = val;
  this._notify('nuevoSensor', val);
}
```

2. Procesar en `ConnectionManager.js`:
```javascript
case 'NUEVO':
  this.state.setNuevoSensor(parseFloat(value));
  break;
```

3. Renderizar en `UIController.js`:
```javascript
case 'nuevoSensor':
  document.getElementById('nuevoSensor').textContent = value;
  break;
```

## Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| "Web Serial API no soportada" | Navegador viejo | Actualiza Chrome/Edge |
| Bluetooth no aparece | Permisos no concedidos | Revisa permisos HTTPS |
| Arduino no se conecta | Puerto incorrecto | Verifica puerto en consola |
| Datos no llegan | Baudrate incorrecto | Usa 9600 (HC-05 default) |
| Sin sonidos | Audio desactivado | Haz clic en 🔊 para activar |
| Gráficos no se ven | Canvas no soportado | Usa navegador moderno |

## Desarrollo futuro

- [ ] Mapeo 3D del área excavada
- [ ] Calibración interactiva de sensores
- [ ] Grabación y reproducción de rutas
- [ ] Modo multirrobot
- [ ] Análisis estadístico de hallazgos (gráficos avanzados)
- [ ] Tema claro/oscuro alternativo
- [ ] Internacionalización (i18n)
- [ ] PWA (Progressive Web App) para offline

## Fases de desarrollo

| Fase | Nombre | Contenido | Status |
|------|--------|----------|--------|
| 1 | UI Visual | HTML + CSS temático | ✅ |
| 2 | JavaScript Base | Módulos core + simulación | ✅ |
| 3 | Conectividad | Web Serial + Web Bluetooth | ✅ |
| 4 | Polish | Storage + Audio + Gráficos | ✅ |

## Licencia

MIT - Libre para uso educativo y comercial

## Créditos

Diseño e implementación con arquitectura modular siguiendo patrones avanzados de JavaScript moderno (ES6+), Web APIs y principios SOLID.

---

**¿Listo para la expedición? 🦕🏜️**

Abre `index.html` en tu navegador y ¡comienza a explorar!


## Requisitos

- **Navegador**: Chrome, Chromium o Microsoft Edge (versión 64+)
  - Para USB-Serial: Web Serial API requerida
  - Para Bluetooth: Web Bluetooth API requerida
- **Hardware Arduino** (opcional):
  - Arduino UNO/NANO + driver de motores + sensores
  - HC-05/HC-06 (Bluetooth clásico) o HM-10 (Bluetooth BLE)

## Estructura del proyecto

```
paleo-rover/
├── index.html              # HTML principal
├── css/
│   └── styles.css          # Estilos paleontológicos
└── js/
    ├── main.js             # Punto de entrada
    └── modules/
        ├── RobotState.js   # Gestión de estado (patrón Observer)
        ├── UIController.js # Actualización de DOM
        ├── MapRenderer.js  # Canvas del mapa
        ├── CommandSender.js# Envío de comandos
        ├── ConnectionManager.js  # Serial/Bluetooth
        └── EventHandlers.js # Eventos de usuario
```

## Cómo usar

### 1. Abrir localmente
```bash
# Opción A: Servidor Python
python -m http.server 8000

# Opción B: Servidor Node (http-server)
npx http-server

# Opción C: VS Code Live Server
# (click derecho en index.html > Open with Live Server)
```

Luego abre en tu navegador:
```
http://localhost:8000
```

### 2. Modo Simulación (sin hardware)

1. Abre `index.html`
2. El sistema se conecta automáticamente en modo simulación
3. Prueba los botones:
   - 🤖 AUTO: inicia exploración automática
   - 🕹️ MANUAL: controla con D-Pad o teclado (↑↓←→)
   - 💃 Baile: empieza rutina de celebración
   - 🔍 Escaneo: servos de escaneo
   - 📢 Llamar: emite una señal
   - 🔄 Reset: reinicia la expedición

### 3. Conexión real con Arduino

#### A) USB-Serial (con cable)

1. Conéctate con Arduino mediante USB
2. Haz clic en "Conectar" → "USB-Serial"
3. Selecciona el puerto en el diálogo del navegador
4. Código Arduino mínimo:
```cpp
void setup() {
  Serial.begin(9600); // HC-05/HC-06 típicamente usan 9600
}

void loop() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    // Procesar comandos: F, B, L, R, S, D:1, D:2, BEEP, RESET
  }
  
  // Enviar datos al navegador (uno por línea):
  // DIST:45      (distancia ultrasónica)
  // IR:L         (sensor izquierdo: L, R, B, N)
  // ST:EXPLORANDO (estado)
  // POS:150,150,45 (posición X,Y,ángulo)
}
```

#### B) Bluetooth BLE (HM-10 con inalambricidad)

1. Haz clic en "Conectar" → "Bluetooth BLE"
2. Selecciona tu dispositivo HM-10
3. Conexión automática a servicio UART (UUID: 0000ffe0)

## Protocolo de comunicación

### Comandos desde navegador → Arduino

| Comando | Descripción |
|---------|-------------|
| `F` | Adelante |
| `B` | Atrás |
| `L` | Girar izquierda |
| `R` | Girar derecha |
| `S` | Detener |
| `M:0` | Modo IDLE |
| `M:1` | Modo EXPLORANDO (AUTO) |
| `M:2` | Modo MANUAL |
| `D:1` | ejecutar danza 1 (baile) |
| `D:2` | Ejecutar danza 2 (escaneo) |
| `BEEP` | Emitir sonido |
| `RESET` | Reiniciar |

### Datos desde Arduino → Navegador

Enviar líneas con formato `CLAVE:VALOR`

| Formato | Ejemplo | Descripción |
|---------|---------|-------------|
| `DIST:valor` | `DIST:45` | Distancia en cm (0-400) |
| `IR:sensor` | `IR:L` | Sensor IR (L=izq, R=der, B=ambos, N=ninguno) |
| `ST:modo` | `ST:EXPLORANDO` | Estado actual |
| `POS:x,y,angulo` | `POS:150,150,45` | Posición y orientación |
| `LOG:mensaje` | `LOG:Hallazgo!` | Mensaje custom |

## Paleta de colores (tema paleontológico)

```css
--color-earth-dark: #3D2914    /* Tierra oscura */
--color-sand: #C4A35A         /* Arena */
--color-bone: #E8DCC4         /* Hueso */
--color-rust: #8B4513         /* Óxido/botones */
--color-moss: #6B8E23         /* Verde musgo */
--color-clay: #A0522D         /* Arcilla roja */
```

## API JavaScript

### Acceso desde consola

```javascript
// Estado global
window.paleoRover.state          // RobotState
window.paleoRover.sender         // CommandSender
window.paleoRover.map            // MapRenderer

// Conexión
await window.paleoRover.connect('serial')      // USB
await window.paleoRover.connect('bluetooth')   // BLE
await window.paleoRover.disconnect()

// Control
window.paleoRover.state.setMode('MANUAL')
window.paleoRover.state.addDiscovery('LEFT')
window.paleoRover.state.updatePosition(0, -1)  // Adelante
```

## Características avanzadas

### Modo Observer del estado
```javascript
const unsub = robotState.subscribe((evento, valor, estado) => {
  console.log(`Cambio: ${evento} = ${valor}`);
});

// Desuscribirse
unsub();
```

### Extensión con nuevos sensores

1. Agregar a `RobotState.js`:
```javascript
this._state.nuevoSensor = 0;
get nuevoSensor() { return this._state.nuevoSensor; }
setNuevoSensor(val) {
  this._state.nuevoSensor = val;
  this._notify('nuevoSensor', val);
}
```

2. Procesar en `ConnectionManager.js`:
```javascript
case 'NUEVO':
  this.state.setNuevoSensor(parseFloat(value));
  break;
```

3. Renderizar en `UIController.js`:
```javascript
case 'nuevoSensor':
  document.getElementById('nuevoSensor').textContent = value;
  break;
```

## Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| "Web Serial API no soportada" | Navegador viejo | Actualiza Chrome/Edge |
| Bluetooth no aparece | Permisos no concedidos | Revisa permisos HTTPS |
| Arduino no se conecta | Puerto incorrecto | Verifica puerto en consola |
| Datos no llegan | Baudrate incorrecto | Usa 9600 (HC-05 default) |

## Desarrollo futuro

- [ ] Mapeo 3D del área excavada
- [ ] Export de datos/mapas (JSON, CSV)
- [ ] Configuración de sensores (calibración)
- [ ] Grabación y reproducción de rutas
- [ ] Modo multirrobot
- [ ] Análisis estadístico de hallazgos

## Licencia

MIT - Libre para uso educativo y comercial

## Créditos

Diseño e implementación con arquitectura modular siguiendo el patrón Observer de JavaScript moderno (ES6+).

---

**¿Listo para la expedición? 🦕🏜️**

Abre `index.html` en tu navegador y ¡comienza a explorar!
