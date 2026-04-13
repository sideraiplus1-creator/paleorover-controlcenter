/**
 * CommandSender.js
 * Envía comandos al robot: simulación o conexión real
 */

import { ConnectionManager } from './connectionmanager.js';

export class CommandSender {
    constructor(robotState) {
        this.state = robotState;
        this.connection = new ConnectionManager(robotState);
        
        // Velocidades guardadas en localStorage
        this._speedManual = 180;
        this._speedAuto = 150;
        this._loadSpeeds();
        
        // Modo por defecto
        this._simulationMode = true;
        
        // Comandos de movimiento para simulación
        this._movementCommands = {
            'F': { dx: 0, dy: -1, rot: 0 },
            'B': { dx: 0, dy: 1, rot: 0 },
            'L': { dx: 0, dy: 0, rot: -15 },
            'R': { dx: 0, dy: 0, rot: 15 }
        };
        
        this._autoSimulationInterval = null;
    }
    
    /**
     * Inicia conexión real (Serial o Bluetooth)
     */
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
            this._simulationMode = false;
            // Enviar velocidades guardadas al conectar
            this.send(`V:${this._speedManual}`);
        }
        
        return success;
    }
    
    /**
     * Desconecta y vuelve a simulación
     */
    async disconnect() {
        await this.connection.disconnect();
        this._simulationMode = true;
    }
    
    /**
     * Envía un comando
     */
    async send(command) {
        console.log(`📤 Enviando: ${command}`);
        
        if (this._simulationMode) {
            return this._simulateCommand(command);
        } else {
            try {
                await this.connection.send(command);
                return { success: true, command };
            } catch (error) {
                this.state.addLogMessage(`❌ Error enviando: ${error.message}`);
                // Fallback a simulación si falla
                this._simulationMode = true;
                this.state.setConnected(false);
                return { success: false, error };
            }
        }
    }

    setMode(mode) {
        return this.send(`E:${mode}`);
    }

    stop() {
        return this.send('S');
    }

    _loadSpeeds() {
        const savedManual = localStorage.getItem('paleoRover_speedManual');
        const savedAuto = localStorage.getItem('paleoRover_speedAuto');
        
        this._speedManual = savedManual ? parseInt(savedManual, 10) : 180;
        this._speedAuto = savedAuto ? parseInt(savedAuto, 10) : 150;

        if (this.connection.isConnected()) {
            this.send(`V:${this._speedManual}`);
        }
    }

    setManualSpeed(speed) {
        this._speedManual = Math.max(80, Math.min(255, speed));
        localStorage.setItem('paleoRover_speedManual', this._speedManual);
        this.send(`V:${this._speedManual}`);
        return this._speedManual;
    }

    setAutoSpeed(speed) {
        this._speedAuto = Math.max(80, Math.min(255, speed));
        localStorage.setItem('paleoRover_speedAuto', this._speedAuto);
        return this._speedAuto;
    }

    getSpeeds() {
        return { manual: this._speedManual, auto: this._speedAuto };
    }

    /**
     * Simulación
     */
    _simulateCommand(command) {
        return new Promise((resolve) => {
            const delay = 50 + Math.random() * 100;
            
            setTimeout(() => {
                this._processSimulation(command);
                resolve({ success: true, command, simulated: true });
            }, delay);
        });
    }
    
    _processSimulation(command) {
        const state = this.state;
        
        // Movimiento manual - funciona en cualquier modo
        if (this._movementCommands[command]) {
            const move = this._movementCommands[command];
            state.updatePosition(move.dx, move.dy, move.rot);
            
            const randomDist = 20 + Math.random() * 200;
            state.setDistance(randomDist);
        }
        
        // Cambio de modo
        if (command === 'E:0') state.setMode('IDLE');
        else if (command === 'E:1') {
            state.setMode('EXPLORANDO');
            this._startAutoSimulation();
        }
        else if (command === 'E:2') {
            state.setMode('MANUAL');
            this._stopAutoSimulation();
        }
        else if (command === 'E:3') {
            state.setMode('BAILANDO');
            state.addLogMessage('¡Baile de celebración!');
            setTimeout(() => state.setMode('IDLE'), 3000);
        }
        
        if (command === 'S') state.addLogMessage('Robot detenido');
        
        if (command === 'D:1') {
            state.setMode('BAILANDO');
            state.addLogMessage('¡Baile de celebración!');
            setTimeout(() => state.setMode('IDLE'), 3000);
        }
        
        if (command === 'D:2') state.addLogMessage('Escaneo en progreso...');
        if (command === 'BEEP') state.addLogMessage('Beep!');
        if (command === 'RESET') state.reset();
    }
    
    _startAutoSimulation() {
        if (this._autoSimulationInterval) return;
        
        this._autoSimulationInterval = setInterval(() => {
            const moves = ['F', 'F', 'F', 'L', 'R'];
            const moveKey = moves[Math.floor(Math.random() * moves.length)];
            const move = this._movementCommands[moveKey];
            
            this.state.updatePosition(move.dx, move.dy, move.rot);
            this.state.setDistance(10 + Math.random() * 100);
            
            if (Math.random() < 0.05) {
                const sensors = ['LEFT', 'RIGHT', 'BOTH'];
                const sensor = sensors[Math.floor(Math.random() * sensors.length)];
                
                this.state.setIR(
                    sensor === 'LEFT' || sensor === 'BOTH',
                    sensor === 'RIGHT' || sensor === 'BOTH'
                );
                this.state.addDiscovery(sensor);
                this.state.setIR(false, false);
            }
        }, 500);
    }
    
    _stopAutoSimulation() {
        if (this._autoSimulationInterval) {
            clearInterval(this._autoSimulationInterval);
            this._autoSimulationInterval = null;
        }
    }
    
    /**
     * Getters
     */
    get isSimulation() { return this._simulationMode; }
    get isConnected() { return !this._simulationMode && this.state.connected; }

    /**
     * Activa el modo simulación completo desde la consola:
     * Movimiento automático, distancia variable, hallazgos aleatorios,
     * animaciones y sonidos.
     */
    enableSimulation() {
        this._simulationMode = true;
        this.state.setConnected(true);
        this.state.setMode('MANUAL');
        this._stopAutoSimulation();
        this.state.addLogMessage('🎮 Simulación activada: controla el robot con D-Pad');
        console.log('✅ Simulación activada. Usa paleoRover.sender.disableSimulation() para detener.');
        return true;
    }

    /**
     * Detiene simulación antes de conectar real
     */
    stopSimulationOnConnect() {
        this._stopAutoSimulation();
        this._simulationMode = false;
        this.state.addLogMessage('🔌 Simulación detenida - conexión real activa');
    }

    /**
     * Desactiva el modo simulación automática
     */
    disableSimulation() {
        this._stopAutoSimulation();
        this.state.setMode('IDLE');
        this.state.addLogMessage('⏹ Simulación detenida');
        console.log('⏹ Simulación detenida.');
        return true;
    }
}
