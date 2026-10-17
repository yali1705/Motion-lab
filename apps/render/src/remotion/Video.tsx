import { useEffect, useState } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';
import { CompositionView, fontFaceCss, loadFonts, type Project } from '@motion-lab/engine';

/**
 * The exported video is literally the same <CompositionView> the editor
 * preview draws, evaluated with the same engine at each frame.
 */
export function Video({ project }: { project: Project }) {
  const frame = useCurrentFrame();
  const [handle] = useState(() => delayRender('Loading embedded fonts'));
  useEffect(() => {
    let cancelled = false;
    loadFonts()
      .catch((e) => console.error('font load failed', e))
      .finally(() => {
        if (!cancelled) continueRender(handle);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);
  return (
    <>
      <style>{fontFaceCss()}</style>
      <CompositionView project={project} frame={frame} />
    </>
  );
}
