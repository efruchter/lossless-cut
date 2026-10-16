import { z } from 'zod';

import type { FFprobeStream } from '../../common/ffprobe';
import { formatFfmpegNumber } from '../../common/util';

export const textOverlaySchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  fontSize: z.number().min(2).max(20), // percentage of the video height
  position: z.enum(['upper-middle', 'top', 'center', 'bottom']),
  color: z.string().regex(/^#[\da-f]{6}$/i),
  background: z.boolean(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
}).refine(({ start, end }) => end > start, { message: 'Start time must be before end time', path: ['end'] });

export type TextOverlay = z.infer<typeof textOverlaySchema>;
export interface TextOverlaySize { width: number, height: number }
export interface TextOverlayAsset { overlay: TextOverlay, path: string }
export interface TextOverlayExport {
  streamIndex: number,
  size: TextOverlaySize,
  assets: TextOverlayAsset[],
}

export const textOverlayFormats = new Set(['mp4', 'mov', 'matroska', 'webm', 'mpegts', 'avi']);

export function getTextOverlaySize(stream: Pick<FFprobeStream, 'width' | 'height' | 'sample_aspect_ratio' | 'tags' | 'side_data_list'> | undefined, rotation?: number): TextOverlaySize {
  const [sarWidth, sarHeight] = (stream?.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  const sar = sarWidth && sarHeight ? sarWidth / sarHeight : 1;
  const width = (stream?.width ?? 1920) * sar;
  const height = stream?.height ?? 1080;
  const rotate = rotation ?? Number(stream?.tags?.rotate ?? stream?.side_data_list?.find((data) => data.rotation != null)?.rotation ?? 0);
  const swap = Math.abs(rotate % 180) === 90;
  // H.264 in yuv420p requires even dimensions. Normalize non-square source pixels too.
  return { width: Math.max(2, Math.round((swap ? height : width) / 2) * 2), height: Math.max(2, Math.round((swap ? width : height) / 2) * 2) };
}

export function getTextOverlayInterval(overlay: Pick<TextOverlay, 'start' | 'end'>, cutFrom: number, cutTo: number) {
  const start = Math.max(overlay.start, cutFrom) - cutFrom;
  const end = Math.min(overlay.end, cutTo) - cutFrom;
  return end > start ? { start, end } : undefined;
}

export function getTextOverlayFilter({ assets, streamInput, firstImageInput, size, cutFrom, cutTo }: {
  assets: TextOverlayAsset[], streamInput: string, firstImageInput: number, size: TextOverlaySize, cutFrom: number, cutTo: number,
}) {
  const graph = [`[${streamInput}]scale=${size.width}:${size.height},setsar=1[text-base]`];
  let previous = 'text-base';
  assets.forEach(({ overlay }, index) => {
    const interval = getTextOverlayInterval(overlay, cutFrom, cutTo);
    if (interval == null) return;
    const output = `text-${index}`;
    // A half-open interval avoids showing both consecutive cards on their shared boundary.
    graph.push(`[${previous}][${firstImageInput + index}:v]overlay=eof_action=repeat:enable='gte(t,${formatFfmpegNumber(interval.start)})*lt(t,${formatFfmpegNumber(interval.end)})'[${output}]`);
    previous = output;
  });
  graph.push(`[${previous}]format=yuv420p[text-video]`);
  return graph.join(';');
}

export function wrapTextOverlay(text: string, maxWidth: number, measure: (value: string) => number) {
  const lines: string[] = [];
  for (const paragraph of text.replaceAll('\r', '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate) > maxWidth) {
        lines.push(line);
        line = '';
      }
      if (line) line += ' ';
      // Split long URLs and words, including text in languages without spaces.
      for (const character of word) {
        if (line && measure(line + character) > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}
