/**
 * MapRenderer.js
 * Renderiza el mapa de exploración en Canvas
 */

export class MapRenderer {
    constructor(canvasId, robotState) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.state = robotState;
        
        // Configuración visual
        this.config = {
            gridSize: 30,        // Tamaño de cuadrícula
            trailWidth: 3,       // Grosor del rastro
            robotSize: 8,        // Tamaño del punto del robot
            fossilSize: 12       // Tamaño de los hallazgos
        };
        
        // Suscribirse a cambios que requieren redibujar
        this._unsubscribe = this.state.subscribe((event, value) => {
            if (['position', 'discovery', 'reset', 'mode'].includes(event)) {
                this.render();
            }
        });
        
        // Dibujar inicial
        this.render();
    }
    
    /**
     * Renderiza todo el mapa
     */
    render() {
        const { ctx, canvas } = this;
        const { width, height } = canvas;
        
        // Limpiar canvas
        ctx.clearRect(0, 0, width, height);
        
        // Dibujar capas en orden
        this._drawGrid(width, height);
        this._drawTrail();
        this._drawDiscoveries();
        this._drawRobot();
        this._drawCompass();
    }
    
    /**
     * Dibuja la cuadrícula de excavación
     */
    _drawGrid(width, height) {
        const { ctx, config } = this;
        
        ctx.strokeStyle = 'rgba(196, 163, 90, 0.15)';
        ctx.lineWidth = 1;
        
        // Líneas verticales
        for (let x = 0; x <= width; x += config.gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Líneas horizontales
        for (let y = 0; y <= height; y += config.gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Borde decorativo
        ctx.strokeStyle = 'rgba(196, 163, 90, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, width - 4, height - 4);
    }
    
    /**
     * Dibuja el rastro del robot
     */
    _drawTrail() {
        const { ctx, config } = this;
        const trail = this.state.trail;
        
        if (trail.length < 2) return;
        
        ctx.strokeStyle = 'rgba(196, 163, 90, 0.6)';
        ctx.lineWidth = config.trailWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        
        for (let i = 1; i < trail.length; i++) {
            ctx.lineTo(trail[i].x, trail[i].y);
        }
        
        ctx.stroke();
        
        // Efecto de "polvo" en puntos del rastro
        ctx.fillStyle = 'rgba(196, 163, 90, 0.3)';
        for (let i = 0; i < trail.length; i += 5) {
            ctx.beginPath();
            ctx.arc(trail[i].x, trail[i].y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    /**
     * Dibuja los hallazgos como fósiles
     */
    _drawDiscoveries() {
        const { ctx, config } = this;
        const discoveries = this.state.discoveries;
        
        discoveries.forEach(d => {
            const { x, y } = d.position;
            
            // Brillo alrededor
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
            gradient.addColorStop(0, 'rgba(232, 220, 196, 0.4)');
            gradient.addColorStop(1, 'rgba(232, 220, 196, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.fill();
            
            // Icono de hueso
            ctx.font = `${config.fossilSize}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🦴', x, y);
            
            // Número del hallazgo
            ctx.fillStyle = '#3D2914';
            ctx.font = 'bold 8px sans-serif';
            ctx.fillText(d.number, x + 8, y + 8);
        });
    }
    
    /**
     * Dibuja el robot con dirección
     */
    _drawRobot() {
        const { ctx, config } = this;
        const { x, y } = this.state.position;
        const angle = this.state.angle;
        
        // Guardar contexto para rotar
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((angle * Math.PI) / 180);
        
        // Halo de luz (sensor activo)
        if (this.state.irLeft || this.state.irRight) {
            const gradient = ctx.createRadialGradient(0, 0, 5, 0, 0, 25);
            gradient.addColorStop(0, 'rgba(196, 163, 90, 0.6)');
            gradient.addColorStop(1, 'rgba(196, 163, 90, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Cuerpo del robot (triángulo apuntando arriba)
        ctx.fillStyle = '#00FF00';
        ctx.shadowColor = '#00FF00';
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.moveTo(0, -config.robotSize);
        ctx.lineTo(-config.robotSize * 0.7, config.robotSize * 0.7);
        ctx.lineTo(config.robotSize * 0.7, config.robotSize * 0.7);
        ctx.closePath();
        ctx.fill();
        
        // Resetear sombra
        ctx.shadowBlur = 0;
        
        // Indicadores de sensores IR
        if (this.state.irLeft) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(-10, -5, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        if (this.state.irRight) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(10, -5, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    /**
     * Dibuja brújula en esquina
     */
    _drawCompass() {
        const { ctx, canvas } = this;
        const cx = canvas.width - 30;
        const cy = 30;
        const radius = 20;
        
        // Círculo
        ctx.strokeStyle = 'rgba(196, 163, 90, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // N
        ctx.fillStyle = 'rgba(196, 163, 90, 0.8)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('N', cx, cy - radius - 5);
        
        // Aguja que apunta al ángulo del robot
        const angle = (this.state.angle - 90) * Math.PI / 180;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        
        ctx.strokeStyle = '#C4A35A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -radius + 5);
        ctx.stroke();
        
        ctx.restore();
    }
    
    /**
     * Convierte coordenadas del mundo a canvas
     */
    worldToCanvas(x, y) {
        return { x, y }; // En este caso son iguales
    }
    
    /**
     * Limpia suscripciones
     */
    destroy() {
        if (this._unsubscribe) this._unsubscribe();
    }
}
