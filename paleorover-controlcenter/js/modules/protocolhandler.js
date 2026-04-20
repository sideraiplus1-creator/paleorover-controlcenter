/**
 * ProtocolHandler.js
 * Protocolo Rover-Paleo v3.1 - Comunicación robusta Arduino ↔ Web
 */

export class ProtocolHandler {
  constructor(robotState) {
    this.state = robotState;
    this.version = '3.1';
        
        // Buffer de recepción
        this.rxBuffer = '';
        
        // Estadísticas de comunicación
        this.stats = {
            packetsReceived: 0,
            packetsSent: 0,
            errors: 0,
            lastPing: Date.now()
        };
        
        // Heartbeat
        this._startHeartbeat();
    }
    
    // ═══════════════════════════════════════════════════════
    // ENCODING - Web a Arduino
    // ═══════════════════════════════════════════════════════
    
    /**
     * Codifica comando para enviar al Arduino
     */
    encode(command, params = {}) {
        // Formato: CMD|PARAM1|PARAM2\n
        const parts = [command];
        
        for (const [key, value] of Object.entries(params)) {
            parts.push(`${key}=${value}`);
        }
        
        const message = parts.join('|') + '\n';
        this.stats.packetsSent++;
        
        return message;
    }
    
    /**
     * Comandos predefinidos
     */
    static COMMANDS = {
        // Movimiento
        MOVE_FORWARD: { cmd: 'MV', params: { d: 'F', s: 255 } },
        MOVE_BACKWARD: { cmd: 'MV', params: { d: 'B', s: 255 } },
        TURN_LEFT: { cmd: 'MV', params: { d: 'L', a: 90 } },
        TURN_RIGHT: { cmd: 'MV', params: { d: 'R', a: 90 } },
        STOP: { cmd: 'ST' },
        
        // Modos
        MODE_IDLE: { cmd: 'MD', params: { m: 0 } },
        MODE_AUTO: { cmd: 'MD', params: { m: 1 } },
        MODE_MANUAL: { cmd: 'MD', params: { m: 2 } },
        MODE_PANIC: { cmd: 'MD', params: { m: 9 } },
        
        // Acciones
        DANCE: { cmd: 'AC', params: { a: 1 } },
        SCAN: { cmd: 'AC', params: { a: 2 } },
        BEEP: { cmd: 'AC', params: { a: 3 } },
        RESET: { cmd: 'AC', params: { a: 0 } },
        
        // Calibración
        CALIBRATE_IR: { cmd: 'CL', params: { s: 'IR' } },
        CALIBRATE_SERVO: { cmd: 'CL', params: { s: 'SRV' } },
        SET_THRESHOLD: { cmd: 'TH', params: { t: 500 } },
        
        // Configuración
        SET_SPEED: { cmd: 'SP', params: { v: 200 } },
        SET_TIMEOUT: { cmd: 'TO', params: { ms: 30000 } },
        
        // Query
        GET_STATUS: { cmd: 'Q', params: { r: 'ALL' } },
        GET_SENSORS: { cmd: 'Q', params: { r: 'SENS' } },
        GET_POSITION: { cmd: 'Q', params: { r: 'POS' } },
        
        // Ping
        PING: { cmd: 'P' }
    };
    
    /**
     * Crea comando de movimiento con velocidad personalizada
     */
    createMoveCommand(direction, speed = 255, angle = null) {
        const params = { d: direction, s: Math.max(0, Math.min(255, speed)) };
        if (angle !== null) params.a = angle;
        return this.encode('MV', params);
    }
    
    // ═══════════════════════════════════════════════════════
    // DECODING - Arduino a Web
    // ═══════════════════════════════════════════════════════
    
    /**
     * Procesa datos recibidos del Arduino
     */
    decode(incomingData) {
        this.rxBuffer += incomingData;
        
        // Procesar líneas completas
        const lines = this.rxBuffer.split('\n');
        this.rxBuffer = lines.pop(); // Mantener incompleto
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                this._processMessage(trimmed);
            }
        }
    }
    
    _processMessage(message) {
        this.stats.packetsReceived++;
        
        try {
            // Formato: TYPE|FIELD1=VAL1|FIELD2=VAL2
            const parts = message.split('|');
            const type = parts[0];
            const fields = this._parseFields(parts.slice(1));
            
            switch (type) {
                case 'TELEM': // Telemetría completa
                    this._handleTelemetry(fields);
                    break;
                    
                case 'SENS': // Solo sensores
                    this._handleSensors(fields);
                    break;
                    
                case 'POS': // Posición
                    this._handlePosition(fields);
                    break;
                    
                case 'DISC': // Hallazgo
                    this._handleDiscovery(fields);
                    break;
                    
                case 'STAT': // Estado
                    this._handleStatus(fields);
                    break;
                    
                case 'ACK': // Acknowledge
                    this._handleAck(fields);
                    break;
                    
                case 'ERR': // Error
                    this._handleError(fields);
                    break;
                    
                case 'PONG': // Respuesta a ping
                    this.stats.lastPing = Date.now();
                    break;
                    
                case 'VER': // Versión del firmware
                    this.state.addLogMessage(`Firmware: ${fields.ver}`);
                    break;
                    
                default:
                    console.warn('Mensaje desconocido:', type);
            }
            
        } catch (e) {
            this.stats.errors++;
            console.error('Error parseando:', message, e);
        }
    }
    
    _parseFields(fieldArray) {
        const fields = {};
        for (const field of fieldArray) {
            const [key, value] = field.split('=');
            if (key && value !== undefined) {
                // Auto-convertir tipos
                if (value === 'true') fields[key] = true;
                else if (value === 'false') fields[key] = false;
                else if (!isNaN(value) && value !== '') fields[key] = Number(value);
                else fields[key] = value;
            }
        }
        return fields;
    }
    
    // ═══════════════════════════════════════════════════════
    // HANDLERS DE MENSAJES
    // ═══════════════════════════════════════════════════════
    
    _handleTelemetry(fields) {
        // TELEM|D=45|IRL=0|IRR=1|SPD=200|ANG=90|BAT=85|MODE=1
        if (fields.D !== undefined) this.state.setDistance(fields.D);
        if (fields.IRL !== undefined || fields.IRR !== undefined) {
            this.state.setIR(!!fields.IRL, !!fields.IRR);
        }
        if (fields.ANG !== undefined) {
            this.state._state.angle = fields.ANG;
            this.state._notify('position', this.state.position);
        }
        if (fields.MODE !== undefined) {
            const modes = ['IDLE', 'EXPLORANDO', 'MANUAL', 'HALLAZGO', 'EVITANDO', 'BAILANDO'];
            this.state.setMode(modes[fields.MODE] || 'IDLE');
        }
        
        // Guardar datos crudos para telemetría avanzada
        this._lastTelemetry = fields;
    }
    
    _handleSensors(fields) {
        // SENS|US=45|IRL=0|IRR=1|LDR=800
        if (fields.US !== undefined) this.state.setDistance(fields.US);
        if (fields.IRL !== undefined || fields.IRR !== undefined) {
            this.state.setIR(!!fields.IRL, !!fields.IRR);
        }
    }
    
    _handlePosition(fields) {
        // POS|X=120|Y=80|A=45|TRAIL=5
        if (fields.X !== undefined && fields.Y !== undefined) {
            this.state._state.position = { x: fields.X, y: fields.Y };
            this.state._state.angle = fields.A || 0;
            this.state._notify('position', this.state.position);
        }
    }
    
    _handleDiscovery(fields) {
        // DISC|N=3|SENS=L|X=120|Y=80|CONF=95
        const sensor = fields.SENS === 'L' ? 'LEFT' : 
                      fields.SENS === 'R' ? 'RIGHT' : 'BOTH';
        
        // Actualizar posición si viene
        if (fields.X !== undefined) {
            this.state._state.position.x = fields.X;
            this.state._state.position.y = fields.Y;
        }
        
        this.state.addDiscovery(sensor);
        
        // Notificación del navegador si está habilitada
        this._sendNotification(`¡Hallazgo #${fields.N}!`, 
            `Fósil detectado con ${fields.CONF || 90}% de confianza`);
    }
    
    _handleStatus(fields) {
        // STAT|M=EXPLORANDO|T=12045|DIST=1500|FINDS=3
        if (fields.M) this.state.setMode(fields.M);
        if (fields.FINDS !== undefined) {
            this.state.addLogMessage(`Total hallazgos en Arduino: ${fields.FINDS}`);
        }
    }
    
    _handleAck(fields) {
        // ACK|CMD=MV|STATUS=OK
        console.log('ACK:', fields.CMD, fields.STATUS);
    }
    
    _handleError(fields) {
        // ERR|CODE=1|MSG=MOTOR_STALL
        this.state.addLogMessage(`❌ Error ${fields.CODE}: ${fields.MSG}`);
        
        // Acciones automáticas según error
        if (fields.CODE === 1) { // Motor stall
            this.state.setMode('PANIC');
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // HEARTBEAT Y MONITOREO
    // ═══════════════════════════════════════════════════════
    
    _startHeartbeat() {
        setInterval(() => {
            const elapsed = Date.now() - this.stats.lastPing;
            
            // Si no hay ping en 5 segundos, alertar
            if (elapsed > 5000 && this.state.connected) {
                this.state.addLogMessage('⚠️ Sin respuesta del robot');
            }
        }, 1000);
    }
    
    /**
     * Genera ping para mantener conexión viva
     */
    getPing() {
        return this.encode('P');
    }
    
    // ═══════════════════════════════════════════════════════
    // NOTIFICACIONES DEL NAVEGADOR
    // ═══════════════════════════════════════════════════════
    
    async _sendNotification(title, body) {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: '🦴',
                badge: '🦴',
                tag: 'paleo-discovery'
            });
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                this._sendNotification(title, body);
            }
        }
    }
    
    requestNotificationPermission() {
        if ('Notification' in window) {
            Notification.requestPermission();
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // GETTERS
    // ═══════════════════════════════════════════════════════
    
    getStats() {
        return { ...this.stats };
    }
    
    getLastTelemetry() {
        return this._lastTelemetry || {};
    }
}
