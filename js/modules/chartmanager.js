/**
 * ChartManager.js
 * Gráficos en tiempo real usando Canvas
 */

export class ChartManager {
    constructor(canvasId, robotState) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn('Canvas no encontrado:', canvasId);
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.state = robotState;
        
        // Datos históricos
        this.distanceHistory = new Array(100).fill(0);
        this.maxHistory = 100;
        this._smoothed = 0;
        this._alpha = 0.3;
        
        // Suscribirse a cambios de distancia
        this.state.subscribe((event, value) => {
            if (event === 'distance') {
                this._addDataPoint(value);
            }
        });
        
        // Iniciar animación
        this._animate();
    }
    
    _addDataPoint(distance) {
        // Ignorar valores inválidos
        if (distance < 0 || distance > 400) return;

        const clamped = Math.min(distance, 300);
        if (this._smoothed === 0) {
            this._smoothed = clamped;
        } else {
            this._smoothed = this._alpha * clamped + (1 - this._alpha) * this._smoothed;
        }

        const smoothedValue = Math.round(this._smoothed);
        this.distanceHistory.push(smoothedValue);
        if (this.distanceHistory.length > this.maxHistory) {
            this.distanceHistory.shift();
        }
    }

    reset() {
        this.distanceHistory = new Array(this.maxHistory).fill(0);
        this._smoothed = 0;
    }
    
    _animate() {
        this.render();
        requestAnimationFrame(() => this._animate());
    }
    
    render() {
        const { ctx, canvas } = this;
        const { width, height } = canvas;
        
        // Limpiar
        ctx.clearRect(0, 0, width, height);
        
        // Dibujar gráfico de distancia
        this._drawDistanceChart(width, height);
    }
    
    _drawDistanceChart(width, height) {
        const { ctx } = this;
        const data = this.distanceHistory;
        const maxVal = 400; // Máximo del sensor
        
        // Fondo
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        // Líneas de referencia
        ctx.strokeStyle = 'rgba(196, 163, 90, 0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Línea de datos
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const stepX = width / (this.maxHistory - 1);
        
        data.forEach((val, i) => {
            const x = i * stepX;
            const y = height - (val / maxVal) * height;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        
        ctx.stroke();
        
        // Área bajo la curva
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.fill();
        
        // Valor actual
        const current = data[data.length - 1] || 0;
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${current.toFixed(0)} cm`, 10, 20);
    }
}
