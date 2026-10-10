'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfigPanel from '@/components/ConfigPanel';
import UploadSection from '@/components/UploadSection';
import ExpenseForm from '@/components/ExpenseForm';
import Dashboard from '@/components/Dashboard';
import { getSupabase } from '@/lib/supabase';

const STORAGE_KEY = 'expense-tracker-config';
const DEFAULT_CONFIG = { geminiKey: '', model: 'gemini-1.5-flash', supabaseUrl: '', supabaseKey: '' };

export default function Page() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) setConfig({ ...DEFAULT_CONFIG, ...saved });
    } catch {}
    setLoaded(true);
  }, []);

  const notify = (text, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const saveConfig = (c) => {
    setConfig(c);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    notify('บันทึกการตั้งค่าแล้ว');
  };

  const supabase = useMemo(
    () => (config.supabaseUrl && config.supabaseKey ? getSupabase(config.supabaseUrl, config.supabaseKey) : null),
    [config.supabaseUrl, config.supabaseKey]
  );

  const loadExpenses = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    setLoading(false);
    if (error) return notify(`โหลดประวัติไม่สำเร็จ: ${error.message}`, false);
    setExpenses(data);
  }, [supabase]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      shop_name: draft.shop_name.trim(),
      expense_date: draft.expense_date,
      amount: Number(draft.amount),
      category: draft.category,
    });
    setSaving(false);
    if (error) return notify(`บันทึกไม่สำเร็จ: ${error.message}`, false);
    setDraft(null);
    notify('บันทึกรายจ่ายแล้ว');
    loadExpenses();
  }

  async function handleDelete(id) {
    if (!confirm('ลบรายการนี้?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) return notify(`ลบไม่สำเร็จ: ${error.message}`, false);
    setExpenses((list) => list.filter((e) => e.id !== id));
  }

  if (!loaded) return null;

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:py-10">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">AI Expense &amp; Receipt Tracker</h1>
        <p className="mt-1 text-ink/70">ถ่ายใบเสร็จ ให้ AI อ่านข้อมูล แล้วบันทึกรายจ่ายของคุณ</p>
      </header>

      {toast && (
        <div role="status" className={`fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-lg px-4 py-3 text-white shadow-lg ${toast.ok ? 'bg-brand-dark' : 'bg-red-600'}`}>
          {toast.text}
        </div>
      )}

      <ConfigPanel config={config} onSave={saveConfig} />
      <UploadSection config={config} onResult={setDraft} onError={(m) => notify(m, false)} />
      {draft && (
        <ExpenseForm draft={draft} onChange={setDraft} onSave={handleSave} onCancel={() => setDraft(null)} saving={saving} canSave={!!supabase} />
      )}
      <Dashboard expenses={expenses} loading={loading} onDelete={handleDelete} onRefresh={loadExpenses} />
    </main>
  );
}
