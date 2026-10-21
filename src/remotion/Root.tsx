import {Composition, registerRoot} from 'remotion';
import {MCCVideo} from './Video';
import {FPS, durationFrames, outputSize, type VideoProps} from '../shared';

const defaults: VideoProps = {videoSrc: '', words: [], plan: {title: 'MCC edit', hook: '', segments: [{start: 0, end: 5, label: ''}]}};
function Root() {
  return <Composition id="MCCVideo" component={MCCVideo} width={1080} height={1920} fps={FPS} durationInFrames={150} defaultProps={defaults} calculateMetadata={({props}) => ({durationInFrames: durationFrames(props.plan), ...outputSize(props.format)})}/>;
}
registerRoot(Root);
