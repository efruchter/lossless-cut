import type { FormEvent } from 'react';
import { memo, useState, useId, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import { FaPlus, FaTrash } from 'react-icons/fa';

import type { TextOverlay } from '../textOverlays';
import { textOverlaySchema } from '../textOverlays';
import type { FormatTimecode } from '../types';
import Button from './Button';
import CloseButton from './CloseButton';
import Select from './Select';
import TextInput from './TextInput';
import styles from './TextOverlayEditor.module.css';

function TextOverlayEditor({ overlays, onChange, draft, onDraftChange, time, duration, seek, formatTimecode, onClose }: {
  overlays: TextOverlay[],
  onChange: (value: TextOverlay[]) => void,
  draft: TextOverlay | undefined,
  onDraftChange: (value: TextOverlay | undefined) => void,
  time: number,
  duration: number,
  seek: (value: number) => void,
  formatTimecode: FormatTimecode,
  onClose: () => void,
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string>();
  const fieldId = useId();

  const commitDraft = useCallback(() => {
    if (draft == null || !draft.text.trim()) return overlays;
    if (!Number.isFinite(draft.start) || !Number.isFinite(draft.end) || draft.start < 0 || draft.end <= draft.start || draft.end > duration) {
      setError(t('Choose a start and end within the video, with the end after the start.'));
      return undefined;
    }
    const result = textOverlaySchema.safeParse(draft);
    if (!result.success) {
      setError(t('Check the text settings.'));
      return undefined;
    }
    const exists = overlays.some(({ id }) => id === draft.id);
    const saved = exists ? overlays.map((overlay) => (overlay.id === draft.id ? result.data : overlay)) : [...overlays, result.data];
    onChange(saved);
    return saved;
  }, [draft, duration, onChange, overlays, t]);

  function update(changes: Partial<TextOverlay>) {
    if (draft == null) return;
    onDraftChange({ ...draft, ...changes });
    setError(undefined);
  }

  function add() {
    if (commitDraft() == null) return;
    const start = Math.max(0, Math.min(time, duration - 0.001));
    onDraftChange({ id: nanoid(), text: '', start, end: Math.min(duration, start + 5), fontSize: 8, position: 'upper-middle', color: '#ffffff', background: true });
    seek(start);
    setError(undefined);
  }

  const save = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft == null) return;
    if (!draft.text.trim()) {
      setError(t('Enter some explanatory text.'));
      return;
    }
    if (commitDraft() == null) return;
    onDraftChange(undefined);
    setError(undefined);
  }, [commitDraft, draft, onDraftChange, t]);

  return (
    <aside className={styles['panel']} aria-label={t('Explanatory text')}>
      <div className={styles['heading']}>
        <strong>{t('Explanatory text')}</strong>
        <CloseButton
          style={{ position: 'static' }}
          onClick={() => {
            if (commitDraft() == null) return;
            onDraftChange(undefined);
            onClose();
          }}
        />
      </div>
      <p className={styles['help']}>{t('Add large text to explain what is happening at any point in your video.')}</p>
      <Button onClick={() => add()} disabled={duration <= 0} title={t('Save the current text and add another at the playhead')} style={{ width: '100%', padding: '10px 12px', background: 'var(--cyan-9)', color: 'white', borderColor: 'var(--cyan-9)', fontWeight: 600 }}><FaPlus /> {t('Add text at playhead')}</Button>
      {error != null && <p role="alert" className={styles['error']}>{error}</p>}

      {draft != null && (
        <form className={styles['form']} onSubmit={save}>
          <label htmlFor={`${fieldId}-text`}>
            {t('Text')}
            <textarea id={`${fieldId}-text`} rows={4} maxLength={2000} value={draft.text} placeholder={t('Explain this moment…')} onChange={(event) => update({ text: event.target.value })} />
          </label>
          <div className={styles['options']}>
            <Button type="submit">{t('Apply text')}</Button>
            <Button onClick={() => { onDraftChange(undefined); setError(undefined); }}>{t('Cancel')}</Button>
          </div>
          <div className={styles['times']}>
            <label htmlFor={`${fieldId}-start`}>
              {t('Start (seconds)')}
              <TextInput id={`${fieldId}-start`} type="number" min={0} max={duration} step="any" required value={Number.isFinite(draft.start) ? draft.start : ''} onChange={(event) => update({ start: event.target.valueAsNumber })} />
              <Button onClick={() => update({ start: time })}>{t('Use playhead')}</Button>
            </label>
            <label htmlFor={`${fieldId}-end`}>
              {t('End (seconds)')}
              <TextInput id={`${fieldId}-end`} type="number" min={0} max={duration} step="any" required value={Number.isFinite(draft.end) ? draft.end : ''} onChange={(event) => update({ end: event.target.valueAsNumber })} />
              <Button onClick={() => update({ end: time })}>{t('Use playhead')}</Button>
            </label>
          </div>
          <label htmlFor={`${fieldId}-size`}>
            {t('Text size')} ({draft.fontSize}%)
            <input id={`${fieldId}-size`} type="range" min={2} max={20} step={0.1} value={draft.fontSize} onChange={(event) => update({ fontSize: event.target.valueAsNumber })} />
          </label>
          <label htmlFor={`${fieldId}-position`}>
            {t('Position')}
            <Select
              id={`${fieldId}-position`}
              value={draft.x != null || draft.y != null ? 'custom' : draft.position}
              onChange={(event) => {
                const positioned = { ...draft, position: event.target.value as TextOverlay['position'] };
                delete positioned.x;
                delete positioned.y;
                onDraftChange(positioned);
              }}
            >
              {(draft.x != null || draft.y != null) && <option value="custom" disabled>{t('Custom (dragged)')}</option>}
              <option value="upper-middle">{t('Upper middle (title)')}</option>
              <option value="top">{t('Top')}</option>
              <option value="center">{t('Center')}</option>
              <option value="bottom">{t('Bottom')}</option>
            </Select>
          </label>
          <div className={styles['options']}>
            <label htmlFor={`${fieldId}-color`}>{t('Text color')} <input id={`${fieldId}-color`} type="color" value={draft.color} onChange={(event) => update({ color: event.target.value })} /></label>
            <label htmlFor={`${fieldId}-background`}><input id={`${fieldId}-background`} type="checkbox" checked={draft.background} onChange={(event) => update({ background: event.target.checked })} /> {t('Dark background')}</label>
          </div>
          <Button disabled={!Number.isFinite(draft.start)} onClick={() => seek(draft.start)}>{t('Preview at start')}</Button>
          <p className={styles['help']}>{t('Drag the text on the video to move it. Drag its corner handle to resize. Apply your changes to include them in the export.')}</p>
        </form>
      )}

      <div className={styles['list']}>
        {overlays.length === 0 && draft == null && <p className={styles['help']}>{t('No explanatory text yet. Move the playhead to a moment and add your first text.')}</p>}
        {overlays.map((overlay) => (
          <div key={overlay.id} className={styles['card']}>
            <Button
              className={styles['cardButton']}
              onClick={() => {
                const saved = commitDraft();
                if (saved == null) return;
                onDraftChange({ ...(saved.find(({ id }) => id === overlay.id) ?? overlay) });
                seek(overlay.start);
                setError(undefined);
              }}
            >
              <span>{formatTimecode({ seconds: overlay.start })} – {formatTimecode({ seconds: overlay.end })}</span>
              <strong>{overlay.text}</strong>
            </Button>
            <Button disabled={draft != null} title={t('Delete text')} aria-label={t('Delete text')} onClick={() => onChange(overlays.filter(({ id }) => id !== overlay.id))}><FaTrash /></Button>
          </div>
        ))}
      </div>
      <p className={styles['help']}>{t('Text is burned into the exported video. This re-encodes the video and may take longer. Supported output formats: MP4, MOV, MKV, WebM, MPEG-TS and AVI.')}</p>
    </aside>
  );
}

export default memo(TextOverlayEditor);
