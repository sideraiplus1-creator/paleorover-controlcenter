/**
 * EventHandlers.js
 * Conecta eventos del DOM con la lógica
 */

export class EventHandlers {
    constructor(robotState, uiController, commandSender, mapRenderer) {
        this.state = robotState;
        this.ui = uiController;
        this.sender = commandSender;
        this.map = mapRenderer;
        this._init();
    }

    _init() {
        this._setupConnectionButtons();
        this._setupModeButtons();
        this._setupDPad();
        this._setupSpeedControls();
        this._setupActionButtons();
        this._setupCopyLog();
        this._setupMissionControls();
        this._setupKeyboard();
    }

    _setupConnectionButtons() {
        const btnConnect = document.getElementById('btnConnect');
        btnConnect.addEventListener('click', async () => {
            if (this.state.connected) {
                await this.sender.disconnect();
            } else {
                this._showConnectionMenu();
            }
        });
    }

    _showConnectionMenu() {
        let menu = document.getElementById('connectionMenu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'connectionMenu';
            menu.className = 'connection-menu';
            menu.innerHTML = `
                <div class="menu-item" data-type="serial">
                    <span class="menu-icon">🔌</span>
                    <div class="menu-info"><strong>USB-Serial</strong><span>Cable USB al Arduino</span></div>
                </div>
                <div class="menu-item" data-type="bluetooth">
                    <span class="menu-icon">📡</span>
                    <div class="menu-info"><strong>Bluetooth BLE</strong><span>HM-10, JDY-08, etc.</span></div>
                </div>
                <div class="menu-item" data-type="simulation">
                    <span class="menu-icon">🎮</span>
                    <div class="menu-info"><strong>Simulación</strong><span>Modo de prueba</span></div>
                </div>
            `;
            document.querySelector('.connection-status').appendChild(menu);

            menu.querySelectorAll('.menu-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const type = item.dataset.type;
                    menu.style.display = 'none';
                    if (type === 'simulation') {
                        this.sender.disableSimulation();
                        await new Promise(r => setTimeout(r, 100));
                        this.sender.enableSimulation();
                        this.ui.showMessage('🎮 Modo simulación activado');
                    } else {
                        this.sender.stopSimulationOnConnect();
                        const success = await this.sender.connectReal(type);
                        if (!success) {
                            this.ui.showMessage('⚠️ Falló la conexión, usando simulación');
                            this.sender.enableSimulation();
                        } else {
                            this.ui.showMessage(`✅ Conectado por ${type === 'bluetooth' ? 'Bluetooth BLE' : 'USB-Serial'}`);
                        }
                    }
                });
            });
        }

        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';

        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target.id !== 'btnConnect') {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    _setupModeButtons() {
        const btnAuto   = document.getElementById('btnAuto');
        const btnManual = document.getElementById('btnManual');

        btnAuto.addEventListener('click', () => {
            this.sender.send('E:1');
        });

        btnManual.addEventListener('click', async () => {
            // FIX: entrar a MANUAL y detener servo inmediatamente
            await this.sender.send('E:2');
            await this.sender.send('D:0');
            // Sincronizar botón de búsqueda a OFF
            const btnScan = document.getElementById('btnScan');
            if (btnScan) {
                btnScan.dataset.active = 'false';
                btnScan.querySelector('.btn-text').textContent = 'Búsqueda: OFF';
                btnScan.classList.remove('active');
            }
        });
    }

    _setupDPad() {
        const directions = {
            'btnUp': 'F', 'btnDown': 'B',
            'btnLeft': 'L', 'btnRight': 'R'
        };
        let holdInterval = null;

  const stopMove = () => {
    if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
    // FIX: solo enviar S si estamos en modo MANUAL (evita spam y timeout)
    if (this.state.mode === 'MANUAL') {
      this.sender.send('S');
    }
  };

        // FIX v3.5: Simplificado para evitar colisiones BLE
        const startMove = async (cmd) => {
            // Si no está en MANUAL, cambiar primero
            if (this.state.mode !== 'MANUAL') {
                await this.sender.send('E:2');
                await new Promise(r => setTimeout(r, 500));
                await this.sender.send('D:0');
                await new Promise(r => setTimeout(r, 300));
                const btnScan = document.getElementById('btnScan');
                if (btnScan) {
                    btnScan.dataset.active = 'false';
                    btnScan.querySelector('.btn-text').textContent = 'Búsqueda: OFF';
                    btnScan.classList.remove('active');
                }
            }
            this.sender.send(cmd);
            if (holdInterval) clearInterval(holdInterval);
            holdInterval = setInterval(() => this.sender.send(cmd), 500);
        };

        Object.entries(directions).forEach(([id, command]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('mousedown', () => startMove(command));
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                startMove(command);
                btn.style.transform = 'scale(0.95)';
            }, { passive: false });
            btn.addEventListener('mouseup', stopMove);
            btn.addEventListener('mouseleave', stopMove);
            btn.addEventListener('touchend', () => { stopMove(); btn.style.transform = ''; });
            btn.addEventListener('touchcancel', stopMove);
        });

        const stopBtn = document.getElementById('btnStop');
        if (stopBtn) {
            stopBtn.addEventListener('click', stopMove);
            stopBtn.addEventListener('touchstart', (e) => { e.preventDefault(); stopMove(); }, { passive: false });
        }
    }

    _setupSpeedControls() {
        // FIX v3.5: Slider de velocidad deshabilitado para evitar saturación BLE
        // La velocidad se mantiene fija en 100 manual / 80 auto
        const manualSlider  = document.getElementById('speedManual');
        const manualDisplay = document.getElementById('speedManualDisplay');
        const speedContainer = document.querySelector('.speed-control');
        
        // Ocultar slider de velocidad manual para evitar problemas BLE
        if (manualSlider) manualSlider.style.display = 'none';
        if (manualDisplay) manualDisplay.textContent = '100 (fija)';
        if (speedContainer) speedContainer.querySelector('label')?.remove();
    }

    _setupActionButtons() {
        // FIX: btnDance → E:3 (modo baile real en Arduino)
        const btnDance = document.getElementById('btnDance');
        if (btnDance) {
            btnDance.addEventListener('click', () => {
                this.sender.send('E:3');
            });
        }

  // FIX: btnScan = toggle unificado de búsqueda (lógica invertida)
  // "Búsqueda: ON" = servo DETENIDO (para lecturas IR estáticas de fósiles)
  // "Búsqueda: OFF" = servo ESCANEANDO (navegación normal)
  const btnScan = document.getElementById('btnScan');
  if (btnScan) {
    btnScan.addEventListener('click', () => {
      const isActive = btnScan.dataset.active === 'true';
      const newState = !isActive;
      btnScan.dataset.active = String(newState);
      btnScan.querySelector('.btn-text').textContent = newState ? 'Búsqueda: ON' : 'Búsqueda: OFF';
      btnScan.classList.toggle('active', newState);
      // FIX invertido: Búsqueda ON = D:0 (servo detenido), Búsqueda OFF = D:1 (servo activo)
      this.sender.send(newState ? 'D:0' : 'D:1');
    });
  }

        // BEEP
        const btnBeep = document.getElementById('btnBeep');
        if (btnBeep) {
            btnBeep.addEventListener('click', () => this.sender.send('BEEP'));
        }

        // Reset
        const btnReset = document.getElementById('btnReset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (!confirm('¿Resetear contador y mapa?')) return;
                this.sender.send('RESET');
                this.state.reset();
                if (this.map?.clearMap) this.map.clearMap();
            });
        }
    }

    _setupCopyLog() {
        const btnCopyLog = document.getElementById('btnCopyLog');
        if (!btnCopyLog) return;
        btnCopyLog.addEventListener('click', async () => {
            const messages = this.state.logMessages;
            if (!messages || messages.length === 0) {
                this.ui.showMessage('⚠️ No hay contenido para copiar');
                return;
            }
            const text = messages.slice().reverse().map(m => `[${m.time}] ${m.message}`).join('\n');
            try {
                await navigator.clipboard.writeText(text);
                this.ui.showMessage('📋 Log completo copiado al portapapeles');
            } catch (error) {
                this.ui.showMessage('❌ No se pudo copiar el log');
            }
        });
    }

    _setupMissionControls() {
        const btnRecord  = document.getElementById('btnRecord');
        const btnPlay    = document.getElementById('btnPlayMission');
        const btnDelete  = document.getElementById('btnDeleteMission');
        const missionList = document.getElementById('missionList');
        const statusEl   = document.getElementById('missionStatus');
        let selectedIndex = -1;
        let isRecording   = false;

        const loadMissions = () => {
            const directMissions = window.paleoRover?.recorder?.getMissions?.();
            if (directMissions) return directMissions;
            const missions = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('paleo_mission_')) {
                    try { missions.push({ key, ...JSON.parse(localStorage.getItem(key)) }); } catch (e) {}
                }
            }
            return missions.sort((a, b) => b.date - a.date);
        };

        const refreshList = () => {
            const missions = loadMissions();
            if (selectedIndex >= missions.length) selectedIndex = -1;
            missionList.innerHTML = missions.length === 0
                ? '<li class="mission-empty">Sin misiones guardadas</li>'
                : missions.map((m, i) => `
                    <li data-index="${i}" class="${i === selectedIndex ? 'selected' : ''}">
                        🗺 Misión ${i + 1} — ${m.data?.length || 0} pasos
                    </li>`).join('');
            missionList.querySelectorAll('li[data-index]').forEach(li => {
                li.addEventListener('click', () => {
                    selectedIndex = parseInt(li.dataset.index, 10);
                    refreshList();
                    if (btnPlay)   btnPlay.disabled   = false;
                    if (btnDelete) btnDelete.disabled = false;
                });
            });
            if (btnPlay)   btnPlay.disabled   = selectedIndex < 0 || missions.length === 0;
            if (btnDelete) btnDelete.disabled = selectedIndex < 0 || missions.length === 0;
        };

        if (btnRecord) {
            btnRecord.addEventListener('click', () => {
                isRecording = !isRecording;
                if (isRecording) {
                    window.paleoRover?.recorder?.startRecording?.();
                    btnRecord.textContent = '⏹ Detener';
                    btnRecord.classList.add('recording');
                    if (statusEl) statusEl.textContent = '● Grabando...';
                } else {
                    window.paleoRover?.recorder?.saveMission?.();
                    btnRecord.textContent = '⏺ Grabar';
                    btnRecord.classList.remove('recording');
                    if (statusEl) statusEl.textContent = 'Guardado ✓';
                    selectedIndex = 0;
                    refreshList();
                    setTimeout(() => { if (statusEl) statusEl.textContent = 'Listo'; }, 2000);
                }
            });
        }

        if (btnPlay) {
            btnPlay.addEventListener('click', () => {
                const missions = window.paleoRover?.recorder?.getMissions?.() || [];
                if (selectedIndex < 0 || !missions[selectedIndex]) return;
                window.paleoRover?.recorder?.playMission(missions[selectedIndex]);
                if (statusEl) statusEl.textContent = '▶ Reproduciendo...';
                setTimeout(() => { if (statusEl) statusEl.textContent = 'Listo'; }, 3000);
            });
        }

        if (btnDelete) {
            btnDelete.addEventListener('click', () => {
                if (selectedIndex < 0) return;
                const missions = window.paleoRover?.recorder?.getMissions?.() || [];
                if (!missions[selectedIndex]) return;
                window.paleoRover?.recorder?.deleteMission?.(selectedIndex);
                selectedIndex = -1;
                refreshList();
                if (statusEl) statusEl.textContent = 'Eliminado';
                setTimeout(() => { if (statusEl) statusEl.textContent = 'Listo'; }, 1500);
            });
        }

        refreshList();
    }

    _setupKeyboard() {
        const keyMap = {
            'ArrowUp': 'F', 'ArrowDown': 'B',
            'ArrowLeft': 'L', 'ArrowRight': 'R',
            ' ': 'S', 'w': 'F', 's': 'B', 'a': 'L', 'd': 'R'
        };
        document.addEventListener('keydown', (e) => {
            if (this.state.mode !== 'MANUAL') return;
            const command = keyMap[e.key];
            if (command) {
                e.preventDefault();
                this.sender.send(command);
                const btnMap = { 'F': 'btnUp', 'B': 'btnDown', 'L': 'btnLeft', 'R': 'btnRight', 'S': 'btnStop' };
                const btn = document.getElementById(btnMap[command]);
                if (btn) { btn.classList.add('active'); setTimeout(() => btn.classList.remove('active'), 150); }
            }
        });
    }
}