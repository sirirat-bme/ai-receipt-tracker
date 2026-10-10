'use client';
import { useState } from 'react';

export default function ConfigPanel({ config, onSave }) {
  const [form, setForm] = useState(config);
  const [open, setOpen] = useState(!config.geminiKey || !config.supabaseUrl || !config.supabaseKey);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const ready = config.geminiKey && config.supabaseUrl && config.supabaseKey;

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-lg font-bold">ตั้งค่าการเชื่อมต่อ</span>
        <span className={`rounded-full px-3 py-1 text-sm ${ready ? 'bg-brand-soft text-brand-dark' : 'bg-warn/15 text-warn'}`}>
          {ready ? 'พร้อมใช้งาน' : 'ยังกรอกไม่ครบ'}
        </span>
      </button>

      {open && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Gemini API Key</span>
            <input type="password" className="field" value={form.geminiKey} onChange={set('geminiKey')} placeholder="AIza..." autoComplete="off" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">โมเดล Gemini</span>
            <input className="field" value={form.model} onChange={set('model')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Supabase URL</span>
            <input className="field" value={form.supabaseUrl} onChange={set('supabaseUrl')} placeholder="https://xxxx.supabase.co" />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Supabase Anon Key</span>
            <input type="password" className="field" value={form.supabaseKey} onChange={set('supabaseKey')} autoComplete="off" />
          </label>
          <div className="md:col-span-2">
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => { onSave(form); setOpen(false); }}>
              บันทึกการตั้งค่า
            </button>
            <p className="mt-2 text-sm text-ink/60">ค่าเก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น (localStorage)</p>
          </div>
        </div>
      )}
    </section>
  );
}
