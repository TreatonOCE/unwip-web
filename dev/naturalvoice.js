// Unwip - the optional natural voice for Read aloud (Kokoro). Off until you download it; this file is the
// setup window (with the plain-English disclosure), the list of voices, and the bridge Read aloud speaks through.
window.UnwipVoice = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { api, esc } = U;
  if (!api.voiceStatus) return;
  const VOICES = [['bf_emma', 'Emma', 'British'], ['bf_isabella', 'Isabella', 'British'], ['bm_george', 'George', 'British'], ['bm_fable', 'Fable', 'British'],
    ['af_heart', 'Heart', 'American'], ['af_bella', 'Bella', 'American'], ['am_michael', 'Michael', 'American'], ['am_fenrir', 'Fenrir', 'American']];
  const MB = () => Math.round(((window.UNWIP_KOKORO && UNWIP_KOKORO.TOTAL) || 120e6) / 1e6);
  const phone = () => document.documentElement.classList.contains('m-phone') || /iPhone|iPad|Android/i.test(navigator.userAgent);
  let installed = null;
  async function status() { try { const s = await api.voiceStatus(); installed = !!s.installed; return s; } catch { installed = false; return { installed: false }; } }
  status();

  // the disclosure, word for word the same wherever it appears
  const DISCLOSURE = 'The natural voice is optional and isn’t part of Unwip. It uses Kokoro, a small speech model: machine learning trained on recordings of people reading aloud. It only reads your words out loud. It can’t write, change or suggest anything, and it runs on this device with nothing you write sent anywhere.';
  const SOURCES = 'Downloading it fetches it from its own public homes, not from Unwip: the Kokoro voice model (Apache 2.0, from Hugging Face), kokoro-js and Transformers.js (Apache 2.0), ONNX Runtime (MIT, Microsoft) and eSpeak NG (GPL 3.0, which works out pronunciation), all from the npm and Hugging Face servers. Each file is checked against a known fingerprint before it’s kept, and their own licences apply to them.';

  async function setup() {
    const s = await status();
    const body = document.createElement('div'); body.className = 'nv';
    const draw = () => {
      body.innerHTML = `
        <div class="nv-note"><b>About this voice</b><p>${esc(DISCLOSURE)}</p><p class="nv-small">${esc(SOURCES)}</p></div>
        ${installed ? `<p>✓ The natural voice is on this ${api.web ? 'browser' : 'computer'}. Pick one of its voices in Read aloud’s voice list (🔊, or F8):</p>
            <ul class="nv-voices">${VOICES.map(v => `<li><b>${esc(v[1])}</b> <span>${esc(v[2])}</span> <button type="button" class="link-btn nv-try" data-v="${v[0]}" title="Hear a short sample">▶ Hear</button></li>`).join('')}</ul>
            <p class="nv-small">${phone() ? 'On phones and tablets it can take a few seconds to prepare each sentence, and Unwip prepares ahead while it reads. Your device’s own voice starts straight away.' : 'Unwip prepares the next sentences while it reads, so after the first one it should keep up.'}</p>`
        : `<p>It’s a one-off download of about <b>${MB()} MB</b>. After that it works offline.${phone() ? ' On a phone, use Wi-Fi. It can also take a few seconds to prepare each sentence there, so your device’s own voice may suit better.' : ''}</p>
           <div class="nv-prog hidden"><div class="nv-bar"><i></i></div><span class="nv-pt"></span></div>`}`;
    };
    draw(); hookSamples(body);
    const buttons = installed
      ? [{ label: 'Remove it', value: 'remove', kind: 'ghost danger-text' }, { label: 'Close', value: false, kind: 'primary' }]
      : [{ label: 'Not now', value: false, kind: 'ghost' }, { label: `Download (${MB()} MB)`, value: 'get', kind: 'primary' }];
    let backEl = null, modalDone = null;
    const v = await new Promise(resolve => {
      modalDone = U.modal({ title: 'Natural voice for Read aloud', body, wide: true, buttons, onOpen: b => {
        backEl = b;
        const dl = [...b.querySelectorAll('.m-foot button')].find(x => /^Download/.test(x.textContent));
        if (dl) dl.onclick = e => { e.stopPropagation(); resolve('get'); };   // keep the window open to show progress
      } });
      modalDone.then(resolve);
    });
    if (v === 'remove') {
      if (!(await U.confirmBox('Remove the natural voice?', `Deletes the downloaded voice (about ${MB()} MB) from this ${api.web ? 'browser' : 'computer'}. Read aloud goes back to your device’s own voice. You can download it again any time.`, 'Remove'))) return false;
      await api.voiceRemove(); installed = false; U.toast('Natural voice removed.'); return false;
    }
    if (v !== 'get') return false;
    // downloading, with progress in the same window
    // when it's done (or fails) the window stays open with one Close button, so it can be read at leisure
    const onlyClose = () => { if (!foot) return; foot.querySelectorAll('button').forEach((b, i) => { if (i === 0) { b.disabled = false; b.textContent = 'Close'; b.className = 'btn primary'; } else b.remove(); }); };
    const foot = backEl && backEl.querySelector('.m-foot'), prog = body.querySelector('.nv-prog'), bar = body.querySelector('.nv-bar i'), pt = body.querySelector('.nv-pt');
    if (foot) foot.querySelectorAll('button').forEach(b => { b.disabled = true; });
    if (prog) prog.classList.remove('hidden');
    api.onVoiceProgress && api.onVoiceProgress(p => { if (bar) bar.style.width = (p.done / p.total * 100).toFixed(1) + '%'; if (pt) pt.textContent = `${Math.round(p.done / 1e6)} of ${Math.round(p.total / 1e6)} MB`; });
    try {
      await api.voiceInstall();
      installed = true;
      if (pt) pt.textContent = 'Getting the voice ready…';
      await api.voiceWarm().catch(() => {});
      draw(); hookSamples(body);
      const note = document.createElement('p'); note.className = 'nv-done'; note.textContent = 'Download finished. Try the voices below with ▶ Hear, then close this window.'; body.prepend(note);
      onlyClose();
      await modalDone;
      return true;
    } catch (e) {
      if (prog) prog.classList.add('hidden');
      const note = document.createElement('p'); note.className = 'nv-fail'; note.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') + ' Nothing was changed, so you can try again later.'; body.appendChild(note);
      onlyClose();
      await modalDone;
      return false;
    }
  }

  const speak = (text, voice, speed) => api.voiceSpeak(text, voice, speed);
  // a short sample of a voice, played straight away
  let sampleCtx = null, sampleSrc = null;
  function hookSamples(box) {
    box.querySelectorAll('.nv-try').forEach(b => b.onclick = async () => {
      const was = b.textContent; b.textContent = 'Preparing…'; b.disabled = true;
      try {
        const a = await speak('Hello. This is how I’ll sound reading your chapters aloud.', b.dataset.v, 1);
        sampleCtx = sampleCtx || new (window.AudioContext || window.webkitAudioContext)(); if (sampleCtx.state === 'suspended') await sampleCtx.resume().catch(() => {});
        if (sampleSrc) { try { sampleSrc.stop(); } catch {} }
        const buf = sampleCtx.createBuffer(1, a.audio.length, a.rate); buf.copyToChannel(a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio), 0);
        sampleSrc = sampleCtx.createBufferSource(); sampleSrc.buffer = buf; sampleSrc.connect(sampleCtx.destination); sampleSrc.start();
      } catch (e) { U.toast('Couldn’t play the sample: ' + esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 'warn'); }
      b.textContent = was; b.disabled = false;
    });
  }
  return { VOICES, DISCLOSURE, SOURCES, setup, status, speak, get installed() { return installed; } };
})();
