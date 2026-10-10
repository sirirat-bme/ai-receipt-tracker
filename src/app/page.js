'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const CATEGORIES = ['อาหารและเครื่องดื่ม', 'เดินทาง', 'ช้อปปิ้ง', 'สาธารณูปโภค', 'สุขภาพ', 'บันเทิง', 'การศึกษา', 'อื่นๆ'];
const COLORS = ['#0f766e', '#1e293b', '#d97706', '#4f7cc4', '#8b5cf6', '#dc2626', '#65a30d', '#94a3b8'];
const STORAGE_KEY = 'expense-tracker-config';
const DEFAULT_CONFIG = { geminiKey: '', model: 'gemini-2.5-flash', supabaseUrl: '', supabaseKey: '' };

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30';
const primaryCls = 'inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2.5 font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50';
const ghostCls = 'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const cardCls = 'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6';

const baht = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const todayStr = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

// ย่อรูปก่อนส่ง ให้เร็วและประหยัดเน็ต
async function toBase64(file, maxSize = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

function normalize(input) {
  const raw = (Array.isArray(input) ? input[0] : input) || {};
  let date = String(raw.date || '').trim();
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543; // แปลง พ.ศ. เป็น ค.ศ.
    date = `${y}-${m[2]}-${m[3]}`;
  } else {
    date = todayStr();
  }
  const amount = Number(String(raw.total ?? '').replace(/[^0-9.]/g, ''));
  return {
    shop_name: String(raw.shop_name || '').trim(),
    expense_date: date,
    amount: Number.isFinite(amount) && amount > 0 ? amount : '',
    category: CATEGORIES.includes(raw.category) ? raw.category : 'อื่นๆ',
  };
}

async function extractReceipt({ geminiKey, model }, file) {
  const prompt = `อ่านใบเสร็จในรูปนี้ แล้วตอบเป็น JSON เท่านั้น ตามรูปแบบ:
{"shop_name": "ชื่อร้าน", "date": "YYYY-MM-DD (ค.ศ.)", "total": ตัวเลขยอดรวมสุทธิ, "category": "หนึ่งใน: ${CATEGORIES.join(', ')}"}
ถ้าวันที่เป็น พ.ศ. ให้แปลงเป็น ค.ศ. ถ้าอ่านค่าใดไม่ได้ให้ใส่ null`;

  const imageData = await toBase64(file);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey.trim() },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: imageData } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini error ${res.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) throw new Error('Gemini ไม่ส่งข้อมูลกลับมา ลองถ่ายรูปให้ชัดขึ้น');
  return normalize(JSON.parse(text.replace(/```json|```/g, '').trim()));
}

export default function Page() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [form, setForm] = useState(DEFAULT_CONFIG);
  const [openConfig, setOpenConfig] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState(null);
  const [reading, setReading] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const camRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        const c = { ...DEFAULT_CONFIG, ...saved };
        setConfig(c);
        setForm(c);
        if (c.geminiKey && c.supabaseUrl && c.supabaseKey) setOpenConfig(false);
      }
    } catch (e) {}
    setLoaded(true);
  }, []);

  const notify = (text, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const ready = !!(config.geminiKey && config.supabaseUrl && config.supabaseKey);

  const supabase = useMemo(() => {
    if (!config.supabaseUrl || !config.supabaseKey) return null;
    try {
      return createClient(config.supabaseUrl.trim(), config.supabaseKey.trim());
    } catch (e) {
      return null;
    }
  }, [config.supabaseUrl, config.supabaseKey]);

  async function loadExpenses() {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) return notify(`โหลดประวัติไม่สำเร็จ: ${error.message}`, false);
    setExpenses(data);
  }

  useEffect(() => {
    loadExpenses();
  }, [supabase]);

  function saveConfig() {
    setConfig(form);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    setOpenConfig(false);
    notify('บันทึกการตั้งค่าแล้ว');
  }

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!config.geminiKey) return notify('กรุณากรอก Gemini API Key ก่อน', false);
    setPreview(URL.createObjectURL(file));
    setReading(true);
    try {
      setDraft(await extractReceipt(config, file));
    } catch (err) {
      notify(`อ่านใบเสร็จไม่สำเร็จ: ${err.message}`, false);
    } finally {
      setReading(false);
    }
  }

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
    setPreview(null);
    notify('บันทึกรายจ่ายแล้ว');
    loadExpenses();
  }

  async function handleDelete(id) {
    if (!confirm('ลบรายการนี้?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) return notify(`ลบไม่สำเร็จ: ${error.message}`, false);
    setExpenses((list) => list.filter((x) => x.id !== id));
  }

  const { total, rows } = useMemo(() => {
    const map = {};
    expenses.forEach((x) => { map[x.category] = (map[x.category] || 0) + Number(x.amount); });
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    const list = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] }));
    return { total: sum, rows: list };
  }, [expenses]);

  let acc = 0;
  const donut = rows.length
    ? `conic-gradient(${rows.map((r) => { const s = acc; acc += (r.value / total) * 100; return `${r.color} ${s}% ${acc}%`; }).join(', ')})`
    : '#e2e8f0';

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setD = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });
  const draftValid = draft && draft.shop_name.trim() && draft.expense_date && Number(draft.amount) > 0;

  if (!loaded) return null;

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 lg:py-10">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">AI Expense &amp; Receipt Tracker</h1>
        <p className="mt-1 text-slate-600">ถ่ายใบเสร็จ ให้ AI อ่านข้อมูล แล้วบันทึกรายจ่ายของคุณ</p>
      </header>

      {toast && (
        <div role="status" className={`fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-lg px-4 py-3 text-white shadow-lg ${toast.ok ? 'bg-teal-700' : 'bg-red-600'}`}>
          {toast.text}
        </div>
      )}

      <section className={cardCls}>
        <button type="button" onClick={() => setOpenConfig(!openConfig)} className="flex w-full items-center justify-between text-left" aria-expanded={openConfig}>
          <span className="text-lg font-bold">ตั้งค่าการเชื่อมต่อ</span>
          <span className={`rounded-full px-3 py-1 text-sm ${ready ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'}`}>
            {ready ? 'พร้อมใช้งาน' : 'ยังกรอกไม่ครบ'}
          </span>
        </button>
        {openConfig && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium">Gemini API Key</span>
              <input type="password" className={inputCls} value={form.geminiKey} onChange={setF('geminiKey')} placeholder="AIza..." autoComplete="off" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">โมเดล Gemini</span>
              <input className={inputCls} value={form.model} onChange={setF('model')} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Supabase URL</span>
              <input className={inputCls} value={form.supabaseUrl} onChange={setF('supabaseUrl')} placeholder="https://xxxx.supabase.co" />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block text-sm font-medium">Supabase Anon Key</span>
              <input type="password" className={inputCls} value={form.supabaseKey} onChange={setF('supabaseKey')} autoComplete="off" />
            </label>
            <div className="md:col-span-2">
              <button type="button" className={`${primaryCls} w-full sm:w-auto`} onClick={saveConfig}>บันทึกการตั้งค่า</button>
              <p className="mt-2 text-sm text-slate-500">ค่าเก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น</p>
            </div>
          </div>
        )}
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-bold">สแกนใบเสร็จ</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_16rem]">
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <button type="button" className={`${primaryCls} flex-1 py-4`} disabled={reading} onClick={() => camRef.current.click()}>ถ่ายภาพใบเสร็จ</button>
            <button type="button" className={`${ghostCls} flex-1 py-4`} disabled={reading} onClick={() => fileRef.current.click()}>เลือกรูปจากเครื่อง</button>
            {reading && <p className="self-center text-teal-800" role="status">AI กำลังอ่านใบเสร็จ...</p>}
          </div>
          <div className="flex h-48 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 md:h-56">
            {preview ? (
              <img src={preview} alt="ใบเสร็จที่เลือก" className="h-full w-full object-contain" />
            ) : (
              <span className="px-4 text-center text-sm text-slate-500">รูปใบเสร็จจะแสดงที่นี่</span>
            )}
          </div>
        </div>
      </section>

      {draft && (
        <section className={`${cardCls} ring-2 ring-teal-600/40`}>
          <h2 className="text-lg font-bold">ตรวจสอบและแก้ไขก่อนบันทึก</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">ชื่อร้าน</span>
              <input className={inputCls} value={draft.shop_name} onChange={setD('shop_name')} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">วันที่</span>
              <input type="date" className={inputCls} value={draft.expense_date} onChange={setD('expense_date')} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">ยอดเงินรวม (บาท)</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" className={inputCls} value={draft.amount} onChange={setD('amount')} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium">หมวดหมู่</span>
              <select className={inputCls} value={draft.category} onChange={setD('category')}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" className={primaryCls} disabled={!draftValid || saving || !supabase} onClick={handleSave}>
              {saving ? 'กำลังบันทึก...' : 'บันทึกรายจ่าย'}
            </button>
            <button type="button" className={ghostCls} onClick={() => setDraft(null)}>ยกเลิก</button>
          </div>
          {!supabase && <p className="mt-2 text-sm text-amber-700">กรอก Supabase URL และ Anon Key ด้านบนก่อนจึงจะบันทึกได้</p>}
        </section>
      )}

      <section className={cardCls}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">สรุปรายจ่าย</h2>
          <button type="button" className={`${ghostCls} !px-3 !py-1.5 text-sm`} onClick={loadExpenses}>รีเฟรช</button>
        </div>

        {loading && <p className="mt-4 text-slate-500" role="status">กำลังโหลด...</p>}
        {!loading && expenses.length === 0 && <p className="mt-4 text-slate-500">ยังไม่มีรายการ สแกนใบเสร็จใบแรกด้านบนได้เลย</p>}

        {expenses.length > 0 && (
          <>
            <div className="mt-5 grid items-center gap-6 md:grid-cols-[14rem_1fr]">
              <div className="relative mx-auto h-48 w-48 rounded-full" style={{ background: donut }} role="img" aria-label="กราฟวงกลมรายจ่ายตามหมวดหมู่">
                <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white text-center">
                  <span className="text-xs text-slate-500">รวมทั้งหมด</span>
                  <span className="text-lg font-bold">{baht(total)}</span>
                </div>
              </div>
              <ul className="space-y-3">
                {rows.map((r) => (
                  <li key={r.name}>
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: r.color }} />{r.name}</span>
                      <span>{baht(r.value)} ฿ ({Math.round((r.value / total) * 100)}%)</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full" style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-sm text-slate-500">
                    <th className="py-2 pr-3 font-medium">วันที่</th>
                    <th className="py-2 pr-3 font-medium">ร้าน</th>
                    <th className="py-2 pr-3 font-medium">หมวดหมู่</th>
                    <th className="py-2 pr-3 text-right font-medium">ยอดเงิน</th>
                    <th className="py-2"><span className="sr-only">ลบ</span></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((x) => (
                    <tr key={x.id} className="border-b border-slate-100">
                      <td className="whitespace-nowrap py-2.5 pr-3">{thDate(x.expense_date)}</td>
                      <td className="py-2.5 pr-3">{x.shop_name}</td>
                      <td className="py-2.5 pr-3">{x.category}</td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">{baht(x.amount)}</td>
                      <td className="py-2.5 text-right">
                        <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => handleDelete(x.id)}>ลบ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
