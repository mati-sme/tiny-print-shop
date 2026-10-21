/* Tiny Print Shop - platform layer. The standalone game (GitHub Pages, file://) loads nothing external: storage is localStorage
 * and every hook is a no-op. Portal builds (tools/build-portals.sh) set window.PLATFORM_BACKEND = 'crazygames' and load the
 * CrazyGames SDK v3 before this file; then:
 *   init()          SDK.init() (8 s timeout) -> environment check -> data-module saves -> muteAudio setting
 *   loading(on)     SDK.game.loadingStart() / loadingStop()        (once each, start before stop)
 *   gameplay(on)    SDK.game.gameplayStart() / gameplayStop()      (deduped; never before loading has stopped)
 *   happy()         SDK.game.happytime()                           (rate-limited to once a minute)
 * window.__portalLog records the order of those calls for tests. */
(function (root) {
'use strict';
const backend = root.PLATFORM_BACKEND || 'local';
const log = root.__portalLog = root.__portalLog || [];
const note = (s) => { log.push(s); if (log.length > 200) log.shift(); };
const L = {
  get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  remove(k) { try { root.localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
let sdk = null, initP = null, loadState = 'idle', playing = false, lastHappy = -1e9, muteCb = null, portalMuted = false;
const call = (fn) => { if (!sdk) return; try { fn(sdk); } catch (e) { /* never let the SDK break the game */ } };

function cgStore(d) { // CrazyGames data module (synced to the player's account), falls back to and migrates from localStorage
  let ok = true;
  const D = (fn, fb) => { if (!ok) return fb(); try { return fn(); } catch (e) { ok = false; note('data-unavailable'); return fb(); } };
  return {
    get: (k) => D(() => { const v = d.getItem(k); if (v != null) return v; const old = L.get(k); if (old != null) { d.setItem(k, old); note('data-migrated'); } return old; }, () => L.get(k)),
    set: (k, v) => D(() => { d.setItem(k, v); L.set(k, v); return true; }, () => L.set(k, v)),
    remove: (k) => D(() => { d.removeItem(k); L.remove(k); }, () => L.remove(k)),
  };
}
async function cgInit() {
  const S = root.CrazyGames && root.CrazyGames.SDK;
  if (!S) { note('sdk-missing'); return; }
  try { await Promise.race([S.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]); }
  catch (e) { note('init-failed'); return; }
  if (S.environment === 'disabled') { note('disabled'); return; }
  sdk = S; note('init:' + S.environment);
  if (S.data) Platform.storage = cgStore(S.data);
  const settings = () => { try { portalMuted = !!S.game.settings.muteAudio; } catch (e) { portalMuted = false; } if (muteCb) muteCb(portalMuted); };
  settings();
  try { S.game.addSettingsChangeListener(settings); } catch (e) { /* older SDK */ }
}
let want = false, lastPlay = -1e9, playT = 0;
function flushPlay() {
  if (want === playing) { clearTimeout(playT); playT = 0; return; }
  const wait = lastPlay + 1100 - Date.now();
  if (wait > 0) { if (!playT) playT = setTimeout(() => { playT = 0; flushPlay(); }, wait); return; }
  playing = want; lastPlay = Date.now(); note(playing ? 'gameplayStart' : 'gameplayStop');
  const on = playing; call((S) => (on ? S.game.gameplayStart() : S.game.gameplayStop()));
}
const Platform = {
  backend,
  init() { if (!initP) initP = backend === 'crazygames' ? cgInit() : Promise.resolve(); return initP; },
  loading(on) {
    if (on && loadState === 'idle') { loadState = 'loading'; note('loadingStart'); call((S) => S.game.loadingStart()); }
    else if (!on && loadState === 'loading') { loadState = 'done'; note('loadingStop'); call((S) => S.game.loadingStop()); }
  },
  // The SDK throttles gameplayStart/Stop calls closer than 1 s apart, so state changes are coalesced: a quick
  // pause+resume sends nothing, and a real change is sent at most every 1.1 s (always ending in the latest state).
  gameplay(on) {
    want = !!on;
    if (want && loadState === 'loading') Platform.loading(false);
    flushPlay();
  },
  happy() { const t = Date.now(); if (t - lastHappy < 60000) return; lastHappy = t; note('happytime'); call((S) => S.game.happytime()); },
  onMute(cb) { muteCb = cb; if (portalMuted) cb(true); },
  get playing() { return playing; },
  storage: L,
};
root.BL = root.BL || {};
root.BL.Platform = Platform;
})(window);
