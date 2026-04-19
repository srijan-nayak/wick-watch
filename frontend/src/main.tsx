import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        style: {
          background: '#1a1a24',
          border: '1px solid #2a2a3a',
          color: '#e8e8f0',
          fontSize: '13px',
        },
      }}
    />
  </StrictMode>,
);
