import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './styles.css';
import './lib/dayjs';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setupChunkErrorRecovery, setupPwaUpdates } from './app/update/registerPwa';
import { ConfigErrorScreen } from './ConfigErrorScreen';
import { configProblem } from './lib/supabase';
import { setupInstallPrompt } from './push/installStore';

setupChunkErrorRecovery();
// Antes de React: Chrome puede ofrecer la instalación apenas carga la página.
setupInstallPrompt();

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>{configProblem ? <ConfigErrorScreen problem={configProblem} /> : <App />}</StrictMode>,
);

setupPwaUpdates();
