import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { MockPage } from './mock/MockPage';

// `?mock` — 실호출 없이 가짜 데이터로 화면 상태를 조합해 보는 목업 모드.
const isMock = new URLSearchParams(window.location.search).has('mock');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isMock ? <MockPage /> : <App />}</StrictMode>,
);
