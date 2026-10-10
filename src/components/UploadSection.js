'use client';
import { useRef, useState } from 'react';
import { extractReceipt } from '@/lib/gemini';

export default function UploadSection({ config, onResult, onError }) {
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handle(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!config.geminiKey) return onError('กรุณากรอก Gemini API Key ก่อน');
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      onResult(await extractReceipt(config, file));
    } catch (err) {
      onError(`อ่านใบเสร็จไม่สำเร็จ: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="text-lg font-bold">สแกนใบเสร็จ</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_16rem]">
        <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handle} />
          <button type="button" className="btn-primary flex-1 py-4" disabled={busy} onClick={() => camRef.current.click()}>
            ถ่ายภาพใบเสร็จ
          </button>
          <button type="button" className="btn-ghost flex-1 py-4" disabled={busy} onClick={() => fileRef.current.click()}>
            เลือกรูปจากเครื่อง
          </button>
          {busy && <p className="self-center text-brand-dark" role="status">AI กำลังอ่านใบเสร็จ...</p>}
        </div>
        <div className="flex h-48 items-center justify-center overflow-hidden rounded-xl bg-mist ring-1 ring-ink/10 md:h-56">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="ใบเสร็จที่เลือก" className="h-full w-full object-contain" />
          ) : (
            <span className="px-4 text-center text-sm text-ink/50">รูปใบเสร็จจะแสดงที่นี่</span>
          )}
        </div>
      </div>
    </section>
  );
}
