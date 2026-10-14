// Unwip - makes recorded WebM videos seekable. Browsers (and so Unwip) record video as one open-ended stream: no
// total length and no index of where each moment is, so video players can play it but can't jump around in it.
// This reads the recording once and writes it again with its length, an index (Cues) and a table of contents
// (SeekHead) at the front, like a video editor would. Used by the PC/Mac app (streaming, any size) and in the
// browser (in memory, for timelapses). Never changes a single frame of the video itself.
(function (root) {
  'use strict';
  const ID = { EBML: 0x1A45DFA3, Segment: 0x18538067, SeekHead: 0x114D9B74, Info: 0x1549A966, Tracks: 0x1654AE6B, Cluster: 0x1F43B675,
    Cues: 0x1C53BB6B, Tags: 0x1254C367, Chapters: 0x1043A770, Attachments: 0x1941A469, Void: 0xEC, Timecode: 0xE7, SimpleBlock: 0xA3,
    BlockGroup: 0xA0, Block: 0xA1, TimecodeScale: 0x2AD7B1, Duration: 0x4489 };
  const TOP = new Set([ID.SeekHead, ID.Info, ID.Tracks, ID.Cluster, ID.Cues, ID.Tags, ID.Chapters, ID.Attachments, ID.EBML, ID.Segment]);

  // a reader over the file that keeps a window of it in memory: read(pos, len) -> bytes (async)
  function windowed(readAt, size, win) {
    win = win || (1 << 20); let base = -1, buf = null;
    return {
      size,
      async bytes(pos, len) {
        if (len > win) return readAt(pos, len);
        if (base < 0 || pos < base || pos + len > base + buf.length) { base = pos; buf = await readAt(pos, Math.min(win, size - pos)); }
        return buf.subarray(pos - base, pos - base + len);
      }
    };
  }
  async function readId(r, pos) {
    const b0 = (await r.bytes(pos, 1))[0]; let len = 1, m = 0x80;
    while (len <= 4 && !(b0 & m)) { len++; m >>= 1; }
    if (len > 4) throw new Error('Not a WebM element');
    const b = await r.bytes(pos, len); let v = 0; for (let i = 0; i < len; i++) v = v * 256 + b[i];
    return { id: v, len };
  }
  async function readSize(r, pos) {
    const b0 = (await r.bytes(pos, 1))[0]; let len = 1, m = 0x80;
    while (len <= 8 && !(b0 & m)) { len++; m >>= 1; }
    if (len > 8) throw new Error('Bad size');
    const b = await r.bytes(pos, len); let v = b0 & (m - 1), all = v === m - 1;
    for (let i = 1; i < len; i++) { v = v * 256 + b[i]; if (b[i] !== 255) all = false; }
    return { size: all ? -1 : v, len };
  }
  const uintOf = b => { let v = 0; for (const x of b) v = v * 256 + x; return v; };

  // pass 1: where everything is
  async function scan(r) {
    const head = await readId(r, 0); if (head.id !== ID.EBML) throw new Error('Not a WebM file');
    const hs = await readSize(r, head.len), ebmlEnd = head.len + hs.len + hs.size;
    const seg = await readId(r, ebmlEnd); if (seg.id !== ID.Segment) throw new Error('No segment');
    const ss = await readSize(r, ebmlEnd + seg.len), segData = ebmlEnd + seg.len + ss.len;
    const segEnd = ss.size < 0 ? r.size : Math.min(r.size, segData + ss.size);
    const out = { ebml: [0, ebmlEnd], info: null, tracks: null, clusters: [], scale: 1e6, last: 0, track: 1 };
    let pos = segData;
    while (pos < segEnd) {
      let el; try { el = await readId(r, pos); } catch { break; }
      const sz = await readSize(r, pos + el.len), data = pos + el.len + sz.len;
      if (el.id === ID.Cluster) {
        let end = sz.size < 0 ? null : data + sz.size, j = data, tc = 0, maxRel = 0;
        while (end == null ? j < segEnd : j < end) {
          let c; try { c = await readId(r, j); } catch { break; }
          if (end == null && TOP.has(c.id)) break;                          // the next cluster starts here
          const cs = await readSize(r, j + c.len), cd = j + c.len + cs.len;
          if (cs.size < 0 || cd + cs.size > r.size) { j = r.size; break; } // cut short at the very end: stop there
          if (c.id === ID.Timecode) tc = uintOf(await r.bytes(cd, cs.size));
          else if (c.id === ID.SimpleBlock || c.id === ID.BlockGroup) {
            let bd = cd;
            if (c.id === ID.BlockGroup) { const b = await readId(r, cd); const bs = await readSize(r, cd + b.len); bd = cd + b.len + bs.len; }
            const tn = await readSize(r, bd), t = await r.bytes(bd + tn.len, 2);
            const rel = (t[0] << 24 >> 16) | t[1];                              // signed 16-bit
            if (rel > maxRel) maxRel = rel;
            if (out.clusters.length === 0 && c.id === ID.SimpleBlock) out.track = tn.size;
          }
          j = cd + cs.size;
        }
        if (end == null) end = j;
        out.clusters.push({ start: data, end, tc });
        out.last = Math.max(out.last, tc + maxRel);
        pos = end;
        continue;
      }
      if (sz.size < 0) break;
      if (el.id === ID.Info) {
        out.info = [pos, data + sz.size];
        for (let k = data; k < data + sz.size;) { const c = await readId(r, k), cs = await readSize(r, k + c.len); if (c.id === ID.TimecodeScale) out.scale = uintOf(await r.bytes(k + c.len + cs.len, cs.size)); k += c.len + cs.len + cs.size; }
      } else if (el.id === ID.Tracks) out.tracks = [pos, data + sz.size];
      pos = data + sz.size;
    }
    if (!out.info || !out.tracks || !out.clusters.length) throw new Error('Nothing to fix');
    return out;
  }

  // building blocks
  const idBytes = id => { const b = []; while (id > 0) { b.unshift(id & 255); id = Math.floor(id / 256); } return b; };
  const size8 = n => { const b = [0x01]; for (let i = 6; i >= 0; i--) b.push(Math.floor(n / Math.pow(256, i)) % 256); return b; };
  const uint = (n, len) => { const b = []; for (let i = len - 1; i >= 0; i--) b.push(Math.floor(n / Math.pow(256, i)) % 256); return b; };
  const el = (id, payload) => [...idBytes(id), ...size8(payload.length), ...payload];
  const f64 = x => { const a = new DataView(new ArrayBuffer(8)); a.setFloat64(0, x); return [...new Uint8Array(a.buffer)]; };

  // pass 2 plan: the new front of the file, then each cluster again with its real size
  async function plan(r, s) {
    const ebml = [...await r.bytes(s.ebml[0], s.ebml[1] - s.ebml[0])];
    // Info again, with the length added (and any old one left out)
    const infoKids = [];
    { const [a, b] = s.info; const h = await readId(r, a), hs = await readSize(r, a + h.len);
      for (let k = a + h.len + hs.len; k < b;) { const c = await readId(r, k), cs = await readSize(r, k + c.len), whole = c.len + cs.len + cs.size;
        if (c.id !== ID.Duration) infoKids.push(...await r.bytes(k, whole)); k += whole; } }
    const frame = Math.round(1e9 / 30 / s.scale);   // one frame more at the end
    const info = el(ID.Info, [...infoKids, ...idBytes(ID.Duration), 0x88, ...f64(s.last + frame)]);
    const tracks = [...await r.bytes(s.tracks[0], s.tracks[1] - s.tracks[0])];
    const cuesFor = offs => el(ID.Cues, [].concat(...s.clusters.map((c, i) => el(0xBB, [...el(0xB3, uint(c.tc, 8)), ...el(0xB7, [...el(0xF7, uint(s.track, 1)), ...el(0xF1, uint(offs[i], 8))])]))));
    const seekFor = (pInfo, pTracks, pCues) => el(ID.SeekHead, [ID.Info, ID.Tracks, ID.Cues].map((id, i) => el(0x4DBB, [...el(0x53AB, idBytes(id)), ...el(0x53AC, uint([pInfo, pTracks, pCues][i], 8))])).flat());
    // every number is written at a fixed width, so sizes are known before the positions are
    const seekLen = seekFor(0, 0, 0).length, cuesLen = cuesFor(s.clusters.map(() => 0)).length;
    const pInfo = seekLen, pTracks = pInfo + info.length, pCues = pTracks + tracks.length;
    let p = pCues + cuesLen; const offs = [];
    for (const c of s.clusters) { offs.push(p); p += idBytes(ID.Cluster).length + 8 + (c.end - c.start); }
    const front = [...seekFor(pInfo, pTracks, pCues), ...info, ...tracks, ...cuesFor(offs)];
    const segBody = p;
    const head = Uint8Array.from([...ebml, ...idBytes(ID.Segment), ...size8(segBody), ...front]);
    return { head, clusters: s.clusters.map(c => ({ header: Uint8Array.from([...idBytes(ID.Cluster), ...size8(c.end - c.start)]), start: c.start, end: c.end })), seconds: (s.last * s.scale) / 1e9 };
  }

  // in memory (a timelapse, a short browser recording): bytes in, bytes out
  async function fixBytes(bytes) {
    const r = windowed(async (pos, len) => bytes.subarray(pos, pos + len), bytes.length, bytes.length);
    const p = await plan(r, await scan(r));
    let total = p.head.length; for (const c of p.clusters) total += c.header.length + (c.end - c.start);
    const out = new Uint8Array(total); let o = 0;
    out.set(p.head, o); o += p.head.length;
    for (const c of p.clusters) { out.set(c.header, o); o += c.header.length; out.set(bytes.subarray(c.start, c.end), o); o += c.end - c.start; }
    return out;
  }
  // a file on disk, any size (Node): written beside it, then swapped in; the original stays if anything fails
  async function fixFile(file) {
    const fs = require('fs'), fsp = fs.promises;
    const fh = await fsp.open(file, 'r'), size = (await fh.stat()).size;
    try {
      const r = windowed(async (pos, len) => { const b = Buffer.alloc(len); const { bytesRead } = await fh.read(b, 0, len, pos); return b.subarray(0, bytesRead); }, size, 4 << 20);
      const p = await plan(r, await scan(r));
      const tmp = file + '.fixing', out = await fsp.open(tmp, 'w');
      try {
        await out.write(p.head);
        const chunk = Buffer.alloc(4 << 20);
        for (const c of p.clusters) {
          await out.write(c.header);
          for (let pos = c.start; pos < c.end;) { const n = Math.min(chunk.length, c.end - pos); const { bytesRead } = await fh.read(chunk, 0, n, pos); if (!bytesRead) break; await out.write(chunk.subarray(0, bytesRead)); pos += bytesRead; }
        }
      } finally { await out.close(); }
      await fh.close();
      await fsp.rename(tmp, file);
      return { seconds: p.seconds };
    } catch (e) { try { await fh.close(); } catch {} try { fs.rmSync(file + '.fixing', { force: true }); } catch {} throw e; }
  }
  const api = { fixBytes, fixFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.UnwipWebm = api;
})(typeof window !== 'undefined' ? window : this);
