/**
 * MissionRecorder.js
 * Graba y reproduce misiones completas
 */

export class MissionRecorder {
    constructor(robotState, commandSender) {
        this.state = robotState;
        this.sender = commandSender;
        
        this.isRecording = false;
        this.isPlaying = false;
        this.missionData = [];
        this.startTime = 0;
        
        this._setupSubscriptions();
    }
    
    _setupSubscriptions() {
        // Grabar todos los cambios de estado importantes
        this.state.subscribe((event, value) => {
            if (!this.isRecording) return;
            
            const entry = {
                timestamp: Date.now() - this.startTime,
                event: event,
                value: value
            };
            
            this.missionData.push(entry);
        });
    }
    
    // ═══════════════════════════════════════════════════════
    // GRABACIÓN
    // ═══════════════════════════════════════════════════════
    
    startRecording() {
        if (this.isRecording) return;
        
        this.isRecording = true;
        this.missionData = [];
        this.startTime = Date.now();
        
        // Grabar estado inicial
        this.missionData.push({
            timestamp: 0,
            event: 'INIT',
            value: {
                position: this.state.position,
                mode: this.state.mode
            }
        });
        
        this.state.addLogMessage('🔴 Grabación iniciada');
    }
    
    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        
        // Agregar metadata
        const mission = {
            version: '1.0',
            date: new Date().toISOString(),
            duration: Date.now() - this.startTime,
            totalEvents: this.missionData.length,
            discoveries: this.state.discoveries.length,
            data: this.missionData
        };
        
        this.state.addLogMessage(`⏹️ Grabación finalizada: ${mission.duration}ms, ${mission.totalEvents} eventos`);
        
        return mission;
    }
    
    // ═══════════════════════════════════════════════════════
    // REPRODUCCIÓN
    // ═══════════════════════════════════════════════════════
    
    async playMission(mission, speed = 1.0) {
        if (this.isPlaying) {
            console.warn('Ya hay una misión en reproducción');
            return;
        }

        if (!mission || !Array.isArray(mission.data) || mission.data.length === 0) {
            console.error('Misión inválida:', mission);
            this.state.addLogMessage('❌ Misión inválida');
            return;
        }
        
        this.isPlaying = true;
        this.state.addLogMessage(`▶️ Reproduciendo: ${mission.name || 'Sin nombre'}`);
        
        try {
            if (this.sender?.setMode) {
                this.sender.setMode(2);
            }
            await this._sleep(500);

            this.state.reset();
            for (const step of mission.data) {
                if (!this.isPlaying) break;

                if (step.cmd) {
                    this.sender.send(step.cmd);
                } else {
                    await this._delay(step.timestamp / speed);
                    this._applyEvent(step);
                }
            }

            if (this.sender?.stop) {
                this.sender.stop();
            }
            this.state.addLogMessage('✅ Misión completada');
        } catch (error) {
            console.error('Error reproduciendo:', error);
            this.state.addLogMessage('❌ Error en reproducción');
        } finally {
            this.isPlaying = false;
        }
    }
    
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stopPlayback() {
        this.isPlaying = false;
    }
    
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
  _applyEvent(entry) {
    switch (entry.event) {
      case 'position':
        this.state.setPosition({ x: entry.value.x, y: entry.value.y });
        break;
            case 'mode':
                this.state.setMode(entry.value);
                break;
            case 'discovery':
                // No recreamos hallazgos en reproducción, solo posición
                break;
            case 'ir':
                this.state.setIR(entry.value.left, entry.value.right);
                break;
            case 'distance':
                this.state.setDistance(entry.value);
                break;
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // PERSISTENCIA
    // ═══════════════════════════════════════════════════════
    
    saveMission(name) {
        const mission = {
            ...this.stopRecording(),
            name: name || `Misión ${Date.now()}`
        };
        
        const key = `paleo_mission_${Date.now()}`;
        localStorage.setItem(key, JSON.stringify(mission));
        
        this.state.addLogMessage(`💾 Misión guardada: ${mission.name}`);
        return key;
    }
    
    loadMission(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Error cargando misión:', e);
            return null;
        }
    }
    
    listMissions() {
        const missions = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('paleo_mission_')) {
                try {
                    const mission = JSON.parse(localStorage.getItem(key));
                    missions.push({ key, ...mission });
                } catch (e) {}
            }
        }
        return missions.sort((a, b) => b.date - a.date);
    }

    getMissions() {
        return this.listMissions();
    }
    
    deleteMission(identifier) {
        if (typeof identifier === 'number') {
            const missions = this.listMissions();
            const mission = missions[identifier];
            if (mission?.key) {
                localStorage.removeItem(mission.key);
            }
            return;
        }

        if (!identifier) return;
        localStorage.removeItem(identifier);
    }
}
