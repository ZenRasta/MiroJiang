import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './globals.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#121929',
            color: '#E8EBF0',
            border: '1px solid rgba(255,255,255,0.07)',
            fontFamily: "'DM Mono', monospace",
            fontSize: '12px',
          },
        }}
      />
    </BrowserRouter>
  </StrictMode>
);
