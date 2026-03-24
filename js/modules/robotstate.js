/**
 * RobotState.js
 * Mantiene el estado actual del robot y notifica cambios
 * Patrón: Observer (suscriptores a cambios)
 */

export class RobotState {
    constructor() {
        // Estado interno
        this._state = {
            // Conexión
            connected: false,
            
            // Modo de operación
            mode: 'IDLE', // IDLE, EXPLORANDO, HALLAZGO, EVITANDO, MANUAL, BAILANDO
            
            // Sensores
            distance: 0,        // cm
            irLeft: false,      // true = figura detectada
            irRight: false,     // true = figura detectada
            
            // Posición para el mapa
            position: { x: 150, y: 150 }, // Centro del canvas
            angle: 0,           // Dirección en grados (0 = arriba)
            
            // Hallazgos
            discoveries: [],
            
            // Log de mensajes
            logMessages: []
        };
        
        // Lista de suscriptores (callbacks que se ejecutan al cambiar estado)
        this._subscribers = [];
        
        // Historial de posiciones para el rastro
        this._trail = [{ x: 150, y: 150 }];
    }
    
    // ═══════════════════════════════════════════════════════
    // GETTERS (leer estado)
    // ═══════════════════════════════════════════════════════
    
    get connected() { return this._state.connected; }
    get mode() { return this._state.mode; }
    get distance() { return this._state.distance; }
    get irLeft() { return this._state.irLeft; }
    get irRight() { return this._state.irRight; }
    get position() { return { ...this._state.position }; }
    get angle() { return this._state.angle; }
    get discoveries() { return [...this._state.discoveries]; }
    get trail() { return [...this._trail]; }
    get logMessages() { return [...this._state.logMessages]; }
    
    // ═══════════════════════════════════════════════════════
    // SETTERS (modificar estado y notificar)
    // ═══════════════════════════════════════════════════════
    
    setConnected(value) {
        const oldValue = this._state.connected;
        this._state.connected = value;
        if (oldValue !== value) {
            this._notify('connected', value);
            this._addLog(value ? 'Conectado al robot' : 'Desconectado');
        }
    }
    
    setMode(mode) {
        const oldMode = this._state.mode;
        this._state.mode = mode;
        if (oldMode !== mode) {
            this._notify('mode', mode);
            this._addLog(`Modo cambiado a: ${mode}`);
        }
    }
    
    setDistance(cm) {
        const oldValue = this._state.distance;
        // Limitar entre 0 y 400 (rango realista del sensor)
        this._state.distance = Math.max(0, Math.min(400, cm));
        if (Math.abs(oldValue - this._state.distance) > 2) {
            this._notify('distance', this._state.distance);
        }
    }
    
    setIR(left, right) {
        const oldLeft = this._state.irLeft;
        const oldRight = this._state.irRight;
        
        this._state.irLeft = left;
        this._state.irRight = right;
        
        // Detectar cambios
        if (oldLeft !== left || oldRight !== right) {
            this._notify('ir', { left, right });
            
            // Si alguno detecta, es un hallazgo potencial
            if ((left && !oldLeft) || (right && !oldRight)) {
                this._addLog(`Sensor IR activado: ${left ? 'IZQ ' : ''}${right ? 'DER' : ''}`);
            }
        }
    }
    
    /**
     * Actualiza posición del robot en el mapa
     * @param {number} deltaX - movimiento en X (-1 a 1)
     * @param {number} deltaY - movimiento en Y (-1 a 1)
     * @param {number} rotation - rotación en grados
     */
    updatePosition(deltaX, deltaY, rotation = 0) {
        // Actualizar ángulo
        this._state.angle = (this._state.angle + rotation) % 360;
        
        // Calcular nueva posición basada en ángulo
        const rad = (this._state.angle - 90) * Math.PI / 180;
        const speed = 2; // velocidad de simulación
        
        const newX = this._state.position.x + Math.cos(rad) * deltaY * speed - Math.sin(rad) * deltaX * speed;
        const newY = this._state.position.y + Math.sin(rad) * deltaY * speed + Math.cos(rad) * deltaX * speed;
        
        // Limitar al canvas (300x300 con margen de 10)
        this._state.position.x = Math.max(10, Math.min(290, newX));
        this._state.position.y = Math.max(10, Math.min(290, newY));
        
        // Agregar al rastro cada 5 movimientos
        if (this._trail.length === 0 || 
            Math.hypot(this._state.position.x - this._trail[this._trail.length-1].x,
                      this._state.position.y - this._trail[this._trail.length-1].y) > 5) {
            this._trail.push({ ...this._state.position });
        }
        
        this._notify('position', this._state.position);
    }
    
    /**
     * Registra un nuevo hallazgo
     */
    addDiscovery(sensor) {
        const discovery = {
            id: Date.now(),
            number: this._state.discoveries.length + 1,
            sensor: sensor, // 'LEFT', 'RIGHT', 'BOTH'
            position: { ...this._state.position },
            timestamp: new Date().toLocaleTimeString()
        };
        
        this._state.discoveries.push(discovery);
        this._notify('discovery', discovery);
        this._addLog(`¡HALLAZGO #${discovery.number} detectado!`);
        
        return discovery;
    }
    
    /**
     * Resetea la expedición
     */
    reset() {
        this._state.discoveries = [];
        this._trail = [{ x: 150, y: 150 }];
        this._state.position = { x: 150, y: 150 };
        this._state.angle = 0;
        this._notify('reset', null);
        this._addLog('Expedición reiniciada');
    }
    
    // ═══════════════════════════════════════════════════════
    // SISTEMA OBSERVER (suscripción a cambios)
    // ═══════════════════════════════════════════════════════
    
    /**
     * Suscribirse a cambios de estado
     * @param {Function} callback - función(evento, valor)
     */
    subscribe(callback) {
        this._subscribers.push(callback);
        // Devolver función para desuscribirse
        return () => {
            const index = this._subscribers.indexOf(callback);
            if (index > -1) this._subscribers.splice(index, 1);
        };
    }
    
    _notify(event, value) {
        this._subscribers.forEach(cb => {
            try {
                cb(event, value, this._state);
            } catch (e) {
                console.error('Error en suscriptor:', e);
            }
        });
    }
    
    // ═══════════════════════════════════════════════════════
    // LOG DE MENSAJES
    // ═══════════════════════════════════════════════════════
    
    _addLog(message) {
        const entry = {
            time: new Date().toLocaleTimeString(),
            message: message
        };
        this._state.logMessages.unshift(entry);
        // Mantener solo últimos 50 mensajes
        if (this._state.logMessages.length > 50) {
            this._state.logMessages.pop();
        }
        this._notify('log', entry);
    }
    
    addLogMessage(message) {
        this._addLog(message);
    }
}
