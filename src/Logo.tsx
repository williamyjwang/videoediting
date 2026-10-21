import {Img} from 'remotion';
import gold from './assets/logo-gold.svg';
import ivory from './assets/logo-ivory.svg';

// Crop only the generous transparent canvas. The source artwork is unchanged.
export function Logo({width = 160, variant = 'gold', inVideo = false}: {width?: number; variant?: 'gold' | 'ivory'; inVideo?: boolean}) {
  const Image = inVideo ? Img : 'img';
  return <div style={{width, height: width * 0.52, overflow: 'hidden', position: 'relative'}}>
    <Image src={variant === 'gold' ? gold : ivory} alt="MCC" style={{position: 'absolute', width, height: width, top: -width * 0.24, left: 0}}/>
  </div>;
}
