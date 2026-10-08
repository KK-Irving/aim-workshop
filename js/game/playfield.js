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

  /* ---------------- 地图主题（灰盒自建，仅取氛围配色） ---------------- */
  const MAP_THEMES = {
    ascent: { sky: 0xa9c6e8, fog: 0xb6c9de, wall: 0xcfc7b8, wall2: 0xb8ab97, floor: 0x9d958a, crate: 0x8a6f4d, accent: 0xd9303f, sun: 0xfff2dc },
    split:  { sky: 0x27384d, fog: 0x2c3d52, wall: 0x5d7086, wall2: 0x4a5b70, floor: 0x3a4759, crate: 0x2f6f8f, accent: 0x53b9ff, sun: 0xcfe4ff },
    haven:  { sky: 0xe8d9b8, fog: 0xdccbaa, wall: 0xd8c49a, wall2: 0xc4a97e, floor: 0xb59d76, crate: 0x9c4a3c, accent: 0xfd4556, sun: 0xffeacc },
    summit: { sky: 0x1f2b26, fog: 0x24322c, wall: 0x3d4f45, wall2: 0x33443b, floor: 0x2b3830, crate: 0x6b5a2e, accent: 0xe0b64f, sun: 0xd9e8d0 },
    lotus:  { sky: 0x9fd8cd, fog: 0xa5d3c6, wall: 0x7fae9e, wall2: 0x6d9a8c, floor: 0x5f8a7c, crate: 0x4a7a6c, accent: 0xff8a5c, sun: 0xf2ffe8 },
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

  /* ============================================================ */
  window.AIM_PLAYFIELD = function (canvas, session) {
    const drill = session.drill;
    const theme = MAP_THEMES[drill.map] || MAP_THEMES.ascent;

    /* ---------------- 渲染基础 ---------------- */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(theme.sky);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(theme.fog, 26, 95);

    const cam = new THREE.PerspectiveCamera(73, 2, 0.08, 220);
    cam.rotation.order = "YXZ";

    scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x33302a, 1.15));
    const sun = new THREE.DirectionalLight(theme.sun, 1.0);
    sun.position.set(18, 30, 10);
    scene.add(sun);

    /* ---------------- 关卡容器与碰撞盒 ---------------- */
    const world = new THREE.Group();
    scene.add(world);
    const colliders = [];  /* {min:[x,y,z], max:[x,y,z]} AABB */
    const mats = {
      wall: new THREE.MeshLambertMaterial({ color: theme.wall }),
      wall2: new THREE.MeshLambertMaterial({ color: theme.wall2 }),
      floor: new THREE.MeshLambertMaterial({ color: theme.floor }),
      crate: new THREE.MeshLambertMaterial({ color: theme.crate }),
      accent: new THREE.MeshLambertMaterial({ color: theme.accent }),
      bot: new THREE.MeshLambertMaterial({ color: 0xd9303f }),
      botHead: new THREE.MeshLambertMaterial({ color: 0xff4655 }),
    };

    function addBox(x, y, z, w, h, d, mat, solid) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || mats.wall);
      m.position.set(x, y + h / 2, z);
      world.add(m);
      if (solid !== false) {
        colliders.push({
          min: [x - w / 2, y, z - d / 2],
          max: [x + w / 2, y + h, z + d / 2],
        });
      }
      return m;
    }

    /* 走廊式训练场：两侧墙 + 纵深掩体，Bot 沿走廊布点 */
    function buildLane() {
      addBox(0, -0.5, 0, 84, 0.5, 26, mats.floor, false);           /* 地面 */
      const L = 40, W = 13;
      addBox(0, 0, -(L / 2 + 1), L + 8, 5, 2, mats.wall2);          /* 底墙 */
      addBox(0, 0, L / 2 + 6, L + 8, 4, 2, mats.wall2);             /* 身后墙 */
      addBox(-(W / 2 + 0.5), 0, 0, 1, 5, L, mats.wall);             /* 左墙 */
      addBox(W / 2 + 0.5, 0, 0, 1, 5, L, mats.wall);                /* 右墙 */
      /* 门楣装饰条（原站卡片的红条意象） */
      const strip = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 0.3, 0.3), mats.accent);
      strip.position.set(0, 4.4, -(L / 2 + 1.2));
      world.add(strip);
      /* 掩体：双侧交错 + 中央箱堆 */
      const crates = [
        [-4.2, 1.1, -9], [4.4, 1.3, -13], [-3.6, 1.6, -19], [3.8, 1.1, -24],
        [-4.4, 1.2, -30], [2.6, 2.0, -33], [0, 1.0, -17], [0.9, 1.0, -27],
      ];
      crates.forEach(([x, s, z]) => {
        addBox(x, 0, z, s * 2, s * 2, s * 2, mats.crate);
        if (s > 1.2) addBox(x + s, 0, z - s * 0.6, s, s, s, mats.wall2);
      });
      /* 两侧立柱（预瞄参考物） */
      [[-5.6, -6], [5.6, -11], [-5.6, -22], [5.6, -31]].forEach(([x, z]) => {
        addBox(x, 0, z, 1.1, 3.4, 1.1, mats.wall2);
      });
      return { spawn: [0, 0, 16], yaw: Math.PI /* 面向 -z */, laneLen: L, halfW: W / 2 - 0.6 };
    }

    /* ---------------- Bot（训练靶机） ---------------- */
    const bots = [];
    function makeBot() {
      const g = new THREE.Group();
      const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.72, 7);
      const bodyGeo = new THREE.CylinderGeometry(0.3, 0.34, 0.78, 9);
      const headGeo = new THREE.SphereGeometry(0.21, 12, 10);
      const legL = new THREE.Mesh(legGeo, mats.bot); legL.position.set(-0.14, 0.36, 0);
      const legR = new THREE.Mesh(legGeo, mats.bot); legR.position.set(0.14, 0.36, 0);
      const body = new THREE.Mesh(bodyGeo, mats.bot); body.position.y = 1.11;
      const head = new THREE.Mesh(headGeo, mats.botHead); head.position.y = 1.66;
      const tag = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.08, 0.06), mats.accent
      );
      tag.position.set(0, 1.32, 0.3);
      [legL, legR, body, head, tag].forEach((m) => g.add(m));
      /* 命中判定面：头 / 身 */
      head.userData.part = "head";
      body.userData.part = "body";
      legL.userData.part = legR.userData.part = "body";
      const bot = {
        group: g, alive: false, parts: [head, body, legL, legR],
        pos: new THREE.Vector3(), dieT: 0, respawnT: 0,
      };
      g.userData.bot = bot;
      head.userData.bot = body.userData.bot = legL.userData.bot = legR.userData.bot = bot;
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

    /* ---------------- 武器持模型（体块枪） ---------------- */
    const viewmodel = new THREE.Group();
    const gunDark = new THREE.MeshLambertMaterial({ color: 0x22262c });
    const gunAccent = new THREE.MeshLambertMaterial({ color: theme.accent });
    const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.42), gunDark);
    const gBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.34), gunDark);
    gBarrel.position.set(0, 0.012, -0.36);
    const gMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.09), gunAccent);
    gMag.position.set(0, -0.11, -0.04);
    const gSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.1), gunDark);
    gSight.position.set(0, 0.075, -0.1);
    viewmodel.add(gBody, gBarrel, gMag, gSight);
    viewmodel.scale.setScalar(0.62);
    viewmodel.position.set(0.2, -0.17, -0.42);
    cam.add(viewmodel);
    scene.add(cam);

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
      mmCtx.fillStyle = "rgba(10, 12, 15, 0.78)";
      mmCtx.fillRect(0, 0, W, H);
      /* 墙体与掩体 */
      for (const c of colliders) {
        mmCtx.fillStyle = c.max[1] > 2.5 ? "rgba(236,232,225,0.20)" : "rgba(236,232,225,0.10)";
        mmCtx.fillRect(
          X(c.min[0]), Y(c.min[2]),
          X(c.max[0]) - X(c.min[0]), Y(c.max[2]) - Y(c.min[2])
        );
      }
      /* Bot */
      for (const b of bots) {
        if (!b.alive) continue;
        mmCtx.fillStyle = "#ff4655";
        mmCtx.beginPath();
        mmCtx.arc(X(b.pos.x), Y(b.pos.z), 2.6, 0, 7);
        mmCtx.fill();
      }
      /* 玩家箭头 */
      const px = X(player.pos.x), py = Y(player.pos.z);
      mmCtx.save();
      mmCtx.translate(px, py);
      mmCtx.rotate(-player.yaw);
      mmCtx.fillStyle = "#ece8e1";
      mmCtx.beginPath();
      mmCtx.moveTo(0, -6);
      mmCtx.lineTo(4.2, 5);
      mmCtx.lineTo(-4.2, 5);
      mmCtx.closePath();
      mmCtx.fill();
      mmCtx.restore();
      mmCtx.strokeStyle = "rgba(253,69,86,0.5)";
      mmCtx.strokeRect(0.5, 0.5, W - 1, H - 1);
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
      const end = hits.length ? hits[0].point : cam.position.clone().addScaledVector(dir, 120);
      tracer(muzzle, end);

      player.pitchKick += 0.0038 + Math.min(0.004, player.burst * 0.0006);
      viewmodel.position.z = -0.38; /* 枪身后坐，渲染循环里回位 */

      if (hits.length) {
        const h = hits[0];
        const bot = h.object.userData.bot;
        if (bot && bot.alive) {
          killBot(bot, h.object.userData.part === "head");
          stats.hits++;
        } else {
          hole(h.point, h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : dir.clone().negate());
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
      if (session.live && !session.paused && !stats.over) {
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
              if (b.dieT <= 0) b.group.visible = false;
            } else if (stats.over === false) {
              b.respawnT -= dt;
              if (b.respawnT <= 0 && session.live) {
                const x = (srand() - 0.5) * 2 * (lane.halfW - 1);
                const z = -5 - srand() * (lane.laneLen - 12);
                placeBot(b, x, z);
              }
            }
          }
        }
      }

      /* 相机与视觉恢复（暂停时保持画面静止） */
      player.pitchKick = Math.max(0, player.pitchKick - dt * 0.02);
      cam.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
      cam.rotation.set(player.pitch + player.pitchKick, player.yaw, 0);
      viewmodel.position.z += (-0.42 - viewmodel.position.z) * Math.min(1, dt * 18);
      viewmodel.rotation.x = player.reloading > 0 ? -0.5 * Math.sin(Math.min(1, player.reloading / RELOAD_T) * Math.PI) : 0;

      fx.tracers = fx.tracers.filter((tr) => {
        tr.life -= dt;
        tr.m.material.opacity = Math.max(0, tr.life / 0.07) * 0.85;
        if (tr.life <= 0) { scene.remove(tr.m); tr.m.geometry.dispose(); return false; }
        return true;
      });
      flashLight.intensity = Math.max(0, flashLight.intensity - dt * 30);

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
