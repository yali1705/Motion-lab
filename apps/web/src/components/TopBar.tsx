import { useEditor } from '../store';
import { IconExport, IconRedo, IconUndo } from './Icons';

export function TopBar() {
  const name = useEditor((s) => s.project.name);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const update = useEditor((s) => s.update);
  const setExportOpen = useEditor((s) => s.setExportOpen);

  return (
    <header className="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-line bg-bg">
      <input
        type="text"
        aria-label="Project name"
        value={name}
        onChange={(e) => update((p) => ({ ...p, name: e.target.value }), 'none')}
        onBlur={() => update((p) => ({ ...p }), 'none')}
        className="flex-1 min-w-0 !bg-transparent !border-0 !text-[15px] font-semibold px-1 py-1 truncate"
      />
      <button className="btn btn-icon" aria-label="Undo" disabled={!canUndo} onClick={undo}>
        <IconUndo />
      </button>
      <button className="btn btn-icon" aria-label="Redo" disabled={!canRedo} onClick={redo}>
        <IconRedo />
      </button>
      <button className="btn btn-primary" onClick={() => setExportOpen(true)}>
        <IconExport /> Export
      </button>
    </header>
  );
}
