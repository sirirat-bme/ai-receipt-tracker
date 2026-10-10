import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const CATEGORIES = ['อาหารและเครื่องดื่ม', 'เดินทาง', 'ช้อปปิ้ง', 'สาธารณูปโภค', 'สุขภาพ', 'บันเทิง', 'การศึกษา', 'อื่นๆ'];

const PROMPT = `อ่านใบเสร็จในรูปนี้ แล้วตอบเป็น JSON เท่านั้น ตามรูปแบบ:
{"shop_name": "ชื่อร้าน", "date": "YYYY-MM-DD (ค.ศ.)", "total": ตัวเลขยอดรวมสุทธิ, "category": "หนึ่งใน: ${CATEGORIES.join(', ')}"}
ถ้าวันที่เป็น พ.ศ. ให้แปลงเป็น ค.ศ. ถ้าอ่านค่าใดไม่ได้ให้ใส่ null`;

const fail = (error, status) => NextResponse.json({ error }, { status });

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

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return fail(data?.error?.message || `Gemini error ${res.status}`, 502);

  const text = data?.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
  if (!text) return fail('Gemini ไม่ส่งข้อมูลกลับมา ลองถ่ายรูปให้ชัดขึ้น', 502);
  return NextResponse.json({ text });
}
