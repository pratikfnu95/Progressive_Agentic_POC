import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown } from 'lucide-react';

/** Branded, keyboard-friendly select used instead of browser-native menus. */
export function ProgressiveSelect({ label, value, options, placeholder, onChange, required = false, optional = false, error = '', className = '' }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const errorId = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-error`;

  useEffect(() => {
    function dismiss(event) {
      if (event.key === 'Escape') setOpen(false);
      else if (!pickerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, []);

  return <label className={`incident-chat-picker-label progressive-select-field ${className}${error ? ' has-error' : ''}`}>
    <span>{label}{required && <small>Required</small>}{optional && <small>Optional</small>}</span>
    <div className="incident-chat-picker" ref={pickerRef}>
      <button type="button" className={`incident-chat-picker-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox" aria-expanded={open} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
        onClick={() => setOpen((current) => !current)}>
        <span className={value ? '' : 'is-placeholder'}>{value || placeholder}</span><span className="incident-chat-picker-end-icons">{error && <AlertCircle size={15} aria-hidden="true" />}<ChevronDown size={15} /></span>
      </button>
      {open && <div className="incident-chat-picker-menu" role="listbox" aria-label={label}>
        {options.map((option) => <button type="button" role="option" aria-selected={value === option}
          className={value === option ? 'is-selected' : ''} key={option}
          onClick={() => { onChange(option); setOpen(false); }}>
          <span>{option === 'Waiting for Info' ? 'Request more access' : option}</span>{value === option && <Check size={15} />}
        </button>)}
      </div>}
    </div>
    {error && <small className="progressive-select-error" id={errorId}>{error}</small>}
  </label>;
}
