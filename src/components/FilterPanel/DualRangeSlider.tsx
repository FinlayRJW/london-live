import { useCallback } from "react";

interface Props {
  min: number;
  max: number;
  step: number;
  valueLow: number;
  valueHigh: number;
  onChangeLow: (value: number) => void;
  onChangeHigh: (value: number) => void;
}

export function DualRangeSlider({
  min,
  max,
  step,
  valueLow,
  valueHigh,
  onChangeLow,
  onChangeHigh,
}: Props) {
  const lowPct = ((valueLow - min) / (max - min)) * 100;
  const highPct = ((valueHigh - min) / (max - min)) * 100;

  const handleLow = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      onChangeLow(Math.min(v, valueHigh - step));
    },
    [onChangeLow, valueHigh, step],
  );

  const handleHigh = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      onChangeHigh(Math.max(v, valueLow + step));
    },
    [onChangeHigh, valueLow, step],
  );

  return (
    <div className="dual-range relative h-5 w-full">
      {/* Track background */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1 rounded-full bg-border" />
      {/* Active range fill */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-primary"
        style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
      />
      {/* Low thumb */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueLow}
        onChange={handleLow}
        className="dual-range-thumb absolute top-0 left-0 w-full h-full pointer-events-none appearance-none bg-transparent"
        style={{ zIndex: valueLow > max - step * 2 ? 5 : 3 }}
      />
      {/* High thumb */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueHigh}
        onChange={handleHigh}
        className="dual-range-thumb absolute top-0 left-0 w-full h-full pointer-events-none appearance-none bg-transparent"
        style={{ zIndex: 4 }}
      />
    </div>
  );
}
