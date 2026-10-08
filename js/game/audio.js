/* ============================================================
 * 瓦工坊 · 程序化音效（WebAudio 合成，零素材依赖）
 * AIM_SFX.shot() 玩家开枪 / .hit(isHead) 命中反馈 / .hurt() 受击
 * .reload() 换弹 / .enemyShot() Bot 开枪 / .step() 脚步提示
 * AudioContext 在首次调用时创建（处于用户手势链路内）。
 * ============================================================ */
(function () {
  "use strict";

  let ctx = null;
  let master = null;

  function ac() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      } catch (e) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* 白噪声缓冲（复用） */
  let noiseBuf = null;
  function noise() {
    const c = ac();
    if (!c) return null;
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  /* 包络增益 */
  function env(peak, attack, decay) {
    const c = ac();
    if (!c) return null;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(master);
    return g;
  }

  function burst(dur, filterFreq, peak) {
    const c = ac();
    if (!c) return;
    const src = noise();
    if (!src) return;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    const g = env(peak, 0.004, dur);
    if (!g) return;
    src.connect(f).connect(g);
    src.start();
    src.stop(c.currentTime + dur + 0.05);
  }

  function tone(freq, dur, peak, type) {
    const c = ac();
    if (!c) return;
    const o = c.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), c.currentTime + dur);
    const g = env(peak, 0.003, dur);
    if (!g) return;
    o.connect(g);
    o.start();
    o.stop(c.currentTime + dur + 0.05);
  }

  window.AIM_SFX = {
    shot() { burst(0.09, 1600, 0.55); tone(150, 0.07, 0.35, "triangle"); },
    hit(isHead) {
      if (isHead) { tone(1240, 0.1, 0.3, "square"); tone(1860, 0.08, 0.18, "sine"); }
      else tone(700, 0.05, 0.22, "square");
    },
    hurt() { tone(110, 0.16, 0.4, "sawtooth"); burst(0.08, 500, 0.25); },
    reload() {
      burst(0.03, 3000, 0.3);
      const c = ac();
      if (c) setTimeout(() => burst(0.04, 2600, 0.35), 350);
    },
    enemyShot() { burst(0.07, 900, 0.18); },
    step() { burst(0.05, 700, 0.3); },
  };
})();
