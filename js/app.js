/* ============================================================
 * 瓦工坊 · 仿「瞄准专家」交互逻辑
 * 纯原生 JS：地图切换 / 练法筛选 / 搜索 / 收藏 / 轮播 / 排行榜弹窗
 * ============================================================ */
(function () {
  "use strict";

  const D = window.AIM_DATA;
  const $ = (sel) => document.querySelector(sel);
  const mapName = (key) => (D.maps.find((m) => m.key === key) || {}).name || key;
  const coverOf = (d) => `assets/covers/${d.map}.webp`;
  const sliceOf = (m) => `assets/slices/${m.key}.webp`;

  /* 练法图标（预瞄=准星 / 架枪=盾 / 背闪=回环 / 名场面=星） */
  const TYPE_ICONS = {
    预瞄: '<svg viewBox="0 0 13 13"><circle cx="6.5" cy="6.5" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 0v3M6.5 10v3M0 6.5h3M10 6.5h3" stroke="currentColor" stroke-width="1.4"/></svg>',
    架枪: '<svg viewBox="0 0 13 13"><path d="M6.5 12 1.2 3A6 6 0 0 1 11.8 3Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    背闪: '<svg viewBox="0 0 13 13"><path d="M11 6.5A4.5 4.5 0 1 1 6.5 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M4.8 0.8 6.8 2 5.4 3.9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    名场面: '<svg viewBox="0 0 13 13"><path d="M6.5 1.2 7.9 4.9l4 .2-3.1 2.4 1 3.8-3.3-2.1-3.3 2.1 1-3.8L1.1 5.1l4-.2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  };
  const CROSS_ICON =
    '<svg viewBox="0 0 13 13"><circle cx="6.5" cy="6.5" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.5 0v3M6.5 10v3M0 6.5h3M10 6.5h3" stroke="currentColor" stroke-width="1.4"/></svg>';

  /* ---------------- 状态 ---------------- */
  const state = {
    map: "all",        // all | map key
    type: "全部",       // 全部 | 预瞄 | 架枪 | 背闪 | 名场面
    search: "",
    favs: new Set(JSON.parse(localStorage.getItem("aim-favs") || "[]")),
    sens: parseFloat(localStorage.getItem("aim-sens") || "0.5"),
    featIdx: 0,
  };
  const saveFavs = () =>
    localStorage.setItem("aim-favs", JSON.stringify([...state.favs]));

  const drillByNo = {};
  D.drills.forEach((d) => (drillByNo[d.no] = d));

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function toast(html) {
    const el = $("#toast");
    el.innerHTML = html;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------------- 地图切换条 ---------------- */
  function renderStrip() {
    const counts = {};
    D.drills.forEach((d) => (counts[d.map] = (counts[d.map] || 0) + 1));

    const lockSvg =
      '<svg class="slice-lock" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.3" width="8" height="5.9" fill="currentColor"/><path d="M3.9 5.3V3.9a2.1 2.1 0 0 1 4.2 0v1.4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

    let html =
      `<button class="slice is-all ${state.map === "all" ? "is-on" : ""}" data-map="all" type="button">
        <span class="slice-in">
          <span class="slice-note">${D.maps.length} 张图</span>
          <span class="slice-name">全部地图</span>
          <span class="slice-count">${D.drills.length} <small>个项目</small></span>
        </span>
      </button>`;

    D.maps.forEach((m) => {
      html +=
        `<button class="slice ${state.map === m.key ? "is-on" : ""}" data-map="${m.key}" type="button">
          <span class="slice-in">
            <img src="${sliceOf(m)}" alt="" loading="lazy" />
            ${m.isNew ? '<span class="slice-s-new">新</span>' : ""}
            <span class="slice-name">${m.name}</span>
            <span class="slice-count">${counts[m.key] || 0} <small>个项目</small></span>
          </span>
        </button>`;
    });

    D.lockedMaps.forEach((name) => {
      html +=
        `<div class="slice is-locked" role="img" title="${name}：还没复刻，暂未开放">
          <span class="slice-in">
            <span class="slice-vname">${name}</span>${lockSvg}
          </span>
        </div>`;
    });

    const strip = $("#strip");
    strip.innerHTML = html;
    strip.querySelectorAll("button.slice").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.map = btn.dataset.map;
        renderStrip();
        renderGroups();
      })
    );
  }

  /* ---------------- 练法筛选 ---------------- */
  function renderChips() {
    const types = ["全部", "预瞄", "架枪", "背闪", "名场面"];
    const counts = { 全部: D.drills.length };
    D.drills.forEach((d) => (counts[d.type] = (counts[d.type] || 0) + 1));

    $("#chips").innerHTML = types
      .map((t) => {
        const icon = t === "全部" ? CROSS_ICON : TYPE_ICONS[t];
        return `<button class="chip ${state.type === t ? "is-on" : ""}" data-type="${t}" type="button">
            <span>${icon} ${t} <em>${counts[t] || 0}</em></span>
          </button>`;
      })
      .join("");

    document.querySelectorAll("#chips .chip").forEach((chip) =>
      chip.addEventListener("click", () => {
        state.type = chip.dataset.type;
        renderChips();
        renderGroups();
      })
    );
  }

  /* ---------------- 卡片 ---------------- */
  function diffHtml(d) {
    if (!d.diff) return "";
    const level = d.diff === "l1" ? "l1" : "l3";
    const text = d.diff === "l1" ? "简单" : "困难";
    const bars = [1, 2, 3]
      .map((i) => `<i class="${i <= (level === "l1" ? 1 : 3) ? "on" : ""}"></i>`)
      .join("");
    return `<div class="diff is-${level}">${bars}<span>${text}</span></div>`;
  }

  function cardHtml(d, idx, hotNo) {
    const fav = state.favs.has(d.no);
    return `<article class="card ${hotNo === d.no ? "is-hot" : ""}" style="--i:${idx}" data-no="${d.no}" data-title="${d.title}">
      <div class="card-art">
        <img src="${coverOf(d)}" style="object-position:${d.pos}" alt="${mapName(d.map)}" loading="lazy" />
      </div>
      <span class="card-no">${d.type === "名场面" ? TYPE_ICONS["名场面"] : CROSS_ICON} NO.${d.no}</span>
      <span class="card-mapname">${mapName(d.map)}</span>
      <button class="card-fav ${fav ? "is-on" : ""}" data-fav="${d.no}" type="button"
        aria-pressed="${fav}" title="收藏">
        <svg viewBox="0 0 24 24"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z"/></svg>
      </button>
      <div class="card-body">
        ${diffHtml(d)}
        <h3>${d.title}</h3>
        <p>${d.desc}</p>
        <div class="card-foot">
          <span class="wk-type">${TYPE_ICONS[d.type] || CROSS_ICON} ${d.type}</span>
          <span class="wk-meta"><b>${d.plays}</b> 次游玩</span>
        </div>
      </div>
      <div class="card-hover">
        <button class="btn btn-go" data-play="${d.no}" type="button">
          <svg viewBox="0 0 24 24" width="12" height="12"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>
          开始游玩
        </button>
        <button class="btn btn-board" data-board="${d.no}" type="button">榜单</button>
      </div>
    </article>`;
  }

  function visibleDrills() {
    const kw = state.search.trim().toLowerCase();
    return D.drills.filter((d) => {
      if (state.map !== "all" && d.map !== state.map) return false;
      if (state.type !== "全部" && d.type !== state.type) return false;
      if (kw && !(d.title + d.desc + d.no + mapName(d.map)).toLowerCase().includes(kw)) return false;
      return true;
    });
  }

  function renderGroups() {
    const hotNo = D.featured[state.featIdx] ? D.featured[state.featIdx].no : null;
    const list = visibleDrills();
    const wrap = $("#groups");
    const mapsToShow = state.map === "all" ? D.maps.map((m) => m.key) : [state.map];

    let html = "";
    let shown = 0;
    mapsToShow.forEach((key) => {
      const items = list.filter((d) => d.map === key);
      if (!items.length) return;
      shown += items.length;
      html +=
        `<section>
          <div class="group-h">
            <h2>${mapName(key)}</h2>
            <span class="g-count">${items.length} 个项目</span>
            ${state.map === "all" ? `<a class="g-only" href="#" data-only="${key}">只看这张图</a>` : ""}
          </div>
          <div class="grid">${items.map((d, i) => cardHtml(d, i, hotNo)).join("")}</div>
        </section>`;
    });
    wrap.innerHTML = html;
    $("#empty").classList.toggle("hidden", shown > 0);

    /* 组内事件 */
    wrap.querySelectorAll("[data-only]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        state.map = a.dataset.only;
        renderStrip();
        renderGroups();
      })
    );
    wrap.querySelectorAll("[data-fav]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const no = btn.dataset.fav;
        if (state.favs.has(no)) {
          state.favs.delete(no);
          toast(`已取消收藏 <b>NO.${no}</b>`);
        } else {
          state.favs.add(no);
          toast(`已收藏 <b>NO.${no}</b> ${drillByNo[no].title}`);
        }
        saveFavs();
        renderFavCount();
        renderGroups();
      })
    );
    wrap.querySelectorAll("[data-play]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const d = drillByNo[btn.dataset.play];
        toast(`▶ 演示模式：开始加载 <b>${d.title}</b>（${mapName(d.map)} · NO.${d.no}）`);
      })
    );
    wrap.querySelectorAll("[data-board]").forEach((btn) =>
      btn.addEventListener("click", () => openBoard(btn.dataset.board))
    );
  }

  function renderFavCount() {
    const el = $("#favCount");
    el.textContent = state.favs.size;
    el.classList.toggle("has", state.favs.size > 0);
  }

  /* ---------------- 英雄区轮播 ---------------- */
  let heroTimer;
  function renderHero(idx) {
    state.featIdx = idx;
    const f = D.featured[idx];
    const d = drillByNo[f.no];
    const bg = $("#heroBg");
    const agent = $("#heroAgent");

    bg.classList.remove("is-in");
    agent.classList.remove("is-in");
    setTimeout(() => {
      bg.src = coverOf({ map: f.map });
      bg.classList.add("is-in");
      agent.src = `assets/agents/${f.agent}.webp`;
      agent.classList.add("is-in");
    }, 180);

    $("#heroMapName").textContent = mapName(f.map);
    $("#featMap").textContent = mapName(f.map);
    $("#featTitle").textContent = d.title;
    $("#featType").innerHTML = `${TYPE_ICONS[d.type] || CROSS_ICON} ${d.type}`;
    $("#featPlays").textContent = `${d.plays} 次游玩`;
    $("#featDesc").textContent = d.desc;

    $("#heroDots").innerHTML = D.featured
      .map((_, i) => `<button class="${i === idx ? "is-on" : ""}" data-dot="${i}" type="button" aria-label="第${i + 1}个推荐"></button>`)
      .join("");
    document.querySelectorAll("[data-dot]").forEach((b) =>
      b.addEventListener("click", () => {
        renderHero(+b.dataset.dot);
        restartHeroTimer();
        renderGroups();
      })
    );
    renderGroups(); /* 焦点卡片高亮跟随轮播 */
  }
  function restartHeroTimer() {
    clearInterval(heroTimer);
    heroTimer = setInterval(() => {
      renderHero((state.featIdx + 1) % D.featured.length);
    }, 4000); /* 同原站 --wk-slide-ms: 4000ms */
  }

  /* ---------------- 排行榜弹窗（演示数据） ---------------- */
  function openBoard(no) {
    const d = drillByNo[no];
    /* 由编号派生伪随机榜，保证每次打开同一张图结果一致 */
    let seed = [...no].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0), seed / 4294967296);
    const names = ["NeonAce", "瓦学弟", "FlashPoint", "孤影", "OuO", "壹叁柒", "PeekMaster", "小蹲一个", "Crosshair", "天眼"];
    const rows = names
      .map((n) => ({
        name: n,
        kill: 18 + Math.floor(rand() * 22),
        time: (28 + rand() * 20).toFixed(1) + "s",
      }))
      .sort((a, b) => b.kill - a.kill || parseFloat(a.time) - parseFloat(b.time))
      .slice(0, 6);

    $("#boardTitle").textContent = `${d.title} · 排行榜`;
    $("#boardSub").textContent = `${mapName(d.map)} · NO.${no} · ${d.type} · ${d.plays} 次游玩`;
    $("#boardBody").innerHTML = rows
      .map(
        (r, i) =>
          `<tr>
            <td class="rank r${i + 1}">${i < 3 ? "TOP" + (i + 1) : i + 1}</td>
            <td class="name">${r.name}</td>
            <td class="kill">${r.kill}</td>
            <td>${r.time}</td>
          </tr>`
      )
      .join("");
    $("#boardMask").classList.remove("hidden");
  }
  $("#boardClose").addEventListener("click", () => $("#boardMask").classList.add("hidden"));
  $("#boardMask").addEventListener("click", (e) => {
    if (e.target === $("#boardMask")) $("#boardMask").classList.add("hidden");
  });

  /* ---------------- 底栏：搜索 / 群号 ---------------- */
  $("#searchInput").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderGroups();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("#searchInput")) {
      e.preventDefault();
      $("#searchInput").focus();
    }
    if (e.key === "Escape") {
      $("#boardMask").classList.add("hidden");
      $("#qqPop").classList.add("hidden");
    }
  });

  /* QQ 群面板 */
  $("#qqRows").innerHTML = D.groups.qq
    .map(
      (g) =>
        `<div class="qq-row">
          <span class="qq-name">${g.name}</span>
          <span class="qq-num">${g.num}</span>
          ${g.full ? '<span class="qq-full">已满</span>' : '<span class="qq-space"></span>'}
          <button class="btn-copy" data-copy-num="${g.num}" type="button">复制群号</button>
        </div>`
    )
    .join("");
  function togglePop(id) {
    const pop = $(id);
    const show = pop.classList.contains("hidden");
    document.querySelectorAll(".pop").forEach((p) => p.classList.add("hidden"));
    if (show) pop.classList.remove("hidden");
  }
  $("#btnQq").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#kookLink").textContent = D.groups.kook;
    togglePop("#qqPop");
  });
  $("#btnKook").addEventListener("click", (e) => {
    e.stopPropagation();
    togglePop("#qqPop");
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".pop") && !e.target.closest("#btnQq") && !e.target.closest("#btnKook"))
      $("#qqPop").classList.add("hidden");
  });
  document.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => {
      navigator.clipboard && navigator.clipboard.writeText(D.groups.kook);
      toast("KOOK 链接已复制");
    })
  );
  document.querySelectorAll("[data-copy-num]").forEach((b) =>
    b.addEventListener("click", () => {
      navigator.clipboard && navigator.clipboard.writeText(b.dataset.copyNum);
      toast(`群号 <b>${b.dataset.copyNum}</b> 已复制`);
    })
  );

  /* ---------------- 侧栏 / 顶栏小交互 ---------------- */
  $("#sideFav").addEventListener("click", (e) => {
    e.preventDefault();
    if (!state.favs.size) return toast("还没有收藏，点击卡片右上角 ♡ 收藏训练");
    state.search = "";
    $("#searchInput").value = "";
    state.type = "全部";
    state.map = "all";
    renderChips();
    renderStrip();
    renderGroups();
    document.querySelectorAll("[data-no]").forEach((c) => {
      if (!state.favs.has(c.dataset.no)) c.style.display = "none";
    });
    toast(`已显示 <b>${state.favs.size}</b> 个收藏项目（再次点击侧栏可还原）`);
    $("#sideFav").addEventListener(
      "click",
      () => location.reload(),
      { once: true }
    );
  });

  $("#sideQuick").addEventListener("click", () =>
    toast("▶ 演示模式：瓦格速击 · 60 秒（模拟快速开始）")
  );
  $("#featGo").addEventListener("click", () => {
    const f = D.featured[state.featIdx];
    toast(`▶ 演示模式：开始 <b>${drillByNo[f.no].title}</b>`);
  });
  $("#btnDesktop").addEventListener("click", () =>
    toast("演示站没有桌面版，去原站 ishoutu.cn 下载哦")
  );
  document.querySelector(".delay-pill").addEventListener("click", () =>
    toast("网络延迟检测：演示环境 28ms，一切正常 ✓")
  );
  document.querySelector(".user").addEventListener("click", () =>
    toast("仿站演示：登录功能未接入")
  );

  /* 灵敏度步进器 */
  function renderSens() {
    $("#sensVal").textContent = state.sens.toFixed(1);
    localStorage.setItem("aim-sens", state.sens);
  }
  $("#sensUp").addEventListener("click", () => {
    state.sens = Math.min(1.5, state.sens + 0.1);
    renderSens();
  });
  $("#sensDown").addEventListener("click", () => {
    state.sens = Math.max(0.1, state.sens - 0.1);
    renderSens();
  });

  /* 明暗主题 */
  $("#btnTheme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("aim-theme", next);
  });

  /* ---------------- 启动 ---------------- */
  const savedTheme = localStorage.getItem("aim-theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  renderSens();
  renderFavCount();
  renderStrip();
  renderChips();
  renderHero(0);
  restartHeroTimer();
})();
