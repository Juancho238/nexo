import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Portal from './Portal';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{new URLSearchParams(window.location.search).get('portal')==='1'?<Portal/>:<App/>}</React.StrictMode>);
