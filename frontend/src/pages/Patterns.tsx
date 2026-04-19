import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  getPatterns,
  getIndicators,
  createPattern,
  updatePattern,
  deletePattern,
} from '../api/client';
import type { Pattern, Indicator } from '../api/client';
import { useStore } from '../store';
import DslEditor from '../components/DslEditor';

const INTERVALS = [
  { value: 'minute', label: '1 min' },
  { value: '3minute', label: '3 min' },
  { value: '5minute', label: '5 min' },
  { value: '10minute', label: '10 min' },
  { value: '15minute', label: '15 min' },
  { value: '30minute', label: '30 min' },
  { value: '60minute', label: '60 min' },
];

const EMPTY_FORM = { name: '', dsl: '', interval: 'minute' };

export default function Patterns() {
  const { patterns, setPatterns } = useStore((s) => ({
    patterns: s.patterns,
    setPatterns: s.setPatterns,
  }));
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadPatterns = useCallback(async () => {
    try {
      const data = await getPatterns();
      setPatterns(data);
    } catch {
      toast.error('Failed to load patterns');
    }
  }, [setPatterns]);

  useEffect(() => {
    loadPatterns();
    getIndicators()
      .then(setIndicators)
      .catch(() => {});
  }, [loadPatterns]);

  const selectPattern = (p: Pattern) => {
    setSelectedId(p.id);
    setForm({ name: p.name, dsl: p.dsl, interval: p.interval });
  };

  const newPattern = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Pattern name is required');
      return;
    }
    if (!form.dsl.trim()) {
      toast.error('DSL expression is required');
      return;
    }
    setSaving(true);
    try {
      if (selectedId !== null) {
        const updated = await updatePattern(selectedId, {
          name: form.name,
          dsl: form.dsl,
          interval: form.interval,
        });
        setPatterns(patterns.map((p) => (p.id === selectedId ? updated : p)));
        toast.success('Pattern updated');
      } else {
        const created = await createPattern({ ...form, is_active: false });
        setPatterns([...patterns, created]);
        setSelectedId(created.id);
        toast.success('Pattern created');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: Pattern) => {
    try {
      const updated = await updatePattern(p.id, { is_active: !p.is_active });
      setPatterns(patterns.map((pat) => (pat.id === p.id ? updated : pat)));
    } catch {
      toast.error('Failed to toggle pattern');
    }
  };

  const handleDelete = async (p: Pattern, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete pattern "${p.name}"?`)) return;
    try {
      await deletePattern(p.id);
      setPatterns(patterns.filter((pat) => pat.id !== p.id));
      if (selectedId === p.id) newPattern();
      toast.success('Pattern deleted');
    } catch {
      toast.error('Failed to delete pattern');
    }
  };

  return (
    <div style={styles.root}>
      {/* Left panel */}
      <div style={styles.leftPanel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>Patterns</h2>
          <button style={styles.newBtn} onClick={newPattern}>
            + New
          </button>
        </div>

        <div style={styles.list}>
          {patterns.length === 0 && (
            <p style={styles.emptyList}>No patterns yet. Create one →</p>
          )}
          {patterns.map((p) => (
            <div
              key={p.id}
              style={{
                ...styles.patternItem,
                ...(selectedId === p.id ? styles.patternItemActive : {}),
              }}
              onClick={() => selectPattern(p)}
            >
              <div style={styles.patternMeta}>
                <span style={styles.patternName}>{p.name}</span>
                <span style={styles.intervalBadge}>{p.interval}</span>
              </div>
              <div style={styles.patternActions}>
                <button
                  style={{
                    ...styles.toggleBtn,
                    ...(p.is_active ? styles.toggleBtnOn : {}),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleActive(p);
                  }}
                  title={p.is_active ? 'Deactivate' : 'Activate'}
                >
                  {p.is_active ? 'ON' : 'OFF'}
                </button>
                <button
                  style={styles.deleteBtn}
                  onClick={(e) => handleDelete(p, e)}
                  title="Delete pattern"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={styles.rightPanel}>
        <h2 style={styles.formTitle}>
          {selectedId !== null ? 'Edit Pattern' : 'New Pattern'}
        </h2>

        <div style={styles.formGroup}>
          <label style={styles.label}>Name</label>
          <input
            style={styles.input}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Bullish Engulfing"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Interval</label>
          <select
            style={styles.select}
            value={form.interval}
            onChange={(e) => setForm((f) => ({ ...f, interval: e.target.value }))}
          >
            {INTERVALS.map((iv) => (
              <option key={iv.value} value={iv.value}>
                {iv.label}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>DSL Expression</label>
          <DslEditor
            value={form.dsl}
            onChange={(v) => setForm((f) => ({ ...f, dsl: v }))}
            indicators={indicators}
          />
          <p style={styles.dslHint}>
            Use <code>c1</code> (latest), <code>c2</code> (prior), etc. Combined with{' '}
            <code>AND</code> / <code>OR</code>. Comments start with <code>#</code>.
          </p>
        </div>

        <button
          style={{ ...styles.saveBtn, ...(saving ? styles.saveBtnDisabled : {}) }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : selectedId !== null ? 'Update Pattern' : 'Create Pattern'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    gap: 0,
    height: '100%',
    minHeight: '100vh',
  },
  leftPanel: {
    width: 280,
    minWidth: 280,
    borderRight: '1px solid #2a2a3a',
    display: 'flex',
    flexDirection: 'column',
    background: '#111118',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 20px 16px',
    borderBottom: '1px solid #2a2a3a',
  },
  panelTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#e8e8f0',
  },
  newBtn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  emptyList: {
    color: '#4a4a6a',
    fontSize: 13,
    textAlign: 'center',
    padding: '20px',
    margin: 0,
  },
  patternItem: {
    padding: '12px',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 4,
    border: '1px solid transparent',
    transition: 'background 0.12s',
  },
  patternItemActive: {
    background: '#1e1e30',
    border: '1px solid #3730a3',
  },
  patternMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  patternName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#d0d0e8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  intervalBadge: {
    fontSize: 10,
    background: '#1e1e38',
    color: '#7878a8',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid #2a2a4a',
    whiteSpace: 'nowrap',
  },
  patternActions: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  toggleBtn: {
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 4,
    border: '1px solid #3a3a5a',
    background: 'transparent',
    color: '#5a5a7a',
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },
  toggleBtnOn: {
    border: '1px solid #22c55e',
    color: '#22c55e',
  },
  deleteBtn: {
    background: 'transparent',
    border: '1px solid #3a2a2a',
    borderRadius: 4,
    color: '#7a4040',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  rightPanel: {
    flex: 1,
    padding: '28px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    overflowY: 'auto',
  },
  formTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#e8e8f0',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#7878a8',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    background: '#111118',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    color: '#e8e8f0',
    fontSize: 14,
    padding: '10px 14px',
    outline: 'none',
  },
  select: {
    background: '#111118',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    color: '#e8e8f0',
    fontSize: 14,
    padding: '10px 14px',
    outline: 'none',
    cursor: 'pointer',
  },
  dslHint: {
    margin: 0,
    fontSize: 11,
    color: '#5a5a7a',
    lineHeight: 1.6,
  },
  saveBtn: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  saveBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
};
