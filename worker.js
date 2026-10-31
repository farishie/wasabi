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
    const { text } = await req.json();
    let scene = String(text || '').slice(0, 600);
    try {
      const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'Turn the diary entry into ONE short English visual scene description (max 25 words) for an illustration. No names, no written text in the image. Output only the description.' },
          { role: 'user', content: scene },
        ],
        max_tokens: 60,
      });
      scene = r.response || scene;
    } catch (e) {}
    const prompt = 'cute hand-drawn line art illustration, soft pastel colors, thin simple outlines, kawaii, whimsical, white background, ' + scene;
    const out = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt, steps: 4 });
    const bin = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
    return new Response(bin, { headers: { 'Content-Type': 'image/jpeg' } });
  },
};
