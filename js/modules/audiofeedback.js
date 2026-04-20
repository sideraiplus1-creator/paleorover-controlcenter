/**
 * AudioFeedback.js
 * Sonidos y efectos auditivos usando Web Audio API
 */

export class AudioFeedback {
  constructor(robotState) {
    this.state = robotState;
    this.enabled = true;
    this.volume = 0.3;
    this._initialized = false;
    this._unsubscribe = null;

    this.audioContext = null;
    this._setupUserInteraction();

    // Suscribirse a eventos
    this._subscribeToEvents();
  }
    
    _initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this._initialized = true;
        } catch (e) {
            console.warn('Web Audio API no soportada');
        }
    }

    _setupUserInteraction() {
        const initAudio = async () => {
            if (!this._initialized) {
                this._initAudio();
            }
            if (this.audioContext && this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                } catch (e) {
                    console.warn('No se pudo reanudar AudioContext:', e);
                }
            }
        };

        document.addEventListener('click', initAudio);
        document.addEventListener('touchstart', initAudio);
        document.addEventListener('keydown', initAudio);
    }
    
  _subscribeToEvents() {
    // Contador para no reproducir sonido de movimiento en cada tick
    this._moveCounter = 0;

    this._unsubscribe = this.state.subscribe((event, value) => {
            if (!this.enabled) return;

            switch (event) {
                case 'discovery':
                    this.playDiscoverySound();
                    break;
                case 'connected':
                    this.playConnectionSound(value);
                    break;
                case 'mode':
                    this.playModeChangeSound(value);
                    break;
                case 'ir':
                    if (value.left || value.right) {
                        this.playDetectionBeep();
                    }
                    break;
                case 'position':
                    // Sonido de movimiento cada 4 ticks para no saturar
                    this._moveCounter++;
                    if (this._moveCounter % 4 === 0) {
                        this.playMovementSound('F');
                    }
                    break;
            }
        });
    }
    
    // ═══════════════════════════════════════════════════════
    // GENERADORES DE SONIDO
    // ═══════════════════════════════════════════════════════
    
    playDiscoverySound() {
        // Fanfarria de hallazgo
        this._playTone(523.25, 0.1, 0.1); // C5
        setTimeout(() => this._playTone(659.25, 0.1, 0.1), 100); // E5
        setTimeout(() => this._playTone(783.99, 0.2, 0.2), 200); // G5
        setTimeout(() => this._playTone(1046.50, 0.4, 0.3), 400); // C6
    }
    
    playConnectionSound(connected) {
        if (connected) {
            // Ascendente - conexión exitosa
            this._playTone(440, 0.1, 0.1);
            setTimeout(() => this._playTone(554.37, 0.1, 0.1), 100);
            setTimeout(() => this._playTone(659.25, 0.2, 0.2), 200);
        } else {
            // Descendente - desconexión
            this._playTone(659.25, 0.1, 0.1);
            setTimeout(() => this._playTone(554.37, 0.1, 0.1), 100);
            setTimeout(() => this._playTone(440, 0.2, 0.2), 200);
        }
    }
    
    playModeChangeSound(mode) {
        const frequencies = {
            'EXPLORANDO': 587.33, // D5
            'MANUAL': 698.46,     // F5
            'HALLAZGO': 880,      // A5
            'IDLE': 440           // A4
        };
        
        const freq = frequencies[mode] || 440;
        this._playTone(freq, 0.15, 0.1);
    }
    
    playDetectionBeep() {
        // Beep corto de detección
        this._playTone(1200, 0.05, 0.05);
    }
    
    playMovementSound(direction) {
        const freqs = {
            'F': 300, 'B': 250, 'L': 280, 'R': 320
        };
        this._playTone(freqs[direction] || 300, 0.1, 0.05);
    }
    
    playErrorSound() {
        this._playTone(150, 0.3, 0.2);
        setTimeout(() => this._playTone(150, 0.3, 0.2), 150);
    }
    
    // ═══════════════════════════════════════════════════════
    // UTILIDAD AUDIO
    // ═══════════════════════════════════════════════════════
    
    async _ensureResumed() {
        if (!this.audioContext) return false;
        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
            } catch (e) {
                return false;
            }
        }
        return this.audioContext.state === 'running';
    }

    async _playTone(frequency, duration, volume = this.volume) {
        if (!this.audioContext) return;
        const isReady = await this._ensureResumed();
        if (!isReady) return;
        this._doPlayTone(frequency, duration, volume);
    }

    _doPlayTone(frequency, duration, volume) {
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';

            const now = this.audioContext.currentTime;
            gainNode.gain.setValueAtTime(volume * this.volume, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

            oscillator.start(now);
            oscillator.stop(now + duration);
        } catch (e) {
            console.warn('Error reproduciendo tono:', e);
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // CONTROLES
    // ═══════════════════════════════════════════════════════
    
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
    
    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
    }
    
  /**
   * Prueba todos los sonidos
   */
  testAll() {
    const sounds = [
      () => this.playConnectionSound(true),
      () => this.playDiscoverySound(),
      () => this.playModeChangeSound('EXPLORANDO'),
      () => this.playDetectionBeep(),
      () => this.playConnectionSound(false)
    ];

    sounds.forEach((sound, i) => {
      setTimeout(sound, i * 800);
    });
  }

  /**
   * Limpia suscripciones y recursos de audio
   */
  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(console.warn);
      this.audioContext = null;
    }
  }
}
