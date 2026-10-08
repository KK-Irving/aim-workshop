/* ============================================================
 * 瓦工坊 · 3D 训练场（仿原站 HallView：灰盒复刻 + 训练 Bot）
 *
 * 窗口暴露 window.AIM_PLAYFIELD(canvas, session) 构造器，
 * 由 shell.js 在加载阶段实例化并按步驱动（onLoadStep）。
 *
 * 批次2 范围：地图灰盒（五图配色 + 走廊/场地方案）、
 * 第一人称控制（Pointer Lock + WASD + 跳跃/静步 + AABB 碰撞）、
 * 步枪射击（射线/散布/后坐/换弹/曳光/弹孔）、训练 Bot（命中/击倒/重生）。
 * 练法规则与结算在 drills.js（批次3）接入，通过 session.runtime 钩子。
 * ============================================================ */
(function () {
  "use strict";

  /* ---------------- 地图主题（灰盒自建，仅取氛围配色）
   * 参考：wall/wall2 为墙板双色（分板用）、fog 偏亮灰、floor 深色 */
  const MAP_THEMES = {
    ascent: { sky: 0x6a7686, fog: 0x5d6875, wall: 0x5d6a7c, wall2: 0x525e6e, floor: 0x23262b, crate: 0x6e5f49, accent: 0xd9303f, sun: 0xcfd8e6 },
    split:  { sky: 0x39485c, fog: 0x334254, wall: 0x49596e, wall2: 0x3f4e62, floor: 0x1e242e, crate: 0x2f6f8f, accent: 0x53b9ff, sun: 0xb9d2ef },
    haven:  { sky: 0x77705f, fog: 0x6b6455, wall: 0x6f685a, wall2: 0x615b4e, floor: 0x26231e, crate: 0x9c4a3c, accent: 0xfd4556, sun: 0xe8e0cc },
    summit: { sky: 0x4c5a55, fog: 0x44514c, wall: 0x4d5c54, wall2: 0x42504a, floor: 0x1d2320, crate: 0x6b5a2e, accent: 0xe0b64f, sun: 0xd9e8d0 },
    lotus:  { sky: 0x5c7a72, fog: 0x526f67, wall: 0x54726a, wall2: 0x49655d, floor: 0x1d2622, crate: 0x4a7a6c, accent: 0xff8a5c, sun: 0xdfefe4 },
  };

  const DEG = Math.PI / 180;
  const EYE = 1.6, R = 0.35, GRAV = 13.5, JUMP = 4.6;
  const MAG_SIZE = 50, FIRE_INT = 0.108, RELOAD_T = 2.0;
  const $ = (s, r) => (r || document).querySelector(s);

  function sensFactor() {
    const s = parseFloat(localStorage.getItem("aim-sens") || "0.5");
    return 0.0022 * (s / 0.5);
  }
  function drillDuration(drill) {
    const m = /(\d+)\s*秒/.exec(drill.desc || "");
    return m ? Math.min(90, +m[1]) : 60;
  }

  /* ---------------- 程序化贴图（canvas 绘制，零素材） ---------------- */
  function makeTex(w, h, draw, repeat) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
    }
    t.anisotropy = 4;
    return t;
  }
  function hex(c) { return "#" + c.toString(16).padStart(6, "0"); }
  function noise(ctx, w, h, n, light, dark) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? light : dark;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }
  /* 墙板：竖缝 + 腰线 + 上下 AO + 颗粒 */
  function drawWall(ctx, w, h, base) {
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0.07)");
    g.addColorStop(0.55, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((w * i) / 4, 0);
      ctx.lineTo((w * i) / 4, h);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((w * i) / 4 + 4, 0);
      ctx.lineTo((w * i) / 4 + 4, h);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, h * 0.8, w, 8);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0, h * 0.8 - 3, w, 3);
    noise(ctx, w, h, 500, "rgba(255,255,255,0.03)", "rgba(0,0,0,0.05)");
  }
  /* 地板：方格地砖 + 污渍 + 划痕 */
  function drawFloor(ctx, w, h, base) {
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, w, h);
    const tile = w / 4;
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * tile, 0); ctx.lineTo(i * tile, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * tile); ctx.lineTo(w, i * tile); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * tile + 3, 0); ctx.lineTo(i * tile + 3, h); ctx.stroke();
    }
    /* 污渍 */
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 12 + Math.random() * 30, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    /* 划痕 */
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 30);
      ctx.stroke();
    }
    noise(ctx, w, h, 350, "rgba(255,255,255,0.03)", "rgba(0,0,0,0.06)");
  }
  /* 箱体：边框 + 铆钉 + 斜纹警示带 + 中央箭头 */
  function drawCrate(ctx, w, h, base) {
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, w - 44, h - 44);
    /* 铆钉 */
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]].forEach(([x, y]) => {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 2.5, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
    });
    /* 中央向下箭头（落点提示意象） */
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.moveTo(w / 2 - 34, h / 2 - 22);
    ctx.lineTo(w / 2 + 34, h / 2 - 22);
    ctx.lineTo(w / 2, h / 2 + 26);
    ctx.closePath();
    ctx.fill();
    noise(ctx, w, h, 300, "rgba(255,255,255,0.04)", "rgba(0,0,0,0.06)");
  }
  /* 金属拉丝（枪体用） */
  function drawMetal(ctx, w, h, base) {
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const y = Math.random() * h;
      ctx.strokeStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * w * 0.4, y);
      ctx.lineTo(Math.random() * w * 0.6 + w * 0.4, y + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      const x = Math.random() * w;
      ctx.beginPath();
      ctx.moveTo(x, Math.random() * h);
      ctx.lineTo(x + (Math.random() - 0.5) * 8, Math.random() * h);
      ctx.stroke();
    }
  }
  /* 径向光斑（枪口焰 billboard） */
  function drawFlash(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,240,200,1)");
    g.addColorStop(0.25, "rgba(255,196,107,0.9)");
    g.addColorStop(0.6, "rgba(255,140,60,0.35)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    /* 六向星芒 */
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      const lg = ctx.createLinearGradient(0, 0, w / 2, 0);
      lg.addColorStop(0, "rgba(255,220,150,0.9)");
      lg.addColorStop(1, "rgba(255,180,80,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, -3, w / 2, 6);
    }
  }

  /* ============================================================ */
  window.AIM_PLAYFIELD = function (canvas, session) {
    const drill = session.drill;
    const theme = MAP_THEMES[drill.map] || MAP_THEMES.ascent;

    /* ---------------- 渲染基础 ---------------- */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(theme.sky);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.sky);
    /* 原站观感：雾偏近偏灰，远景融进天色 */
    scene.fog = new THREE.Fog(theme.fog, 10, 62);

    const cam = new THREE.PerspectiveCamera(73, 2, 0.08, 220);
    cam.rotation.order = "YXZ";

    scene.add(new THREE.HemisphereLight(0xc4d2e0, 0x33363c, 1.45));
    const sun = new THREE.DirectionalLight(theme.sun, 0.7);
    sun.position.set(14, 26, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -26;
    sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -40;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0006;
    scene.add(sun);

    /* ---------------- 关卡容器与碰撞盒 ---------------- */
    const world = new THREE.Group();
    scene.add(world);
    const colliders = [];  /* {min:[x,y,z], max:[x,y,z]} AABB */
    const mats = {
      wall: new THREE.MeshLambertMaterial({ map: makeTex(512, 512, (c, w, h) => drawWall(c, w, h, theme.wall)) }),
      wall2: new THREE.MeshLambertMaterial({ map: makeTex(512, 512, (c, w, h) => drawWall(c, w, h, theme.wall2)) }),
      floor: new THREE.MeshLambertMaterial({ map: makeTex(512, 512, (c, w, h) => drawFloor(c, w, h, theme.floor), [7, 2.5]) }),
      crate: new THREE.MeshLambertMaterial({ map: makeTex(512, 512, (c, w, h) => drawCrate(c, w, h, theme.crate)) }),
      accent: new THREE.MeshLambertMaterial({ color: theme.accent }),
      /* 训练机器人：黄橙机身 + 深色关节 + 发光目镜（参考原站靶机意象） */
      botBody: new THREE.MeshLambertMaterial({ map: makeTex(256, 256, (c, w, h) => {
        c.fillStyle = "#f59e1b";
        c.fillRect(0, 0, w, h);
        c.strokeStyle = "rgba(0,0,0,0.22)";
        c.lineWidth = 5;
        c.strokeRect(8, 8, w - 16, h - 16);
        c.beginPath(); c.moveTo(w / 2, 8); c.lineTo(w / 2, h - 8); c.stroke();
        c.fillStyle = "rgba(255,255,255,0.14)";
        c.fillRect(12, 12, w - 24, 26);
        noise(c, w, h, 160, "rgba(255,255,255,0.08)", "rgba(0,0,0,0.08)");
      }) }),
      botDark: new THREE.MeshLambertMaterial({ color: 0x2c2f33 }),
      botGlow: new THREE.MeshLambertMaterial({ color: 0x0b0d10, emissive: 0x67e8f9, emissiveIntensity: 0.9 }),
    };

    function addBox(x, y, z, w, h, d, mat, solid) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || mats.wall);
      m.position.set(x, y + h / 2, z);
      if (solid !== false) m.castShadow = true;
      m.receiveShadow = true;
      world.add(m);
      if (solid !== false) {
        colliders.push({
          min: [x - w / 2, y, z - d / 2],
          max: [x + w / 2, y + h, z + d / 2],
        });
      }
      return m;
    }

    /* 走廊式训练场（对齐原站观感）：分板墙 + 三根高立柱 + 低矮掩体 */
    function buildLane() {
      addBox(0, -0.5, 0, 84, 0.5, 26, mats.floor, false);           /* 地面 */
      const L = 40, W = 13;
      /* 分板墙：4m 一板，双色交替，接缝形成竖向条纹 */
      function paneledWall(x0, z0, len, alongX, hgt) {
        const n = Math.round(len / 4);
        const seg = len / n;
        for (let i = 0; i < n; i++) {
          const off = -len / 2 + seg * (i + 0.5);
          const w = alongX ? seg : 1, d = alongX ? 1 : seg;
          addBox(x0 + (alongX ? off : 0), 0, z0 + (alongX ? 0 : off), w, hgt, d, i % 2 ? mats.wall : mats.wall2);
        }
      }
      paneledWall(0, -(L / 2 + 1), L + 8, true, 5);                 /* 底墙 */
      paneledWall(0, L / 2 + 6, L + 8, true, 4);                    /* 身后墙 */
      paneledWall(-(W / 2 + 0.5), 0, L, false, 5);                  /* 左墙 */
      paneledWall(W / 2 + 0.5, 0, L, false, 5);                     /* 右墙 */
      /* 门楣装饰条 */
      const strip = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 0.25, 0.25), mats.accent);
      strip.position.set(0, 4.5, -(L / 2 + 1.15));
      world.add(strip);
      /* 三根高立柱（原站训练厅意象） */
      [[-3.2, -14], [0.2, -19], [3.6, -24]].forEach(([x, z]) => {
        addBox(x, 0, z, 1.3, 5, 1.3, mats.wall2);
      });
      /* 低矮掩体：双侧交错 */
      const crates = [
        [-4.3, 1.0, -9], [4.5, 1.2, -12], [-3.8, 1.4, -26], [4.2, 1.0, -30],
      ];
      crates.forEach(([x, s, z]) => {
        addBox(x, 0, z, s * 2, s * 2, s * 2, mats.crate);
      });
      return { spawn: [0, 0, 16], yaw: 0 /* 面向 -z 走廊深处 */, laneLen: L, halfW: W / 2 - 0.6 };
    }

    /* ---------------- Bot（训练机器人，参考原站黄色靶机意象） ---------------- */
    const bots = [];
    function makeBot() {
      const g = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mats.botBody);
      head.position.y = 1.62;
      /* 目镜（朝向玩家一侧 = 本地 +z） */
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06), mats.botGlow);
      visor.position.set(0, 1.64, 0.21);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 5), mats.botDark);
      antenna.position.set(0.12, 1.9, 0);
      /* 背包单元（本地 -z 为背面） */
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.16), mats.botDark);
      pack.position.set(0, 1.12, -0.34);
      const packStripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.03), mats.botGlow);
      packStripe.position.set(0, 1.2, -0.43);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.8, 10), mats.botBody);
      body.position.y = 1.06;
      const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), mats.botGlow);
      chest.rotation.x = Math.PI / 2;
      chest.position.set(0, 1.16, 0.36);
      const shL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mats.botDark);
      shL.position.set(-0.4, 1.36, 0);
      const shR = shL.clone(); shR.position.x = 0.4;
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.52, 7), mats.botDark);
      armL.position.set(-0.42, 1.02, 0);
      const armR = armL.clone(); armR.position.x = 0.42;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.52, 10), mats.botDark);
      skirt.position.y = 0.42;
      const hover = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.07, 10), mats.botGlow);
      hover.position.y = 0.12;
      const parts = [head, body, skirt, armL, armR, shL, shR, pack];
      parts.forEach((m) => g.add(m));
      g.add(visor, antenna, chest, hover, packStripe);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      /* 命中判定面：头 / 身 */
      head.userData.part = "head";
      parts.forEach((m) => { if (m !== head) m.userData.part = "body"; });
      const bot = {
        group: g, alive: false, parts,
        pos: new THREE.Vector3(), dieT: 0, respawnT: 0,
        bobPhase: Math.random() * 6.28,
      };
      g.userData.bot = bot;
      parts.forEach((m) => { m.userData.bot = bot; });
      scene.add(g);
      bots.push(bot);
      return bot;
    }
    function placeBot(bot, x, z) {
      bot.pos.set(x, 0, z);
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = Math.atan2(cam.position.x - x, cam.position.z - z);
      bot.group.visible = true;
      bot.group.rotation.z = 0;
      bot.alive = true;
    }
    function botSpot(i, lane) {
      /* 沿走廊确定性布点（同 NO 同布局），微偏移避开掩体 */
      const n = 9;
      const z = -6 - (i % n) * ((lane.laneLen - 14) / (n - 1)) + (i >= n ? -3 : 0);
      const side = i % 2 ? 1 : -1;
      const x = side * (1.6 + ((i * 7919) % 23) / 23 * 3.2);
      return [x, z];
    }

    /* ---------------- 武器持模型（步枪 + 双手，参考原站暴徒样式） ----------------
     * 金属质感：Standard 材质 + HDR 环境贴图（Poly Haven CC0），
     * HDR 加载失败时退回程序化房间环境 */
    const pmrem = new THREE.PMREMGenerator(renderer);
    function applyEnv(tex) {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
    }
    if (window.THREE.RGBELoader) {
      new THREE.RGBELoader().load(
        "assets/hdri/kloppenheim_02_puresky_1k.hdr",
        (tex) => applyEnv(tex),
        undefined,
        () => { /* 失败 → 程序化环境 */ }
      );
    }
    if (!scene.environment) {
      const envScene = new THREE.Scene();
      const envRoom = new THREE.Mesh(
        new THREE.SphereGeometry(12, 16, 12),
        new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x6b7684 })
      );
      envScene.add(envRoom);
      const envLight1 = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      envLight1.position.set(0, 9, 0);
      envLight1.rotation.x = Math.PI / 2;
      envScene.add(envLight1);
      const envLight2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ color: 0xd8e2ee }));
      envLight2.position.set(0, 2, -9);
      envScene.add(envLight2);
      scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    }

    const METAL = new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeTex(256, 256, (c, w, h) => drawMetal(c, w, h, 0x343941)), metalness: 0.85, roughness: 0.34 });
    const POLY = new THREE.MeshStandardMaterial({ color: 0x1c1f24, metalness: 0.2, roughness: 0.7 });
    const TAN = new THREE.MeshStandardMaterial({ color: 0xb3a06a, metalness: 0.4, roughness: 0.55 });
    const GLOVE = new THREE.MeshStandardMaterial({ color: 0x363b42, metalness: 0.05, roughness: 0.9 });
    const SLEEVE = new THREE.MeshStandardMaterial({ color: 0xd9d5cc, metalness: 0.0, roughness: 0.95 });

    const viewmodel = new THREE.Group();
    const gun = new THREE.Group();
    function part(geo, mat, x, y, z, rx, ry, rz) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      if (ry) m.rotation.y = ry;
      if (rz) m.rotation.z = rz;
      gun.add(m);
      return m;
    }
    /* 机匣 */
    part(new THREE.BoxGeometry(0.058, 0.09, 0.34), METAL, 0, 0, 0);
    /* 机匣顶部导轨 */
    part(new THREE.BoxGeometry(0.04, 0.02, 0.3), POLY, 0, 0.055, -0.02);
    /* 护木 + 侧板（沙色） */
    part(new THREE.BoxGeometry(0.05, 0.062, 0.24), POLY, 0, -0.005, -0.3);
    part(new THREE.BoxGeometry(0.054, 0.04, 0.2), TAN, 0, 0.012, -0.3);
    /* 枪管 + 消焰器 */
    part(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), METAL, 0, 0.01, -0.5, Math.PI / 2);
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8), METAL, 0, 0.01, -0.61, Math.PI / 2);
    /* 准星：前柱 + 后照门 */
    part(new THREE.BoxGeometry(0.008, 0.03, 0.008), METAL, 0, 0.085, -0.55);
    part(new THREE.BoxGeometry(0.03, 0.022, 0.02), METAL, 0, 0.082, 0.1);
    /* 弹匣（前倾） */
    part(new THREE.BoxGeometry(0.042, 0.15, 0.085), POLY, 0, -0.11, -0.05, 0.18);
    /* 握把（后倾） */
    part(new THREE.BoxGeometry(0.036, 0.11, 0.05), POLY, 0, -0.09, 0.12, -0.3);
    /* 枪托（向镜头方向） */
    part(new THREE.BoxGeometry(0.05, 0.075, 0.16), POLY, 0, -0.015, 0.26);
    /* 拉机柄 */
    part(new THREE.BoxGeometry(0.05, 0.014, 0.05), METAL, 0.028, 0.02, 0.02);
    /* 沙色细节件 */
    part(new THREE.BoxGeometry(0.06, 0.03, 0.06), TAN, 0, -0.045, 0.02);
    /* 抛壳窗（右侧凹陷） */
    part(new THREE.BoxGeometry(0.006, 0.035, 0.09), POLY, 0.031, 0.012, -0.06);
    /* 扳机护圈 + 扳机 */
    part(new THREE.BoxGeometry(0.008, 0.008, 0.07), METAL, 0, -0.052, 0.075);
    part(new THREE.BoxGeometry(0.008, 0.035, 0.012), METAL, 0, -0.038, 0.05);
    /* 护木散热孔（两侧） */
    for (let i = 0; i < 3; i++) {
      part(new THREE.BoxGeometry(0.056, 0.012, 0.03), POLY, 0, 0.02 - i * 0.022, -0.24 - i * 0.045);
    }
    /* 枪托底垫 */
    part(new THREE.BoxGeometry(0.054, 0.09, 0.014), TAN, 0, -0.015, 0.345);

    /* 右手（握把） + 右小臂（白袖） */
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), GLOVE);
    handR.scale.set(0.8, 1.1, 1.15);
    handR.position.set(0.012, -0.125, 0.12);
    gun.add(handR);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.26, 8), SLEEVE);
    armR.position.set(0.07, -0.24, 0.24);
    armR.rotation.set(1.15, 0, -0.3);
    gun.add(armR);
    /* 左手（护木下） + 左小臂 */
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), GLOVE);
    handL.scale.set(0.85, 1.05, 1.2);
    handL.position.set(-0.005, -0.068, -0.3);
    gun.add(handL);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, 0.28, 8), SLEEVE);
    armL.position.set(-0.11, -0.19, -0.1);
    armL.rotation.set(0.9, 0, 0.6);
    gun.add(armL);

    viewmodel.add(gun);
    viewmodel.scale.setScalar(0.85);
    viewmodel.position.set(0.185, -0.175, -0.42);
    viewmodel.rotation.y = -0.05;
    cam.add(viewmodel);
    scene.add(cam);

    /* ---------------- 抛壳 / 枪口焰 ---------------- */
    const shellGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 6);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xd3a94f, metalness: 0.9, roughness: 0.3 });
    const shells = [];
    function ejectShell() {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.position.copy(cam.localToWorld(new THREE.Vector3(0.28, -0.08, -0.22)));
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      scene.add(m);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      shells.push({
        m,
        vel: right.multiplyScalar(1.2 + Math.random() * 0.8).add(new THREE.Vector3(0, 2 + Math.random(), 0)),
        spin: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7),
        life: 1.1,
      });
      if (shells.length > 24) scene.remove(shells.shift().m);
    }
    const flashTex = makeTex(128, 128, drawFlash);
    const flashSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flashSprite.visible = false;
    scene.add(flashSprite);
    let flashT = 0;
    function showMuzzleFlash(worldPos) {
      flashSprite.position.copy(worldPos);
      flashSprite.quaternion.copy(cam.quaternion);
      flashSprite.rotation.z += Math.random() * 6.28;
      const s = 0.8 + Math.random() * 0.5;
      flashSprite.scale.set(s, s, 1);
      flashSprite.visible = true;
      flashT = 0.05;
    }

    /* ---------------- 粒子（爆散 / 火花 / 出生光柱） ---------------- */
    const particles = [];
    const partGeo = new THREE.BoxGeometry(1, 1, 1);
    function burst(center, colors, opts) {
      const { count = 12, size = 0.05, speed = 3, up = 1.6, life = 0.6, g = 9 } = opts || {};
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }));
        m.scale.setScalar(size * (0.6 + Math.random() * 0.9));
        m.position.copy(center);
        m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        scene.add(m);
        particles.push({
          m,
          vel: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.25, Math.random() - 0.5)
            .normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.9))
            .add(new THREE.Vector3(0, up, 0)),
          spin: (Math.random() - 0.5) * 12,
          life, max: life, g,
        });
      }
      if (particles.length > 140) {
        particles.splice(0, particles.length - 140).forEach((p) => { scene.remove(p.m); p.m.material.dispose(); });
      }
    }
    function spawnBeamFx(x, z) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 5.5, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
      );
      m.position.set(x, 2.75, z);
      scene.add(m);
      particles.push({ m, beam: true, life: 0.45, max: 0.45 });
    }

    /* ---------------- 曳光 / 弹孔 / 枪口焰 ---------------- */
    const fx = { tracers: [], holes: [], flash: null };
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85 });
    function tracer(from, to, color) {
      const len = from.distanceTo(to);
      const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 4, 1, true);
      geo.translate(0, -len / 2, 0);
      const m = new THREE.Mesh(geo, tracerMat.clone());
      if (color) m.material.color.set(color);
      m.position.copy(from);
      m.lookAt(to);
      m.rotateX(Math.PI / 2);
      scene.add(m);
      fx.tracers.push({ m, life: 0.07 });
    }
    const holeGeo = new THREE.CircleGeometry(0.035, 8);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 });
    function hole(point, normal) {
      const m = new THREE.Mesh(holeGeo, holeMat);
      m.position.copy(point).addScaledVector(normal, 0.01);
      m.lookAt(point.clone().add(normal));
      scene.add(m);
      fx.holes.push(m);
      if (fx.holes.length > 46) scene.remove(fx.holes.shift());
    }
    const flashLight = new THREE.PointLight(0xffc46b, 0, 7);
    scene.add(flashLight);
    function muzzleFlash(worldPos) {
      flashLight.position.copy(worldPos);
      flashLight.intensity = 2.4;
    }

    /* ---------------- 小地图（俯视 2D） ---------------- */
    const mm = document.querySelector(".hud-minimap");
    const mmCtx = mm ? mm.getContext("2d") : null;
    function drawMinimap() {
      if (!mmCtx) return;
      const W = mm.width, H = mm.height;
      const X = (x) => W / 2 + (x / 17) * W;
      const Y = (z) => ((z + 24) / 50) * H;
      mmCtx.clearRect(0, 0, W, H);
      mmCtx.save();
      mmCtx.beginPath();
      mmCtx.arc(W / 2, H / 2, W / 2 - 2, 0, 7);
      mmCtx.clip();
      mmCtx.fillStyle = "rgba(13, 16, 22, 0.85)";
      mmCtx.fillRect(0, 0, W, H);
      /* 墙体与掩体 */
      for (const c of colliders) {
        mmCtx.fillStyle = c.max[1] > 2.5 ? "rgba(214,226,240,0.30)" : "rgba(214,226,240,0.14)";
        mmCtx.fillRect(
          X(c.min[0]), Y(c.min[2]),
          X(c.max[0]) - X(c.min[0]), Y(c.max[2]) - Y(c.min[2])
        );
      }
      /* Bot */
      for (const b of bots) {
        if (!b.alive) continue;
        mmCtx.fillStyle = "#f5a623";
        mmCtx.beginPath();
        mmCtx.arc(X(b.pos.x), Y(b.pos.z), 2.6, 0, 7);
        mmCtx.fill();
      }
      /* 玩家箭头 */
      const px = X(player.pos.x), py = Y(player.pos.z);
      mmCtx.save();
      mmCtx.translate(px, py);
      mmCtx.rotate(-player.yaw);
      mmCtx.fillStyle = "#67c1f5";
      mmCtx.beginPath();
      mmCtx.moveTo(0, -6.5);
      mmCtx.lineTo(4.6, 5.4);
      mmCtx.lineTo(0, 2.8);
      mmCtx.lineTo(-4.6, 5.4);
      mmCtx.closePath();
      mmCtx.fill();
      mmCtx.restore();
      mmCtx.restore();
    }

    /* ---------------- 玩家状态 ---------------- */
    const player = {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      yaw: 0, pitch: 0, onGround: true,
      mag: MAG_SIZE, reloading: 0,
      fireCd: 0, firing: false, burst: 0, lastShot: 0,
      pitchKick: 0, hp: 100, hpMax: 100, moveLocked: false,
    };
    const keys = {};
    const vmSway = { x: 0, y: 0 };
    let vmBob = 0;
    const stats = (session.stats = { kills: 0, head: 0, shots: 0, hits: 0, score: 0, timeLeft: drillDuration(drill), over: false });

    /* ---------------- 布局与生成 ---------------- */
    let lane = null;
    let seeded = 7;
    function srand() { seeded = (seeded * 1103515245 + 12345) >>> 0; return seeded / 4294967296; }
    function seedFrom(no) { seeded = 7; for (const c of no) seeded = (seeded * 31 + c.charCodeAt(0)) >>> 0; }

    function spawnBots() {
      seedFrom(drill.no + (drill.resrandom ? "_" + Date.now() : ""));
      const n = 8;
      for (let i = 0; i < n; i++) {
        const bot = bots[i] || makeBot();
        let [x, z] = botSpot(i, lane);
        /* 简单避开掩体：与箱堆太近就横移 */
        for (const c of colliders) {
          if (Math.abs(x - (c.min[0] + c.max[0]) / 2) < 1.1 && Math.abs(z - (c.min[2] + c.max[2]) / 2) < 1.1) {
            x += x < 0 ? -1.2 : 1.2;
          }
        }
        placeBot(bot, x, z);
      }
    }

    /* ---------------- 输入 ---------------- */
    const canvasEl = canvas;
    let locked = () => document.pointerLockElement === canvasEl;

    function onMouseMove(e) {
      if (!session.live || session.paused) return;
      if (!locked() && !session.fallbackAim) return;
      const f = sensFactor();
      player.yaw -= e.movementX * f;
      player.pitch -= e.movementY * f;
      player.pitch = Math.max(-85 * DEG, Math.min(85 * DEG, player.pitch));
    }
    function onMouseDown(e) {
      if (!session.live || session.paused || e.button !== 0) return;
      if (!locked() && !session.fallbackAim) return;
      player.firing = true;
    }
    function onMouseUp() { player.firing = false; player.burst = 0; }
    function onKeyDown(e) {
      if (!session.live || session.paused) return;
      keys[e.code] = true;
      if (e.code === "KeyR") startReload();
      if (e.code === "Space" && player.onGround) { player.vel.y = JUMP; player.onGround = false; }
    }
    function onKeyUp(e) { keys[e.code] = false; }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    /* ---------------- 射击 ---------------- */
    const ray = new THREE.Raycaster();
    ray.far = 200;
    const botMeshes = () => bots.filter((b) => b.alive).flatMap((b) => b.parts);

    function tryFire(now) {
      if (player.reloading > 0 || player.fireCd > 0 || stats.over) return;
      if (player.mag <= 0) { startReload(); return; }
      player.mag--; stats.shots++;
      player.fireCd = FIRE_INT;
      player.burst++;
      player.lastShot = now;
      if (window.AIM_SFX) AIM_SFX.shot();

      /* 散布：连续射击 + 移动/空中扩大 */
      const moving = player.vel.lengthSq() > 3;
      let spread = 0.0012 + Math.min(0.026, player.burst * 0.0022);
      if (moving) spread += 0.011;
      if (!player.onGround) spread += 0.03;

      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      ray.set(cam.position, dir);

      const hits = ray.intersectObjects([...botMeshes(), ...world.children], false);
      const muzzle = cam.localToWorld(new THREE.Vector3(0.24, -0.18, -0.8));
      muzzleFlash(muzzle);
      showMuzzleFlash(muzzle);
      ejectShell();
      const end = hits.length ? hits[0].point : cam.position.clone().addScaledVector(dir, 120);
      tracer(muzzle, end);
      /* 调试：最近一发的射线与首个命中 */
      api.lastRay = {
        from: cam.position.clone().toArray(),
        dir: dir.toArray(),
        hit: hits.length
          ? { name: hits[0].object.userData.part || hits[0].object.geometry?.type || "world", point: hits[0].point.toArray(), dist: hits[0].distance }
          : null,
      };

      player.pitchKick += 0.0038 + Math.min(0.004, player.burst * 0.0006);
      viewmodel.position.z = -0.36; /* 枪身后坐，渲染循环里回位 */

      if (hits.length) {
        const h = hits[0];
        const bot = h.object.userData.bot;
        if (bot && bot.alive) {
          killBot(bot, h.object.userData.part === "head");
          stats.hits++;
          burst(h.point, [0x67e8f9, 0xf59e1b, 0xffe9c2], { count: 6, size: 0.035, speed: 2.4, up: 0.6, life: 0.4, g: 6 });
        } else {
          const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate();
          hole(h.point, n);
          burst(h.point.clone().addScaledVector(n, 0.03), [0x9aa4ad, 0x5c646b], { count: 4, size: 0.03, speed: 1.6, up: 0.9, life: 0.35, g: 8 });
        }
      }
      if (player.mag === 0) startReload();
      updateAmmoHud();
      updateAccHud();
    }

    function startReload() {
      if (player.reloading > 0 || player.mag === MAG_SIZE) return;
      player.reloading = RELOAD_T;
      session.hud.ammo(player.mag, "∞");
      $(".hud-ammo", rootEl()).classList.add("is-reload");
      session.hud.msg("换弹中…", RELOAD_T * 1000);
      if (window.AIM_SFX) AIM_SFX.reload();
    }
    function rootEl() { return document.querySelector(".game-root"); }

    function killBot(bot, isHead) {
      bot.alive = false;
      bot.dieT = 0.42;
      /* 重生策略交给练法层；无 runtime 时随机重生 */
      bot.respawnT = (session.runtime && session.runtime.controlsRespawns)
        ? 1e9
        : 0.9 + Math.random() * 0.6;
      stats.kills++;
      const add = isHead ? 150 : 100;
      stats.score += add;
      if (isHead) stats.head++;
      session.hud.score(stats.score);
      session.hud.msg(isHead ? `<b style="color:var(--red)">+${add} 爆头击杀</b>` : `+${add} 击杀`, 700);
      const cross = document.querySelector(".hud-cross");
      cross.classList.add("is-hit");
      setTimeout(() => cross.classList.remove("is-hit"), 110);
      if (window.AIM_SFX) AIM_SFX.hit(isHead);
      /* 击杀爆散：机体碎屑 + 发光核心 */
      const center = bot.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
      burst(center, [0xf59e1b, 0x2c2f33, 0x67e8f9], { count: isHead ? 18 : 14, size: 0.055, speed: 3.2, up: 1.8, life: 0.65, g: 9 });
      if (session.runtime && session.runtime.onKill) session.runtime.onKill(bot, isHead);
    }

    /* ---------------- 受击（练法层调用） ---------------- */
    function damagePlayer(dmg) {
      if (stats.over || player.hp <= 0) return;
      player.hp = Math.max(0, player.hp - dmg);
      session.hud.hp((player.hp / player.hpMax) * 100);
      $(".hud-hp", rootEl()).classList.toggle("is-low", player.hp / player.hpMax < 0.35);
      const dmgEl = $(".hud-damage", rootEl());
      dmgEl.style.opacity = "1";
      setTimeout(() => { dmgEl.style.opacity = "0"; }, 70);
      if (window.AIM_SFX) AIM_SFX.hurt();
      if (player.hp <= 0 && session.runtime && session.runtime.onPlayerDead) {
        session.runtime.onPlayerDead();
      }
    }

    /* ---------------- 碰撞 ---------------- */
    function collide(pos) {
      const lo = [pos.x - R, pos.y, pos.z - R], hi = [pos.x + R, pos.y + EYE + 0.1, pos.z + R];
      for (const c of colliders) {
        if (lo[0] < c.max[0] && hi[0] > c.min[0] &&
            lo[1] < c.max[1] && hi[1] > c.min[1] &&
            lo[2] < c.max[2] && hi[2] > c.min[2]) return c;
      }
      return null;
    }
    function movePlayer(dt) {
      const sp = keys.ShiftLeft || keys.ShiftRight ? 2.6 : 5.2;
      const f = player.moveLocked ? 0 : (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      const r = player.moveLocked ? 0 : (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      let vx = (-sin * f + cos * r), vz = (-cos * f - sin * r);
      const len = Math.hypot(vx, vz) || 1;
      vx = vx / len * sp * (f || r ? 1 : 0);
      vz = vz / len * sp * (f || r ? 1 : 0);

      player.pos.x += vx * dt;
      if (collide(player.pos)) player.pos.x -= vx * dt;
      player.pos.z += vz * dt;
      if (collide(player.pos)) player.pos.z -= vz * dt;

      player.vel.y -= GRAV * dt;
      player.pos.y += player.vel.y * dt;
      if (player.pos.y <= 0) { player.pos.y = 0; player.vel.y = 0; player.onGround = true; }
      const c = collide(player.pos);
      if (c) { /* 落进几何里 → 顶回上方 */
        if (player.vel.y < 0 && player.pos.y < c.max[1] && player.pos.y > c.max[1] - 0.6) {
          player.pos.y = c.max[1]; player.vel.y = 0; player.onGround = true;
        } else {
          player.pos.y = Math.max(0, player.pos.y - player.vel.y * dt);
          player.vel.y = 0;
        }
      }
      player.vel.x = vx; player.vel.z = vz;
    }

    /* ---------------- 帧循环 ---------------- */
    let t = 0;
    function render(dt, now) {
      t += dt;
      api._renderFrames = (api._renderFrames || 0) + 1;
      if (session.live && !session.paused && !stats.over) {
        api._liveFrames = (api._liveFrames || 0) + 1;
        if (session.runtime && session.runtime.update) session.runtime.update(dt, t);
        if (player.firing) tryFire(now);
        player.fireCd = Math.max(0, player.fireCd - dt);
        if (player.reloading > 0) {
          player.reloading -= dt;
          if (player.reloading <= 0) {
            player.mag = MAG_SIZE;
            $(".hud-ammo", rootEl()).classList.remove("is-reload");
            updateAmmoHud();
          }
        }
        movePlayer(dt);
        /* 倒计时 */
        stats.timeLeft -= dt;
        session.hud.time(stats.timeLeft);
        $(".hud-time-cell", rootEl()).classList.toggle("is-low", stats.timeLeft <= 10);
        if (stats.timeLeft <= 0 && !stats.over) {
          stats.over = true;
          session.hud.msg("时间到", 1600);
          if (session.runtime && session.runtime.onOver) session.runtime.onOver("timeup");
        }
      /* Bot 死亡动画与重生 */
      for (const b of bots) {
        if (!b.alive) {
          if (b.dieT > 0) {
            b.dieT -= dt;
            b.group.rotation.z = Math.min(Math.PI / 2, b.group.rotation.z + dt * 6);
            b.group.position.y = Math.max(-0.5, b.group.position.y - dt * 1.2);
            if (b.dieT <= 0) b.group.visible = false;
          } else if (stats.over === false && !(session.runtime && session.runtime.controlsRespawns)) {
            /* 练法层接管生成节奏时，内建随机重生不生效 */
            b.respawnT -= dt;
            if (b.respawnT <= 0 && session.live) {
              const x = (srand() - 0.5) * 2 * (lane.halfW - 1);
              const z = -5 - srand() * (lane.laneLen - 12);
              placeBot(b, x, z);
            }
          }
        }
      }
      /* 悬浮待机 + 目镜呼吸 */
      for (const b of bots) {
        if (b.alive) b.group.position.y = 0.08 + Math.sin(t * 2.2 + b.bobPhase) * 0.06;
      }
      mats.botGlow.emissiveIntensity = 0.75 + Math.sin(t * 3) * 0.25;
      }

      /* 相机与视觉恢复（暂停时保持画面静止） */
      player.pitchKick = Math.max(0, player.pitchKick - dt * 0.02);
      cam.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
      cam.rotation.set(player.pitch + player.pitchKick, player.yaw, 0);
      /* 武器动画：待机呼吸 + 移动摆动 + 开火后坐 + 换弹下沉 */
      const speed = Math.hypot(player.vel.x, player.vel.z);
      vmSway.x += ((keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0)) * 0.012 - vmSway.x * Math.min(1, dt * 6);
      vmSway.y += ((keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)) * 0.008 - vmSway.y * Math.min(1, dt * 6);
      vmBob += dt * (4 + speed * 1.4);
      const bobAmp = Math.min(1, speed / 5) * 0.011;
      const idleX = Math.sin(t * 1.4) * 0.0035, idleY = Math.cos(t * 1.1) * 0.003;
      const rel = player.reloading > 0 ? Math.sin(Math.min(1, player.reloading / RELOAD_T) * Math.PI) : 0;
      viewmodel.position.set(
        0.2 + idleX - vmSway.x * 0.5 + Math.cos(vmBob) * bobAmp * 0.7,
        -0.18 + idleY + vmSway.y * 0.4 + Math.abs(Math.sin(vmBob)) * bobAmp - rel * 0.09,
        -0.4 + (viewmodel.position.z + 0.4) * 0.82 /* 开火后坐回弹 */
      );
      gun.rotation.set(
        (viewmodel.position.z + 0.4) * -2.2 - rel * 0.55 + Math.sin(vmBob * 0.5) * bobAmp * 0.8,
        0,
        -vmSway.x * 0.6
      );

      fx.tracers = fx.tracers.filter((tr) => {
        tr.life -= dt;
        tr.m.material.opacity = Math.max(0, tr.life / 0.07) * 0.85;
        if (tr.life <= 0) { scene.remove(tr.m); tr.m.geometry.dispose(); return false; }
        return true;
      });
      /* 弹壳物理 */
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        s.life -= dt;
        s.vel.y -= 9.8 * dt;
        s.m.position.addScaledVector(s.vel, dt);
        s.m.rotation.x += s.spin.x * dt;
        s.m.rotation.y += s.spin.y * dt;
        s.m.rotation.z += s.spin.z * dt;
        if (s.m.position.y < 0.015 && s.vel.y < 0) {
          s.m.position.y = 0.015;
          s.vel.set(0, 0, 0);
          s.spin.set(0, 0, 0);
        }
        if (s.life < 0.3) s.m.scale.setScalar(Math.max(0.01, s.life / 0.3));
        if (s.life <= 0) { scene.remove(s.m); shells.splice(i, 1); }
      }
      /* 枪口焰衰减 */
      if (flashT > 0) {
        flashT -= dt;
        flashSprite.material.opacity = Math.max(0, flashT / 0.05);
        if (flashT <= 0) flashSprite.visible = false;
      }
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 30);
      /* 粒子 */
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        const k = Math.max(0, p.life / p.max);
        if (p.beam) {
          p.m.material.opacity = k * 0.45;
          p.m.scale.set(0.6 + k * 0.4, 1, 0.6 + k * 0.4);
        } else {
          p.vel.y -= (p.g || 9) * dt;
          p.m.position.addScaledVector(p.vel, dt);
          if (p.m.position.y < 0.02) { p.m.position.y = 0.02; p.vel.y *= -0.35; p.vel.x *= 0.7; p.vel.z *= 0.7; }
          p.m.rotation.y += p.spin * dt;
          p.m.rotation.x += p.spin * 0.7 * dt;
          p.m.material.opacity = k;
        }
        if (p.life <= 0) {
          scene.remove(p.m);
          if (p.beam) p.m.geometry.dispose();
          p.m.material.dispose();
          particles.splice(i, 1);
        }
      }

      drawMinimap();
      renderer.render(scene, cam);
    }

    function updateAmmoHud() { session.hud.ammo(player.mag, "∞"); }
    function updateAccHud() {
      session.hud.acc(stats.shots ? Math.round((stats.hits / stats.shots) * 100) + "%" : null);
    }

    /* ---------------- 生命周期 ---------------- */
    let built = false;
    function build() {
      lane = buildLane();
      built = true;
    }
    function resetPlayer() {
      player.pos.set(lane.spawn[0], 0, lane.spawn[2]);
      player.vel.set(0, 0, 0);
      player.yaw = lane.yaw; player.pitch = 0;
      player.mag = MAG_SIZE; player.reloading = 0; player.firing = false;
    }

    const api = {
      /* 加载步骤：真实分摊构建工作 */
      onLoadStep(i) {
        if (i === 1 && !built) build();
        if (i === 2) { /* 碰撞盒已在 build 中生成 */ }
        if (i === 3 && !bots.length) spawnBots();
        if (i === 4) { resetPlayer(); renderer.render(scene, cam); }
      },
      start() {
        resetPlayer();
        player.hp = player.hpMax = 100;
        spawnBots();
        stats.timeLeft = drillDuration(drill);
        stats.over = false;
        session.hud.time(stats.timeLeft);
        updateAmmoHud();
        session.hud.hp(100);
        $(".hud-hp", rootEl()).classList.remove("is-low");
        session.hud.msg(`<b>${drill.title}</b>`, 1500);
        if (session.runtime && session.runtime.start) session.runtime.start();
      },
      restart() {
        stats.kills = stats.head = stats.shots = stats.hits = stats.score = 0;
        session.hud.score(0);
        fx.holes.forEach((m) => scene.remove(m));
        fx.holes.length = 0;
        this.start();
      },
      setPaused() {},
      resize(w, hgt) {
        renderer.setSize(w, hgt, false);
        cam.aspect = w / hgt;
        cam.updateProjectionMatrix();
      },
      render,
      dispose() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mousedown", onMouseDown);
        document.removeEventListener("mouseup", onMouseUp);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        renderer.dispose();
      },
      /* ---- 练法层（drills.js）使用的接口 ---- */
      damagePlayer,
      setHp(n) { player.hpMax = n || 100; player.hp = player.hpMax; session.hud.hp(100); },
      setMoveLocked(v) { player.moveLocked = !!v; },
      placeBotAt(bot, x, z) { placeBot(bot, x, z); },
      hideBot(bot) { bot.alive = false; bot.dieT = 0; bot.group.visible = false; },
      botsList() { return bots; },
      playerInfo() {
        return { pos: player.pos.clone(), yaw: player.yaw, pitch: player.pitch, eye: EYE };
      },
      tracer,
      msg(html, ms) { session.hud.msg(html, ms); },
      spawnFx(x, z) { spawnBeamFx(x, z); },
      /* 视线检测：from→to 之间是否被场景几何遮挡（练法层布点用） */
      losBlocked(from, to) {
        const dir = to.clone().sub(from);
        const dist = dir.length();
        if (dist < 0.001) return false;
        dir.normalize();
        ray.set(from, dir);
        ray.far = dist - 0.1;
        const blocked = ray.intersectObjects(world.children, false).length > 0;
        ray.far = 200;
        return blocked;
      },
      /* 供自动化/调试：不改内部状态即可观察 */
      debug: () => ({
        pos: player.pos.toArray(), yaw: player.yaw, mag: player.mag, stats,
        bots: bots.map((b) => ({ alive: b.alive, p: b.pos.toArray() })),
      }),
      /* 供自动化/调试：看向世界坐标点 */
      aimAt(x, y, z) {
        const dx = x - player.pos.x, dy = y - (player.pos.y + EYE), dz = z - player.pos.z;
        player.yaw = Math.atan2(-dx, -dz);
        player.pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
      },
    };
    /* 初始就绪：加载页打开前也需要场景能渲染 */
    build();
    spawnBots();
    resetPlayer();
    return api;
  };
})();
