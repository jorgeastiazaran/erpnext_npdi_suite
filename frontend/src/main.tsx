import { StrictMode } from 'react'
import { createRoot, Root } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

let rootInstance: Root | null = null;

(window as any).mountNpdiDashboard = function(container: HTMLElement) {
  if (rootInstance) {
    try {
      rootInstance.unmount();
    } catch (e) {
      console.warn("Unmount previous root failed", e);
    }
    rootInstance = null;
  }
  rootInstance = createRoot(container);
  rootInstance.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
};

// Auto-mount if element is already present at module execution time
const container = document.getElementById('npdi-react-root');
if (container) {
  (window as any).mountNpdiDashboard(container);
}

