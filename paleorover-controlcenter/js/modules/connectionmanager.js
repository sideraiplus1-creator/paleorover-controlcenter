/**
 * ConnectionManager.js
 * Gestiona conexiones: Simulación, Web Serial, o Web Bluetooth
 */

export class ConnectionManager {
    constructor(robotState) {
        this.state = robotState;
        this.type = 'simulation';

        this.port = null;
        this.reader = null;
        this.writer = null;

        this.device = null;
        this.server = null;
        this.characteristic = null;

        this._readLoopRunning = false;
        this._messageQueue = [];
        this._bluetoothBuffer = '';
        this._lastDiscoveryTime = 0;

        this._heartbeatInterval = null;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 3;
        this._isReconnecting = false;
        this._commandQueue = [];
        this._sending = false;

        // FIX: watchdog — "Sin respuesta" solo si no llega NADA en 4s
        this._lastRxTime = Date.now();
        this._watchdogInterval = null;
    }

    // ═══════════════════════════════════════════════════════
    // WEB SERIAL
    // ═══════════════════════════════════════════════════════

    async connectSerial() {
        try {
            // FIX v3.4: Reiniciar estado al conectar para evitar datos residuales
            this.state.setIR(false, false);
            this.state.setDistance(-1);
            if (!('serial' in navigator)) throw new Error('Web Serial API no soportada. Usa Chrome/Edge.');
            this.state.addLogMessage('Solicitando puerto USB-Serial...');
            this.port = await navigator.serial.requestPort({
                filters: [{ usbVendorId: 0x1A86 }, { usbVendorId: 0x0403 }]
            });
            await this.port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
            this.type = 'serial';
            this.state.setConnected(true);
            this.state.addLogMessage('✅ Conectado por USB-Serial a 9600 baud');
            this._startSerialRead();
            this._startWatchdog();
            return true;
        } catch (error) {
            this.state.addLogMessage(`❌ Error Serial: ${error.message}`);
            return false;
        }
    }

    async _startSerialRead() {
        if (!this.port || this._readLoopRunning) return;
        this._readLoopRunning = true;
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (this.port.readable && this._readLoopRunning) {
                this.reader = this.port.readable.getReader();
                try {
                    while (true) {
                        const { value, done } = await this.reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop();
                        for (const line of lines) this._processIncomingMessage(line.trim());
                    }
                } finally {
                    this.reader.releaseLock();
                }
            }
        } catch (error) {
            this.state.addLogMessage('⚠️ Error de lectura');
        } finally {
            this._readLoopRunning = false;
        }
    }

    // ═══════════════════════════════════════════════════════
    // WEB BLUETOOTH
    // ═══════════════════════════════════════════════════════

    async connectBluetooth() {
        try {
            // FIX v3.4: Reiniciar estado IR al reconectar para evitar falsos positivos
            this.state.setIR(false, false);
            this.state.setDistance(-1);
            this._bluetoothBuffer = '';
            this._bluetoothBuffer = '';
            // Web Bluetooth requiere:
            // - Navegador compatible (Chrome/Edge Android, Chrome/Edge desktop)
            // - Contexto seguro (HTTPS o localhost)
            if (!('bluetooth' in navigator)) {
                throw new Error('Web Bluetooth no soportado en este navegador. En móvil usa Chrome/Edge en Android; en iPhone/iPad (Safari) no está soportado.');
            }
            if (typeof window !== 'undefined' && window.isSecureContext === false) {
                const proto = (typeof location !== 'undefined' && location.protocol) ? location.protocol : 'inseguro';
                throw new Error(`Web Bluetooth requiere HTTPS (contexto seguro). Actualmente: ${proto}. Sirve la página por https o desde http://localhost.`);
            }
            this.state.addLogMessage('Buscando dispositivo BLE...');
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
            });
            this.state.addLogMessage(`Encontrado: ${this.device.name}`);
            this.server = await this.device.gatt.connect();
            const service = await this.server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
            this.characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', (e) => this._onBluetoothData(e));
            this.type = 'bluetooth';
            this.state.setConnected(true);
            this.state.addLogMessage('✅ Conectado por Bluetooth BLE');
            this.device.addEventListener('gattserverdisconnected', () => {
                this._stopHeartbeat();
                this._stopWatchdog();
                this.state.addLogMessage('⚠️ Bluetooth desconectado');
                this._attemptReconnect();
            });
            this._startHeartbeat();
            this._startWatchdog();
            this._reconnectAttempts = 0;
            return true;
        } catch (error) {
            const name = error?.name || '';
            const msg = error?.message || String(error);
            // Errores típicos en móvil:
            // - SecurityError: no es HTTPS
            // - NotAllowedError: usuario canceló o no fue un gesto del usuario / permisos del sitio
            // - NotFoundError: no hay dispositivos/escaneo bloqueado
            let hint = '';
            if (name === 'SecurityError') {
                hint = ' (Asegúrate de usar HTTPS o localhost)';
            } else if (name === 'NotAllowedError') {
                hint = ' (Toca "Conectar" y elige BLE; revisa permisos del sitio y que Bluetooth esté encendido)';
            } else if (name === 'NotFoundError') {
                hint = ' (No se encontraron dispositivos; acerca el BLE y verifica que esté anunciando)';
            }
            this.state.addLogMessage(`❌ Error Bluetooth: ${msg}${hint}`);
            return false;
        }
    }

    _onBluetoothData(event) {
        const value = event.target.value;
        if (!value || value.byteLength === 0) return;
        const decoder = new TextDecoder();
        let chunk = decoder.decode(value);
        console.log('📡 BLE raw chunk:', JSON.stringify(chunk));
        chunk = chunk.replace(/\r/g, '\n');
        this._bluetoothBuffer += chunk;
        const lines = this._bluetoothBuffer.split('\n');
        this._bluetoothBuffer = lines.pop();
        for (const line of lines) this._processIncomingMessage(line.trim());
    }

    // ═══════════════════════════════════════════════════════
    // WATCHDOG — "Sin respuesta" real (no falso positivo)
    // ═══════════════════════════════════════════════════════

    _startWatchdog() {
        this._stopWatchdog();
        this._lastRxTime = Date.now();
        this._watchdogAlerted = false;
        this._watchdogInterval = setInterval(() => {
            if (this.type === 'simulation') return;
            const elapsed = Date.now() - this._lastRxTime;
            if (elapsed > 4000 && !this._watchdogAlerted) {
                this._watchdogAlerted = true;
                this.state.addLogMessage('⚠️ Sin respuesta del robot');
            } else if (elapsed < 4000) {
                this._watchdogAlerted = false;
            }
        }, 1000);
    }

    _stopWatchdog() {
        if (this._watchdogInterval) {
            clearInterval(this._watchdogInterval);
            this._watchdogInterval = null;
        }
    }

    // ═══════════════════════════════════════════════════════
    // ENVÍO DE COMANDOS
    // ═══════════════════════════════════════════════════════

    async send(command) {
        const fullCommand = command.endsWith('\n') ? command : command + '\n';
        this._commandQueue.push(fullCommand);
        if (!this._sending) await this._processQueue();
    }

    async _processQueue() {
        if (this._sending || this._commandQueue.length === 0) return;
        this._sending = true;
        while (this._commandQueue.length > 0) {
            const command = this._commandQueue.shift();
            try {
                if (this.type === 'serial') {
                    await this._sendSerial(command);
                } else if (this.type === 'bluetooth') {
                    if (!this._isBLEConnected()) {
                        const connected = await this._attemptReconnect();
                        if (!connected) throw new Error('BLE desconectado');
                    }
                    await this._sendBluetooth(command);
                } else {
                    throw new Error('No hay conexión activa');
                }
                // FIX v3.5: 200ms entre comandos para evitar corrupción BLE
                await this._sleep(200);
            } catch (error) {
                console.error('Error enviando comando:', error);
                if (error.message?.includes('disconnected')) {
                    this._handleDisconnection();
                    break;
                }
            }
        }
        this._sending = false;
    }

    _isBLEConnected() {
        return this.type === 'bluetooth' && this.device && this.device.gatt?.connected && this.server && this.characteristic;
    }

    _handleDisconnection() {
        this._sending = false;
        this._commandQueue = [];
        this._reconnectAttempts = 0;
        this.type = 'simulation';
        this.state.setConnected(false);
        this.state.addLogMessage('Desconectado del robot');
        this.characteristic = null;
        this.server = null;
        this.device = null;
        this._stopWatchdog();
    }

    _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async _sendSerial(data) {
        if (!this.port || !this.port.writable) throw new Error('Puerto serial no disponible');
        const encoder = new TextEncoder();
        const writer = this.port.writable.getWriter();
        try { await writer.write(encoder.encode(data)); } finally { writer.releaseLock(); }
    }

    async _sendBluetooth(data) {
        if (!this.characteristic) throw new Error('Característica BLE no disponible');
        const encoder = new TextEncoder();
        if (this.characteristic.writeValueWithoutResponse) {
            await this.characteristic.writeValueWithoutResponse(encoder.encode(data));
        } else {
            await this.characteristic.writeValue(encoder.encode(data));
        }
    }

    // ═══════════════════════════════════════════════════════
    // PROCESAMIENTO DE MENSAJES ENTRANTES
    // ═══════════════════════════════════════════════════════

    _processIncomingMessage(message) {
        if (!message) return;

        // FIX: cualquier mensaje válido resetea el watchdog
        this._lastRxTime = Date.now();

        console.log('📥 Recibido:', message);

        const idx = message.indexOf(':');
        if (idx < 0) {
            console.log('⚠️ Mensaje sin ":" descartado:', message);
            return;
        }

        const key   = message.slice(0, idx).trim();
        const value = message.slice(idx + 1).trim();

        switch (key) {
            case 'DIST':
                this.state.setDistance(parseInt(value) || 0);
                break;

            case 'IR': {
                const v = value.toUpperCase();
                let irLeft = false, irRight = false;
                if      (v === 'L' || v === 'LEFT'  || v === 'IZQ')  irLeft = true;
                else if (v === 'R' || v === 'RIGHT' || v === 'DER')  irRight = true;
                else if (v === 'B' || v === 'BOTH'  || v === 'LR')   { irLeft = true; irRight = true; }
                else if (v.includes(',')) {
                    const [a, b] = v.split(',').map(s => s.trim());
                    irLeft  = (a === '1');
                    irRight = (b === '1');
                } else if (v === 'N' || v === 'NONE' || v === '0') {
                    irLeft = false; irRight = false;
                }
                this.state.setIR(irLeft, irRight);
                // FIX v3.5: NO mostrar hallazgo en modo MANUAL - solo en AUTO
                const hasAny = irLeft || irRight;
                const now = Date.now();
                if (hasAny && (!this._lastDiscoveryTime || now - this._lastDiscoveryTime > 4000)) {
                    this._lastDiscoveryTime = now;
                    const sensor = (irLeft && irRight) ? 'BOTH' : (irLeft ? 'LEFT' : 'RIGHT');
                    // Solo mostrar descubrimiento si NO estamos en modo MANUAL
                    if (this.state.mode !== 'MANUAL') {
                        this.state.addDiscovery(sensor);
                    }
                    setTimeout(() => this.state.setIR(false, false), 2000);
                }
                break;
            }

            case 'HALLAZGO': {
                const parts = value.split(':');
                const num = parts[0] || '';
                const sensorRaw = (parts[1] || '').toUpperCase();
                const sensor = sensorRaw === 'IZQ' ? 'LEFT' : sensorRaw === 'DER' ? 'RIGHT' : 'BOTH';
                const nowH = Date.now();
                if (!this._lastDiscoveryTime || nowH - this._lastDiscoveryTime > 4000) {
                    this._lastDiscoveryTime = nowH;
                    this.state.addDiscovery(sensor);
                }
                this.state.addLogMessage(`🦴 Hallazgo #${num} confirmado por Arduino`);
                break;
            }

            case 'ST':
                this.state.setMode(value);
                break;

            case 'FIND': {
                let count = value, sensor = 'UNKNOWN';
                if (value.includes(',SENSOR:')) {
                    const parts = value.split(',SENSOR:');
                    count  = parts[0] || value;
                    sensor = (parts[1] || 'UNKNOWN').trim().toUpperCase();
                } else if (value.includes(',')) {
                    const parts = value.split(',');
                    count  = parts[0].trim();
                    sensor = (parts[1] || 'UNKNOWN').trim().toUpperCase();
                }
                const nowF = Date.now();
                if (!this._lastDiscoveryTime || nowF - this._lastDiscoveryTime > 4000) {
                    this._lastDiscoveryTime = nowF;
                    const sensorNorm = sensor === 'LEFT' ? 'LEFT' : sensor === 'RIGHT' ? 'RIGHT' : 'BOTH';
                    this.state.addDiscovery(sensorNorm);
                }
                this.state.addLogMessage(`🦴 Hallazgo #${count}${sensor !== 'UNKNOWN' ? ' (' + sensor + ')' : ''}`);
                break;
            }

            case 'ANG': {
                const angle = parseInt(value, 10);
                if (!isNaN(angle) && this.state.setServoAngle) this.state.setServoAngle(angle);
                break;
            }

            case 'VEL': {
                // FIX: parsear VEL:manual,auto
                const parts = value.split(',');
                const manualSpeed = parseInt(parts[0], 10);
                const autoSpeed   = parseInt(parts[1] || parts[0], 10);
                if (!isNaN(manualSpeed) && this.state.setManualSpeed) this.state.setManualSpeed(manualSpeed);
                if (!isNaN(autoSpeed)   && this.state.setAutoSpeed)   this.state.setAutoSpeed(autoSpeed);
                this.state.addLogMessage(`RX: VEL:${manualSpeed},${autoSpeed}`);
                break;
            }

            case 'VELA': {
                const speed = parseInt(value, 10);
                if (!isNaN(speed) && this.state.setAutoSpeed) this.state.setAutoSpeed(speed);
                break;
            }

            case 'POS': {
                const [x, y, angle] = value.split(',').map(Number);
                if (!isNaN(x) && !isNaN(y)) {
                    this.state._state.position = { x, y };
                    this.state._state.angle = angle || 0;
                    this.state._notify('position', this.state.position);
                }
                break;
            }

            case 'LOG':
                this.state.addLogMessage(`[Robot] ${value}`);
                break;

            // FIX: P:OK, BEEP:OK, RESET:OK, SCAN:ON/OFF → solo log, no "desconocido"
            case 'P':
            case 'BEEP':
            case 'RESET':
            case 'SCAN':
            case 'MSG':
            case 'ERR':
                this.state.addLogMessage(`RX: ${message}`);
                break;

            default:
                this.state.addLogMessage(`RX: ${message}`);
        }
    }

    // ═══════════════════════════════════════════════════════
    // HEARTBEAT
    // ═══════════════════════════════════════════════════════

    _startHeartbeat() {
        this._stopHeartbeat();
        this._heartbeatInterval = setInterval(async () => {
            if (this.type !== 'bluetooth' || !this.device) return;
            if (this._commandQueue.length > 0 || this._sending) return;
            try {
                if (this.characteristic && this.server?.connected) {
                    const encoder = new TextEncoder();
                    if (this.characteristic.writeValueWithoutResponse) {
                        await this.characteristic.writeValueWithoutResponse(encoder.encode('P\n'));
                    } else {
                        await this.characteristic.writeValue(encoder.encode('P\n'));
                    }
                }
            } catch (e) {
                console.warn('Heartbeat falló:', e.message);
            }
        }, 5000);
    }

    _stopHeartbeat() {
        if (this._heartbeatInterval) { clearInterval(this._heartbeatInterval); this._heartbeatInterval = null; }
    }

    async _attemptReconnect() {
        if (this._isReconnecting || !this.device) return;
        if (this._reconnectAttempts >= this._maxReconnectAttempts) {
            this.state.addLogMessage('❌ No se pudo reconectar. Intenta manualmente.');
            this.state.setConnected(false);
            this.type = 'simulation';
            return;
        }
        this._isReconnecting = true;
        this._reconnectAttempts++;
        this.state.addLogMessage(`🔄 Reconectando... intento ${this._reconnectAttempts}/${this._maxReconnectAttempts}`);
        try {
            await new Promise(r => setTimeout(r, 2000));
            this.server = await this.device.gatt.connect();
            const service = await this.server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
            this.characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', (e) => this._onBluetoothData(e));
            this.type = 'bluetooth';
            this.state.setConnected(true);
            this._reconnectAttempts = 0;
            this._startHeartbeat();
            this._startWatchdog();
            this.state.addLogMessage('✅ Reconectado exitosamente');
        } catch (e) {
            this.state.addLogMessage(`⚠️ Intento ${this._reconnectAttempts} fallido`);
            this._isReconnecting = false;
            await this._attemptReconnect();
        } finally {
            this._isReconnecting = false;
        }
    }

    // ═══════════════════════════════════════════════════════
    // DESCONECTAR
    // ═══════════════════════════════════════════════════════

    async disconnect() {
        this._stopHeartbeat();
        this._stopWatchdog();
        this._readLoopRunning = false;
        if (this.port) {
            try { if (this.reader) await this.reader.cancel(); await this.port.close(); } catch (e) {}
            this.port = null;
        }
        if (this.device && this.device.gatt.connected) {
            try { await this.device.gatt.disconnect(); } catch (e) {}
            this.device = null; this.server = null; this.characteristic = null;
        }
        this.type = 'simulation';
        this.state.setConnected(false);
        this.state.addLogMessage('Desconectado');
    }

    isConnected()      { return this.type !== 'simulation' && this.state.connected; }
    getConnectionType() { return this.type; }
}