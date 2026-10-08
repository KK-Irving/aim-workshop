/* ============================================================
 * 瓦工坊 · 游戏外壳（仿原站 WorkshopLoading / HallView 流程）
 * 开始游玩 → 全屏加载页 → 训练场（THREE 场景）→ 暂停/结算 → 返回工坊
 *
 * 对外只暴露 window.AIM_GAME：
 *   .open(drillNoOrDrill)   打开一次训练（按钮入口都在 js/app.js）
 *   .session                当前会话（调试 / 自动化测试用）
 * 训练场本体由 window.AIM_PLAYFIELD（playfield.js）提供，
 * 本文件只负责生命周期：没有 AIM_PLAYFIELD 时渲染占位场景。
 * ============================================================ */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const AGENTS = ["jett", "reyna", "phoenix", "sage", "raze", "omen", "killjoy", "yoru", "waylay"];
  const MAP_EN = { ascent: "ASCENT", split: "SPLIT", haven: "HAVEN", summit: "SUMMIT", lotus: "LOTUS" };

  /* 加载步骤文案：对齐原站五步（副文案为真实发生的子步骤） */
  const STEPS = [
    { name: "取场景", sub: "初始化渲染器与场景图" },
    { name: "生成几何与贴图", sub: "灰盒体块 + 程序化材质" },
    { name: "构建碰撞与落脚面", sub: "AABB 体块树 + 落脚查询" },
    { name: "生成靶位", sub: "按练法布置 Bot 与枪线" },
    { name: "载入训练场", sub: "编译着色器 · 首帧渲染" },
  ];

  let root = null;
  let session = null; /* 当前会话 */

  /* ---------------- 小工具 ---------------- */
  function h(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }
  function mapName(key) {
    const m = (window.AIM_DATA.maps || []).find((m) => m.key === key);
    return m ? m.name : key;
  }
  function agentOf(no) {
    let seed = 7;
    for (const c of no) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    return AGENTS[seed % AGENTS.length];
  }

  /* ---------------- DOM 构建 ---------------- */
  function ensureRoot() {
    if (root) return root;
    root = h("div", "game-root hidden");
    root.innerHTML = `
      <div class="g-loading">
        <div class="gl-bg"></div><div class="gl-shade"></div>
        <img class="gl-agent" alt="" />
        <div class="gl-head">
          <div class="gl-workshop">WORKSHOP</div>
          <h1 class="gl-title"></h1>
          <p class="gl-sub"></p>
        </div>
        <div class="gl-mapcard">
          <div class="gl-mapname"><span></span><i></i></div>
          <canvas class="gl-minimap" width="208" height="208"></canvas>
          <div class="gl-mapnote">准备中…</div>
        </div>
        <div class="gl-bottom">
          <div class="gl-stepname"></div>
          <div class="gl-stepsub"></div>
          <div class="gl-steps"></div>
          <div class="gl-bar"><i></i></div>
          <button class="gl-back" type="button">返回工坊</button>
        </div>
      </div>
      <div class="g-stage hidden">
        <canvas class="gs-canvas"></canvas>
        <div class="g-hud">
          <div class="hud-top">
            <div class="hud-cell"><small>得分</small><b class="hud-score">0</b></div>
            <div class="hud-cell hud-time-cell"><small>时间</small><b class="hud-time">1:00</b></div>
            <div class="hud-cell"><small>命中率</small><b class="hud-acc">—</b></div>
          </div>
          <div class="hud-cross"></div>
          <div class="hud-hint">TAB 打开菜单</div>
          <div class="hud-ammo"><span class="hud-reserve">∞</span><i>|</i><b class="hud-mag">50</b></div>
          <div class="hud-msg"></div>
          <div class="hud-hp"><i></i></div>
        </div>
        <div class="g-gate hidden"><b>点击任意位置进入训练场</b><small>进入后锁定鼠标 · ESC 呼出菜单</small></div>
        <div class="g-pause hidden">
          <div class="gp-panel">
            <b>训练暂停</b>
            <button class="gp-resume" type="button">继续训练</button>
            <button class="gp-restart" type="button">重新开始</button>
            <button class="gp-quit" type="button">返回工坊</button>
          </div>
        </div>
        <div class="g-results hidden"></div>
      </div>`;
    document.body.appendChild(root);
    return root;
  }

  /* ---------------- HUD ---------------- */
  function hudOf(s) {
    const stage = $(".g-stage", root);
    return {
      score(v) { $(".hud-score", stage).textContent = v; },
      time(sec) {
        const m = Math.floor(sec / 60), r = Math.max(0, Math.ceil(sec % 60));
        $(".hud-time", stage).textContent = `${m}:${String(r).padStart(2, "0")}`;
      },
      acc(v) { $(".hud-acc", stage).textContent = v == null ? "—" : v; },
      ammo(mag, reserve) {
        $(".hud-mag", stage).textContent = mag;
        $(".hud-reserve", stage).textContent = reserve;
      },
      msg(html, ms) {
        const el = $(".hud-msg", stage);
        el.innerHTML = html || "";
        if (ms) setTimeout(() => { if (el.innerHTML === html) el.innerHTML = ""; }, ms);
      },
      hp(pct) { $(".hud-hp i", stage).style.width = Math.max(0, pct) + "%"; },
    };
  }

  /* ---------------- 加载页 ---------------- */
  function showLoading(drill) {
    const lo = $(".g-loading", root);
    $(".gl-bg", lo).style.backgroundImage = `url(assets/covers/${drill.map}.webp)`;
    $(".gl-agent", lo).src = `assets/agents/${agentOf(drill.no)}.webp`;
    $(".gl-title", lo).textContent = `${drill.diff === "l3" ? "困难-" : drill.diff === "l1" ? "简单-" : ""}${drill.title}`;
    $(".gl-sub", lo).innerHTML = `<b>${drill.type}</b> · ${drill.desc}`;
    $(".gl-mapname span", lo).textContent = mapName(drill.map);
    $(".gl-mapname i", lo).textContent = MAP_EN[drill.map] || "";
    $(".gl-steps", lo).innerHTML = STEPS.map((s) => `<span><i></i>${s.name}</span>`).join("");
    lo.classList.remove("hidden");
  }

  function runLoading(s, onDone) {
    const lo = $(".g-loading", root);
    const note = $(".gl-mapnote", lo);
    const dots = $$(".gl-steps span", lo);
    const bar = $(".gl-bar i", lo);
    let i = 0;
    function next() {
      if (i >= STEPS.length) { bar.style.width = "100%"; setTimeout(onDone, 220); return; }
      const st = STEPS[i];
      $(".gl-stepname", lo).textContent = st.name;
      $(".gl-stepsub", lo).textContent = st.sub;
      dots.forEach((d, k) => d.classList.toggle("is-on", k <= i));
      bar.style.width = Math.round(((i + 0.7) / STEPS.length) * 100) + "%";
      note.textContent = i === 3 ? `正在生成靶位…` : note.textContent;
      if (s.playfield && s.playfield.onLoadStep) s.playfield.onLoadStep(i);
      i++;
      s.loadTimer = setTimeout(next, 210 + Math.random() * 220);
    }
    next();
  }

  /* ---------------- 会话生命周期 ---------------- */
  function open(drillOrNo) {
    if (session) return; /* 已在训练中 */
    const D = window.AIM_DATA;
    const drill = typeof drillOrNo === "string"
      ? D.drills.find((d) => d.no === drillOrNo)
      : drillOrNo;
    if (!drill) return;

    ensureRoot();
    session = {
      drill, live: false, paused: false, raf: 0, last: 0,
      playfield: null, loadTimer: 0,
      hud: null, prevOverflow: document.body.style.overflow,
    };
    session.hud = hudOf(session);
    document.body.style.overflow = "hidden";
    root.classList.remove("hidden");
    $(".g-stage", root).classList.add("hidden");
    showLoading(drill);
    tryFullscreen();

    /* 占位 / 真实训练场在后台构建，加载条走完即切换 */
    setTimeout(() => {
      const canvas = $(".gs-canvas", root);
      session.playfield = window.AIM_PLAYFIELD
        ? new window.AIM_PLAYFIELD(canvas, session)
        : stubPlayfield(canvas, session);
      runLoading(session, enterStage);
    }, 60);
  }

  function enterStage() {
    $(".g-loading", root).classList.add("hidden");
    $(".g-stage", root).classList.remove("hidden");
    $(".g-gate", root).classList.remove("hidden");
    resize();
    session.last = performance.now();
    loop(session.last);
    tryFullscreen();
  }

  function gateClick() {
    const gate = $(".g-gate", root);
    if (!gate || gate.classList.contains("hidden")) return;
    gate.classList.add("hidden");
    session.live = true;
    tryFullscreen();
    requestLock();
    if (session.playfield.start) session.playfield.start();
  }

  function requestLock() {
    const canvas = $(".gs-canvas", root);
    if (!canvas || !canvas.requestPointerLock) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { session.fallbackAim = true; });
    } catch (e) { session.fallbackAim = true; }
  }

  function tryFullscreen() {
    if (document.fullscreenElement) return;
    const el = root;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return;
    try { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 忽略 */ }
  }

  function loop(now) {
    if (!session) return;
    session.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - session.last) / 1000);
    session.last = now;
    if (session.playfield && !session.paused) session.playfield.render(dt, now / 1000);
  }

  function resize() {
    if (!session || !session.playfield) return;
    const stage = $(".g-stage", root);
    session.playfield.resize(stage.clientWidth, stage.clientHeight);
  }

  function pause() {
    if (!session || !session.live || session.paused) return;
    session.paused = true;
    $(".g-pause", root).classList.remove("hidden");
    if (session.playfield.setPaused) session.playfield.setPaused(true);
  }
  function resume() {
    if (!session) return;
    session.paused = false;
    $(".g-pause", root).classList.add("hidden");
    if (session.playfield.setPaused) session.playfield.setPaused(false);
    requestLock();
    session.last = performance.now();
  }
  function restart() {
    if (!session) return;
    if (session.playfield.restart) {
      resume();
      session.playfield.restart();
    }
  }

  function close() {
    if (!session) return;
    cancelAnimationFrame(session.raf);
    clearTimeout(session.loadTimer);
    if (session.playfield && session.playfield.dispose) session.playfield.dispose();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    document.body.style.overflow = session.prevOverflow || "";
    root.classList.add("hidden");
    $(".gs-canvas", root).width = 0; /* 释放显存 */
    session = null;
  }

  /* ---------------- 占位训练场（批次2 替换为真实场景） ---------------- */
  function stubPlayfield(canvas, s) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(0x0b0d10);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0d10, 8, 46);
    const cam = new THREE.PerspectiveCamera(73, 2, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0x8fa3bf, 0x1a1d22, 0.9));
    const key = new THREE.DirectionalLight(0xffd9c2, 0.7);
    key.position.set(6, 12, 4);
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshLambertMaterial({ color: 0x14171c })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const grid = new THREE.GridHelper(90, 45, 0x2a3140, 0x1c212b);
    grid.position.y = 0.01;
    scene.add(grid);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x1d232e });
    const boxMat2 = new THREE.MeshLambertMaterial({ color: 0x2a1216 });
    [[-6, 1.5, -10, 3], [5, 1, -14, 2], [0, 2.2, -20, 4], [-10, 0.8, -6, 1.6], [9, 1.8, -8, 3.6]]
      .forEach(([x, y, z, sc], i) => {
        const m = new THREE.Mesh(boxGeo, i % 2 ? boxMat2 : boxMat);
        m.scale.setScalar(sc);
        m.position.set(x, y * sc * 0.5, z);
        scene.add(m);
      });

    let t = 0;
    return {
      onLoadStep() {}, start() {}, setPaused() {}, restart() {},
      resize(w, hgt) { renderer.setSize(w, hgt, false); cam.aspect = w / hgt; cam.updateProjectionMatrix(); },
      render(dt) {
        t += dt * 0.12;
        cam.position.set(Math.sin(t) * 7, 2.6 + Math.sin(t * 0.6) * 0.4, 8 + Math.cos(t) * 2);
        cam.lookAt(0, 1.4, -12);
        renderer.render(scene, cam);
      },
      dispose() { renderer.dispose(); },
    };
  }

  /* ---------------- 事件绑定（root 常驻，绑定一次） ---------------- */
  function bindOnce() {
    ensureRoot();
    root.addEventListener("click", (e) => {
      if (e.target.closest(".gl-back") || e.target.closest(".gp-quit")) { close(); return; }
      if (e.target.closest(".gp-resume")) { resume(); return; }
      if (e.target.closest(".gp-restart")) { restart(); return; }
      if (e.target.closest(".g-gate")) gateClick();
    });
    document.addEventListener("pointerlockchange", () => {
      if (!session || !session.live) return;
      /* 锁被系统/ESC 打断 → 暂停（菜单主动解锁的场景由菜单自身标记处理） */
      if (!document.pointerLockElement && !session.paused) pause();
    });
    document.addEventListener("keydown", (e) => {
      if (!session || !session.live) return;
      if (e.key === "Escape") { if (!session.paused) pause(); }
      if (e.key === "Tab") { e.preventDefault(); pause(); }
    });
    window.addEventListener("resize", resize);
  }

  window.AIM_GAME = {
    open,
    close,
    get session() { return session; },
  };
  bindOnce();
})();
