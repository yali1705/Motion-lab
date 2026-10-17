import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CompositionView, createTestComposition, fontFaceCss, loadFonts, safeParseProject } from '@motion-lab/engine';
import './index.css';
import { App } from './App';

const style = document.createElement('style');
style.textContent = fontFaceCss();
document.head.appendChild(style);

const params = new URLSearchParams(location.search);

async function boot() {
  // Never block the editor on fonts for long; the embedded faces load in a few ms anyway.
  await Promise.race([loadFonts(), new Promise((r) => setTimeout(r, 3000))]);
  const root = createRoot(document.getElementById('root')!);

  if (params.get('qa') === 'frame') {
    // QA mode: render one bare frame at 1:1 — used by the preview/export parity check.
    const frame = Number(params.get('f') ?? 0);
    let project = createTestComposition();
    if (params.get('source') === 'storage') {
      const raw = localStorage.getItem('motion-lab:project:v1');
      const parsed = raw ? safeParseProject(JSON.parse(raw)) : null;
      if (parsed?.success) project = parsed.data;
    }
    document.body.style.position = 'static';
    document.body.style.overflow = 'visible';
    root.render(<CompositionView project={project} frame={frame} />);
    (window as unknown as { __motionLabReady: boolean }).__motionLabReady = true;
    return;
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
