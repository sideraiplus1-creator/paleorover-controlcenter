/**
 * UIController.js
 * Actualiza todos los elementos visuales de la interfaz
 */

export class UIController {
    constructor(robotState) {
        this.state = robotState;
        
        // Cache de elementos DOM
        this.elements = {
            // Conexión
            statusIndicator: document.getElementById('statusIndicator'),
            statusText: document.querySelector('.status-text'),
            btnConnect: document.getElementById('btnConnect'),
            
            // Modo
            btnAuto: document.getElementById('btnAuto'),
            btnManual: document.getElementById('btnManual'),
            
            // Sensores
            distanceValue: document.getElementById('distanceValue'),
            distanceBar: document.querySelector('.sensor-fill'),
            irLeft: document.getElementById('irLeft'),
            irRight: document.getElementById('irRight'),
            
            // Estado
            stateBadge: document.getElementById('stateBadge'),
            stateText: document.querySelector('.state-text'),
            
            // Hallazgos
            discoveryCounter: document.getElementById('discoveryCounter'),
            discoveriesList: document.getElementById('discoveriesList'),
            
            // Log
            logDisplay: document.getElementById('logDisplay'),
            
            // Stats del mapa
            areaExplored: document.getElementById('areaExplored'),
            positionDisplay: document.getElementById('position'),
            
            // Overlays
            discoveryOverlay: document.getElementById('discoveryOverlay'),
            danceOverlay: document.getElementById('danceOverlay')
        };
        
        // Suscribirse a cambios de estado
        this._unsubscribe = this.state.subscribe((event, value, fullState) => {
            this._handleStateChange(event, value, fullState);
        });
        
        this._discoveryQueue = [];
        this._showingDiscovery = false;
    }
    
    /**
     * Maneja cada tipo de cambio de estado
     */
    _handleStateChange(event, value, fullState) {
        switch (event) {
            case 'connected':
                this._updateConnection(value);
                break;
            case 'mode':
                this._updateMode(value);
                break;
            case 'distance':
                this._updateDistance(value);
                break;
            case 'ir':
                this._updateIR(value.left, value.right);
                break;
            case 'position':
                this._updatePosition(value);
                break;
            case 'discovery':
                this._queueDiscovery(value);
                break;
            case 'log':
                this._updateLog(value);
                break;
            case 'reset':
                this._handleReset();
                break;
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // ACTUALIZACIONES ESPECÍFICAS
    // ═══════════════════════════════════════════════════════
    
    _updateConnection(connected) {
        const { statusIndicator, statusText, btnConnect } = this.elements;
        
        if (connected) {
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Conectado';
            btnConnect.textContent = '🔗 Desconectar';
            btnConnect.style.background = 'var(--color-moss)';
        } else {
            statusIndicator.classList.remove('connected');
            statusText.textContent = 'Desconectado';
            btnConnect.textContent = '🔗 Conectar';
            btnConnect.style.background = '';
        }
    }
    
    _updateMode(mode) {
        const { btnAuto, btnManual, stateBadge, stateText } = this.elements;
        
        // Actualizar botones de modo
        if (mode === 'MANUAL') {
            btnAuto.classList.remove('active');
            btnManual.classList.add('active');
        } else {
            btnAuto.classList.add('active');
            btnManual.classList.remove('active');
        }
        
        // Actualizar badge de estado
        stateBadge.className = 'state-badge';
        stateBadge.classList.add(mode.toLowerCase());
        stateText.textContent = mode;
        
        if (mode === 'BAILANDO') {
            this._showDanceOverlay();
        }
    }
    
    _updateDistance(cm) {
        const { distanceValue, distanceBar } = this.elements;
        
        distanceValue.textContent = cm;
        
        // Barra visual (0-400cm mapeado a 0-100%)
        const percentage = Math.min(100, (cm / 400) * 100);
        distanceBar.style.width = `${percentage}%`;
        
        // Cambiar color según distancia
        if (cm < 20) {
            distanceBar.style.background = 'var(--color-danger)';
        } else if (cm < 50) {
            distanceBar.style.background = 'var(--color-warning)';
        } else {
            distanceBar.style.background = 'var(--color-moss)';
        }
    }
    
    _updateIR(left, right) {
        const { irLeft, irRight } = this.elements;
        
        irLeft.classList.toggle('active', left);
        irRight.classList.toggle('active', right);
    }
    
    _updatePosition(pos) {
        const { positionDisplay, areaExplored } = this.elements;
        
        positionDisplay.textContent = `X:${Math.round(pos.x)} Y:${Math.round(pos.y)}`;
        
        // Calcular área aproximada (simplificada)
        const trail = this.state.trail;
        const area = trail.length * 0.5; // aproximación muy básica
        areaExplored.textContent = `${area.toFixed(1)} m²`;
    }
    
    _queueDiscovery(discovery) {
        this._discoveryQueue.push(discovery);
        if (!this._showingDiscovery) {
            this._processDiscoveryQueue();
        }
    }
    
    _processDiscoveryQueue() {
        if (this._discoveryQueue.length === 0) {
            this._showingDiscovery = false;
            return;
        }
        
        this._showingDiscovery = true;
        const discovery = this._discoveryQueue.shift();
        
        // Mostrar overlay
        this._showDiscoveryOverlay(discovery);
        
        // Actualizar lista
        this._updateDiscoveriesList();
        
        // Actualizar contador
        this.elements.discoveryCounter.textContent = this.state.discoveries.length;
        
        // Ocultar después de 3 segundos
        setTimeout(() => {
            this.elements.discoveryOverlay.classList.remove('active');
            setTimeout(() => this._processDiscoveryQueue(), 500);
        }, 3000);
    }
    
    _showDiscoveryOverlay(discovery) {
        const overlay = this.elements.discoveryOverlay;
        if (!overlay) {
            console.warn('❌ #discoveryOverlay no encontrado');
            return;
        }

        const numberEl = overlay.querySelector('#discoveryNumber')
                      || overlay.querySelector('.discovery-number')
                      || overlay.querySelector('[data-discovery-number]');
        const sensorEl = overlay.querySelector('#discoverySensor')
                     || overlay.querySelector('.discovery-sensor')
                     || overlay.querySelector('[data-discovery-sensor]');
        const subtitle = overlay.querySelector('.discovery-subtitle')
                      || overlay.querySelector('.discovery-desc')
                      || overlay.querySelector('p');

        const sensorText = {
            'LEFT': 'Sensor izquierdo',
            'RIGHT': 'Sensor derecho',
            'BOTH': '¡Ambos sensores!'
        };

        if (numberEl) {
            numberEl.textContent = '#' + (discovery.number || discovery.id || '?');
        }

        if (sensorEl) {
            sensorEl.textContent = 'Sensor: ' + (sensorText[discovery.sensor] || discovery.sensor || 'DETECTADO');
        }

        if (subtitle) {
            subtitle.textContent = `${sensorText[discovery.sensor] || discovery.sensor || 'DETECTADO'} • ${discovery.timestamp || ''}`.trim();
        }

        overlay.style.display = 'flex';
        overlay.classList.remove('active');
        void overlay.offsetWidth;
        overlay.classList.add('active');

        console.log('🦴 Overlay activado:', discovery);
    }

    _showDanceOverlay() {
        const overlay = this.elements.danceOverlay;
        if (!overlay) return;

        overlay.classList.add('active');
        overlay.style.display = 'flex';
        this.state.addLogMessage('💃 Modo baile activado');

        setTimeout(() => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 500);
        }, 2500);
    }
    
    _updateDiscoveriesList() {
        const { discoveriesList } = this.elements;
        const discoveries = this.state.discoveries;
        
        if (discoveries.length === 0) {
            discoveriesList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">🏜️</span>
                    <p>Aún no hay hallazgos</p>
                    <span class="empty-hint">El robot detectará fósiles automáticamente</span>
                </div>
            `;
            return;
        }
        
        discoveriesList.innerHTML = discoveries.map(d => `
            <div class="discovery-item">
                <span class="fossil-icon">🦴</span>
                <div class="discovery-info">
                    <div class="discovery-name">Fósil #${d.number}</div>
                    <div class="discovery-time">${d.timestamp} • ${d.sensor}</div>
                </div>
            </div>
        `).join('');
        
        // Auto-scroll al más reciente
        discoveriesList.scrollTop = 0;
    }
    
    _updateLog(entry) {
        const { logDisplay } = this.elements;
        
        // Mostrar todo el historial de log
        const history = this.state.logMessages.slice();
        logDisplay.innerHTML = history.map(m => 
            `<div>[${m.time}] ${m.message}</div>`
        ).join('');
    }
    
    _handleReset() {
        const { discoveryCounter, discoveriesList, areaExplored, positionDisplay } = this.elements;
        
        discoveryCounter.textContent = '0';
        discoveriesList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🏜️</span>
                <p>Aún no hay hallazgos</p>
                <span class="empty-hint">El robot detectará fósiles automáticamente</span>
            </div>
        `;
        areaExplored.textContent = '0 m²';
        positionDisplay.textContent = 'X:150 Y:150';
    }
    
    // ═══════════════════════════════════════════════════════
    // MÉTODOS PÚBLICOS
    // ═══════════════════════════════════════════════════════
    
    /**
     * Muestra mensaje temporal en el log
     */
    showMessage(message) {
        this.state.addLogMessage(message);
    }
    
    /**
     * Limpia suscripciones al destruir
     */
    destroy() {
        if (this._unsubscribe) this._unsubscribe();
    }
}
