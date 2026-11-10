// Logica 2.1 web patcher: the browser port of tools/logica_patch.py,
// tools/romtool.py (join, split, swap) and the two image-derived patches
// in logica21/patches.py (_title, _logo). The patch data (patch-data.json)
// comes from tools/web_export.py; test/test_web_patcher.py checks that this
// module's output is byte-identical to the Python build.

export const SIZE = 512 * 1024;

// romtool.join: two 16-bit halves (hi = upper word of each long) of the
// A1200/A4000 pair, each file byte-swapped as Logica ships them.
export function join(hi, lo) {
  const img = new Uint8Array(SIZE);
  for (let i = 0; i < SIZE / 2; i += 2) {
    const n = i * 2;
    img[n + 1] = hi[i]; img[n] = hi[i + 1];
    img[n + 3] = lo[i]; img[n + 2] = lo[i + 1];
  }
  return img;
}

// romtool.split: the hi and lo files, each 256 KB written twice (512 KB).
export function split(img) {
  const hi = new Uint8Array(SIZE), lo = new Uint8Array(SIZE);
  for (let i = 0, o = 0; i < SIZE; i += 4, o += 2) {
    hi[o] = img[i + 1]; hi[o + 1] = img[i];
    lo[o] = img[i + 3]; lo[o + 1] = img[i + 2];
  }
  hi.copyWithin(SIZE / 2, 0, SIZE / 2);
  lo.copyWithin(SIZE / 2, 0, SIZE / 2);
  return [hi, lo];
}

export function swap(img) {
  const out = new Uint8Array(img.length);
  for (let i = 0; i + 1 < img.length; i += 2) {
    out[i] = img[i + 1]; out[i + 1] = img[i];
  }
  return out;
}

function hex(b) {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function unhex(s) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

function unbase64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256(b) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", b)));
}

// A file of the pair as given: 512 KB (as Logica ships it) or 256 KB (one
// copy). Returns the 512 KB form, or null.
function full(f) {
  if (f.length === SIZE) return f;
  if (f.length === SIZE / 2) {
    const out = new Uint8Array(SIZE);
    out.set(f); out.set(f, SIZE / 2);
    return out;
  }
  return null;
}

// One merged 512 KB image, as read or byte-swapped.
async function identifyMerged(f, data) {
  for (const [img, how] of [[f, "one merged file, as given"], [swap(f), "one merged file, byte-swapped"]]) {
    if ((await sha256(img)) === data.sha256) return { img, how };
  }
  throw new Error("This file is not a complete Logica THE DIAGNOSTIC 2.0 image. If it is one of the hi/lo EPROM dumps, drop both files together.");
}

// The hi and lo files in either order, each as shipped or byte-swapped.
async function identifyPair(a, b, data) {
  const fa = full(a), fb = full(b);
  if (!fa || !fb) throw new Error("Each file must be 256 KB or 512 KB (a Logica 2.0 hi or lo EPROM).");
  const tries = [];
  for (const [hi, lo, order] of [[fa, fb, "hi/lo pair, as given"], [fb, fa, "hi/lo pair, hi and lo swapped"]]) {
    for (const sw of [false, true]) {
      tries.push([sw ? swap(hi) : hi, sw ? swap(lo) : lo, order + (sw ? ", byte-swapped files" : "")]);
    }
  }
  for (const [hi, lo, how] of tries) {
    const img = join(hi, lo);
    if ((await sha256(img)) === data.sha256) return { img, how };
  }
  throw new Error("These files are not the Logica THE DIAGNOSTIC 2.0 hi/lo pair this patch is made for.");
}

// Find the genuine Logica 2.0 image in the files given: one merged image or
// the hi/lo pair. Returns {img, how} or throws.
export async function identify(files, data) {
  if (files.length === 1) return identifyMerged(files[0], data);
  if (files.length === 2) return identifyPair(files[0], files[1], data);
  throw new Error("Choose one merged 512 KB file, or two files: the hi and the lo EPROM.");
}

function logicaChecksum(img, data) {
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength);
  let sum = 0;
  for (let o = 0; o < data.chk_addr - data.base; o += 4) sum = (sum + dv.getUint32(o)) >>> 0;
  return sum;
}

function indexOf(img, byte, from) {
  for (let i = from; i < img.length; i++) if (img[i] === byte) return i;
  return -1;
}

function bytesEq(a, ai, b) {
  for (let i = 0; i < b.length; i++) if (a[ai + i] !== b[i]) return false;
  return true;
}

// patches.py _title: Logica's title text with "2.0" -> "2.1" and the new line.
function title(img, data, len) {
  const t = data.title, enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const o = t.src - data.base;
  let text = Array.from(img.subarray(o, indexOf(img, 0xfe, o) + 1));
  const from = enc(t.from), to = enc(t.to);
  const hits = [];
  for (let i = 0; i + from.length <= text.length; i++) if (bytesEq(text, i, from)) hits.push(i);
  if (hits.length !== 1) throw new Error("title text: version string not found once");
  text.splice(hits[0], from.length, ...to);
  let end = text.length - 1;                      // drop the FE
  while (end > 0 && text[end - 1] === 0x02) end--;
  const n = text.length - 1 - end;                // the trailing 02s
  if (n < 3) throw new Error("title text: layout not as expected");
  text = [...text.slice(0, end), 0x02, 0x02, ...unhex(t.new_line),
          ...new Array(n - 2).fill(0x02), 0xfe];
  if (text.length > len) throw new Error("title text too long");
  const out = new Uint8Array(len);
  out.set(text);
  return out;
}

function u32(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function be32(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function ilbmChunks(form) {
  if (String.fromCharCode(...form.subarray(0, 4)) !== "FORM" ||
      String.fromCharCode(...form.subarray(8, 12)) !== "ILBM") throw new Error("logo: not an ILBM");
  const end = 8 + u32(form, 4), chunks = [];
  let pos = 12;
  while (pos < end) {
    const n = u32(form, pos + 4);
    chunks.push([String.fromCharCode(...form.subarray(pos, pos + 4)), form.slice(pos + 8, pos + 8 + n)]);
    pos += 8 + n + (n & 1);
  }
  return chunks;
}

function unpackRow(body, pos, n) {
  const row = [];
  while (row.length < n) {
    const c = body[pos++];
    if (c < 128) {
      for (let i = 0; i <= c; i++) row.push(body[pos + i]);
      pos += c + 1;
    } else if (c > 128) {
      for (let i = 0; i < 257 - c; i++) row.push(body[pos]);
      pos += 1;
    }
  }
  if (row.length !== n) throw new Error("logo: bad ByteRun1 row");
  return [row, pos];
}

function packRow(row) {
  const out = [], n = row.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && row[j + 1] === row[i] && j + 1 - i < 128) j++;
    if (j - i >= 2) {                             // run of 3..128
      out.push(257 - (j - i + 1), row[i]);
      i = j + 1;
      continue;
    }
    let k = i;
    while (k < n && k - i < 128 && !(k + 2 < n && row[k] === row[k + 1] && row[k + 1] === row[k + 2])) k++;
    out.push(k - i - 1, ...row.slice(i, k));
    i = k;
  }
  return out;
}

// patches.py _logo: Logica's title logo with "VERSION 2.0" -> "2.1".
function logo(img, data, len) {
  const L = data.logo, o = L.src - data.base;
  const chunks = ilbmChunks(img.subarray(o, o + 8 + u32(img, o + 4)));
  const c = Object.fromEntries(chunks);
  const bm = c.BMHD;
  const w = (bm[0] << 8) | bm[1], h = (bm[2] << 8) | bm[3], planes = bm[8], comp = bm[10];
  if (w !== 640 || h !== 55 || planes !== 4 || comp !== 1) throw new Error("logo: unexpected format");
  const rb = w / 8, rows = [];
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const r = [];
    for (let p = 0; p < planes; p++) {
      const [row, np] = unpackRow(c.BODY, pos, rb);
      r.push(row); pos = np;
    }
    rows.push(r);
  }
  const get = (x, y) => {
    let v = 0;
    for (let p = 0; p < planes; p++) v |= ((rows[y][p][x >> 3] >> (7 - (x & 7))) & 1) << p;
    return v;
  };
  const put = (x, y, v) => {
    for (let p = 0; p < planes; p++) {
      if ((v >> p) & 1) rows[y][p][x >> 3] |= 0x80 >> (x & 7);
      else rows[y][p][x >> 3] &= ~(0x80 >> (x & 7)) & 0xff;
    }
  };
  const [x0, y0, x1, y1] = L.box;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, 0);
  for (const [y, a, b] of L.glyph) {
    for (let x = a; x <= b; x++) {
      const v = get(x, y);
      put(x + L.dx, y + L.dy, v === L.tan ? L.blue : v);
    }
  }
  c.BODY = Uint8Array.from(rows.flatMap((r) => r.flatMap((p) => packRow(p))));
  const enc = (s) => Array.from(s, (ch) => ch.charCodeAt(0));
  const body = [...enc("ILBM")];
  for (const [k] of chunks) {
    const d = c[k];
    body.push(...enc(k), ...be32(d.length), ...d);
    if (d.length & 1) body.push(0);
  }
  const form = [...enc("FORM"), ...be32(body.length), ...body];
  if (form.length > len) throw new Error("logo too large");
  const out = new Uint8Array(len);
  out.set(form);
  return out;
}

// logica_patch.apply on an identified image.
export function apply(img, data) {
  const out = new Uint8Array(img);
  const code = unbase64(data.code);
  const fs = data.free_start - data.base;
  for (let i = fs; i < data.chk_addr - data.base; i++) {
    if (img[i] !== 0) throw new Error("free area is not empty");
  }
  out.set(code, fs);
  for (const p of data.patches) {
    let bytes;
    if (p.kind === "title") bytes = title(img, data, p.len);
    else if (p.kind === "logo") bytes = logo(img, data, p.len);
    else bytes = unhex(p.bytes);
    out.set(bytes, p.addr - data.base);
  }
  const chk = data.chk_addr - data.base;
  out.set(be32(logicaChecksum(out, data)), chk);
  return out;
}

// --- The floppy edition (tools/adf_build.py, `make adf`) ---------------------
//
// data.adf.template is the disk with every byte of Logica's image zeroed
// (gzip). The user's image goes back into Logica.data's data blocks (OFS: a
// 24-byte header and 488 data bytes each), with the floppy patches, and
// those blocks get their checksums again.

async function gunzip(b) {
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export async function floppy(img, data) {
  const a = data.adf;
  const disk = await gunzip(unbase64(a.template));
  const im = img.slice(0, a.image_len);
  for (const p of a.patches) im.set(unhex(p.bytes), p.addr - data.base);
  const blocks = a.blocks.flatMap(([b, n]) => Array.from({ length: n }, (_, i) => b + i));
  const at = (q) => blocks[Math.floor(q / 488)] * 512 + 24 + (q % 488);
  for (let k = 0; k < im.length; k++) disk[at(a.image_off + k)] = im[k];
  const first = Math.floor(a.image_off / 488);
  const last = Math.floor((a.image_off + im.length - 1) / 488);
  const v = new DataView(disk.buffer);
  for (let i = first; i <= last; i++) {
    const o = blocks[i] * 512;
    v.setUint32(o + 20, 0);
    let s = 0;
    for (let j = 0; j < 512; j += 4) s = (s + v.getUint32(o + j)) >>> 0;
    v.setUint32(o + 20, (-s) >>> 0);
  }
  return disk;
}

// The burn set of `make logica21-burn` (build/burn/), plus the floppy
// (`make adf`) when the patch data has it, as {name: bytes}.
export async function build(files, data) {
  const { img, how } = await identify(files, data);
  const rom = apply(img, data);
  const [hi, lo] = split(rom);
  const extra = data.adf ? { "logica-floppy.adf": await floppy(img, data) } : {};
  return {
    how,
    files: {
      ...extra,
      "logica21-a1200-hi-swapped.rom": hi,
      "logica21-a1200-lo-swapped.rom": lo,
      "logica21-a1200-hi.rom": swap(hi),
      "logica21-a1200-lo.rom": swap(lo),
      "logica21-emulator.rom": rom,
      "logica21-16bit.rom": rom,
      "logica21-16bit-swapped.rom": swap(rom),
    },
  };
}

// --- Fit any Amiga ROM image to a physical EPROM or flash chip ---------------
//
// An Amiga ROM chip is 16 bits wide. A bigger chip than the ROM needs (a
// 27C800, or a 27C160 / MX29F1615 in a 42-pin socket) has address lines the
// Amiga does not drive to a known image, so the image is repeated to fill the
// whole chip: whatever level those lines sit at, the chip returns the ROM.

export const CHIPS = {
  "27c400": { size: 512 * 1024, label: "27C400", pins: 40 },
  "27c800": { size: 1024 * 1024, label: "27C800", pins: 42 },
  "27c160": { size: 2048 * 1024, label: "27C160 / MX29F1615", pins: 42 },
};

export const MODELS = {
  a500: { label: "A500 / A600 / A2000", wide: 16 },
  a1200: { label: "A1200 / A4000", wide: 32 },
};

// The byte order of a ROM image, from its first long: 11 1x 4E F9 (a jump,
// as every Kickstart and Logica starts) read as the Amiga sees it, or with
// the bytes of each word swapped.
export function romOrder(img) {
  if (img.length < 4 || (img[0] !== 0x11 && img[1] !== 0x11)) return null;
  if (img[2] === 0x4e && img[3] === 0xf9) return "plain";
  if (img[2] === 0xf9 && img[3] === 0x4e) return "swapped";
  return null;
}

// `part` repeated to fill `size` bytes.
export function fill(part, size) {
  if (size % part.length) throw new Error("the chip size is not a multiple of the image");
  const out = new Uint8Array(size);
  for (let o = 0; o < size; o += part.length) out.set(part, o);
  return out;
}

// One ROM image (256 or 512 KB, plain or byte-swapped) as chip files for a
// model and chip, both byte orders. Returns {order, files: [{name, bytes,
// swapped, chip}]} with "swapped" meaning the order of the burn set above
// (the hi/lo files as Logica ships them, and most programmers' 16-bit order).
export function fitRom(src, model, chip, base) {
  const order = romOrder(src);
  if (!order) throw new Error("This does not look like an Amiga ROM image: it does not start with 11 11 4E F9 or 11 14 4E F9, in either byte order.");
  const img = order === "plain" ? src : swap(src);
  const m = MODELS[model], c = CHIPS[chip];
  if (!m || !c) throw new Error("unknown model or chip");
  base = base || "rom";
  const tag = chip;
  const files = [];
  if (m.wide === 16) {
    if (img.length !== SIZE && img.length !== SIZE / 2) throw new Error("A 16-bit ROM image must be 256 KB or 512 KB.");
    const plain = fill(img, c.size);
    files.push({ name: `${base}-16bit-${tag}-swapped.bin`, bytes: swap(plain), swapped: true, chip: "" },
               { name: `${base}-16bit-${tag}.bin`, bytes: plain, swapped: false, chip: "" });
  } else {
    if (img.length !== SIZE) throw new Error("An A1200 / A4000 ROM image must be 512 KB (the hi and lo halves together).");
    const [hi, lo] = split(img).map((h) => h.subarray(0, SIZE / 2));
    for (const [half, bytes] of [["hi", hi], ["lo", lo]]) {
      const sw = fill(bytes, c.size);
      files.push({ name: `${base}-${half}-${tag}-swapped.bin`, bytes: sw, swapped: true, chip: half },
                 { name: `${base}-${half}-${tag}.bin`, bytes: swap(sw), swapped: false, chip: half });
    }
  }
  return { order, files };
}
