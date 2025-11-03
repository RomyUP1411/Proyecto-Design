import React, {useEffect, useState, useRef} from "react";
import { openDB } from 'idb';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';

// Constants
const DB_NAME = 'bodega-inventario';
const DB_VERSION = 1;

const CURRENCIES = ['S/', '$', '€', 'MXN', 'COP', 'ARS'];

const SAMPLE_PRODUCTS = [
  { sku: 'GALX-001', name: 'Galletas X', category: 'Panadería' },
  { sku: 'LECH-002', name: 'Leche entera 1L', category: 'Lácteos' },
  { sku: 'PAN-003', name: 'Pan integral', category: 'Panadería' },
  { sku: 'AGUA-004', name: 'Agua mineral 500ml', category: 'Bebidas' },
  { sku: 'CAFE-005', name: 'Café molido 250g', category: 'Despensa' },
  { sku: 'ARROZ-006', name: 'Arroz blanco 1kg', category: 'Granos' },
  { sku: 'ACEIT-007', name: 'Aceite vegetal 1L', category: 'Aceites' },
  { sku: 'AZUC-008', name: 'Azúcar blanca 1kg', category: 'Despensa' }
];

const SIMULATED_DEVICES = [
  { id: 'BRZ-001', name: 'Brazalete-Proto-001', rssi: -50 },
  { id: 'BRZ-002', name: 'Brazalete-Proto-002', rssi: -65 },
  { id: 'BRZ-003', name: 'Brazalete-Proto-003', rssi: -78 }
];

const DEFAULT_COLUMNS = [
  { label: 'SKU', key: 'sku', required: true },
  { label: 'Nombre', key: 'name', required: true },
  { label: 'Categoría', key: 'category', required: false },
  { label: 'Stock', key: 'quantity', required: true },
  { label: 'Precio compra', key: 'purchase_price', required: false },
  { label: 'Precio venta', key: 'sale_price', required: false },
  { label: 'Lote', key: 'lot', required: false },
  { label: 'Fecha caducidad', key: 'expiry', required: false }
];

// Database functions
async function initDB() {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(upgradeDb) {
      // Settings store
      if (!upgradeDb.objectStoreNames.contains('settings')) {
        upgradeDb.createObjectStore('settings', { keyPath: 'key' });
      }
      
      // Products store
      if (!upgradeDb.objectStoreNames.contains('products')) {
        upgradeDb.createObjectStore('products', { keyPath: 'sku' });
      }
      
      // Batches store
      if (!upgradeDb.objectStoreNames.contains('batches')) {
        const batchStore = upgradeDb.createObjectStore('batches', { keyPath: 'id', autoIncrement: true });
        batchStore.createIndex('product_sku', 'product_sku');
        batchStore.createIndex('expiry', 'expiry');
      }
      
      // Movements store
      if (!upgradeDb.objectStoreNames.contains('movements')) {
        upgradeDb.createObjectStore('movements', { keyPath: 'id', autoIncrement: true });
      }
    }
  });
  return db;
}

// Utility functions
function nowISO() {
  return new Date().toISOString();
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('es-ES');
}

function formatDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('es-ES');
}

function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const expiry = new Date(dateStr);
  const now = new Date();
  const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
  return diffDays < 30 && diffDays > 0;
}

// Toast component
function Toast({ toasts, removeToast }) {
  useEffect(() => {
    toasts.forEach(toast => {
      if (toast.autoHide !== false) {
        setTimeout(() => removeToast(toast.id), 3000);
      }
    });
  }, [toasts]);

  return (
    <div>
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast--${toast.type}`}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            {toast.title}
          </div>
          <div style={{ fontSize: '14px' }}>
            {toast.message}
          </div>
          <button 
            onClick={() => removeToast(toast.id)}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// RSSI indicator component
function RSSIIndicator({ rssi, connected }) {
  const bars = [];
  const strength = Math.abs(rssi);
  
  for (let i = 0; i < 4; i++) {
    const isActive = connected && strength < (40 + i * 15);
    bars.push(
      <div key={i} className={`rssi-bar ${isActive ? 'rssi-bar--active' : ''}`}></div>
    );
  }
  
  return (
    <div className="rssi-indicator">
      <div className="rssi-bars">{bars}</div>
      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        {rssi} dBm
      </span>
    </div>
  );
}

// Onboarding component
function Onboarding({ onComplete }) {
  const [formData, setFormData] = useState({
    user: '',
    bodega: '',
    currency: 'S/',
    columns: DEFAULT_COLUMNS.filter(col => col.required).map(col => col.key)
  });
  
  const handleColumnToggle = (columnKey) => {
    const column = DEFAULT_COLUMNS.find(col => col.key === columnKey);
    if (column.required) return; // No permitir desmarcar columnas requeridas
    
    setFormData(prev => ({
      ...prev,
      columns: prev.columns.includes(columnKey)
        ? prev.columns.filter(key => key !== columnKey)
        : [...prev.columns, columnKey]
    }));
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.user.trim() || !formData.bodega.trim()) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }
    onComplete(formData);
  };
  
  return (
    <div className="onboarding-container">
      <div className="onboarding-card">
        <h1 style={{ textAlign: 'center', marginBottom: '24px' }}>
          🏢 Configuración Inicial
        </h1>
        <p style={{ textAlign: 'center', marginBottom: '32px', color: 'var(--color-text-secondary)' }}>
          Configura tu sistema de inventario antes de comenzar
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nombre del Bodeguero *</label>
            <input
              className="form-control"
              type="text"
              value={formData.user}
              onChange={(e) => setFormData(prev => ({ ...prev, user: e.target.value }))}
              placeholder="Ej: Juan Pérez"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Nombre de la Bodega *</label>
            <input
              className="form-control"
              type="text"
              value={formData.bodega}
              onChange={(e) => setFormData(prev => ({ ...prev, bodega: e.target.value }))}
              placeholder="Ej: Bodega Central"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Moneda</label>
            <select
              className="form-control"
              value={formData.currency}
              onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
            >
              {CURRENCIES.map(curr => (
                <option key={curr} value={curr}>{curr}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label className="form-label">Columnas Visibles en Inventario</label>
            <div className="column-selector">
              {DEFAULT_COLUMNS.map(column => (
                <div key={column.key} className="checkbox-item">
                  <input
                    type="checkbox"
                    id={column.key}
                    checked={formData.columns.includes(column.key)}
                    onChange={() => handleColumnToggle(column.key)}
                    disabled={column.required}
                  />
                  <label htmlFor={column.key} style={{ fontSize: '14px' }}>
                    {column.label} {column.required && '*'}
                  </label>
                </div>
              ))}
            </div>
          </div>
          
          <button type="submit" className="btn btn--primary btn--full-width btn--lg" style={{ marginTop: '24px' }}>
            🚀 Comenzar
          </button>
        </form>
      </div>
    </div>
  );
}

// Device Panel component
function DevicePanel({ device, connected, onConnect, onDisconnect, onDeviceChange, availableDevices }) {
  return (
    <div className="panel">
      <h3 style={{ marginBottom: '16px' }}>🔗 Estado del Dispositivo</h3>
      
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <div className={`device-indicator device-indicator--${connected ? 'connected' : 'disconnected'}`}></div>
          <strong>{device.name}</strong>
        </div>
        <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          ID: {device.id}
        </div>
        <RSSIIndicator rssi={device.rssi} connected={connected} />
        <div style={{ marginTop: '8px' }}>
          <span className={`status ${connected ? 'status--success' : 'status--error'}`}>
            {connected ? 'Conectado (simulado)' : 'Desconectado'}
          </span>
        </div>
      </div>
      
      <div style={{ marginBottom: '24px' }}>
        <button 
          className="btn btn--primary btn--sm btn--full-width"
          onClick={connected ? onDisconnect : onConnect}
          style={{ marginBottom: '8px' }}
        >
          {connected ? '🔌 Desconectar' : '🔌 Conectar'}
        </button>
      </div>
      
      <div>
        <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>📡 Dispositivos Disponibles</h4>
        {availableDevices.map(dev => (
          <div key={dev.id} style={{ marginBottom: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
              <input
                type="radio"
                name="device"
                value={dev.id}
                checked={device.id === dev.id}
                onChange={() => onDeviceChange(dev)}
                disabled={connected && dev.id !== device.id}
                style={{ marginRight: '8px' }}
              />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500' }}>{dev.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {dev.id} • RSSI: {dev.rssi} dBm
                </div>
              </div>
            </label>
          </div>
        ))}
        {connected && (
          <p style={{ fontSize: '12px', color: 'var(--color-warning)', marginTop: '8px' }}>
            💡 Desconecta primero para cambiar de dispositivo
          </p>
        )}
      </div>
    </div>
  );
}

// Simulate Panel component
function SimulatePanel({ connected, onProcessEvent, settings, simSinceReset, setSimSinceReset }) {
  const [activeTab, setActiveTab] = useState('json');
  const [jsonInput, setJsonInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const intervalRef = useRef(null);
  
  const [formData, setFormData] = useState({
    type: 'ingreso',
    barcode: '',
    name: '',
    quantity: 1,
    purchasePrice: '',
    salePrice: '',
    lot: '',
    expiry: '',
    category: '',
    operator: settings?.user || ''
  });
  
  useEffect(() => {
    if (continuousMode && connected) {
      intervalRef.current = setInterval(() => {
        handleSimulateScan();
      }, 3000);
    } else {
      clearInterval(intervalRef.current);
    }
    
    return () => clearInterval(intervalRef.current);
  }, [continuousMode, connected]);
  
  const examplePayload = {
    event: 'ingreso',
    source: 'brazalete_simulado',
    device_id: 'BRZ-001',
    timestamp: nowISO(),
    barcode: '7501031311306',
    sku: 'GALX-001',
    name: 'Galletas X',
    quantity: 12,
    purchase_price: 1.45,
    sale_price: 2.50,
    lot: 'L202510',
    expiry: '2026-03-01',
    category: 'Panadería',
    bodega: settings?.bodega || 'Bodega Central',
    operator: settings?.user || 'Juan'
  };
  
  const handleProcessJSON = () => {
    if (!connected) {
      alert('⚠️ Debes conectar un dispositivo primero');
      return;
    }
    
    try {
      const parsed = JSON.parse(jsonInput);
      onProcessEvent(parsed);
      setJsonInput('');
    } catch (error) {
      alert('❌ JSON inválido: ' + error.message);
    }
  };
  
  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!connected) {
      alert('⚠️ Debes conectar un dispositivo primero');
      return;
    }
    
    const payload = {
      event: formData.type,
      source: 'brazalete_simulado',
      device_id: 'BRZ-001',
      timestamp: nowISO(),
      barcode: formData.barcode,
      sku: formData.barcode || `SKU-${Date.now()}`,
      name: formData.name,
      quantity: parseFloat(formData.quantity) || 1,
      purchase_price: parseFloat(formData.purchasePrice) || 0,
      sale_price: parseFloat(formData.salePrice) || 0,
      lot: formData.lot,
      expiry: formData.expiry,
      category: formData.category,
      bodega: settings?.bodega || 'Bodega Central',
      operator: formData.operator
    };
    
    onProcessEvent(payload);
    
    // Reset form
    setFormData(prev => ({
      ...prev,
      barcode: '',
      name: '',
      quantity: 1,
      purchasePrice: '',
      salePrice: '',
      lot: '',
      expiry: '',
      category: ''
    }));
  };
  
  const handleSimulateScan = async () => {
    if (!connected) {
      alert('⚠️ Debes conectar un dispositivo primero');
      return;
    }
    
    setIsScanning(true);
    setScanCount(prev => prev + 1);
    
    // Simular delay de escaneo
    setTimeout(() => {
      const randomProduct = SAMPLE_PRODUCTS[Math.floor(Math.random() * SAMPLE_PRODUCTS.length)];
      // If we are within the first 10 simulations since reset, force ingreso with 75% purchase price
      let randomEvent;
      if (typeof simSinceReset === 'number' && simSinceReset < 10) {
        randomEvent = 'ingreso';
        setSimSinceReset(prev => prev + 1);
      } else {
        const eventTypes = ['ingreso', 'venta', 'devolucion'];
        randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      }
      
      const simulatedPayload = {
        event: randomEvent,
        source: 'brazalete_simulado',
        device_id: 'BRZ-001',
        timestamp: nowISO(),
        barcode: `750${Math.floor(Math.random() * 1000000000)}`,
        sku: randomProduct.sku,
        name: randomProduct.name,
        quantity: Math.floor(Math.random() * 20) + 1,
  sale_price: parseFloat((Math.random() * 15 + 2).toFixed(2)),
  purchase_price: 0,
        lot: `L${new Date().getFullYear()}${String(Math.floor(Math.random() * 99) + 1).padStart(2, '0')}`,
        expiry: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        category: randomProduct.category,
        bodega: settings?.bodega || 'Bodega Central',
        operator: settings?.user || 'Juan'
      };
      
      // If forced ingreso for seed, compute purchase as 75% of sale
      if (randomEvent === 'ingreso' && typeof simSinceReset === 'number' && simSinceReset <= 10) {
        simulatedPayload.sale_price = simulatedPayload.sale_price || parseFloat((Math.random() * 15 + 2).toFixed(2));
        simulatedPayload.purchase_price = parseFloat((simulatedPayload.sale_price * 0.75).toFixed(2));
      }

      onProcessEvent(simulatedPayload);
      setIsScanning(false);
    }, 1500);
  };
  
  return (
    <div className="panel">
      <h3 style={{ marginBottom: '16px' }}>⚡ Panel de Simulación</h3>
      
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'json' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          📄 JSON
        </button>
        <button 
          className={`tab ${activeTab === 'form' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          📝 Formulario
        </button>
        <button 
          className={`tab ${activeTab === 'auto' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('auto')}
        >
          🤖 Automático
        </button>
      </div>
      
      {activeTab === 'json' && (
        <div>
          <textarea
            className="form-control"
            rows={10}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={JSON.stringify(examplePayload, null, 2)}
            style={{ fontFamily: 'monospace', fontSize: '12px' }}
          />
          <button 
            className="btn btn--primary btn--full-width"
            onClick={handleProcessJSON}
            disabled={!connected || !jsonInput.trim()}
            style={{ marginTop: '8px' }}
          >
            📤 Procesar JSON
          </button>
        </div>
      )}
      
      {activeTab === 'form' && (
        <form onSubmit={handleFormSubmit}>
          <div className="form-group">
            <label className="form-label">Tipo de Evento</label>
            <select
              className="form-control"
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
            >
              <option value="ingreso">📦 Ingreso</option>
              <option value="venta">💰 Venta</option>
              <option value="devolucion">🔄 Devolución</option>
            </select>
          </div>
          
          <div className="form-group">
            <label className="form-label">Código de Barras/SKU</label>
            <input
              className="form-control"
              type="text"
              value={formData.barcode}
              onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
              placeholder="750103131..."
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Nombre del Producto</label>
            <input
              className="form-control"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ej: Galletas X"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Cantidad</label>
            <input
              className="form-control"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
            />
          </div>
          
          {(formData.type === 'ingreso' || formData.type === 'devolucion') && (
            <div className="form-group">
              <label className="form-label">Precio Compra</label>
              <input
                className="form-control"
                type="number"
                step="0.01"
                value={formData.purchasePrice}
                onChange={(e) => setFormData(prev => ({ ...prev, purchasePrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          )}
          
          {formData.type === 'venta' && (
            <div className="form-group">
              <label className="form-label">Precio Venta</label>
              <input
                className="form-control"
                type="number"
                step="0.01"
                value={formData.salePrice}
                onChange={(e) => setFormData(prev => ({ ...prev, salePrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
          )}
          
          <div className="form-group">
            <label className="form-label">Lote (Opcional)</label>
            <input
              className="form-control"
              type="text"
              value={formData.lot}
              onChange={(e) => setFormData(prev => ({ ...prev, lot: e.target.value }))}
              placeholder="L202510"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Fecha Caducidad (Opcional)</label>
            <input
              className="form-control"
              type="date"
              value={formData.expiry}
              onChange={(e) => setFormData(prev => ({ ...prev, expiry: e.target.value }))}
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Categoría (Opcional)</label>
            <input
              className="form-control"
              type="text"
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              placeholder="Panadería, Lácteos, etc."
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Operador</label>
            <input
              className="form-control"
              type="text"
              value={formData.operator}
              onChange={(e) => setFormData(prev => ({ ...prev, operator: e.target.value }))}
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn--primary btn--full-width"
            disabled={!connected}
          >
            📋 Registrar Evento
          </button>
        </form>
      )}
      
      {activeTab === 'auto' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            {isScanning && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '24px' }}>📡</div>
                <div>Escaneando...</div>
              </div>
            )}
          </div>
          
          <button 
            className="btn btn--primary btn--full-width btn--lg"
            onClick={handleSimulateScan}
            disabled={!connected || isScanning}
            style={{ marginBottom: '12px' }}
          >
            {isScanning ? '⏳ Escaneando...' : '🔍 Simular Scan'}
          </button>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={(e) => setContinuousMode(e.target.checked)}
                disabled={!connected}
                style={{ marginRight: '8px' }}
              />
              🔄 Modo Continuo (cada 3 segundos)
            </label>
          </div>
          
          <div className="stat-card">
            <div className="stat-value">{scanCount}</div>
            <div className="stat-label">Eventos Simulados</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Event Feed component
function EventFeed({ events, onUndoSale }) {
  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3>📡 Feed de Eventos</h3>
        <span className="status status--info">Últimos {events.length}</span>
      </div>
      
      <div className="event-feed">
        {events.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📡</div>
            <p>No hay eventos aún</p>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              Los eventos procesados aparecerán aquí en tiempo real
            </p>
          </div>
        ) : (
          events.map(event => (
            <div key={event.id} className="event-item">
              <div className="event-header">
                <span className={`event-type event-type--${event.type}`}>
                  {event.type === 'ingreso' ? '📦' : event.type === 'venta' ? '💰' : '🔄'} {event.type.toUpperCase()}
                </span>
                <span className="event-timestamp">
                  {formatDateTime(event.timestamp)}
                </span>
              </div>
              <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                <strong>{event.sku}</strong> - {event.name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                Cantidad: {event.quantity} • Operador: {event.operator} • Dispositivo: {event.device_id}
              </div>
              {event.type === 'venta' && (
                <button 
                  className="btn btn--sm btn--outline"
                  onClick={() => onUndoSale(event)}
                  style={{ marginTop: '8px', fontSize: '11px' }}
                >
                  ↩️ Deshacer venta
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Small form to add products quickly
function AddProductForm({ onAdd }) {
  const [form, setForm] = useState({ sku: '', name: '', category: '', quantity: 0, purchase_price: '', sale_price: '', lot: '', expiry: '' });

  const submit = (e) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) {
      alert('SKU y Nombre son requeridos');
      return;
    }
    // Validate prices: purchase should typically be <= sale
    const purchase = Number(form.purchase_price || 0);
    const sale = Number(form.sale_price || 0);
    if (purchase > 0 && sale > 0 && purchase >= sale) {
      const swap = confirm('El precio de compra es mayor que el precio de venta. ¿Deseas intercambiarlos (compra <-> venta)?');
      if (swap) {
        const swapped = { ...form, purchase_price: String(sale), sale_price: String(purchase) };
        if (onAdd) onAdd(swapped);
        setForm({ sku: '', name: '', category: '', quantity: 0, purchase_price: '', sale_price: '', lot: '', expiry: '' });
        return;
      } else {
        // proceed but warn
        alert('Error: El precio de compra debe ser menor que el precio de venta.'); return;
      }
    }
    if (onAdd) onAdd(form);
    setForm({ sku: '', name: '', category: '', quantity: 0, purchase_price: '', sale_price: '', lot: '', expiry: '' });
  };

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
      <input className="form-control" placeholder="SKU" value={form.sku} onChange={(e) => setForm(prev => ({ ...prev, sku: e.target.value }))} style={{ width: '120px' }} />
      <input className="form-control" placeholder="Nombre" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} style={{ width: '180px' }} />
      <input className="form-control" placeholder="Categoría" value={form.category} onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))} style={{ width: '140px' }} />
      <input className="form-control" type="number" min="0" placeholder="Cantidad" value={form.quantity} onChange={(e) => setForm(prev => ({ ...prev, quantity: e.target.value }))} style={{ width: '100px' }} />
      <input className="form-control" type="number" step="0.01" placeholder="Precio compra" value={form.purchase_price} onChange={(e) => setForm(prev => ({ ...prev, purchase_price: e.target.value }))} style={{ width: '120px' }} />
      <input className="form-control" type="number" step="0.01" placeholder="Precio venta" value={form.sale_price} onChange={(e) => setForm(prev => ({ ...prev, sale_price: e.target.value }))} style={{ width: '120px' }} />
      <button className="btn btn--primary btn--sm" type="submit">Agregar</button>
    </form>
  );
}

// Inventory Table component
function InventoryTable({ batches, products, settings, onRefresh, onExport, onDailyReport, onAddProduct }){
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('batches'); // 'batches' or 'products'
  const [sortField, setSortField] = useState('sku');
  const [sortDir, setSortDir] = useState('asc');
  
  const visibleColumns = DEFAULT_COLUMNS.filter(col => 
    settings?.columns?.includes(col.key) || col.required
  );
  
  // Filter batches
  const filteredBatches = batches.filter(batch => {
    if (!searchTerm) return true;
    const product = products.find(p => p.sku === batch.product_sku) || {};
    const searchLower = searchTerm.toLowerCase();
    return (
      batch.product_sku.toLowerCase().includes(searchLower) ||
      (product.name || '').toLowerCase().includes(searchLower) ||
      (batch.lot || '').toLowerCase().includes(searchLower)
    );
  });
  
  // Sort batches
  const sortedBatches = [...filteredBatches].sort((a, b) => {
    const productA = products.find(p => p.sku === a.product_sku) || {};
    const productB = products.find(p => p.sku === b.product_sku) || {};
    
    let valA, valB;
    
    switch (sortField) {
      case 'sku':
        valA = a.product_sku;
        valB = b.product_sku;
        break;
      case 'name':
        valA = productA.name || '';
        valB = productB.name || '';
        break;
      case 'quantity':
        valA = a.quantity || 0;
        valB = b.quantity || 0;
        break;
      case 'expiry':
        valA = a.expiry || '9999-12-31';
        valB = b.expiry || '9999-12-31';
        break;
      default:
        valA = a[sortField] || '';
        valB = b[sortField] || '';
    }
    
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortDir === 'asc' ? valA - valB : valB - valA;
    }
    
    const comparison = String(valA).localeCompare(String(valB));
    return sortDir === 'asc' ? comparison : -comparison;
  });
  
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };
  
  const totalItems = batches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
  const totalValue = batches.reduce((sum, batch) => 
    sum + ((batch.quantity || 0) * (batch.purchase_price || 0)), 0
  );
  // Calculate potential profit: (sale_price - purchase_price) * quantity
  const totalProfit = batches.reduce((sum, batch) => {
    const product = products.find(p => p.sku === batch.product_sku) || {};
    const sale = Number(product.default_sale_price || 0);
    const purchase = Number(batch.purchase_price || 0);
    const qty = Number(batch.quantity || 0);
    const profitPerUnit = sale - purchase;
    return sum + (profitPerUnit * qty);
  }, 0);
  
  return (
    <div>
      {/* Add product quick form */}
      <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--color-bg-1)', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 8px 0' }}>➕ Agregar producto rápido</h4>
        <AddProductForm onAdd={onAddProduct} />
      </div>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{products.length}</div>
          <div className="stat-label">Productos</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{batches.filter(b => b.quantity > 0).length}</div>
          <div className="stat-label">Lotes Activos</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalItems.toLocaleString()}</div>
          <div className="stat-label">Total Items</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{settings?.currency || 'S/'}{totalValue.toFixed(2)}</div>
          <div className="stat-label">Valor Inventario</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{settings?.currency || 'S/'}{totalProfit.toFixed(2)}</div>
          <div className="stat-label">Ganancia Potencial</div>
        </div>
      </div>
      
      {/* Toolbar */}
      <div className="toolbar">
        <input
          className="form-control search-input"
          type="text"
          placeholder="🔍 Buscar por SKU, nombre o lote..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '260px', padding: '8px', fontSize: '14px' }}
        />
        
        <select
          className="form-control"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
        >
          <option value="batches">📋 Por Lotes</option>
          <option value="products">📊 Por Productos</option>
        </select>
        
        <button className="btn btn--outline btn--sm" onClick={onRefresh}>
          🔄 Refrescar
        </button>
        <button className="btn btn--secondary btn--sm" onClick={onExport}>
          📊 Exportar XLSX
        </button>
        <button className="btn btn--primary btn--sm" onClick={onDailyReport}>
          📈 Reporte Diario
        </button>
      </div>
      
      {/* Table */}
      <div className="table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              {visibleColumns.map(column => (
                <th 
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  {column.label}
                  {sortField === column.key && (
                    <span style={{ marginLeft: '4px' }}>
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
              <th>Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {sortedBatches.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} style={{ textAlign: 'center', padding: '32px' }}>
                  <div className="empty-state">
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                    <p>No hay inventario disponible</p>
                    <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                      {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Agrega productos usando el panel de simulación'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedBatches.map(batch => {
                const product = products.find(p => p.sku === batch.product_sku) || {};
                const isZeroStock = (Number(batch.quantity) || 0) === 0;
                const isExpiring = isExpiringSoon(batch.expiry);

                // Build cells in the same order as visibleColumns to keep headers aligned
                const cells = visibleColumns.map(col => {
                  switch (col.key) {
                    case 'sku':
                      return (
                        <td key={`sku-${batch.id}`}><strong>{batch.product_sku || '-'}</strong></td>
                      );
                    case 'name':
                      return (
                        <td key={`name-${batch.id}`}>{product.name || '-'}</td>
                      );
                    case 'category':
                      return (
                        <td key={`category-${batch.id}`}>{product.category || '-'}</td>
                      );
                    case 'lot':
                      return (
                        <td key={`lot-${batch.id}`}>{batch.lot || '-'}</td>
                      );
                    case 'expiry':
                      return (
                        <td key={`expiry-${batch.id}`} className={isExpiring ? 'expiry-warning' : ''}>
                          {formatDate(batch.expiry)}{isExpiring && ' ⚠️'}
                        </td>
                      );
                    case 'quantity':
                      return (
                        <td key={`quantity-${batch.id}`}><strong>{Number(batch.quantity || 0).toLocaleString()}</strong></td>
                      );
                    case 'purchase_price':
                      return (
                        <td key={`purchase_price-${batch.id}`}>{settings?.currency || 'S/'}{Number(batch.purchase_price || 0).toFixed(2)}</td>
                      );
                    case 'sale_price':
                      return (
                        <td key={`sale_price-${batch.id}`}>{settings?.currency || 'S/'}{Number(product.default_sale_price || 0).toFixed(2)}</td>
                      );
                    default:
                      return (<td key={`${col.key}-${batch.id}`}>-</td>);
                  }
                });

                const rowTotal = (Number(batch.quantity || 0) * Number(batch.purchase_price || 0));

                return (
                  <tr key={batch.id} className={isZeroStock ? 'inventory-table--zero-stock' : ''}>
                    {cells}
                    <td>
                      <strong>
                        {settings?.currency || 'S/'}{rowTotal.toFixed(2)}
                      </strong>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {/* Summary */}
      {sortedBatches.length > 0 && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'var(--color-bg-1)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span>
              <strong>Total mostrado:</strong> {sortedBatches.length} lotes
            </span>
            <span>
              <strong>Valor total:</strong> {settings?.currency || 'S/'}
              {sortedBatches.reduce((sum, batch) => 
                sum + ((batch.quantity || 0) * (batch.purchase_price || 0)), 0
              ).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Main App component
function App() {
  const [db, setDb] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  
  // Device state
  const [selectedDevice, setSelectedDevice] = useState(SIMULATED_DEVICES[0]);
  const [connected, setConnected] = useState(false);
  const [simSinceReset, setSimSinceReset] = useState(0);
  
  // Data state
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [events, setEvents] = useState([]);
  
  // UI state
  const [toasts, setToasts] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  
  useEffect(() => {
    initDB().then(async (database) => {
      setDb(database);
      
      // Load settings
      try {
        const savedSettings = await database.get('settings', 'onboarding');
        if (savedSettings) {
          setSettings(savedSettings.value);
        }
      } catch (error) {
        console.log('No saved settings found');
      }
      
      // Load data
      await refreshData(database);
    });
  }, []);
  
  const refreshData = async (database = db) => {
    if (!database) return;
    
    try {
      const [productsData, batchesData, movementsData] = await Promise.all([
        database.getAll('products'),
        database.getAll('batches'),
        database.getAll('movements')
      ]);
      
      setProducts(productsData);
      setBatches(batchesData);
      setMovements(movementsData);
    } catch (error) {
      console.error('Error loading data:', error);
      addToast('error', 'Error', 'No se pudieron cargar los datos');
    }
  };

  // Reset database (delete IndexedDB) with confirmation
  const resetDatabase = async () => {
    if (!confirm('¿Estás seguro? Esto eliminará toda la base de datos local y no se podrá deshacer.')) return;

    try {
      if (db) {
        try { db.close(); } catch (e) { /* ignore */ }
      }

      const req = window.indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => {
        setDb(null);
        setProducts([]);
        setBatches([]);
        setMovements([]);
        setEvents([]);
        setSettings(null);
        setSimSinceReset(0);
        addToast('success', 'BD reiniciada', 'La base de datos local fue eliminada. Ahora las primeras 10 simulaciones serán ingresos.');
      };
      req.onerror = () => {
        addToast('error', 'Error', 'No se pudo eliminar la base de datos');
      };
      req.onblocked = () => {
        addToast('warning', 'Bloqueado', 'Cierra otras pestañas que usen la aplicación e inténtalo de nuevo');
      };
    } catch (error) {
      console.error('Reset DB error:', error);
      addToast('error', 'Error', 'No se pudo reiniciar la base de datos: ' + error.message);
    }
  };

  // Add product + initial batch (used by InventoryTable)
  const handleAddProduct = async (productPayload) => {
    if (!db) {
      addToast('error', 'BD no lista', 'Espera a que la base de datos se inicialice');
      return;
    }

    try {
      const tx = db.transaction(['products', 'batches'], 'readwrite');

      // Enforce sale_price > purchase_price with minimal margen (1%)
      const purchase = Number(productPayload.purchase_price) || 0;
      const sale = Number(productPayload.sale_price) || 0;
      if (sale <= purchase) {
        addToast('error', 'Precio inválido', 'El precio de venta debe ser mayor que el precio de compra');
        return;
      }

      await tx.objectStore('products').put({
        sku: productPayload.sku,
        name: productPayload.name,
        category: productPayload.category || 'Sin categoría',
        default_purchase_price: Number(productPayload.purchase_price) || 0,
        default_sale_price: Number(productPayload.sale_price) || 0,
        created_at: nowISO()
      });

      await tx.objectStore('batches').add({
        product_sku: productPayload.sku,
        lot: productPayload.lot || `INIT-${Date.now()}`,
        expiry: productPayload.expiry || null,
        quantity: Number(productPayload.quantity) || 0,
        purchase_price: Number(productPayload.purchase_price) || 0,
        created_at: nowISO()
      });

      await tx.done;
      addToast('success', 'Producto agregado', `Producto ${productPayload.name} creado correctamente`);
      await refreshData();
    } catch (error) {
      console.error('Add product error:', error);
      addToast('error', 'Error', 'No se pudo agregar el producto: ' + error.message);
    }
  };
  
  const addToast = (type, title, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
  };
  
  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };
  
  const handleOnboardingComplete = async (formData) => {
    if (!db) return;
    
    try {
      await db.put('settings', {
        key: 'onboarding',
        value: formData
      });
      setSettings(formData);
      addToast('success', '¡Bienvenido!', 'Configuración guardada correctamente');
    } catch (error) {
      console.error('Error saving settings:', error);
      addToast('error', 'Error', 'No se pudo guardar la configuración');
    }
  };
  
  const handleConnect = () => {
    setConnected(true);
    addToast('success', 'Conectado', `Brazalete ${selectedDevice.id} conectado (simulado)`);
    setEvents(prev => [{
      id: Date.now(),
      type: 'system',
      sku: 'SYSTEM',
      name: 'Conexión establecida',
      quantity: 0,
      timestamp: nowISO(),
      device_id: selectedDevice.id,
      operator: 'system'
    }, ...prev.slice(0, 19)]);
  };
  
  const handleDisconnect = () => {
    setConnected(false);
    addToast('warning', 'Desconectado', `Brazalete ${selectedDevice.id} desconectado`);
    setEvents(prev => [{
      id: Date.now(),
      type: 'system',
      sku: 'SYSTEM',
      name: 'Conexión cerrada',
      quantity: 0,
      timestamp: nowISO(),
      device_id: selectedDevice.id,
      operator: 'system'
    }, ...prev.slice(0, 19)]);
  };
  
  const handleDeviceChange = (device) => {
    if (connected) {
      addToast('warning', 'Dispositivo ocupado', 'Desconecta primero para cambiar de dispositivo');
      return;
    }
    setSelectedDevice(device);
    addToast('info', 'Dispositivo seleccionado', `${device.name} seleccionado`);
  };
  
  const handleProcessEvent = async (payload) => {
    if (!db || !connected) return;
    
    try {
      const tx = db.transaction(['products', 'batches', 'movements'], 'readwrite');
      
      // Create movement record
      const movement = {
        type: payload.event,
        sku: payload.sku || payload.barcode,
        name: payload.name || 'Producto sin nombre',
        quantity: payload.quantity || 1,
        price: payload.purchase_price || payload.sale_price || 0,
        lot: payload.lot || '',
        expiry: payload.expiry || null,
        timestamp: payload.timestamp || nowISO(),
        device_id: payload.device_id || selectedDevice.id,
        operator: payload.operator || settings?.user || 'Operador',
        bodega: payload.bodega || settings?.bodega || 'Bodega'
      };
      
      await tx.objectStore('movements').add(movement);
      
  if (payload.event === 'ingreso') {
        // Create or update product
        const productStore = tx.objectStore('products');
        const existingProduct = await productStore.get(movement.sku);
        
        if (!existingProduct) {
          await productStore.put({
            sku: movement.sku,
            name: movement.name,
            category: payload.category || 'Sin categoría',
            default_purchase_price: movement.price,
            default_sale_price: payload.sale_price || movement.price * 1.5,
            created_at: nowISO()
          });
        }
        
        // Create batch
        await tx.objectStore('batches').add({
          product_sku: movement.sku,
          lot: movement.lot || `AUTO-${Date.now()}`,
          expiry: movement.expiry,
          quantity: movement.quantity,
          purchase_price: movement.price,
          created_at: nowISO()
        });
        
        addToast('success', 'Ingreso procesado', 
          `${movement.quantity} unidades de ${movement.name} agregadas`);
        
      } else if (payload.event === 'venta') {
        // Check total stock for this SKU before processing
        const batchStore = tx.objectStore('batches');
        const allBatches = await batchStore.getAll();
        const totalStock = allBatches.filter(b => b.product_sku === movement.sku).reduce((s, b) => s + (b.quantity || 0), 0);
        if (movement.quantity > totalStock) {
          addToast('error', 'Venta denegada', `Stock insuficiente: intento vender ${movement.quantity} pero solo hay ${totalStock}`);
          await tx.done; // rollback
          return;
        }
  // Implement FIFO (PEPS)
  // re-use batchStore and allBatches declared above
        // Filter and sort batches for this product by creation date
        const productBatches = allBatches
          .filter(batch => batch.product_sku === movement.sku && batch.quantity > 0)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        let remaining = movement.quantity;
        
        for (const batch of productBatches) {
          if (remaining <= 0) break;
          
          const take = Math.min(batch.quantity, remaining);
          batch.quantity -= take;
          remaining -= take;
          
          await batchStore.put(batch);
        }
        
        if (remaining > 0) {
          addToast('warning', 'Stock insuficiente', 
            `Faltaron ${remaining} unidades. Venta procesada parcialmente.`);
        } else {
          addToast('success', 'Venta procesada', 
            `${movement.quantity} unidades de ${movement.name} vendidas`);
        }
        
      } else if (payload.event === 'devolucion') {
        // Ensure that total returns do not exceed total sold for this SKU
        const movStoreAll = await tx.objectStore('movements').getAll();
        const sold = movStoreAll.filter(m => m.sku === movement.sku && m.type === 'venta').reduce((s, m) => s + (m.quantity || 0), 0);
        const returned = movStoreAll.filter(m => m.sku === movement.sku && m.type === 'devolucion').reduce((s, m) => s + (m.quantity || 0), 0);
        if ((returned + movement.quantity) > sold) {
          addToast('error', 'Devolución denegada', `No hay suficientes ventas previas para devolver ${movement.quantity} unidades`);
          await tx.done;
          return;
        }

        // Create new batch for return
        await tx.objectStore('batches').add({
          product_sku: movement.sku,
          lot: movement.lot || `DEV-${Date.now()}`,
          expiry: movement.expiry,
          quantity: movement.quantity,
          purchase_price: movement.price,
          created_at: nowISO()
        });

        addToast('info', 'Devolución procesada', 
          `${movement.quantity} unidades de ${movement.name} devueltas`);
      }
      
      await tx.done;
      
      // Update events feed
      setEvents(prev => [{
        id: Date.now(),
        ...movement
      }, ...prev.slice(0, 19)]);
      
      // Refresh data
      await refreshData();
      
    } catch (error) {
      console.error('Error processing event:', error);
      addToast('error', 'Error', 'No se pudo procesar el evento: ' + error.message);
    }
  };
  
  const handleUndoSale = async (saleEvent) => {
    if (!db) return;
    
    const returnPayload = {
      event: 'devolucion',
      sku: saleEvent.sku,
      name: saleEvent.name,
      quantity: saleEvent.quantity,
      purchase_price: 0, // Unknown original purchase price
      lot: `UNDO-${Date.now()}`,
      timestamp: nowISO(),
      device_id: saleEvent.device_id,
      operator: `${settings?.user || 'Usuario'} (deshacer venta)`
    };
    
    await handleProcessEvent(returnPayload);
    addToast('info', 'Venta deshecha', `Devolución creada para ${saleEvent.quantity} unidades`);
  };
  
  const handleExportInventory = async () => {
    setIsExporting(true);
    
    try {
      const workbook = new ExcelJS.Workbook();
      
      // Inventory by batches sheet
      const batchesSheet = workbook.addWorksheet('Inventario por Lotes');
      batchesSheet.addRow(['SKU', 'Nombre', 'Categoría', 'Lote', 'Fecha Caducidad', 'Stock', 'Precio Compra', 'Precio Venta', 'Valor Total']);
      
      batches.forEach(batch => {
        if (batch.quantity > 0) {
          const product = products.find(p => p.sku === batch.product_sku) || {};
          const valueTotal = (batch.quantity || 0) * (batch.purchase_price || 0);
          
          batchesSheet.addRow([
            batch.product_sku,
            product.name || '',
            product.category || '',
            batch.lot || '',
            batch.expiry ? formatDate(batch.expiry) : '',
            batch.quantity || 0,
            batch.purchase_price || 0,
            product.default_sale_price || 0,
            valueTotal
          ]);
        }
      });
      
      // Products summary sheet
      const productsSheet = workbook.addWorksheet('Resumen por Producto');
      productsSheet.addRow(['SKU', 'Nombre', 'Stock Total', 'Valor Total']);
      
      const productSummary = {};
      batches.forEach(batch => {
        if (batch.quantity > 0) {
          if (!productSummary[batch.product_sku]) {
            const product = products.find(p => p.sku === batch.product_sku) || {};
            productSummary[batch.product_sku] = {
              name: product.name || '',
              totalStock: 0,
              totalValue: 0
            };
          }
          
          productSummary[batch.product_sku].totalStock += batch.quantity || 0;
          productSummary[batch.product_sku].totalValue += (batch.quantity || 0) * (batch.purchase_price || 0);
        }
      });
      
      Object.entries(productSummary).forEach(([sku, summary]) => {
        productsSheet.addRow([sku, summary.name, summary.totalStock, summary.totalValue]);
      });
      
      const buffer = await workbook.xlsx.writeBuffer();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      saveAs(new Blob([buffer]), `inventario_actual_${timestamp}.xlsx`);
      
      addToast('success', 'Exportación completa', 'Archivo XLSX descargado exitosamente');
      
    } catch (error) {
      console.error('Export error:', error);
      addToast('error', 'Error de exportación', 'No se pudo generar el archivo XLSX');
    }
    
    setIsExporting(false);
  };
  
  const handleDailyReport = async () => {
    setIsExporting(true);
    
    try {
      // Generate inventory report
      await handleExportInventory();
      
      // Generate movements report
      const workbook = new ExcelJS.Workbook();
      const movementsSheet = workbook.addWorksheet('Movimientos del Día');
      
      movementsSheet.addRow(['Timestamp', 'Tipo', 'SKU', 'Nombre', 'Cantidad', 'Precio', 'Lote', 'Operador', 'Dispositivo']);
      
      // Filter today's movements
      const today = new Date().toISOString().split('T')[0];
      const todayMovements = movements.filter(mov => mov.timestamp.startsWith(today));
      
      todayMovements
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .forEach(mov => {
          movementsSheet.addRow([
            formatDateTime(mov.timestamp),
            mov.type,
            mov.sku,
            mov.name,
            mov.quantity,
            mov.price,
            mov.lot || '',
            mov.operator,
            mov.device_id
          ]);
        });
      
      const buffer = await workbook.xlsx.writeBuffer();
      const timestamp = today.replace(/-/g, '');
      saveAs(new Blob([buffer]), `historial_movimientos_${timestamp}.xlsx`);
      
      // Update last report timestamp
      if (db) {
        await db.put('settings', {
          key: 'lastReport',
          value: { timestamp: nowISO() }
        });
      }
      
      addToast('success', 'Reporte diario generado', '2 archivos XLSX descargados exitosamente');
      
    } catch (error) {
      console.error('Daily report error:', error);
      addToast('error', 'Error en reporte', 'No se pudo generar el reporte diario');
    }
    
    setIsExporting(false);
  };
  
  // Show onboarding if no settings
  if (!settings) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }
  
  return (
    <div className="app-container">
      <Toast toasts={toasts} removeToast={removeToast} />
      
      {/* Header */}
      <div style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '20px', margin: '0' }}>🏢 {settings.bodega}</h1>
            <p style={{ margin: '0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              Bodeguero: {settings.user} • Moneda: {settings.currency}
            </p>
          </div>
          <div>
            <button 
              className="btn btn--outline btn--sm"
              onClick={() => {
                if (confirm('¿Deseas reconfigurar la aplicación? Se perderán los datos actuales.')) {
                  setSettings(null);
                }
              }}
            >
              ⚙️ Reconfigurar
            </button>
            <button
              className="btn btn--outline btn--sm"
              onClick={resetDatabase}
              style={{ marginLeft: '8px' }}
            >
              🧹 Reset BD
            </button>
          </div>
        </div>
      </div>
      
      {/* Main Navigation */}
      <div className="main-tabs">
        <button 
          className={`main-tab ${activeView === 'dashboard' ? 'main-tab--active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          🏠 Panel Principal
        </button>
        <button 
          className={`main-tab ${activeView === 'inventory' ? 'main-tab--active' : ''}`}
          onClick={() => setActiveView('inventory')}
        >
          📦 Inventario
        </button>
      </div>
      
      {/* Main Content */}
      <div style={{ padding: '16px' }}>
        {activeView === 'dashboard' && (
          <div className="main-layout">
            {/* Left Panel - Device Control */}
            <DevicePanel
              device={selectedDevice}
              connected={connected}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onDeviceChange={handleDeviceChange}
              availableDevices={SIMULATED_DEVICES}
            />
            
            {/* Center Panel - Simulation */}
            <SimulatePanel
              connected={connected}
              onProcessEvent={handleProcessEvent}
              settings={settings}
              simSinceReset={simSinceReset}
              setSimSinceReset={setSimSinceReset}
            />
            
            {/* Right Panel - Event Feed */}
            <EventFeed
              events={events}
              onUndoSale={handleUndoSale}
            />
          </div>
        )}
        
        {activeView === 'inventory' && (
          <InventoryTable
            batches={batches}
            products={products}
            settings={settings}
            onRefresh={() => refreshData()}
            onExport={handleExportInventory}
            onDailyReport={handleDailyReport}
            onAddProduct={handleAddProduct}
          />
        )}
      </div>
      
      {/* Export Progress */}
      {isExporting && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '16px',
          minWidth: '300px',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <div style={{ marginBottom: '8px' }}>📊 Generando archivo XLSX...</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '100%' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;