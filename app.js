"use strict";

const STORAGE_KEY = "rokopa_shopping_v1";
let state = load();        // { booths: { "A5": {name,url,items:[{name,price,checked}]} } }
let curFloor = "2";
let curView = "settings";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn("load failed", e); }
  return { booths: {} };
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn("save failed", e); }
}

function boothMeta(id) {
  for (const fl of ["2", "3"]) {
    const b = BOOTH_DATA[fl].booths.find(b => b.id === id);
    if (b) return { floor: fl, box: b };
  }
  return null;
}
function isMarked(id) { return !!state.booths[id]; }
function isBoothDone(id) {
  const b = state.booths[id];
  if (!b || !b.items || b.items.length === 0) return false;
  // 完了 = 欲しい品物がすべて購入済み（ほしい外の品物は無視）
  return b.items.every(it => it.bought || it.checked === false);
}
function ensureBooth(id) {
  if (!state.booths[id]) state.booths[id] = { name: "", url: "", items: [], priority: "mid" };
  return state.booths[id];
}

const PRI_RANK = { high: 0, mid: 1, low: 2 };
const PRI_LABEL = { high: "高", mid: "中", low: "低" };
function priOf(id) { return (state.booths[id] && state.booths[id].priority) || "mid"; }
function markedIdsByPriority() {
  return markedIdsSorted().sort((a, b) => PRI_RANK[priOf(a)] - PRI_RANK[priOf(b)]);
}

/* ---------- map rendering ---------- */
function renderMap(view) {
  const suffix = view;
  const img = document.getElementById("map-img-" + suffix);
  const overlay = document.getElementById("overlay-" + suffix);
  img.src = BOOTH_DATA[curFloor].img;
  overlay.innerHTML = "";
  BOOTH_DATA[curFloor].booths.forEach(b => {
    const el = document.createElement("div");
    const marked = isMarked(b.id);
    el.className = "booth" + (marked ? " marked pri-" + priOf(b.id) : "") + (isBoothDone(b.id) ? " done" : "");
    el.style.left = b.x + "%";
    el.style.top = b.y + "%";
    el.style.width = b.w + "%";
    el.style.height = b.h + "%";
    el.title = b.id;
    el.dataset.id = b.id;
    if (view === "settings") {
      el.addEventListener("click", () => toggleBooth(b.id));
    }
    overlay.appendChild(el);
  });
  getPanZoom(view).ensure(curFloor);
}

function toggleBooth(id) {
  if (isMarked(id)) {
    // unmark only if empty; if it already has data, keep it (no auto-scroll)
    const b = state.booths[id];
    const empty = !b.name && !b.url && b.items.length === 0;
    if (empty) { delete state.booths[id]; }
    else { return; }
  } else {
    ensureBooth(id);
  }
  save();
  renderMap("settings");
  renderEditors();
}

/* ---------- settings editors ---------- */
function markedIdsSorted() {
  return Object.keys(state.booths).sort((a, b) => {
    if (a[0] !== b[0]) return a < b ? -1 : 1;
    return parseInt(a.slice(1)) - parseInt(b.slice(1));
  });
}

function renderEditors() {
  const wrap = document.getElementById("editor-list");
  const ids = markedIdsSorted();
  if (ids.length === 0) {
    wrap.innerHTML = '<div class="empty">まだマークされたブースはありません。<br>地図のブースをタップしてください。</div>';
    return;
  }
  wrap.innerHTML = "";
  ids.forEach(id => wrap.appendChild(editorCard(id)));
}

function editorCard(id) {
  const data = state.booths[id];
  const meta = boothMeta(id);
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = id;

  const head = document.createElement("div");
  head.className = "card-head";
  head.innerHTML = '<span class="badge">' + id + '</span>' +
    '<span class="floor-tag">' + (meta ? meta.floor + "階" : "") + '</span><span class="grow"></span>';
  const close = document.createElement("button");
  close.className = "icon-btn"; close.textContent = "✕"; close.title = "マーク解除";
  close.addEventListener("click", () => { delete state.booths[id]; save(); renderMap("settings"); renderEditors(); });
  head.appendChild(close);
  card.appendChild(head);

  card.appendChild(prioritySelector(id));
  card.appendChild(fieldInput("サークル名", data.name, "text", v => { data.name = v; save(); }));
  card.appendChild(fieldInput("URL（お品書きなど）", data.url, "url", v => { data.url = v; save(); }));

  const ih = document.createElement("div");
  ih.className = "items-head"; ih.textContent = "頒布物・価格";
  card.appendChild(ih);

  const itemsWrap = document.createElement("div");
  data.items.forEach((it, idx) => itemsWrap.appendChild(itemRow(id, idx)));
  card.appendChild(itemsWrap);

  const add = document.createElement("button");
  add.className = "add-item"; add.textContent = "＋ 品物を追加";
  add.addEventListener("click", () => {
    data.items.push({ name: "", price: 0, checked: true });
    save();
    itemsWrap.appendChild(itemRow(id, data.items.length - 1));
  });
  card.appendChild(add);

  const unmark = document.createElement("button");
  unmark.className = "unmark"; unmark.textContent = "このブースのマークを外す";
  unmark.addEventListener("click", () => { delete state.booths[id]; save(); renderMap("settings"); renderEditors(); });
  card.appendChild(unmark);

  return card;
}

function prioritySelector(id) {
  const data = state.booths[id];
  const wrap = document.createElement("div");
  wrap.className = "field pri-select";
  const label = document.createElement("label");
  label.textContent = "優先度";
  wrap.appendChild(label);
  const row = document.createElement("div");
  row.className = "pri-row";
  ["high", "mid", "low"].forEach(val => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pri-btn pri-" + val + ((data.priority || "mid") === val ? " on" : "");
    b.textContent = PRI_LABEL[val];
    b.addEventListener("click", () => {
      data.priority = val; save();
      row.querySelectorAll(".pri-btn").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      renderMap("settings");
    });
    row.appendChild(b);
  });
  wrap.appendChild(row);
  return wrap;
}

function fieldInput(label, value, type, onInput) {
  const f = document.createElement("div");
  f.className = "field";
  const l = document.createElement("label"); l.textContent = label;
  const inp = document.createElement("input");
  inp.type = type; inp.value = value || "";
  if (type === "url") inp.placeholder = "https://...";
  inp.addEventListener("input", () => onInput(inp.value));
  f.appendChild(l); f.appendChild(inp);
  return f;
}

function itemRow(boothId, idx) {
  const data = state.booths[boothId];
  const it = data.items[idx];
  const row = document.createElement("div");
  row.className = "item-row";

  const name = document.createElement("input");
  name.className = "iname"; name.placeholder = "品名"; name.value = it.name || "";
  name.addEventListener("input", () => { it.name = name.value; save(); });

  const price = document.createElement("input");
  price.className = "iprice"; price.type = "number"; price.inputMode = "numeric";
  price.placeholder = "価格"; price.value = it.price || "";
  price.addEventListener("input", () => { it.price = parseInt(price.value) || 0; save(); });

  const del = document.createElement("button");
  del.className = "icon-btn del"; del.textContent = "🗑";
  del.addEventListener("click", () => {
    data.items.splice(idx, 1); save();
    renderEditors();  // re-render to fix indices
  });

  row.appendChild(name); row.appendChild(price); row.appendChild(del);
  return row;
}

/* ---------- shopping list ---------- */
function renderChecklist() {
  const wrap = document.getElementById("checklist");
  const ids = markedIdsByPriority().filter(id => boothMeta(id) && boothMeta(id).floor === curFloor);
  const allIds = markedIdsSorted();

  if (allIds.length === 0) {
    wrap.innerHTML = '<div class="empty">設定画面でブースをマークすると、ここに買い物リストが表示されます。</div>';
    updateTotal();
    return;
  }
  if (ids.length === 0) {
    wrap.innerHTML = '<div class="empty">この階にマークされたブースはありません。</div>';
    updateTotal();
    return;
  }
  wrap.innerHTML = "";
  ids.forEach(id => wrap.appendChild(checkCard(id)));
  updateTotal();
}

function checkCard(id) {
  const data = state.booths[id];
  const pri = data.priority || "mid";
  const card = document.createElement("div");
  card.className = "card pricard-" + pri; card.dataset.id = id;

  const head = document.createElement("div");
  head.className = "card-head";
  head.innerHTML = '<span class="badge">' + id + '</span>' +
    '<span class="pri-chip pri-' + pri + '">優先度 ' + PRI_LABEL[pri] + '</span>';
  const titleWrap = document.createElement("span");
  titleWrap.className = "grow";
  if (data.url) {
    const a = document.createElement("a");
    a.className = "clink"; a.href = data.url; a.target = "_blank"; a.rel = "noopener";
    a.textContent = data.name || "(サークル名未設定)";
    titleWrap.appendChild(a);
  } else {
    const s = document.createElement("span");
    s.className = "noname"; s.textContent = data.name || "(サークル名未設定)";
    titleWrap.appendChild(s);
  }
  head.appendChild(titleWrap);
  if (isBoothDone(id)) {
    card.classList.add("card-done");
    const dchip = document.createElement("span");
    dchip.className = "done-chip"; dchip.textContent = "✓ 完了";
    head.appendChild(dchip);
  }
  card.appendChild(head);

  if (data.items.length === 0) {
    const p = document.createElement("div");
    p.className = "sub"; p.textContent = "登録された品物はありません";
    card.appendChild(p);
  } else {
    let cardTotal = 0;
    const rerender = () => { const y = window.scrollY; renderChecklist(); renderMap("list"); window.scrollTo(0, y); };
    data.items.forEach((it) => {
      const want = it.checked !== false;
      const bought = it.bought === true;
      const row = document.createElement("div");
      row.className = "check-item" + (want ? "" : " unwanted") + (bought ? " bought" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = want; cb.title = "ほしい（合計に含める）";
      cb.addEventListener("change", () => { it.checked = cb.checked; save(); rerender(); });

      const nm = document.createElement("span");
      nm.className = "ci-name"; nm.textContent = it.name || "(品名未設定)";
      const pr = document.createElement("span");
      pr.className = "ci-price"; pr.textContent = "¥" + (it.price || 0).toLocaleString();

      const got = document.createElement("button");
      got.className = "got-btn" + (bought ? " on" : "");
      got.textContent = bought ? "✓ 買った" : "買う";
      got.title = "購入済みにする";
      got.addEventListener("click", () => { it.bought = !it.bought; save(); rerender(); });

      row.appendChild(cb); row.appendChild(nm); row.appendChild(pr); row.appendChild(got);
      card.appendChild(row);
      if (want) cardTotal += (it.price || 0);
    });
    const ct = document.createElement("div");
    ct.className = "card-total"; ct.textContent = "小計 ¥" + cardTotal.toLocaleString();
    card.appendChild(ct);
  }
  return card;
}

function updateTotal() {
  let total = 0, remain = 0;
  Object.values(state.booths).forEach(b => {
    b.items.forEach(it => {
      if (it.checked !== false) {
        total += (it.price || 0);
        if (it.bought !== true) remain += (it.price || 0);
      }
    });
  });
  document.getElementById("total-amount").textContent = "¥" + total.toLocaleString();
  document.getElementById("remain-amount").textContent = "¥" + remain.toLocaleString();
}

/* ---------- map pan & zoom ---------- */
class PanZoom {
  constructor(view) {
    this.wrap = document.getElementById("map-" + view);
    this.inner = document.getElementById("inner-" + view);
    this.NW = 2480; this.NH = 1755;   // natural image size
    this.maxAbs = 1.4;                // max zoom (1.0 = native pixels)
    this.base = null; this.floor = null;
    this.scale = null; this.tx = 0; this.ty = 0;
    this.pointers = new Map();
    this.panStart = null; this.moved = 0; this.suppress = false;
    this.pinchDist = 0; this.pinchScale = 1;
    this.bind();
  }
  vw() { return this.wrap.clientWidth; }
  vh() { return this.wrap.clientHeight; }
  computeBase() { return (this.wrap.clientWidth || this.NW) / this.NW; }
  fit() { this.base = this.computeBase(); this.scale = this.base; this.tx = 0; this.ty = 0; this.suppress = false; this.apply(); }
  ensure(floor) {
    if (this.scale === null || this.floor !== floor) { this.floor = floor; this.fit(); }
    else this.apply();
  }
  clamp() {
    if (!this.base) this.base = this.computeBase();
    this.scale = Math.min(this.maxAbs, Math.max(this.base, this.scale));
    const minTx = this.vw() - this.NW * this.scale;
    const minTy = this.vh() - this.NH * this.scale;
    this.tx = Math.min(0, Math.max(minTx, this.tx));
    this.ty = Math.min(0, Math.max(minTy, this.ty));
  }
  apply() {
    this.clamp();
    this.inner.style.transform = "translate(" + this.tx + "px," + this.ty + "px) scale(" + this.scale + ")";
  }
  zoomTo(newScale, cx, cy) {
    newScale = Math.min(this.maxAbs, Math.max(this.base || this.computeBase(), newScale));
    const contentX = (cx - this.tx) / this.scale;
    const contentY = (cy - this.ty) / this.scale;
    this.scale = newScale;
    this.tx = cx - contentX * newScale;
    this.ty = cy - contentY * newScale;
    this.apply();
  }
  zoomBy(f) { const r = this.wrap.getBoundingClientRect(); this.zoomTo(this.scale * f, r.width / 2, r.height / 2); }
  reset() { this.fit(); }
  rel(e) { const r = this.wrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  bind() {
    this.inner.addEventListener("pointerdown", e => this.onDown(e));
    this.inner.addEventListener("pointermove", e => this.onMove(e));
    window.addEventListener("pointerup", e => this.onUp(e));
    window.addEventListener("pointercancel", e => this.onUp(e));
    this.wrap.addEventListener("click", e => {
      if (this.suppress) { e.stopPropagation(); e.preventDefault(); this.suppress = false; }
    }, true);
    this.wrap.addEventListener("wheel", e => {
      e.preventDefault(); const p = this.rel(e);
      this.zoomTo(this.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y);
    }, { passive: false });
    this.inner.addEventListener("dblclick", e => {
      const p = this.rel(e);
      if (this.scale > this.base * 1.5) this.reset();
      else this.zoomTo(Math.min(this.maxAbs, this.base * 4), p.x, p.y);
    });
  }
  onDown(e) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.suppress = false; this.moved = 0;
      this.panStart = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty };
    } else if (this.pointers.size === 2) {
      const p = [...this.pointers.values()];
      this.pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
      this.pinchScale = this.scale;
    }
  }
  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      const p = [...this.pointers.values()];
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
      const r = this.wrap.getBoundingClientRect();
      const mx = (p[0].x + p[1].x) / 2 - r.left;
      const my = (p[0].y + p[1].y) / 2 - r.top;
      this.zoomTo(this.pinchScale * (dist / this.pinchDist), mx, my);
      this.suppress = true;
    } else if (this.panStart) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      this.moved = Math.abs(dx) + Math.abs(dy);
      if (this.moved > 8 && this.scale > 1.001) {
        this.tx = this.panStart.tx + dx; this.ty = this.panStart.ty + dy;
        this.suppress = true; this.apply();
      }
    }
  }
  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) this.panStart = null;
  }
}
const mapPanZooms = {};
function getPanZoom(view) {
  if (!mapPanZooms[view]) mapPanZooms[view] = new PanZoom(view);
  return mapPanZooms[view];
}
window.addEventListener("resize", () => {
  const pz = mapPanZooms[curView];
  if (pz && pz.wrap.clientWidth) pz.fit();
});
document.querySelectorAll(".zoom-ctrl button").forEach(btn => {
  btn.addEventListener("click", () => {
    const pz = getPanZoom(btn.dataset.mz);
    if (btn.dataset.z === "in") pz.zoomBy(1.4);
    else if (btn.dataset.z === "out") pz.zoomBy(1 / 1.4);
    else pz.reset();
  });
});

/* ---------- view / floor switching ---------- */
function switchView(view) {
  curView = view;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  document.getElementById("view-settings").classList.toggle("active", view === "settings");
  document.getElementById("view-list").classList.toggle("active", view === "list");
  refresh();
  getPanZoom(view).reset();
}
function switchFloor(fl) {
  curFloor = fl;
  document.querySelectorAll(".floor").forEach(f => f.classList.toggle("active", f.dataset.floor === fl));
  refresh();
  getPanZoom(curView).reset();
}
function refresh() {
  if (curView === "settings") { renderMap("settings"); renderEditors(); }
  else { renderMap("list"); renderChecklist(); }
}

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => switchView(t.dataset.view)));
document.querySelectorAll(".floor").forEach(f => f.addEventListener("click", () => switchFloor(f.dataset.floor)));

refresh();

/* ---------- PWA service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW reg failed", e));
  });
}
