import { api, token, setToken } from "./api.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icons = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  alerts:
    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  settings:
    '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  camera:
    '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  move: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
};
const state = {
  view: "home",
  parent: null,
  highlight: null,
  locations: [],
  items: [],
  products: [],
  me: null,
  insights: null,
  edit: false,
  query: "",
  prefill: null,
  load: 0,
};
const actionNames = {
  receive: "등록",
  consume: "사용",
  discard: "폐기",
  move: "이동",
  adjust: "수량 정정",
  undo: "되돌리기",
};
const tabs = [
  ["home", "우리집"],
  ["search", "찾기"],
  ["add", "등록"],
  ["alerts", "알림"],
  ["settings", "설정"],
];
let toastTimer, cameraStream, cameraTimer, refreshedAt = 0;
// popover는 모달 시트와 같은 최상위 레이어라 시트가 열려 있어도 위에 보인다.
// 다시 열어야 가장 나중 레이어로 올라온다. 미지원 브라우저는 class로 표시
function toast(message, action = null) {
  const t = $("#toast");
  t.innerHTML =
    esc(message) +
    (action ? `<button class="toast-action">${esc(action.label)}</button>` : "");
  const hide = () => (t.hidePopover ? t.hidePopover() : t.classList.remove("show"));
  if (action)
    t.querySelector("button").onclick = () => {
      clearTimeout(toastTimer);
      hide();
      action.run();
    };
  if (t.showPopover) {
    if (t.matches(":popover-open")) t.hidePopover();
    t.showPopover();
  } else t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 7000 : 4000);
}
function errorHTML(e) {
  return `<div class="note error" role="alert">${esc(e.message)}</div>`;
}
function empty(text) {
  return `<div class="empty">${text}</div>`;
}
function field(label, name, value = "", type = "text", extra = "") {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
// label로 감싸면 첫 버튼이 라벨 대상이 되므로 div + aria-labelledby를 쓴다
function stepper(label, name, value, min, max) {
  return `<div class="field"><span id="label-${name}">${label}</span><div class="stepper"><button type="button" data-step="-1" aria-label="${label} 줄이기">−</button><input name="${name}" type="number" inputmode="numeric" value="${value}" min="${min}" max="${max}" step="1" required aria-labelledby="label-${name}"><button type="button" data-step="1" aria-label="${label} 늘리기">+</button></div></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-step]");
  if (!b) return;
  const input = b.parentElement.querySelector("input");
  const next = (Number(input.value) || 0) + Number(b.dataset.step);
  input.value = Math.min(Number(input.max), Math.max(Number(input.min), next));
});
function options(selected, omit = null) {
  return state.locations
    .filter((l) => l.id !== omit)
    .map(
      (l) =>
        `<option value="${l.id}" ${l.id === Number(selected) ? "selected" : ""}>${esc(l.path)}</option>`,
    )
    .join("");
}
function stopCamera() {
  clearTimeout(cameraTimer);
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
}
$("#dialog").addEventListener("close", stopCamera);
// 바깥(backdrop)을 누르면 닫는다. 시트 안쪽 여백 클릭은 무시
$("#dialog").addEventListener("click", (e) => {
  const d = e.currentTarget,
    r = d.getBoundingClientRect();
  if (
    e.target === d &&
    (e.clientY < r.top ||
      e.clientY > r.bottom ||
      e.clientX < r.left ||
      e.clientX > r.right)
  )
    d.close();
});
function modal(title, html) {
  stopCamera();
  const d = $("#dialog");
  d.innerHTML = `<div class="grabber"></div><div class="dialog-top"><h2>${title}</h2><button class="icon-btn" id="close-dialog" aria-label="닫기">${svg(icons.close)}</button></div>${html}`;
  $("#close-dialog").onclick = () => d.close();
  if (!d.open) d.showModal();
}
async function submit(form, task) {
  form.querySelector("button[type=submit]").disabled = true;
  form.querySelector(".form-error")?.remove();
  try {
    await task();
  } catch (e) {
    form.insertAdjacentHTML(
      "beforeend",
      `<div class="form-error">${errorHTML(e)}</div>`,
    );
  } finally {
    const b = form.querySelector("button[type=submit]");
    if (b) b.disabled = false;
  }
}
window.addEventListener("signed-out", () => {
  state.load++;
  stopCamera();
  $("#dialog").close();
  auth();
});
function auth(mode = "login") {
  $("#app").innerHTML =
    `<div class="auth-wrap"><div class="panel auth-card"><div class="brand">우리집<small>HOME DIGITAL TWIN</small></div><h1>${mode === "login" ? "내 집으로 들어가기" : "함께 쓸 집 만들기"}</h1><p class="muted">물건이 있는 자리부터, 다시 필요한 날까지.</p><form id="auth-form">${field("이메일", "email", "", "email", 'required autocomplete="email" inputmode="email"')}${field("비밀번호", "password", "", "password", `required minlength="8" autocomplete="${mode === "login" ? "current-password" : "new-password"}"`)}${mode === "signup" ? field("우리집 이름", "household_name", "우리집", "text", 'required maxlength="100"') + field("가족 초대 코드 · 있는 경우", "invite_code", "", "text", 'autocomplete="off" autocapitalize="characters"') : ""}<button type="submit" class="primary">${mode === "login" ? "로그인" : "가입하기"}</button><p class="guide">서버가 쉬고 있었다면 첫 연결에 시간이 걸릴 수 있어요.</p></form><button id="switch-auth" class="quiet">${mode === "login" ? "처음이신가요? 가입하기" : "이미 계정이 있나요? 로그인"}</button></div></div>`;
  $("#switch-auth").onclick = () => auth(mode === "login" ? "signup" : "login");
  $("#auth-form").onsubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(form, async () => {
      const d = Object.fromEntries(new FormData(form));
      const result = await api(
        `/auth/${mode}`,
        mode === "login"
          ? {
              method: "POST",
              form: { username: d.email, password: d.password },
              timeout: 65000,
            }
          : {
              method: "POST",
              body: { ...d, invite_code: d.invite_code || null },
              timeout: 65000,
            },
      );
      setToken(result.access_token);
      state.parent = null;
      state.query = "";
      state.highlight = null;
      state.view = "home";
      await boot();
    });
  };
}
async function refresh() {
  const [me, locations, items, products, insights] = await Promise.all([
    api("/me"),
    api("/locations"),
    api("/items"),
    api("/products"),
    api("/insights"),
  ]);
  Object.assign(state, { me, locations, items, products, insights });
  refreshedAt = Date.now();
}
async function boot() {
  $("#app").innerHTML =
    '<div class="auth-wrap"><div class="panel auth-card"><h2>우리집을 불러오고 있어요</h2><p class="muted">서버와 연결 중입니다.</p></div></div>';
  try {
    await refresh();
    shell();
    render();
  } catch (e) {
    if (!token()) return auth();
    $("#app").innerHTML =
      `<div class="auth-wrap"><div class="panel auth-card">${errorHTML(e)}<div class="row" style="margin-top:14px"><button id="retry" class="primary grow">다시 연결</button><button id="exit">로그아웃</button></div></div></div>`;
    $("#retry").onclick = boot;
    $("#exit").onclick = () => {
      setToken(null);
      auth();
    };
  }
}
function alertCount() {
  return (
    state.insights.expiry.length +
    state.insights.forecasts.filter((f) => f.buy).length
  );
}
function shell() {
  const n = alertCount();
  $("#app").innerHTML =
    `<div class="layout"><nav class="tabbar" aria-label="주요 메뉴"><div class="brand">우리집<small>HOME DIGITAL TWIN</small></div>${tabs
      .map(
        ([v, l]) =>
          `<button class="tab tab-${v}" data-nav="${v}"><span class="ico">${svg(icons[v])}</span><span>${l}</span>${v === "alerts" && n ? `<span class="count" aria-label="확인할 알림 ${n}개">${n}</span>` : ""}</button>`,
      )
      .join("")}</nav><main class="main"><div id="view"></div></main></div>`;
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.nav)));
}
function navigate(view) {
  state.view = view;
  state.load++;
  render();
  window.scrollTo(0, 0);
}
function render() {
  document.querySelectorAll("[data-nav]").forEach((b) => {
    const on = b.dataset.nav === state.view;
    b.classList.toggle("active", on);
    on
      ? b.setAttribute("aria-current", "page")
      : b.removeAttribute("aria-current");
  });
  ({
    home: homeView,
    search: searchView,
    add: addView,
    alerts: alertsView,
    settings: settingsView,
  })[state.view]();
}
async function reloadView() {
  await refresh();
  shell();
  render();
}
// 홈 화면 앱은 메모리에 오래 남는다. 다시 열면 가족이 바꾼 재고와 알림을 가져온다
// (입력 중인 등록 화면·시트는 건드리지 않는다)
document.addEventListener("visibilitychange", () => {
  if (
    document.hidden ||
    !state.me ||
    !token() ||
    $("#dialog").open ||
    state.view === "add" ||
    Date.now() - refreshedAt < 30000
  )
    return;
  const y = scrollY;
  reloadView()
    .then(() => scrollTo(0, y))
    .catch(() => {});
});
// 서버는 UTC로 저장한다. SQLite는 시간대 표시를 잃으므로 없으면 UTC로 본다
function localTime(iso) {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function heading(eyebrow, title, extra = "") {
  return `<header class="heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>${extra}</header>`;
}
function descendants(id) {
  const set = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    state.locations.forEach((l) => {
      if (set.has(l.parent_id) && !set.has(l.id)) {
        set.add(l.id);
        changed = true;
      }
    });
  }
  return set;
}
function badge(item) {
  if (!item.expiry_date) return "";
  const days = Math.round(
    (Date.parse(item.expiry_date + "T00:00:00Z") -
      Date.parse(state.insights.as_of + "T00:00:00Z")) /
      86400000,
  );
  return `<span class="badge ${days < 0 ? "red" : days <= state.me.expiry_days ? "warn" : ""}">${days < 0 ? `만료 ${-days}일` : days === 0 ? "오늘까지" : `D-${days}`}</span>`;
}
function itemHTML(it) {
  return `<article class="item"><button class="item-main" data-item="${it.id}"><span class="item-title"><span class="name">${esc(it.name)}</span>${badge(it)}</span><span class="item-sub">${esc(it.location_path)}</span></button><span class="qty">${it.quantity}<small>${esc(it.unit)}</small></span><button class="use" data-action="${it.id}:consume" aria-label="${esc(it.name)} 사용 기록">사용</button></article>`;
}
function bindItems(root = $("#view")) {
  root
    .querySelectorAll("[data-item]")
    .forEach((b) => (b.onclick = () => itemSheet(Number(b.dataset.item))));
  root.querySelectorAll("[data-action]").forEach(
    (b) =>
      (b.onclick = () => {
        const [id, action] = b.dataset.action.split(":");
        itemDialog(Number(id), action);
      }),
  );
}
function itemSheet(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  modal(
    esc(it.name),
    `<p class="muted" style="margin:0">${esc(it.location_path)}</p><div class="row" style="margin-top:10px"><span class="qty">${it.quantity}<small>${esc(it.unit)}</small></span>${badge(it)}${it.expiry_date ? `<small>유통기한 ${esc(it.expiry_date)}</small>` : ""}</div><div class="sheet-actions"><button class="primary" data-sheet="consume">사용했어요</button><button data-sheet="move">${svg(icons.move)}옮기기</button><button data-sheet="find">${svg(icons.pin)}위치 보기</button><button data-sheet="adjust">${svg(icons.edit)}수량 정정</button><button class="danger" data-sheet="discard">${svg(icons.trash)}폐기</button></div>`,
  );
  document.querySelectorAll("[data-sheet]").forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.sheet !== "find") return itemDialog(id, b.dataset.sheet);
        // 보관 칸이 들어 있는 상위 공간을 열고 그 칸을 강조한다
        const l = state.locations.find((x) => x.id === it.location_id);
        $("#dialog").close();
        state.parent = l?.parent_id ?? null;
        state.highlight = it.location_id;
        state.edit = false;
        navigate("home");
      }),
  );
}
function homeView() {
  const parent = state.locations.find((l) => l.id === state.parent);
  if (state.parent && !parent) state.parent = null;
  const children = state.locations.filter((l) => l.parent_id === state.parent),
    ids = state.parent
      ? descendants(state.parent)
      : new Set(state.locations.map((l) => l.id));
  const shown = state.items.filter((i) => ids.has(i.location_id));
  const crumbs = [];
  let c = parent;
  while (c) {
    crumbs.unshift(c);
    c = state.locations.find((l) => l.id === c.parent_id);
  }
  const expiring = state.insights.expiry.length;
  $("#view").innerHTML =
    `${heading(esc(state.me.household_name), parent ? esc(parent.name) : "집 안을 한눈에")}${parent ? "" : `<div class="stats"><div class="stat"><span>공간</span><b>${state.locations.length}</b></div><div class="stat"><span>보관 중인 상품</span><b>${new Set(state.items.map((i) => i.product_id)).size}</b></div><button class="stat ${expiring ? "warn" : ""}" data-go="alerts"><span>유통기한 확인</span><b>${expiring}</b></button></div>`}<div class="grid"><section class="panel"><div class="map-head"><nav class="crumbs" aria-label="공간 경로"><button data-parent="">우리집</button>${crumbs.map((l) => `<span>›</span><button data-parent="${l.id}">${esc(l.name)}</button>`).join("")}</nav><div class="row" style="flex-wrap:nowrap"><button id="edit-map" class="small ${state.edit ? "primary" : ""}">${state.edit ? "완료" : "배치"}</button><button id="new-space" class="small">${svg(icons.add)}공간</button></div></div><div class="map ${state.edit ? "edit" : ""}" id="map">${children
      .map((l) => {
        const set = descendants(l.id),
          count = state.items
            .filter((i) => set.has(i.location_id))
            .reduce((a, i) => a + i.quantity, 0);
        return `<button class="space ${l.kind} ${state.highlight === l.id ? "found" : ""}" data-space="${l.id}" style="left:${l.x * 5}%;top:${l.y * 5}%;width:${l.width * 5}%;height:${l.height * 5}%" aria-label="${esc(l.name)}, 물건 ${count}개"><strong>${esc(l.name)}</strong><small>${count}개</small>${state.edit ? '<span class="handle" data-resize></span>' : ""}</button>`;
      })
      .join(
        "",
      )}${!children.length ? `<div class="empty map-empty">${state.edit ? "빈 곳을 손가락으로 끌어<br>공간을 그려 보세요." : parent ? "이 공간 안에 서랍이나 칸을<br>더 나눌 수 있어요." : "아직 집이 비어 있어요.<br>‘배치’를 누르고 빈 곳을 끌어 방을 그려 보세요."}</div>` : ""}<span class="map-label">${state.edit ? "편집 중" : "공간 배치도 · 실제 치수와 다를 수 있음"}</span></div><p class="guide">${state.edit ? "빈 곳을 끌면 새 공간 · 공간을 끌면 이동 · 오른쪽 아래 모서리를 끌면 크기 · 탭하면 설정" : "공간을 누르면 안으로 들어갑니다. 방 → 가구 → 수납 칸"}</p>${parent ? `<div class="row" style="margin-top:14px"><button id="register-here" class="primary grow">${svg(icons.add)}여기에 물건 넣기</button><button id="space-settings">공간 설정</button></div>` : ""}</section><section class="panel list-panel"><div class="row spread"><h2 style="margin:0">${parent ? "이곳의 물건" : "모든 물건"}</h2><span class="muted">${shown.length}개 항목</span></div>${shown.length ? shown.map(itemHTML).join("") : empty("물건을 등록하면 이곳에 표시됩니다.")}</section></div>`;
  $(".crumbs").scrollLeft = 1e4;
  $("#new-space").onclick = () => locationDialog();
  $("#edit-map").onclick = () => {
    state.edit = !state.edit;
    homeView();
  };
  document
    .querySelectorAll("[data-go]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.go)));
  document.querySelectorAll("[data-parent]").forEach(
    (b) =>
      (b.onclick = () => {
        state.parent = b.dataset.parent ? Number(b.dataset.parent) : null;
        homeView();
      }),
  );
  if (state.edit) bindDraw($("#map"));
  document.querySelectorAll("[data-space]").forEach((b) => {
    if (state.edit) bindDrag(b);
    else
      b.onclick = () => {
        state.parent = Number(b.dataset.space);
        state.highlight = null;
        homeView();
      };
  });
  if (parent) {
    $("#space-settings").onclick = () => locationDialog(parent);
    $("#register-here").onclick = () => navigate("add");
  }
  bindItems();
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  snap = (v) => Math.round(v * 2) / 2; // 0.5칸 단위
// 배치도(20×20칸) 안의 포인터 위치를 칸 단위로
function gridPoint(e, rect) {
  return {
    x: clamp(((e.clientX - rect.left) / rect.width) * 20, 0, 20),
    y: clamp(((e.clientY - rect.top) / rect.height) * 20, 0, 20),
  };
}
// 공간을 끌면 이동, 모서리 핸들을 끌면 크기 조절, 그냥 탭하면 설정
function bindDrag(button) {
  let start = null,
    moved = false;
  button.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const l = state.locations.find(
      (x) => x.id === Number(button.dataset.space),
    );
    const rect = $("#map").getBoundingClientRect();
    start = {
      p: gridPoint(e, rect),
      l: { ...l },
      rect,
      resize: !!e.target.closest("[data-resize]"),
    };
    moved = false;
    button.setPointerCapture(e.pointerId);
  };
  button.onpointermove = (e) => {
    if (!start) return;
    const p = gridPoint(e, start.rect),
      dx = p.x - start.p.x,
      dy = p.y - start.p.y,
      { l } = start;
    // 손가락 떨림(약 6px)은 탭으로 본다
    if (!moved && Math.hypot(dx, dy) * (start.rect.width / 20) < 6) return;
    moved = true;
    if (start.resize) {
      button.style.width = clamp(snap(l.width + dx), 1, 20 - l.x) * 5 + "%";
      button.style.height = clamp(snap(l.height + dy), 1, 20 - l.y) * 5 + "%";
    } else {
      button.style.left = clamp(snap(l.x + dx), 0, 20 - l.width) * 5 + "%";
      button.style.top = clamp(snap(l.y + dy), 0, 20 - l.height) * 5 + "%";
    }
  };
  button.onpointercancel = () => {
    start = null;
    homeView();
  };
  button.onpointerup = async () => {
    if (!start) return;
    const { l, resize } = start;
    start = null;
    if (!moved) return locationDialog(l);
    const pct = (k) => parseFloat(button.style[k]) / 5;
    const data = {
      ...l,
      x: pct("left"),
      y: pct("top"),
      width: pct("width"),
      height: pct("height"),
    };
    try {
      await api(`/locations/${l.id}`, { method: "PUT", body: data });
      await reloadView();
      toast(resize ? "크기를 저장했어요" : "위치를 저장했어요");
    } catch (e) {
      toast(e.message);
      homeView();
    }
  };
}
// 빈 곳을 끌면 사각형을 그리고, 놓으면 이름만 묻는다(1칸 단위로 맞춤)
function bindDraw(map) {
  let start = null,
    ghost = null;
  const box = (e) => {
    const p = gridPoint(e, start.rect),
      x = Math.floor(Math.min(start.p.x, p.x)),
      y = Math.floor(Math.min(start.p.y, p.y));
    return {
      x,
      y,
      width: Math.max(1, Math.ceil(Math.max(start.p.x, p.x)) - x),
      height: Math.max(1, Math.ceil(Math.max(start.p.y, p.y)) - y),
    };
  };
  map.onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest("[data-space]")) return;
    const rect = map.getBoundingClientRect(),
      p = gridPoint(e, rect);
    start = { rect, p: { x: Math.min(p.x, 19.99), y: Math.min(p.y, 19.99) } };
    ghost = document.createElement("div");
    ghost.className = "ghost";
    map.append(ghost);
    map.setPointerCapture(e.pointerId);
  };
  map.onpointermove = (e) => {
    if (!start) return;
    const b = box(e);
    Object.assign(ghost.style, {
      left: b.x * 5 + "%",
      top: b.y * 5 + "%",
      width: b.width * 5 + "%",
      height: b.height * 5 + "%",
    });
  };
  map.onpointerup = (e) => {
    if (!start) return;
    const b = box(e);
    start = null;
    ghost.remove();
    if (b.width * b.height < 2)
      return toast("빈 곳을 끌어서 공간 크기만큼 그려 주세요");
    locationDialog(null, b);
  };
  map.onpointercancel = () => {
    start = null;
    ghost?.remove();
  };
}
const kinds = { room: "방", furniture: "가구", storage: "수납 칸" };
// 최상위는 방, 방 안은 가구, 그 안은 수납 칸
function kindFor(parentId) {
  const p = state.locations.find((l) => l.id === parentId);
  return !p ? "room" : p.kind === "room" ? "furniture" : "storage";
}
// 형제 공간과 겹치지 않는 첫 빈자리(위→아래, 왼→오). 꽉 차면 점점 작게 찾는다
function freeSpot(parentId, omit = null) {
  const sibs = state.locations.filter(
    (l) => l.parent_id === parentId && l.id !== omit,
  );
  for (const [w, h] of [
    [8, 6],
    [6, 4],
    [4, 3],
    [2, 2],
  ])
    for (let y = 0; y + h <= 20; y++)
      for (let x = 0; x + w <= 20; x++)
        if (
          !sibs.some(
            (s) =>
              x < s.x + s.width &&
              s.x < x + w &&
              y < s.y + s.height &&
              s.y < y + h,
          )
        )
          return { x, y, width: w, height: h };
  return { x: 0, y: 0, width: 4, height: 3 };
}
function locationDialog(l = null, rect = null) {
  const parentId = l ? l.parent_id : state.parent,
    kind = l?.kind ?? kindFor(parentId),
    box = l ?? rect ?? freeSpot(parentId);
  modal(
    l ? "공간 설정" : `새 ${kinds[kind]}`,
    `<form id="location-form">${field("이름", "name", l?.name || "", "text", `required maxlength="100" placeholder="${{ room: "예: 주방", furniture: "예: 냉장고", storage: "예: 두 번째 칸" }[kind]}" ${l ? "" : "autofocus"}`)}<div class="form-grid"><label class="field">상위 공간<select name="parent_id"><option value="">우리집 (최상위)</option>${options(parentId, l?.id)}</select></label><label class="field">종류<select name="kind">${Object.entries(
      kinds,
    )
      .map(
        ([v, t]) =>
          `<option value="${v}" ${kind === v ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select></label></div><details class="coords"><summary>위치·크기 직접 입력</summary><div class="form-grid">${field("가로 위치 (0~19)", "x", box.x, "number", 'min="0" max="19" step="0.1" required inputmode="decimal"')}${field("세로 위치 (0~19)", "y", box.y, "number", 'min="0" max="19" step="0.1" required inputmode="decimal"')}${field("너비", "width", box.width, "number", 'min="0.5" max="20" step="0.1" required inputmode="decimal"')}${field("높이", "height", box.height, "number", 'min="0.5" max="20" step="0.1" required inputmode="decimal"')}</div><p class="guide" style="margin:0">배치도의 ‘배치’에서 끌어서 옮기고, 모서리로 크기를 바꿀 수도 있어요.</p></details><button class="primary" type="submit">저장</button>${l ? '<button class="danger quiet" type="button" id="delete-space" style="width:100%;margin-top:8px">공간 삭제</button>' : ""}</form>`,
  );
  const f = $("#location-form");
  // 새 공간의 상위를 바꾸면 종류와 빈자리를 다시 고른다(그린 사각형은 유지)
  if (!l)
    f.elements.parent_id.onchange = () => {
      const pid = f.elements.parent_id.value
        ? Number(f.elements.parent_id.value)
        : null;
      f.elements.kind.value = kindFor(pid);
      if (!rect)
        for (const [k, v] of Object.entries(freeSpot(pid))) f.elements[k].value = v;
    };
  // 바텀시트가 뜬 뒤 이름 칸으로 (autofocus만으로는 모바일에서 무시될 수 있음)
  if (!l) f.elements.name.focus();
  $("#location-form").onsubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(form, async () => {
      const d = Object.fromEntries(new FormData(form));
      for (const k of ["x", "y", "width", "height"]) d[k] = Number(d[k]);
      d.parent_id = d.parent_id ? Number(d.parent_id) : null;
      await api("/locations" + (l ? "/" + l.id : ""), {
        method: l ? "PUT" : "POST",
        body: d,
      });
      $("#dialog").close();
      await reloadView();
      toast("공간을 저장했어요");
    });
  };
  if (l)
    $("#delete-space").onclick = () => {
      modal(
        "공간 삭제",
        `<p>‘${esc(l.name)}’을 삭제할까요? 재고나 이력이 연결된 공간은 삭제할 수 없습니다.</p><button id="confirm-delete" class="danger sheet-cta">삭제하기</button>`,
      );
      $("#confirm-delete").onclick = async () => {
        try {
          await api(`/locations/${l.id}`, { method: "DELETE" });
          state.parent = l.parent_id;
          $("#dialog").close();
          await reloadView();
        } catch (e) {
          toast(e.message);
        }
      };
    };
}
function itemDialog(id, action) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  const adjust = action === "adjust";
  modal(
    `${esc(it.name)} · ${actionNames[action]}`,
    `<p class="muted">${esc(it.location_path)} · 현재 ${it.quantity}${esc(it.unit)}</p><form id="action-form">${stepper(adjust ? "실제 확인한 수량" : `수량 (${esc(it.unit)})`, "quantity", adjust ? it.quantity : 1, adjust ? 0 : 1, adjust ? 100000 : it.quantity)}${action === "move" ? `<label class="field">옮길 위치<select name="destination_id" required><option value="">선택하세요</option>${options(null, it.location_id)}</select></label>` : ""}${adjust ? '<label class="field">정정 이유<textarea name="note" required maxlength="300" placeholder="예: 실제 수량을 다시 세어 보니 3개"></textarea></label>' : ""}<p class="guide" style="margin:0 0 12px">${action === "consume" ? "실제로 사용한 수량만 기록해 주세요. 위치만 바꾸면 ‘옮기기’를 쓰세요." : action === "discard" ? "폐기는 소비 예측의 사용량에 포함되지 않습니다." : "변경 내역은 활동 기록에 남습니다."}</p><button type="submit" class="primary ${action === "discard" ? "danger" : ""}">${actionNames[action]} 기록</button></form>`,
  );
  $("#action-form").onsubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(form, async () => {
      const d = Object.fromEntries(new FormData(form));
      const r = await api(`/items/${id}/actions`, {
        method: "POST",
        body: {
          action,
          quantity: Number(d.quantity),
          destination_id: d.destination_id ? Number(d.destination_id) : null,
          note: d.note || "",
        },
      });
      $("#dialog").close();
      await reloadView();
      // 잘못 누른 '사용'은 예측을 틀어지게 하므로 바로 되돌릴 수 있게 한다
      toast(
        `${actionNames[action]} 기록 완료 · ${it.name}`,
        r.activity_id && {
          label: "되돌리기",
          run: () =>
            api(`/activity/${r.activity_id}/undo`, { method: "POST" })
              .then(reloadView)
              .then(() => toast(`되돌렸어요 · ${it.name}`))
              .catch((e) => toast(e.message)),
        },
      );
    });
  };
}
function searchView() {
  $("#view").innerHTML =
    `${heading("물건 찾기", "무엇을 찾으세요?")}<form class="search-bar" id="search-form" role="search">${svg(icons.search)}<input id="query" type="search" enterkeyhint="search" autocomplete="off" aria-label="물건 이름" placeholder="우유, 건전지, 여권…" value="${esc(state.query)}"></form><section class="panel" id="search-results"></section>`;
  const draw = () => {
    const q = state.query.trim().toLocaleLowerCase();
    const rows = state.items.filter((i) =>
      i.name.toLocaleLowerCase().includes(q),
    );
    $("#search-results").innerHTML = rows.length
      ? `<h2>${q ? `${rows.length}개를 찾았어요` : `전체 ${rows.length}개`}</h2>` +
        rows.map(itemHTML).join("")
      : empty(
          q
            ? "일치하는 물건이 없어요. 다른 이름으로 찾아보세요."
            : "아직 등록한 물건이 없어요.",
        );
    bindItems($("#search-results"));
  };
  // 엔터(검색)는 키보드만 내린다. 결과는 입력하는 동안 이미 갱신된다
  $("#search-form").onsubmit = (e) => {
    e.preventDefault();
    $("#query").blur();
  };
  $("#query").oninput = () => {
    state.query = $("#query").value;
    draw();
  };
  draw();
}
function addView() {
  const canScan = "BarcodeDetector" in window,
    photo = state.me.photo_enabled;
  $("#view").innerHTML =
    `${heading("등록", "물건을 제자리에")}<div class="add-form"><div class="quick">${canScan ? `<button type="button" id="camera-barcode">${svg(icons.scan)}바코드 스캔</button>` : ""}<button type="button" id="manual-barcode">${svg(icons.hash)}바코드 번호</button><label id="photo-tile" ${photo ? "" : 'aria-disabled="true"'}>${svg(icons.camera)}사진 인식<input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" ${photo ? "" : "disabled"}></label></div><div id="recognition-result"></div><section class="panel" style="margin-top:12px"><form id="item-form"><input type="hidden" name="product_id" value="">${field("물건 이름", "name", "", "text", 'required maxlength="150" list="product-names" autocomplete="off" enterkeyhint="next"')}<datalist id="product-names">${state.products.map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist><label class="field">보관 위치<select name="location_id" required><option value="">위치 선택</option>${options(state.parent)}</select></label><div id="suggestions"></div><div class="form-grid">${stepper("수량", "quantity", 1, 1, 100000)}${field("단위", "unit", "개", "text", 'required maxlength="20"')}</div>${field("유통기한 · 선택", "expiry_date", "", "date")}${field("바코드 · 선택", "barcode", "", "text", 'inputmode="numeric" pattern="[0-9]{8,14}" autocomplete="off"')}<p class="guide" style="margin:0 0 12px">같은 상품·위치·유통기한이면 수량을 합칩니다. 유통기한은 포장을 확인하세요.</p><button class="primary" type="submit" ${state.locations.length ? "" : "disabled"}>등록하기</button>${state.locations.length ? "" : '<p class="note">우리집 탭에서 보관할 공간을 먼저 만들어 주세요.</p>'}</form></section></div>`;
  const form = $("#item-form");
  let suggestionRequest = 0;
  form.elements.name.oninput = async () => {
    const request = ++suggestionRequest;
    if (
      form.dataset.identifiedName &&
      form.dataset.identifiedName !== form.elements.name.value.trim()
    ) {
      form.elements.barcode.value = "";
      delete form.dataset.identifiedName;
    }
    const p = state.products.find(
      (p) =>
        p.name.toLocaleLowerCase() ===
        form.elements.name.value.trim().toLocaleLowerCase(),
    );
    form.elements.product_id.value = p?.id || "";
    $("#suggestions").innerHTML = "";
    if (!p) return;
    form.elements.unit.value = p.unit;
    form.elements.barcode.value = p.barcode || "";
    form.dataset.identifiedName = p.name;
    try {
      const rows = await api(`/products/${p.id}/locations`);
      if (request !== suggestionRequest || !form.isConnected) return;
      $("#suggestions").innerHTML = rows.length
        ? '<small>자주 보관한 위치</small><div class="recommendations">' +
          rows
            .map(
              (r) =>
                `<button type="button" data-suggest="${r.location_id}">${esc(r.path)}<small>${esc(r.reason)}</small></button>`,
            )
            .join("") +
          "</div>"
        : "";
      document.querySelectorAll("[data-suggest]").forEach(
        (b) =>
          (b.onclick = () => {
            form.elements.location_id.value = b.dataset.suggest;
            document
              .querySelectorAll("[data-suggest]")
              .forEach((x) => x.classList.toggle("picked", x === b));
          }),
      );
    } catch (e) {
      toast(e.message);
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    submit(form, async () => {
      const d = Object.fromEntries(new FormData(form));
      await api("/items", {
        method: "POST",
        body: {
          ...d,
          product_id: d.product_id ? Number(d.product_id) : null,
          barcode: d.barcode || null,
          location_id: Number(d.location_id),
          quantity: Number(d.quantity),
          expiry_date: d.expiry_date || null,
        },
      });
      state.parent = Number(d.location_id);
      await refresh();
      shell();
      navigate("home");
      toast(`등록 완료 · ${d.name}`);
    });
  };
  $("#manual-barcode").onclick = () => {
    modal(
      "바코드 번호 조회",
      `<form id="barcode-form">${field("바코드 번호", "code", form.elements.barcode.value, "text", 'required inputmode="numeric" pattern="[0-9]{8,14}" autocomplete="off"')}<button type="submit" class="primary">상품 찾기</button></form>`,
    );
    $("#barcode-form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      submit(f, async () => {
        await lookupBarcode(f.elements.code.value);
        $("#dialog").close();
      });
    };
  };
  if (canScan) $("#camera-barcode").onclick = scanBarcode;
  // 장보기 목록의 '샀어요'에서 넘어오면 이름을 채우고 단위·추천 위치를 불러온다
  if (state.prefill) {
    form.elements.name.value = state.prefill.name;
    form.elements.name.dispatchEvent(new Event("input"));
    state.prefill = null;
  }
  if (!photo)
    $("#photo-tile").onclick = () =>
      toast("사진 인식 서버가 아직 연결되지 않았어요. 이름을 직접 입력해 주세요.");
  // 사진을 고르면 바로 인식한다. 결과는 확인 후 등록
  $("#photo").onchange = async (e) => {
    const input = e.currentTarget,
      file = input.files[0];
    input.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast("5MB 이하 사진을 선택하세요");
    $("#recognition-result").innerHTML =
      '<p class="note loading">사진을 확인하고 있어요…</p>';
    try {
      const r = await api("/recognize", {
        method: "POST",
        file,
        timeout: 100000,
      });
      if (!form.isConnected) return;
      form.elements.name.value = r.name;
      form.elements.product_id.value = "";
      form.elements.barcode.value = "";
      form.elements.expiry_date.value = "";
      delete form.dataset.identifiedName;
      if (r.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(r.expiry_date))
        form.elements.expiry_date.value = r.expiry_date;
      $("#recognition-result").innerHTML =
        `<p class="note">이름 제안: <b>${esc(r.name)}</b><br>${esc(r.note)}<br>이름과 날짜를 확인한 뒤 등록해 주세요.</p>`;
    } catch (e) {
      if ($("#recognition-result"))
        $("#recognition-result").innerHTML = errorHTML(e);
    }
  };
}
async function lookupBarcode(code) {
  const r = await api("/barcode/" + encodeURIComponent(code));
  const f = $("#item-form");
  if (!f) return;
  f.elements.barcode.value = r.barcode;
  f.elements.product_id.value = r.product_id || "";
  f.elements.name.value = r.name || "";
  f.dataset.identifiedName = r.name || "";
  if (r.unit) f.elements.unit.value = r.unit;
  if (r.name) f.elements.name.dispatchEvent(new Event("input"));
  toast(
    r.name
      ? `${r.name} · ${r.source}에서 찾았어요. 정보를 확인하세요.`
      : r.message,
  );
}
async function scanBarcode() {
  modal(
    "바코드 스캔",
    '<video id="scanner" autoplay muted playsinline></video><p class="guide">포장의 바코드를 화면 안에 맞춰 주세요. 인식되면 카메라가 꺼집니다.</p><div id="scan-status" role="status"></div>',
  );
  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    const supported = ["ean_13", "ean_8", "upc_a", "upc_e"].filter((f) =>
      formats.includes(f),
    );
    if (!supported.length)
      throw new Error(
        "지원하는 상품 바코드 형식이 없습니다. 번호로 조회해 주세요.",
      );
    const detector = new BarcodeDetector({ formats: supported });
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
    if (!$("#dialog").open) {
      stopCamera();
      return;
    }
    const video = $("#scanner");
    video.srcObject = cameraStream;
    await video.play();
    const tick = async () => {
      if (!cameraStream || !$("#dialog").open) return;
      try {
        const hits = await detector.detect(video);
        if (hits.length) {
          stopCamera();
          navigator.vibrate?.(40);
          $("#scan-status").textContent = "상품 정보를 찾고 있어요…";
          await lookupBarcode(hits[0].rawValue);
          $("#dialog").close();
          return;
        }
      } catch (e) {
        $("#scan-status").textContent = e.message;
        stopCamera();
        return;
      }
      cameraTimer = setTimeout(tick, 300);
    };
    tick();
  } catch (e) {
    stopCamera();
    $("#scan-status").textContent =
      "카메라를 사용할 수 없습니다. 권한을 확인하거나 번호로 조회하세요.";
  }
}
// 장바구니 체크는 매장에서만 쓰는 기기별 표시라 localStorage에 둔다
const SHOP_KEY = "twin_shop_checked";
function loadChecked() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHOP_KEY)) || []);
  } catch {
    return new Set();
  }
}
function saveChecked(set) {
  try {
    localStorage.setItem(SHOP_KEY, JSON.stringify([...set]));
  } catch {}
}
function buyReason(f) {
  return f.days_until_empty !== null
    ? `지금 속도라면 약 ${f.days_until_empty}일 후 떨어져요`
    : `최소 재고 ${f.minimum}${esc(f.unit)} 이하예요`;
}
// 폰에서는 공유 시트(카톡·문자), 지원하지 않으면 클립보드
async function share(text, copied) {
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      toast(copied);
    }
  } catch (e) {
    if (e.name !== "AbortError") toast("공유하지 못했어요. 직접 알려 주세요.");
  }
}
function alertsView() {
  const { expiry, forecasts } = state.insights;
  const buys = forecasts.filter((f) => f.buy);
  // 목록에서 빠진 상품(이미 등록함)의 체크는 정리한다
  const checked = new Set(
    [...loadChecked()].filter((id) => buys.some((f) => f.product_id === id)),
  );
  saveChecked(checked);
  $("#view").innerHTML =
    `${heading("알림", "먼저 확인할 것들", '<button id="refresh-alerts" class="small">새로고침</button>')}<div class="alert-grid"><section class="panel"><h2>유통기한 · ${state.me.expiry_days}일 이내</h2>${expiry.length ? expiry.map(itemHTML).join("") : empty("임박하거나 만료된 물건이 없어요.")}</section><section class="panel"><div class="row spread" style="margin-bottom:4px"><h2 style="margin:0">장보기 목록</h2>${buys.length ? '<button id="share-list" class="small">목록 보내기</button>' : ""}</div>${buys.length ? buys.map((f) => `<article class="shop-row"><label class="check"><input type="checkbox" data-check="${f.product_id}" ${checked.has(f.product_id) ? "checked" : ""}><span><strong>${esc(f.name)}</strong> <span class="badge warn">남은 ${f.usable}${esc(f.unit)}</span><small>${buyReason(f)}</small></span></label><button class="small" data-bought="${f.product_id}">샀어요</button></article>`).join("") : empty("지금은 살 것이 없어요.")}<p class="guide">장바구니에 담으면 체크하세요(이 기기에만 저장). 집에 와서 ‘샀어요’를 누르면 바로 등록할 수 있어요. 위치별 재고를 합산하고, 만료된 재고는 제외합니다.</p></section></div><section class="panel" style="margin-top:16px"><h2>소비 예측</h2>${forecasts.length ? forecasts.map((f) => `<article class="card-row"><div class="row spread"><strong>${esc(f.name)}</strong><span class="badge">${f.method === "ridge" ? "ML 예측" : f.method === "moving_average" ? "평균 소비량" : "기록 수집 중"}</span></div><small>${esc(f.reason)} · 관측 ${f.days_observed}일${f.daily_rate !== null ? ` · 하루 ${f.daily_rate}${esc(f.unit)}` : ""}</small>${f.validation_mae ? `<small>최근 7일 예측 오차(MAE): ML ${f.validation_mae.ridge} / 평균 ${f.validation_mae.baseline}</small>` : ""}<button class="small quiet" data-policy="${f.product_id}">상품·구매 기준 수정</button></article>`).join("") : empty("상품을 등록하고 사용을 기록하면 예측을 준비합니다.")}<p class="guide">기록되지 않은 사용은 알 수 없어요. 실제 재고와 다르면 수량 정정으로 맞춰 주세요.</p></section>`;
  bindItems();
  document.querySelectorAll("[data-check]").forEach(
    (c) =>
      (c.onchange = () => {
        const id = Number(c.dataset.check);
        c.checked ? checked.add(id) : checked.delete(id);
        saveChecked(checked);
      }),
  );
  document.querySelectorAll("[data-bought]").forEach(
    (b) =>
      (b.onclick = () => {
        state.prefill = state.products.find(
          (p) => p.id === Number(b.dataset.bought),
        );
        navigate("add");
      }),
  );
  if (buys.length)
    $("#share-list").onclick = () =>
      share(
        "장보기 목록\n" +
          buys
            .map((f) => `- ${f.name} (남은 ${f.usable}${f.unit})`)
            .join("\n"),
        "장보기 목록을 복사했어요",
      );
  $("#refresh-alerts").onclick = () =>
    reloadView()
      .then(() => toast("최신 상태예요"))
      .catch((e) => toast(e.message));
  document
    .querySelectorAll("[data-policy]")
    .forEach(
      (b) => (b.onclick = () => productDialog(Number(b.dataset.policy))),
    );
}
function productDialog(id) {
  const p = state.products.find((p) => p.id === id);
  modal(
    "상품과 구매 기준",
    `<form id="policy-form">${field("상품 이름", "name", p.name, "text", 'required maxlength="150"')}${stepper("이 수량 이하이면 구매 안내", "minimum", p.minimum, 0, 100000)}${stepper("예상 소진 며칠 전 구매 안내", "lead_days", p.lead_days, 0, 90)}<button type="submit" class="primary">저장</button></form>`,
  );
  $("#policy-form").onsubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(form, async () => {
      const d = Object.fromEntries(new FormData(form));
      await api(`/products/${id}`, {
        method: "PUT",
        body: {
          name: d.name,
          minimum: Number(d.minimum),
          lead_days: Number(d.lead_days),
        },
      });
      $("#dialog").close();
      await reloadView();
      toast("구매 기준을 저장했어요");
    });
  };
}
function settingsView() {
  $("#view").innerHTML =
    `${heading("설정", "함께 관리하는 우리집")}<div class="grid"><section class="panel"><h2>우리집 설정</h2><form id="settings-form">${field("우리집 이름", "name", state.me.household_name, "text", 'required maxlength="100"')}${stepper("유통기한 임박 기준 (일)", "expiry_days", state.me.expiry_days, 0, 90)}<button type="submit" class="primary">저장</button></form></section><section class="panel"><h2>가족 초대</h2><p class="code">${esc(state.me.invite_code)}</p><p class="guide">가족이 가입할 때 이 코드를 입력하면 같은 집을 함께 관리합니다. 모든 가족은 같은 편집 권한을 가집니다.</p><div class="row" style="margin-top:14px"><button id="share-code" class="primary grow">초대 코드 보내기</button><button id="rotate-code">새 코드</button></div></section></div><section class="panel" style="margin-top:16px"><div class="row spread"><h2 style="margin:0">활동 기록</h2><button class="small" id="reload-activity">새로고침</button></div><div id="activities"></div><button class="small" id="more-activity" style="width:100%;margin-top:8px">더 보기</button></section><section class="panel" style="margin-top:16px"><h2>계정</h2><p class="muted">${esc(state.me.email)}</p><button id="logout" class="danger" style="width:100%">로그아웃</button></section>`;
  $("#settings-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    submit(f, async () => {
      const d = Object.fromEntries(new FormData(f));
      await api("/settings", {
        method: "PUT",
        body: { name: d.name, expiry_days: Number(d.expiry_days) },
      });
      await reloadView();
      toast("설정을 저장했어요");
    });
  };
  $("#share-code").onclick = () =>
    share(
      `우리집 앱 초대 코드: ${state.me.invite_code}\n${location.origin} 에서 가입할 때 입력하세요.`,
      "초대 문구를 복사했어요",
    );
  $("#logout").onclick = () => {
    state.load++;
    setToken(null);
    stopCamera();
    auth();
  };
  $("#rotate-code").onclick = () => {
    modal(
      "초대 코드 변경",
      '<p>기존 코드로는 더 이상 가입할 수 없게 됩니다. 이미 가입한 가족은 그대로 유지됩니다.</p><button class="primary sheet-cta" id="confirm-rotate">새 코드 만들기</button>',
    );
    $("#confirm-rotate").onclick = async () => {
      try {
        await api("/invite/rotate", { method: "POST" });
        $("#dialog").close();
        await reloadView();
      } catch (e) {
        toast(e.message);
      }
    };
  };
  let offset = 0;
  const version = state.load;
  async function load(clear = false) {
    const target = $("#activities");
    if (!target) return;
    if (clear) {
      offset = 0;
      target.innerHTML = "";
    }
    const button = $("#more-activity");
    button.disabled = true;
    try {
      const rows = await api(`/activity?offset=${offset}&limit=30`);
      if (
        state.view !== "settings" ||
        state.load !== version ||
        !target.isConnected
      )
        return;
      target.insertAdjacentHTML(
        "beforeend",
        rows
          .map(
            (r) =>
              `<article class="card-row"><div class="row"><span class="badge">${actionNames[r.action]}</span><strong>${esc(r.product_name)} · ${r.quantity}</strong></div><small>${esc(r.from_path)}${r.to_path ? " → " + esc(r.to_path) : ""}</small><small>${esc(r.note)} ${esc(r.actor)} · ${localTime(r.created_at)}</small></article>`,
          )
          .join(""),
      );
      if (!rows.length && offset === 0)
        target.innerHTML = empty("아직 기록이 없어요.");
      offset += rows.length;
      button.hidden = rows.length < 30;
    } catch (e) {
      toast(e.message);
    } finally {
      button.disabled = false;
    }
  }
  $("#more-activity").onclick = () => load();
  $("#reload-activity").onclick = () => load(true);
  load();
}
if (token()) boot();
else auth();
