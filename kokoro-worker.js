// Unwip (web) - the optional natural voice, in a background worker so the page stays smooth. It loads the
// downloaded Kokoro files from this browser's storage and never goes online: anything it asks for on the
// internet is answered from storage, or refused.
const KEY = 'https://unwip.kokoro/';
const MODEL = /^https:\/\/huggingface\.co\/onnx-community\/Kokoro-82M-v1\.0-ONNX\/resolve\/[^/]+\/(.+)$/;
async function file(rel) { const c = await caches.open('unwip-kokoro'); const r = await c.match(KEY + rel); if (!r) throw new Error('Missing ' + rel); return r; }
const real = self.fetch.bind(self);
self.fetch = (u, o) => {
  const url = String((u && u.url) || u), m = url.match(MODEL);
  if (m) return file(m[1]);
  if (url.startsWith(KEY)) return file(url.slice(KEY.length));
  if (/^https?:/i.test(url)) return Promise.reject(new Error('The voice works offline only.'));
  return real(u, o);
};
const blobUrl = async rel => URL.createObjectURL(new Blob([await (await file(rel)).arrayBuffer()], { type: 'text/javascript' }));
let tts = null;
const start = (async () => {
  const mod = await import(await blobUrl('kokoro.web.js'));
  mod.env.wasmPaths = { mjs: await blobUrl('ort-wasm-simd-threaded.jsep.mjs'), wasm: KEY + 'ort-wasm-simd-threaded.jsep.wasm' };
  tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm' });
})();
start.then(() => postMessage({ id: 'ready', threads: false }), e => postMessage({ id: 'ready', error: String((e && e.message) || e) }));
let chain = Promise.resolve();
onmessage = e => {
  const job = e.data;
  chain = chain.then(async () => {
    try { await start; const a = await tts.generate(job.text, { voice: job.voice || 'bf_emma', speed: job.speed || 1 }); postMessage({ id: job.id, audio: a.audio, rate: a.sampling_rate }, [a.audio.buffer]); }
    catch (err) { postMessage({ id: job.id, error: String((err && err.message) || err) }); }
  });
};
