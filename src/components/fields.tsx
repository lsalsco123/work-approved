"use client";
import React from "react";

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="fld">
      <span className="fld-label">{label}{hint && <em className="fld-hint">{hint}</em>}</span>
      <span className="fld-control">{children}</span>
    </label>
  );
}

export function Text({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return <input className="inp" type={type} value={value} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)} />;
}

export function Area({ value, onChange, rows = 3, placeholder }: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return <textarea className="inp" rows={rows} value={value} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)} />;
}

export function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="sec">
      <button type="button" className="sec-head" onClick={() => setOpen((o) => !o)}>
        <span className={`chev ${open ? "open" : ""}`}>▶</span> {title}
      </button>
      {open && <div className="sec-body">{children}</div>}
    </section>
  );
}

export function CheckGroup({ options, selected, onToggle, cols = 2 }: {
  options: { v: string; label?: string }[]; selected: string[]; onToggle: (v: string) => void; cols?: number;
}) {
  return (
    <div className="chkgrid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map((o) => (
        <label key={o.v} className={`chk ${selected.includes(o.v) ? "on" : ""}`}>
          <input type="checkbox" checked={selected.includes(o.v)} onChange={() => onToggle(o.v)} />
          <span>{o.label ?? o.v}</span>
        </label>
      ))}
    </div>
  );
}

export function RadioGroup<T extends string>({ options, value, onChange }: {
  options: { v: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="radiorow">
      {options.map((o) => (
        <label key={o.v} className={`chk ${value === o.v ? "on" : ""}`}>
          <input type="radio" checked={value === o.v} onChange={() => onChange(o.v)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
