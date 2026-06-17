// ЕГЭ AI — пользовательский интерфейс (vanilla JS, без сборки)
const API = "http://localhost:3000/api";

const S = {
  access: localStorage.getItem("ege_access") || null,
  refresh: localStorage.getItem("ege_refresh") || null,
  user: null,
  profile: null,
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

// Однопоточный refresh: при параллельных 401 обновляем токен один раз.
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
  // Токен доступа протух → пробуем обновить по refresh-токену и повторяем запрос один раз.
  if (res.status === 401 && auth && S.refresh) {
    const ok = await tryRefresh();
    if (ok) ({ res, data } = await rawFetch(method, path, body, auth, S.access));
    else { sessionExpired(); throw { status: 401, message: "Сессия истекла" }; }
  }
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || (data && data.message) || `Ошибка ${res.status}`;
    throw { status: res.status, message: Array.isArray(msg) ? msg.join(", ") : msg };
  }
  return data;
}

function sessionExpired() {
  S.access = S.refresh = S.user = S.profile = null;
  ["ege_access", "ege_refresh"].forEach(k => localStorage.removeItem(k));
  toast("Сессия истекла", "Войдите снова, пожалуйста", "warn");
  renderAuth();
}
function setTokens(d) {
  if (d.accessToken) { S.access = d.accessToken; localStorage.setItem("ege_access", d.accessToken); }
  if (d.refreshToken) { S.refresh = d.refreshToken; localStorage.setItem("ege_refresh", d.refreshToken); }
}
function logout() {
  S.access = S.refresh = S.user = S.profile = null;
  ["ege_access", "ege_refresh"].forEach(k => localStorage.removeItem(k));
  boot();
}

/* ===================== helpers ===================== */
const $ = (sel) => document.querySelector(sel);
const app = () => document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const initials = (email) => (email || "?").slice(0, 2).toUpperCase();

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

/* ---- SVG charts ---- */
function donut(percent, { size = 120, stroke = 13, color = "#6d3bf5", track = "#ececf3", center } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, percent));
  const off = c * (1 - p / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size/2} ${size/2})" style="transition:stroke-dashoffset .8s ease"/>
    <text x="50%" y="50%" text-anchor="middle" dy=".34em" font-size="${size*0.24}" font-weight="800" fill="#1a1c2e">${center ?? Math.round(p) + "%"}</text>
  </svg>`;
}
function gauge(estimate, target, max = 100) {
  // полукруг 0..max со стрелкой estimate и меткой цели
  const W = 230, H = 130, cx = W / 2, cy = H - 8, r = 96, stroke = 16;
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
    ${arc(Math.PI, 0, "#ececf3")}
    ${arc(Math.PI, eAng, "#6d3bf5")}
    ${target != null ? `<line x1="${tx}" y1="${ty}" x2="${tx2}" y2="${ty2}" stroke="#ef4444" stroke-width="3"/>
      <circle cx="${tx}" cy="${ty}" r="3.5" fill="#ef4444"/>` : ""}
    <circle cx="${cx}" cy="${cy}" r="6" fill="#1a1c2e"/>
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#1a1c2e" stroke-width="3.5" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 28}" text-anchor="middle" font-size="30" font-weight="800" fill="#1a1c2e">${Math.round(estimate)}</text>
    <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="11" fill="#6b7088">из ${max}</text>
  </svg>`;
}

/* ===================== boot / router ===================== */
async function boot() {
  app().innerHTML = `<div class="loading-screen"><div class="spinner"></div><div>Загрузка…</div></div>`;
  if (!S.access) return renderAuth();
  try {
    S.user = await api("GET", "/auth/me");
    const st = await api("GET", "/onboarding/state");
    if (!st.completed) return renderOnboarding(st);
    return renderApp();
  } catch (e) {
    if (e.status === 401) { logout(); return; }
    renderAuth();
  }
}
function go(tab) { S.tab = tab; renderApp(); }

/* ===================== AUTH ===================== */
function renderAuth(mode = "login", prefillEmail = "") {
  app().innerHTML = `
  <div class="center-wrap">
    <div class="auth-card">
      <div class="auth-hero">
        <div class="logo">ЕГЭ&nbsp;AI</div>
        <h1>Личный ИИ-репетитор, который ведёт до нужного балла</h1>
        <p>Диагностика → план → задания → проверка сочинения → карта слабых тем → прогноз.</p>
        <div class="feats">
          <div class="feat"><span class="ic">✍️</span> Проверка сочинения по критериям ФИПИ</div>
          <div class="feat"><span class="ic">📊</span> Карта тем: что подтянуть в первую очередь</div>
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
        <div class="field"><label>Email</label><input id="email" type="email" placeholder="you@example.com" value="${esc(prefillEmail||"")}"></div>
        <div class="field"><label>Пароль</label><input id="pass" type="password" placeholder="минимум 8 символов" value=""></div>
        <button class="btn block" id="submit">${mode === "login" ? "Войти" : "Зарегистрироваться"}</button>
        <div id="authErr" style="margin-top:14px"></div>
        <p class="sub" style="text-align:center;margin-top:16px;font-size:13px">Демо-режим • данные хранятся в тестовой БД</p>
      </div>
    </div>
  </div>`;
  $("#tLogin").onclick = () => renderAuth("login");
  $("#tReg").onclick = () => renderAuth("register");
  const submit = $("#submit");
  submit.onclick = async () => {
    const email = $("#email").value.trim(), password = $("#pass").value;
    $("#authErr").innerHTML = "";
    if (!email || !password) return toast("Заполните поля", "Email и пароль обязательны", "warn");
    submit.disabled = true; submit.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span>`;
    try {
      const d = await api("POST", `/auth/${mode === "login" ? "login" : "register"}`, { email, password }, false);
      setTokens(d);
      toast(mode === "login" ? "Вход выполнен" : "Аккаунт создан", "", "ok");
      boot();
    } catch (e) {
      submit.disabled = false; submit.textContent = mode === "login" ? "Войти" : "Зарегистрироваться";
      // Нет аккаунта на эту почту → показываем ссылку на регистрацию.
      if (mode === "login" && (e.status === 404 || /нет аккаунта/i.test(e.message || ""))) {
        $("#authErr").innerHTML = `<div class="card" style="box-shadow:none;border:1.5px solid #fecaca;background:#fef2f2;padding:14px">
          <div style="font-weight:700;color:#dc2626;margin-bottom:4px">Нет аккаунта на эту почту</div>
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
        <div class="logo" style="font-size:22px;font-weight:800;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:18px">ЕГЭ AI</div>
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
  ["progress", "📊", "Мой прогресс"],
  ["forecast", "🎯", "Прогноз баллов"],
  ["plan", "🗓", "План"],
  ["mock", "🧪", "Пробник"],
];
const TITLES = {
  dashboard: ["Главная", "Ваша сводка на сегодня"],
  practice: ["Практика", "Решайте задания и проверяйте сочинения"],
  progress: ["Мой прогресс", "Карта тем и точность"],
  forecast: ["Прогноз баллов", "Где вы сейчас и шанс достичь цели"],
  plan: ["План подготовки", "Что делать по дням"],
  mock: ["Пробник", "Проверьте себя в формате экзамена"],
  profile: ["Профиль", "Данные и подписка"],
};

async function renderApp() {
  const [title, sub] = TITLES[S.tab];
  app().innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="logo">ЕГЭ AI</div>
      <nav>${NAV.map(([id, ic, label]) => `<button class="${id===S.tab?"on":""}" data-tab="${id}"><span class="ic">${ic}</span>${label}</button>`).join("")}</nav>
      <div class="side-foot">
        <nav style="margin-bottom:12px"><button class="${S.tab==="profile"?"on":""}" data-tab="profile"><span class="ic">👤</span>Профиль</button></nav>
        <div class="plan-card"><b id="planName">Тариф FREE</b><span id="planLimit">3 ИИ-проверки в день</span></div>
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1>${title}</h1>
          <div class="sub">${sub}</div>
        </div>
        <div class="spacer"></div>
        <div class="streak" id="streak"><span>🔥</span><span class="n">…</span></div>
        <div class="avatar" title="${esc(S.user?.email||"")}">${initials(S.user?.email)}</div>
      </div>
      <div id="screen"></div>
    </main>
  </div>`;
  document.querySelectorAll(".side nav button").forEach(b => b.onclick = () => go(b.dataset.tab));
  loadStreak(); loadPlanCard();
  ({ dashboard: scrDashboard, practice: scrPractice, progress: scrProgress, forecast: scrForecast, plan: scrPlan, mock: scrMock, profile: scrProfile }[S.tab])();
}

async function loadStreak() {
  try { const s = await api("GET", "/progress/streak"); const el = $("#streak"); if (el) el.innerHTML = `<span>🔥</span><span class="n">${s.streakDays}</span><small>дней</small>`; } catch {}
}
async function loadPlanCard() {
  try {
    const sub = await api("GET", "/subscription");
    if (sub && $("#planName")) { $("#planName").textContent = "Тариф " + (sub.planName || "FREE"); const lim = sub.limits?.aiChecksPerDay; $("#planLimit").textContent = (lim>=0?lim:"∞") + " ИИ-проверок в день"; }
  } catch {}
}
function screen() { return document.getElementById("screen"); }
function loading() { screen().innerHTML = `<div class="loading-screen" style="min-height:300px"><div class="spinner"></div></div>`; }

/* ===================== DASHBOARD ===================== */
async function scrDashboard() {
  loading();
  const [summary, recs, forecast, weak, plans] = await Promise.all([
    api("GET", "/progress/summary").catch(() => ({ totalAnswers: 0, correct: 0, accuracy: 0 })),
    api("GET", "/recommendations/today").catch(() => ({ actions: [] })),
    api("GET", "/score-forecast").catch(() => ({ subjects: [] })),
    api("GET", "/progress/weak-topics").catch(() => []),
    api("GET", "/study-plan").catch(() => []),
  ]);
  const acc = Math.round((summary.accuracy || 0) * 100);
  const mainFc = forecast.subjects?.find(s => s.practicedTopics > 0) || forecast.subjects?.[0];
  const hasPlan = plans.some(p => p.status === "ACTIVE");

  const cta = hasPlan ? "" : `
    <div class="card" style="margin-bottom:18px;background:var(--grad);color:#fff;border:none">
      <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <div style="font-size:38px">🧪</div>
        <div style="flex:1;min-width:200px">
          <div style="font-weight:800;font-size:18px">Постройте персональный план</div>
          <div style="opacity:.92;font-size:14px">Решите полный пробник или введите результат прошлого — и мы составим план: что подтянуть в первую очередь.</div>
        </div>
        <button class="btn" id="ctaMock" style="background:#fff;color:var(--brand2)">Решить пробник</button>
      </div>
    </div>`;

  screen().innerHTML = `
    ${cta}
    <div class="grid g3" style="margin-bottom:18px">
      <div class="card"><div class="stat"><div class="ic ic-violet">📝</div><div><div class="n">${summary.totalAnswers}</div><div class="l">решено заданий</div></div></div></div>
      <div class="card"><div class="stat"><div class="ic ic-green">✅</div><div><div class="n">${summary.correct}</div><div class="l">верных ответов</div></div></div></div>
      <div class="card"><div class="stat"><div class="ic ic-amber">🎯</div><div><div class="n">${acc}%</div><div class="l">средняя точность</div></div></div></div>
    </div>
    <div class="grid g2">
      <div class="card">
        <h3>🎯 Рекомендации на сегодня</h3>
        <div id="recs"></div>
      </div>
      <div class="card">
        <h3>📈 Прогноз балла ${mainFc?`<span class="tag">${esc(mainFc.subjectName)}</span>`:""}</h3>
        <div id="fc"></div>
      </div>
    </div>
    <div class="section-title">Слабые темы — подтяните в первую очередь</div>
    <div class="card"><div id="weak"></div></div>`;

  // recs
  const actions = recs.actions || [];
  $("#recs").innerHTML = actions.length ? actions.map(a => `
    <div class="list-row">
      <div class="badge">${a.type==="weak_topic"?"⚠️":a.type==="plan"?"🗓":a.type==="essay"?"✍️":"📚"}</div>
      <div class="body"><div class="t">${esc(a.title)}</div><div class="d">${esc(a.reason||"")}</div></div>
      ${a.topicId?`<button class="btn sm ghost" data-prac="${a.subjectId}">Заниматься</button>`:`<button class="btn sm ghost" data-tab="practice">Начать</button>`}
    </div>`).join("") : `<div class="empty"><div class="big">🎉</div>Пока всё сделано! Начните практику, чтобы получить рекомендации.</div>`;
  $("#recs").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => go("practice"));
  $("#recs").querySelectorAll("[data-prac]").forEach(b => b.onclick = () => go("practice"));
  const ctaBtn = document.getElementById("ctaMock"); if (ctaBtn) ctaBtn.onclick = () => go("mock");

  // forecast gauge
  if (mainFc && mainFc.practicedTopics > 0) {
    const p = mainFc.goalProbability != null ? Math.round(mainFc.goalProbability * 100) : null;
    $("#fc").innerHTML = `<div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap">
      ${gauge(mainFc.estimate, mainFc.targetScore)}
      <div>
        <div class="pill-stat" style="margin-bottom:8px">Коридор: ${mainFc.range.min}–${mainFc.range.max} б.</div><br>
        ${mainFc.targetScore!=null?`<div class="pill-stat" style="margin-bottom:8px">🎯 Цель: ${mainFc.targetScore} б.</div><br>`:""}
        ${p!=null?`<div class="pill-stat">Шанс достичь цели: <b style="color:var(--ink);margin-left:4px">${p}%</b></div>`:""}
      </div></div>`;
  } else {
    $("#fc").innerHTML = `<div class="empty"><div class="big">📈</div>Прорешайте задания — и здесь появится прогноз балла.</div>`;
  }

  // weak
  renderWeak($("#weak"), weak);
}
function renderWeak(el, weak) {
  if (!weak.length) { el.innerHTML = `<div class="empty"><div class="big">🌱</div>Слабых тем пока нет. Так держать!</div>`; return; }
  el.innerHTML = `<div class="topic-map">` + weak.map(t => `
    <div class="topic-cell bg-${t.status}">
      <div><div class="nm">${esc(t.topic?.name||"Тема")}</div><div class="blk">${esc(t.subject?.name||"")}</div></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <span class="pct">${Math.round(t.accuracyPercent)}%</span>
        <span class="meta">${t.attempts} попыток</span>
      </div>
    </div>`).join("") + `</div>`;
}

/* ===================== PRACTICE ===================== */
// Deep-link из плана: открыть конкретную тему или задание в практике.
let practiceTarget = null;
function goPractice(target) { practiceTarget = target || null; go("practice"); }

async function scrPractice() {
  loading();
  const subs = await api("GET", "/profile/subjects").catch(() => []);
  screen().innerHTML = `
    <div class="card">
      <h3>📚 Выберите предмет</h3>
      <div class="pick-grid" id="psubs"></div>
    </div>
    <div id="ptopics"></div>`;
  $("#psubs").innerHTML = subs.map(s => `<div class="pick" data-sid="${s.subjectId}"><div class="nm">${esc(s.subject?.name||"Предмет")}</div><div class="meta">цель: ${s.targetScore??"—"} б.</div></div>`).join("")
    || `<div class="empty">Нет выбранных предметов</div>`;
  $("#psubs").querySelectorAll("[data-sid]").forEach(c => c.onclick = () => {
    $("#psubs").querySelectorAll(".pick").forEach(x => x.classList.remove("on")); c.classList.add("on");
    practiceTopics(c.dataset.sid);
  });

  // Переход из плана: подсветить предмет и открыть тему/задание.
  const target = practiceTarget; practiceTarget = null;
  if (target) {
    const cell = document.querySelector(`#psubs [data-sid="${target.subjectId}"]`);
    if (cell) cell.classList.add("on");
    if (target.taskId) {
      try { const task = await api("GET", `/tasks/${target.taskId}`); if (task) return openTask(task); } catch {}
    }
    if (target.topicId) return practiceTopics(target.subjectId, target.topicId);
    if (target.subjectId) practiceTopics(target.subjectId);
  }
}
async function practiceTopics(subjectId, selectTopicId) {
  const box = $("#ptopics");
  box.innerHTML = `<div class="card" style="margin-top:18px"><div class="spinner"></div></div>`;
  const topics = await api("GET", `/subjects/${subjectId}/topics`).catch(() => []);
  box.innerHTML = `<div class="card" style="margin-top:18px"><h3>🧩 Темы</h3>
    ${topics.length ? `<div class="pick-grid" id="ptops"></div>` : `<div class="empty">У предмета пока нет тем с заданиями</div>`}</div>
    <div id="ptasks"></div>`;
  if (topics.length) {
    $("#ptops").innerHTML = topics.map(t => `<div class="pick" data-tid="${t.id}"><div class="nm">${esc(t.name)}</div><div class="meta">${t.egeBlock||"—"} ${t.egeTaskNumbers?.length?"• №"+t.egeTaskNumbers.join(", "):""}</div></div>`).join("");
    $("#ptops").querySelectorAll("[data-tid]").forEach(c => c.onclick = () => {
      $("#ptops").querySelectorAll(".pick").forEach(x => x.classList.remove("on")); c.classList.add("on");
      practiceTasks(c.dataset.tid);
    });
    // Авто-выбор темы при переходе из плана.
    if (selectTopicId) {
      const cell = document.querySelector(`#ptops [data-tid="${selectTopicId}"]`);
      if (cell) { cell.classList.add("on"); cell.scrollIntoView({ behavior: "smooth", block: "center" }); }
      practiceTasks(selectTopicId);
    }
  }
}
async function practiceTasks(topicId) {
  const box = $("#ptasks");
  box.innerHTML = `<div class="card" style="margin-top:18px"><div class="spinner"></div></div>`;
  const tasks = await api("GET", `/topics/${topicId}/tasks`).catch(() => []);
  box.innerHTML = `<div class="card" style="margin-top:18px"><h3>📝 Задания</h3>
    ${tasks.length ? `<div id="tasklist"></div>` : `<div class="empty">Заданий пока нет</div>`}</div>`;
  if (tasks.length) {
    $("#tasklist").innerHTML = tasks.map(t => `
      <div class="list-row">
        <div class="badge">${t.answerType==="ESSAY"?"✍️":"🔤"}</div>
        <div class="body"><div class="t">${esc(t.title||("Задание"+(t.egeTaskNumber?" "+t.egeTaskNumber:"")))}</div>
          <div class="d">${esc((t.text||"").slice(0,90))}${(t.text||"").length>90?"…":""}</div></div>
        <button class="btn sm" data-task='${encodeURIComponent(JSON.stringify(t))}'>Решать</button>
      </div>`).join("");
    $("#tasklist").querySelectorAll("[data-task]").forEach(b => b.onclick = () => openTask(JSON.parse(decodeURIComponent(b.dataset.task))));
  }
}
function openTask(task) {
  const isEssay = task.answerType === "ESSAY";
  screen().innerHTML = `
    <button class="back" id="back">← к заданиям</button>
    <div class="card pad-lg">
      <h3>${isEssay?"✍️":"🔤"} ${esc(task.title||"Задание")} ${task.egeTaskNumber?`<span class="tag">№${task.egeTaskNumber}</span>`:""}</h3>
      <p style="color:var(--mut);white-space:pre-wrap">${esc(task.text||"")}</p>
      ${isEssay
        ? `<div class="field" style="margin-top:14px"><label>Ваше сочинение</label><textarea id="ans" placeholder="Напишите сочинение (минимум 50 символов)…"></textarea></div>`
        : `<div class="field" style="margin-top:14px"><label>Ваш ответ</label><input id="ans" placeholder="Введите ответ"></div>`}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="send">${isEssay?"Проверить сочинение":"Проверить ответ"}</button>
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
    } finally { btn.disabled = false; btn.textContent = isEssay?"Проверить ещё раз":"Проверить ответ"; }
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
  el.innerHTML = `<div class="card" style="box-shadow:none;border:1.5px solid ${ok?"#bbf7d0":"#fecaca"};background:${ok?"#f0fdf4":"#fef2f2"}">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:30px">${ok?"✅":"❌"}</div>
      <div style="flex:1"><div style="font-weight:800;font-size:17px">${ok?"Верно!":"Неверно"}</div>
        <div style="color:var(--mut)">${ok?`+${r.score} балл`:"Ничего страшного — разберём ошибку"}</div></div>
      ${task?.egeTaskNumber?`<button class="btn sm ghost" id="similar">🔁 Решать похожие</button>`:""}
    </div>
    ${!ok && r.correctAnswer ? `<div style="margin-top:14px;padding:12px 14px;background:#fff;border-radius:10px;border:1px solid #fecaca">
      <span style="color:var(--mut);font-size:13px">Правильный ответ:</span>
      <div style="font-weight:800;font-size:16px;color:#16a34a;margin-top:2px">${esc(r.correctAnswer)}</div></div>` : ""}
    ${r.topicProgress?`<div style="margin-top:14px;display:flex;align-items:center;gap:10px">
      <span class="chip ${r.topicProgress.status}">${statusLabel(r.topicProgress.status)}</span>
      <span style="color:var(--mut);font-size:13px">Точность по теме: <b>${Math.round(r.topicProgress.accuracyPercent)}%</b></span></div>`:""}
    ${!ok ? `<div style="margin-top:10px;color:var(--mut);font-size:13px">💡 Нажмите «Пояснение ИИ», чтобы разобрать решение.</div>` : ""}
  </div>`;
  const sim = el.querySelector("#similar");
  if (sim && task) sim.onclick = async () => {
    sim.disabled = true; sim.innerHTML = `<span class="spinner"></span>`;
    try { const next = await api("GET", `/tasks/${task.id}/similar`); openTask(next); }
    catch (e) { toast("Ошибка", e.message, "err"); sim.disabled = false; sim.innerHTML = "🔁 Решать похожие"; }
  };
  toast(ok ? "Верно! 🎉" : "Не верно", ok ? "" : "Смотрите правильный ответ ниже", ok ? "ok" : "warn");
}
function renderExplain(el, d) {
  if (!d || typeof d !== "object") { el.innerHTML = `<div class="card" style="box-shadow:none;border:1px solid var(--line)">${esc(String(d||""))}</div>`; return; }
  const block = (icon, title, val) => val ? `<div style="margin-bottom:10px"><b>${icon} ${title}</b><div style="color:var(--mut);margin-top:2px">${esc(val)}</div></div>` : "";
  el.innerHTML = `<div class="card" style="box-shadow:none;border:1.5px solid #e0d8ff;background:#faf8ff">
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
    <div class="card" style="box-shadow:none;border:1.5px solid var(--line)">
      <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:8px">
        ${donut(max?Math.round((total/max)*100):0, { center: `${total}/${max}`, color: "#6d3bf5" })}
        <div>
          <div style="font-weight:800;font-size:19px">Оценка сочинения</div>
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
      ${data.improved_fragment?`<div style="margin-top:16px;padding:14px;background:#faf8ff;border-radius:12px"><b>✨ Как можно улучшить:</b><div style="color:var(--mut);margin-top:6px">${esc(data.improved_fragment)}</div></div>`:""}
    </div>`;
  toast("Сочинение проверено", `${total}/${max} баллов`, "ok");
}
function statusLabel(s) { return { GREEN: "Освоено", YELLOW: "Нестабильно", RED: "Слабая тема", GRAY: "Не начато" }[s] || s; }

/* ===================== PROGRESS ===================== */
async function scrProgress() {
  loading();
  const [overview, summary] = await Promise.all([
    api("GET", "/progress").catch(() => []),
    api("GET", "/progress/summary").catch(() => ({ totalAnswers: 0, correct: 0, accuracy: 0 })),
  ]);
  const acc = Math.round((summary.accuracy || 0) * 100);
  const counts = { GREEN: 0, YELLOW: 0, RED: 0, GRAY: 0 };
  overview.forEach(t => counts[t.status]++);
  screen().innerHTML = `
    <div class="grid g2" style="margin-bottom:18px">
      <div class="card"><h3>🎯 Общая точность</h3>
        <div class="donut-wrap">${donut(acc, { color: acc>=80?"#22c55e":acc>=50?"#f59e0b":"#ef4444" })}
          <div><div class="n" style="font-size:24px;font-weight:800">${summary.correct}/${summary.totalAnswers}</div>
          <div class="l" style="color:var(--mut)">верных ответов</div>
          <div class="legend"><span><i style="background:#22c55e"></i>освоено ${counts.GREEN}</span><span><i style="background:#f59e0b"></i>нестабильно ${counts.YELLOW}</span><span><i style="background:#ef4444"></i>слабые ${counts.RED}</span></div>
          </div></div>
      </div>
      <div class="card"><h3>📊 Распределение тем</h3><div id="bars"></div></div>
    </div>
    <div class="section-title">Карта тем</div>
    <div class="card"><div id="map"></div></div>`;
  // bars
  const totalT = overview.length || 1;
  const bar = (label, n, col) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span>${label}</span><b>${n}</b></div><div class="scorebar"><span style="width:${Math.round(n/totalT*100)}%;background:${col}"></span></div></div>`;
  $("#bars").innerHTML = overview.length ? (bar("🟢 Освоено", counts.GREEN, "#22c55e") + bar("🟡 Нестабильно", counts.YELLOW, "#f59e0b") + bar("🔴 Слабые", counts.RED, "#ef4444")) : `<div class="empty">Нет данных</div>`;
  // map
  if (!overview.length) { $("#map").innerHTML = `<div class="empty"><div class="big">🗺️</div>Карта тем появится после первых заданий. Перейдите в «Практику».</div>`; return; }
  $("#map").innerHTML = `<div class="topic-map">` + overview.map(t => `
    <div class="topic-cell bg-${t.status}">
      <div><div class="nm">${esc(t.topic?.name||"Тема")}</div><div class="blk">${esc(t.subject?.name||"")}</div></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <span class="pct">${Math.round(t.accuracyPercent)}%</span><span class="meta">${t.attempts} поп.</span>
      </div></div>`).join("") + `</div>`;
}

/* ===================== FORECAST ===================== */
async function scrForecast() {
  loading();
  const fc = await api("GET", "/score-forecast").catch(() => ({ subjects: [] }));
  if (!fc.subjects?.length) { screen().innerHTML = `<div class="card"><div class="empty"><div class="big">🎯</div>Нет предметов для прогноза.</div></div>`; return; }
  screen().innerHTML = `<div class="grid g2">` + fc.subjects.map(s => {
    const has = s.practicedTopics > 0;
    const p = s.goalProbability != null ? Math.round(s.goalProbability * 100) : null;
    return `<div class="card">
      <h3>${esc(s.subjectName)} ${s.targetScore!=null?`<span class="tag">цель ${s.targetScore}</span>`:""}</h3>
      ${has ? `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
          ${gauge(s.estimate, s.targetScore)}
          <div style="flex:1;min-width:140px">
            <div class="pill-stat" style="margin-bottom:8px">Коридор: ${s.range.min}–${s.range.max} б.</div><br>
            <div class="pill-stat" style="margin-bottom:8px">Изучено тем: ${s.practicedTopics}/${s.totalTopics}</div><br>
            ${p!=null?`<div style="margin-top:6px"><div style="font-size:13px;color:var(--mut);margin-bottom:5px">Шанс достичь цели</div>
              <div class="scorebar" style="height:12px"><span style="width:${p}%;background:${p>=60?"#22c55e":p>=30?"#f59e0b":"#ef4444"}"></span></div>
              <div style="text-align:right;font-weight:800;margin-top:4px">${p}%</div></div>`:""}
          </div></div>`
        : `<div class="empty" style="padding:24px"><div class="big">📈</div>${esc(s.note||"Недостаточно данных")}</div>`}
    </div>`;
  }).join("") + `</div>`;
}

/* ===================== PLAN ===================== */
/* ---- line chart (динамика баллов) ---- */
function lineChart(points, { w = 480, h = 170, color = "#6d3bf5" } = {}) {
  if (!points.length) return `<div class="empty" style="padding:24px">Нет данных для графика</div>`;
  const pl = 30, pr = 12, pt = 12, pb = 26, iw = w - pl - pr, ih = h - pt - pb, n = points.length;
  const X = i => pl + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = v => pt + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const grid = [0, 50, 100].map(g => `<line x1="${pl}" y1="${Y(g)}" x2="${w-pr}" y2="${Y(g)}" stroke="#eef0f5"/><text x="2" y="${Y(g)+3}" font-size="9" fill="#aab">${g}</text>`).join("");
  const path = points.map((p, i) => `${i ? "L" : "M"} ${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(" ");
  const area = `M ${X(0)} ${Y(0)} ` + points.map((p, i) => `L ${X(i)} ${Y(p.value)}`).join(" ") + ` L ${X(n-1)} ${Y(0)} Z`;
  const dots = points.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.value)}" r="4" fill="#fff" stroke="${color}" stroke-width="2.5"/>
    <text x="${X(i)}" y="${Y(p.value)-9}" font-size="10" font-weight="700" fill="${color}" text-anchor="middle">${p.value}</text>
    <text x="${X(i)}" y="${h-8}" font-size="9" fill="#889" text-anchor="middle">${esc(p.label)}</text>`).join("");
  return `<svg width="100%" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${color}" stop-opacity="0.18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#lg)"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

const PLAN_KIND = {
  quick_win: { ic: "⚡", label: "Быстрая победа", cls: "GREEN" },
  topic: { ic: "🎯", label: "Ключевая тема", cls: "YELLOW" },
  weak: { ic: "🔴", label: "Слабое место", cls: "RED" },
};

async function scrPlan() {
  loading();
  const [subs, plans] = await Promise.all([
    api("GET", "/profile/subjects").catch(() => []),
    api("GET", "/study-plan").catch(() => []),
  ]);
  const active = plans.filter(p => p.status === "ACTIVE");
  screen().innerHTML = `
    <div class="card" style="margin-bottom:18px">
      <h3>🗓 План подготовки</h3>
      <p style="color:var(--mut);margin-top:-6px">План строится автоматически из ваших пробников и практики: сначала быстрые победы, затем ключевые темы, потом слабые места. Обновляется после каждого ответа.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="margin:0;flex:1;min-width:200px"><label>Пересобрать по предмету</label>
          <select id="planSub">${subs.map(s => `<option value="${s.subjectId}">${esc(s.subject?.name||"")}</option>`).join("")}</select></div>
        <button class="btn" id="genPlan">Обновить план</button>
      </div>
    </div>
    <div id="plans"></div>`;
  $("#genPlan").onclick = async () => {
    const sid = $("#planSub").value, btn = $("#genPlan");
    btn.disabled = true; btn.innerHTML = `<span class="spinner" style="border-top-color:#fff"></span> Считаю…`;
    try {
      const r = await api("POST", "/study-plan/generate", { subjectId: sid });
      if (r.created === false) toast("Недостаточно данных", "Решите пробник или прорешайте задания", "warn");
      else toast("План обновлён!", "", "ok");
      scrPlan();
    } catch (e) { toast("Ошибка", e.message, "err"); btn.disabled = false; btn.textContent = "Обновить план"; }
  };
  renderPlanDays($("#plans"), active);
}
function renderPlanDays(el, active) {
  if (!active.length) {
    el.innerHTML = `<div class="card"><div class="empty"><div class="big">🗓</div>
      <div style="font-weight:700;margin-bottom:6px">Плана пока нет</div>
      <div style="margin-bottom:16px">Решите полный пробник или введите результат прошлого — и план построится автоматически.</div>
      <button class="btn" id="toMock">Перейти к пробникам</button></div></div>`;
    el.querySelector("#toMock").onclick = () => go("mock");
    return;
  }
  el.innerHTML = active.map(p => `
    <div class="card" style="margin-bottom:16px">
      <h3>📘 ${esc(p.subject?.name||"Предмет")} <span class="tag">${p.days.length} шагов${p.targetScore?(" • цель "+p.targetScore):""}</span></h3>
      <div class="grid" style="gap:12px">
        ${p.days.map((d, i) => {
          const k = PLAN_KIND[d.kind] || { ic: "📌", label: "Шаг", cls: "GRAY" };
          const isTopic = d.kind === "topic";
          const target = isTopic
            ? { subjectId: p.subjectId, topicId: (d.topics || [])[0] }
            : { subjectId: p.subjectId, taskId: (d.tasks || [])[0], topicId: (d.topics || [])[0] };
          return `
          <div class="list-row" style="border:1.5px solid var(--line);border-radius:12px;padding:14px;border-left:4px solid var(${d.kind==="quick_win"?"--green":d.kind==="topic"?"--yellow":"--red"})">
            <div class="badge" style="background:#f6f5fd">${k.ic}</div>
            <div class="body">
              <div class="t">${i+1}. ${esc(d.title)} <span class="chip ${k.cls}" style="margin-left:6px">${k.label}</span></div>
              <div class="d">${esc(d.note||"")}</div>
            </div>
            <button class="btn sm ghost" data-target='${encodeURIComponent(JSON.stringify(target))}'>${isTopic ? "Тренироваться по теме" : "Решать задание"}</button>
          </div>`;
        }).join("")}
      </div>
    </div>`).join("");
  el.querySelectorAll("[data-target]").forEach(b => b.onclick = () => goPractice(JSON.parse(decodeURIComponent(b.dataset.target))));
}

/* ===================== MOCK (полные пробники) ===================== */
let mockSubject = null;
async function scrMock() {
  loading();
  const subs = await api("GET", "/profile/subjects").catch(() => []);
  if (!subs.length) { screen().innerHTML = `<div class="card"><div class="empty">Нет выбранных предметов</div></div>`; return; }
  if (!mockSubject || !subs.find(s => s.subjectId === mockSubject)) mockSubject = subs[0].subjectId;
  screen().innerHTML = `
    <div class="card" style="margin-bottom:18px"><h3>🧪 Полный пробник</h3>
      <p style="color:var(--mut);margin-top:-6px">Только полные варианты в формате экзамена. Результат формирует ваш план подготовки.</p>
      <div class="pick-grid" id="msubs" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))"></div>
    </div>
    <div id="mvariants"></div>
    <div class="section-title">История пробников</div>
    <div class="card" id="mhistory"></div>`;
  $("#msubs").innerHTML = subs.map(s => `<div class="pick ${s.subjectId===mockSubject?"on":""}" data-sid="${s.subjectId}"><div class="nm">${esc(s.subject?.name||"")}</div></div>`).join("");
  $("#msubs").querySelectorAll("[data-sid]").forEach(c => c.onclick = () => { mockSubject = c.dataset.sid; scrMock(); });
  loadVariants(); loadHistory();
}
async function loadVariants() {
  const mocks = await api("GET", `/mock-exams?subjectId=${mockSubject}`).catch(() => []);
  $("#mvariants").innerHTML = `<div class="card" style="margin-bottom:18px"><h3>📄 Доступные варианты</h3>
    ${mocks.length ? mocks.map(m => `<div class="list-row">
      <div class="badge">🧪</div>
      <div class="body"><div class="t">${esc(m.title)}</div><div class="d">${m.tasks.length} заданий • макс. ${m.maxPrimaryScore} б.</div></div>
      <button class="btn sm" data-take='${encodeURIComponent(JSON.stringify(m))}'>Решать</button>
      <button class="btn sm ghost" data-manual='${encodeURIComponent(JSON.stringify(m))}'>Ввести результат</button>
    </div>`).join("") : `<div class="empty">Вариантов нет</div>`}</div>`;
  $("#mvariants").querySelectorAll("[data-take]").forEach(b => b.onclick = () => takeMock(JSON.parse(decodeURIComponent(b.dataset.take))));
  $("#mvariants").querySelectorAll("[data-manual]").forEach(b => b.onclick = () => manualMock(JSON.parse(decodeURIComponent(b.dataset.manual))));
}
async function loadHistory() {
  const hist = await api("GET", `/mock-exams/history?subjectId=${mockSubject}`).catch(() => []);
  const el = $("#mhistory");
  if (!hist.length) { el.innerHTML = `<div class="empty"><div class="big">📈</div>Пока нет решённых пробников по этому предмету.</div>`; return; }
  const points = hist.map((h, i) => ({ label: new Date(h.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), value: h.testScore ?? 0 }));
  el.innerHTML = `
    <div style="margin-bottom:6px;font-weight:700">Динамика тестового балла</div>
    ${lineChart(points)}
    <div style="margin-top:14px">${hist.slice().reverse().map(h => `<div class="list-row">
      <div class="badge">📄</div>
      <div class="body"><div class="t">${esc(h.title)}</div><div class="d">${new Date(h.date).toLocaleDateString("ru-RU")} • ${h.primaryScore}/${h.maxPrimaryScore} первичных</div></div>
      <div style="font-weight:800;font-size:18px;color:var(--brand2)">${h.testScore}%</div>
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
      <p style="color:var(--mut);margin-top:-6px">Ответьте на задания и нажмите «Завершить». Посчитаем балл, слабые темы и обновим план.</p>
      <div id="mtasks"></div>
      <button class="btn" id="finish" style="margin-top:8px">Завершить пробник</button>
      <div id="mres" style="margin-top:18px"></div>
    </div>`;
  $("#back").onclick = () => scrMock();
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
      <p style="color:var(--mut);margin-top:-6px">Введите свой балл за каждое задание прошлого пробника — построим план без перерешивания.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px" id="mscores"></div>
      <button class="btn" id="save" style="margin-top:14px">Сохранить и построить план</button>
      <div id="mres" style="margin-top:18px"></div>
    </div>`;
  $("#back").onclick = () => scrMock();
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
  el.innerHTML = `<div class="card" style="box-shadow:none;border:1.5px solid var(--line)">
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
      ${donut(pct, { center: `${r.primaryScore}/${mock.maxPrimaryScore}`, color: "#6d3bf5" })}
      <div><div style="font-weight:800;font-size:19px">Результат пробника</div>
        <div style="color:var(--mut)">Первичный балл: <b>${r.primaryScore}</b> из ${mock.maxPrimaryScore}${r.testScore!=null?` • тестовый: <b>${r.testScore}</b>`:""}</div>
        <div class="pill-stat" style="margin-top:10px">Слабых тем выявлено: ${r.weakTopics?.length||0}</div>
        <button class="btn sm" id="toPlan" style="margin-top:12px">Посмотреть план</button>
      </div></div></div>`;
  el.querySelector("#toPlan").onclick = () => go("plan");
}

/* ===================== PROFILE ===================== */
async function scrProfile() {
  loading();
  const [profile, subs, sub] = await Promise.all([
    api("GET", "/profile").catch(() => null),
    api("GET", "/profile/subjects").catch(() => []),
    api("GET", "/subscription").catch(() => null),
  ]);
  screen().innerHTML = `
    <div class="grid g2">
      <div class="card"><h3>👤 Аккаунт</h3>
        <div class="list-row"><div class="badge">📧</div><div class="body"><div class="t">${esc(S.user?.email||"")}</div><div class="d">${esc(S.user?.role||"STUDENT")}</div></div></div>
        <div class="list-row"><div class="badge">🎓</div><div class="body"><div class="t">${profile?.examType||"—"} • ${profile?.grade||"—"} класс</div><div class="d">трек подготовки</div></div></div>
        <div class="field" style="margin-top:14px"><label>Минут в день на учёбу</label><input id="pmin" type="number" value="${profile?.dailyMinutes||60}"></div>
        <div class="field"><label>Дата экзамена</label><input id="pdate" type="date" value="${profile?.examDate?profile.examDate.slice(0,10):""}"></div>
        <button class="btn sm" id="saveProf">Сохранить</button>
      </div>
      <div class="card"><h3>💳 Подписка <span class="tag">${sub?.planName||"FREE"}</span></h3>
        <div class="list-row"><div class="badge">⚡</div><div class="body"><div class="t">${sub?.limits?.aiChecksPerDay>=0?sub.limits.aiChecksPerDay:"∞"} ИИ-проверок в день</div><div class="d">статус: ${sub?.status||"TRIAL"}</div></div></div>
        <div class="section-title" style="margin-top:18px">Мои предметы и цели</div>
        ${subs.map(s => `<div class="list-row"><div class="badge">📘</div><div class="body"><div class="t">${esc(s.subject?.name||"")}</div><div class="d">цель: ${s.targetScore??"—"} б.${s.currentScore!=null?` • текущий: ${s.currentScore}`:""}</div></div></div>`).join("")}
        <button class="btn ghost sm" id="logout" style="margin-top:18px">Выйти из аккаунта</button>
      </div>
    </div>`;
  $("#saveProf").onclick = async () => {
    try {
      const body = { dailyMinutes: +$("#pmin").value };
      const d = $("#pdate").value; if (d) body.examDate = new Date(d).toISOString();
      await api("PATCH", "/profile", body); toast("Сохранено", "", "ok");
    } catch (e) { toast("Ошибка", e.message, "err"); }
  };
  $("#logout").onclick = () => logout();
}

/* ===================== start ===================== */
boot();
