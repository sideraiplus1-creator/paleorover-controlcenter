/**
 * StorageManager.js
 * Persistencia de datos y exportación de reportes
 */

export class StorageManager {
    constructor(robotState) {
        this.state = robotState;
        this.STORAGE_KEY = 'paleoRover_expedition';
        this.SETTINGS_KEY = 'paleoRover_settings';
        
        this._initAutoSave();
    }
    
    // ═══════════════════════════════════════════════════════
    // GUARDADO AUTOMÁTICO
    // ═══════════════════════════════════════════════════════
    
    _initAutoSave() {
        // Guardar cada 10 segundos si hay cambios
        setInterval(() => this._autoSave(), 10000);
        
        // Guardar al cerrar página
        window.addEventListener('beforeunload', () => this._autoSave());
    }
    
    _autoSave() {
        const data = {
            timestamp: Date.now(),
            discoveries: this.state.discoveries,
            trail: this.state.trail,
            position: this.state.position,
            angle: this.state.angle,
            stats: {
                totalDistance: this._calculateTotalDistance(),
                sessionTime: this._getSessionTime(),
                areaExplored: this.state.trail.length * 0.5
            }
        };
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }
    
    /**
     * Carga expedición guardada
     */
    load() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (!saved) return null;
            
            const data = JSON.parse(saved);
            this.state.addLogMessage(`Expedición del ${new Date(data.timestamp).toLocaleDateString()} cargada`);
            return data;
            
        } catch (e) {
            console.error('Error cargando:', e);
            return null;
        }
    }
    
    /**
     * Restaura hallazgos y ruta guardados
     */
    restoreDiscoveries(data) {
        if (!data) return;
        
        this.state._state.discoveries = Array.isArray(data.discoveries)
            ? data.discoveries.map(d => ({
                ...d,
                position: d.position ? { x: d.position.x, y: d.position.y } : { x: 0, y: 0 }
            }))
            : [];
        
        this.state._trail = Array.isArray(data.trail)
            ? data.trail.map(point => ({ x: point.x, y: point.y }))
            : [{ x: 150, y: 150 }];
        
        this.state._state.position = data.position
            ? { x: data.position.x, y: data.position.y }
            : this.state._trail[this.state._trail.length - 1] || { x: 150, y: 150 };
        
        this.state._state.angle = typeof data.angle === 'number' ? data.angle : 0;
        
        this.state._notify('reset', null);
        this.state.addLogMessage('📥 Expedición restaurada desde el guardado');
    }
    
    // ═══════════════════════════════════════════════════════
    // EXPORTACIÓN DE REPORTES
    // ═══════════════════════════════════════════════════════
    
    /**
     * Genera reporte PDF/HTML de la expedición
     */
    generateReport(format = 'html') {
        const discoveries = this.state.discoveries;
        const stats = {
            total: discoveries.length,
            byLeftSensor: discoveries.filter(d => d.sensor === 'LEFT' || d.sensor === 'BOTH').length,
            byRightSensor: discoveries.filter(d => d.sensor === 'RIGHT' || d.sensor === 'BOTH').length,
            sessionTime: this._getSessionTime(),
            totalDistance: this._calculateTotalDistance()
        };
        
        if (format === 'json') {
            return this._exportJSON(discoveries, stats);
        } else if (format === 'csv') {
            return this._exportCSV(discoveries);
        } else {
            return this._exportHTML(discoveries, stats);
        }
    }
    
    _exportJSON(discoveries, stats) {
        const data = {
            expedition: 'Paleo Rover',
            date: new Date().toISOString(),
            stats: stats,
            discoveries: discoveries
        };
        
        this._downloadFile(
            JSON.stringify(data, null, 2),
            `expedicion_${Date.now()}.json`,
            'application/json'
        );
    }
    
    _exportCSV(discoveries) {
        const headers = 'ID,Numero,Sensor,X,Y,Tiempo\n';
        const rows = discoveries.map(d => 
            `${d.id},${d.number},${d.sensor},${d.position.x},${d.position.y},${d.timestamp}`
        ).join('\n');
        
        this._downloadFile(
            headers + rows,
            `hallazgos_${Date.now()}.csv`,
            'text/csv'
        );
    }
    
    _exportHTML(discoveries, stats) {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reporte Expedición Paleo Rover</title>
    <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        h1 { color: #8B4513; border-bottom: 3px solid #C4A35A; padding-bottom: 10px; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
        .stat-box { background: #f5f5dc; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 2rem; font-weight: bold; color: #8B4513; }
        .discovery { display: flex; align-items: center; gap: 15px; padding: 10px; 
                     border-bottom: 1px solid #ddd; }
        .fossil-icon { font-size: 2rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #8B4513; color: white; }
    </style>
</head>
<body>
    <h1>🦴 Reporte de Expedición - Paleo Rover</h1>
    <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
    
    <div class="stats">
        <div class="stat-box">
            <div class="stat-value">${stats.total}</div>
            <div>Total Hallazgos</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${stats.sessionTime}</div>
            <div>Tiempo de Sesión</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${stats.totalDistance.toFixed(1)}m</div>
            <div>Distancia Recorrida</div>
        </div>
    </div>
    
    <h2>🗺️ Hallazgos Detallados</h2>
    <table>
        <tr>
            <th>#</th>
            <th>Sensor</th>
            <th>Posición X</th>
            <th>Posición Y</th>
            <th>Hora</th>
        </tr>
        ${discoveries.map(d => \`
        <tr>
            <td>\${d.number}</td>
            <td>\${d.sensor}</td>
            <td>\${d.position.x.toFixed(1)}</td>
            <td>\${d.position.y.toFixed(1)}</td>
            <td>\${d.timestamp}</td>
        </tr>
        \`).join('')}
    </table>
    
    <h2>📍 Mapa de Ruta</h2>
    <canvas id="routeMap" width="600" height="400"></canvas>
    
    <script>
        // Dibujar ruta simplificada
        const canvas = document.getElementById('routeMap');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f5f5dc';
        ctx.fillRect(0, 0, 600, 400);
        
        // Dibujar hallazgos
        const discoveries = ${JSON.stringify(discoveries)};
        discoveries.forEach(d => {
            const x = (d.position.x / 300) * 600;
            const y = (d.position.y / 300) * 400;
            ctx.font = '20px serif';
            ctx.fillText('🦴', x, y);
            ctx.fillStyle = '#8B4513';
            ctx.font = '12px sans-serif';
            ctx.fillText('#' + d.number, x + 15, y);
        });
    </script>
</body>
</html>`;
        
        this._downloadFile(html, `reporte_expedicion_${Date.now()}.html`, 'text/html');
    }
    
    _downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.state.addLogMessage(`📄 Reporte descargado: ${filename}`);
    }
    
    // ═══════════════════════════════════════════════════════
    // CONFIGURACIONES
    // ═══════════════════════════════════════════════════════
    
    saveSettings(settings) {
        localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    }
    
    loadSettings() {
        try {
            return JSON.parse(localStorage.getItem(this.SETTINGS_KEY)) || {};
        } catch {
            return {};
        }
    }
    
    // ═══════════════════════════════════════════════════════
    // ESTADÍSTICAS
    // ═══════════════════════════════════════════════════════
    
    _calculateTotalDistance() {
        const trail = this.state.trail;
        let total = 0;
        for (let i = 1; i < trail.length; i++) {
            const dx = trail[i].x - trail[i-1].x;
            const dy = trail[i].y - trail[i-1].y;
            total += Math.hypot(dx, dy);
        }
        return total * 0.01; // Convertir a metros aproximados
    }
    
    _getSessionTime() {
        // Simplificado - en app real usar timestamp de inicio
        const startTime = window.paleoRoverStartTime || Date.now();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    /**
     * Limpia todo el almacenamiento
     */
    clear() {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.SETTINGS_KEY);
        this.state.addLogMessage('🗑️ Almacenamiento limpiado');
    }
}
