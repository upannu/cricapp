"use client";

// Native <input type="date"> renders its text in whatever locale the browser/OS is set to
// (mm/dd/yyyy on a US-locale Chrome, regardless of this page's own <html lang>), which can't be
// overridden from the page itself. This keeps the real native input — so the calendar popup,
// keyboard entry, and underlying yyyy-MM-dd value all still work exactly as before — but hides
// its self-formatted text and overlays a dd/MM/yyyy label driven by the same value instead.
function toDDMMYYYY(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const [y, m, d] = parts;
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export function DateInput({
  value,
  onChange,
  className,
  required,
  min,
  max,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        min={min}
        max={max}
        disabled={disabled}
        className={`${className ?? ""} text-transparent caret-transparent`}
      />
      <span className="absolute inset-0 flex items-center px-4 pr-9 text-sm pointer-events-none">
        {value ? (
          <span className="text-white">{toDDMMYYYY(value)}</span>
        ) : (
          <span className="text-zinc-600">dd/mm/yyyy</span>
        )}
      </span>
    </div>
  );
}
