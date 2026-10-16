import type { PointerEvent as ReactPointerEvent } from 'react';
import { memo, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { TextOverlay, TextOverlaySize } from '../textOverlays';
import renderTextOverlay from '../textOverlayRendering';

interface Point { x: number, y: number }

function getPoint(event: ReactPointerEvent<SVGRectElement>): Point {
  const svg = event.currentTarget.ownerSVGElement!;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM()!.inverse());
}

function TextOverlayPreview({ overlays, time, size, editingId, onEdit, onChange }: {
  overlays: TextOverlay[],
  time: number,
  size: TextOverlaySize,
  editingId: string | undefined,
  onEdit: (overlay: TextOverlay) => void,
  onChange: (overlay: TextOverlay) => void,
}) {
  const { t } = useTranslation();
  const images = useMemo(() => overlays.map((overlay) => ({ overlay, ...renderTextOverlay(overlay, size) })), [overlays, size]);
  const gesture = useRef<{ overlay: TextOverlay, point: Point, center: Point, resize: boolean }>(undefined);
  const handleSize = Math.max(14, size.height * 0.025);

  function start(event: ReactPointerEvent<SVGRectElement>, image: typeof images[number], resize: boolean) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { overlay, bounds } = image;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    gesture.current = { overlay, point: getPoint(event), center, resize };
    onEdit(overlay);
  }

  function move(event: ReactPointerEvent<SVGRectElement>) {
    const { current } = gesture;
    if (current == null) return;
    const point = getPoint(event);
    if (current.resize) {
      const originalDistance = Math.hypot(current.point.x - current.center.x, current.point.y - current.center.y);
      const distance = Math.hypot(point.x - current.center.x, point.y - current.center.y);
      const fontSize = Math.max(2, Math.min(20, current.overlay.fontSize * (distance / Math.max(1, originalDistance))));
      onChange({ ...current.overlay, fontSize: Math.round(fontSize * 10) / 10 });
    } else {
      onChange({ ...current.overlay, x: Math.max(0, Math.min(1, (current.center.x + point.x - current.point.x) / size.width)), y: Math.max(0, Math.min(1, (current.center.y + point.y - current.point.y) / size.height)) });
    }
  }

  return (
    <svg aria-label={t('Video text preview')} viewBox={`0 0 ${size.width} ${size.height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
      {images.filter(({ overlay }) => time >= overlay.start && time < overlay.end).map((image) => {
        const { overlay, url, bounds } = image;
        const selected = editingId === overlay.id;
        return (
          <g key={overlay.id}>
            <image href={url} width={size.width} height={size.height} />
            <rect
              x={bounds.x}
              y={bounds.y}
              width={bounds.width}
              height={bounds.height}
              fill="transparent"
              stroke={selected ? '#28c9f5' : 'transparent'}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: editingId != null && !selected ? 'none' : 'all', cursor: 'move', touchAction: 'none' }}
              onPointerDown={(event) => start(event, image, false)}
              onPointerMove={move}
              onPointerUp={() => { gesture.current = undefined; }}
              onPointerCancel={() => { gesture.current = undefined; }}
            >
              <title>{t('Drag to move text')}</title>
            </rect>
            {selected && (
              <rect
                x={bounds.x + bounds.width - handleSize / 2}
                y={bounds.y + bounds.height - handleSize / 2}
                width={handleSize}
                height={handleSize}
                rx={handleSize / 5}
                fill="#28c9f5"
                stroke="white"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'all', cursor: 'nwse-resize', touchAction: 'none' }}
                onPointerDown={(event) => start(event, image, true)}
                onPointerMove={move}
                onPointerUp={() => { gesture.current = undefined; }}
                onPointerCancel={() => { gesture.current = undefined; }}
              >
                <title>{t('Drag to resize text')}</title>
              </rect>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default memo(TextOverlayPreview);
