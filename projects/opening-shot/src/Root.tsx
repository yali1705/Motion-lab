import { Composition } from 'remotion';
import beats from '../plan/beats.json';
import { OpeningShot } from './OpeningShot';

export const RemotionRoot = () => (
  <Composition
    id="OpeningShot"
    component={OpeningShot}
    durationInFrames={beats.durationInFrames}
    fps={beats.fps}
    width={beats.width}
    height={beats.height}
  />
);
