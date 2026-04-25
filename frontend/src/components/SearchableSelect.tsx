import { useState, useRef, useEffect, useCallback } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;   // small secondary text shown on the right
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyMessage = 'No results',
}: SearchableSelectProps) {
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const containerRef  = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const listRef       = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sublabel?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  // ── Open / close ──────────────────────────────────────────────────────────
  const openDropdown = () => {
    setQuery('');
    setActiveIdx(0);
    setOpen(true);
  };

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  // Outside-click closes the dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  // Auto-focus the search input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keep the active item visible when navigating with the keyboard
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // Reset activeIdx when filter results change
  useEffect(() => { setActiveIdx(0); }, [query]);

  // ── Select an option ──────────────────────────────────────────────────────
  const select = (opt: SelectOption) => {
    onChange(opt.value);
    closeDropdown();
  };

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === 'Escape') {
      closeDropdown();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIdx]) select(filtered[activeIdx]);
    }
  };

  return (
    <div ref={containerRef} style={s.root} onKeyDown={handleKeyDown}>
      {/* ── Trigger ── */}
      {open ? (
        <div style={s.inputWrap}>
          <input
            ref={inputRef}
            style={s.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter…"
            aria-label="Search"
          />
          <span style={s.chevron}>▲</span>
        </div>
      ) : (
        <button
          type="button"
          style={{
            ...s.trigger,
            color: selectedOption ? 'var(--text-primary)' : 'var(--text-placeholder)',
          }}
          onClick={openDropdown}
          aria-haspopup="listbox"
          aria-expanded={false}
        >
          <span style={s.triggerLabel}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.sublabel && (
            <span style={s.triggerSublabel}>{selectedOption.sublabel}</span>
          )}
          <span style={s.chevron}>▼</span>
        </button>
      )}

      {/* ── Dropdown ── */}
      {open && (
        <ul ref={listRef} style={s.dropdown} role="listbox">
          {filtered.length === 0 ? (
            <li style={s.emptyMsg}>{emptyMessage}</li>
          ) : (
            filtered.map((opt, idx) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                style={{
                  ...s.option,
                  ...(idx === activeIdx ? s.optionActive : {}),
                  ...(opt.value === value ? s.optionSelected : {}),
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent input blur before select fires
                  select(opt);
                }}
              >
                <span style={s.optionLabel}>{opt.label}</span>
                {opt.sublabel && (
                  <span style={s.optionSublabel}>{opt.sublabel}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    width: '100%',
  },

  // Closed trigger button
  trigger: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
    gap: 8,
    minHeight: 41,
  },
  triggerLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  triggerSublabel: {
    fontSize: 11,
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  // Open search input
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--bg-input)',
    border: '1px solid var(--accent)',
    borderRadius: 8,
    padding: '0 14px',
    minHeight: 41,
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: 13,
    padding: '10px 0',
    fontFamily: 'inherit',
  },

  chevron: {
    fontSize: 9,
    color: 'var(--text-faint)',
    flexShrink: 0,
    marginLeft: 4,
    userSelect: 'none',
  },

  // Dropdown list
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    maxHeight: 260,
    overflowY: 'auto',
    zIndex: 100,
    margin: 0,
    padding: '4px 0',
    listStyle: 'none',
  },

  // Dropdown items
  option: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--text-muted)',
    gap: 12,
  },
  optionActive: {
    background: 'var(--bg-hover)',
    color: 'var(--text-primary)',
  },
  optionSelected: {
    color: 'var(--accent-light)',
  },
  optionLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  optionSublabel: {
    fontSize: 11,
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  emptyMsg: {
    padding: '12px 14px',
    color: 'var(--text-placeholder)',
    fontSize: 13,
    fontStyle: 'italic',
  },
};
