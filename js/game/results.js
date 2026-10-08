/* ============================================================
 * 瓦工坊 · 结算层（仿原站训练记录）
 * show(session, {reason}) 渲染结算面板并把成绩写入 localStorage：
 *   aim-results: { [drillNo]: [{score,kills,head,acc,date}] }
 * recordsFor(no) 供工坊排行榜弹窗合并真实成绩。
 * ============================================================ */
(function () {
  "use strict";

  const KEY = "aim-results";
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveAll(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* 隐私模式等 */ }
  }

  const TITLES = {
    timeup: "训练结束",
    dead: "被击杀 · 训练中断",
    cleared: "训练完成",
    quit: "提前离场",
  };

  function show(session, opts) {
    const el = document.querySelector(".g-results");
    if (!el) return;
    const s = session.stats;
    const drill = session.drill;
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) + "%" : "—";
    const reason = (opts && opts.reason) || "timeup";

    /* 成绩落盘（只有完成/时间到才记入，被杀中断也记录但标记） */
    const all = loadAll();
    const list = all[drill.no] || (all[drill.no] = []);
    const rec = {
      score: s.score, kills: s.kills, head: s.head, acc,
      date: Date.now(), reason,
    };
    list.unshift(rec);
    all[drill.no] = list.slice(0, 20);
    saveAll(all);

    const best = Math.max(0, ...all[drill.no].map((r) => r.score));
    el.innerHTML = `
      <div class="gr-panel">
        <div class="gr-tag">${reason === "dead" ? "FAIL" : reason === "cleared" ? "CLEAR" : "RESULT"}</div>
        <b class="gr-title">${TITLES[reason] || "训练结束"}</b>
        <p class="gr-sub">${drill.title}</p>
        <div class="gr-grid">
          <div><small>得分</small><b>${s.score}${s.score >= best && s.score > 0 ? '<i class="gr-best">最佳</i>' : ""}</b></div>
          <div><small>击杀</small><b>${s.kills}</b></div>
          <div><small>爆头</small><b>${s.head}</b></div>
          <div><small>命中率</small><b>${acc}</b></div>
        </div>
        <div class="gr-btns">
          <button class="gr-again" type="button">再练一次</button>
          <button class="gr-quit" type="button">返回工坊</button>
        </div>
        <small class="gr-note">成绩已保存到本机 · 排行榜弹窗可见「我」的记录</small>
      </div>`;
    el.classList.remove("hidden");
  }

  window.AIM_RESULTS = {
    show,
    recordsFor(no) { return loadAll()[no] || []; },
  };
})();
