import React, { useEffect, useState } from "react";
import { openDB } from 'idb';

// Constants
const SIMULATED_DEVICES = [
  { id: 'PUL-001', name: 'Pulsera-001', rssi: -50, operator: '' },
  { id: 'PUL-002', name: 'Pulsera-002', rssi: -60, operator: '' },
  { id: 'PUL-003', name: 'Pulsera-003', rssi: -70, operator: '' }
];

const DB_NAME = 'inventario_bodega_db_v1';

function App() {
  // App State
  const [db, setDb] = useState(null);
  const [settings, setSettings] = useState(null);
  const [dbStatus, setDbStatus] = useState('initializing');
  
  // UI State
  const [toasts, setToasts] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [isExporting, setIsExporting] = useState(false);
  const [prevOnboarding, setPrevOnboarding] = useState(null);
  
  // Device State
  const [devices, setDevices] = useState(SIMULATED_DEVICES);
  const [selectedDevice, setSelectedDevice] = useState(SIMULATED_DEVICES[0]);
  const [connected, setConnected] = useState(false);
  const [salesSensorConnected, setSalesSensorConnected] = useState(false);
  const [simSinceReset, setSimSinceReset] = useState(0);
  
  // Data State
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const database = await openDB(DB_NAME, 1, {
          upgrade(db) {
            if (!db.objectStoreNames.contains('products')) {
              db.createObjectStore('products', { keyPath: 'sku' });
            }
            if (!db.objectStoreNames.contains('settings')) {
              db.createObjectStore('settings', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('batches')) {
              const batchStore = db.createObjectStore('batches', { 
                keyPath: 'id', 
                autoIncrement: true 
              });
              batchStore.createIndex('by_sku', 'product_sku');
            }
            if (!db.objectStoreNames.contains('movements')) {
              const movStore = db.createObjectStore('movements', {
                keyPath: 'id',
                autoIncrement: true
              });
              movStore.createIndex('by_type', 'type');
              movStore.createIndex('by_date', 'timestamp');
            }
          }
        });

        setDb(database);
        const savedSettings = await database.get('settings', 'onboarding');
        if (savedSettings) {
          setSettings(savedSettings.value);
        }
        
        setDbStatus('ready');
      } catch (error) {
        console.error('Error initializing app:', error);
        setDbStatus('error');
        addToast('error', 'Error de inicialización', 
          'No se pudo inicializar la base de datos. Por favor, recarga la página.');
      }
    };

    initializeApp();
  }, []);

  const addToast = (type, title, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  if (dbStatus === 'initializing') {
    return (
      <div className="app-container">
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh' 
        }}>
          <h2>Inicializando...</h2>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (dbStatus === 'error') {
    return (
      <div className="app-container">
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh' 
        }}>
          <h2>Error de Inicialización</h2>
          <p>No se pudo inicializar la base de datos.</p>
          <button 
            className="btn btn--primary" 
            onClick={() => window.location.reload()}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="app-container">
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          height: '100vh' 
        }}>
          <h2>Configuración Inicial</h2>
          <form onSubmit={(e) => {
            e.preventDefault();
            setSettings({
              bodega: 'Mi Bodega',
              currency: 'S/',
              operator: 'Admin'
            });
          }}>
            <button type="submit" className="btn btn--primary">
              Comenzar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            <div className="toast__title">{toast.title}</div>
            <div className="toast__message">{toast.message}</div>
            <button 
              className="toast__close"
              onClick={() => removeToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="header">
        <h1>{settings.bodega}</h1>
        <div className="header__actions">
          <span className="currency">{settings.currency}</span>
          <button 
            className="btn btn--outline"
            onClick={() => setSettings(null)}
          >
            Reconfigurar
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="main-content">
        <div className="dashboard">
          <div className="dashboard__item">
            <h3>Dispositivos</h3>
            <div className="device-status">
              {devices.map(device => (
                <div key={device.id} className="device-card">
                  <div className="device-card__name">{device.name}</div>
                  <div className="device-card__status">
                    {device.id === selectedDevice?.id && connected ? 'Conectado' : 'Desconectado'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard__item">
            <h3>Inventario</h3>
            <div className="inventory-summary">
              <div className="stat-card">
                <div className="stat-card__value">{products.length}</div>
                <div className="stat-card__label">Productos</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{batches.length}</div>
                <div className="stat-card__label">Lotes</div>
              </div>
            </div>
          </div>

          <div className="dashboard__item">
            <h3>Eventos Recientes</h3>
            <div className="event-list">
              {events.map(event => (
                <div key={event.id} className="event-card">
                  <div className="event-card__type">{event.type}</div>
                  <div className="event-card__details">{event.name}</div>
                  <div className="event-card__timestamp">
                    {new Date(event.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;