import type { TextOverlay, TextOverlaySize } from './textOverlays';
import { wrapTextOverlay } from './textOverlays';

// Preview and export use the same image so font layout, wrapping and colors agree.
export default function renderTextOverlay(overlay: TextOverlay, { width, height }: TextOverlaySize) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context == null) throw new Error('Cannot render text');

  const padding = height * 0.025;
  const maxWidth = width * 0.9 - padding * 2;
  let fontSize = Math.min(maxWidth, (height * overlay.fontSize) / 100);
  let lines: string[];
  // Fit explanations inside the frame, including portrait videos and multiline text.
  do {
    context.font = `700 ${fontSize}px "Open Sans", sans-serif`;
    lines = wrapTextOverlay(overlay.text, maxWidth, (text) => context.measureText(text).width);
    if (lines.length * fontSize * 1.25 <= height * 0.85 - padding * 2) break;
    fontSize *= 0.9;
  } while (fontSize > 1);

  const lineHeight = fontSize * 1.25;
  const boxHeight = lineHeight * lines.length + padding * 2;
  const boxWidth = Math.min(width * 0.9, Math.max(...lines.map((line) => context.measureText(line).width)) + padding * 2);
  const margin = height * 0.05;
  const defaultTop = { 'upper-middle': height * 0.22 - boxHeight / 2, top: margin, center: (height - boxHeight) / 2, bottom: height - margin - boxHeight }[overlay.position];
  const top = Math.max(0, Math.min(height - boxHeight, overlay.y != null ? overlay.y * height - boxHeight / 2 : defaultTop));
  const left = Math.max(0, Math.min(width - boxWidth, (overlay.x ?? 0.5) * width - boxWidth / 2));
  const center = left + boxWidth / 2;

  if (overlay.background) {
    context.fillStyle = 'rgba(0, 0, 0, 0.72)';
    context.beginPath();
    context.roundRect(left, top, boxWidth, boxHeight, padding * 0.4);
    context.fill();
  }
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = overlay.color;
  context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  context.lineWidth = Math.max(1, fontSize * 0.04);
  context.lineJoin = 'round';
  lines.forEach((line, index) => {
    const y = top + padding + lineHeight * (index + 0.5);
    context.strokeText(line, center, y);
    context.fillText(line, center, y);
  });
  return { url: canvas.toDataURL('image/png'), bounds: { x: left, y: top, width: boxWidth, height: boxHeight } };
}
