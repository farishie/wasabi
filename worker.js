export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname !== '/api/image') return env.ASSETS.fetch(req);
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    // ตรวจว่าล็อกอิน Supabase จริง (กันคนอื่นมาใช้โควตา)
    const v = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
      headers: { Authorization: req.headers.get('Authorization') || '', apikey: env.SUPABASE_KEY },
    });
    if (!v.ok) return new Response('unauthorized', { status: 401 });

    let text = '';
    try { ({ text } = await req.json()); } catch (e) { return new Response('bad request', { status: 400 }); }
    let scene = String(text || '').slice(0, 600);

    // 1) ให้ AI แปลข้อความไดอารี่ (ไทยหรืออังกฤษ) เป็นคำบรรยายภาพภาษาอังกฤษสั้นๆ
    //    FLUX เข้าใจเฉพาะภาษาอังกฤษ จึงต้องแปลก่อนเสมอ
    let translated = false;
    try {
      const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          {
            role: 'system',
            content:
              'You convert a personal diary entry, which may be written in Thai or English, into ONE short English visual scene description for an illustration. ' +
              'Translate Thai to English first, pick the main moment, mood and objects, and describe what we would SEE (setting, objects, weather, expression). ' +
              'Max 30 words. No people\'s names, no written text or letters in the image. Output only the English description, with no quotes and no explanation.',
          },
          { role: 'user', content: scene },
        ],
        max_tokens: 80,
        temperature: 0.4,
      });
      const t = String((r && r.response) || '').replace(/^["'\s]+|["'\s]+$/g, '');
      if (t && !/[\u0E00-\u0E7F]/.test(t)) { scene = t; translated = true; } // ต้องไม่มีตัวอักษรไทยหลงเหลือ
    } catch (e) {
      console.error('translate error:', e && e.message);
    }
    if (!translated) scene = 'a cozy everyday moment, a diary page, a cup of tea and flowers'; // กันส่งภาษาไทยดิบๆ ให้ FLUX

    const prompt = 'cute hand-drawn line art illustration, soft pastel colors, thin simple outlines, kawaii, whimsical, white background, ' + scene;

    // 2) สร้างภาพด้วย FLUX
    try {
      const out = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt, steps: 4 });
      let body;
      if (out && typeof out.image === 'string') {
        body = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0)); // base64 -> bytes
      } else if (out instanceof ReadableStream || out instanceof ArrayBuffer || out instanceof Uint8Array) {
        body = out; // บางโมเดลคืนไฟล์รูปตรงๆ
      } else {
        return new Response('no image returned', { status: 502 });
      }
      return new Response(body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
    } catch (e) {
      console.error('image error:', e && e.message);
      return new Response('image error: ' + (e && e.message), { status: 500 });
    }
  },
};
