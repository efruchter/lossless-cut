import { expect, it } from 'vitest';

import { getTextOverlayFilter, getTextOverlayInterval, getTextOverlaySize, textOverlaySchema, wrapTextOverlay } from './textOverlays';
import { llcProjectV2Schema } from './types';

const overlay = textOverlaySchema.parse({ id: 'explanation', text: "Here's why: 100% [safe], 日本語\nNext line", start: 12, end: 18, fontSize: 8, position: 'bottom', color: '#ffffff', background: true });

it('clips text to each exported segment and rebases it to the segment start', () => {
  expect(getTextOverlayInterval(overlay, 10, 15)).toEqual({ start: 2, end: 5 });
  expect(getTextOverlayInterval(overlay, 15, 20)).toEqual({ start: 0, end: 3 });
  expect(getTextOverlayInterval(overlay, 18, 20)).toBeUndefined();
  expect(getTextOverlayInterval(overlay, 0, 12)).toBeUndefined();
});

it('builds timed filters without interpreting explanatory text as FFmpeg syntax', () => {
  const graph = getTextOverlayFilter({ assets: [{ overlay, path: "C:/A video's folder/image.png" }], streamInput: '1:2', firstImageInput: 3, size: { width: 1920, height: 1080 }, cutFrom: 10, cutTo: 20 });
  expect(graph).toContain('[1:2]scale=1920:1080,setsar=1');
  expect(graph).toContain("[3:v]overlay=eof_action=repeat:enable='gte(t,2.000000)*lt(t,8.000000)'");
  expect(graph).toContain('[text-video]');
  expect(graph).not.toContain(overlay.text);
  expect(graph).not.toContain('folder');
});

it('keeps image indexes correct when a preceding card is outside the cut', () => {
  const graph = getTextOverlayFilter({ assets: [{ overlay: { ...overlay, start: 0, end: 2 }, path: '0.png' }, { overlay, path: '1.png' }], streamInput: '0:0', firstImageInput: 2, size: { width: 640, height: 360 }, cutFrom: 10, cutTo: 20 });
  expect(graph).toContain('[3:v]overlay');
  expect(graph).not.toContain('[2:v]overlay');
});

it('supports frame-accurate encoding of segments without any text', () => {
  expect(getTextOverlayFilter({ assets: [], streamInput: '0:0', firstImageInput: 1, size: { width: 640, height: 360 }, cutFrom: 2, cutTo: 3 })).toBe('[0:0]scale=640:360,setsar=1[text-base];[text-base]format=yuv420p[text-video]');
});

it('rejects empty text, invalid intervals and invalid placement', () => {
  for (const changes of [{ text: '   ' }, { start: -1 }, { end: 12 }, { start: NaN }, { end: Infinity }, { fontSize: 0 }, { color: "white:enable='1'" }, { x: 1.1 }, { y: -0.1 }]) {
    expect(textOverlaySchema.safeParse({ ...overlay, ...changes }).success).toBe(false);
  }
});

it('preserves draggable text settings while accepting older projects', () => {
  expect(llcProjectV2Schema.parse({ version: 2, cutSegments: [] }).textOverlays).toBeUndefined();
  const saved = llcProjectV2Schema.parse({ version: 2, cutSegments: [], textOverlays: [{ ...overlay, x: 0.25, y: 0.6, fontSize: 12.5 }] });
  expect(saved.textOverlays?.[0]).toMatchObject({ text: overlay.text, x: 0.25, y: 0.6, fontSize: 12.5 });
});

it('sizes portrait and rotated videos and normalizes non-square pixels', () => {
  expect(getTextOverlaySize({ width: 1920, height: 1080 }, 90)).toEqual({ width: 1080, height: 1920 });
  expect(getTextOverlaySize({ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] })).toEqual({ width: 1080, height: 1920 });
  expect(getTextOverlaySize({ width: 720, height: 576, sample_aspect_ratio: '16:15' })).toEqual({ width: 768, height: 576 });
  expect(getTextOverlaySize({ width: 641, height: 359 })).toEqual({ width: 642, height: 360 });
});

it('wraps explanations and long words without losing explicit blank lines', () => {
  const measure = (text: string) => text.length;
  expect(wrapTextOverlay('one two three\n\nfour', 7, measure)).toEqual(['one two', 'three', '', 'four']);
  expect(wrapTextOverlay('abcdefghij', 4, measure)).toEqual(['abcd', 'efgh', 'ij']);
  expect(wrapTextOverlay('日本語日本語', 3, measure)).toEqual(['日本語', '日本語']);
});
