import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const CATEGORIES = ['อาหารและเครื่องดื่ม', 'เดินทาง', 'ช้อปปิ้ง', 'สาธารณูปโภค', 'สุขภาพ', 'บันเทิง', 'การศึกษา', 'อื่นๆ'];

const PROMPT = `อ่านใบเสร็จในรูปนี้ แล้วตอบเป็น JSON เท่านั้น ตามรูปแบบ:
{"shop_name": "ชื่อร้าน", "date": "YYYY-MM-DD (ค.ศ.)", "total": ตัวเลขยอดรวมสุทธิ, "category": "หนึ่งใน: ${CATEGORIES.join(', ')}"}
ถ้าวันที่เป็น พ.ศ. ให้แปลงเป็น ค.ศ. ถ้าอ่านค่าใดไม่ได้ให้ใส่ null`;

const fail = (error, status) => NextResponse.json({ error }, { status });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = [429, 500, 502, 503, 504];

async function callGemini(apiKey, model, image) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function POST(req) {
  const apiKey = process.env.GEMINI_API_KEY;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!apiKey || !supaUrl || !supaKey) {
    return fail('เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า GEMINI_API_KEY หรือ Supabase', 500);
  }

  // ต้องล็อกอินก่อนจึงจะใช้โควต้า Gemini ของเซิร์ฟเวอร์ได้
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail('กรุณาเข้าสู่ระบบก่อน', 401);
  const supabase = createClient(supaUrl, supaKey);
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth?.user) return fail('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);

  let image;
  try {
    ({ image } = await req.json());
  } catch (e) {
    return fail('คำขอไม่ถูกต้อง', 400);
  }
  if (!image || typeof image !== 'string') return fail('ไม่พบรูปภาพ', 400);
  if (image.length > 4_000_000) return fail('รูปใหญ่เกินไป', 413);

  // โมเดลหลัก + โมเดลสำรอง (ตั้ง GEMINI_FALLBACK_MODEL ใน Vercel ถ้าต้องการ)
  const models = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', process.env.GEMINI_FALLBACK_MODEL]
    .filter(Boolean)
    .filter((m, i, arr) => arr.indexOf(m) === i);

  let last = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(1500 * attempt);
      const r = await callGemini(apiKey, model, image);
      if (r.res.ok) {
        const text = r.data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
        if (!text) return fail('AI ไม่ส่งข้อมูลกลับมา ลองถ่ายรูปให้ชัดขึ้น', 502);
        return NextResponse.json({ text });
      }
      last = r;
      if (r.res.status === 404) break; // ไม่พบโมเดลนี้ ลองตัวสำรอง
      if (!RETRYABLE.includes(r.res.status)) {
        return fail(r.data?.error?.message || `Gemini error ${r.res.status}`, 502);
      }
    }
  }

  if (last && last.res.status === 429) {
    return fail('โควต้า AI วันนี้เต็มแล้ว กรุณาลองใหม่ภายหลัง', 429);
  }
  if (last && RETRYABLE.includes(last.res.status)) {
    return fail('ระบบ AI กำลังมีผู้ใช้งานหนาแน่น กรุณากดสแกนใหม่อีกครั้งในครู่เดียว', 503);
  }
  return fail(last?.data?.error?.message || 'เรียก AI ไม่สำเร็จ', 502);
}
