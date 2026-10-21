import React from 'react';
import {createRoot} from 'react-dom/client';
import {Session} from './Session';
import './fonts.css';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Session/></React.StrictMode>);
