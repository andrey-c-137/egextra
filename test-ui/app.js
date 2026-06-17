// BallLab — пользовательский интерфейс (vanilla JS, без сборки)
// База API: если открыто со старого статик-сервера (:5173) — стучимся в backend :3000;
// если отдаётся самим backend (:3000) или через публичный туннель — тот же origin.
const API = /:5173$/.test(location.host)
  ? `${location.protocol}//${location.hostname}:3000/api`
  : `${location.origin}/api`;

const S = {
  access: localStorage.getItem("ege_access") || null,
  refresh: localStorage.getItem("ege_refresh") || null,
  user: null,
  profile: null,
  accessInfo: null, // { hasAccess, planCode, planName, ... }
  tab: "dashboard",
};

/* ===================== API ===================== */
async function rawFetch(method, path, body, auth, token) {
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { res, data };
}

let refreshing = null;
function tryRefresh() {
  if (!S.refresh) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = rawFetch("POST", "/auth/refresh", { refreshToken: S.refresh }, false)
      .then(({ res, data }) => { if (res.ok && data && data.accessToken) { setTokens(data); return true; } return false; })
      .catch(() => false);
    refreshing.finally(() => setTimeout(() => { refreshing = null; }, 0));
  }
  return refreshing;
}

async function api(method, path, body, auth = true) {
  let { res, data } = await rawFetch(method, path, body, auth, S.access);
  if (res.status === 401 && auth && S.refresh) {
    const ok = await tryRefresh();
    if (ok) ({ res, data } = await rawFetch(method, path, body, auth, S.access));
    else { sessionExpired(); throw { status: 401, message: "Сессия истекла" }; }
  }
  if (!res.ok) {
    const errObj = data && data.error;
    const code = errObj && errObj.code;
    const msg = (errObj && errObj.message) || (data && data.message) || `Ошибка ${res.status}`;
    throw { status: res.status, code, message: Array.isArray(msg) ? msg.join(", ") : msg };
  }
  return data;
}

function sessionExpired() {
  S.access = S.refresh = S.user = S.profile = S.accessInfo = null;
  ["ege_access", "ege_refresh"].forEach(k => localStorage.removeItem(k));
  toast("Сессия истекла", "Войдите снова, пожалуйста", "warn");
  renderAuth();
}
function setTokens(d) {
  if (d.accessToken) { S.access = d.accessToken; localStorage.setItem("ege_access", d.accessToken); }
  if (d.refreshToken) { S.refresh = d.refreshToken; localStorage.setItem("ege_refresh", d.refreshToken); }
}
function logout() {
  S.access = S.refresh = S.user = S.profile = S.accessInfo = null;
  ["ege_access", "ege_refresh"].forEach(k => localStorage.removeItem(k));
  boot();
}

/* ===================== helpers ===================== */
const $ = (sel) => document.querySelector(sel);
const app = () => document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = (d) => new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const daysLeft = (d) => Math.max(0, Math.ceil((new Date(d) - Date.now()) / 864e5));

function getTheme() { return localStorage.getItem("ball_theme") || "dark"; }
function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); localStorage.setItem("ball_theme", t); }
function toggleTheme() { applyTheme(getTheme() === "dark" ? "light" : "dark"); rerender(); }
function rerender() {
  if (!S.access) return renderLanding();
  if (S.user) renderApp();
}

function isAdmin() { return S.user && S.user.role === "ADMIN"; }
function hasAccess() { return !!(S.accessInfo && S.accessInfo.hasAccess); }
function displayName() { const u = S.user; return (u && u.name) ? u.name : ((u && u.email) ? u.email.split("@")[0] : "Гость"); }
function avatarInitials() {
  const u = S.user; const base = (u && (u.name || u.email)) || "?";
  const p = base.trim().split(/[\s._-]+/).filter(Boolean);
  return (p.length > 1 ? p[0][0] + p[1][0] : base.slice(0, 2)).toUpperCase();
}

/* готовность задания → цвет/подпись */
const READY = {
  ready: ["GREEN", "Готово"], unstable: ["YELLOW", "Нестабильно"],
  weak: ["RED", "Слабое"], no_data: ["GRAY", "Нет данных"],
};
const trendIcon = (t) => (t > 0 ? "↑" : t < 0 ? "↓" : "→");

function tc() {
  const s = getComputedStyle(document.documentElement);
  const g = (n, d) => (s.getPropertyValue(n).trim() || d);
  return { cyan: g("--cyan", "#1fc8e3"), blue: g("--blue", "#4f76ff"), violet: g("--violet", "#8b5cf6"),
    track: g("--chart-track", "#1f2a44"), ink: g("--ink", "#e7eef9"), mut: g("--mut", "#8492ab"), red: g("--red", "#ff5d6c") };
}

function logoSvg() {
  return `<svg viewBox="0 0 380 140" role="img" aria-label="BallLab">
    <g transform="translate(16 16)">
      <g stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M27 74.5C40 65.5 53.5 66.5 64 79C74.5 66.5 88 65.5 101 74.5V105C87.5 96 75 97.5 64 110C53 97.5 40.5 96 27 105V74.5Z"/>
        <path d="M64 79V110"/>
      </g>
      <path d="M64 79C75 55 88.5 39.5 105 28" stroke="#1fc8e3" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="106.5" cy="27" r="6.5" fill="#1fc8e3"/>
    </g>
    <g fill="currentColor" transform="translate(160 92) scale(1 -1)">
      <path d="M3.145 0.000 L21.016 0.000 C30.613 0.000 35.797 4.839 35.797 11.899 C35.797 17.898 31.837 21.523 26.680 22.004 L26.680 22.058 C31.320 23.227 34.238 26.481 34.238 31.347 C34.238 37.836 29.145 42.195 20.055 42.195 L3.145 42.195 L3.145 0.000 Z M11.672 6.851 L11.672 18.098 L19.938 18.098 C24.324 18.098 26.907 15.887 26.907 12.379 C26.907 8.863 24.269 6.851 19.792 6.851 L11.672 6.851 Z M11.672 24.668 L11.672 35.344 L19.403 35.344 C23.227 35.344 25.574 33.277 25.574 29.988 C25.574 26.734 23.227 24.668 19.403 24.668 L11.672 24.668 Z M49.472 -0.507 C54.067 -0.507 56.641 1.305 58.227 4.223 L58.344 4.223 L58.344 0.000 L66.501 0.000 L66.501 20.282 C66.501 26.680 61.797 30.532 53.614 30.532 C45.394 30.532 40.527 26.626 40.156 20.445 L48.004 20.445 C48.203 22.738 50.242 24.324 53.360 24.324 C56.414 24.324 58.254 22.801 58.254 20.590 L58.254 20.391 C58.254 18.469 56.332 18.207 50.868 17.672 C44.633 17.110 39.195 15.180 39.195 8.437 C39.195 2.465 43.500 -0.507 49.472 -0.507 Z M51.801 5.292 C48.992 5.292 47.179 6.543 47.179 8.664 C47.179 11.047 49.445 12.153 52.309 12.579 C55.000 12.996 57.347 13.394 58.308 13.938 L58.308 10.929 C58.308 7.703 55.816 5.292 51.801 5.292 Z M80.742 42.195 L72.387 42.195 L72.387 0.000 L80.742 0.000 L80.742 42.195 Z M94.987 42.195 L86.632 42.195 L86.632 0.000 L94.987 0.000 L94.987 42.195 Z"/>
      <path d="M4.386 0.000 L29.027 0.000 L29.027 3.453 L8.238 3.453 L8.238 42.195 L4.386 42.195 L4.386 0.000 Z M43.046 -0.453 C48.429 -0.453 51.401 2.121 52.706 4.903 L52.788 4.903 L52.788 0.000 L56.413 0.000 L56.413 20.735 C56.413 26.481 51.854 30.441 45.203 30.441 C38.433 30.441 33.584 26.363 33.421 20.962 L37.101 20.962 C37.273 24.469 40.608 27.160 45.203 27.160 C49.761 27.160 52.788 24.442 52.788 20.735 L52.788 20.282 C52.788 17.926 50.386 17.844 44.804 17.074 C37.780 16.168 32.742 14.554 32.742 8.356 C32.742 2.492 37.354 -0.453 43.046 -0.453 Z M43.499 2.864 C39.366 2.864 36.448 4.758 36.448 8.183 C36.448 11.781 39.620 13.195 44.632 13.902 C48.574 14.446 51.746 14.953 52.788 15.887 L52.788 11.700 C52.788 6.516 49.480 2.864 43.499 2.864 Z M77.457 -0.535 C85.133 -0.535 90.480 5.691 90.480 14.953 C90.480 24.215 85.106 30.441 77.457 30.441 C72.953 30.441 69.020 28.094 67.371 24.269 L67.316 24.269 L67.316 42.195 L63.691 42.195 L63.691 0.000 L67.262 0.000 L67.262 5.664 L67.289 5.664 C69.156 1.785 72.953 -0.535 77.457 -0.535 Z M76.950 2.800 C70.941 2.800 67.062 7.558 67.062 14.953 C67.062 22.348 70.941 27.133 76.950 27.133 C82.641 27.133 86.801 22.738 86.801 14.953 C86.801 7.168 82.641 2.800 76.950 2.800 Z" transform="translate(101.987 0)"/>
    </g>
  </svg>`;
}

let toastN = 0;
function toast(title, msg, type = "ok") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
  const id = "t" + (++toastN);
  const el = document.createElement("div");
  el.className = `toast ${type}`; el.id = id;
  el.innerHTML = `<div class="tt">${esc(title)}</div>${msg ? `<div>${esc(msg)}</div>` : ""}`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(30px)"; setTimeout(() => el.remove(), 250); }, 3600);
}

/* ---- SVG charts (неон, тема-адаптивные) ---- */
let _gid = 0;
function neonDef(id, c) { return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${c.cyan}"/><stop offset="0.55" stop-color="${c.blue}"/><stop offset="1" stop-color="${c.violet}"/></linearGradient></defs>`; }
function donut(percent, { size = 122, stroke = 13, color = null, center } = {}) {
  const c = tc(), id = "dg" + (++_gid);
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r, p = Math.max(0, Math.min(100, percent));
  const off = circ * (1 - p / 100);
  const stk = color || `url(#${id})`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${color ? "" : neonDef(id, c)}
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${c.track}" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${stk}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size/2} ${size/2})" style="transition:stroke-dashoffset .8s ease"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".34em" font-size="${size*0.2}" font-weight="800" fill="${c.ink}">${center ?? Math.round(p) + "%"}</text>
  </svg>`;
}
function gauge(estimate, target, max = 100) {
  const c = tc(), id = "gg" + (++_gid);
  const W = 240, H = 134, cx = W / 2, cy = H - 10, r = 98, stroke = 16;
  const ang = (v) => Math.PI - (Math.max(0, Math.min(max, v)) / max) * Math.PI;
  const pt = (a, rr = r) => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)];
  const arc = (a0, a1, col) => {
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const large = (a0 - a1) > Math.PI ? 1 : 0;
    return `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round"/>`;
  };
  const eAng = ang(estimate);
  const [nx, ny] = pt(eAng, r - 4);
  const tAng = ang(target ?? 0);
  const [tx, ty] = pt(tAng, r + 12), [tx2, ty2] = pt(tAng, r - stroke);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${neonDef(id, c)}
    ${arc(Math.PI, 0, c.track)}
    ${arc(Math.PI, eAng, `url(#${id})`)}
    ${target != null ? `<line x1="${tx}" y1="${ty}" x2="${tx2}" y2="${ty2}" stroke="${c.red}" stroke-width="3"/>
      <circle cx="${tx}" cy="${ty}" r="3.5" fill="${c.red}"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="6" fill="${c.ink}"/>
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${c.ink}" stroke-width="3.5" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 28}" text-anchor="middle" font-size="31" font-weight="800" fill="${c.ink}">${Math.round(estimate)}</text>
    <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="11" fill="${c.mut}">из ${max}</text>
  </svg>`;
}
function lineChart(points, { w = 480, h = 170 } = {}) {
  if (!points.length) return `<div class="empty" style="padding:24px">Нет данных для графика</div>`;
  const c = tc(), color = c.cyan;
  const pl = 30, pr = 12, pt = 12, pb = 26, iw = w - pl - pr, ih = h - pt - pb, n = points.length;
  const X = i => pl + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = v => pt + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const grid = [0, 50, 100].map(g => `<line x1="${pl}" y1="${Y(g)}" x2="${w-pr}" y2="${Y(g)}" stroke="${c.track}" stroke-opacity="0.5"/><text x="2" y="${Y(g)+3}" font-size="9" fill="${c.mut}">${g}</text>`).join("");
  const path = points.map((p, i) => `${i ? "L" : "M"} ${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(" ");
  const area = `M ${X(0)} ${Y(0)} ` + points.map((p, i) => `L ${X(i)} ${Y(p.value)}`).join(" ") + ` L ${X(n-1)} ${Y(0)} Z`;
  const dots = points.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.value)}" r="4" fill="${c.cyan}" stroke="${c.blue}" stroke-width="2"/>
    <text x="${X(i)}" y="${Y(p.value)-9}" font-size="10" font-weight="700" fill="${color}" text-anchor="middle">${p.value}</text>
    <text x="${X(i)}" y="${h-8}" font-size="9" fill="${c.mut}" text-anchor="middle">${esc(p.label)}</text>`).join("");
  const gid = "lg" + (++_gid);
  return `<svg width="100%" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${color}" stop-opacity="0.22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#${gid})"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

/* ===================== boot / router ===================== */
async function boot() {
  applyTheme(getTheme());
  app().innerHTML = `<div class="loading-screen"><div class="spinner"></div><div>Загрузка…</div></div>`;
  if (!S.access) return renderLanding();
  try {
    S.user = await api("GET", "/auth/me");
    S.accessInfo = await api("GET", "/subscription/access").catch(() => ({ hasAccess: false }));
    if (hasAccess()) {
      const st = await api("GET", "/onboarding/state");
      if (!st.completed) return renderOnboarding(st);
    }
    return renderApp();
  } catch (e) {
    if (e.status === 401) { logout(); return; }
    renderLanding();
  }
}
function go(tab) { S.tab = tab; renderApp(); }

/* ===================== LANDING (публичная главная) ===================== */
async function renderLanding() {
  applyTheme(getTheme());
  const cat = await api("GET", "/subscription/plans", null, false).catch(() => ({ plans: [] }));
  const tech = [
    ["🧠", "Майнд-карта тем", "Узлы тем и связи между ними. Слабые зоны подсвечиваются — видно, что тянет балл вниз."],
    ["🤖", "AI-проверка", "Сочинения и развёрнутые ответы проверяются по критериям: оценка, ошибки, как улучшить."],
    ["🗓", "Динамический план", "Календарь задач на каждый день: быстрые победы, слабые темы, повторения, пробники."],
    ["📈", "Аналитика роста", "Готовность по каждому заданию, прогноз балла и динамика результата во времени."],
  ];
  const materials = [
    ["📚", "Собственные материалы"], ["🧩", "Переработанные кодификаторы с темами"],
    ["📝", "Методички и решебники"], ["🎯", "Проблемные зоны"],
    ["✍️", "Тренировочные задания"], ["📄", "Письменные работы"],
  ];
  app().innerHTML = `
  <div class="lp">
    <header class="lp-nav" id="lpNav">
      <div class="lp-nav-in">
        <div class="brand lp-logo">${logoSvg()}</div>
        <nav class="lp-links">
          <a href="#tech" data-go="tech">ЕГЭ</a>
          <a href="#tech" data-go="tech">ОГЭ</a>
          <a href="#materials" data-go="materials">Курсы</a>
          <a href="#about" data-go="about">О нас</a>
          <a href="#plans" data-go="plans">Прочее</a>
        </nav>
        <div class="lp-actions">
          <button class="btn sm" id="lpPick">Выбрать предмет</button>
          <button class="iconbtn" title="Связь" id="lpPhone">📞</button>
          <button class="iconbtn" title="Войти" id="lpLogin">👤</button>
          <button class="iconbtn" title="Корзина" id="lpCart">🛒</button>
          <button class="iconbtn" id="lpTheme" title="Тема">${getTheme()==="dark"?"☀️":"🌙"}</button>
        </div>
      </div>
    </header>

    <section class="lp-hero">
      <div class="lp-hero-grid">
        <div class="reveal">
          <div class="lp-badge">✦ Стратегическая подготовка к ЕГЭ и ОГЭ</div>
          <h1>Готовьтесь не хаотично,<br><span class="grad-text">а стратегически</span></h1>
          <p>BallLab — пространство для подготовки к экзаменам в любые сроки: от экспресс-режима до долгосрочного плана. Находим слабые места, строим план и показываем, какие действия быстрее всего поднимут балл.</p>
          <div class="lp-cta">
            <button class="btn" id="heroPick">Выбрать предмет</button>
            <button class="btn ghost" id="heroLogin">Войти в аккаунт</button>
          </div>
          <div class="lp-trust">
            <span><b>5</b> экзаменов MVP</span><span><b>AI</b> проверка работ</span><span><b>∞</b> практики</span>
          </div>
        </div>
        <div class="lp-hero-art reveal">
          ${heroArt()}
        </div>
      </div>
    </section>

    <section class="lp-sec" id="about">
      <div class="reveal lp-about">
        <div>
          <div class="lp-kicker">О платформе</div>
          <h2>Системная подготовка с фокусом на результат</h2>
          <p>BallLab помогает готовиться осмысленно: определяет слабые места, строит персональный план, проверяет работы и показывает, какие шаги быстрее всего приведут к росту баллов. Меньше хаоса — больше продуктивности и уверенности на экзамене.</p>
          <div class="lp-pills">
            <span class="pill-stat">🎯 Персональный план</span>
            <span class="pill-stat">📊 Аналитика готовности</span>
            <span class="pill-stat">🤖 Моментальный AI-фидбек</span>
          </div>
        </div>
        <div class="lp-about-art">${aboutArt()}</div>
      </div>
    </section>

    <section class="lp-sec" id="tech">
      <div class="lp-kicker reveal">Технологии</div>
      <h2 class="reveal">Что внутри платформы</h2>
      <div class="lp-cards">
        ${tech.map(([ic, t, d]) => `<div class="lp-card reveal"><div class="lp-ic">${ic}</div><h3>${t}</h3><p>${d}</p></div>`).join("")}
      </div>
    </section>

    <section class="lp-sec" id="materials">
      <div class="lp-kicker reveal">Материалы</div>
      <h2 class="reveal">Учебная база платформы</h2>
      <p class="lp-lead reveal">Мы развиваем собственную базу материалов. Часть функций находится в разработке — они появляются постепенно.</p>
      <div class="lp-mat reveal">
        ${materials.map(([ic, t]) => `<div class="lp-mat-item"><span>${ic}</span>${t}</div>`).join("")}
      </div>
    </section>

    <section class="lp-sec" id="plans">
      <div class="lp-kicker reveal">Планы подготовки</div>
      <h2 class="reveal">Выберите тариф под свою цель</h2>
      <div class="lp-plans">
        ${(cat.plans || []).map(planCard).join("")}
      </div>
    </section>

    <section class="lp-final reveal">
      <h2>Начните путь к высокому баллу сегодня</h2>
      <p>Создайте аккаунт, выберите предмет и получите персональный план уже после первого пробника.</p>
      <button class="btn" id="finalPick">Начать подготовку</button>
    </section>

    <footer class="lp-footer">
      <div class="brand lp-logo">${logoSvg()}</div>
      <div>© ${new Date().getFullYear()} BallLab — стратегическая подготовка к экзаменам</div>
    </footer>
  </div>`;

  // wiring
  const toAuth = (mode) => renderAuth(mode);
  ["lpPick", "heroPick", "finalPick", "lpCart"].forEach(id => { const b = $("#" + id); if (b) b.onclick = () => toAuth("register"); });
  ["lpLogin", "heroLogin"].forEach(id => { const b = $("#" + id); if (b) b.onclick = () => toAuth("login"); });
  $("#lpPhone").onclick = () => toast("Связь с нами", "Напишите на support@balllab.ru", "ok");
  $("#lpTheme").onclick = toggleTheme;
  document.querySelectorAll(".lp-links a[data-go]").forEach(a => a.onclick = (e) => {
    e.preventDefault(); const el = document.getElementById(a.dataset.go); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelectorAll(".lp-plans [data-plan]").forEach(b => b.onclick = () => toAuth("register"));

  // sticky nav opacity on scroll
  const nav = $("#lpNav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  // reveal on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));
}
function planCard(p) {
  return `<div class="plan-card ${p.highlight ? "hot" : ""} ${p.available ? "" : "soon"}">
    ${p.highlight ? `<div class="plan-flag">Доступен сейчас</div>` : (!p.available ? `<div class="plan-flag soon">В разработке</div>` : "")}
    <div class="plan-name">${esc(p.name)}</div>
    <div class="plan-tag">${esc(p.tagline)}</div>
    <div class="plan-price">${p.price} ₽<span>/мес</span></div>
    <ul class="plan-feats">${(p.features || []).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
    <button class="btn ${p.highlight ? "" : "ghost"} block" data-plan="${p.code}">${p.available ? "Выбрать план" : "Скоро"}</button>
  </div>`;
}
function heroArt() {
  return `<div class="art-card glass">
    <div class="art-row"><div class="art-ic">🎯</div><div><div class="art-t">Прогноз балла</div><div class="art-d">76 из 100 · уверенность 64%</div></div></div>
    <div class="art-bar"><span style="width:76%"></span></div>
    <div class="art-grid">
      <div class="art-mini g"><b>№1</b>92%</div><div class="art-mini g"><b>№7</b>81%</div>
      <div class="art-mini y"><b>№12</b>58%</div><div class="art-mini r"><b>№18</b>34%</div>
    </div>
    <div class="art-row sm"><div class="art-ic">🗓</div><div class="art-t2">Сегодня: 3 задачи · 60 мин</div></div>
  </div>`;
}
function aboutArt() {
  return `<div class="art-card glass">
    ${donut(72, { size: 120, center: "72%" })}
    <div class="art-list">
      <div><span class="dot g"></span> Быстрые победы — поднять за день</div>
      <div><span class="dot y"></span> Слабые темы — проработать</div>
      <div><span class="dot c"></span> Повторение по интервалам</div>
    </div>
  </div>`;
}

/* ===================== AUTH ===================== */
function renderAuth(mode = "login", prefillEmail = "") {
  applyTheme(getTheme());
  app().innerHTML = `
  <div class="center-wrap">
    <div class="auth-card">
      <div class="auth-hero">
        <button class="lp-back" id="toLanding">← На главную</button>
        <div class="brand" style="color:#eaf2ff">${logoSvg()}</div>
        <h1>Персональная подготовка к экзамену до нужного балла</h1>
        <p>Диагностика → план → задания → проверка работ → аналитика готовности → прогноз.</p>
        <div class="feats">
          <div class="feat"><span class="ic">✍️</span> Проверка сочинений по критериям</div>
          <div class="feat"><span class="ic">📊</span> Готовность по каждому заданию</div>
          <div class="feat"><span class="ic">🎯</span> Прогноз баллов и план на каждый день</div>
        </div>
      </div>
      <div class="auth-form">
        <h2>${mode === "login" ? "С возвращением!" : "Создайте аккаунт"}</h2>
        <p class="sub">Начните подготовку за пару минут</p>
        <div class="tabs">
          <button class="${mode==="login"?"on":""}" id="tLogin">Вход</button>
          <button class="${mode==="register"?"on":""}" id="tReg">Регистрация</button>
        </div>
        ${mode === "register" ? `<div class="field"><label>Имя</label><input id="name" placeholder="Как к вам обращаться?" value=""></div>` : ""}
        <div class="field"><label>Email</label><input id="email" type="email" placeholder="you@example.com" value="${esc(prefillEmail||"")}"></div>
        <div class="field"><label>Пароль</label><input id="pass" type="password" placeholder="минимум 8 символов" value=""></div>
        <button class="btn block" id="submit">${mode === "login" ? "Войти" : "Зарегистрироваться"}</button>
        <div id="authErr" style="margin-top:14px"></div>
      </div>
    </div>
  </div>`;
  $("#toLanding").onclick = () => renderLanding();
  $("#tLogin").onclick = () => renderAuth("login");
  $("#tReg").onclick = () => renderAuth("register");
  const submit = $("#submit");
  submit.onclick = async () => {
    const email = $("#email").value.trim(), password = $("#pass").value;
    const name = mode === "register" ? ($("#name")?.value.trim() || "") : "";
    $("#authErr").innerHTML = "";
    if (!email || !password) return toast("Заполните поля", "Email и пароль обязательны", "warn");
    submit.disabled = true; submit.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span>`;
    try {
      const body = mode === "login" ? { email, password } : { email, password, name };
      const d = await api("POST", `/auth/${mode === "login" ? "login" : "register"}`, body, false);
      setTokens(d);
      toast(mode === "login" ? "Вход выполнен" : "Аккаунт создан", "", "ok");
      boot();
    } catch (e) {
      submit.disabled = false; submit.textContent = mode === "login" ? "Войти" : "Зарегистрироваться";
      if (mode === "login" && (e.status === 404 || /нет аккаунта/i.test(e.message || ""))) {
        $("#authErr").innerHTML = `<div class="card" style="box-shadow:none;border:1px solid rgba(255,93,108,.4);background:rgba(255,93,108,.08);padding:14px">
          <div style="font-weight:700;color:var(--red);margin-bottom:4px">Нет аккаунта на эту почту</div>
          <div style="color:var(--mut);font-size:13.5px">Проверьте адрес или <a href="#" id="goReg" style="font-weight:700">зарегистрируйтесь</a>.</div></div>`;
        $("#goReg").onclick = (ev) => { ev.preventDefault(); renderAuth("register", email); };
      } else {
        toast("Не удалось войти", e.message, "err");
      }
    }
  };
  $("#pass").addEventListener("keydown", e => { if (e.key === "Enter") submit.click(); });
}

/* ===================== ONBOARDING ===================== */
async function renderOnboarding(state) {
  const step = (!state.profile.examType || !state.profile.grade) ? 1 : 2;
  if (step === 1) return onbTrack();
  return onbSubjects();
}
function onbShell(stepNo, inner) {
  app().innerHTML = `
  <div class="center-wrap">
    <div class="auth-card" style="grid-template-columns:1fr;max-width:680px">
      <div class="auth-form" style="padding:40px">
        <div class="brand" style="color:var(--logo-ink);margin-bottom:14px">${logoSvg()}</div>
        <div class="stepper"><div class="st on"></div><div class="st ${stepNo>=2?"on":""}"></div></div>
        ${inner}
      </div>
    </div>
  </div>`;
}
function onbTrack() {
  onbShell(1, `
    <h2>Шаг 1. Какой экзамен готовим?</h2>
    <p class="sub">Это определит каталог предметов и правила.</p>
    <div class="pick-grid" style="grid-template-columns:1fr 1fr;margin-bottom:18px">
      <div class="pick" data-exam="EGE"><div class="nm">🎓 ЕГЭ</div><div class="meta">10–11 класс</div></div>
      <div class="pick" data-exam="OGE"><div class="nm">📕 ОГЭ</div><div class="meta">8–9 класс</div></div>
    </div>
    <div class="field"><label>Класс</label>
      <select id="grade"><option value="11">11 класс</option><option value="10">10 класс</option><option value="9">9 класс</option><option value="8">8 класс</option></select>
    </div>
    <button class="btn block" id="next">Продолжить</button>`);
  let exam = "EGE";
  const cells = document.querySelectorAll(".pick[data-exam]");
  const sync = () => cells.forEach(c => c.classList.toggle("on", c.dataset.exam === exam));
  cells.forEach(c => c.onclick = () => { exam = c.dataset.exam; $("#grade").value = exam === "EGE" ? "11" : "9"; sync(); });
  sync();
  $("#next").onclick = async () => {
    const grade = +$("#grade").value;
    try { await api("POST", "/onboarding/track", { examType: exam, grade }); onbSubjects(); }
    catch (e) { toast("Не получилось", e.message, "err"); }
  };
}
async function onbSubjects() {
  onbShell(2, `<div id="onb2"><div class="loading-screen" style="min-height:200px"><div class="spinner"></div></div></div>`);
  const st = await api("GET", "/onboarding/state");
  const exam = st.profile.examType;
  const cat = await api("GET", `/onboarding/catalog?examType=${exam}`);
  const picked = new Set(cat.filter(s => s.isMandatory).map(s => s.id));
  const targets = {};
  const hint = exam === "EGE" ? "Русский и математика обязательны." : "Русский и математика обязательны, плюс минимум 2 по выбору.";
  $("#onb2").innerHTML = `
    <h2>Шаг 2. Выберите предметы</h2>
    <p class="sub">${hint} Поставьте цель по баллам — она важна для прогноза.</p>
    <div class="pick-grid" id="subs"></div>
    <button class="btn block" id="finish" style="margin-top:20px">Завершить и начать</button>`;
  const render = () => {
    $("#subs").innerHTML = cat.map(s => {
      const on = picked.has(s.id);
      return `<div class="pick ${on?"on":""}" data-id="${s.id}">
        <div class="nm">${esc(s.name)} ${s.isMandatory?'<span class="meta">• обязательный</span>':''}</div>
        <div class="meta">${on?"✓ выбран":"нажмите, чтобы выбрать"}</div>
        ${on?`<div class="target"><input type="number" min="0" max="100" placeholder="цель, баллы" value="${targets[s.id]??(s.isMandatory?80:"")}" data-t="${s.id}"></div>`:""}
      </div>`;
    }).join("");
    document.querySelectorAll(".pick[data-id]").forEach(c => {
      c.onclick = (e) => {
        if (e.target.matches("input")) return;
        const id = c.dataset.id;
        if (picked.has(id)) picked.delete(id); else picked.add(id);
        render();
      };
    });
    document.querySelectorAll("[data-t]").forEach(i => i.oninput = () => targets[i.dataset.t] = +i.value);
  };
  render();
  $("#finish").onclick = async () => {
    const subjects = [...picked].map(id => ({ subjectId: id, targetScore: targets[id] ? +targets[id] : undefined }));
    if (!subjects.length) return toast("Выберите предметы", "", "warn");
    const btn = $("#finish"); btn.disabled = true; btn.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span>`;
    try { await api("POST", "/onboarding/subjects", { subjects }); toast("Готово!", "Добро пожаловать", "ok"); boot(); }
    catch (e) { toast("Не получилось", e.message, "err"); btn.disabled = false; btn.textContent = "Завершить и начать"; }
  };
}

/* ===================== APP SHELL ===================== */
const NAV = [
  ["dashboard", "🏠", "Главная"],
  ["practice", "✍️", "Практика"],
  ["plan", "🗓", "План"],
  ["analytics", "📊", "Аналитика"],
  ["profile", "🚀", "Профиль"],
];
const TITLES = {
  dashboard: ["Главная", "Что важно сделать сегодня"],
  practice: ["Практика", "Задания, темы, пробники и работа над ошибками"],
  plan: ["План подготовки", "Календарь задач по дням"],
  analytics: ["Аналитика", "Готовность по заданиям и прогноз балла"],
  profile: ["Профиль", "Аккаунт, подписка и настройки"],
};

async function renderApp() {
  if (!hasAccess() && S.tab !== "profile") S.tab = "locked";
  const titleKey = S.tab === "locked" ? "dashboard" : S.tab;
  const [title, sub] = TITLES[titleKey] || ["BallLab", ""];
  app().innerHTML = `
  <div class="appwrap">
    <header class="topbar">
      <div class="brand">${logoSvg()}</div>
      <nav class="topnav">${NAV.map(([id, ic, label]) => {
        const locked = !hasAccess() && id !== "profile";
        return `<button class="${id===S.tab?"on":""}" data-tab="${id}">${locked?`<span class="lockic">🔒</span>`:`<span class="ic">${ic}</span>`}${label}</button>`;
      }).join("")}</nav>
      <div class="topright">
        ${hasAccess() ? `<div class="streak" id="streak"><span>🔥</span><span class="n">…</span></div>` : ""}
        <button class="iconbtn" id="themeBtn" title="Сменить тему">${getTheme()==="dark"?"☀️":"🌙"}</button>
        <div class="usermenu">
          <button class="userbtn" id="userBtn">
            <span class="avatar">${avatarInitials()}</span>
            <span class="nm">${esc(displayName())}</span>
            <span class="car">▾</span>
          </button>
          <div class="dropdown hidden" id="userDrop">
            <button data-tab="profile">🚀 Профиль</button>
            <button class="danger" id="logoutBtn">Выйти из аккаунта</button>
          </div>
        </div>
      </div>
    </header>
    <main class="page">
      <h1 class="title">${title}</h1>
      <div class="subtitle">${sub}</div>
      <div id="screen"></div>
    </main>
  </div>`;
  document.querySelectorAll(".topnav button").forEach(b => b.onclick = () => go(b.dataset.tab));
  $("#themeBtn").onclick = toggleTheme;
  const drop = $("#userDrop");
  $("#userBtn").onclick = (e) => { e.stopPropagation(); drop.classList.toggle("hidden"); };
  drop.querySelector("[data-tab]").onclick = () => go("profile");
  $("#logoutBtn").onclick = () => logout();
  if (hasAccess()) loadStreak();

  const screens = { dashboard: scrDashboard, practice: scrPractice, plan: scrPlan, analytics: scrAnalytics, profile: scrProfile, locked: scrPaywall };
  (screens[S.tab] || scrDashboard)();
}

document.addEventListener("click", () => { const d = document.getElementById("userDrop"); if (d) d.classList.add("hidden"); });

async function loadStreak() {
  try { const s = await api("GET", "/progress/streak"); const el = $("#streak"); if (el) el.innerHTML = `<span>🔥</span><span class="n">${s.streakDays}</span><small>дн.</small>`; } catch {}
}
function screen() { return document.getElementById("screen"); }
function loading() { screen().innerHTML = `<div class="loading-screen" style="min-height:300px"><div class="spinner"></div></div>`; }

/* ===================== PAYWALL ===================== */
async function scrPaywall() {
  loading();
  const cat = await api("GET", "/subscription/plans", null, false).catch(() => ({ plans: [] }));
  screen().innerHTML = `
    <div class="card hero-cta glow" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="font-size:34px">🔓</div>
        <div style="flex:1;min-width:220px">
          <div style="font-weight:800;font-size:18px;color:#fff">Выберите план, чтобы открыть кабинет</div>
          <div style="color:#cfe0ff;font-size:14px">Практика, пробники, персональный план и аналитика доступны по подписке. Сейчас активен тариф СТАНДАРТ.</div>
        </div>
        ${isAdmin() ? `<div class="aurora"><span class="spark">✦</span> Вы админ — включите тариф в Профиле → Dev-панель</div>` : ""}
      </div>
    </div>
    <div class="lp-plans">${(cat.plans || []).map(planCard).join("")}</div>`;
  screen().querySelectorAll(".lp-plans [data-plan]").forEach(b => b.onclick = () => {
    if (isAdmin()) { go("profile"); toast("Dev-панель", "Включите тариф в профиле", "ok"); }
    else toast("Оплата", "Подключение оплаты скоро. Обратитесь в поддержку.", "warn");
  });
}

/* ===================== DASHBOARD (Главная) ===================== */
async function scrDashboard() {
  loading();
  const [subs, recs, todayItems, plans, weak] = await Promise.all([
    api("GET", "/profile/subjects").catch(() => []),
    api("GET", "/recommendations/today").catch(() => ({ actions: [] })),
    api("GET", "/study-plan/today").catch(() => []),
    api("GET", "/study-plan").catch(() => []),
    api("GET", "/progress/weak-topics").catch(() => []),
  ]);
  const active = (plans || []).filter(p => p.status === "ACTIVE");
  const todayOpen = (todayItems || []).filter(i => i.status !== "done" && i.status !== "skipped");
  const minutesToday = todayOpen.reduce((s, i) => s + (i.minutes || 0), 0);
  const overdueCount = todayOpen.filter(i => i.overdue).length;
  const cal = buildCalendar(active, 7);

  screen().innerHTML = `
    <div class="grid g3" style="margin-bottom:18px">
      ${statTile("📋", todayOpen.length, "задач на сегодня", "ic-violet")}
      ${statTile("⏱", minutesToday + " мин", "план на сегодня", "ic-blue")}
      ${statTile("⚠️", overdueCount, "просрочено", overdueCount ? "ic-amber" : "ic-green")}
    </div>

    <div class="grid g2">
      <div class="card">
        <h3>🎯 Рекомендации на сегодня</h3>
        <div id="recs"></div>
      </div>
      <div class="card">
        <h3>📋 Задачи на сегодня</h3>
        <div id="todayTasks"></div>
        <button class="btn ghost sm" id="toPlan" style="margin-top:12px">Открыть план →</button>
      </div>
    </div>

    <div class="section-title">Ближайшие дни</div>
    <div class="card"><div class="cal-strip" id="calStrip"></div></div>

    <div class="section-title">Мои экзамены</div>
    <div class="card"><div class="exam-chips" id="examChips"></div></div>

    <div class="section-title">Слабые темы</div>
    <div class="card"><div id="weakList"></div></div>`;

  // recommendations
  const actions = recs.actions || [];
  $("#recs").innerHTML = actions.length ? actions.map(a => `
    <div class="list-row">
      <div class="badge">${kindIcon(a.kind)}</div>
      <div class="body"><div class="t">${esc(a.title)}</div><div class="d">${a.subjectName ? esc(a.subjectName) + " · " : ""}${esc(a.reason || "")}</div></div>
      <button class="btn sm ghost" data-rec='${enc(a)}'>${a.overdue ? "Закрыть" : "Сделать"}</button>
    </div>`).join("") : `<div class="empty"><div class="big">🎉</div>На сегодня всё чисто! Загляните в Практику или пройдите пробник.</div>`;
  $("#recs").querySelectorAll("[data-rec]").forEach(b => b.onclick = () => recAction(dec(b.dataset.rec)));

  // today tasks
  $("#todayTasks").innerHTML = todayOpen.length ? todayOpen.slice(0, 6).map(i => `
    <div class="list-row">
      <div class="badge">${kindIcon(i.kind)}</div>
      <div class="body"><div class="t">${esc(i.title)}</div><div class="d"><span class="chip ${reasonCls(i.kind)}">${esc(i.reason)}</span> · ${i.minutes} мин</div></div>
    </div>`).join("") : `<div class="empty">Задачи появятся после пробника или практики.</div>`;
  $("#toPlan").onclick = () => go("plan");

  // calendar strip
  $("#calStrip").innerHTML = cal.map(d => `
    <div class="cal-cell ${d.isToday ? "today" : ""}">
      <div class="cd">${d.label}</div>
      <div class="cn">${d.count ? d.count + " зд." : "—"}</div>
      <div class="cdots">${d.kinds.slice(0, 4).map(k => `<i class="dot ${reasonCls(k)}"></i>`).join("")}</div>
    </div>`).join("");

  // exam chips
  $("#examChips").innerHTML = (subs || []).length ? subs.map(s => `
    <div class="exam-chip"><span>📘</span><b>${esc(s.subject?.name || "Предмет")}</b><span class="meta">цель ${s.targetScore ?? "—"} б.</span></div>`).join("")
    : `<div class="empty">Предметы не выбраны</div>`;

  // weak topics dropdown
  renderWeakDropdown($("#weakList"), weak);
}
function statTile(ic, n, l, cls) {
  return `<div class="card"><div class="stat"><div class="ic ${cls}">${ic}</div><div><div class="n">${n}</div><div class="l">${l}</div></div></div></div>`;
}
function renderWeakDropdown(el, weak) {
  if (!weak.length) { el.innerHTML = `<div class="empty"><div class="big">🌱</div>Слабых тем пока нет. Так держать!</div>`; return; }
  el.innerHTML = weak.map((t, i) => `
    <div class="acc">
      <button class="acc-head" data-i="${i}">
        <span class="chip ${t.status}">${Math.round(t.accuracyPercent)}%</span>
        <span class="acc-title">${esc(t.topic?.name || "Тема")}</span>
        <span class="acc-sub">${esc(t.subject?.name || "")}</span>
        <span class="acc-car">▾</span>
      </button>
      <div class="acc-body hidden" data-body="${i}">
        <div class="muted" style="font-size:13.5px;margin-bottom:10px">Точность по теме <b>${Math.round(t.accuracyPercent)}%</b> · попыток ${t.attempts}. Подтяните — это поднимет связанные задания.</div>
        <button class="btn sm" data-train='${enc({ subjectId: t.subjectId, topicId: t.topicId })}'>Тренироваться</button>
      </div>
    </div>`).join("");
  el.querySelectorAll(".acc-head").forEach(h => h.onclick = () => {
    const b = el.querySelector(`[data-body="${h.dataset.i}"]`); b.classList.toggle("hidden");
    h.querySelector(".acc-car").style.transform = b.classList.contains("hidden") ? "" : "rotate(180deg)";
  });
  el.querySelectorAll("[data-train]").forEach(b => b.onclick = () => { const t = dec(b.dataset.train); goPractice({ subjectId: t.subjectId, mode: "topics", topicId: t.topicId }); });
}
function recAction(a) {
  if (a.topicId) return goPractice({ subjectId: a.subjectId, mode: "topics", topicId: a.topicId });
  if (a.egeTaskNumber != null) return goPractice({ subjectId: a.subjectId, mode: "tasks", egeTaskNumber: a.egeTaskNumber, taskIds: a.taskIds });
  if (a.mockExamId || a.kind === "mock_exam") return goPractice({ subjectId: a.subjectId, mode: "mocks" });
  go("practice");
}
function kindIcon(k) {
  return { quick_win: "⚡", weak_topic: "🎯", key_task: "🔑", repetition: "🔁", mock_exam: "🧪",
    error_review: "🛠", ai_check: "🤖", lesson_placeholder: "📖", practice: "✍️" }[k] || "📌";
}
function reasonCls(k) {
  return { quick_win: "GREEN", weak_topic: "RED", key_task: "YELLOW", repetition: "GRAY",
    mock_exam: "YELLOW", error_review: "RED", ai_check: "GRAY", lesson_placeholder: "GRAY" }[k] || "GRAY";
}
const enc = (o) => encodeURIComponent(JSON.stringify(o));
const dec = (s) => JSON.parse(decodeURIComponent(s));

/* строит ленту календаря на N дней из активных планов */
function buildCalendar(plans, n) {
  const byDate = new Map();
  for (const p of plans) for (const d of (p.days || [])) {
    const key = new Date(d.date); key.setHours(0, 0, 0, 0);
    const ks = key.getTime();
    const items = Array.isArray(d.items) ? d.items.filter(i => i.status !== "done" && i.status !== "skipped") : [];
    const cur = byDate.get(ks) || { count: 0, kinds: [] };
    cur.count += items.length; cur.kinds.push(...items.map(i => i.kind));
    byDate.set(ks, cur);
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getTime() + i * 864e5);
    const info = byDate.get(d.getTime()) || { count: 0, kinds: [] };
    out.push({ isToday: i === 0, label: i === 0 ? "Сегодня" : d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" }), count: info.count, kinds: info.kinds });
  }
  return out;
}

/* ===================== ANALYTICS (Аналитика) ===================== */
let analyticsSubject = null;
async function scrAnalytics() {
  loading();
  const ov = await api("GET", "/analytics").catch(() => ({ subjects: [] }));
  const subjects = ov.subjects || [];
  if (!subjects.length) { screen().innerHTML = `<div class="card"><div class="empty"><div class="big">📊</div>Нет данных. Выберите предметы и пройдите пробник или практику.</div></div>`; return; }
  if (!analyticsSubject || !subjects.find(s => s.subjectId === analyticsSubject)) analyticsSubject = subjects[0].subjectId;

  screen().innerHTML = `
    <div class="seg" id="anSubs">${subjects.map(s => `<button class="${s.subjectId===analyticsSubject?"on":""}" data-sid="${s.subjectId}">${esc(s.subjectName)}</button>`).join("")}</div>
    <div id="anBody"><div class="loading-screen" style="min-height:240px"><div class="spinner"></div></div></div>`;
  $("#anSubs").querySelectorAll("[data-sid]").forEach(b => b.onclick = () => { analyticsSubject = b.dataset.sid; scrAnalytics(); });
  renderAnalyticsBody(subjects.find(s => s.subjectId === analyticsSubject));
}
async function renderAnalyticsBody(subMeta) {
  const a = await api("GET", `/analytics/subject/${analyticsSubject}`).catch(() => null);
  const el = $("#anBody");
  if (!a) { el.innerHTML = `<div class="card"><div class="empty">Не удалось загрузить аналитику</div></div>`; return; }
  const f = a.forecast;
  const target = subMeta?.targetScore ?? null;
  const dyn = (a.dynamics || []).map(d => ({ label: fmtDate(d.date), value: d.testScore ?? (d.maxPrimaryScore ? Math.round(d.primaryScore / d.maxPrimaryScore * 100) : 0) }));
  const strong = (a.tasks || []).filter(t => t.status === "ready");
  el.innerHTML = `
    <div class="grid g2" style="margin-bottom:18px">
      <div class="card">
        <h3>🎯 Прогноз по предмету</h3>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          ${gauge(f.readinessPercent, target)}
          <div>
            <div class="pill-stat" style="margin-bottom:8px">Готовность: <b style="color:var(--ink);margin-left:4px">${f.readinessPercent}%</b></div><br>
            <div class="pill-stat" style="margin-bottom:8px">Ожидается ${f.primary} из ${f.maxPrimary} перв. баллов</div><br>
            <div class="pill-stat" style="margin-bottom:8px">Коридор: ${f.primaryMin}–${f.primaryMax} б.</div><br>
            <div class="pill-stat">Уверенность прогноза: ${f.confidencePercent}%</div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>📈 Динамика балла (пробники)</h3>
        ${dyn.length ? lineChart(dyn) : `<div class="empty" style="padding:30px"><div class="big">📈</div>Пройдите пробник — появится динамика.</div>`}
      </div>
    </div>

    <div class="section-title">Готовность по заданиям</div>
    <div class="card"><div class="tn-grid">${(a.tasks || []).map(taskReadinessCell).join("")}</div></div>

    <div class="grid g2" style="margin-top:18px">
      <div class="card"><h3>🔴 Слабые задания</h3>${listTasks(a.weakTasks, "Нет слабых заданий — отлично!")}</div>
      <div class="card"><h3>🟢 Сильные задания</h3>${listTasks(strong, "Пока нет заданий в зелёной зоне.")}</div>
    </div>

    <div class="card glow" style="margin-top:18px">
      <h3>💡 Рекомендации по результату</h3>
      <div class="muted" style="font-size:14px">
        ${a.quickWins?.length ? `Сфокусируйтесь на быстрых победах: ${a.quickWins.slice(0,3).map(q => "№" + q.egeTaskNumber).join(", ")} — они дадут прирост быстрее всего. ` : ""}
        ${a.weakTasks?.length ? `Проработайте слабые: ${a.weakTasks.slice(0,3).map(w => "№" + w.egeTaskNumber).join(", ")}. ` : ""}
        Решайте регулярно — готовность и прогноз обновляются после каждого ответа.
      </div>
    </div>`;
  el.querySelectorAll("[data-train]").forEach(b => b.onclick = () => { const t = dec(b.dataset.train); goPractice(t); });
}
function taskReadinessCell(t) {
  const [cls, label] = READY[t.status] || ["GRAY", t.status];
  return `<div class="tn-cell bg-${cls}" title="${label}">
    <div class="tn-top"><span class="tn-no">№${t.egeTaskNumber}</span><span class="tn-tr">${trendIcon(t.trend)}</span></div>
    <div class="tn-pct">${t.status === "no_data" ? "—" : t.readiness + "%"}</div>
    <div class="tn-meta">${t.status === "no_data" ? "нет данных" : `${t.attempts} поп · ${t.accuracyPercent}%`}</div>
  </div>`;
}
function listTasks(tasks, emptyMsg) {
  if (!tasks || !tasks.length) return `<div class="empty">${emptyMsg}</div>`;
  return tasks.map(t => `
    <div class="list-row">
      <div class="badge">№${t.egeTaskNumber}</div>
      <div class="body"><div class="t">${esc(t.topicName || ("Задание №" + t.egeTaskNumber))}</div>
        <div class="d">готовность ${t.readiness}% · ${t.attempts} поп. ${trendIcon(t.trend)}</div></div>
      <button class="btn sm ghost" data-train='${enc({ subjectId: analyticsSubject, mode: "tasks", egeTaskNumber: t.egeTaskNumber })}'>Решать</button>
    </div>`).join("");
}

/* ===================== PRACTICE (умный центр, Вариант C) ===================== */
let practiceTarget = null;
const practiceState = { subjectId: null, mode: "recs" };
function goPractice(target) { practiceTarget = target || null; go("practice"); }

async function scrPractice() {
  loading();
  const subs = await api("GET", "/profile/subjects").catch(() => []);
  if (!subs.length) { screen().innerHTML = `<div class="card"><div class="empty">Нет выбранных предметов</div></div>`; return; }

  // применяем deep-link
  if (practiceTarget) {
    practiceState.subjectId = practiceTarget.subjectId || practiceState.subjectId;
    practiceState.mode = practiceTarget.mode || "recs";
  }
  if (!practiceState.subjectId || !subs.find(s => s.subjectId === practiceState.subjectId)) practiceState.subjectId = subs[0].subjectId;

  const modes = [["recs", "Рекомендации"], ["tasks", "Задания"], ["topics", "Темы"], ["mocks", "Пробники"], ["errors", "Ошибки"]];
  screen().innerHTML = `
    <div class="seg" id="pSubs">${subs.map(s => `<button class="${s.subjectId===practiceState.subjectId?"on":""}" data-sid="${s.subjectId}">${esc(s.subject?.name||"Предмет")}</button>`).join("")}</div>
    <div class="seg sub" id="pModes">${modes.map(([m, l]) => `<button class="${m===practiceState.mode?"on":""}" data-mode="${m}">${l}</button>`).join("")}</div>
    <div id="pBody"><div class="loading-screen" style="min-height:240px"><div class="spinner"></div></div></div>`;
  $("#pSubs").querySelectorAll("[data-sid]").forEach(b => b.onclick = () => { practiceState.subjectId = b.dataset.sid; practiceState.mode = "recs"; practiceTarget = null; scrPractice(); });
  $("#pModes").querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { practiceState.mode = b.dataset.mode; practiceTarget = null; scrPractice(); });

  const target = practiceTarget; practiceTarget = null;
  // прямой deep-link: задание №N или тема
  if (target) {
    if (target.egeTaskNumber != null) return openTaskByNumber(target.subjectId, target.egeTaskNumber, (target.taskIds || [])[0]);
    if (target.topicId) { await practiceModeBody(); return openTopicTasks(target.topicId); }
  }
  practiceModeBody();
}
async function practiceModeBody() {
  const sid = practiceState.subjectId, el = $("#pBody");
  if (practiceState.mode === "recs") return practiceRecs(el, sid);
  if (practiceState.mode === "tasks") return practiceTasksTab(el, sid);
  if (practiceState.mode === "topics") return practiceTopicsTab(el, sid);
  if (practiceState.mode === "mocks") return practiceMocks(el, sid);
  if (practiceState.mode === "errors") return practiceErrors(el, sid);
}
async function practiceRecs(el, sid) {
  const a = await api("GET", `/analytics/subject/${sid}`).catch(() => null);
  if (!a) { el.innerHTML = `<div class="card"><div class="empty">Нет данных. Пройдите пробник или начните с вкладки «Задания».</div></div>`; return; }
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px"><h3>⚡ Быстрые победы</h3>
      ${a.quickWins?.length ? a.quickWins.map(q => taskRow(q, "Поднять")).join("") : `<div class="empty">Пока нет — решайте задания, они появятся.</div>`}</div>
    <div class="card"><h3>🔴 Работа над слабыми</h3>
      ${a.weakTasks?.length ? a.weakTasks.map(w => taskRow(w, "Разобрать")).join("") : `<div class="empty">Слабых заданий нет — отлично!</div>`}</div>`;
  el.querySelectorAll("[data-num]").forEach(b => b.onclick = () => openTaskByNumber(sid, +b.dataset.num));
}
function taskRow(t, btn) {
  const [cls] = READY[t.status] || ["GRAY"];
  return `<div class="list-row">
    <div class="badge">№${t.egeTaskNumber}</div>
    <div class="body"><div class="t">${esc(t.topicName || ("Задание №" + t.egeTaskNumber))}</div>
      <div class="d"><span class="chip ${cls}">${t.readiness}%</span> · ${t.attempts} поп. ${trendIcon(t.trend)}</div></div>
    <button class="btn sm" data-num="${t.egeTaskNumber}">${btn}</button>
  </div>`;
}
async function practiceTasksTab(el, sid) {
  const a = await api("GET", `/analytics/subject/${sid}`).catch(() => ({ tasks: [] }));
  const tasks = a.tasks || [];
  el.innerHTML = `<div class="card"><h3>📝 Все задания экзамена</h3>
    ${tasks.length ? `<div class="tn-grid clickable" id="tnGrid">${tasks.map(taskReadinessCell).join("")}</div>
      <div class="muted" style="font-size:13px;margin-top:12px">Нажмите на номер, чтобы решать задание этого типа.</div>` : `<div class="empty">Заданий пока нет</div>`}</div>`;
  const cells = el.querySelectorAll(".tn-cell");
  cells.forEach((c, i) => { c.style.cursor = "pointer"; c.onclick = () => openTaskByNumber(sid, tasks[i].egeTaskNumber); });
}
async function practiceTopicsTab(el, sid) {
  const topics = await api("GET", `/subjects/${sid}/topics`).catch(() => []);
  el.innerHTML = `<div class="card"><h3>🧩 Темы</h3>
    ${topics.length ? `<div class="pick-grid" id="ptops"></div>` : `<div class="empty">У предмета пока нет тем</div>`}</div>
    <div id="ptasks"></div>`;
  if (topics.length) {
    $("#ptops").innerHTML = topics.map(t => `<div class="pick" data-tid="${t.id}"><div class="nm">${esc(t.name)}</div><div class="meta">${t.egeBlock||"—"} ${t.egeTaskNumbers?.length?"• №"+t.egeTaskNumbers.join(", "):""}</div></div>`).join("");
    $("#ptops").querySelectorAll("[data-tid]").forEach(c => c.onclick = () => {
      $("#ptops").querySelectorAll(".pick").forEach(x => x.classList.remove("on")); c.classList.add("on");
      openTopicTasks(c.dataset.tid);
    });
  }
}
async function openTopicTasks(topicId) {
  const box = $("#ptasks") || screen();
  box.innerHTML = `<div class="card" style="margin-top:18px"><div class="spinner"></div></div>`;
  const tasks = await api("GET", `/topics/${topicId}/tasks`).catch(() => []);
  box.innerHTML = `<div class="card" style="margin-top:18px"><h3>📝 Задания темы</h3>
    ${tasks.length ? `<div id="tasklist"></div>` : `<div class="empty">Заданий пока нет</div>`}</div>`;
  if (tasks.length) {
    $("#tasklist").innerHTML = tasks.map(t => `
      <div class="list-row">
        <div class="badge">${t.answerType==="ESSAY"?"✍️":"🔤"}</div>
        <div class="body"><div class="t">${esc(t.title||("Задание"+(t.egeTaskNumber?" №"+t.egeTaskNumber:"")))}</div>
          <div class="d">${esc((t.text||"").slice(0,90))}${(t.text||"").length>90?"…":""}</div></div>
        <button class="btn sm" data-task='${enc(t)}'>Решать</button>
      </div>`).join("");
    $("#tasklist").querySelectorAll("[data-task]").forEach(b => b.onclick = () => openTask(dec(b.dataset.task)));
  }
}
async function practiceErrors(el, sid) {
  const a = await api("GET", `/analytics/subject/${sid}`).catch(() => ({ weakTasks: [] }));
  const errs = (a.weakTasks || []).filter(t => t.attempts > 0);
  el.innerHTML = `<div class="card"><h3>🛠 Работа над ошибками</h3>
    <p class="muted" style="font-size:13.5px;margin-top:-8px">Задания, где чаще всего ошибаетесь. Разберите их и закрепите.</p>
    ${errs.length ? errs.map(t => taskRow(t, "Разобрать")).join("") : `<div class="empty"><div class="big">✨</div>Ошибок не найдено — отличная работа!</div>`}</div>`;
  el.querySelectorAll("[data-num]").forEach(b => b.onclick = () => openTaskByNumber(sid, +b.dataset.num));
}
async function openTaskByNumber(subjectId, number, taskId) {
  loading();
  try {
    const task = taskId ? await api("GET", `/tasks/${taskId}`) : await api("GET", `/tasks/by-number?subjectId=${subjectId}&number=${number}`);
    if (task) return openTask(task);
    toast("Не найдено", "Для этого задания пока нет вариантов", "warn");
  } catch (e) { toast("Ошибка", e.message, "err"); }
  scrPractice();
}
function openTask(task) {
  const isEssay = task.answerType === "ESSAY";
  screen().innerHTML = `
    <button class="back" id="back">← к практике</button>
    <div class="card pad-lg">
      <h3>${isEssay?"✍️":"🔤"} ${esc(task.title||"Задание")} ${task.egeTaskNumber?`<span class="tag">№${task.egeTaskNumber}</span>`:""}</h3>
      <p style="color:var(--ink-soft);white-space:pre-wrap">${esc(task.text||"")}</p>
      ${isEssay
        ? `<div class="field" style="margin-top:14px"><label>Ваш развёрнутый ответ</label><textarea id="ans" placeholder="Напишите ответ (минимум 50 символов)…"></textarea></div>`
        : `<div class="field" style="margin-top:14px"><label>Ваш ответ</label><input id="ans" placeholder="Введите ответ"></div>`}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="send">${isEssay?"Проверить ответ":"Проверить ответ"}</button>
        <button class="btn ghost" id="explain">🤖 Пояснение ИИ</button>
      </div>
      <div id="result" style="margin-top:18px"></div>
      <div id="explainBox" style="margin-top:14px"></div>
    </div>`;
  $("#back").onclick = () => scrPractice();
  $("#send").onclick = async () => {
    const val = $("#ans").value.trim();
    if (!val) return toast("Пусто", "Введите ответ", "warn");
    const btn = $("#send"); btn.disabled = true; btn.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span> ${isEssay?"ИИ проверяет…":"Проверяем…"}`;
    try {
      const r = await api("POST", `/tasks/${task.id}/answer`, { answer: val });
      if (isEssay) renderEssayResult($("#result"), r.aiFeedback || r);
      else renderShortResult($("#result"), r, task);
      loadStreak();
    } catch (e) {
      toast(e.status === 429 ? "Лимит ИИ исчерпан" : "Ошибка", e.message, "err");
    } finally { btn.disabled = false; btn.textContent = "Проверить ответ"; }
  };
  $("#explain").onclick = async () => {
    const val = $("#ans").value.trim();
    const btn = $("#explain"); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ИИ думает…`;
    try {
      const d = await api("POST", `/tasks/${task.id}/explain`, val ? { studentAnswer: val } : {});
      renderExplain($("#explainBox"), d.data || d);
    } catch (e) {
      toast(e.status === 429 ? "Лимит ИИ исчерпан" : "Ошибка", e.message, "err");
    } finally { btn.disabled = false; btn.innerHTML = "🤖 Пояснение ИИ"; }
  };
}
function renderShortResult(el, r, task) {
  const ok = r.isCorrect;
  el.innerHTML = `<div class="card" style="box-shadow:none;border:1.5px solid ${ok?"rgba(47,224,138,.4)":"rgba(255,93,108,.4)"};background:${ok?"rgba(47,224,138,.08)":"rgba(255,93,108,.08)"}">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:30px">${ok?"✅":"❌"}</div>
      <div style="flex:1"><div style="font-weight:800;font-size:17px">${ok?"Верно!":"Неверно"}</div>
        <div style="color:var(--mut)">${ok?`+${r.score} балл`:"Ничего страшного — разберём ошибку"}</div></div>
      ${task?.egeTaskNumber?`<button class="btn sm ghost" id="similar">🔁 Похожее</button>`:""}
    </div>
    ${!ok && r.correctAnswer ? `<div style="margin-top:14px;padding:12px 14px;background:var(--panel-2);border-radius:10px;border:1px solid var(--card-brd)">
      <span style="color:var(--mut);font-size:13px">Правильный ответ:</span>
      <div style="font-weight:800;font-size:16px;color:var(--green);margin-top:2px">${esc(r.correctAnswer)}</div></div>` : ""}
    ${r.topicProgress?`<div style="margin-top:14px;display:flex;align-items:center;gap:10px">
      <span class="chip ${r.topicProgress.status}">${statusLabel(r.topicProgress.status)}</span>
      <span style="color:var(--mut);font-size:13px">Точность по теме: <b>${Math.round(r.topicProgress.accuracyPercent)}%</b></span></div>`:""}
    ${!ok ? `<div style="margin-top:10px;color:var(--mut);font-size:13px">💡 Нажмите «Пояснение ИИ», чтобы разобрать решение.</div>` : ""}
  </div>`;
  const sim = el.querySelector("#similar");
  if (sim && task) sim.onclick = async () => {
    sim.disabled = true; sim.innerHTML = `<span class="spinner"></span>`;
    try { const next = await api("GET", `/tasks/${task.id}/similar`); openTask(next); }
    catch (e) { toast("Ошибка", e.message, "err"); sim.disabled = false; sim.innerHTML = "🔁 Похожее"; }
  };
  toast(ok ? "Верно! 🎉" : "Не верно", ok ? "" : "Смотрите правильный ответ ниже", ok ? "ok" : "warn");
}
function renderExplain(el, d) {
  if (!d || typeof d !== "object") { el.innerHTML = `<div class="card" style="box-shadow:none;border:1px solid var(--line)">${esc(String(d||""))}</div>`; return; }
  const block = (icon, title, val) => val ? `<div style="margin-bottom:10px"><b>${icon} ${title}</b><div style="color:var(--mut);margin-top:2px">${esc(val)}</div></div>` : "";
  el.innerHTML = `<div class="card" style="box-shadow:none;border:1.5px solid var(--card-brd);background:var(--grad-soft)">
    <h3 style="margin-bottom:12px">🤖 Пояснение от ИИ</h3>
    ${block("⚠️","В чём ошибка", d.mistake)}
    ${block("🔍","Как проверить себя", d.how_to_check)}
    ${block("✅","Верный ход", d.correct_approach)}
    ${block("🎯","Правильный ответ", d.answer)}
  </div>`;
}
function renderEssayResult(el, data) {
  const total = data.total_score ?? data.total ?? data.score_estimate;
  const max = data.max_score ?? data.max_total ?? 22;
  const crit = data.criteria || data.scores || [];
  const list = Array.isArray(crit) ? crit : Object.entries(crit).map(([k, v]) => ({ code: k, ...(typeof v === "object" ? v : { score: v }) }));
  el.innerHTML = `
    <div class="card" style="box-shadow:none;border:1.5px solid var(--card-brd)">
      <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:8px">
        ${donut(max?Math.round((total/max)*100):0, { center: `${total}/${max}` })}
        <div>
          <div style="font-weight:800;font-size:19px">Оценка работы</div>
          <div style="color:var(--mut)">${total} из ${max} баллов${data.word_count?` • ${data.word_count} слов`:""}</div>
          ${data.confidence_score!=null?`<div class="pill-stat" style="margin-top:8px">Уверенность ИИ: ${Math.round(data.confidence_score*100)}%</div>`:""}
        </div>
      </div>
      <div style="margin-top:10px">${list.map(c => {
        const sc = c.score ?? c.value ?? c.points ?? 0, mx = c.max ?? null;
        return `<div class="crit-row">
          <div class="k">${esc(c.code||c.criterion||"—")}</div>
          <div><div class="cm">${esc(c.comment||c.feedback||c.note||"—")}</div>
            ${mx?`<div class="scorebar"><span style="width:${Math.round((sc/mx)*100)}%"></span></div>`:""}</div>
          <div class="sc">${sc}${mx!=null?`<span style="color:var(--mut);font-weight:600">/${mx}</span>`:""}</div>
        </div>`;
      }).join("")}</div>
      ${data.improved_fragment?`<div style="margin-top:16px;padding:14px;background:var(--grad-soft);border-radius:12px"><b>✨ Как улучшить:</b><div style="color:var(--mut);margin-top:6px">${esc(data.improved_fragment)}</div></div>`:""}
    </div>`;
  toast("Работа проверена", `${total}/${max} баллов`, "ok");
}
function statusLabel(s) { return { GREEN: "Освоено", YELLOW: "Нестабильно", RED: "Слабая тема", GRAY: "Не начато" }[s] || s; }

/* ---- Пробники (внутри Практики) ---- */
async function practiceMocks(el, sid) {
  el.innerHTML = `<div id="mvariants"></div>
    <div class="section-title">История пробников</div>
    <div class="card" id="mhistory"></div>`;
  const [mocks, hist] = await Promise.all([
    api("GET", `/mock-exams?subjectId=${sid}`).catch(() => []),
    api("GET", `/mock-exams/history?subjectId=${sid}`).catch(() => []),
  ]);
  $("#mvariants").innerHTML = `<div class="card"><h3>🧪 Доступные варианты</h3>
    ${mocks.length ? mocks.map(m => `<div class="list-row">
      <div class="badge">🧪</div>
      <div class="body"><div class="t">${esc(m.title)}</div><div class="d">${m.tasks.length} заданий • макс. ${m.maxPrimaryScore} б.</div></div>
      <button class="btn sm" data-take='${enc(m)}'>Решать</button>
      <button class="btn sm ghost" data-manual='${enc(m)}'>Ввести результат</button>
    </div>`).join("") : `<div class="empty">Вариантов нет</div>`}</div>`;
  $("#mvariants").querySelectorAll("[data-take]").forEach(b => b.onclick = () => takeMock(dec(b.dataset.take)));
  $("#mvariants").querySelectorAll("[data-manual]").forEach(b => b.onclick = () => manualMock(dec(b.dataset.manual)));

  const hel = $("#mhistory");
  if (!hist.length) { hel.innerHTML = `<div class="empty"><div class="big">📈</div>Пока нет решённых пробников по этому предмету.</div>`; return; }
  const points = hist.map(h => ({ label: fmtDate(h.date), value: h.testScore ?? 0 }));
  hel.innerHTML = `<div style="margin-bottom:6px;font-weight:700">Динамика тестового балла</div>
    ${lineChart(points)}
    <div style="margin-top:14px">${hist.slice().reverse().map(h => `<div class="list-row">
      <div class="badge">📄</div>
      <div class="body"><div class="t">${esc(h.title)}</div><div class="d">${new Date(h.date).toLocaleDateString("ru-RU")} • ${h.primaryScore}/${h.maxPrimaryScore} первичных</div></div>
      <div style="font-weight:800;font-size:18px;color:var(--cyan)">${h.testScore}%</div>
    </div>`).join("")}</div>`;
}
async function takeMock(mock) {
  loading();
  const tasks = [];
  for (const id of mock.tasks) { try { tasks.push(await api("GET", `/tasks/${id}`)); } catch {} }
  tasks.sort((a, b) => (a.egeTaskNumber || 0) - (b.egeTaskNumber || 0));
  screen().innerHTML = `
    <button class="back" id="back">← к пробникам</button>
    <div class="card pad-lg">
      <h3>🧪 ${esc(mock.title)}</h3>
      <p style="color:var(--mut);margin-top:-6px">Ответьте на задания и нажмите «Завершить». Посчитаем балл, слабые места и обновим план.</p>
      <div id="mtasks"></div>
      <button class="btn" id="finish" style="margin-top:8px">Завершить пробник</button>
      <div id="mres" style="margin-top:18px"></div>
    </div>`;
  $("#back").onclick = () => scrPractice();
  $("#mtasks").innerHTML = tasks.map(t => `
    <div class="field"><label>№${t.egeTaskNumber||"?"}. ${esc(t.text||t.title||"Задание")}</label>
      ${t.answerType==="ESSAY"
        ? `<textarea data-tid="${t.id}" placeholder="Развёрнутый ответ (проверит ИИ)…" style="min-height:120px"></textarea>`
        : `<input data-tid="${t.id}" placeholder="Ваш ответ">`}</div>`).join("");
  $("#finish").onclick = async () => {
    const answers = {};
    document.querySelectorAll("[data-tid]").forEach(i => { if (i.value.trim()) answers[i.dataset.tid] = i.value.trim(); });
    const btn = $("#finish"); btn.disabled = true; btn.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span> Считаю…`;
    try {
      const r = await api("POST", `/mock-exams/${mock.id}/finish`, { answers });
      renderMockResult($("#mres"), mock, r);
      toast("Пробник завершён", `${r.primaryScore}/${mock.maxPrimaryScore} баллов • план обновлён`, "ok");
      loadStreak();
    } catch (e) { toast("Ошибка", e.message, "err"); }
    finally { btn.disabled = false; btn.textContent = "Завершить пробник"; }
  };
}
async function manualMock(mock) {
  loading();
  const tasks = [];
  for (const id of mock.tasks) { try { tasks.push(await api("GET", `/tasks/${id}`)); } catch {} }
  tasks.sort((a, b) => (a.egeTaskNumber || 0) - (b.egeTaskNumber || 0));
  screen().innerHTML = `
    <button class="back" id="back">← к пробникам</button>
    <div class="card pad-lg">
      <h3>✍️ Ввод результата: ${esc(mock.title)}</h3>
      <p style="color:var(--mut);margin-top:-6px">Введите свой балл за каждое задание — построим план без перерешивания.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px" id="mscores"></div>
      <button class="btn" id="save" style="margin-top:14px">Сохранить и построить план</button>
      <div id="mres" style="margin-top:18px"></div>
    </div>`;
  $("#back").onclick = () => scrPractice();
  $("#mscores").innerHTML = tasks.map(t => `
    <div class="field" style="margin:0"><label>№${t.egeTaskNumber} (макс ${t.maxScore})</label>
      <input type="number" min="0" max="${t.maxScore}" value="0" data-n="${t.egeTaskNumber}"></div>`).join("");
  $("#save").onclick = async () => {
    const scores = {};
    document.querySelectorAll("[data-n]").forEach(i => scores[i.dataset.n] = +i.value || 0);
    const btn = $("#save"); btn.disabled = true; btn.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span> Сохраняю…`;
    try {
      const r = await api("POST", `/mock-exams/${mock.id}/manual`, { scores });
      renderMockResult($("#mres"), mock, r);
      toast("Результат сохранён", `${r.primaryScore}/${mock.maxPrimaryScore} • план построен`, "ok");
    } catch (e) { toast("Ошибка", e.message, "err"); }
    finally { btn.disabled = false; btn.textContent = "Сохранить и построить план"; }
  };
}
function renderMockResult(el, mock, r) {
  const pct = mock.maxPrimaryScore ? Math.round(r.primaryScore / mock.maxPrimaryScore * 100) : 0;
  el.innerHTML = `<div class="card" style="box-shadow:none;border:1.5px solid var(--card-brd)">
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
      ${donut(pct, { center: `${r.primaryScore}/${mock.maxPrimaryScore}` })}
      <div><div style="font-weight:800;font-size:19px">Результат пробника</div>
        <div style="color:var(--mut)">Первичный балл: <b>${r.primaryScore}</b> из ${mock.maxPrimaryScore}${r.testScore!=null?` • тестовый: <b>${r.testScore}</b>`:""}</div>
        <div class="pill-stat" style="margin-top:10px">Слабых тем выявлено: ${r.weakTopics?.length||0}</div>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn sm" id="toPlan">Посмотреть план</button>
          <button class="btn sm ghost" id="toAn">Аналитика</button>
        </div>
      </div></div></div>`;
  el.querySelector("#toPlan").onclick = () => go("plan");
  el.querySelector("#toAn").onclick = () => go("analytics");
}

/* ===================== PLAN (календарь) ===================== */
async function scrPlan() {
  loading();
  const [subs, plans] = await Promise.all([
    api("GET", "/profile/subjects").catch(() => []),
    api("GET", "/study-plan").catch(() => []),
  ]);
  const active = (plans || []).filter(p => p.status === "ACTIVE");
  const days = flattenDays(active);
  const todayKey = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const todayItems = days.filter(d => d.ts === todayKey).flatMap(d => d.items.map(i => ({ ...i, dayId: d.id })));
  const openToday = todayItems.filter(i => i.status !== "done" && i.status !== "skipped");
  const overdue = openToday.filter(i => i.overdue);
  const minutes = openToday.reduce((s, i) => s + (i.minutes || 0), 0);
  const nextMock = days.find(d => d.ts >= todayKey && d.items.some(i => i.kind === "mock_exam"));

  screen().innerHTML = `
    <div class="grid g3" style="margin-bottom:18px">
      ${statTile("📋", openToday.length, "задач сегодня", "ic-violet")}
      ${statTile("⏱", minutes + " мин", "нагрузка сегодня", "ic-blue")}
      ${statTile("🧪", nextMock ? fmtDate(nextMock.date) : "—", "ближайший пробник", "ic-green")}
    </div>
    ${overdue.length ? `<div class="card" style="margin-bottom:18px;border-color:rgba(255,93,108,.4)">
      <h3 style="color:var(--red)">⚠️ Просрочено (${overdue.length})</h3>
      ${overdue.map(planItemRow).join("")}</div>` : ""}

    <div class="card" style="margin-bottom:18px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="margin:0;flex:1;min-width:200px"><label>Пересобрать план по предмету</label>
          <select id="planSub"><option value="">Все предметы</option>${subs.map(s => `<option value="${s.subjectId}">${esc(s.subject?.name||"")}</option>`).join("")}</select></div>
        <button class="btn" id="genPlan">Обновить план</button>
      </div>
    </div>

    <div id="calendar"></div>

    <div class="card glow" style="margin-top:18px">
      <h3>❓ Почему эти задачи назначены</h3>
      <div class="muted" style="font-size:14px">План строится из вашей готовности: сначала разбор недавних ошибок и быстрые победы, затем слабые темы и ключевые задания, повторения по интервалам и пробники по расписанию. Он автоматически пересобирается после каждого ответа и пробника.</div>
    </div>`;

  $("#genPlan").onclick = async () => {
    const sid = $("#planSub").value, btn = $("#genPlan");
    btn.disabled = true; btn.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span> Считаю…`;
    try {
      const r = await api("POST", "/study-plan/generate", sid ? { subjectId: sid } : {});
      if (r && r.created === false) toast("Недостаточно данных", "Решите пробник или прорешайте задания", "warn");
      else toast("План обновлён!", "", "ok");
      scrPlan();
    } catch (e) { toast("Ошибка", e.message, "err"); btn.disabled = false; btn.textContent = "Обновить план"; }
  };

  renderCalendar($("#calendar"), days, todayKey);
}
function flattenDays(plans) {
  const out = [];
  for (const p of plans) for (const d of (p.days || [])) {
    const ts = (() => { const x = new Date(d.date); x.setHours(0, 0, 0, 0); return x.getTime(); })();
    out.push({ id: d.id, date: d.date, ts, subjectName: p.subject?.name || "", items: (Array.isArray(d.items) ? d.items : []) });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}
function renderCalendar(el, days, todayKey) {
  // группируем по дате
  const byTs = new Map();
  for (const d of days) {
    const g = byTs.get(d.ts) || { ts: d.ts, date: d.date, entries: [] };
    for (const it of d.items) g.entries.push({ ...it, dayId: d.id, subjectName: d.subjectName });
    byTs.set(d.ts, g);
  }
  const groups = [...byTs.values()].filter(g => g.ts >= todayKey).sort((a, b) => a.ts - b.ts).slice(0, 21);
  if (!groups.length) {
    el.innerHTML = `<div class="card"><div class="empty"><div class="big">🗓</div>
      <div style="font-weight:700;margin-bottom:6px">Плана пока нет</div>
      <div style="margin-bottom:16px">Решите пробник или прорешайте задания — план построится автоматически.</div>
      <button class="btn" id="toPr">Перейти к практике</button></div></div>`;
    el.querySelector("#toPr").onclick = () => go("practice");
    return;
  }
  el.innerHTML = groups.map(g => {
    const isToday = g.ts === todayKey;
    const open = g.entries.filter(i => i.status !== "done" && i.status !== "skipped");
    return `<div class="cal-day ${isToday ? "today" : ""}">
      <div class="cal-date"><div class="cal-d">${isToday ? "Сегодня" : new Date(g.date).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "short" })}</div>
        <div class="cal-min">${open.reduce((s, i) => s + (i.minutes || 0), 0)} мин · ${open.length} зд.</div></div>
      <div class="cal-items">${g.entries.length ? g.entries.map(planItemRow).join("") : `<div class="muted" style="font-size:13px;padding:6px 0">Свободный день</div>`}</div>
    </div>`;
  }).join("");
  el.querySelectorAll("[data-train]").forEach(b => b.onclick = () => goPractice(dec(b.dataset.train)));
  el.querySelectorAll("[data-act]").forEach(b => b.onclick = () => planItemAction(b.dataset.day, b.dataset.item, b.dataset.act));
}
function planItemRow(i) {
  const done = i.status === "done", skip = i.status === "skipped";
  const train = trainTarget(i);
  return `<div class="pi ${done ? "pi-done" : ""} ${skip ? "pi-skip" : ""} ${i.overdue ? "pi-over" : ""}">
    <div class="pi-ic">${kindIcon(i.kind)}</div>
    <div class="pi-body">
      <div class="pi-t">${esc(i.title)} ${done ? "✓" : ""}</div>
      <div class="pi-d"><span class="chip ${reasonCls(i.kind)}">${esc(i.reason)}</span> · ${i.minutes} мин${i.subjectName ? " · " + esc(i.subjectName) : ""}${i.note ? " · " + esc(i.note) : ""}</div>
    </div>
    <div class="pi-actions">
      ${(!done && !skip) ? `
        ${train ? `<button class="btn sm" data-train='${enc(train)}'>Тренироваться</button>` : ""}
        <button class="iconbtn sm" title="Выполнить" data-day="${i.dayId}" data-item="${i.id}" data-act="done">✓</button>
        <button class="iconbtn sm" title="Перенести" data-day="${i.dayId}" data-item="${i.id}" data-act="reschedule">↦</button>
        <button class="iconbtn sm" title="Пропустить" data-day="${i.dayId}" data-item="${i.id}" data-act="skip">✕</button>
      ` : `<span class="pi-status">${done ? "Выполнено" : "Пропущено"}</span>`}
    </div>
  </div>`;
}
function trainTarget(i) {
  if (i.kind === "mock_exam") return { subjectId: i.subjectId, mode: "mocks" };
  if (i.kind === "ai_check") return { subjectId: i.subjectId, mode: "tasks" };
  if (i.egeTaskNumber != null) return { subjectId: i.subjectId, mode: "tasks", egeTaskNumber: i.egeTaskNumber, taskIds: i.taskIds };
  if (i.topicId) return { subjectId: i.subjectId, mode: "topics", topicId: i.topicId };
  return null;
}
async function planItemAction(dayId, itemId, act) {
  try {
    await api("PATCH", `/study-plan/item/${dayId}/${itemId}`, { action: act });
    toast(act === "done" ? "Готово!" : act === "skip" ? "Пропущено" : "Перенесено", "", "ok");
    scrPlan();
  } catch (e) { toast("Ошибка", e.message, "err"); }
}

/* ===================== PROFILE ===================== */
async function scrProfile() {
  loading();
  const [profile, subs, sub, access] = await Promise.all([
    api("GET", "/profile").catch(() => null),
    api("GET", "/profile/subjects").catch(() => []),
    api("GET", "/subscription").catch(() => null),
    api("GET", "/subscription/access").catch(() => S.accessInfo || {}),
  ]);
  const summary = hasAccess() ? await api("GET", "/progress/summary").catch(() => ({ totalAnswers: 0, correct: 0, accuracy: 0 })) : { totalAnswers: 0, correct: 0, accuracy: 0 };
  const acc = Math.round((summary.accuracy || 0) * 100);
  screen().innerHTML = `
    <div class="card hero-cta glow" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="avatar" style="width:46px;height:46px;font-size:17px">${avatarInitials()}</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:800;font-size:18px;color:#fff">Привет, ${esc(displayName())}!</div>
          <div style="color:#cfe0ff;font-size:14px">Системная подготовка каждый день — ключ к высокому баллу.</div>
        </div>
        <div class="aurora"><span class="spark">✦</span> До экзамена ${profile?.examDate ? daysLeft(profile.examDate) + " дн." : "дата не задана"}</div>
      </div>
    </div>
    <div class="grid g2">
      <div class="card"><h3>👤 Аккаунт</h3>
        ${S.user?.name ? `<div class="list-row"><div class="badge">🙂</div><div class="body"><div class="t">${esc(S.user.name)}</div><div class="d">имя</div></div></div>` : ""}
        <div class="list-row"><div class="badge">📧</div><div class="body"><div class="t">${esc(S.user?.email||"")}</div><div class="d">роль: ${esc(S.user?.role||"STUDENT")}</div></div></div>
        <div class="list-row"><div class="badge">🎓</div><div class="body"><div class="t">${profile?.examType||"—"} • ${profile?.grade||"—"} класс</div><div class="d">трек подготовки</div></div></div>
        ${hasAccess() ? `<div class="list-row"><div class="badge">📈</div><div class="body"><div class="t">${summary.correct}/${summary.totalAnswers} верных (${acc}%)</div><div class="d">прогресс практики</div></div></div>` : ""}
        <div class="field" style="margin-top:14px"><label>Минут в день на учёбу</label><input id="pmin" type="number" value="${profile?.dailyMinutes||60}"></div>
        <div class="field"><label>Дата экзамена</label><input id="pdate" type="date" value="${profile?.examDate?profile.examDate.slice(0,10):""}"></div>
        <button class="btn sm" id="saveProf">Сохранить настройки</button>
      </div>
      <div class="card"><h3>💳 Подписка <span class="tag">${esc(access?.planName||sub?.planName||"FREE")}</span></h3>
        <div class="list-row"><div class="badge">${access?.hasAccess?"✅":"🔒"}</div><div class="body"><div class="t">${access?.hasAccess?"Кабинет открыт":"Кабинет закрыт"}</div><div class="d">статус: ${esc(access?.status||sub?.status||"—")}</div></div></div>
        <div class="list-row"><div class="badge">⚡</div><div class="body"><div class="t">${(access?.limits?.aiChecksPerDay ?? sub?.limits?.aiChecksPerDay ?? "—")} ИИ-проверок в день</div><div class="d">лимит тарифа</div></div></div>
        <div class="section-title" style="margin-top:18px">Мои предметы и цели</div>
        ${subs.length ? subs.map(s => `<div class="list-row"><div class="badge">📘</div><div class="body"><div class="t">${esc(s.subject?.name||"")}</div><div class="d">цель: ${s.targetScore??"—"} б.${s.currentScore!=null?` • текущий: ${s.currentScore}`:""}</div></div></div>`).join("") : `<div class="empty">Предметы не выбраны</div>`}
        ${!access?.hasAccess ? `<button class="btn sm block" id="choosePlan" style="margin-top:14px">Выбрать план</button>` : ""}
      </div>
    </div>
    ${isAdmin() ? devPanel(access) : ""}
    <div style="margin-top:18px"><button class="btn ghost" id="logout">Выйти из аккаунта</button></div>`;

  $("#saveProf").onclick = async () => {
    try {
      const body = { dailyMinutes: +$("#pmin").value };
      const d = $("#pdate").value; if (d) body.examDate = new Date(d).toISOString();
      await api("PATCH", "/profile", body); toast("Сохранено", "Пересоберите план, чтобы учесть изменения", "ok");
    } catch (e) { toast("Ошибка", e.message, "err"); }
  };
  $("#logout").onclick = () => logout();
  const cp = $("#choosePlan"); if (cp) cp.onclick = () => go("locked");
  if (isAdmin()) wireDevPanel();
}
function devPanel(access) {
  const codes = ["EXPRESS", "STANDARD", "STRATEG", "ULTRASKILL"];
  return `<div class="card" style="margin-top:18px;border-color:rgba(245,177,76,.4)">
    <h3>🧪 Dev-панель (только ADMIN)</h3>
    <p class="muted" style="font-size:13.5px;margin-top:-8px">Тестирование тарифов без оплаты. Текущий: <b>${esc(access?.planCode||"FREE")}</b> · доступ: ${access?.hasAccess?"открыт":"закрыт"}.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      ${codes.map(c => `<button class="btn sm ${c==="STANDARD"?"":"ghost"}" data-setplan="${c}">${c}</button>`).join("")}
    </div>
    <button class="btn sm ghost" data-clearplan="1">Снять подписку (превью без доступа)</button>
  </div>`;
}
function wireDevPanel() {
  document.querySelectorAll("[data-setplan]").forEach(b => b.onclick = async () => {
    try { await api("POST", "/subscription/dev/set", { planCode: b.dataset.setplan }); toast("Тариф включён", b.dataset.setplan, "ok"); S.accessInfo = await api("GET", "/subscription/access"); boot(); }
    catch (e) { toast("Ошибка", e.message, "err"); }
  });
  const cl = document.querySelector("[data-clearplan]");
  if (cl) cl.onclick = async () => {
    try { await api("POST", "/subscription/dev/clear", {}); toast("Подписка снята", "Превью без доступа", "ok"); S.accessInfo = await api("GET", "/subscription/access"); boot(); }
    catch (e) { toast("Ошибка", e.message, "err"); }
  };
}

/* ===================== start ===================== */
boot();
