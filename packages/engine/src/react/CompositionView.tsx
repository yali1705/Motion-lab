import type { CSSProperties, ReactElement } from 'react';
import { evaluateProject, type LayerState } from '../evaluate.js';
import { FONT_FAMILY } from '../fonts.js';
import type { Project } from '../schema.js';

export interface CompositionViewProps {
  project: Project;
  /** Frame to render (integer). */
  frame: number;
  /** Optional per-layer wrapper (used by the editor for selection outlines). Must not alter layout. */
  renderLayerOverlay?: (state: LayerState) => ReactElement | null;
  style?: CSSProperties;
}

/** Style of one text layer — the single source of truth for both preview and export. */
export function layerStyle(state: LayerState): CSSProperties {
  const { layer } = state;
  return {
    position: 'absolute',
    left: state.x,
    top: state.y,
    width: layer.width,
    transform: `translate(-50%, -50%) scale(${state.scale}) rotate(${state.rotation}deg)`,
    transformOrigin: '50% 50%',
    opacity: state.opacity,
    color: layer.color,
    fontFamily: FONT_FAMILY,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    letterSpacing: layer.letterSpacing,
    lineHeight: layer.lineHeight,
    textAlign: layer.textAlign,
    direction: state.direction,
    unicodeBidi: 'isolate',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    margin: 0,
    padding: 0,
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'geometricPrecision',
    fontKerning: 'normal',
    fontVariantLigatures: 'none',
  };
}

/**
 * Renders a project at a single frame as plain absolutely-positioned DOM.
 * Used verbatim by the editor preview (scaled with CSS) and by the Remotion
 * composition (rendered by headless Chromium) so output is identical.
 */
export function CompositionView({ project, frame, renderLayerOverlay, style }: CompositionViewProps): ReactElement {
  const state = evaluateProject(project, frame);
  return (
    <div
      style={{
        position: 'relative',
        width: project.width,
        height: project.height,
        background: project.background,
        overflow: 'hidden',
        fontFamily: FONT_FAMILY,
        ...style,
      }}
    >
      {state.layers.map((s) =>
        s.active ? (
          <div key={s.layer.id} data-layer-id={s.layer.id} dir={s.direction} style={layerStyle(s)}>
            {s.layer.text}
            {renderLayerOverlay ? renderLayerOverlay(s) : null}
          </div>
        ) : null,
      )}
    </div>
  );
}
