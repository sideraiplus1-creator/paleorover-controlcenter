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
                this.state.addLogMessage('⚠️ Bluetooth desconectado');
                this.disconnect();
            });
            
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
        const message = decoder.decode(value);
        
        // Acumular y procesar líneas (similar a serial)
        this._bluetoothBuffer = this._bluetoothBuffer + message;
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
        await this.characteristic.writeValue(encoder.encode(data));
    }
    
    // ═══════════════════════════════════════════════════════
    // PROCESAMIENTO DE MENSAJES ENTRANTES
    // ═══════════════════════════════════════════════════════
    
    _processIncomingMessage(message) {
        if (!message) return;
        
        console.log('📥 Recibido:', message);
        
        const parts = message.split(':');
        if (parts.length !== 2) return;
        
        const [key, value] = parts;
        
        switch (key) {
            case 'DIST':
                this.state.setDistance(parseInt(value) || 0);
                break;
                
            case 'IR': {
                const irLeft  = value === 'L' || value === 'B';
                const irRight = value === 'R' || value === 'B';
                const hasDetection = value === 'L' || value === 'R' || value === 'B';

                this.state.setIR(irLeft, irRight);

                if (hasDetection) {
                    const sensor = value === 'L' ? 'LEFT' : value === 'R' ? 'RIGHT' : 'BOTH';
                    this.state.addDiscovery(sensor);
                    setTimeout(() => this.state.setIR(false, false), 2000); // Auto-limpiar
                } else {
                    // value === 'N' → limpiar estado IR
                    this.state.setIR(false, false);
                }
                break;
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
    // DESCONECTAR
    // ═══════════════════════════════════════════════════════
    
    async disconnect() {
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