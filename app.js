// Portfolio Move — balance checker. Read-only by construction. Multi-wallet, multi-ecosystem (EVM, Solana, Bitcoin).
(() => {
  'use strict';
  const CFG = window.PM_CONFIG;
  const SOL = window.PM_SOL;
  const $ = (id) => document.getElementById(id);
  const kindOf = (chain) => chain.type || 'evm';
  const KIND_LABEL = { evm: 'EVM', solana: 'Solana', bitcoin: 'Bitcoin' };
  // "4 major coins" summary: which assets roll up into which coin.
  const MAJOR = { ETH: 'ETH', WETH: 'ETH', BTC: 'BTC', WBTC: 'BTC', SOL: 'SOL', USDC: 'USDC' };
  const MAJOR_ORDER = [
    { k: 'BTC', note: 'incl. WBTC' }, { k: 'ETH', note: 'incl. WETH' }, { k: 'SOL', note: '' }, { k: 'USDC', note: 'all chains' },
  ];

  // ---------- 1. Wallet access: hard allowlists ----------
  // The ONLY wallet calls this page can make. All are "share your account address" requests.
  // Anything else (signing, sending, approvals, chain switching) throws before reaching the wallet.
  const ALLOWED_EVM_METHODS = new Set(['eth_requestAccounts', 'eth_accounts']);
  const ALLOWED_WS_FEATURES = new Set(['standard:connect', 'bitcoin:connect']);

  async function evmRequest(g, method, quiet = false) {
    if (!ALLOWED_EVM_METHODS.has(method)) {
      log('blocked', `${g.name}: ${method} (not on the read-only allowlist)`);
      throw new Error(`Blocked: ${method} is not allowed on this read-only page.`);
    }
    if (!quiet) log('wallet', `${g.name} (EVM): ${method}`);
    return g.evm.request({ method });
  }

  async function wsConnect(g, kind) {
    const w = kind === 'solana' ? g.solana : g.bitcoin;
    const feature = kind === 'solana' ? 'standard:connect' : 'bitcoin:connect';
    if (!ALLOWED_WS_FEATURES.has(feature) || !w?.features?.[feature]) throw new Error(`${feature} not available`);
    log('wallet', `${g.name} (${KIND_LABEL[kind]}): ${feature}`);
    const f = w.features[feature];
    const call = kind === 'bitcoin' ? f.connect({ purposes: ['payment'] }) : f.connect();
    // Like eth_requestAccounts, some wallets leave connect() pending after approval. The Wallet Standard
    // `accounts` property is updated once the user approves, so watch it too (a property read, no request).
    let poll = null;
    const viaProperty = new Promise((resolve) => {
      poll = setInterval(() => { if (w.accounts?.length) resolve({ accounts: w.accounts }); }, 1500);
    });
    try {
      const res = await Promise.race([call, viaProperty]);
      const accts = (res?.accounts?.length ? res.accounts : w.accounts) || [];
      const addrs = accts.map((a) => a.address).filter((a) => detectKind(a)?.kind === kind);
      return [...new Set(addrs.map((a) => detectKind(a).address))];
    } finally { clearInterval(poll); }
  }

  // ---------- 2. Wallet discovery ----------
  // EVM side: EIP-6963. Solana / Bitcoin side: Wallet Standard. Both are grouped by wallet name, so
  // "MetaMask" becomes one button that connects its EVM, Solana and Bitcoin accounts.
  const groups = new Map(); // lower-case name -> { key, name, icon, evm, solana, bitcoin, state }
  const safeIcon = (i) => (typeof i === 'string' && i.startsWith('data:image/') ? i : '');
  function group(name, icon) {
    const key = String(name || 'Wallet').trim().toLowerCase();
    let g = groups.get(key);
    if (!g) { g = { key, name: String(name || 'Wallet').trim(), icon: '', evm: null, solana: null, bitcoin: null, state: 'idle' }; groups.set(key, g); }
    if (!g.icon && icon) g.icon = icon;
    return g;
  }

  window.addEventListener('eip6963:announceProvider', (e) => {
    const d = e.detail;
    if (!d?.info?.name || !d.provider) return;
    const g = group(d.info.name, safeIcon(d.info.icon));
    if (!g.evm) g.evm = d.provider;
    renderWalletButtons();
  });

  function registerWs(...ws) {
    for (const w of ws) {
      try {
        const feats = Object.keys(w.features || {});
        const chains = w.chains || [];
        const g = group(w.name, safeIcon(w.icon));
        if (!g.solana && feats.includes('standard:connect') && chains.some((c) => c.startsWith('solana:'))) g.solana = w;
        if (!g.bitcoin && feats.includes('bitcoin:connect') && chains.some((c) => c.startsWith('bitcoin:'))) g.bitcoin = w;
      } catch (_) { /* ignore a malformed wallet */ }
    }
    renderWalletButtons();
    return () => {};
  }
  window.addEventListener('wallet-standard:register-wallet', (e) => { try { e.detail({ register: registerWs }); } catch (_) { /* ignore */ } });

  // Wallets that only expose window.ethereum.
  setTimeout(() => {
    const eth = window.ethereum;
    const legacy = eth?.providers?.length ? eth.providers : eth ? [eth] : [];
    for (const p of legacy) {
      if (p.isMetaMask && !p.isCoinbaseWallet) { const g = group('MetaMask'); if (!g.evm) g.evm = p; }
    }
    renderWalletButtons();
  }, 600);

  function renderWalletButtons() {
    const box = $('walletButtons');
    if (!box) return;
    // This demo is built around MetaMask, so other wallets the browser announces aren't offered.
    const list = [...groups.values()].filter((g) => g.key === 'metamask' && (g.evm || g.solana || g.bitcoin));
    const html = list.map((g) => {
      const eco = [g.evm && 'EVM', g.solana && 'Solana', g.bitcoin && 'Bitcoin'].filter(Boolean).join(' · ');
      const img = g.icon ? `<img src="${esc(g.icon)}" alt="" width="18" height="18">` : '';
      const label = g.state === 'connecting' ? `Approve in ${esc(g.name)}…` : g.state === 'connected' ? `${esc(g.name)} connected` : `Connect ${esc(g.name)}`;
      return `<button class="primary wbtn" data-key="${esc(g.key)}" ${g.state !== 'idle' ? 'disabled' : ''}>${img}<span>${label}<small>${esc(eco)}</small></span></button>`;
    });
    if (!list.length) html.unshift('<span class="hint">MetaMask not found. Open this page in desktop Chrome with MetaMask installed, or add a public address below.</span>');
    box.innerHTML = html.join('');
    box.querySelectorAll('.wbtn').forEach((b) => b.addEventListener('click', () => connectGroup(groups.get(b.dataset.key))));
  }

  // ---------- 3. Address formats ----------
  function detectKind(raw) {
    const v = String(raw || '').trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) return { kind: 'evm', address: v };
    const lv = v.toLowerCase();
    if (/^bc1[02-9ac-hj-np-z]{11,87}$/.test(lv) && (v === lv || v === v.toUpperCase())) return { kind: 'bitcoin', address: lv };
    if (/^[1-9A-HJ-NP-Za-km-z]{25,44}$/.test(v)) {
      try {
        const n = SOL.b58decode(v).length;
        if (n === 32) return { kind: 'solana', address: v };
        if (n === 25 && /^[13]/.test(v)) return { kind: 'bitcoin', address: v };
      } catch (_) { /* not base58 */ }
    }
    return null;
  }

  // ---------- 4. Sources (one per address) ----------
  const sources = []; // { key, label, kind, address }
  const scans = new Map(); // source key -> { chainStates, at, ms }

  function addSource(src) {
    const dup = sources.find((s) => s.address === src.address);
    if (dup) { log('input', `${shortAddr(src.address)} is already in the portfolio (${dup.label})`); return null; }
    sources.push(src);
    renderSources();
    return src;
  }
  function removeSource(key) {
    const i = sources.findIndex((s) => s.key === key);
    if (i < 0) return;
    log('input', `removed ${sources[i].label} ${shortAddr(sources[i].address)} from this view`);
    sources.splice(i, 1); scans.delete(key);
    renderSources(); render();
  }
  function renderSources() {
    const box = $('sources');
    if (!sources.length) { box.innerHTML = '<span class="muted small">Nothing connected yet.</span>'; return; }
    box.innerHTML = sources.map((s) => {
      const sc = scans.get(s.key);
      const sub = sc ? subtotalText(sc) : '· reading…';
      return `<span class="chip"><b>${esc(s.label)}</b> <span class="tag">${KIND_LABEL[s.kind]}</span> <span class="addr">${esc(shortAddr(s.address))}</span> <span class="muted">${esc(sub)}</span>
        <button class="x" data-key="${esc(s.key)}" title="Remove from this view (doesn't disconnect the wallet)">×</button></span>`;
    }).join('');
    box.querySelectorAll('.x').forEach((b) => b.addEventListener('click', () => removeSource(b.dataset.key)));
  }
  function subtotalText(sc) {
    const held = sc.chainStates.flatMap((c) => c.items).filter((x) => x.raw != null && x.raw > 0n);
    if (!held.length) return '· nothing held';
    if (!lastPrices) return `· ${held.length} holding(s)`;
    return `· ${usd(held.reduce((s, x) => s + valueOf(x), 0))}`;
  }

  // ---------- 5. Activity log ----------
  function log(kind, text) {
    const li = document.createElement('li');
    const t = new Date().toLocaleTimeString([], { hour12: false });
    li.textContent = `${t}  ${kind.padEnd(7)} ${text}`;
    $('log').appendChild(li);
    $('log').scrollTop = $('log').scrollHeight;
  }

  // ---------- 5b. Loading steps (what the page is doing, shown live) ----------
  function loadStart(title) {
    $('loading').classList.remove('hidden');
    $('loadDetails').open = true;
    $('loadSpin').classList.remove('done');
    $('loadTitle').textContent = title;
    $('loadSteps').innerHTML = '';
  }
  function step(text, sub = '') {
    const li = document.createElement('li');
    li.innerHTML = `<span class="st pending"></span><span class="t"></span><span class="ms"></span>`;
    li._t0 = performance.now();
    setStep(li, text, sub);
    $('loadSteps').appendChild(li);
    return li;
  }
  function setStep(li, text, sub = '') {
    li.querySelector('.t').innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
  }
  function stepEnd(li, ok, text, sub) {
    li.querySelector('.st').className = `st ${ok ? 'ok' : 'err'}`;
    if (text) setStep(li, text, sub);
    li.querySelector('.ms').textContent = `${((performance.now() - li._t0) / 1000).toFixed(1)} s`;
  }
  function loadFinish(title) {
    $('loadSpin').classList.add('done');
    $('loadTitle').textContent = title;
    $('loadDetails').open = false;
  }

  // ---------- 6. Reads (public nodes / APIs only) ----------
  const TIMEOUT_MS = 8000;
  let rpcId = 1;
  async function fetchT(url, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } finally { clearTimeout(timer); }
  }
  async function rpcOnce(url, method, params) {
    const res = await fetchT(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }) });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'RPC error');
    if (!('result' in j)) throw new Error('Bad RPC result');
    return j.result;
  }
  // Tries the chain's endpoints in order, starting with the last one that worked.
  async function withFallback(st, list, label, fn) {
    let lastErr;
    for (let i = 0; i < list.length; i++) {
      const idx = (st.epIdx + i) % list.length;
      try { const r = await fn(list[idx]); st.epIdx = idx; st.calls[label] = (st.calls[label] || 0) + 1; return r; }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('All endpoints failed');
  }
  const rpc = (st, method, params) => withFallback(st, st.chain.rpcs, method, (u) => rpcOnce(u, method, params));
  const endpointHost = (st) => new URL((st.chain.rpcs || st.chain.apis)[st.epIdx]).host;

  const balanceOfData = (addr) => '0x70a08231' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const mkItem = (src, chain, asset, isNative, raw, error = false) => ({ src, chain, asset, isNative, raw, error });

  function failAll(st, why) {
    st.error = why;
    st.items = [mkItem(st.src, st.chain, st.chain.native, true, null, true), ...st.chain.tokens.map((t) => mkItem(st.src, st.chain, t, false, null, true))];
  }

  async function scanEvm(st) {
    const { chain, src } = st;
    st.block = parseInt(await rpc(st, 'eth_blockNumber', []), 16);
    st.items = await Promise.all([
      rpc(st, 'eth_getBalance', [src.address, 'latest']).then((r) => mkItem(src, chain, chain.native, true, BigInt(r)))
        .catch(() => mkItem(src, chain, chain.native, true, null, true)),
      ...chain.tokens.map((t) => rpc(st, 'eth_call', [{ to: t.address, data: balanceOfData(src.address) }, 'latest'])
        .then((r) => (r === '0x' ? mkItem(src, chain, t, false, null, true) : mkItem(src, chain, t, false, BigInt(r))))
        .catch(() => mkItem(src, chain, t, false, null, true))),
    ]);
  }

  async function scanSolana(st) {
    const { chain, src } = st;
    st.block = await rpc(st, 'getSlot', []);
    st.items = await Promise.all([
      rpc(st, 'getBalance', [src.address]).then((r) => mkItem(src, chain, chain.native, true, BigInt(r.value)))
        .catch(() => mkItem(src, chain, chain.native, true, null, true)),
      // Token balance = the wallet's associated token account for that mint (derived locally, read with getAccountInfo).
      ...chain.tokens.map(async (t) => {
        try {
          const ata = await SOL.associatedTokenAddress(src.address, t.mint);
          const r = await rpc(st, 'getAccountInfo', [ata, { encoding: 'jsonParsed' }]);
          const amt = r?.value?.data?.parsed?.info?.tokenAmount?.amount;
          return mkItem(src, chain, t, false, r?.value ? BigInt(amt) : 0n);
        } catch (_) { return mkItem(src, chain, t, false, null, true); }
      }),
    ]);
  }

  async function scanBitcoin(st) {
    const { chain, src } = st;
    st.block = await withFallback(st, chain.apis, 'tip-height', async (api) => parseInt(await (await fetchT(`${api}/blocks/tip/height`)).text(), 10));
    try {
      const j = await withFallback(st, chain.apis, 'address', async (api) => (await fetchT(`${api}/address/${encodeURIComponent(src.address)}`)).json());
      const c = j.chain_stats, m = j.mempool_stats;
      const sats = BigInt(c.funded_txo_sum - c.spent_txo_sum + m.funded_txo_sum - m.spent_txo_sum);
      st.items = [mkItem(src, chain, chain.native, true, sats)];
    } catch (_) { st.items = [mkItem(src, chain, chain.native, true, null, true)]; }
  }

  const WHAT = {
    evm: (c) => `${c.native.symbol} + ${c.tokens.length} tokens · eth_getBalance, balanceOf`,
    solana: (c) => `SOL, ${c.tokens.map((t) => t.symbol).join(', ')} · getBalance, getAccountInfo`,
    bitcoin: () => 'BTC · address lookup on mempool.space',
  };
  async function scanChain(chain, src) {
    const st = { chain, src, epIdx: 0, calls: {}, ok: false, block: null, error: null, items: [], ms: null };
    const chainT0 = performance.now();
    const li = step(`${chain.name}: reading ${shortAddr(src.address)}`, WHAT[kindOf(chain)](chain));
    try {
      const k = kindOf(chain);
      if (k === 'evm') await scanEvm(st); else if (k === 'solana') await scanSolana(st); else await scanBitcoin(st);
      st.ok = st.items.some((x) => !x.error);
      if (!st.ok) st.error = 'every read failed';
    } catch (e) {
      failAll(st, `couldn’t reach any of ${(chain.rpcs || chain.apis).length} public endpoints`);
    }
    st.ms = Math.round(performance.now() - chainT0);
    const parts = Object.entries(st.calls).map(([m, n]) => `${m}×${n}`).join(', ');
    log(kindOf(chain) === 'bitcoin' ? 'http' : 'rpc', `${src.label} · ${chain.name}${st.ok ? ` via ${endpointHost(st)}` : ''}: ${parts || '-'}${st.error ? ` (${st.error})` : ''}`);
    const got = st.items.filter((x) => x.raw != null && x.raw > 0n).map((x) => `${fmtNum(amountOf(x))} ${x.asset.symbol}`);
    const unit = kindOf(chain) === 'solana' ? 'slot' : 'block';
    stepEnd(li, st.ok, `${chain.name}: ${st.ok ? (got.length ? `found ${got.join(', ')}` : 'nothing held') : 'couldn’t read'}`,
      st.ok ? `${unit} ${Number(st.block).toLocaleString()} via ${endpointHost(st)}` : st.error);
    return st;
  }

  // ---------- 7. Prices ----------
  let lastPrices = null, pricesAt = null;
  async function getPrices() {
    const ids = new Set();
    CFG.chains.forEach((c) => { ids.add(c.native.price); c.tokens.forEach((t) => ids.add(t.price)); });
    try {
      const res = await fetchT(`${CFG.priceApi}?ids=${[...ids].join(',')}&vs_currencies=usd`);
      const j = await res.json();
      log('http', `api.coingecko.com simple/price (${ids.size} ids), no wallet data sent`);
      const out = {};
      for (const [k, v] of Object.entries(j)) if (typeof v?.usd === 'number') out[k] = v.usd;
      return out;
    } catch (e) { log('http', `api.coingecko.com failed: ${e.message}`); return null; }
  }

  // ---------- 8. Formatting ----------
  function formatUnits(raw, decimals) {
    const base = 10n ** BigInt(decimals);
    const frac = (raw % base).toString().padStart(decimals, '0').replace(/0+$/, '');
    return (raw / base).toString() + (frac ? '.' + frac : '');
  }
  function fmtNum(n) {
    if (n === 0) return '0';
    if (n > 0 && n < 0.000001) return '<0.000001';
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
  }
  const amountOf = (x) => (x.raw == null ? null : Number(formatUnits(x.raw, x.asset.decimals)));
  const priceOf = (x) => (lastPrices && typeof lastPrices[x.asset.price] === 'number' ? lastPrices[x.asset.price] : null);
  const valueOf = (x) => { const a = amountOf(x), p = priceOf(x); return a != null && p != null ? a * p : 0; };
  const usd = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n < 1 && n > 0 ? 4 : 2 });
  const shortAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 9. Scan + render ----------
  // Reads every address in `srcs` together, then shows the results in one go.
  let busy = 0;
  async function scanSources(srcs, title = 'Reading your balances…') {
    srcs = srcs.filter(Boolean);
    if (!srcs.length) return;
    busy++;
    $('rescan').disabled = true;
    // Keep the wallet steps if a connect just started this load; otherwise start a fresh list.
    const loaderIdle = $('loading').classList.contains('hidden') || $('loadSpin').classList.contains('done');
    if (loaderIdle) loadStart(title); else $('loadTitle').textContent = title;
    const t0 = performance.now();
    const runStates = [];
    let readEnd = t0, priceMs = null;
    const ids = new Set(); CFG.chains.forEach((c) => { ids.add(c.native.price); c.tokens.forEach((t) => ids.add(t.price)); });
    const pli = step(`Prices: asking CoinGecko for ${ids.size} USD prices`, 'only coin names are sent, never your address');
    await Promise.all([
      getPrices().then((p) => { priceMs = Math.round(performance.now() - t0); lastPrices = p; pricesAt = new Date(); stepEnd(pli, !!p, p ? 'Prices loaded from CoinGecko' : 'Prices failed: showing amounts only'); }),
      ...srcs.map(async (src) => {
        const t1 = performance.now();
        const chainStates = await Promise.all(CFG.chains.filter((c) => kindOf(c) === src.kind).map((c) => scanChain(c, src)));
        readEnd = Math.max(readEnd, performance.now());
        runStates.push(...chainStates);
        if (sources.includes(src)) scans.set(src.key, { chainStates, at: new Date(), ms: Math.round(performance.now() - t1) });
      }),
    ]);
    busy--;
    if (!busy) {
      $('rescan').disabled = false;
      const states = [...scans.values()].flatMap((sc) => sc.chainStates);
      const ok = states.filter((x) => x.ok).length;
      loadFinish(`Loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s · ${ok} of ${states.length} chain reads worked · show steps`);
      $('results').classList.remove('hidden');
    }
    renderHow({ states: runStates, readMs: Math.round(readEnd - t0), priceMs, srcs });
    renderSources();
    render();
  }

  // Fills the "How it works" diagram and timing bars from the scan that just ran.
  const fmtMs = (ms) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
  function renderHow({ states, readMs, priceMs, srcs }) {
    if (!states.length) return;
    const put = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    const slowest = (list) => Math.max(...list.map((x) => x.ms));
    const reads = states.reduce((n, x) => n + x.items.length, 0);
    const failed = states.reduce((n, x) => n + x.items.filter((i) => i.error).length, 0);
    const chainIds = [...new Set(states.map((x) => x.chain.id))];
    const fromWallet = srcs.filter((x) => !x.key.startsWith('addr:')).length;
    if (fromWallet) put('hwAddr', `Returned ${fromWallet} public address${fromWallet === 1 ? '' : 'es'}`);
    put('hwRoute', `Fixed list: ${chainIds.length} chain${chainIds.length === 1 ? '' : 's'}, ${reads} balance read${reads === 1 ? '' : 's'}`);
    put('hwRead', `4 · Read in parallel from public nodes: ${fmtMs(readMs)} in total. No wallet involved`);
    const evm = states.filter((x) => kindOf(x.chain) === 'evm');
    const sol = states.filter((x) => kindOf(x.chain) === 'solana');
    const btc = states.filter((x) => kindOf(x.chain) === 'bitcoin');
    if (evm.length) put('hwEvm', `${new Set(evm.map((x) => x.chain.id)).size} chains · ${fmtMs(slowest(evm))}`);
    if (sol.length) put('hwSol', `SOL, USDC, USDT · ${fmtMs(slowest(sol))}`);
    if (btc.length) put('hwBtc', `mempool.space · ${fmtMs(slowest(btc))}`);
    if (priceMs != null) put('hwView', `Prices added in ${fmtMs(priceMs)}`);
    const rows = chainIds.map((id) => {
      const list = states.filter((x) => x.chain.id === id);
      return { name: list[0].chain.name, ms: slowest(list), ok: list.some((x) => x.ok), reads: list.reduce((n, x) => n + x.items.length, 0) };
    }).sort((a, b) => a.ms - b.ms);
    const max = Math.max(...rows.map((r) => r.ms), 1);
    const total = states.reduce((n, x) => n + x.ms, 0);
    $('hwSummary').innerHTML = `<strong>${fmtMs(readMs)}</strong> for ${reads} balance read${reads === 1 ? '' : 's'} across ${chainIds.length} chain${chainIds.length === 1 ? '' : 's'}, run at the same time. One after another, the same chains would take about ${fmtMs(total)}.${failed ? ` ${failed} read${failed === 1 ? '' : 's'} failed and show as “couldn’t read”.` : ''}`;
    $('hwBars').innerHTML = rows.map((r) => `<div class="hw-row"><span class="hw-name">${esc(r.name)}</span><span class="hw-track"><span class="hw-bar${r.ok ? '' : ' bad'}" style="width:${Math.max(2, Math.round((r.ms / max) * 100))}%"></span></span><span class="hw-ms">${r.ok ? fmtMs(r.ms) : 'couldn’t read'}</span></div>`).join('');
    put('hwWhen', 'Measured just now, in this browser');
  }
  const rescanAll = () => scanSources(sources, 'Rescanning…');

  function render() {
    const all = sources.map((s) => scans.get(s.key)).filter(Boolean);
    if (!all.length) { if (!sources.length) $('results').classList.add('hidden'); return; }
    const showZero = $('showZero').checked;
    const multi = sources.length > 1;
    document.querySelectorAll('.col-src').forEach((el) => el.classList.toggle('hidden', !multi));

    // Chain strip: one tile per chain that was read for at least one address
    const allStates = all.flatMap((sc) => sc.chainStates);
    $('chainStrip').innerHTML = CFG.chains.map((chain) => {
      const sts = allStates.filter((s) => s.chain.id === chain.id);
      if (!sts.length) return '';
      const bad = sts.filter((s) => !s.ok);
      const good = sts.find((s) => s.ok);
      if (!good) return `<div class="chain err"><b>${esc(chain.name)}</b>Couldn’t read: ${esc(sts[0].error || 'no data')}</div>`;
      const unit = kindOf(chain) === 'solana' ? 'slot' : 'block';
      const extra = bad.length ? `<br><span style="color:var(--err-ink)">${bad.length} address(es) couldn’t be read</span>` : '';
      return `<div class="chain ${bad.length ? 'err' : 'ok'}"><b>${esc(chain.name)}</b><span class="muted">${unit} ${Number(good.block).toLocaleString()}<br>${esc(endpointHost(good))}</span>${extra}</div>`;
    }).join('');

    const items = allStates.flatMap((s) => s.items);
    const held = items.filter((x) => x.raw != null && x.raw > 0n).sort((a, b) => valueOf(b) - valueOf(a));
    const failed = items.filter((x) => x.error);
    const zeros = items.filter((x) => x.raw === 0n);
    const visible = [...held, ...failed, ...(showZero ? zeros : [])];
    $('rows').innerHTML = visible.length ? visible.map((x) => rowHtml(x, multi)).join('')
      : `<tr><td colspan="${multi ? 5 : 4}" class="muted">No balances found. Tick “Show zero balances” to see everything that was checked.</td></tr>`;

    const pn = $('priceNotice');
    if (!lastPrices) { pn.textContent = 'Prices couldn’t be loaded from CoinGecko, so amounts are shown without USD values.'; pn.classList.remove('hidden'); }
    else pn.classList.add('hidden');

    // 4 major coins
    $('majors').innerHTML = MAJOR_ORDER.map(({ k, note }) => {
      const xs = held.filter((x) => MAJOR[x.asset.symbol] === k);
      const amt = xs.reduce((s, x) => s + (amountOf(x) || 0), 0);
      const val = xs.reduce((s, x) => s + valueOf(x), 0);
      const chainsN = new Set(xs.map((x) => x.chain.id)).size;
      const checked = items.some((x) => MAJOR[x.asset.symbol] === k);
      const sub = !checked ? 'not checked (no matching account)' : xs.length ? `${chainsN} chain(s)${note ? ` · ${note}` : ''}` : `none held${note ? ` · ${note}` : ''}`;
      return `<div class="major"><div class="k">${k}</div><div class="v">${fmtNum(amt)} <span class="u">${k}</span></div><div class="s">${lastPrices ? usd(val) + ' · ' : ''}${esc(sub)}</div></div>`;
    }).join('');

    // Cards
    const total = held.reduce((s, x) => s + valueOf(x), 0);
    const chainIds = [...new Set(allStates.map((s) => s.chain.id))];
    const okChains = chainIds.filter((id) => allStates.filter((s) => s.chain.id === id).every((s) => s.ok)).length;
    const failedReads = allStates.filter((s) => !s.ok).length;
    $('cTotal').textContent = lastPrices ? usd(total) : '—';
    $('cTotalSub').textContent = (lastPrices ? `${multi ? `${sources.length} addresses · ` : ''}CoinGecko spot, ${pricesAt.toLocaleTimeString()}` : 'prices unavailable')
      + (failed.length ? ` · excludes ${failed.length} unread balance(s)` : '');
    $('cHoldings').textContent = String(held.length);
    $('cHoldingsSub').textContent = `of ${items.length} address × asset × chain checks`;
    $('cChains').textContent = `${okChains}/${chainIds.length}`;
    $('cChainsSub').textContent = failedReads ? `${failedReads} chain read(s) failed, shown as “couldn’t read”` : 'all reads succeeded';
    const last = all.reduce((a, b) => (a.at > b.at ? a : b));
    $('scanMeta').textContent = `Last scan ${(last.ms / 1000).toFixed(1)} s · ${last.at.toLocaleTimeString()}`;
    if (!$('appModal').classList.contains('hidden')) renderPhone();
  }

  function rowHtml(x, multi) {
    const c = x.chain, a = x.asset;
    const ref = a.address || a.mint;
    const link = x.isNative || !ref ? c.explorer : `${c.explorer}/token/${ref}`;
    const assetCell = `<span class="asset"><a href="${esc(link)}" target="_blank" rel="noopener" title="${x.isNative ? 'Native coin' : esc(ref)}">${esc(a.symbol)}</a></span>${x.isNative ? ' <span class="muted small">native</span>' : ''}`;
    const srcCell = multi ? `<td class="small">${esc(x.src.label)}<br><span class="muted code">${esc(shortAddr(x.src.address))}</span></td>` : '';
    if (x.error) {
      return `<tr>${srcCell}<td>${assetCell}</td><td>${esc(c.name)}</td><td class="num"><span class="pill err">couldn’t read</span></td><td class="num muted">—</td></tr>`;
    }
    const p = priceOf(x);
    const val = p == null ? '<span class="muted">—</span>' : usd(amountOf(x) * p);
    return `<tr class="${x.raw === 0n ? 'zero' : ''}">${srcCell}<td>${assetCell}</td><td>${esc(c.name)}</td><td class="num">${fmtNum(amountOf(x))}</td><td class="num">${val}</td></tr>`;
  }

  // ---------- 10. Connecting ----------
  function showWalletError(msg) {
    const el = $('walletErr');
    if (!msg) { el.classList.add('hidden'); return; }
    el.textContent = msg; el.classList.remove('hidden');
  }

  async function connectEvm(g) {
    // Some wallets (seen with MetaMask) leave eth_requestAccounts pending after approval, so also watch
    // eth_accounts quietly (never opens a popup) and continue as soon as an account is shared.
    let poll = null;
    const approvedElsewhere = new Promise((resolve) => {
      poll = setInterval(async () => {
        try { const a = await evmRequest(g, 'eth_accounts', true); if (a?.length) resolve(a); } catch (_) { /* keep waiting */ }
      }, 1500);
    });
    try {
      const accounts = await Promise.race([evmRequest(g, 'eth_requestAccounts'), approvedElsewhere]);
      return accounts?.length ? [accounts[0]] : [];
    } finally { clearInterval(poll); }
  }

  function addFromWallet(g, kind, address) {
    const src = addSource({ key: `${g.key}:${kind}:${address}`, label: g.name, kind, address });
    if (src) log('wallet', `${g.name} shared ${kind === 'evm' ? 'an' : 'a'} ${KIND_LABEL[kind]} address (${shortAddr(address)})`);
    return src;
  }
  const CALL = { evm: 'eth_requestAccounts', solana: 'standard:connect', bitcoin: 'bitcoin:connect' };

  async function connectGroup(g) {
    if (!g || g.state !== 'idle') return;
    showWalletError('');
    g.state = 'connecting'; renderWalletButtons();
    loadStart(`Waiting for ${g.name}… unlock and approve in the ${g.name} popup`);
    const errors = [];
    const fresh = [];
    let got = 0;
    // One ecosystem at a time, so wallet popups don't collide. Each is an "share your address" request only.
    for (const kind of ['evm', 'solana', 'bitcoin']) {
      if (!g[kind]) continue;
      const li = step(`Asking ${g.name} for your ${KIND_LABEL[kind]} address`, `${CALL[kind]} · account access only`);
      try {
        const addrs = kind === 'evm' ? await connectEvm(g) : await wsConnect(g, kind);
        if (!addrs.length) { errors.push(`${KIND_LABEL[kind]}: no account shared`); stepEnd(li, false, `${KIND_LABEL[kind]}: no account shared`); continue; }
        stepEnd(li, true, `${g.name} shared your ${KIND_LABEL[kind]} address ${addrs.map(shortAddr).join(', ')}`, `${CALL[kind]} · public address only, no keys`);
        addrs.forEach((a) => fresh.push(addFromWallet(g, kind, a))); got += addrs.length;
      } catch (e) {
        const why = e?.code === 4001 ? 'declined' : (e?.message || e);
        errors.push(`${KIND_LABEL[kind]}: ${why}`); stepEnd(li, false, `${KIND_LABEL[kind]}: ${why}`);
      }
    }
    if (g.evm?.on && !g.evm.__pmListening) {
      g.evm.__pmListening = true;
      g.evm.on('accountsChanged', (accs) => {
        sources.filter((s) => s.key.startsWith(`${g.key}:evm:`)).forEach((s) => removeSource(s.key));
        if (accs?.length) { log('wallet', `${g.name} EVM account changed to ${shortAddr(accs[0])}`); scanSources([addFromWallet(g, 'evm', accs[0])], 'Account changed: reading again…'); }
      });
    }
    g.state = got ? 'connected' : 'idle';
    renderWalletButtons();
    if (errors.length) showWalletError(`${g.name}: ${errors.join(' · ')}`);
    if (got) await scanSources(fresh, `Reading your balances from ${CFG.chains.length} blockchains…`);
    else loadFinish('Nothing was shared, so nothing was read');
  }

  // ---------- 11. Brokerage-app preview (a mock phone screen; display only, no wallet calls) ----------
  const COIN_NAME = { BTC: 'Bitcoin', ETH: 'Ether', SOL: 'Solana', USDC: 'USD Coin', USDT: 'Tether', USDT0: 'USDT0',
    WETH: 'Wrapped Ether', WBTC: 'Wrapped Bitcoin', LINK: 'Chainlink', ARB: 'Arbitrum', OP: 'Optimism', POL: 'Polygon', AVAX: 'Avalanche' };
  const WRAPPED = { WETH: 'a token that tracks ETH, not ETH itself', WBTC: 'a token that tracks BTC, not BTC itself' };
  const itemKey = (x) => `${x.src.key}|${x.chain.id}|${x.asset.symbol}`;
  let phoneView = 'list';
  let phoneSel = null; // Set of itemKey; null = not chosen yet (all ticked)

  function heldItems() {
    return sources.map((s) => scans.get(s.key)).filter(Boolean).flatMap((sc) => sc.chainStates).flatMap((c) => c.items)
      .filter((x) => x.raw != null && x.raw > 0n).sort((a, b) => valueOf(b) - valueOf(a));
  }
  const phoneStatus = () => `<div class="ph-status"><span>${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span><span>▮▮▮ ◔</span></div>`;

  function renderPhone() {
    const held = heldItems();
    if (!phoneSel) phoneSel = new Set(held.map(itemKey));
    const sel = held.filter((x) => phoneSel.has(itemKey(x)));
    const selVal = sel.reduce((s, x) => s + valueOf(x), 0);
    const scr = $('phoneScreen');
    if (phoneView === 'list') {
      const rows = held.map((x) => {
        const sym = x.asset.symbol;
        const tag = WRAPPED[sym] ? '<span class="ph-tag">wrapped</span>' : '';
        const sub = WRAPPED[sym] ? `${sym} on ${x.chain.name} · ${WRAPPED[sym]}` : `${sym} · ${x.chain.name}${x.isNative ? '' : ' token'}`;
        const p = priceOf(x);
        return `<label class="ph-row"><input type="checkbox" data-k="${esc(itemKey(x))}" ${phoneSel.has(itemKey(x)) ? 'checked' : ''}>
          <span class="ph-coin">${esc(sym.slice(0, 1))}</span>
          <span class="ph-main"><b>${esc(COIN_NAME[sym] || sym)}${tag}</b><small>${esc(sub)}</small></span>
          <span class="ph-amt"><b>${p == null ? '—' : usd(valueOf(x))}</b><small>${fmtNum(amountOf(x))} ${esc(sym)}</small></span></label>`;
      }).join('');
      scr.innerHTML = `${phoneStatus()}<div class="ph-body">
          <div class="ph-brand">Your brokerage · mock</div>
          <h2>Move crypto in</h2>
          <p>Found in your MetaMask wallet just now. Tick what you’d move.</p>
          <div class="ph-total"><span>Selected · ${sel.length} of ${held.length}</span><b>${lastPrices ? usd(selVal) : '—'}</b></div>
          ${rows || '<p>Nothing to move: this wallet holds nothing on the chains checked.</p>'}
        </div>
        <div class="ph-foot"><button class="ph-cta" id="phReview" ${sel.length ? '' : 'disabled'}>Review move${sel.length ? ` (${sel.length})` : ''}</button></div>`;
      scr.querySelectorAll('input[data-k]').forEach((cb) => cb.addEventListener('change', () => {
        if (cb.checked) phoneSel.add(cb.dataset.k); else phoneSel.delete(cb.dataset.k);
        renderPhone();
      }));
      $('phReview').addEventListener('click', () => { phoneView = 'review'; renderPhone(); });
    } else {
      const nativeHeld = (x) => held.some((y) => y.src === x.src && y.chain === x.chain && y.isNative);
      const cards = sel.map((x) => {
        const sym = x.asset.symbol, fee = x.chain.native.symbol;
        const feeLine = x.isNative ? `Network fee comes out of your ${fee}` : `Network fee paid in ${fee} on ${x.chain.name}`;
        const warn = !x.isNative && !nativeHeld(x) ? `<div class="warn">No ${esc(fee)} on ${esc(x.chain.name)} to pay the fee, so this one couldn’t be sent yet.</div>` : '';
        return `<div class="ph-card"><b>Send ${fmtNum(amountOf(x))} ${esc(sym)}</b>${lastPrices ? ` <span class="ln">≈ ${usd(valueOf(x))}</span>` : ''}
          <div class="ln">From your wallet ${esc(shortAddr(x.src.address))} on ${esc(x.chain.name)} → a deposit address the brokerage gives you</div>
          <div class="ln">${esc(feeLine)}</div>${warn}</div>`;
      }).join('');
      scr.innerHTML = `${phoneStatus()}<div class="ph-body">
          <button class="ph-back" id="phBack">‹ Back</button>
          <h2>Review</h2>
          <p>You’d approve ${sel.length === 1 ? 'this transfer' : `each of these ${sel.length} transfers`} in MetaMask. Nothing moves until you do.</p>
          ${cards}
          <ol class="ph-flow">
            <li>MetaMask shows each transfer; you approve it.</li>
            <li>MetaMask signs it with your key and broadcasts it.</li>
            <li>The network confirms it.</li>
            <li>The brokerage sees it arrive and credits your account.</li>
          </ol>
        </div>
        <div class="ph-foot"><button class="ph-cta" disabled>Approve in MetaMask</button>
          <p class="ph-note">Prototype stops here. This page can’t ask MetaMask to send anything.</p></div>`;
      $('phBack').addEventListener('click', () => { phoneView = 'list'; renderPhone(); });
    }
  }
  function openPhone() { phoneView = 'list'; $('appModal').classList.remove('hidden'); renderPhone(); $('closeApp').focus(); log('page', 'opened the brokerage-app preview (display only)'); }
  function closePhone() { $('appModal').classList.add('hidden'); }
  $('openApp').addEventListener('click', openPhone);
  $('closeApp').addEventListener('click', closePhone);
  $('appModal').addEventListener('click', (e) => { if (e.target === $('appModal')) closePhone(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePhone(); });

  $('manualForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = detectKind($('manualAddr').value);
    if (!d) { showWalletError('That isn’t a recognised EVM (0x…), Bitcoin (bc1…, 1…, 3…) or Solana address.'); return; }
    showWalletError('');
    const label = $('manualLabel').value.trim().slice(0, 40) || 'Pasted address';
    log('input', `checking a pasted ${KIND_LABEL[d.kind]} address ${shortAddr(d.address)} as “${label}” (no wallet involved)`);
    const src = addSource({ key: `addr:${d.kind}:${d.address}`, label, kind: d.kind, address: d.address });
    $('manualAddr').value = '';
    if (src) scanSources([src]);
  });

  $('showZero').addEventListener('change', render);
  $('rescan').addEventListener('click', rescanAll);

  renderWalletButtons();
  renderSources();
  log('page', 'loaded. Nothing has been read yet.');
  // Ask installed wallets to announce themselves (now that everything above is defined).
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: registerWs } })); } catch (_) { /* ignore */ }
})();
