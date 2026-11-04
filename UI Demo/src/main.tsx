import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DemoProvider } from './store';
import {WorkProvider} from './work-store';
import './styles/app.css';
import './styles/governance.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><DemoProvider><WorkProvider><App/></WorkProvider></DemoProvider></React.StrictMode>);
