"use client";

// Native <input type="date"> renders its text in whatever locale the browser/OS is set to
// (mm/dd/yyyy on a US-locale Chrome, regardless of this page's own <html lang>), which can't be
// overridden from the page itself. This keeps the real native input — so the calendar popup,
// keyboard entry, and underlying yyyy-MM-dd value all still work exactly as before — but hides
// its self-formatted text and overlays a dd/MM/yyyy label driven by the same value instead.
// A native date input's value attribute must be exactly yyyy-MM-dd — some rows in this app
// have a full ISO timestamp stored in what's meant to be a date-only field, which the browser
// can't parse, so trim to the date portion defensively rather than trusting the caller's value.
function normalize(value: string): string {
  return value ? value.slice(0, 10) : "";
}

function toDDMMYYYY(isoDate: string): string {
  const parts = isoDate.split("-");
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
  const normalized = normalize(value);
  return (
    <div className="relative">
      <input
        type="date"
        value={normalized}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        min={min}
        max={max}
        disabled={disabled}
        className={className}
        // Inline style guarantees this wins over any text-color utility already in `className` —
        // Tailwind's generated stylesheet order (not class-attribute order) decides ties otherwise.
        style={{ color: "transparent", caretColor: "transparent" }}
      />
      <span className="absolute inset-0 flex items-center px-4 pr-9 text-sm pointer-events-none">
        {normalized ? (
          <span className="text-white">{toDDMMYYYY(normalized)}</span>
        ) : (
          <span className="text-zinc-600">dd/mm/yyyy</span>
        )}
      </span>
    </div>
  );
}
