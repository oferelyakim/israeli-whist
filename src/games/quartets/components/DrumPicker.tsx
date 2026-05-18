import { useCallback, useRef, type ReactNode } from 'react';
import './DrumPicker.css';

export interface DrumPickerItem {
  key: string;
  render: ReactNode;
}

interface DrumPickerProps {
  items: DrumPickerItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

const ITEM_HEIGHT = 60;

export function DrumPicker({ items, selectedIndex, onSelect }: DrumPickerProps) {
  const touchStartY = useRef<number | null>(null);
  const accumulatedDelta = useRef(0);

  const clamp = useCallback(
    (idx: number) => Math.max(0, Math.min(items.length - 1, idx)),
    [items.length],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        onSelect(clamp(selectedIndex + 1));
      } else if (e.deltaY < 0) {
        onSelect(clamp(selectedIndex - 1));
      }
    },
    [selectedIndex, onSelect, clamp],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    accumulatedDelta.current = 0;
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const deltaY = touchStartY.current - e.touches[0].clientY;
      accumulatedDelta.current = deltaY;

      if (Math.abs(accumulatedDelta.current) > 25) {
        if (accumulatedDelta.current > 0) {
          onSelect(clamp(selectedIndex + 1));
        } else {
          onSelect(clamp(selectedIndex - 1));
        }
        touchStartY.current = e.touches[0].clientY;
        accumulatedDelta.current = 0;
      }
    },
    [selectedIndex, onSelect, clamp],
  );

  const handleTouchEnd = useCallback(() => {
    touchStartY.current = null;
    accumulatedDelta.current = 0;
  }, []);

  // Render 5 visible slots: -2, -1, 0 (selected), +1, +2
  const getItemClass = (offset: number) => {
    if (offset === 0) return 'drum-item drum-item-active';
    if (Math.abs(offset) === 1) return 'drum-item drum-item-adjacent';
    return 'drum-item drum-item-far';
  };

  const slots: { offset: number; itemIdx: number | null }[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const idx = selectedIndex + offset;
    slots.push({
      offset,
      itemIdx: idx >= 0 && idx < items.length ? idx : null,
    });
  }

  return (
    <div
      className="drum-picker"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="drum-picker-highlight" />
      <div className="drum-picker-viewport">
        {slots.map(({ offset, itemIdx }) => (
          <div
            key={offset}
            className={getItemClass(offset)}
            style={{ height: ITEM_HEIGHT }}
            onClick={
              itemIdx !== null ? () => onSelect(itemIdx) : undefined
            }
          >
            {itemIdx !== null ? items[itemIdx].render : null}
          </div>
        ))}
      </div>
    </div>
  );
}
