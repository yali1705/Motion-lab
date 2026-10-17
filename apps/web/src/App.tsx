import { useEffect } from 'react';
import { flushPersist, useEditor } from './store';
import { TopBar } from './components/TopBar';
import { Canvas } from './components/Canvas';
import { Transport, usePlayback } from './components/Transport';
import { Timeline } from './components/Timeline';
import { Inspector } from './components/Inspector';
import { ExportSheet } from './components/ExportSheet';

export function App() {
  usePlayback();

  useEffect(() => {
    const onHide = () => flushPersist();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushPersist());
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useEditor.getState();
      if (e.code === 'Space') { e.preventDefault(); s.togglePlaying(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); s.setFrame(s.currentFrame - (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); s.setFrame(s.currentFrame + (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (s.selectedKeyframe) { e.preventDefault(); s.deleteKeyframe(s.selectedKeyframe); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="app-shell flex flex-col bg-bg text-fg">
      <TopBar />
      <Canvas />
      <Transport />
      <Timeline />
      <Inspector />
      <ExportSheet />
    </div>
  );
}
