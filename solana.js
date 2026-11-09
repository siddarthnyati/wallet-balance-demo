// Minimal Solana helpers for read-only balance checks (no keys, no signing).
// - base58 encode/decode
// - associated token account (ATA) derivation, so a token balance can be read with a plain
//   getAccountInfo call instead of getTokenAccountsByOwner (which free public RPCs block).
// Checked against @solana/web3.js PublicKey.findProgramAddressSync (see README).
(function (root) {
  'use strict';
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const MAP = {}; for (let i = 0; i < ALPHABET.length; i++) MAP[ALPHABET[i]] = BigInt(i);

  function b58decode(s) {
    let n = 0n;
    for (const c of s) { if (!(c in MAP)) throw new Error('bad base58'); n = n * 58n + MAP[c]; }
    const bytes = [];
    while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
    for (const c of s) { if (c === '1') bytes.unshift(0); else break; }
    return Uint8Array.from(bytes);
  }
  function b58encode(bytes) {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) + BigInt(b);
    let out = '';
    while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
    for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
    return out;
  }

  // ed25519 "is this 32-byte string a valid curve point?" (PDAs must NOT be on the curve)
  const P = 2n ** 255n - 19n;
  const mod = (a) => ((a % P) + P) % P;
  function pow(b, e) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = mod(r * b); b = mod(b * b); e >>= 1n; } return r; }
  const D = mod(-121665n * pow(121666n, P - 2n));
  function isOnCurve(bytes) {
    const b = Uint8Array.from(bytes);
    const sign = b[31] >> 7; b[31] &= 0x7f;
    let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) + BigInt(b[i]);
    if (y >= P) return false;
    const y2 = mod(y * y);
    const u = mod(y2 - 1n), v = mod(D * y2 + 1n);
    const x2 = mod(u * pow(v, P - 2n));
    if (x2 === 0n) return sign === 0;
    return pow(x2, (P - 1n) / 2n) === 1n; // x2 must be a square mod P
  }

  async function sha256(parts) {
    const len = parts.reduce((s, p) => s + p.length, 0);
    const buf = new Uint8Array(len); let o = 0;
    for (const p of parts) { buf.set(p, o); o += p.length; }
    return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  }

  const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');
  async function findProgramAddress(seeds, programId) {
    for (let bump = 255; bump >= 0; bump--) {
      const h = await sha256([...seeds, Uint8Array.of(bump), programId, PDA_MARKER]);
      if (!isOnCurve(h)) return b58encode(h);
    }
    throw new Error('no PDA');
  }

  const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  async function associatedTokenAddress(owner, mint, tokenProgram = TOKEN_PROGRAM) {
    return findProgramAddress([b58decode(owner), b58decode(tokenProgram), b58decode(mint)], b58decode(ATA_PROGRAM));
  }

  root.PM_SOL = { b58decode, b58encode, isOnCurve, associatedTokenAddress };
})(typeof window !== 'undefined' ? window : globalThis);
