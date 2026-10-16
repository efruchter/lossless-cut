import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import useUserSettings from '../hooks/useUserSettings';
import Select from './Select';

function CutModeSelect({ hasTextOverlays = false }: { hasTextOverlays?: boolean }) {
  const { t } = useTranslation();
  const { enableFrameAccurateCut, setEnableFrameAccurateCut, enableSmartCut, setEnableSmartCut, keyframeCut, setKeyframeCut } = useUserSettings();
  let mode = keyframeCut ? 'keyframe' : 'normal';
  if (enableSmartCut) mode = 'smart';
  if (enableFrameAccurateCut || hasTextOverlays) mode = 'exact';
  return (
    <Select
      aria-label={t('Cut precision')}
      title={hasTextOverlays ? t('Text exports use frame-accurate cuts.') : t('Frame accurate cuts at the selected frames and re-encodes the video and audio. Keyframe cut copies streams without re-encoding.')}
      value={mode}
      disabled={hasTextOverlays}
      onChange={(event) => {
        const { value } = event.target;
        setEnableFrameAccurateCut(value === 'exact');
        setEnableSmartCut(value === 'smart');
        setKeyframeCut(value !== 'normal');
      }}
    >
      <option value="exact">{t('Frame accurate (re-encode)')}</option>
      <option value="keyframe">{t('Keyframe cut (lossless)')}</option>
      <option value="normal">{t('Normal cut (stream copy)')}</option>
      <option value="smart">{t('Smart cut (experimental)')}</option>
    </Select>
  );
}

export default memo(CutModeSelect);
