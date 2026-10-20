import { useEffect, useRef, useState } from 'react';

const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
function todayInVietnam() { return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); }
function monthInVietnam() { return todayInVietnam().slice(0, 7); }

export function DatePicker({ id, label, value, min, max, disabled, onChange }: { id: string; label: string; value: string; min?: string; max?: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => value.slice(0, 7) || monthInVietnam());
  const rootRef = useRef<HTMLDivElement>(null);
  const shownMonth = open ? visibleMonth : value.slice(0, 7) || visibleMonth;
  const [yearText, monthText] = shownMonth.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDayOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = todayInVietnam();
  const displayValue = value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : 'Chọn ngày';

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    setVisibleMonth(date.toISOString().slice(0, 7));
  }
  function choose(date: string) { onChange(date); setOpen(false); }

  return <div className="app-date-picker" ref={rootRef}>
    <span className="app-date-picker-label">{label}</span>
    <button id={id} type="button" className="app-date-picker-trigger" aria-label={`${label}: ${displayValue}`} aria-expanded={open} aria-haspopup="dialog" disabled={disabled} onClick={() => { setVisibleMonth(value.slice(0, 7) || monthInVietnam()); setOpen((current) => !current); }}>
      <span>{displayValue}</span><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="5" width="14" height="12" rx="2" /><path d="M6 3v4M14 3v4M3 9h14" /></svg>
    </button>
    {open && <div className="app-date-picker-popover" role="dialog" aria-label={`Chọn ${label.toLocaleLowerCase('vi-VN')}`}>
      <div className="app-date-picker-heading"><button type="button" aria-label="Tháng trước" onClick={() => shiftMonth(-1)}>‹</button><strong>{new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button type="button" aria-label="Tháng sau" onClick={() => shiftMonth(1)}>›</button></div>
      <div className="app-date-picker-grid">
        {weekDays.map((day) => <span key={day}>{day}</span>)}
        {Array.from({ length: firstDayOffset }, (_, index) => <span aria-hidden="true" key={`empty-${index}`} />)}
        {Array.from({ length: dayCount }, (_, index) => {
          const date = `${shownMonth}-${String(index + 1).padStart(2, '0')}`;
          return <button type="button" key={date} aria-label={new Date(`${date}T00:00:00Z`).toLocaleDateString('vi-VN', { dateStyle: 'full', timeZone: 'UTC' })} aria-pressed={date === value} aria-current={date === today ? 'date' : undefined} disabled={Boolean((min && date < min) || (max && date > max))} onClick={() => choose(date)}>{index + 1}</button>;
        })}
      </div>
      <div className="app-date-picker-footer"><button type="button" disabled={Boolean((min && today < min) || (max && today > max))} onClick={() => choose(today)}>Hôm nay</button><button type="button" onClick={() => setOpen(false)}>Đóng</button></div>
    </div>}
  </div>;
}
