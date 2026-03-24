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
        this._setupActionButtons();
        this._setupKeyboard();
    }
    
    /**
     * Botón de conectar con menú de opciones
     */
    _setupConnectionButtons() {
        const btnConnect = document.getElementById('btnConnect');
        
        btnConnect.addEventListener('click', async () => {
            if (this.state.connected) {
                // Desconectar
                await this.sender.disconnect();
            } else {
                // Mostrar menú de opciones
                this._showConnectionMenu();
            }
        });
    }
    
    /**
     * Menú flotante para elegir tipo de conexión
     */
    _showConnectionMenu() {
        // Crear menú si no existe
        let menu = document.getElementById('connectionMenu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'connectionMenu';
            menu.className = 'connection-menu';
            menu.innerHTML = `
                <div class="menu-item" data-type="serial">
                    <span class="menu-icon">🔌</span>
                    <div class="menu-info">
                        <strong>USB-Serial</strong>
                        <span>Cable USB al Arduino</span>
                    </div>
                </div>
                <div class="menu-item" data-type="bluetooth">
                    <span class="menu-icon">📡</span>
                    <div class="menu-info">
                        <strong>Bluetooth BLE</strong>
                        <span>HM-10, JDY-08, etc.</span>
                    </div>
                </div>
                <div class="menu-item" data-type="simulation">
                    <span class="menu-icon">🎮</span>
                    <div class="menu-info">
                        <strong>Simulación</strong>
                        <span>Modo de prueba</span>
                    </div>
                </div>
            `;
            
            document.querySelector('.connection-status').appendChild(menu);
            
            // Eventos de los items
            menu.querySelectorAll('.menu-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const type = item.dataset.type;
                    menu.style.display = 'none';
                    
                    if (type === 'simulation') {
                        this.state.setConnected(true);
                        this.ui.showMessage('Modo simulación activado');
                    } else {
                        const success = await this.sender.connectReal(type);
                        if (!success) {
                            this.ui.showMessage('Falló la conexión, usando simulación');
                            this.state.setConnected(true);
                        }
                    }
                });
            });
        }
        
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        
        // Cerrar al hacer clic fuera
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target.id !== 'btnConnect') {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    /**
     * Botones de modo AUTO/MANUAL
     */
    _setupModeButtons() {
        const btnAuto = document.getElementById('btnAuto');
        const btnManual = document.getElementById('btnManual');
        
        btnAuto.addEventListener('click', () => this.sender.send('M:1'));
        btnManual.addEventListener('click', () => this.sender.send('M:2'));
    }
    
    /**
     * D-Pad direccional
     */
    _setupDPad() {
        const dpadButtons = {
            'btnUp': 'F', 'btnDown': 'B',
            'btnLeft': 'L', 'btnRight': 'R', 'btnStop': 'S'
        };
        
        Object.entries(dpadButtons).forEach(([id, command]) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            
            btn.addEventListener('click', () => this.sender.send(command));
            
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.sender.send(command);
                btn.style.transform = 'scale(0.95)';
            });
            
            btn.addEventListener('touchend', () => {
                btn.style.transform = '';
            });
        });
    }
    
    /**
     * Botones de acción especiales
     */
    _setupActionButtons() {
        const actions = {
            'btnDance': 'D:1', 'btnScan': 'D:2',
            'btnBeep': 'BEEP', 'btnReset': 'RESET'
        };
        
        Object.entries(actions).forEach(([id, command]) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', () => this.sender.send(command));
        });
    }
    
    /**
     * Controles de teclado
     */
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
                
                const btnMap = {
                    'F': 'btnUp', 'B': 'btnDown',
                    'L': 'btnLeft', 'R': 'btnRight', 'S': 'btnStop'
                };
                const btn = document.getElementById(btnMap[command]);
                if (btn) {
                    btn.classList.add('active');
                    setTimeout(() => btn.classList.remove('active'), 150);
                }
            }
        });
    }
}
