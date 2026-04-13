/**
 * main.js
 * Paleo Rover Control Center - v2.0 PRODUCTION
 * Fases: 1-UI | 2-JS Base | 3-Bluetooth | 4-Polish | 5-Production ✅
 */

import { RobotState } from './modules/robotstate.js';
import { UIController } from './modules/uicontroller.js';
import { MapRenderer } from './modules/maprenderer.js';
import { CommandSender } from './modules/commandsender.js';
import { EventHandlers } from './modules/eventhandlers.js';
import { ProtocolHandler } from './modules/protocolhandler.js';
import { StorageManager } from './modules/storagemanager.js';
import { AudioFeedback } from './modules/audiofeedback.js';
import { ChartManager } from './modules/chartmanager.js';
import { MissionRecorder } from './modules/missionrecorder.js';
import { PWAManager } from './modules/pwamanager.js';

window.paleoRoverStartTime = Date.now();

document.addEventListener('DOMContentLoaded', async () => {
    console.log('%c🦕 Paleo Rover v2.0', 'font-size:24px;color:#C4A35A');
    console.log('%cProduction Ready', 'font-size:14px;color:#00FF00');
    
    // ═══════════════════════════════════════════════════
    // INICIALIZACIÓN CORE
    // ═══════════════════════════════════════════════════
    const robotState = new RobotState();
    const uiController = new UIController(robotState);
    const mapRenderer = new MapRenderer('explorationMap', robotState);
    const commandSender = new CommandSender(robotState);
    const eventHandlers = new EventHandlers(
        robotState, uiController, commandSender, mapRenderer
    );
    
    // ═══════════════════════════════════════════════════
    // FASE 4: MEJORAS
    // ═══════════════════════════════════════════════════
    const storage = new StorageManager(robotState);
    const audio = new AudioFeedback(robotState);
    const charts = new ChartManager('distanceChart', robotState);
    
    // Cargar datos previos
    const savedData = storage.load();
    if (savedData) storage.restoreDiscoveries(savedData);
    
    // ═══════════════════════════════════════════════════
    // FASE 5: PRODUCCIÓN
    // ═══════════════════════════════════════════════════
    const protocol = new ProtocolHandler(robotState);
    const recorder = new MissionRecorder(robotState, commandSender);
    const pwa = new PWAManager();
    
    // Keepalive periódico (evita timeout de MANUAL en Arduino)
    setInterval(() => {
        if (commandSender.isConnected) {
            commandSender.send(protocol.getPing());
        }
    }, 2000);
    
    // ═══════════════════════════════════════════════════
    // UI - BOTONES DE EXPORTACIÓN (FASE 4)
    // ═══════════════════════════════════════════════════
    const btnExportHTML = document.getElementById('btnExportHTML');
    const btnExportCSV = document.getElementById('btnExportCSV');
    const btnExportJSON = document.getElementById('btnExportJSON');
    
    if (btnExportHTML) btnExportHTML.addEventListener('click', () => storage.generateReport('html'));
    if (btnExportCSV) btnExportCSV.addEventListener('click', () => storage.generateReport('csv'));
    if (btnExportJSON) btnExportJSON.addEventListener('click', () => storage.generateReport('json'));
    
    // ═══════════════════════════════════════════════════
    // UI - CONTROLES DE AUDIO (FASE 4)
    // ═══════════════════════════════════════════════════
    const btnToggleAudio = document.getElementById('btnToggleAudio');
    const volumeSlider = document.getElementById('volumeSlider');
    
    if (btnToggleAudio) {
        btnToggleAudio.addEventListener('click', () => {
            const enabled = audio.toggle();
            btnToggleAudio.textContent = enabled ? '🔊' : '🔇';
        });
    }
    
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            audio.setVolume(e.target.value / 100);
        });
    }
    
    // ═══════════════════════════════════════════════════
    // UI - CONTROLES FASE 5 (PWA, GRABACIÓN, ETC)
    // ═══════════════════════════════════════════════════
    
    // Botón de instalación PWA
    document.getElementById('btnInstall')?.addEventListener('click', () => {
        pwa.promptInstall();
    });
    
    // Controles de grabación
    document.getElementById('btnRecord')?.addEventListener('click', () => {
        if (recorder.isRecording) {
            const mission = recorder.stopRecording();
            const name = prompt('Nombre de la misión:');
            if (name) recorder.saveMission(name);
            updateMissionList();
        } else {
            recorder.startRecording();
        }
    });
    
    // Actualizar lista de misiones
    const updateMissionList = () => {
        const list = document.getElementById('missionList');
        if (!list) return;
        
        const missions = recorder.listMissions();
        if (missions.length === 0) {
            list.innerHTML = '<p class="empty-hint">No hay misiones grabadas</p>';
            return;
        }
        
        list.innerHTML = missions.map(m => `
            <div class="mission-item">
                <span>${m.name}</span>
                <button onclick="window.playMission('${m.key}')">▶️</button>
                <button onclick="window.deleteMission('${m.key}')">🗑️</button>
            </div>
        `).join('');
    };
    
    window.playMission = (key) => {
        const mission = recorder.loadMission(key);
        if (mission) recorder.playMission(mission);
    };
    
    window.deleteMission = (key) => {
        recorder.deleteMission(key);
        updateMissionList();
    };
    
    // Calibración remota
    document.getElementById('btnCalibrate')?.addEventListener('click', () => {
        commandSender.send(protocol.encode('CL', { s: 'IR' }));
        robotState.addLogMessage('🔧 Calibración IR iniciada');
    });
    
    // Notificaciones
    document.getElementById('btnNotify')?.addEventListener('click', () => {
        protocol.requestNotificationPermission();
        robotState.addLogMessage('🔔 Notificaciones activadas');
    });
    
    // ═══════════════════════════════════════════════════
    // ACTUALIZAR ESTADÍSTICAS EN TIEMPO REAL
    // ═══════════════════════════════════════════════════
    setInterval(() => {
        const elapsed = Math.floor((Date.now() - window.paleoRoverStartTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        const sessionTimeElement = document.getElementById('sessionTime');
        if (sessionTimeElement) {
            sessionTimeElement.textContent = `${mins}:${secs}`;
        }
        
        const totalDistElement = document.getElementById('totalDistance');
        if (totalDistElement) {
            const distance = storage._calculateTotalDistance();
            totalDistElement.textContent = `${distance.toFixed(1)}m`;
        }
    }, 1000);
    
    // ═══════════════════════════════════════════════════
    // INICIALIZACIÓN FINAL
    // ═══════════════════════════════════════════════════
    setTimeout(() => {
        // No marcar conectado por defecto: solo cuando haya conexión real
        uiController.showMessage('🦕 Paleo Rover v2.0 listo. Producción activada.');
        protocol.requestNotificationPermission();
        updateMissionList();
    }, 500);
    
    // ═══════════════════════════════════════════════════
    // API GLOBAL COMPLETA
    // ═══════════════════════════════════════════════════
    window.paleoRover = {
        // Core
        state: robotState,
        ui: uiController,
        map: mapRenderer,
        sender: commandSender,
        
        // Fase 4
        storage: storage,
        audio: audio,
        charts: charts,
        
        // Fase 5
        protocol: protocol,
        recorder: recorder,
        pwa: pwa,
        
        // Métodos
        connect: (type) => commandSender.connectReal(type),
        disconnect: () => commandSender.disconnect(),
        export: (format) => storage.generateReport(format),
        record: () => recorder.startRecording(),
        stopRecord: () => recorder.stopRecording(),
        playMission: (key) => window.playMission(key),
        calibrate: (sensor) => commandSender.send(
            protocol.encode('CL', { s: sensor })
        ),
        
        // Info
        version: '2.0',
        phases: ['UI', 'JS Base', 'Bluetooth', 'Polish', 'Production']
    };
    
    console.log('✅ Paleo Rover v2.0 cargado');
    console.log('Comandos: paleoRover.connect(), .record(), .playMission(), .calibrate()');
});
