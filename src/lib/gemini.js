export const CATEGORIES = [
  'อาหารและเครื่องดื่ม',
  'เดินทาง',
  'ช้อปปิ้ง',
  'สาธารณูปโภค',
  'สุขภาพ',
  'บันเทิง',
  'การศึกษา',
  'อื่นๆ',
];

// ย่อรูปก่อนส่ง เพื่อให้เร็วและประหยัดแพ็กเกจเน็ตมือถือ
async function toBase64(file, maxSize = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1];
}

const today = () => new Date().toISOString().slice(0, 10);

function normalize(raw) {
  let date = String(raw.date || '').trim();
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    let y = Number(m[1]);
    if (y > 2400) y -= 543; // แปลง พ.ศ. เป็น ค.ศ.
    date = `${y}-${m[2]}-${m[3]}`;
  } else {
    date = today();
  }
  const amount = Number(String(raw.total ?? '').replace(/[^0-9.]/g, ''));
  return {
    shop_name: String(raw.shop_name || '').trim(),
    expense_date: date,
    amount: Number.isFinite(amount) && amount > 0 ? amount : '',
    category: CATEGORIES.includes(raw.category) ? raw.category : 'อื่นๆ',
  };
}

export async function extractReceipt({ apiKey, model }, file) {
  const prompt = `อ่านใบเสร็จในรูปนี้ แล้วตอบเป็น JSON เท่านั้น ตามรูปแบบ:
{"shop_name": "ชื่อร้าน", "date": "YYYY-MM-DD (ค.ศ.)", "total": ตัวเลขยอดรวมสุทธิ, "category": "หนึ่งใน: ${CATEGORIES.join(', ')}"}
ถ้าวันที่เป็น พ.ศ. ให้แปลงเป็น ค.ศ. ถ้าอ่านค่าใดไม่ได้ให้ใส่ null`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: await toBase64(file) } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini error ${res.status}`);

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini ไม่ส่งข้อมูลกลับมา ลองถ่ายรูปให้ชัดขึ้น');
  return normalize(JSON.parse(text.replace(/```json|```/g, '').trim()));
}
