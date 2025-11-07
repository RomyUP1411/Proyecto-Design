import React, {useEffect, useState, useRef} from "react";
import { openDB } from 'idb';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';

// Basic constants used across the app
const DB_NAME = 'inventario_bodega_db_v1';

const CURRENCIES = ['S/', '$'];

const DEFAULT_COLUMNS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'name', label: 'Nombre', required: true },
  { key: 'category', label: 'Categoría', required: false },
  { key: 'lot', label: 'Lote', required: false },
  { key: 'expiry', label: 'Caducidad', required: false },
  { key: 'quantity', label: 'Cantidad', required: true },
  { key: 'purchase_price', label: 'Precio Compra', required: false },
  { key: 'sale_price', label: 'Precio Venta', required: false }
];

const SIMULATED_DEVICES = [
  { id: 'PUL-001', name: 'Pulsera-001', rssi: -50, operator: '' },
  { id: 'PUL-002', name: 'Pulsera-002', rssi: -60, operator: '' },
  { id: 'PUL-003', name: 'Pulsera-003', rssi: -70, operator: '' }
];

const SAMPLE_PRODUCTS = [
  { sku: 'GALX-001', name: 'Galletas X', category: 'Panadería' },
  { sku: 'LECH-001', name: 'Leche Entera', category: 'Lácteos' },
  { sku: 'PAN-001', name: 'Pan Bimbo', category: 'Panadería' }
];

// Helpers
const nowISO = () => new Date().toISOString();
const formatDate = (d) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString(); } catch(e){return d;} };
const formatDateTime = (d) => { if (!d) return '-'; try { return new Date(d).toLocaleString(); } catch(e){return d;} };

function checkExpiry(dateStr) {
  if (!dateStr) return 'normal';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d - now) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'expired';
  if (diff <= 15) return 'expiring-soon';
  return 'normal';
}

// Minimal RSSI indicator
function RSSIIndicator({ rssi, connected }){
  const color = connected ? 'var(--color-success)' : 'var(--color-text-secondary)';
  return (
    <div style={{ fontSize: '12px', color }}>{connected ? `RSSI: ${rssi} dBm` : `RSSI: ${rssi} dBm`}</div>
  );
}

// Initialize IndexedDB (simple wrapper)
async function initDB(){
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'sku' });
      if (!db.objectStoreNames.contains('batches')) db.createObjectStore('batches', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('movements')) db.createObjectStore('movements', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    }
  });
  return db;
}

// Simple Toast component
function Toast({ toasts, removeToast }){
  useEffect(() => {
    toasts.forEach(toast => {
      if (toast.autoHide !== false) {
        const t = setTimeout(() => removeToast(toast.id), 3000);
        return () => clearTimeout(t);
      }
      return undefined;
    });
  }, [toasts]);

  return (
    <div className="toast-container" style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999 }}>
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast--${toast.type}`} style={{ background: 'var(--color-surface)', padding: 12, marginBottom: 8, border: '1px solid var(--color-border)', borderRadius: 8, position: 'relative' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{toast.title}</div>
          <div style={{ fontSize: 13 }}>{toast.message}</div>
          <button onClick={() => removeToast(toast.id)} style={{ position: 'absolute', top: 6, right: 8, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      ))}
    </div>
  );
}

// Minimal Onboarding component (collect bodega, currency, operators and columns)
function Onboarding({ onComplete }){
  const [formData, setFormData] = useState({ bodega: '', currency: CURRENCIES[0], columns: DEFAULT_COLUMNS.map(c => c.key), operators: ['', '', ''] });

  const handleColumnToggle = (key) => {
    setFormData(prev => ({ ...prev, columns: prev.columns.includes(key) ? prev.columns.filter(k=>k!==key) : [...prev.columns, key] }));
  };

  const submit = (e) => {
    e.preventDefault();
    // Allow proceeding even if bodega is empty: use a sensible default
    const payload = { ...formData };
    if (!String(payload.bodega || '').trim()) payload.bodega = 'Bodega Principal';
    if (onComplete) onComplete(payload);
  };

  return (
    <div className="onboarding-container" style={{ padding: 24 }}>
      <div className="onboarding-card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2>Configuración Inicial</h2>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Nombre de la bodega</label>
            <input className="form-control" value={formData.bodega} onChange={(e)=>setFormData(prev=>({ ...prev, bodega: e.target.value }))} />
          </div>

          <div className="form-group">
            <label>Moneda</label>
            <select className="form-control" value={formData.currency} onChange={(e)=>setFormData(prev=>({ ...prev, currency: e.target.value }))}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Operadores (hasta 3)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {formData.operators.map((op, i) => (
                <input key={i} className="form-control" value={op} onChange={(e)=>{ const ops = [...formData.operators]; ops[i]=e.target.value; setFormData(prev=>({...prev, operators: ops})); }} placeholder={`Operador ${i+1}`} />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Columnas visibles</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DEFAULT_COLUMNS.map(col => (
                <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={formData.columns.includes(col.key)} onChange={() => handleColumnToggle(col.key)} /> {col.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn--primary" type="submit">🚀 Comenzar</button>
            <button type="button" className="btn btn--outline" onClick={() => {
              // Quick start: use defaults and continue
              const quick = { ...formData };
              if (!String(quick.bodega || '').trim()) quick.bodega = 'Bodega Principal';
              if (onComplete) onComplete(quick);
            }}>⚡ Comenzar rápido</button>
          </div>
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
        <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
          ID: {device.id}
        </div>
        {device?.operator ? (
          <div style={{ fontSize: '14px', color: 'var(--color-success)', marginBottom: '8px' }}>
            👤 {device.operator}
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--color-warning)', marginBottom: '8px' }}>
            ⚠️ Sin operador asignado
          </div>
        )}
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
          disabled={!connected && !device?.operator}
          title={!connected && !device?.operator ? 'Asigna un operador a esta pulsera antes de conectar' : ''}
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
function SimulatePanel({ connected, onProcessEvent, settings, simSinceReset, setSimSinceReset, device }) {
  const [activeTab, setActiveTab] = useState('form');
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
    operator: device?.operator || settings?.user || ''
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
    device_id: device?.id || 'BRZ-001',
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
    operator: device?.operator || settings?.user || 'Juan'
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

    const purchase = parseFloat(formData.purchasePrice) || 0;
    const sale = parseFloat(formData.salePrice) || 0;

    if (purchase <= 0) {
      alert('El precio de compra debe ser mayor a 0');
      return;
    }

    if (formData.type !== 'devolucion' && sale <= purchase) {
      alert('El precio de venta debe ser mayor al precio de compra');
      return;
    }
    
    const payload = {
      event: formData.type,
      source: 'brazalete_simulado',
      device_id: device?.id || 'BRZ-001',
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
      operator: formData.operator || device?.operator || settings?.user
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
        device_id: device?.id || 'BRZ-001',
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
        operator: device?.operator || settings?.user || 'Juan'
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
          className={`tab ${activeTab === 'form' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          📝 Registro Manual
        </button>
        <button 
          className={`tab ${activeTab === 'auto' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('auto')}
        >
          🤖 Simulación Automática
        </button>
      </div>
      
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
function InventoryTable({ batches, products, movements, settings, onRefresh, onExport, onDailyReport, onAddProduct, onReturn }){
  const [searchTerm, setSearchTerm] = useState('');
  // sectionMode controla la sección principal: 'ventas' o 'inventario'
  const [sectionMode, setSectionMode] = useState('ventas'); // 'ventas' or 'inventario'
  // viewMode controla la forma de ver el inventario: 'batches' (por lotes) o 'products' (por producto)
  const [viewMode, setViewMode] = useState('batches');
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

  // If user selected 'products' view, aggregate batches per product to show one row per product
  const perProductRows = (() => {
    const map = {};
    filteredBatches.forEach(b => {
      if (!map[b.product_sku]) {
        map[b.product_sku] = {
          product_sku: b.product_sku,
          quantity: 0,
          totalValue: 0,
          avgPurchase: 0,
          expiry: null
        };
      }
      map[b.product_sku].quantity += Number(b.quantity || 0);
      map[b.product_sku].totalValue += (Number(b.quantity || 0) * Number(b.purchase_price || 0));
      if (!map[b.product_sku].expiry && b.expiry) map[b.product_sku].expiry = b.expiry;
    });
    return Object.values(map).map(item => ({
      product_sku: item.product_sku,
      quantity: item.quantity,
      purchase_price: item.quantity ? (item.totalValue / item.quantity) : 0,
      expiry: item.expiry
    }));
  })();
  
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
      {/* Stats: mostrar producto más/menos vendido usando movimientos (ventas - devoluciones) */}
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
          <div className="stat-value">{settings?.currency || 'S/'}{totalProfit.toFixed(2)}</div>
          <div className="stat-label">Ganancia potencial</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{settings?.currency || 'S/'}{totalValue.toFixed(2)}</div>
          <div className="stat-label">Valor Inventario</div>
        </div>
        {/* Producto más/menos vendido */}
        {movements && (
          (() => {
            const netSales = {};
            movements.forEach(m => {
              if (!m.sku) return;
              if (!netSales[m.sku]) netSales[m.sku] = 0;
              if (m.type === 'venta') netSales[m.sku] += (m.quantity || 0);
              if (m.type === 'devolucion') netSales[m.sku] -= (m.quantity || 0);
            });

            const entries = Object.entries(netSales);
            let most = null;
            let least = null;
            if (entries.length > 0) {
              entries.sort((a, b) => b[1] - a[1]);
              most = entries[0];
              least = entries[entries.length - 1];
            }

            return (
              <>
                <div className="stat-card">
                  <div className="stat-value">{most ? `${products.find(p=>p.sku===most[0])?.name || most[0]} (${most[1]})` : '-'}</div>
                  <div className="stat-label">Producto más vendido</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{least ? `${products.find(p=>p.sku===least[0])?.name || least[0]} (${least[1]})` : '-'}</div>
                  <div className="stat-label">Producto menos vendido</div>
                </div>
              </>
            );
          })()
        )}
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
      
      {/* Leyenda de colores */}
      <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--color-bg-1)', borderRadius: '8px' }}>
        <h4 style={{ marginBottom: '8px' }}>Leyenda de Estados:</h4>
        <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
          <div>⚫ Normal: Producto activo</div>
          <div style={{ color: '#ffd700' }}>🟡 Por vencerse (15 días)</div>
          <div style={{ color: 'red' }}>🔴 Vencido</div>
          <div style={{ opacity: 0.5 }}>⚪ Devuelto</div>
        </div>
      </div>

      {/* Vista switcher */}
      <div style={{ marginBottom: '16px' }}>
        <button 
          className={`btn ${sectionMode === 'ventas' ? 'btn--primary' : 'btn--outline'}`}
          onClick={() => setSectionMode('ventas')}
          style={{ marginRight: '8px' }}
        >
          💰 Ventas
        </button>
        <button 
          className={`btn ${sectionMode === 'inventario' ? 'btn--primary' : 'btn--outline'}`}
          onClick={() => setSectionMode('inventario')}
        >
          📦 Inventario
        </button>
      </div>

      {/* Table */}
      <div className="table-container" style={{ 
        border: '1px solid var(--color-border)', 
        borderRadius: '8px',
        overflow: 'auto',
        maxHeight: '600px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <table className="inventory-table" style={{
          borderCollapse: 'separate',
          borderSpacing: 0,
          width: '100%',
          background: 'var(--color-surface)',
          '& td, & th': {
            border: '1px solid var(--color-border)',
            padding: '8px 12px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '200px'
          },
          '& th': {
            fontWeight: 'bold',
            textAlign: 'left',
            borderBottom: '2px solid var(--color-border)'
          }
        }}>
          <thead style={{ 
            position: 'sticky', 
            top: 0, 
            background: 'var(--color-bg-1)', 
            zIndex: 1,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
          }}>
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
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sortedBatches.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2} style={{ textAlign: 'center', padding: '32px' }}>
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
                const expiryStatus = checkExpiry(batch.expiry);
                const isReturned = batch.lot?.startsWith('DEV-') || batch.lot?.startsWith('UNDO-');
                const rowStyle = {
                  color: expiryStatus === 'expired' ? 'red' : 
                         expiryStatus === 'expiring-soon' ? '#ffd700' : 'inherit',
                  opacity: isReturned ? 0.5 : 1
                };

                // Filtrar por vista
                if (viewMode === 'ventas' && (isReturned || batch.lot?.startsWith('INIT-'))) {
                  return null;
                }
                if (viewMode === 'inventario' && !isReturned && !batch.lot?.startsWith('INIT-')) {
                  return null;
                }

                // Build cells in the same order as visibleColumns to keep headers aligned
                const cells = visibleColumns.map(col => {
                  switch (col.key) {
                    case 'sku':
                      return (
                        <td key={`sku-${batch.id}`} style={rowStyle}><strong>{batch.product_sku || '-'}</strong></td>
                      );
                    case 'name':
                      return (
                        <td key={`name-${batch.id}`} style={rowStyle}>{product.name || '-'}</td>
                      );
                    case 'category':
                      return (
                        <td key={`category-${batch.id}`} style={rowStyle}>{product.category || '-'}</td>
                      );
                    case 'lot':
                      return (
                        <td key={`lot-${batch.id}`} style={rowStyle}>{batch.lot || '-'}</td>
                      );
                    case 'expiry':
                      return (
                        <td key={`expiry-${batch.id}`} style={rowStyle}>
                          {formatDate(batch.expiry)}
                          {expiryStatus === 'expiring-soon' && ' ⚠️'}
                          {expiryStatus === 'expired' && ' ❌'}
                        </td>
                      );
                    case 'quantity':
                      return (
                        <td key={`quantity-${batch.id}`} style={rowStyle}>
                          <strong>{Number(batch.quantity || 0).toLocaleString()}</strong>
                        </td>
                      );
                    case 'purchase_price':
                      return (
                        <td key={`purchase_price-${batch.id}`} style={rowStyle}>
                          {settings?.currency || 'S/'}{Number(batch.purchase_price || 0).toFixed(2)}
                        </td>
                      );
                    case 'sale_price':
                      return (
                        <td key={`sale_price-${batch.id}`} style={rowStyle}>
                          {settings?.currency || 'S/'}{Number(product.default_sale_price || 0).toFixed(2)}
                        </td>
                      );
                    default:
                      return (<td key={`${col.key}-${batch.id}`} style={rowStyle}>-</td>);
                  }
                });

                const rowTotal = (Number(batch.quantity || 0) * Number(batch.purchase_price || 0));

                return (
                  <tr key={batch.id} className={isZeroStock ? 'inventory-table--zero-stock' : ''}>
                    {cells}
                    <td style={rowStyle}>
                      <strong>
                        {settings?.currency || 'S/'}{rowTotal.toFixed(2)}
                      </strong>
                    </td>
                    <td>
                      {!isReturned && !batch.lot?.startsWith('INIT-') && (
                        <button 
                          className="btn btn--outline btn--sm"
                          onClick={() => onReturn(batch, sectionMode)}
                          title="Devolver producto"
                          style={{ width: '100%' }}
                        >
                          {viewMode === 'ventas' ? '🔄 Devolver venta' : '↩️ Devolver compra'}
                        </button>
                      )}
                      {isReturned && (
                        <span style={{ 
                          fontSize: '12px', 
                          color: 'var(--color-text-secondary)',
                          fontStyle: 'italic' 
                        }}>
                          Devuelto
                        </span>
                      )}
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
  const [devices, setDevices] = useState(SIMULATED_DEVICES);
  const [selectedDevice, setSelectedDevice] = useState(SIMULATED_DEVICES[0]); // will be updated after onboarding if operators provided
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
    // If DB isn't ready yet, accept the settings in memory so the UI continues
    setSettings(formData);
    addToast('success', '¡Bienvenido!', 'Configuración aplicada (se persistirá automáticamente).');

    // Map provided operators (up to 3) to the simulated devices so pulseras quedan asignadas
    try {
      const mapped = SIMULATED_DEVICES.map((d, i) => ({ ...d, operator: (formData.operators && formData.operators[i]) ? formData.operators[i] : d.operator }));
      setDevices(mapped);
      // If selectedDevice is one of the simulated ones, update it to get the operator
      const updatedSelected = mapped.find(md => md.id === (selectedDevice && selectedDevice.id)) || mapped[0];
      if (updatedSelected) setSelectedDevice(updatedSelected);
    } catch (e) {
      console.error('No se pudo mapear operadores a dispositivos:', e);
    }

    try {
      if (db) {
        await db.put('settings', {
          key: 'onboarding',
          value: formData
        });
        addToast('success', 'Configuración guardada', 'La configuración fue persistida en la base de datos');
      } else {
        // Save to localStorage as fallback; will be written when DB initializes
        try { localStorage.setItem('pending_onboarding', JSON.stringify(formData)); } catch (e) { /* ignore */ }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      addToast('warning', 'Persistencia pendiente', 'No se pudo guardar ahora; se intentará al inicializar la BD');
    }
  };

  // When DB becomes available, persist any pending onboarding saved to localStorage
  useEffect(() => {
    if (!db) return;
    try {
      const raw = localStorage.getItem('pending_onboarding');
      if (raw) {
        const parsed = JSON.parse(raw);
        db.put('settings', { key: 'onboarding', value: parsed }).then(() => {
          localStorage.removeItem('pending_onboarding');
          addToast('success', 'Configuración persistida', 'La configuración inicial fue guardada en la BD');
        }).catch(err => {
          console.error('No se pudo persistir onboarding pendiente:', err);
        });
      }
    } catch (e) {
      console.error('Error al procesar pending_onboarding', e);
    }
  }, [db]);
  
  const handleConnect = () => {
    if (!selectedDevice?.operator) {
      alert('No se puede conectar: asigna un operador a esta pulsera primero.');
      return;
    }
    setConnected(true);
    addToast('success', 'Conectado', `Pulsera ${selectedDevice.id} conectada (operador: ${selectedDevice.operator})`);
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

  // Generic return handler used from UI (ventas o inventario)
  const handleReturn = async (batch, mode = 'ventas') => {
    if (!db) return;

    try {
      if (mode === 'ventas') {
        // Create a devolucion to add items back to inventory (undo sale)
        const product = products.find(p => p.sku === batch.product_sku) || {};
        const returnPayload = {
          event: 'devolucion',
          sku: batch.product_sku,
          name: product.name || batch.product_sku,
          quantity: batch.quantity || 1,
          purchase_price: batch.purchase_price || 0,
          lot: `UNDO-${Date.now()}`,
          timestamp: nowISO(),
          device_id: selectedDevice?.id,
          operator: selectedDevice?.operator || settings?.user || 'Usuario'
        };

        await handleProcessEvent(returnPayload);
        addToast('info', 'Devolución creada', `Se devolvieron ${returnPayload.quantity} unidades de ${returnPayload.name}`);
      } else {
        // mode === 'inventario' -> Devolver compra: marcar lote como devuelto y restar stock
        const tx = db.transaction(['batches', 'movements'], 'readwrite');
        const batchStore = tx.objectStore('batches');
        const existing = await batchStore.get(batch.id);
        if (!existing) {
          addToast('error', 'Error', 'Lote no encontrado');
          await tx.done;
          return;
        }

        // Mark as returned
        existing.lot = `DEV-${existing.lot || Date.now()}`;
        existing.quantity = 0;
        await batchStore.put(existing);

        // Record movement
        await tx.objectStore('movements').add({
          type: 'devolucion_compra',
          sku: existing.product_sku,
          name: (products.find(p => p.sku === existing.product_sku) || {}).name || existing.product_sku,
          quantity: 0,
          price: existing.purchase_price || 0,
          lot: existing.lot,
          timestamp: nowISO(),
          device_id: selectedDevice?.id,
          operator: selectedDevice?.operator || settings?.user || 'Usuario',
          bodega: settings?.bodega
        });

        await tx.done;
        addToast('info', 'Compra devuelta', `El lote ${existing.lot} fue marcado como devuelto y removido del inventario`);
        await refreshData();
      }
    } catch (error) {
      console.error('Return error:', error);
      addToast('error', 'Error', 'No se pudo procesar la devolución: ' + error.message);
    }
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
      
      // Estilo para el encabezado
      movementsSheet.addRow(['Timestamp', 'Tipo', 'SKU', 'Nombre', 'Cantidad', 'Precio', 'Lote', 'Operador', 'Pulsera', 'Estado']);
      movementsSheet.getRow(1).font = { bold: true };
      movementsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
      
      // Añadir resumen por operador
      const operatorSummary = workbook.addWorksheet('Resumen por Operador');
      operatorSummary.addRow(['Operador', 'Pulsera', 'Total Ventas', 'Total Compras', 'Total Devoluciones']);
      
      // Filter today's movements
      const today = new Date().toISOString().split('T')[0];
      const todayMovements = movements.filter(mov => mov.timestamp.startsWith(today));
      
      // Procesar movimientos y crear resumen
      const operatorStats = {};
      
      todayMovements
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .forEach(mov => {
          // Añadir movimiento a la hoja principal
          movementsSheet.addRow([
            formatDateTime(mov.timestamp),
            mov.type,
            mov.sku,
            mov.name,
            mov.quantity,
            mov.price,
            mov.lot || '',
            mov.operator,
            mov.device_id,
            mov.lot?.startsWith('DEV-') || mov.lot?.startsWith('UNDO-') ? 'Devuelto' : 'Activo'
          ]);

          // Actualizar estadísticas del operador
          if (!operatorStats[mov.operator]) {
            operatorStats[mov.operator] = {
              device: mov.device_id,
              ventas: 0,
              compras: 0,
              devoluciones: 0
            };
          }

          if (mov.type === 'venta') {
            operatorStats[mov.operator].ventas += mov.quantity;
          } else if (mov.type === 'ingreso') {
            operatorStats[mov.operator].compras += mov.quantity;
          } else if (mov.type === 'devolucion') {
            operatorStats[mov.operator].devoluciones += mov.quantity;
          }
        });

      // Añadir resumen por operador
      Object.entries(operatorStats).forEach(([operator, stats]) => {
        operatorSummary.addRow([
          operator,
          stats.device,
          stats.ventas,
          stats.compras,
          stats.devoluciones
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h1 style={{ fontSize: '20px', margin: '0' }}>🏢</h1>
              <input
                type="text"
                value={settings.bodega}
                onChange={(e) => {
                  const newSettings = { ...settings, bodega: e.target.value };
                  setSettings(newSettings);
                  db.put('settings', { key: 'onboarding', value: newSettings });
                }}
                className="form-control"
                style={{ fontSize: '20px', padding: '4px 8px' }}
                placeholder="Nombre de la bodega"
              />
            </div>
            <p style={{ margin: '0', fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              Moneda: {settings.currency}
            </p>
          </div>
          <div>
            <button 
              className="btn btn--outline btn--sm"
              onClick={() => {
                // Mostrar el nombre actual de la bodega y permitir editar
                const current = settings?.bodega || '';
                const newName = prompt('Editar nombre de la bodega (deja igual para sólo reconfigurar):', current);
                if (newName === null) return; // cancel
                if (newName !== current) {
                  if (!confirm('Cambiar el nombre de la bodega eliminará la base de datos y el progreso. ¿Deseas continuar?')) return;
                  // Reset DB and force onboarding
                  resetDatabase();
                  setSettings(null);
                  addToast('info', 'Reconfigurar', 'La base de datos fue reiniciada. Ingresa la nueva configuración.');
                } else {
                  // Same name -> just reconfigure (go to onboarding to edit other settings)
                  if (confirm('¿Deseas reconfigurar la aplicación? No se eliminará la BD si mantienes el mismo nombre.')) {
                    setSettings(null);
                  }
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
              availableDevices={devices}
            />
            
            {/* Center Panel - Simulation */}
            <SimulatePanel
              connected={connected}
              onProcessEvent={handleProcessEvent}
              settings={settings}
              device={selectedDevice}
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
            movements={movements}
            settings={settings}
            onRefresh={() => refreshData()}
            onExport={handleExportInventory}
            onDailyReport={handleDailyReport}
            onAddProduct={handleAddProduct}
            onReturn={handleReturn}
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