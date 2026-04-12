/**
 * ConnectionManager.js
 * Gestiona conexiones: Simulación, Web Serial, o Web Bluetooth
 */

export class ConnectionManager {
    constructor(robotState) {
        this.state = robotState;
        this.type = 'simulation'; // 'simulation' | 'serial' | 'bluetooth'
        
        this.port = null;           // Para Web Serial
        this.reader = null;
        this.writer = null;
        
        this.device = null;         // Para Web Bluetooth
        this.server = null;
        this.characteristic = null;
        
        this._readLoopRunning = false;
        this._messageQueue = [];
        this._bluetoothBuffer = '';
        
        // Heartbeat y reconexión BLE
        this._heartbeatInterval = null;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 3;
        this._isReconnecting = false;
    }
    
    // ═══════════════════════════════════════════════════════
    // CONEXIÓN WEB SERIAL (USB cable)
    // ═══════════════════════════════════════════════════════
    
    async connectSerial() {
        try {
            // Verificar soporte
            if (!('serial' in navigator)) {
                throw new Error('Web Serial API no soportada. Usa Chrome/Edge.');
            }
            
            this.state.addLogMessage('Solicitando puerto USB-Serial...');
            
            // Solicitar puerto al usuario
            this.port = await navigator.serial.requestPort({
                filters: [{ usbVendorId: 0x1A86 }, { usbVendorId: 0x0403 }] // CH340, FTDI
            });
            
            // Abrir con configuración típica del HC-05/06
            await this.port.open({
                baudRate: 9600,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });
            
            this.type = 'serial';
            this.state.setConnected(true);
            this.state.addLogMessage('✅ Conectado por USB-Serial a 9600 baud');
            
            // Iniciar lectura
            this._startSerialRead();
            
            return true;
            
        } catch (error) {
            this.state.addLogMessage(`❌ Error Serial: ${error.message}`);
            console.error('Serial error:', error);
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
                        
                        // Decodificar y acumular en buffer
                        buffer += decoder.decode(value, { stream: true });
                        
                        // Procesar líneas completas
                        const lines = buffer.split('\n');
                        buffer = lines.pop(); // Mantener incompleto
                        
                        for (const line of lines) {
                            this._processIncomingMessage(line.trim());
                        }
                    }
                } finally {
                    this.reader.releaseLock();
                }
            }
        } catch (error) {
            console.error('Read error:', error);
            this.state.addLogMessage('⚠️ Error de lectura');
        } finally {
            this._readLoopRunning = false;
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // CONEXIÓN WEB BLUETOOTH (BLE - HM-10, JDY-08, etc.)
    // ═══════════════════════════════════════════════════════
    
    async connectBluetooth() {
        try {
            // Limpiar estado previo
            this.state.setIR(false, false);
            this._bluetoothBuffer = '';
            
            if (!('bluetooth' in navigator)) {
                throw new Error('Web Bluetooth no soportado');
            }
            
            this.state.addLogMessage('Buscando dispositivo BLE...');
            
            // Solicitar CUALQUIER dispositivo BLE cercano (sin filtros de nombre)
            // Esto muestra todos los dispositivos disponibles para que el usuario elija
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
            });
            
            this.state.addLogMessage(`Encontrado: ${this.device.name}`);
            
            // Conectar
            this.server = await this.device.gatt.connect();
            
            // Obtener servicio UART
            const service = await this.server.getPrimaryService(
                '0000ffe0-0000-1000-8000-00805f9b34fb'
            );
            
            // Obtener característica
            this.characteristic = await service.getCharacteristic(
                '0000ffe1-0000-1000-8000-00805f9b34fb'
            );
            
            // Suscribirse a notificaciones
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener(
                'characteristicvaluechanged',
                (e) => this._onBluetoothData(e)
            );
            
            this.type = 'bluetooth';
            this.state.setConnected(true);
            this.state.addLogMessage('✅ Conectado por Bluetooth BLE');
            
            // Manejar desconexión
            this.device.addEventListener('gattserverdisconnected', () => {
                this._stopHeartbeat();
                this.state.addLogMessage('⚠️ Bluetooth desconectado');
                this._attemptReconnect();
            });
            
            // Iniciar heartbeat para mantener conexión viva
            this._startHeartbeat();
            this._reconnectAttempts = 0;
            
            return true;
            
        } catch (error) {
            this.state.addLogMessage(`❌ Error Bluetooth: ${error.message}`);
            console.error('Bluetooth error:', error);
            return false;
        }
    }
    
    _onBluetoothData(event) {
        const value = event.target.value;
        if (!value || value.byteLength === 0) return;
        
        const decoder = new TextDecoder();
        let chunk = decoder.decode(value);
        
        // DEBUG: ver exactamente qué llega del HM-10
        console.log('📡 BLE raw chunk:', JSON.stringify(chunk));
        
        // Normalizar CRLF -> LF (MUY común en Arduino/BT)
        chunk = chunk.replace(/\r/g, '\n');
        
        this._bluetoothBuffer += chunk;
        
        const lines = this._bluetoothBuffer.split('\n');
        this._bluetoothBuffer = lines.pop();
        
        for (const line of lines) {
            this._processIncomingMessage(line.trim());
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // ENVÍO DE COMANDOS
    // ═══════════════════════════════════════════════════════
    
    async send(command) {
        // Agregar salto de línea si no lo tiene
        const fullCommand = command.endsWith('\n') ? command : command + '\n';
        
        switch (this.type) {
            case 'serial':
                return this._sendSerial(fullCommand);
            case 'bluetooth':
                return this._sendBluetooth(fullCommand);
            default:
                throw new Error('No hay conexión activa');
        }
    }
    
    async _sendSerial(data) {
        if (!this.port || !this.port.writable) {
            throw new Error('Puerto serial no disponible');
        }
        
        const encoder = new TextEncoder();
        const writer = this.port.writable.getWriter();
        
        try {
            await writer.write(encoder.encode(data));
        } finally {
            writer.releaseLock();
        }
    }
    
    async _sendBluetooth(data) {
        if (!this.characteristic) {
            throw new Error('Característica BLE no disponible');
        }
        
        const encoder = new TextEncoder();
        // writeValueWithoutResponse es más rápido y no bloquea
        // writeValue está deprecado en Chrome nuevo
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
        
        console.log('📥 Recibido:', message);
        
        // Parsing flexible: buscar primer :
        const idx = message.indexOf(':');
        if (idx < 0) {
            // DEBUG opcional
            console.log('⚠️ Mensaje sin ":" descartado:', message);
            return;
        }
        const key = message.slice(0, idx).trim();
        const value = message.slice(idx + 1).trim();
        
        switch (key) {
            case 'DIST':
                this.state.setDistance(parseInt(value) || 0);
                break;
                
            case 'IR': {
                const v = value.toUpperCase();
                
                let irLeft = false, irRight = false;
                
                // Formatos soportados:
                // L, R, B
                // LEFT/RIGHT/BOTH
                // IZQ/DER
                // 1,0  0,1  1,1  0,0
                if (v === 'L' || v === 'LEFT' || v === 'IZQ') irLeft = true;
                else if (v === 'R' || v === 'RIGHT' || v === 'DER') irRight = true;
                else if (v === 'B' || v === 'BOTH' || v === 'LR') { irLeft = true; irRight = true; }
                else if (v.includes(',')) {
                    const [a,b] = v.split(',').map(s => s.trim());
                    irLeft = (a === '1');
                    irRight = (b === '1');
                } else if (v === 'N' || v === 'NONE' || v === '0') {
                    irLeft = false; irRight = false;
                } else {
                    console.log('⚠️ IR value no reconocido:', value);
                }
                
                const hadAny = this.state.irLeft || this.state.irRight;
                this.state.setIR(irLeft, irRight);
                
                // Disparar hallazgo solo en "flanco" (cuando pasa de nada -> algo)
                const hasAny = irLeft || irRight;
                if (!hadAny && hasAny) {
                    const sensor = (irLeft && irRight) ? 'BOTH' : (irLeft ? 'LEFT' : 'RIGHT');
                    this.state.addDiscovery(sensor);
                    setTimeout(() => this.state.setIR(false, false), 2000);
                }
                break;
            }
            }
                
            case 'ST':
                this.state.setMode(value);
                break;
                
            case 'FIND':
                this.state.addLogMessage(`Hallazgo confirmado #${value}`);
                break;
                
            case 'POS':
                const [x, y, angle] = value.split(',').map(Number);
                if (!isNaN(x) && !isNaN(y)) {
                    this.state._state.position = { x, y };
                    this.state._state.angle = angle || 0;
                    this.state._notify('position', this.state.position);
                }
                break;
                
            case 'LOG':
                this.state.addLogMessage(`[Robot] ${value}`);
                break;
                
            default:
                this.state.addLogMessage(`RX: ${message}`);
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // HEARTBEAT - Mantiene la conexión BLE viva
    // ═══════════════════════════════════════════════════════

    _startHeartbeat() {
        this._stopHeartbeat(); // Limpiar anterior si existe
        this._heartbeatInterval = setInterval(async () => {
            if (this.type !== 'bluetooth' || !this.device) return;
            
            try {
                // Enviar byte vacío para mantener conexión viva
                if (this.characteristic && this.server?.connected) {
                    const encoder = new TextEncoder();
                    if (this.characteristic.writeValueWithoutResponse) {
                        await this.characteristic.writeValueWithoutResponse(
                            encoder.encode('\n')
                        );
                    }
                }
            } catch (e) {
                console.warn('Heartbeat falló:', e.message);
                // No desconectar aquí, dejar que gattserverdisconnected lo maneje
            }
        }, 3000); // Cada 3 segundos
    }

    _stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
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
        this.state.addLogMessage(
            `🔄 Reconectando... intento ${this._reconnectAttempts}/${this._maxReconnectAttempts}`
        );

        try {
            await new Promise(r => setTimeout(r, 2000)); // Esperar 2s antes de reintentar
            
            this.server = await this.device.gatt.connect();
            const service = await this.server.getPrimaryService(
                '0000ffe0-0000-1000-8000-00805f9b34fb'
            );
            this.characteristic = await service.getCharacteristic(
                '0000ffe1-0000-1000-8000-00805f9b34fb'
            );
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener(
                'characteristicvaluechanged',
                (e) => this._onBluetoothData(e)
            );

            this.type = 'bluetooth';
            this.state.setConnected(true);
            this._reconnectAttempts = 0;
            this._startHeartbeat();
            this.state.addLogMessage('✅ Reconectado exitosamente');

        } catch (e) {
            this.state.addLogMessage(`⚠️ Intento ${this._reconnectAttempts} fallido`);
            this._isReconnecting = false;
            await this._attemptReconnect(); // Reintentar
        } finally {
            this._isReconnecting = false;
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // DESCONECTAR
    // ═══════════════════════════════════════════════════════
    
    async disconnect() {
        this._stopHeartbeat();
        this._readLoopRunning = false;
        
        // Cerrar Serial
        if (this.port) {
            try {
                if (this.reader) {
                    await this.reader.cancel();
                }
                await this.port.close();
            } catch (e) {
                console.error('Error cerrando serial:', e);
            }
            this.port = null;
        }
        
        // Desconectar Bluetooth
        if (this.device && this.device.gatt.connected) {
            try {
                await this.device.gatt.disconnect();
            } catch (e) {
                console.error('Error desconectando BLE:', e);
            }
            this.device = null;
            this.server = null;
            this.characteristic = null;
        }
        
        this.type = 'simulation';
        this.state.setConnected(false);
        this.state.addLogMessage('Desconectado');
    }
    
    // ═══════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════
    
    isConnected() {
        return this.type !== 'simulation' && this.state.connected;
    }
    
    getConnectionType() {
        return this.type;
    }
}