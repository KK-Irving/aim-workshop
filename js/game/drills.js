/* ============================================================
 * 瓦工坊 · 练法规则层（session.runtime）
 * 把 data.js 里每个项目的「练法 / 难度 / 规则描述」变成实际玩法：
 *
 *   预瞄   走廊沿线布靶，清完一波再刷一波
 *   架枪   锁定走位守角度，Bot 依次从掩体后闪出，超时缩回
 *   背闪   Bot 持续绕后出现，转身补枪
 *   名场面 3-2-1 倒计时后按脚本顺序出一波（空气墙锁走位）
 *
 * 难度（diff）：
 *   l1 简单  Bot 不开枪，纯目标
 *   l3 困难  Bot 有反应延迟后会开枪，命中概率掉血
 * 描述规则：/死亡自动结束/ → 被击杀即结算；否则死亡重开整轮。
 * ============================================================ */
(function () {
  "use strict";

  window.AIM_DRILL_RUNTIME = function (session) {
    const drill = session.drill;
    const pf = session.playfield;
    const hard = drill.diff === "l3";
    const desc = drill.desc || "";
    const deathEnds = /死亡自动结束|自动结束/.test(desc);
    const type = drill.type || "预瞄";

    /* 走廊几何（与 playfield.buildLane 对应） */
    const LANE = { halfW: 4.6, zMin: -34, zMax: -5, spawnZ: 16 };

    let phase = "idle";       /* idle | active | over */
    let queue = [];           /* 帧驱动定时器：{t, fn} */
    let shooting = [];        /* 会开枪的活跃 Bot：{bot, nextShot, react} */
    let peekAnim = null;      /* 架枪闪身动画 */
    let peekTimer = 1.2;
    let peekBot = null;
    let peekLeft = 0;
    let behindTimer = 2.0;
    let wave = 0;
    let sceneTotal = 4;       /* 名场面脚本靶数 */
    let sceneSpawned = 0;

    const rand = (a, b) => a + Math.random() * (b - a);
    const schedule = (delay, fn) => queue.push({ t: delay, fn });

    /* ---------------- 布点（保证从出生点视线可达） ---------------- */
    function eyeOf() {
      const p = pf.playerInfo();
      return new THREE.Vector3(p.pos.x, p.pos.y + 1.6, p.pos.z);
    }
    function visibleSpot(gen) {
      const eye = eyeOf();
      for (let i = 0; i < 8; i++) {
        const [x, z] = gen();
        if (!pf.losBlocked(eye, new THREE.Vector3(x, 1.15, z))) return [x, z];
      }
      return gen(); /* 兜底：多次遮挡就随机放（可能需绕枪） */
    }
    function laneSpot() {
      return visibleSpot(() => [rand(-LANE.halfW, LANE.halfW), rand(LANE.zMin, LANE.zMax)]);
    }
    function behindSpot() {
      const p = pf.playerInfo();
      /* forward = (-sin(yaw), -cos(yaw))，取反即身后方向，再散布 ±40°；
         钳制在场内，避免生成进背后墙/边墙里 */
      const a = p.yaw + Math.PI + rand(-0.7, 0.7);
      const d = rand(6, 8);
      const x = Math.max(-LANE.halfW, Math.min(LANE.halfW, p.pos.x - Math.sin(a) * d));
      const z = Math.max(LANE.zMin, Math.min(22, p.pos.z - Math.cos(a) * d));
      return [x, z];
    }
    function holdSpot() {
      const p = pf.playerInfo();
      const a = p.yaw + rand(-0.55, 0.55); /* 前方扇形 */
      const d = rand(9, 16);
      return visibleSpot(() => [p.pos.x - Math.sin(a) * d, p.pos.z - Math.cos(a) * d]);
    }

    /* ---------------- 生成 / 回收 ---------------- */
    function freeBot() {
      const list = pf.botsList();
      const dead = list.find((b) => !b.alive);
      return dead || null;
    }
    function spawnAt(spotFn, opts) {
      const bot = freeBot();
      if (!bot) return null;
      pf.placeBotAt(bot, spotFn()[0], spotFn()[1]);
      /* 弹出动画：从地面长出 0.25s */
      bot.group.scale.y = 0.15;
      bot.grow = 0.25;
      if (hard && !(opts && opts.peaceful)) {
        shooting.push({ bot, react: rand(0.5, 1.0), nextShot: 0 });
      }
      return bot;
    }
    function despawn(bot) {
      pf.hideBot(bot);
      shooting = shooting.filter((s) => s.bot !== bot);
    }

    /* ---------------- 四种练法 ---------------- */
    function startPrewave() {
      wave++;
      pf.msg(wave > 1 ? `<b>第 ${wave} 波</b>` : `<b>${drill.title}</b>`, 1400);
      for (let i = 0; i < 8; i++) spawnAt(laneSpot, {});
    }
    function startHold() {
      pf.setMoveLocked(true);
      pf.msg(`<b>架枪守点</b> · 走位已锁定，盯住枪线`, 1800);
      scheduleNextPeek(1.2);
    }
    function scheduleNextPeek(t) { peekTimer = t; }
    function doPeek() {
      if (peekBot && peekBot.alive) despawn(peekBot); /* 上一个没打死，缩回 */
      peekBot = spawnAt(holdSpot, {});
      peekLeft = rand(1.3, 1.9);
    }
    function startFlash() {
      pf.msg(`<b>背闪训练</b> · 注意身后脚步声`, 1800);
      scheduleNextBehind(2.0);
    }
    function scheduleNextBehind(t) { behindTimer = t; }
    function doBehind() {
      const b = spawnAt(behindSpot, {});
      if (b) {
        pf.msg(`<b style="color:var(--red)">身后！</b>`, 600);
        if (window.AIM_SFX) AIM_SFX.step();
      }
    }
    function startScene() {
      pf.setMoveLocked(true);
      pf.msg(`<b>3</b>`, 700);
      schedule(0.8, () => pf.msg(`<b>2</b>`, 700));
      schedule(1.6, () => pf.msg(`<b>1</b>`, 700));
      schedule(2.4, () => {
        pf.msg(`<b style="color:var(--red)">GO!</b>`, 600);
        let d = 0;
        for (let i = 0; i < sceneTotal; i++) {
          schedule(d, () => { sceneSpawned++; spawnAt(laneSpot, {}); });
          d += 0.9;
        }
      });
    }

    /* ---------------- 生命周期 ---------------- */
    function start() {
      phase = "active";
      queue = [];
      shooting = [];
      peekBot = null;
      wave = 0;
      sceneSpawned = 0;
      peekTimer = 1.2;
      behindTimer = 2.0;
      pf.setHp(/(\d+)\s*血量/.test(desc) ? +(/(\d+)\s*血量/.exec(desc)[1]) : 100);
      pf.setMoveLocked(false);
      /* 清掉 playfield 预生成的靶机，由练法接管生成节奏 */
      pf.botsList().forEach((b) => pf.hideBot(b));
      if (type === "架枪") startHold();
      else if (type === "背闪") startFlash();
      else if (type === "名场面") startScene();
      else startPrewave();
    }

    function finish(reason) {
      if (phase === "over") return;
      phase = "over";
      session.stats.over = true;
      pf.setMoveLocked(false);
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      if (window.AIM_RESULTS) window.AIM_RESULTS.show(session, { reason });
    }

    function restartRound() {
      pf.msg(`<b style="color:var(--red)">被击杀</b> · 重新开始`, 1400);
      pf.restart();
    }

    /* ---------------- 帧更新 ---------------- */
    function update(dt, t) {
      if (phase !== "active") return;

      /* 定时器队列 */
      for (let i = queue.length - 1; i >= 0; i--) {
        queue[i].t -= dt;
        if (queue[i].t <= 0) {
          const fn = queue[i].fn;
          queue.splice(i, 1);
          fn();
        }
      }

      /* 弹出动画 */
      for (const b of pf.botsList()) {
        if (b.grow > 0 && b.alive) {
          b.grow = Math.max(0, b.grow - dt);
          b.group.scale.y = 0.15 + (1 - b.grow / 0.25) * 0.85;
        }
      }

      /* Bot 开枪（困难） */
      if (hard) {
        for (const s of shooting) {
          if (!s.bot.alive) continue;
          s.react -= dt;
          if (s.react > 0) continue;
          s.nextShot -= dt;
          if (s.nextShot <= 0) {
            s.nextShot = rand(1.4, 2.2);
            botShoot(s.bot);
          }
        }
      }

      /* 练法节奏 */
      if (type === "预瞄") {
        const aliveCount = pf.botsList().filter((b) => b.alive).length;
        if (aliveCount === 0) schedule(1.2, startPrewave);
      } else if (type === "架枪") {
        if (peekBot && peekBot.alive) {
          peekLeft -= dt;
          if (peekLeft <= 0) { despawn(peekBot); peekBot = null; scheduleNextPeek(rand(0.8, 1.6)); }
        } else {
          peekTimer -= dt;
          if (peekTimer <= 0) { doPeek(); }
        }
      } else if (type === "背闪") {
        behindTimer -= dt;
        if (behindTimer <= 0) {
          doBehind();
          scheduleNextBehind(rand(2.0, 3.2));
        }
      } else if (type === "名场面") {
        /* 脚本靶全部出完且场上清空 → 提前完成 */
        if (sceneSpawned >= sceneTotal && !pf.botsList().some((b) => b.alive)) {
          finish("cleared");
        }
      }
    }

    function botShoot(bot) {
      const p = pf.playerInfo();
      const from = bot.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
      const to = p.pos.clone().add(new THREE.Vector3(0, p.eye, 0));
      pf.tracer(from, to, 0xff5a67);
      if (Math.random() < 0.33) {
        pf.damagePlayer(Math.round(rand(20, 30)));
      }
      if (window.AIM_SFX) AIM_SFX.enemyShot();
    }

    /* ---------------- 事件 ---------------- */
    function onKill(bot) {
      shooting = shooting.filter((s) => s.bot !== bot);
      if (type === "架枪" && bot === peekBot) {
        peekBot = null;
        scheduleNextPeek(rand(0.6, 1.2));
      }
      /* 名场面完成判定统一在 update() 里做 */
    }
    function onPlayerDead() {
      if (deathEnds) finish("dead");
      else restartRound();
    }
    function onOver(reason) { finish(reason); }

    return {
      start, update, onKill, onPlayerDead, onOver,
      controlsRespawns: true,
      get phase() { return phase; },
      /* 调试/自动化 */
      debug() {
        return {
          phase, hard, deathEnds, type,
          shooting: shooting.length,
          queue: queue.length,
          aliveBots: pf.botsList().filter((b) => b.alive).length,
        };
      },
    };
  };
})();
