import { mkdtemp, readdir, rmdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

import type { FfmpegOperations } from './useFfmpegOperations';
import { textOverlaySchema } from '../textOverlays';
import type { FFprobeStream } from '../../../common/ffprobe';

const { run, transfer } = vi.hoisted(() => ({ run: vi.fn(async (options: { ffmpegArgs: string[] }) => ({ stdout: new Uint8Array(), stderr: new Uint8Array(), options })), transfer: vi.fn() }));

vi.mock('react', () => ({ useCallback: (fn: unknown) => fn }));
vi.mock('../mainApi', () => ({ default: { pathExists: async () => false } }));
vi.mock('../smartcut', () => ({ needsSmartCut: vi.fn(), getCodecParams: vi.fn() }));
vi.mock('../textOverlayRendering', () => ({ default: () => ({ url: 'data:image/png;base64,aGVsbG8=' }) }));
vi.mock('../util', () => ({
  assertFileExists: vi.fn(),
  transferTimestamps: transfer,
  getFrameDuration: () => 1 / 25,
  unlinkWithRetry: async (path: string) => (await import('node:fs/promises')).unlink(path),
}));
vi.mock('../ffmpeg', () => ({
  isCuttingStart: (time: number) => time > 0,
  isCuttingEnd: (time: number, duration: number) => time < duration,
  runFfmpegWithProgress: run,
  runFfmpegConcat: run,
  getDuration: async () => 1.24,
  getFfCommandLine: () => 'ffmpeg',
  getExperimentalArgs: () => [],
  getVideoTimescaleArgs: () => [],
  logStdoutStderr: vi.fn(),
}));

let useFfmpegOperations: typeof import('./useFfmpegOperations').default;
let outputDir: string;

beforeAll(async () => {
  vi.stubGlobal('window', { require: createRequire(import.meta.url) });
  vi.stubGlobal('document', { fonts: { load: vi.fn() } });
  ({ default: useFfmpegOperations } = await import('./useFfmpegOperations'));
});

beforeEach(async () => {
  run.mockClear();
  transfer.mockClear();
  outputDir = await mkdtemp(join(tmpdir(), 'losslesscut-export-test-'));
});

afterEach(async () => {
  expect(await readdir(outputDir)).toEqual([]); // all temporary text and chapter files must be cleaned up
  await rmdir(outputDir);
});

function makeOperations(isEncoding = true) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- useCallback is mocked above; these tests exercise the export commands.
  return useFfmpegOperations({ filePath: 'source.mp4', treatInputFileModifiedTimeAsStart: false, treatOutputFileModifiedTimeAsStart: false, isEncoding, lossyMode: undefined, enableOverwriteOutput: false, outputPlaybackRate: 1, cutFromAdjustmentFrames: 0, cutToAdjustmentFrames: 0, appendLastCommandsLog: vi.fn(), encCustomBitrate: undefined, appendFfmpegCommandLog: vi.fn(), ffmpegHwaccel: 'none' });
}

function exportOptions(): Parameters<FfmpegOperations['cutMultiple']>[0] {
  const disposition = { default: 1, dub: 0, original: 0, comment: 0, lyrics: 0, karaoke: 0, forced: 0, hearing_impaired: 0, visual_impaired: 0, clean_effects: 0, attached_pic: 0, timed_thumbnails: 0, captions: 0, descriptions: 0, metadata: 0, dependent: 0, still_image: 0 } as const;
  return {
    outputDir,
    customOutDir: undefined,
    segments: [{ start: 1.24, end: 2.48, originalIndex: 0 }],
    cutFileNames: ['cut.mp4'],
    fileDuration: 10,
    rotation: undefined,
    detectedFps: 25,
    onProgress: vi.fn(),
    keyframeCut: false,
    copyFileStreams: [{ path: 'source.mp4', streamIds: [0, 1] }],
    allFilesMeta: { 'source.mp4': { streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', codec_tag: '', time_base: '1/12800', disposition }, { index: 1, codec_type: 'audio', codec_name: 'aac', codec_tag: '', time_base: '1/48000', disposition }], format: { filename: 'source.mp4', nb_streams: 2, nb_programs: 0, format_name: 'mov,mp4', format_long_name: '', start_time: '0', duration: '10', size: '10000', bit_rate: '8000', probe_score: 100 }, chapters: [] } },
    outFormat: 'mp4',
    shortestFlag: false,
    ffmpegExperimental: false,
    preserveMetadata: 'default',
    preserveMetadataOnMerge: true,
    preserveMovData: false,
    preserveChapters: true,
    movFastStart: false,
    avoidNegativeTs: 'make_zero',
    paramsByFile: new Map(),
    chapters: undefined,
    textOverlays: [],
    textOverlayVideo: { streamIndex: 0, size: { width: 640, height: 360 } },
    frameAccurateCut: true,
  };
}

it('decodes and trims at the requested frame, re-encoding both video and audio', async () => {
  await makeOperations().cutMultiple(exportOptions());
  const args = run.mock.calls[0]?.[0];
  expect(args).toMatchObject({ duration: 1.24 });
  const command = (args as unknown as { ffmpegArgs: string[] }).ffmpegArgs;
  expect(command.slice(command.indexOf('-ss'), command.indexOf('-ss') + 4)).toEqual(['-ss', '1.240000', '-i', 'source.mp4']);
  expect(command.slice(command.indexOf('-t'), command.indexOf('-t') + 2)).toEqual(['-t', '1.240000']);
  expect(command).toContain('libx264');
  expect(command).toContain('[text-video]');
  expect(command).toContain('aac');
  expect(command).toContain('passthrough');
  expect(command).not.toContain('-avoid_negative_ts');
  expect(command).toContain('-map_metadata');
});

it('renders text and keeps chapter and image input indexes separate', async () => {
  const options = exportOptions();
  options.chapters = [{ start: 0, end: 1.24, name: 'Explanation' }];
  options.textOverlays = [textOverlaySchema.parse({ id: 'text', text: 'Why: 100% [ready]', start: 1.5, end: 2, fontSize: 8, position: 'center', color: '#ffffff', background: true })];
  await makeOperations().cutMultiple(options);
  const command = (run.mock.calls[0]?.[0] as unknown as { ffmpegArgs: string[] }).ffmpegArgs;
  expect(command[command.indexOf('-filter_complex') + 1]).toContain('[2:v]overlay');
  expect(command.indexOf('-t')).toBeGreaterThan(command.lastIndexOf('-i'));
  expect(command.slice(command.indexOf('-map_chapters'), command.indexOf('-map_chapters') + 2)).toEqual(['-map_chapters', '1']);
  expect(command.join(' ')).not.toContain('100%');
});

it('does not extend a short VFR frame to the average frame duration', async () => {
  const options = exportOptions();
  options.detectedFps = 30;
  options.segments = [{ start: 2, end: 2 + 1 / 60, originalIndex: 0 }];
  await makeOperations().cutMultiple(options);
  const command = run.mock.calls[0]![0].ffmpegArgs;
  expect(command[command.indexOf('-t') + 1]).toBe('0.016667');
  expect(run.mock.calls[0]![0]).toMatchObject({ duration: expect.closeTo(1 / 60, 8) });
});

it('encodes every exported segment consistently, including ones outside text ranges', async () => {
  const options = exportOptions();
  options.segments.push({ start: 4.12, end: 5.36, originalIndex: 1 });
  options.cutFileNames.push('second.mp4');
  await makeOperations().cutMultiple(options);
  expect(run).toHaveBeenCalledTimes(2);
  for (const [call] of run.mock.calls as unknown as [{ ffmpegArgs: string[] }][]) expect(call.ffmpegArgs).toContain('libx264');
});

it('uses WebM-compatible video and audio encoders', async () => {
  const options = exportOptions();
  options.outFormat = 'webm';
  await makeOperations().cutMultiple(options);
  const command = (run.mock.calls[0]?.[0] as unknown as { ffmpegArgs: string[] }).ffmpegArgs;
  expect(command).toContain('libvpx-vp9');
  expect(command).toContain('libopus');
});

it('preserves the stream-copy path when frame-accurate mode and text are off', async () => {
  const options = exportOptions();
  options.frameAccurateCut = false;
  await makeOperations(false).cutMultiple(options);
  const command = run.mock.calls[0]![0].ffmpegArgs;
  expect(command).not.toContain('-filter_complex');
  expect(command).not.toContain('libx264');
  expect(command).not.toContain('-c:a');
  expect(command.indexOf('-ss')).toBeGreaterThan(command.indexOf('-i'));
  expect(command).toContain('copy');
});

it('preserves video frames and removes audio encoder delay when merging exact cuts', async () => {
  await makeOperations().concatFiles({
    paths: ['first.mp4', 'second.mp4'],
    outDir: outputDir,
    outPath: join(outputDir, 'merged.mp4'),
    metadataFromPath: 'first.mp4',
    includeAllStreams: true,
    streams: exportOptions().allFilesMeta['source.mp4']!.streams as FFprobeStream[],
    outFormat: 'mp4',
    ffmpegExperimental: false,
    preserveMovData: false,
    movFastStart: false,
    chapters: undefined,
    preserveMetadataOnMerge: false,
    frameAccurateMerge: true,
  });
  const command = run.mock.calls[0]![0].ffmpegArgs;
  expect(command).toContain('-copyts');
  expect(command).toContain('atrim=start=0:end=2.480000,asetpts=PTS-STARTPTS');
  expect(command).toContain('aac');
  expect(command).not.toContain('libx264');
});

it('refuses to silently omit text when the previewed video track is excluded', async () => {
  const options = exportOptions();
  options.copyFileStreams[0]!.streamIds = [1];
  await expect(makeOperations().cutMultiple(options)).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});

it('cleans up temporary text assets when FFmpeg fails or export is cancelled', async () => {
  run.mockRejectedValueOnce(new Error('Cancelled'));
  const options = exportOptions();
  options.textOverlays = [textOverlaySchema.parse({ id: 'text', text: 'Explanation', start: 1.5, end: 2, fontSize: 8, position: 'bottom', color: '#ffffff', background: true })];
  await expect(makeOperations().cutMultiple(options)).rejects.toThrow('Cancelled');
});
