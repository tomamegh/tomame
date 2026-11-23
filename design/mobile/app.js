/* Tomame iOS prototype — screens, gestures and haptic markers. Plain JS, no build. */
(() => {
  const T = window.TM;
  const P = T.products;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const device = $("#device");
  const views = $("#views");
  const tabbar = $("#tabbar");
  const sheetLayer = $("#sheetLayer");

  if (params.get("clean") === "1") document.body.classList.add("clean");
  if (params.get("shot") === "1") document.body.classList.add("shot");

  /* ── State ─────────────────────────────────── */
  const S = {
    bag: [
      { id: "sony", q: 1, opt: "Black" },
      { id: "xbox", q: 1, opt: "Astral Purple" },
      { id: "cerave", q: 2 },
    ],
    stage: Number(params.get("stage") ?? 3),
    reveal: params.get("reveal") === "1",
    watching: new Set(["sony", "macbook", "valentino", "xbox"]),
    pins: params.get("pins") === "1",
    ordersTab: "active",
    watchTab: "alerts",
    chatLink: false,
    current: null,
    timers: [],
  };

  /* ── Money ─────────────────────────────────── */
  const ghs = (n) => "GH₵" + Math.round(n).toLocaleString("en-US");
  const ghs2 = (n) => "GH₵" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function landed(p, q = 1) {
    const item = p.usd * q, tax = item * T.taxPct, fee = item * T.feePct, ship = (p.ship || 0) * q;
    const lb = Math.max(p.lb, 1) * q;
    const freight = lb * T.perLb * T.rate;
    return { item, tax, fee, ship, lb, freight, total: (item + tax + fee + ship) * T.rate + freight };
  }
  const img = (k) => `assets/p/${k}.webp`;
  const bagCount = () => S.bag.reduce((a, l) => a + l.q, 0);

  /* ── Haptics ───────────────────────────────── */
  const HC = { light: "#f9a58f", select: "#8b7cf6", medium: "#f25b3d", heavy: "#c43e22", success: "#1e9a5c", warning: "#c97a0a", error: "#d93025" };
  const HL = { light: "Impact · light", select: "Selection", medium: "Impact · medium", heavy: "Impact · heavy", success: "Success", warning: "Warning", error: "Error" };
  const HV = { light: 8, select: 4, medium: 15, heavy: 28, success: [12, 60, 18], warning: [20, 80, 20], error: [30, 50, 30, 50, 30] };
  let islandT;
  function haptic(type, at) {
    try { navigator.vibrate && navigator.vibrate(HV[type]); } catch (_) {}
    const island = $("#island");
    island.style.setProperty("--hc", HC[type]);
    $("#islandText").textContent = HL[type];
    island.classList.remove("on"); void island.offsetWidth; island.classList.add("on");
    clearTimeout(islandT); islandT = setTimeout(() => island.classList.remove("on"), 1100);
    if (at) {
      const r = device.getBoundingClientRect();
      const x = (at.clientX ?? r.left + r.width / 2) - r.left, y = (at.clientY ?? r.top + r.height / 2) - r.top;
      const d = document.createElement("span");
      d.className = "ripple"; d.style.left = x + "px"; d.style.top = y + "px"; d.style.setProperty("--hc", HC[type]);
      $("#ripples").appendChild(d); setTimeout(() => d.remove(), 700);
    }
    const li = document.createElement("li");
    li.innerHTML = `<span style="color:${HC[type]}">●</span> ${HL[type]}`;
    const log = $("#hlog"); log.prepend(li); while (log.children.length > 12) log.lastChild.remove();
  }

  /* ── Small builders ────────────────────────── */
  const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (_) {} };
  const H = (t) => `data-h="${t}"`;
  const storeTag = (p) => `<span class="store"><i class="ph-fill ph-storefront"></i>${p.store} · ${p.region}</span>`;
  const statusbar = (dark) => $("#statusbar").classList.toggle("dark", !!dark);
  function dotsBar(stage, total = 7) {
    return `<div class="dots">${Array.from({ length: total }, (_, i) => `<i class="${i < stage ? "done" : i === stage ? "cur" : ""}"></i>`).join("")}</div>`;
  }
  function spark(vals, color = "#1e9a5c") {
    const w = 84, h = 34, min = Math.min(...vals), max = Math.max(...vals);
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, 4 + (1 - (v - min) / (max - min || 1)) * (h - 8)]);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    const last = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}"><path d="${d} L${w},${h} L0,${h}Z" fill="${color}" opacity=".09"/><path d="${d}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3.2" fill="${color}"/></svg>`;
  }
  const navbar = (title, back, acts = "", cls = "") => `
    <div class="navbar ${cls}"><button class="back" data-back ${H("light")}><i class="ph ph-caret-left"></i>${back}</button>
    <span class="title">${title}</span><div class="acts">${acts}</div></div>`;

  /* ── Screens ───────────────────────────────── */
  const SCREENS = [
    { id: "welcome", label: "Welcome + sign in", chrome: "none" },
    { id: "home", label: "Home", tab: "home" },
    { id: "chat", label: "Buy for me (AI)", tab: "chat" },
    { id: "product/sony", label: "Product + landed price", sheet: true },
    { id: "bag", label: "Bag (swipe lines)", tab: "bag" },
    { id: "pay", label: "Pay with MoMo", sheet: true },
    { id: "paid", label: "Paid", chrome: "none" },
    { id: "orders", label: "Orders", tab: "orders" },
    { id: "track", label: "Live tracker", tab: "orders", depth: 1 },
    { id: "watch", label: "Price watch alerts", tab: "watch" },
    { id: "account", label: "Account", tab: "home", depth: 1 },
    { id: "share", label: "Share from any store app", chrome: "none" },
    { id: "lock", label: "Lock Screen + Live Activity", chrome: "none" },
  ];

  const R = {};

  R.welcome = () => `
    <div class="scroll welcome"><div class="orbit">
      <div class="fl" style="width:120px;height:140px;left:18px;top:24px;transform:rotate(-8deg)"><img src="${img("headphones")}"></div>
      <div class="fl" style="width:110px;height:110px;right:20px;top:6px;animation-delay:-1.5s"><img src="${img("video-games")}"></div>
      <div class="fl" style="width:104px;height:124px;left:34px;bottom:4px;animation-delay:-3s"><img src="${img("womens-shoes")}"></div>
      <div class="fl" style="width:118px;height:118px;right:26px;bottom:20px;transform:rotate(7deg);animation-delay:-2s"><img src="${img("computers")}"></div>
      <div class="logo"><img src="assets/logo-mark.webp" alt="Tomame"></div>
      <div class="tag" style="left:128px;top:6px"><i class="ph-fill ph-seal-check" style="color:var(--green)"></i><b>GH₵4,730</b> to your door</div>
      <div class="tag" style="right:6px;bottom:150px;animation-delay:-2s"><i class="ph-fill ph-airplane-tilt" style="color:var(--coral)"></i>Lands Wed</div>
    </div>
    <h1 class="up">Shop the US &amp; UK.<br><em>Pay in cedis.</em></h1>
    <p class="lead up">Paste any link or ask our buyer. See the full price to your door before you pay with MoMo.</p>
    <div class="phone-in up"><span class="cc">🇬🇭 +233</span><input inputmode="tel" value="55 123 4987" aria-label="WhatsApp number"></div>
    <div class="auth-btns up">
      <button class="btn btn-block wa" data-go="home" ${H("success")}><i class="ph-fill ph-whatsapp-logo"></i>Continue with WhatsApp</button>
      <button class="btn btn-block btn-dark" data-go="home" ${H("light")}><i class="ph-fill ph-apple-logo"></i>Sign in with Apple</button>
    </div>
    <button class="skip" data-go="home" ${H("light")}>Look around first</button>
    <p class="fine">We send a 6-digit code to WhatsApp. iOS fills it in for you.</p></div>`;

  R.home = () => {
    const shelf = ["sony", "iphone", "macbook", "valentino", "amazfit"];
    const drops = { sony: 13, amazfit: 9 };
    return `
    <div class="scroll" data-ptr>
      <div class="ptr"><span class="spin"><i class="ph-bold ph-arrows-clockwise"></i></span></div>
      <header class="home-top up">
        <div class="brand"><img class="mark" src="assets/logo-mark.webp" alt=""><img class="word" src="assets/logo-wordmark.webp" alt="Tomame"></div>
        <button class="rate-pill nums" data-act="rate" ${H("light")}><span class="live-dot"></span>$1 = GH₵${T.rate}</button>
        <button class="avatar" data-go="account" ${H("light")}>A</button>
      </header>
      <h1 class="hello up">Good evening, Ama.<br><span>What are we <em>buying</em> today?</span></h1>
      <div class="ask up" data-go="chat" ${H("light")}>
        <div class="ask-ph"><span class="typed" id="typed"></span><span class="caret"></span></div>
        <div class="ask-row">
          <span class="mini" data-act="photo" ${H("light")}><i class="ph-bold ph-camera"></i>Photo</span>
          <span class="mini" data-act="mic" ${H("light")}><i class="ph-bold ph-microphone"></i>Say it</span>
          <span class="send"><i class="ph-bold ph-arrow-up"></i></span>
        </div>
      </div>
      <button class="clip" data-act="pasteClip" ${H("medium")}>
        <span class="ic"><i class="ph-fill ph-clipboard-text"></i></span>
        <span><b>Price the link you copied?</b><small>amazon.com/dp/B0CHWRXH8B</small></span>
        <span class="go">Price it</span>
      </button>
      <div class="trust up"><span class="chip"><i class="ph-bold ph-check"></i>Price in GH₵ before you pay</span><span class="chip"><i class="ph-bold ph-check"></i>Refund if we can't source</span><span class="chip"><i class="ph-bold ph-check"></i>Rate locked 24h</span></div>

      <button class="card live-order up" data-go="track" ${H("light")}>
        <span class="thumb"><img src="${img("toys-games")}"></span>
        <span class="meta"><span class="eyebrow coral"><span class="plane-float"><i class="ph-fill ph-airplane-tilt"></i></span> ${T.stages[S.stage].short} · TM-00038</span>
          <b>${S.stage >= 6 ? "Delivered" : "At your door by Sat 28 Nov"}</b>${dotsBar(S.stage)}</span>
        <i class="ph ph-caret-right chev"></i>
      </button>

      <div class="section-h"><h2>Landed in Accra</h2><a data-go="chat" ${H("light")}>Ask for more</a></div>
      <div class="shelf">${shelf.map((id) => {
        const p = P[id];
        return `<button class="pcard" data-go="product/${id}" ${H("light")}>
          <div class="img"><img src="${img(p.img)}" alt="">${drops[id] ? `<span class="drop">−${drops[id]}%</span>` : ""}<span class="plus" data-act="quickAdd" data-id="${id}" ${H("medium")}><i class="ph-bold ph-plus"></i></span></div>
          ${storeTag(p)}<div class="t">${p.title}</div><div class="p nums">${ghs(landed(p).total)}<small>all in</small></div></button>`;
      }).join("")}</div>

      <div class="section-h"><h2>Your box to Accra</h2><a data-go="bag" ${H("light")}>Open bag</a></div>
      <div class="card box-card" data-go="bag" ${H("light")}>
        <div class="row"><span class="ic"><i class="ph-fill ph-package"></i></span>
          <div><b>${bagCount()} items, one flight</b><p>Add more before it closes and they share the freight.</p></div>
          <div class="countdown nums" data-countdown="box">2d 19h<small>closes Thu</small></div></div>
        <div class="fill-bar"><span style="width:62%"></span></div>
      </div>

      <div class="section-h"><h2>Shop by department</h2></div>
      <div class="depts">${T.departments.map(([n, k]) => `<button class="dept" data-go="chat" ${H("light")}><span class="c"><img src="${img(k)}"></span>${n}</button>`).join("")}</div>

      <div class="section-h"><h2>Dropped since you looked</h2><a data-go="watch" ${H("light")}>Price watch</a></div>
      <div class="card drops">${["sony", "amazfit"].map((id) => {
        const p = P[id], now = landed(p).total, was = now / (1 - drops[id] / 100);
        return `<button class="drop-row" data-go="product/${id}" ${H("light")}><img src="${img(p.img)}"><span><b>${p.short}</b><s class="nums">${ghs(was)}</s></span>
          <span class="now"><b class="nums">${ghs(now)}</b><br><span class="pct">−${drops[id]}%</span></span></button>`;
      }).join("")}</div>
    </div>`;
  };

  R.chat = () => {
    const best = P.sony, b = landed(best);
    const alts = [["Bose QuietComfort 45", 279, "electronics", "Amazon"], ["Anker Soundcore Space Q45", 149.99, "headphones", "Walmart"]];
    return `
    <div class="chat-head">
      <span class="ai-av"><i class="ph-fill ph-sparkle"></i></span>
      <span><b>Buy for me</b><small>Your buyer for US &amp; UK stores</small></span>
      <span class="acts"><button class="icon-btn" ${H("light")}><i class="ph ph-clock-counter-clockwise"></i></button><button class="icon-btn" ${H("light")}><i class="ph ph-note-pencil"></i></button></span>
    </div>
    <div class="scroll"><div class="msgs" id="msgs">
      <div class="day">Today 7:12 pm</div>
      <div class="bubble me">Noise-cancelling headphones for long flights, under GH₵5,000</div>
      <div class="steps"><div><i class="ph-fill ph-check-circle"></i>Searched Amazon, eBay and Walmart</div><div><i class="ph-fill ph-check-circle"></i>Weighed freight for each one</div><div><i class="ph-fill ph-check-circle"></i>Priced at today's rate, $1 = GH₵${T.rate}</div></div>
      <div class="bubble ai">The Sony XM5 is the one I'd pick: best noise cancelling, 30-hour battery, and it comes in under your budget at your door.</div>
      <div class="card best">
        <div class="ribbon"><i class="ph-fill ph-seal-check"></i>Best price, landed in Accra</div>
        <div class="body" data-go="product/sony" ${H("light")}><img src="${img(best.img)}"><div>${storeTag(best)}<div class="t">${best.title}</div><div class="price nums">${ghs(b.total)} <small>all in</small></div></div></div>
        <div class="acts"><button class="btn btn-ghost" data-go="product/sony" ${H("light")}>Details</button><button class="btn btn-primary" data-act="add" data-id="sony" ${H("medium")}><i class="ph-bold ph-handbag"></i>Add to bag</button></div>
      </div>
      <div class="alt-row">${alts.map(([t, u, k, s]) => `<button class="card alt" ${H("light")}><img src="${img(k)}"><span><span class="store"><i class="ph-fill ph-storefront"></i>${s}</span><div class="t">${t}</div><div class="p nums">${ghs(landed({ usd: u, lb: 2 }).total)}</div></span></button>`).join("")}</div>
      <div class="followups"><button data-act="follow" ${H("light")}>Cheaper options</button><button data-act="follow" ${H("light")}>Over-ear only</button><button data-act="follow" ${H("light")}>Compare top two</button></div>
      ${S.chatLink ? "" : linkExchange()}
    </div></div>
    <div class="composer">
      <button class="cb" data-act="pasteClip" ${H("medium")}><i class="ph ph-link-simple"></i></button>
      <textarea id="composer" rows="1" placeholder="Ask a follow-up, or paste a link"></textarea>
      <button class="cb" data-act="mic" ${H("light")}><i class="ph ph-microphone"></i></button>
      <button class="send" data-act="send" ${H("light")}><i class="ph-bold ph-arrow-up"></i></button>
    </div>`;
  };
  function linkExchange() {
    const p = P.xbox, l = landed(p);
    return `<div class="bubble me link"><i class="ph-bold ph-link-simple"></i> amazon.com/dp/B0CHWRXH8B</div>
      <div class="card best">
        <div class="body" data-go="product/xbox" ${H("light")}><img src="${img(p.img)}"><div>${storeTag(p)}<div class="t">${p.title}</div><div class="price nums">${ghs(l.total)} <small>all in · freight checked</small></div></div></div>
        <div class="acts"><button class="btn btn-ghost" data-act="watchToggle" data-id="xbox" ${H("light")}><i class="ph ph-bookmark-simple"></i>Watch</button><button class="btn btn-primary" data-act="add" data-id="xbox" ${H("medium")}><i class="ph-bold ph-handbag"></i>Add to bag</button></div>
      </div>`;
  }

  R.product = (id) => {
    const p = P[id] || P.sony, l = landed(p), opts = p.options || [];
    const watching = S.watching.has(id);
    return `
    <div class="grabber"><span></span></div>
    <button class="sheet-close" data-close ${H("light")}><i class="ph-bold ph-x"></i></button>
    <div class="sheet-body">
      <div class="carousel" id="carousel" data-hg="select:swipe photos · select">${[["50% 50%", 1], ["30% 40%", 1.5], ["70% 60%", 1.7]].map(([pos, z]) => `<div class="slide"><img src="${img(p.img)}" style="object-position:${pos};transform:scale(${z})"></div>`).join("")}</div>
      <div class="cdots" id="cdots"><i class="on"></i><i></i><i></i></div>
      <div class="pd">
        ${storeTag(p)}
        <h2>${p.title}</h2>
        <div class="big-price"><b class="nums" id="pdPrice">${ghs(l.total)}</b><span>to your door<br>in Accra, all in</span></div>
        <div class="chips"><span class="chip green"><i class="ph-bold ph-lock-simple"></i>Rate locked <span class="nums" data-countdown="lock">23:41:08</span></span><span class="chip"><i class="ph-bold ph-scales"></i>Freight checked · ${p.lb} lb</span></div>
        <div class="card eta"><span class="ic"><i class="ph-fill ph-calendar-check"></i></span><div><b>At your door by Sat 6 Dec</b><p>Pay today and it rides in Thursday's box.</p></div></div>
        ${opts.length ? `<div class="opt-h"><span>Colour</span><span id="optName">${opts[0]}</span></div><div class="seg" data-seg>${opts.map((o, i) => `<button class="${i ? "" : "on"}" ${H("select")}>${o}</button>`).join("")}</div>` : ""}
        <div class="opt-h"><span>Quantity</span></div>
        <div class="stepper" data-stepper data-id="${id}" data-hg="select:select per step"><button data-d="-1" data-nopin ${H("select")}><i class="ph-bold ph-minus"></i></button><span>1</span><button data-d="1" data-nopin ${H("select")}><i class="ph-bold ph-plus"></i></button></div>
        <details class="card breakdown" open><summary>How we got to ${ghs(l.total)}<i class="ph-bold ph-caret-down"></i></summary>
          <div id="bd">${breakdownRows(p, 1)}</div></details>
        <div class="card watch-row"><span class="ic"><i class="ph-fill ph-bell-simple-ringing"></i></span><div><b>Tell me when it drops</b><small>Push + WhatsApp, the minute it's cheaper</small></div><span class="toggle ${watching ? "on" : ""}" data-act="watchToggle" data-id="${id}" ${H("light")}></span></div>
        <p class="fine"><a class="link" ${H("light")}>View the listing on ${p.store}</a></p>
        <div style="height:20px"></div>
      </div>
    </div>
    <div class="sheet-foot"><button class="icon-btn" data-act="share" ${H("light")}><i class="ph ph-share-network"></i></button><button class="btn btn-primary" data-act="add" data-id="${id}" data-from="sheet" ${H("medium")}><i class="ph-bold ph-handbag"></i>Add to bag · <span class="nums" id="ctaPrice">${ghs(l.total)}</span></button></div>`;
  };
  function breakdownRows(p, q) {
    const l = landed(p, q);
    return `<div class="brow"><span>Item${q > 1 ? " × " + q : ""}</span><b>${usd(l.item)}</b></div>
      <div class="brow"><span>US sales tax</span><b>${usd(l.tax)}</b></div>
      <div class="brow"><span>Tomame fee (5%)</span><b>${usd(l.fee)}</b></div>
      ${l.ship ? `<div class="brow"><span>Store shipping</span><b>${usd(l.ship)}</b></div>` : ""}
      <div class="brow"><span>Freight to Accra · ${l.lb} lb</span><b>${ghs2(l.freight)}</b></div>
      <div class="brow"><span>Customs &amp; duty</span><b style="color:var(--green-ink)">Included</b></div>
      <div class="brow"><span>Rate</span><b>$1 = GH₵${T.rate}</b></div>
      <div class="brow total"><span>To your door</span><b>${ghs2(l.total)}</b></div>`;
  }

  function bagTotals() {
    const lines = S.bag.map((l) => ({ ...l, p: P[l.id], c: landed(P[l.id], l.q) }));
    const sub = lines.reduce((a, l) => a + l.c.total, 0);
    const freight = lines.reduce((a, l) => a + l.c.freight, 0);
    const save = lines.length >= 2 ? freight * T.boxSavePct : 0;
    const delivery = lines.length ? 35 : 0;
    return { lines, sub, save, delivery, total: sub - save + delivery };
  }

  R.bag = () => {
    const t = bagTotals();
    if (!t.lines.length) return `<div class="scroll"><div class="lt"><div><h1>Bag</h1></div></div><div class="empty"><i class="ph-duotone ph-handbag"></i><h3>Your bag is empty</h3><p>Paste a link or ask Buy for me, and it lands here priced to your door.</p><button class="btn btn-primary" data-go="chat" ${H("light")}>Ask Buy for me</button></div></div>`;
    const pct = Math.min(1, bagCount() / 5), C = 2 * Math.PI * 22;
    return `
    <div class="scroll">
      <div class="lt up"><div><h1>Bag</h1><p>${bagCount()} items · one box to Accra</p></div><button class="icon-btn" data-go="chat" ${H("light")}><i class="ph-bold ph-plus"></i></button></div>
      <div class="card bag-box box-card up" data-hg="warning:last hours · warning"><div class="row">
        <span class="ring"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" stroke="#f5eee9" stroke-width="5" fill="none"/><circle cx="26" cy="26" r="22" stroke="url(#g1)" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset .8s var(--ease)"/><defs><linearGradient id="g1"><stop offset="0" stop-color="#f43f5e"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs></svg><span class="ic"><i class="ph-fill ph-package"></i></span></span>
        <div><b>Box closes Thu, 6 pm</b><p>${t.save ? `Sharing freight saves you <b style="display:inline;color:var(--green-ink)">${ghs(t.save)}</b>` : "Add a second item to share freight"}</p></div>
        <div class="countdown nums" data-countdown="box">2d 19h<small>left</small></div></div></div>
      <div class="card lines up">${t.lines.map((l) => `
        <div class="swipe" data-line="${l.id}" ${l === t.lines[1] ? 'data-hg="medium:swipe · select at edge, medium on drop"' : ""}>
          <div class="under"><div class="l"><i class="ph-fill ph-bookmark-simple"></i>Watch</div><div class="r">Remove<i class="ph-fill ph-trash"></i></div></div>
          <div class="line"><img src="${img(l.p.img)}"><div class="info"><div class="t">${l.p.title}</div><div class="opt">${l.opt ? l.opt + " · " : ""}${l.p.store} · ${l.c.lb} lb</div>
            <div class="bot"><div class="stepper sm" data-stepper data-id="${l.id}" data-bag ${l === t.lines[0] ? 'data-hg="select:select per step"' : ""}><button data-d="-1" data-nopin ${H("select")}><i class="ph-bold ph-minus"></i></button><span>${l.q}</span><button data-d="1" data-nopin ${H("select")}><i class="ph-bold ph-plus"></i></button></div><span class="lp nums">${ghs(l.c.total)}</span></div></div></div>
        </div>`).join("")}</div>
      <p class="hint"><i class="ph-bold ph-hand-swipe-left"></i>Swipe a line left to remove, right to watch</p>
      <button class="card addr up" ${H("light")}><span class="ic"><i class="ph-fill ph-house-line"></i></span><span><b>Home · East Legon</b><small>Ama Mensah · 055 123 4987</small></span><span class="fee nums">${ghs(t.delivery)}</span></button>
      <div class="card summary up">
        <div class="brow" style="border:0"><span>Items to your door</span><b>${ghs2(t.sub)}</b></div>
        ${t.save ? `<div class="brow"><span>Shared box saving</span><b style="color:var(--green-ink)">−${ghs2(t.save)}</b></div>` : ""}
        <div class="brow"><span>Delivery in Accra</span><b>${ghs2(t.delivery)}</b></div>
        <div class="brow total"><span>Total</span><b>${ghs2(t.total)}</b></div>
      </div>
      <p class="fine">Rate locked for 23 h. Customs is included. If we can't buy an item, you get its money back.</p>
    </div>
    <div class="paybar"><div><small>Total</small><b class="nums">${ghs2(t.total)}</b></div><button class="btn btn-primary" data-go="pay" ${H("medium")}>Pay with MoMo</button></div>`;
  };

  R.pay = () => {
    const t = bagTotals();
    return `
    <div class="grabber"><span></span></div>
    <button class="sheet-close" data-close ${H("light")}><i class="ph-bold ph-x"></i></button>
    <div class="sheet-body" id="payBody">
      <div class="pay-h"><small>Pay once for everything</small><b class="nums">${ghs2(t.total)}</b></div>
      <div class="method"><span class="net mtn">MTN</span><div><b>055 123 4987</b><small>MTN MoMo · Ama Mensah</small></div><span class="radio"></span></div>
      <div class="nets"><span class="on">MTN</span><span>Telecel</span><span>AT Money</span><span style="margin-left:auto;background:none;border:0;color:var(--coral-strong)">+ Other number</span></div>
      <div class="method off" ${H("select")}><span class="net card"><i class="ph ph-credit-card"></i></span><div><b>Card</b><small>Visa or Mastercard via Paystack</small></div><span class="radio"></span></div>
      <div class="faceid"><i class="ph ph-scan-smiley"></i>Confirm with Face ID, then approve on your phone with your MoMo PIN.</div>
      <div class="slider" id="slider" data-hg="heavy:slide · select ticks, heavy at end"><div class="fillg"></div><div class="lbl"><span>Slide to pay ${ghs(t.total)}</span></div><div class="knob"><i class="ph-bold ph-arrow-right"></i></div></div>
      <p class="fine">Secured by Paystack. You'll get a prompt on 055 123 4987.</p><div style="height:34px"></div>
    </div>`;
  };

  R.paid = () => {
    const ids = ["sony", "xbox", "cerave"];
    return `
    <canvas id="confetti"></canvas>
    <div class="scroll paid">
      <div class="check" data-hg="success:paid · success"><svg viewBox="0 0 56 56"><path d="M14 29 l9 9 l19 -20"/></svg></div>
      <h1>Paid. We're on it.</h1>
      <p class="sub"><b class="nums" style="color:var(--ink)">${ghs2(bagTotals().total)}</b> from MTN MoMo<br>Receipt sent to your WhatsApp</p>
      <div class="card receipt"><span class="eyebrow">TM-00041 · paid 23 Nov</span><div class="eta-big">At your door by Sat 6 Dec</div>${dotsBar(0)}
        <div class="thumbs">${ids.map((i) => `<img src="${img(P[i].img)}">`).join("")}<span>4 items · one box</span></div></div>
      <div class="card watch-row" style="margin:12px 16px 0"><span class="ic"><i class="ph-fill ph-device-mobile"></i></span><div><b>Follow on your Lock Screen</b><small>Live Activity from buy to door</small></div><span class="toggle on" data-act="toggle" ${H("light")}></span></div>
      <div class="pad" style="display:grid;gap:10px;margin-top:20px">
        <button class="btn btn-primary btn-block" data-go="track" ${H("light")}>Track my order</button>
        <button class="btn btn-ghost btn-block" data-go="home" ${H("light")}>Keep shopping</button>
      </div>
    </div>`;
  };

  R.orders = () => {
    const active = S.ordersTab === "active";
    const o1 = `<button class="card ocard up" data-go="track" ${H("light")}><div class="top"><span class="pics"><img src="${img("toys-games")}"></span>
        <span><b>BRIO World Railway Starter Set</b><span class="sub">TM-00038 · Qty 1 · paid 22 Nov</span></span></div>
        <span class="stage-tag"><i class="ph-fill ph-${T.stages[S.stage].icon}"></i>${T.stages[S.stage].label}</span>${dotsBar(S.stage)}
        <div class="foot"><span>${S.stage >= 6 ? "Delivered Sat 28 Nov" : "At your door by <b>Sat 28 Nov</b>"}</span><span>${S.stage >= 3 ? "Live" : ""}</span></div></button>`;
    const o2 = `<button class="card ocard up" ${H("light")}><div class="top"><span class="pics"><img src="${img("headphones")}"><img src="${img("video-games")}"></span>
        <span><b>Sony WH-1000XM5 + 2 more</b><span class="sub">TM-00041 · 4 items · paid today</span></span></div>
        <span class="stage-tag" style="color:var(--green-ink)"><i class="ph-fill ph-credit-card"></i>Paid — buying it now</span>${dotsBar(0)}
        <div class="foot"><span>At your door by <b>Sat 6 Dec</b></span></div></button>`;
    const done = [["casio", "TM-00031", "14 Nov"], ["valentino", "TM-00027", "2 Nov"], ["brogue", "TM-00019", "21 Oct"]].map(([id, n, d]) => `
      <button class="card ocard up" ${H("light")}><div class="top"><span class="pics"><img src="${img(P[id].img)}"></span><span><b>${P[id].title}</b><span class="sub">${n} · delivered ${d}</span></span></div>
      <div class="foot"><span style="color:var(--green-ink);font-weight:650"><i class="ph-fill ph-check-circle"></i> Delivered</span><span class="link">Buy again</span></div></button>`).join("");
    return `
    <div class="scroll" data-ptr>
      <div class="ptr"><span class="spin"><i class="ph-bold ph-arrows-clockwise"></i></span></div>
      <div class="lt" data-hg="medium:pull to refresh · medium"><div><h1>Orders</h1></div><button class="icon-btn" ${H("light")}><i class="ph ph-magnifying-glass"></i></button></div>
      <div class="segc ${active ? "" : "r"}" data-segc="ordersTab"><span class="thumb"></span><button class="${active ? "on" : ""}" data-v="active" ${H("select")}>Active · 2</button><button class="${active ? "" : "on"}" data-v="done" ${H("select")}>Delivered · 3</button></div>
      <p class="updated" id="updated">Pull down to refresh · updated 2 min ago</p>
      ${active ? o1 + o2 : done}
    </div>`;
  };

  R.track = () => {
    const st = S.stage, s = T.stages[st];
    const copy = [
      ["We're buying it now", "Usually done within a day"],
      ["Bought from Walmart", "On its way to our US hub"],
      ["At our US hub", "Weighed 3 lb · booked on Delta Cargo, Mon 24 Nov"],
      ["In flight to Accra", "Delta Cargo · JFK → ACC · lands Wed 25 Nov"],
      ["Landed in Accra, cleared", "A rider picks it up tomorrow morning"],
      ["Out for delivery", "Kwesi is on a motorbike · about 25 min away"],
      ["Delivered", "Handed over with your code · Sat 28 Nov, 11:42"],
    ][st];
    const t = st < 3 ? 0.04 : st === 3 ? 0.56 : 0.97;
    const P0 = [40, 112], P1 = [179, -6], P2 = [318, 112];
    const bx = (u) => (1 - u) ** 2 * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0];
    const by = (u) => (1 - u) ** 2 * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1];
    const dx = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), dy = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const codeOn = st >= 5;
    return `
    ${navbar("TM-00038", "Orders", `<button class="icon-btn" data-act="share" ${H("light")}><i class="ph ph-share-network"></i></button>`)}
    <div class="scroll" data-ptr>
      <div class="ptr"><span class="spin"><i class="ph-bold ph-arrows-clockwise"></i></span></div>
      <div class="card route up">
        <svg viewBox="0 0 358 150"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#f43f5e"/><stop offset=".6" stop-color="#f97316"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
          <path d="M40 112 Q179 -6 318 112" stroke="#ffffff38" stroke-width="2" stroke-dasharray="3 6" fill="none"/>
          <path d="M40 112 Q179 -6 318 112" stroke="url(#rg)" stroke-width="3" fill="none" stroke-linecap="round" pathLength="100" stroke-dasharray="${t * 100} 100" class="route-prog"/>
          <circle cx="40" cy="112" r="6" fill="#f43f5e"/><circle cx="40" cy="112" r="11" fill="#f43f5e" opacity=".25"/>
          <circle cx="318" cy="112" r="6" fill="${st >= 4 ? "#f59e0b" : "#ffffff55"}"/>
          <g transform="translate(${bx(t).toFixed(1)} ${by(t).toFixed(1)}) rotate(${ang.toFixed(1)})"><circle r="15" fill="#fff" opacity=".14"/><path d="M0,-11 L2,-3.5 L10,1.5 L10,4 L2,1.8 L1.4,7 L4,9.2 L4,11 L0,10 L-4,11 L-4,9.2 L-1.4,7 L-2,1.8 L-10,4 L-10,1.5 L-2,-3.5 Z" fill="#fff"/></g>
        </svg>
        <span class="lbl" style="left:18px;top:126px">JFK<b>New York hub</b></span>
        <span class="lbl" style="right:18px;top:126px;text-align:right">ACC<b>Accra</b></span>
        <div class="inner" style="padding-top:34px"><span class="eyebrow" style="color:#ffb39f">Now · ${s.short}</span><h2>${copy[0]}</h2><p>${copy[1]}</p>
          <span class="eta-pill"><i class="ph-fill ph-calendar-check"></i>${st >= 6 ? "Delivered Sat 28 Nov" : "At your door by Sat 28 Nov"}</span></div>
      </div>
      <div class="track-meta"><button class="card" data-act="copy" ${H("light")}><small>Tracking number</small><b class="nums">TM-00038 <i class="ph ph-copy"></i></b></button><div class="card"><small>Deliver to</small><b>Home · East Legon</b></div></div>
      ${st >= 5 ? `<div class="card code-card ${S.reveal ? "reveal" : ""}" id="codeCard"><span class="eyebrow coral">Delivery code</span><div class="digits nums">${"482913".split("").map((d) => `<span>${d}</span>`).join("")}</div><small style="color:var(--text-2)">Give it to Kwesi at the door, never before.</small><button class="hold" id="hold" data-hg="success:hold · light, then success"><i class="ph-bold ph-fingerprint-simple"></i><span>${S.reveal ? "Showing · release to hide" : "Hold to show"}</span></button></div>` : `<div class="card code-card"><div style="display:flex;gap:12px;align-items:center"><span class="ic" style="width:42px;height:42px;border-radius:13px;background:var(--pill-bg);display:grid;place-items:center;font-size:20px;color:var(--text-2)"><i class="ph-fill ph-lock-simple"></i></span><div><b style="display:block">Delivery code</b><small style="color:var(--text-2)">Unlocks when your rider sets off. Face ID to show it.</small></div></div></div>`}
      <div class="card rail">${T.stages.map((x, i) => `
        <div class="stop ${i < st ? "done" : i === st ? "cur" : ""}" data-stop="${i}" ${i === st ? 'data-hg="success:stage change · success"' : ""}><span class="dot"><i class="ph-fill ph-${i < st ? "check" : x.icon}"></i></span>
          <div><b>${x.label}</b><small>${i <= st ? x.when : "—"}</small>${i === 2 && st >= 2 ? `<div class="photos"><img src="${img("toys-games")}"><img src="${img("home-kitchen")}" style="filter:saturate(.6)"></div>` : ""}</div></div>`).join("")}</div>
      <button class="card ask-order" data-go="chat" ${H("light")}><span class="ai-av"><i class="ph-fill ph-sparkle"></i></span><span><b style="display:block">Ask about this order</b><small style="color:var(--text-2)">Buy for me knows where it is</small></span><i class="ph ph-caret-right" style="margin-left:auto;color:var(--text-3)"></i></button>
    </div>`;
  };

  R.watch = () => {
    const alerts = S.watchTab === "alerts";
    const sony = landed(P.sony).total, mac = landed(P.macbook).total, xbox = landed(P.xbox).total;
    const feed = `
      <div class="card alert fresh up" data-hg="success:arrives as a push · success"><div class="kind g"><i class="ph-fill ph-trend-down"></i>Price drop<span class="when">2 h ago</span></div>
        <div class="row"><img src="${img("headphones")}"><div style="flex:1"><b>Sony WH-1000XM5</b><div class="np nums">${ghs(sony * 0.87)}<s>${ghs(sony)}</s></div></div>${spark([4.73, 4.76, 4.7, 4.74, 4.6, 4.58, 4.12])}</div>
        <div class="acts"><button class="btn btn-ghost" ${H("light")}>Dismiss</button><button class="btn btn-primary" data-act="add" data-id="sony" ${H("medium")}>Add to bag</button></div></div>
      <div class="card alert rate-alert up"><div class="kind g"><i class="ph-fill ph-currency-circle-dollar"></i>Better rate<span class="when">Today 6 am</span></div>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.4"><b>$1 = GH₵${T.rate}</b>, down from ${T.ratePrev}. All 4 things you watch got about 1% cheaper.</p></div>
      <div class="card alert up"><div class="kind c"><i class="ph-fill ph-package"></i>Back in stock<span class="when">Yesterday</span></div>
        <div class="row"><img src="${img("video-games")}"><div style="flex:1"><b>Xbox Wireless Controller – Astral Purple</b><div class="np nums">${ghs(xbox)}</div></div></div></div>
      <div class="card alert up"><div class="kind a"><i class="ph-fill ph-target"></i>Hit your target<span class="when">Mon</span></div>
        <div class="row"><img src="${img("computers")}"><div style="flex:1"><b>MacBook Air 13" M3</b><div class="np nums">${ghs(mac * 0.94)}<s>target GH₵13,500</s></div></div>${spark([15, 14.8, 14.9, 14.4, 14.1, 13.6, 13.4], "#c97a0a")}</div></div>`;
    const list = `<div class="card group up" style="margin-top:0">${["sony", "macbook", "valentino", "xbox"].map((id, i) => {
      const p = P[id];
      return `<div class="witem"><img src="${img(p.img)}"><div style="flex:1;min-width:0"><b>${p.short}</b><small>${["Any drop", "Below GH₵13,500", "Below GH₵2,000", "Back in stock"][i]}</small></div>${spark([5, 6, 5.5, 6.2, 5.8, 5.4 - i * 0.2, 5 - i * 0.3], i === 2 ? "#8a7f79" : "#1e9a5c")}<div class="pr"><b class="nums">${ghs(landed(p).total * (i ? 1 : 0.87))}</b></div></div>`;
    }).join("")}</div>
      <button class="add-watch" ${H("light")}><i class="ph-bold ph-plus-circle"></i>Watch a link</button>`;
    return `
    <div class="scroll">
      <div class="lt"><div><h1>Price watch</h1><p>We check every few hours. You hear first.</p></div></div>
      <div class="segc ${alerts ? "" : "r"}" data-segc="watchTab"><span class="thumb"></span><button class="${alerts ? "on" : ""}" data-v="alerts" ${H("select")}>Alerts · 4</button><button class="${alerts ? "" : "on"}" data-v="list" ${H("select")}>Watching · 4</button></div>
      ${alerts ? feed : list}
    </div>`;
  };

  R.account = () => `
    ${navbar("Account", "Home", "", "lt-nav")}
    <div class="scroll">
      <div class="lt" style="padding-top:0"><h1>Account</h1></div>
      <div class="card profile up"><span class="avatar">A</span><div><b>Ama Mensah</b><small><i class="ph-fill ph-whatsapp-logo"></i>+233 55 123 4987</small></div></div>
      <div class="stats up"><div class="card"><b>8</b><small>Orders</small></div><div class="card"><b class="nums">GH₵1.2k</b><small>Box savings</small></div><div class="card"><b>4</b><small>Watching</small></div></div>
      <div class="group-h">Delivery &amp; pay</div>
      <div class="card group">
        <button class="cell" ${H("light")}><span class="ci" style="background:var(--coral)"><i class="ph-fill ph-house-line"></i></span>Addresses<span class="val">2<i class="ph ph-caret-right"></i></span></button>
        <button class="cell" ${H("light")}><span class="ci" style="background:#e8b800"><i class="ph-fill ph-wallet"></i></span>MoMo numbers<span class="val">MTN ··4987<i class="ph ph-caret-right"></i></span></button>
        <button class="cell" ${H("light")}><span class="ci" style="background:#2b2422"><i class="ph-fill ph-scan-smiley"></i></span>Face ID to pay<span class="toggle on" data-act="toggle"></span></button>
      </div>
      <div class="group-h">Feel &amp; alerts</div>
      <div class="card group">
        <button class="cell" ${H("light")}><span class="ci" style="background:#8b7cf6"><i class="ph-fill ph-vibrate"></i></span>Haptics<span class="toggle on" data-act="toggle"></span></button>
        <button class="cell" data-act="hapticTour"><span class="ci" style="background:#f9a58f"><i class="ph-fill ph-hand-tap"></i></span>Feel each haptic<span class="val">Play<i class="ph ph-play"></i></span></button>
        <button class="cell" ${H("light")}><span class="ci" style="background:#25d366"><i class="ph-fill ph-whatsapp-logo"></i></span>WhatsApp updates<span class="toggle on" data-act="toggle"></span></button>
        <button class="cell" ${H("light")}><span class="ci" style="background:var(--coral)"><i class="ph-fill ph-bell-simple-ringing"></i></span>Push notifications<span class="toggle on" data-act="toggle"></span></button>
        <button class="cell" ${H("light")}><span class="ci" style="background:#2b2422"><i class="ph-fill ph-device-mobile"></i></span>Live Activities<span class="toggle on" data-act="toggle"></span></button>
      </div>
      <div class="group-h">Help</div>
      <div class="card group">
        <button class="cell" data-go="chat" ${H("light")}><span class="ci" style="background:var(--coral-strong)"><i class="ph-fill ph-chat-circle-dots"></i></span>Chat with us<span class="val"><i class="ph ph-caret-right"></i></span></button>
        <button class="cell" ${H("light")}><span class="ci" style="background:#6e625b"><i class="ph-fill ph-receipt"></i></span>Payments &amp; receipts<span class="val"><i class="ph ph-caret-right"></i></span></button>
        <button class="cell" data-go="welcome" ${H("warning")}><span class="ci" style="background:#8a7f79"><i class="ph-bold ph-sign-out"></i></span>Sign out</button>
      </div>
      <p class="version">Tomame for iPhone · 1.0 (design)</p>
    </div>`;

  R.share = () => {
    const p = P.sony, l = landed(p);
    return `
    <div class="safari"><div class="page"><img src="${img(p.img)}"><div class="ttl">${p.title}</div><div class="pr">$328.00</div></div><div class="urlbar">🔒 amazon.com</div></div>
    <div class="ios-sheet">
      <div class="ext">
        <div class="hd"><img src="assets/logo-mark.webp" alt=""><span>Tomame</span><small><i class="ph-fill ph-seal-check"></i>Priced</small></div>
        <div class="row"><img src="${img(p.img)}"><div><b>${p.title}</b>${storeTag(p)}</div></div>
        <div class="p nums">${ghs(l.total)}<small>to your door in Accra, all in · at your door by Sat 6 Dec</small></div>
        <div class="acts"><button class="btn btn-ghost" data-go="watch" ${H("light")}><i class="ph ph-bookmark-simple"></i>Watch</button><button class="btn btn-primary" data-act="add" data-id="sony" data-then="bag" ${H("medium")}><i class="ph-bold ph-handbag"></i>Add to bag</button></div>
      </div>
      <div class="apps">
        <div class="tm"><span><img src="assets/logo-mark.webp"></span>Tomame</div>
        <div><span style="background:#25d366"><i class="ph-fill ph-whatsapp-logo"></i></span>WhatsApp</div>
        <div><span style="background:#34c759"><i class="ph-fill ph-chat-circle"></i></span>Messages</div>
        <div><span style="background:#1a8cff"><i class="ph-fill ph-envelope-simple"></i></span>Mail</div>
        <div><span style="background:#ffcc00"><i class="ph-fill ph-note"></i></span>Notes</div>
      </div>
      <div class="ios-list"><div>Copy <i class="ph ph-copy"></i></div><div>Add to Reading List <i class="ph ph-eyeglasses"></i></div></div>
    </div>`;
  };

  R.lock = () => `
    <div class="scroll lock" style="padding-bottom:0">
      <div class="date">Monday 23 November</div><div class="time">9:41</div>
      <div class="la" data-go="track" ${H("light")}>
        <div class="hd"><span class="lg"><img src="assets/logo-mark.webp"></span><div><b>In flight to Accra</b><small>TM-00038 · BRIO Railway Set</small></div><div class="eta"><b>Wed</b><small style="display:block;font-size:12px;color:#ffffffa0">lands</small></div></div>
        <div class="track"><div class="ln"><span></span></div><i class="ph-fill ph-airplane pl"></i></div>
        <div class="ends"><span>JFK</span><span>At your door Sat 28</span><span>ACC</span></div>
      </div>
      <div class="notif" data-go="product/sony" ${H("light")}><span class="app-ic"><img src="assets/logo-mark.webp"></span><div><b>Price drop −13%</b><p>Sony WH-1000XM5 is now ${ghs(landed(P.sony).total * 0.87)} to your door.</p></div><span class="when">now</span></div>
      <div class="notif" data-go="bag" ${H("light")}><span class="app-ic"><img src="assets/logo-mark.webp"></span><div><b>Your box closes Thursday</b><p>4 items are sharing freight. Add more before 6 pm.</p></div><span class="when">2h ago</span></div>
      <div class="lock-hint">Swipe up to open</div>
      <div class="lock-foot"><span><i class="ph-fill ph-flashlight"></i></span><span><i class="ph-fill ph-camera"></i></span></div>
    </div>`;

  /* ── Router ────────────────────────────────── */
  const meta = (id) => SCREENS.find((s) => s.id === id || s.id.split("/")[0] === id.split("/")[0]);
  function parse() {
    const h = decodeURIComponent(location.hash.slice(1)) || "home";
    return h;
  }
  function depthOf(id) { const m = meta(id); return m?.depth || 0; }
  let lastBase = null;

  function route() {
    const h = parse();
    const [name, arg] = h.split("/");
    const m = meta(h) || meta("home");
    $$("#screenList a").forEach((a) => a.classList.toggle("on", a.dataset.s === h || (a.dataset.s.split("/")[0] === name)));
    if (m.sheet) {
      const base = name === "pay" ? "bag" : lastBase || "home";
      if (lastBase !== base) showView(base, "fade");
      openSheet(name, arg);
      return;
    }
    closeSheet(true);
    let dir = "fade";
    if (lastBase) {
      const a = depthOf(lastBase), b = depthOf(name);
      if (b > a) dir = "push"; else if (b < a) dir = "pop";
    }
    showView(name, dir);
  }

  function showView(name, dir) {
    S.timers.forEach(clearInterval); S.timers = [];
    const m = meta(name) || meta("home");
    const old = $(".view", views);
    const v = document.createElement("section");
    v.className = "view " + name + (m.chrome === "none" ? " no-tabs" : "");
    v.innerHTML = R[name]();
    if ($(".navbar", v)) v.classList.add("has-navbar");
    views.appendChild(v);
    if (old) {
      if (dir === "push") { v.classList.add("enter-push"); old.classList.add("leave-push"); }
      else if (dir === "pop") { v.classList.add("enter-pop"); old.classList.add("leave-pop"); }
      else v.classList.add("enter-fade");
      setTimeout(() => old.remove(), 520);
    }
    lastBase = name;
    S.current = name;
    renderTabs(m);
    const dark = name === "lock";
    statusbar(dark);
    device.classList.toggle("dark-chrome", dark);
    device.classList.toggle("no-tabs-device", m.chrome === "none");
    bind(v, name);
  }

  function renderTabs(m) {
    const hidden = m.chrome === "none";
    tabbar.classList.toggle("hidden", hidden);
    const tabs = [["home", "house", "Home"], ["watch", "bookmark-simple", "Watch"], ["chat", "sparkle", "Buy for me"], ["orders", "package", "Orders"], ["bag", "handbag", "Bag"]];
    tabbar.innerHTML = tabs.map(([id, ic, l]) => {
      const on = m.tab === id;
      if (id === "chat") return `<button class="tab tab-ai ${on ? "on" : ""}" data-tab="chat" data-nopin ${H("light")}><span class="orb"><i class="ph-fill ph-sparkle"></i></span><span class="lbl">${l}</span></button>`;
      return `<button class="tab ${on ? "on" : ""}" data-tab="${id}" data-nopin ${H("select")}><i class="${on ? "ph-fill" : "ph"} ph-${ic}"></i>${l}${id === "bag" && bagCount() ? `<span class="badge nums" id="bagBadge">${bagCount()}</span>` : ""}</button>`;
    }).join("");
    tabbar.dataset.hg = "select:tabs · select";
    if (S.pins) pinsFor(tabbar);
  }

  /* ── Sheets ────────────────────────────────── */
  let sheetName = null;
  function openSheet(name, arg) {
    sheetName = name;
    sheetLayer.innerHTML = `<div class="scrim" data-close></div><div class="sheet" id="sheet" style="${name === "product" ? "height:calc(100% - 50px)" : ""}">${R[name](arg)}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => sheetLayer.classList.add("open")));
    const sh = $("#sheet");
    bindSheetDrag(sh);
    bind(sh, name);
  }
  function closeSheet(silent) {
    if (!sheetName) return;
    sheetLayer.classList.remove("open");
    sheetName = null;
    setTimeout(() => { if (!sheetName) sheetLayer.innerHTML = ""; }, 450);
    if (!silent) { history.replaceState(null, "", "#" + (lastBase || "home")); syncList(); }
  }
  function syncList() { const h = parse(); $$("#screenList a").forEach((a) => a.classList.toggle("on", a.dataset.s === h)); }
  function bindSheetDrag(sh) {
    const g = $(".grabber", sh); if (!g) return;
    let y0 = null, dy = 0;
    const down = (e) => { y0 = e.clientY; sh.classList.add("dragging"); capture(g, e); };
    const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sh.style.setProperty("--drag", dy + "px"); };
    const up = (e) => {
      if (y0 == null) return; y0 = null; sh.classList.remove("dragging");
      if (dy > 120) { haptic("light", e); closeSheet(); } else sh.style.setProperty("--drag", "0px");
      dy = 0;
    };
    g.addEventListener("pointerdown", down); g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
  }

  /* ── Toasts & pushes ───────────────────────── */
  function toast(html, ms = 2400) {
    const t = document.createElement("div"); t.className = "toast"; t.innerHTML = html;
    $("#toastLayer").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, ms);
    return t;
  }
  function push(title, body, go) {
    const n = document.createElement("div"); n.className = "push";
    n.innerHTML = `<span class="app-ic"><img src="assets/logo-mark.webp"></span><div><b>${title}</b><p>${body}</p></div><span class="when">now</span>`;
    n.onclick = () => { n.remove(); if (go) location.hash = go; };
    $("#bannerLayer").innerHTML = ""; $("#bannerLayer").appendChild(n);
    setTimeout(() => { n.classList.add("out"); setTimeout(() => n.remove(), 420); }, 4200);
  }

  /* ── Bag mutations ─────────────────────────── */
  function bumpBadge() {
    renderTabs(meta(S.current) || meta("home"));
    const b = $("#bagBadge"); if (b) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
    const tab = $('[data-tab="bag"]'); if (tab) { tab.classList.add("bounce"); setTimeout(() => tab.classList.remove("bounce"), 500); }
  }
  function addToBag(id, srcEl, ev, then) {
    const ex = S.bag.find((l) => l.id === id);
    if (ex) ex.q++; else S.bag.push({ id, q: 1, opt: P[id].options?.[0] });
    // flying thumbnail into the Bag tab
    const from = srcEl?.closest(".sheet, .card, .pcard, .ext")?.querySelector("img") || srcEl;
    const tabEl = $('[data-tab="bag"]');
    const dr = device.getBoundingClientRect();
    if (from && tabEl) {
      const a = from.getBoundingClientRect(), b = tabEl.getBoundingClientRect();
      const f = document.createElement("img"); f.src = img(P[id].img); f.className = "fly";
      const size = Math.min(a.width, 120);
      Object.assign(f.style, { left: a.left - dr.left + (a.width - size) / 2 + "px", top: a.top - dr.top + (a.height - size) / 2 + "px", width: size + "px", height: size + "px" });
      device.appendChild(f);
      requestAnimationFrame(() => {
        const tx = b.left + b.width / 2 - (a.left + a.width / 2), ty = b.top + 12 - (a.top + a.height / 2);
        f.style.transform = `translate(${tx}px, ${ty}px) scale(.18)`; f.style.opacity = "0.4";
      });
      setTimeout(() => f.remove(), 760);
    }
    setTimeout(() => {
      bumpBadge(); haptic("success");
      const t = toast(`<img src="${img(P[id].img)}"><span>Added to your bag</span><span class="t-act">View bag</span>`);
      t.onclick = () => (location.hash = "bag");
      if (then) setTimeout(() => (location.hash = then), 700);
      if (S.current === "bag") refresh();
    }, from && tabEl ? 700 : 50);
  }
  function refresh() {
    const v = $(".view", views); if (!v) return;
    const st = $(".scroll", v)?.scrollTop || 0;
    v.innerHTML = R[S.current](); if ($(".navbar", v)) v.classList.add("has-navbar");
    bind(v, S.current);
    const sc = $(".scroll", v); if (sc) sc.scrollTop = st;
    renderTabs(meta(S.current));
  }

  /* ── Bindings per view ─────────────────────── */
  function bind(root, name) {
    // navbar hairline on scroll
    const sc = $(".scroll", root), nb = $(".navbar", root);
    if (sc && nb) sc.addEventListener("scroll", () => nb.classList.toggle("scrolled", sc.scrollTop > 4), { passive: true });
    if (name === "home") typeLoop(root);
    if (name === "product") bindCarousel(root);
    if (name === "bag") $$(".swipe", root).forEach(bindSwipe);
    if (name === "pay") bindSlider(root);
    if (name === "paid") { confetti($("#confetti", root)); setTimeout(() => haptic("success"), 250); }
    if (name === "track") { bindHold(root); $$(".stop", root).forEach((s) => s.addEventListener("click", () => { if (s.classList.contains("cur")) advance(); })); }
    if (sc && sc.hasAttribute("data-ptr")) bindPTR(sc);
    $$("[data-countdown]", root).forEach((el) => tick(el));
    if (S.pins) setTimeout(() => pinsFor(root), 650);
  }

  const phrases = ["AirPods Pro 2 under GH₵3,000", "amazon.com/dp/B0CHWRXH8B", "a purple PS5 controller", "Nike Air Force 1, size 44", "the cheapest iPhone 15 that ships"];
  function typeLoop(root) {
    const el = $("#typed", root); if (!el) return;
    if (params.get("still") === "1") { el.textContent = phrases[0]; return; }
    let pi = 0, ci = 0, dir = 1, wait = 0;
    S.timers.push(setInterval(() => {
      if (wait) { wait--; return; }
      const s = phrases[pi]; ci += dir; el.textContent = s.slice(0, ci);
      if (ci >= s.length) { dir = -1; wait = 28; } else if (ci <= 0) { dir = 1; pi = (pi + 1) % phrases.length; wait = 4; }
    }, 55));
  }
  function tick(el) {
    if (el.dataset.countdown === "lock") {
      let s = 23 * 3600 + 41 * 60 + 8;
      S.timers.push(setInterval(() => { s--; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; el.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`; }, 1000));
    }
  }
  function bindCarousel(root) {
    const c = $("#carousel", root), d = $$("#cdots i", root); if (!c) return;
    let cur = 0;
    c.addEventListener("scroll", () => {
      const i = Math.round(c.scrollLeft / c.clientWidth);
      if (i !== cur) { cur = i; d.forEach((x, k) => x.classList.toggle("on", k === i)); haptic("select"); }
    }, { passive: true });
  }

  function bindSwipe(row) {
    const line = $(".line", row); let x0 = null, y0 = null, dx = 0, armed = 0, locked = null;
    const TH = 96;
    line.addEventListener("pointerdown", (e) => { if (e.target.closest(".stepper")) return; x0 = e.clientX; y0 = e.clientY; locked = null; capture(line, e); line.classList.add("dragging"); });
    line.addEventListener("pointermove", (e) => {
      if (x0 == null) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!locked) { if (Math.abs(mx) > 6) locked = "x"; else if (Math.abs(my) > 6) locked = "y"; }
      if (locked !== "x") return;
      dx = mx > 0 ? Math.min(mx, 150) : Math.max(mx, -170);
      line.style.transform = `translateX(${dx}px)`;
      const a = dx <= -TH ? -1 : dx >= TH ? 1 : 0;
      if (a !== armed) { armed = a; row.classList.toggle("armed", !!a); if (a) haptic("select", e); }
    });
    const end = (e) => {
      if (x0 == null) return; x0 = null; line.classList.remove("dragging");
      const id = row.dataset.line;
      if (armed === -1) {
        line.style.transform = "translateX(-110%)"; haptic("medium", e);
        setTimeout(() => {
          row.style.height = row.offsetHeight + "px"; row.classList.add("removing");
          const removed = S.bag.find((l) => l.id === id); S.bag = S.bag.filter((l) => l.id !== id);
          setTimeout(() => { refresh(); const t = toast(`<i class="ph-fill ph-trash" style="font-size:20px;color:#ffb39f"></i><span>Removed ${P[id].short}</span><span class="t-act">Undo</span>`, 3200); t.onclick = () => { S.bag.push(removed); refresh(); haptic("light"); t.remove(); }; }, 380);
        }, 180);
      } else if (armed === 1) {
        line.style.transform = ""; haptic("success", e); S.watching.add(id);
        toast(`<i class="ph-fill ph-bookmark-simple" style="font-size:20px;color:#ffd38a"></i><span>Watching ${P[id].short}</span>`);
      } else line.style.transform = "";
      armed = 0; row.classList.remove("armed"); dx = 0;
    };
    line.addEventListener("pointerup", end); line.addEventListener("pointercancel", end);
  }

  function bindSlider(root) {
    const s = $("#slider", root); if (!s) return;
    const knob = $(".knob", s); let x0 = null, max = 0, x = 0, lastQ = 0;
    knob.addEventListener("pointerdown", (e) => { x0 = e.clientX - x; max = s.clientWidth - 64; s.classList.add("dragging"); capture(knob, e); haptic("light", e); });
    knob.addEventListener("pointermove", (e) => {
      if (x0 == null) return; x = Math.max(0, Math.min(max, e.clientX - x0));
      s.style.setProperty("--x", x + "px"); s.style.setProperty("--p", x + 58 + "px"); s.style.setProperty("--lo", String(1 - x / max));
      const q = Math.floor((x / max) * 4); if (q !== lastQ) { lastQ = q; haptic("select"); }
    });
    const end = (e) => {
      if (x0 == null) return; x0 = null; s.classList.remove("dragging");
      if (x >= max - 4) { haptic("heavy", e); approve(); }
      else { x = 0; s.style.setProperty("--x", "0px"); s.style.setProperty("--p", "0px"); s.style.setProperty("--lo", "1"); }
    };
    knob.addEventListener("pointerup", end); knob.addEventListener("pointercancel", end);
  }
  function approve() {
    const body = $("#payBody"); if (!body) return;
    body.innerHTML = `<div class="approve"><div class="phone"><i class="ph-fill ph-device-mobile-camera"></i></div><h3>Check your phone</h3><p>Approve the MoMo prompt on 055 123 4987 with your PIN. We'll pick it up the moment you do.</p><div class="timer nums" id="aTimer">Waiting · 0:59</div></div><p class="fine">Didn't get it? Dial *170# → My Approvals.</p>`;
    let n = 59; const ti = setInterval(() => { n--; const el = $("#aTimer"); if (el) el.textContent = `Waiting · 0:${String(n).padStart(2, "0")}`; }, 1000);
    setTimeout(() => { clearInterval(ti); sheetName = null; sheetLayer.classList.remove("open"); setTimeout(() => (sheetLayer.innerHTML = ""), 400); location.hash = "paid"; }, 2800);
  }

  function bindHold(root) {
    const btn = $("#hold", root), card = $("#codeCard", root); if (!btn) return;
    let t0, raf, done = false;
    const step = () => { const p = Math.min(1, (performance.now() - t0) / 600); btn.style.setProperty("--hp", p); if (p < 1) raf = requestAnimationFrame(step); else if (!done) { done = true; card.classList.add("reveal"); $("span", btn).textContent = "Showing · release to hide"; haptic("success"); } };
    btn.addEventListener("pointerdown", (e) => { done = false; t0 = performance.now(); haptic("light", e); raf = requestAnimationFrame(step); });
    const up = () => { cancelAnimationFrame(raf); btn.style.setProperty("--hp", 0); if (!S.reveal) { card.classList.remove("reveal"); $("span", btn).textContent = "Hold to show"; } };
    btn.addEventListener("pointerup", up); btn.addEventListener("pointerleave", up);
  }

  function bindPTR(sc) {
    const ptr = $(".ptr", sc), spin = ptr && $(".spin", ptr); if (!spin) return;
    let y0 = null, d = 0, armed = false;
    sc.addEventListener("pointerdown", (e) => { if (sc.scrollTop <= 0 && !e.target.closest("button, a, .ask")) { y0 = e.clientY; } });
    sc.addEventListener("pointermove", (e) => {
      if (y0 == null) return; d = Math.max(0, e.clientY - y0);
      const k = Math.min(d / 90, 1);
      spin.style.opacity = k; spin.style.transform = `translateY(${Math.min(d * 0.6, 60) - 6}px) rotate(${d * 3}deg) scale(${0.6 + 0.4 * k})`;
      sc.style.transform = `translateY(${Math.min(d * 0.4, 50)}px)`;
      if (d > 90 && !armed) { armed = true; haptic("medium", e); }
    });
    const up = () => {
      if (y0 == null) return; y0 = null; sc.style.transition = "transform .4s var(--ease)"; sc.style.transform = "";
      if (armed) {
        ptr.classList.add("go"); spin.style.transform = "translateY(34px)";
        setTimeout(() => { ptr.classList.remove("go"); spin.style.opacity = 0; const u = $("#updated"); if (u) u.textContent = "Updated just now"; haptic("light"); }, 1100);
      } else spin.style.opacity = 0;
      setTimeout(() => (sc.style.transition = ""), 400); armed = false;
    };
    sc.addEventListener("pointerup", up); sc.addEventListener("pointerleave", up);
  }

  function confetti(cv) {
    if (!cv || params.get("still") === "1") return;
    const r = device.getBoundingClientRect(); cv.width = r.width * 2; cv.height = r.height * 2;
    const c = cv.getContext("2d"); c.scale(2, 2);
    const cols = ["#f43f5e", "#f97316", "#f59e0b", "#1e9a5c", "#ffcc00", "#f25b3d"];
    const ps = Array.from({ length: 120 }, () => ({ x: r.width / 2, y: 170, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 10 - 3, s: 4 + Math.random() * 5, c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3 }));
    let f = 0;
    (function loop() {
      c.clearRect(0, 0, r.width, r.height);
      ps.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.99; p.a += p.va; c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = p.c; c.globalAlpha = Math.max(0, 1 - f / 160); c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore(); });
      if (++f < 170) requestAnimationFrame(loop);
    })();
  }

  function advance() {
    if (S.stage >= 6) S.stage = 2; else S.stage++;
    const s = T.stages[S.stage];
    haptic("success");
    push(s.label, ["", "", "Weighed at our US hub: 3 lb. Photos inside.", "Your parcel is on Delta Cargo to Accra.", "Landed in Accra and cleared customs.", "Kwesi is on the way. Have your code ready.", "Delivered. Enjoy it!"][S.stage] || s.label, "track");
    if (["track", "orders", "home"].includes(S.current)) {
      refresh();
      const just = $(`.stop[data-stop="${S.stage}"]`); if (just) just.classList.add("just");
    }
  }

  /* ── Pins: where haptics fire ──────────────── */
  const PL = { light: "tap", select: "select", medium: "medium", heavy: "heavy", success: "success", warning: "warning" };
  function pinOne(el) {
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const g = el.dataset.hg, t = g ? g.split(":")[0] : el.dataset.h;
    const pin = document.createElement("span");
    pin.className = "hpin"; pin.style.setProperty("--hc", HC[t]);
    pin.innerHTML = `<i class="ph-bold ph-vibrate"></i>${g ? g.split(":")[1] : PL[t]}`;
    el.appendChild(pin);
  }
  function pinsFor(root) {
    $$(".hpin", root).forEach((x) => x.remove());
    if (root.matches && root.matches("[data-hg]")) pinOne(root);
    $$("[data-h]:not([data-nopin]), [data-hg]", root).forEach((el) => { if (el.getBoundingClientRect().width) pinOne(el); });
  }

  /* ── Global events ─────────────────────────── */
  device.addEventListener("click", (e) => {
    const t = e.target;
    const hEl = t.closest("[data-h]");
    const act = t.closest("[data-act]");
    const go = t.closest("[data-go]");
    const tab = t.closest("[data-tab]");
    const seg = t.closest("[data-seg] button");
    const st = t.closest("[data-stepper] button");
    const sc = t.closest("[data-segc] button");
    if (hEl && !(act && act.dataset.act === "hapticTour")) haptic(hEl.dataset.h, e);

    if (t.closest("[data-close]")) { closeSheet(); return; }
    if (t.closest("[data-back]")) { location.hash = S.current === "account" ? "home" : "orders"; return; }
    if (tab) {
      const id = tab.dataset.tab; tab.classList.add("bounce");
      if (location.hash.slice(1) === id) { const s = $(".view .scroll"); s && s.scrollTo({ top: 0, behavior: "smooth" }); }
      else location.hash = id;
      return;
    }
    if (seg) { $$("button", seg.parentElement).forEach((b) => b.classList.toggle("on", b === seg)); const n = $("#optName"); if (n) n.textContent = seg.textContent; return; }
    if (sc) {
      const key = sc.parentElement.dataset.segc; S[key] = sc.dataset.v; refresh(); return;
    }
    if (st) {
      const box = st.parentElement, id = box.dataset.id, span = $("span", box);
      let q = Math.max(1, Math.min(9, Number(span.textContent) + Number(st.dataset.d)));
      span.textContent = q;
      if (box.hasAttribute("data-bag")) { const l = S.bag.find((x) => x.id === id); if (l) { l.q = q; refresh(); } }
      else { const p = P[id], l = landed(p, q); $("#pdPrice").textContent = ghs(l.total); $("#ctaPrice").textContent = ghs(l.total); $("#bd").innerHTML = breakdownRows(p, q); }
      return;
    }
    if (act) {
      e.stopPropagation();
      const a = act.dataset.act, id = act.dataset.id;
      if (a === "add") {
        addToBag(id, act, e, act.dataset.then);
        if (act.dataset.from === "sheet") setTimeout(() => closeSheet(), 250);
      } else if (a === "quickAdd") { e.preventDefault(); addToBag(id, act, e); }
      else if (a === "watchToggle") {
        const on = !S.watching.has(id); on ? S.watching.add(id) : S.watching.delete(id);
        if (act.classList.contains("toggle")) act.classList.toggle("on", on);
        toast(`<i class="ph-fill ph-bell-simple-ringing" style="font-size:20px;color:#ffb39f"></i><span>${on ? "Watching. You'll hear the minute it drops." : "Stopped watching"}</span>`);
      } else if (a === "toggle") act.classList.toggle("on");
      else if (a === "copy") toast(`<i class="ph-fill ph-copy" style="font-size:20px;color:#ffb39f"></i><span>Copied TM-00038</span>`, 1600);
      else if (a === "rate") toast(`<i class="ph-fill ph-trend-down" style="font-size:20px;color:#8be0ae"></i><span>Cedi up 0.8% today · was ${T.ratePrev}</span>`);
      else if (a === "share") toast(`<i class="ph-fill ph-share-network" style="font-size:20px;color:#ffb39f"></i><span>Share sheet opens here</span>`, 1600);
      else if (a === "pasteClip") { S.chatLink = false; location.hash = "chat"; setTimeout(() => { const s = $(".view .scroll"); s && s.scrollTo({ top: 9999, behavior: "smooth" }); }, 400); }
      else if (a === "mic") { act.classList.toggle("mic-on"); }
      else if (a === "photo") toast(`<i class="ph-fill ph-camera" style="font-size:20px;color:#ffb39f"></i><span>Snap a product or a screenshot — we find it</span>`);
      else if (a === "follow" || a === "send") sendChat(a === "follow" ? act.textContent : $("#composer")?.value);
      else if (a === "hapticTour") { ["light", "select", "medium", "heavy", "success", "warning"].forEach((h, i) => setTimeout(() => haptic(h), i * 700)); }
      return;
    }
    if (go) { e.preventDefault(); location.hash = go.dataset.go; }
  });

  function sendChat(text) {
    text = (text || "").trim(); if (!text) return;
    const msgs = $("#msgs"); if (!msgs) return;
    const c = $("#composer"); if (c) c.value = "";
    msgs.insertAdjacentHTML("beforeend", `<div class="bubble me">${text.replace(/</g, "&lt;")}</div><div class="typing" id="typing"><span></span><span></span><span></span></div>`);
    const sc = $(".view .scroll"); sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" });
    setTimeout(() => {
      $("#typing")?.remove();
      const p = P.amazfit;
      msgs.insertAdjacentHTML("beforeend", `<div class="bubble ai">Here's one that fits. Priced to your door at today's rate.</div>
        <div class="card best"><div class="body" data-go="product/amazfit" ${H("light")}><img src="${img(p.img)}"><div>${storeTag(p)}<div class="t">${p.title}</div><div class="price nums">${ghs(landed(p).total)} <small>all in</small></div></div></div>
        <div class="acts"><button class="btn btn-ghost" data-go="product/amazfit" ${H("light")}>Details</button><button class="btn btn-primary" data-act="add" data-id="amazfit" ${H("medium")}><i class="ph-bold ph-handbag"></i>Add to bag</button></div></div>`);
      haptic("light");
      sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" });
    }, 1400);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && e.target.id === "composer") { e.preventDefault(); sendChat(e.target.value); } });

  // Desktop side panel
  $("#screenList").innerHTML = SCREENS.map((s, i) => `<a href="#${s.id}" data-s="${s.id}"><span>${String(i + 1).padStart(2, "0")}</span>${s.label}</a>`).join("");
  const pt = $("#pinsToggle"); pt.checked = S.pins;
  pt.addEventListener("change", () => { S.pins = pt.checked; if (S.pins) { pinsFor($(".view", views)); pinsFor(tabbar); const sh = $("#sheet"); sh && pinsFor(sh); } else $$(".hpin").forEach((p) => p.remove()); });
  $$("[data-sim]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.sim;
    if (k === "stage") advance();
    if (k === "drop") { haptic("success"); push("Price drop −13%", `Sony WH-1000XM5 is now ${ghs(landed(P.sony).total * 0.87)} to your door.`, "product/sony"); }
    if (k === "box") { haptic("warning"); push("Your box closes in 3 hours", "4 items are sharing freight. Add more before 6 pm.", "bag"); }
  }));

  window.addEventListener("hashchange", route);
  route();
})();
