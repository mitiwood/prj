import { clsx } from 'clsx';

interface ChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: string;
}

export default function Chip({ label, active, onClick, icon }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap',
        active
          ? 'bg-[var(--acc)] text-white shadow-md'
          : 'bg-[var(--card)] text-[var(--t2)] border border-[var(--border)] hover:border-[var(--acc)]',
      )}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {label}
    </button>
  );
}
