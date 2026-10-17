import { Composition } from 'remotion';
import { ProjectSchema, createTestComposition, type Project } from '@motion-lab/engine';
import { Video } from './Video.js';

export const COMPOSITION_ID = 'MotionLab';

/**
 * A single Remotion composition whose metadata (size, fps, duration) is
 * derived from the project passed as input props — so the export always
 * matches the project exactly.
 */
export function Root() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={Video}
      defaultProps={{ project: createTestComposition() }}
      width={1080}
      height={1920}
      fps={60}
      durationInFrames={300}
      calculateMetadata={({ props }) => {
        const project: Project = ProjectSchema.parse(props.project);
        return {
          width: project.width,
          height: project.height,
          fps: project.fps,
          durationInFrames: project.durationFrames,
          props: { project },
        };
      }}
    />
  );
}
