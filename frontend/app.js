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
  load: 0,
};
const actionNames = {
  receive: "등록",
  consume: "소비",
  discard: "폐기",
  move: "이동",
  adjust: "수량 정정",
};
let toastTimer, cameraStream, cameraTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
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
function modal(title, html) {
  stopCamera();
  const d = $("#dialog");
  d.innerHTML = `<div class="dialog-top"><h2>${title}</h2><button class="quiet" id="close-dialog" aria-label="닫기">✕</button></div>${html}`;
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
    `<div class="auth-wrap"><div class="panel auth-card"><div class="brand">우리집<small>HOME DIGITAL TWIN</small></div><h1>${mode === "login" ? "내 집으로 들어가기" : "함께 쓸 집 만들기"}</h1><p class="muted">물건이 있는 자리부터, 다시 필요한 날까지.</p><form id="auth-form">${field("이메일", "email", "", "email", 'required autocomplete="email"')}${field("비밀번호", "password", "", "password", `required minlength="8" autocomplete="${mode === "login" ? "current-password" : "new-password"}"`)}${mode === "signup" ? field("우리집 이름", "household_name", "우리집", "text", 'required maxlength="100"') + field("가족 초대 코드 · 있는 경우", "invite_code", "", "text", 'autocomplete="off"') : ""}<button type="submit" class="primary">${mode === "login" ? "로그인" : "가입하기"}</button><p class="guide">서버가 쉬고 있었다면 첫 연결에 시간이 걸릴 수 있어요.</p></form><button id="switch-auth" class="quiet" style="width:100%;margin-top:16px">${mode === "login" ? "처음이신가요? 가입하기" : "이미 계정이 있나요? 로그인"}</button></div></div>`;
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
}
async function boot() {
  $("#app").innerHTML =
    '<div class="auth-wrap"><div class="panel"><h2>우리집을 불러오고 있어요</h2><p class="muted">서버와 연결 중입니다.</p></div></div>';
  try {
    await refresh();
    shell();
    render();
  } catch (e) {
    if (!token()) return auth();
    $("#app").innerHTML =
      `<div class="auth-wrap"><div class="panel">${errorHTML(e)}<button id="retry">다시 연결</button><button id="exit">로그아웃</button></div></div>`;
    $("#retry").onclick = boot;
    $("#exit").onclick = () => {
      setToken(null);
      auth();
    };
  }
}
function shell() {
  $("#app").innerHTML =
    `<div class="layout"><aside class="sidebar"><div class="brand">우리집<small>HOME DIGITAL TWIN</small></div><nav>${[
      ["home", "우리집"],
      ["search", "물건 찾기"],
      ["add", "등록"],
      ["alerts", "알림"],
      ["settings", "설정"],
    ]
      .map(
        ([v, l], i) =>
          `<button data-nav="${v}"><span class="navnum">0${i + 1}</span>${l}</button>`,
      )
      .join(
        "",
      )}</nav><div class="bottom">공간과 물건을 연결합니다.<br><span class="muted">이동하거나 사용하면 기록해 주세요.</span></div></aside><main class="main"><div class="top"><strong>${esc(state.me.household_name)}</strong><div class="row"><span class="pill">${esc(state.me.email)}</span><button class="quiet small" id="logout">로그아웃</button></div></div><div id="view"></div></main></div>`;
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.nav)));
  $("#logout").onclick = () => {
    state.load++;
    setToken(null);
    stopCamera();
    auth();
  };
}
function navigate(view) {
  state.view = view;
  state.load++;
  render();
}
function render() {
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) => b.classList.toggle("active", b.dataset.nav === state.view));
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
  return `<article class="item"><div class="row spread"><span class="item-name">${esc(it.name)} <span class="muted">${it.quantity}${esc(it.unit)}</span></span>${badge(it)}</div><small>${esc(it.location_path)}${it.expiry_date ? " · " + esc(it.expiry_date) : ""}</small><div class="actions"><button class="small" data-find="${it.location_id}">위치 보기</button><button class="small" data-action="${it.id}:consume">소비</button><button class="small" data-action="${it.id}:move">이동</button><button class="small quiet" data-action="${it.id}:discard">폐기</button><button class="small quiet" data-action="${it.id}:adjust">정정</button></div></article>`;
}
function bindItems(root = $("#view")) {
  root.querySelectorAll("[data-find]").forEach(
    (b) =>
      (b.onclick = () => {
        state.parent = Number(b.dataset.find);
        state.highlight = state.parent;
        state.edit = false;
        navigate("home");
      }),
  );
  root.querySelectorAll("[data-action]").forEach(
    (b) =>
      (b.onclick = () => {
        const [id, action] = b.dataset.action.split(":");
        itemDialog(Number(id), action);
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
  $("#view").innerHTML =
    `<div class="heading"><div><h1>${parent ? esc(parent.name) : "집 안을 한눈에"}</h1><p class="muted">공간을 눌러 안에 있는 물건을 확인하세요.</p></div><div class="row"><button id="edit-map">${state.edit ? "배치 완료" : "배치 편집"}</button><button id="new-space" class="primary">+ 공간 추가</button></div></div><div class="stats"><div class="stat"><span>등록한 공간</span><b>${state.locations.length}</b></div><div class="stat"><span>보관 중인 상품</span><b>${new Set(state.items.map((i) => i.product_id)).size}</b></div><div class="stat"><span>확인할 유통기한</span><b>${state.insights.expiry.length}</b></div></div><div class="grid"><section class="panel"><div class="crumbs"><button data-parent="">우리집</button>${crumbs.map((l) => `<span>›</span><button data-parent="${l.id}">${esc(l.name)}</button>`).join("")}</div><div class="map ${state.edit ? "edit" : ""}" id="map">${children
      .map((l) => {
        const set = descendants(l.id),
          count = state.items
            .filter((i) => set.has(i.location_id))
            .reduce((a, i) => a + i.quantity, 0);
        return `<button class="space ${l.kind} ${state.highlight === l.id ? "found" : ""}" data-space="${l.id}" style="left:${l.x * 5}%;top:${l.y * 5}%;width:${l.width * 5}%;height:${l.height * 5}%" aria-label="${esc(l.name)}, 물건 ${count}개"><strong>${esc(l.name)}</strong><small>${count}개 보관</small></button>`;
      })
      .join(
        "",
      )}${!children.length ? `<div class="empty map-empty">${parent ? "이 공간의 물건은 옆 목록에서 확인할 수 있어요.<br>서랍이나 수납 칸도 추가할 수 있어요." : "아직 집이 비어 있어요.<br>공간 추가로 첫 번째 방을 만들어 보세요."}</div>` : ""}<span class="map-label">${state.edit ? "끌어서 배치 · 크기는 공간 설정에서 조절" : "공간 배치도 · 실제 치수와 다를 수 있음"}</span></div><p class="guide">${state.edit ? "드래그를 놓으면 위치가 저장됩니다." : "방 → 가구 → 수납 칸 순서로 탐색할 수 있어요."}</p>${parent ? '<div class="row" style="margin-top:16px"><button id="space-settings" class="small">공간 설정</button><button id="register-here" class="small primary">여기에 물건 넣기</button></div>' : ""}</section><section class="panel"><div class="row spread"><h2>이곳의 물건</h2><span class="badge">${shown.length}개 재고 항목</span></div>${shown.length ? shown.map(itemHTML).join("") : empty("물건을 등록하면 이곳에 표시됩니다.")}<button id="refresh-home" class="quiet small">새로고침</button></section></div>`;
  $("#new-space").onclick = () => locationDialog();
  $("#edit-map").onclick = () => {
    state.edit = !state.edit;
    homeView();
  };
  $("#refresh-home").onclick = () =>
    reloadView().catch((e) => toast(e.message));
  document.querySelectorAll("[data-parent]").forEach(
    (b) =>
      (b.onclick = () => {
        state.parent = b.dataset.parent ? Number(b.dataset.parent) : null;
        homeView();
      }),
  );
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
function bindDrag(button) {
  let start = null,
    moved = false;
  button.onpointerdown = (e) => {
    if (e.button !== 0) return;
    const l = state.locations.find(
      (x) => x.id === Number(button.dataset.space),
    );
    const rect = $("#map").getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, l: { ...l }, rect };
    moved = false;
    button.setPointerCapture(e.pointerId);
  };
  button.onpointermove = (e) => {
    if (!start) return;
    moved = true;
    const x = Math.max(
      0,
      Math.min(
        20 - start.l.width,
        start.l.x + ((e.clientX - start.x) / start.rect.width) * 20,
      ),
    );
    const y = Math.max(
      0,
      Math.min(
        20 - start.l.height,
        start.l.y + ((e.clientY - start.y) / start.rect.height) * 20,
      ),
    );
    button.style.left = x * 5 + "%";
    button.style.top = y * 5 + "%";
  };
  button.onpointercancel = () => {
    start = null;
    homeView();
  };
  button.onpointerup = async () => {
    if (!start) return;
    const { l } = start;
    start = null;
    if (!moved) return locationDialog(l);
    const data = {
      ...l,
      x: Math.round((parseFloat(button.style.left) / 5) * 10) / 10,
      y: Math.round((parseFloat(button.style.top) / 5) * 10) / 10,
    };
    try {
      await api(`/locations/${l.id}`, { method: "PUT", body: data });
      await reloadView();
      toast("공간 배치를 저장했어요");
    } catch (e) {
      toast(e.message);
      homeView();
    }
  };
}
function locationDialog(l = null) {
  modal(
    l ? "공간 설정" : "새 공간",
    `<form id="location-form">${field("공간 이름", "name", l?.name || "", "text", 'required maxlength="100"')}<div class="form-grid"><label class="field">종류<select name="kind">${[
      ["room", "방"],
      ["furniture", "가구"],
      ["storage", "수납 칸"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${l?.kind === v ? "selected" : ""}>${t}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="field">상위 공간<select name="parent_id"><option value="">우리집 (최상위)</option>${options(l?.parent_id ?? state.parent, l?.id)}</select></label>${field("가로 위치 (0~19)", "x", l?.x ?? 0, "number", 'min="0" max="19" step="0.1" required')}${field("세로 위치 (0~19)", "y", l?.y ?? 0, "number", 'min="0" max="19" step="0.1" required')}${field("너비", "width", l?.width ?? 7, "number", 'min="0.5" max="20" step="0.1" required')}${field("높이", "height", l?.height ?? 6, "number", 'min="0.5" max="20" step="0.1" required')}</div><p class="guide">각 공간은 20 × 20 배치 영역입니다. 위치와 크기로 집의 구조를 표현하세요.</p><div class="row" style="margin-top:18px"><button class="primary" type="submit">저장</button>${l ? '<button class="danger" type="button" id="delete-space">공간 삭제</button>' : ""}</div></form>`,
  );
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
        "공간 삭제 확인",
        `<p>‘${esc(l.name)}’을 삭제할까요? 재고나 이력이 연결된 공간은 삭제할 수 없습니다.</p><button id="confirm-delete" class="danger">삭제하기</button>`,
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
  modal(
    `${esc(it.name)} · ${actionNames[action]}`,
    `<p class="muted">${esc(it.location_path)} · 현재 ${it.quantity}${esc(it.unit)}</p><form id="action-form">${field(action === "adjust" ? "실제 확인한 수량" : "수량", "quantity", action === "adjust" ? it.quantity : 1, "number", `required min="${action === "adjust" ? 0 : 1}" max="${action === "adjust" ? 100000 : it.quantity}" step="1"`)}${action === "move" ? `<label class="field">옮길 위치<select name="destination_id" required><option value="">선택하세요</option>${options(null, it.location_id)}</select></label>` : ""}${action === "adjust" ? '<label class="field">정정 이유<textarea name="note" required maxlength="300" placeholder="예: 실제 수량을 다시 세어 보니 3개"></textarea></label>' : ""}<p class="guide">${action === "consume" ? "실제로 사용한 수량만 소비로 기록해 주세요. 위치만 바꾸면 이동을 선택하세요." : action === "discard" ? "폐기는 소비 예측의 사용량에 포함되지 않습니다." : "변경 내역은 활동 기록에 남습니다."}</p><button type="submit" class="primary">${actionNames[action]} 기록</button></form>`,
  );
  $("#action-form").onsubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    submit(form, async () => {
      const d = Object.fromEntries(new FormData(form));
      await api(`/items/${id}/actions`, {
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
      toast("기록을 저장했어요");
    });
  };
}
function searchView() {
  $("#view").innerHTML =
    `<div class="heading"><div><h1>무엇을 찾으세요?</h1><p class="muted">물건 이름으로 찾고, 보관한 자리까지 확인하세요.</p></div></div><form class="search" id="search-form"><input id="query" aria-label="물건 이름" placeholder="우유, 건전지, 여권…" value="${esc(state.query)}"><button class="primary">찾기</button></form><section class="panel" id="search-results"></section>`;
  const draw = () => {
    const q = state.query.trim().toLocaleLowerCase();
    const rows = state.items.filter((i) =>
      i.name.toLocaleLowerCase().includes(q),
    );
    $("#search-results").innerHTML = q
      ? rows.length
        ? `<h2>${rows.length}개 재고 항목을 찾았어요</h2>` +
          rows.map(itemHTML).join("")
        : empty("일치하는 물건이 없어요. 다른 이름으로 찾아보세요.")
      : empty("이름을 입력하면 등록된 물건과 위치를 보여드려요.");
    bindItems($("#search-results"));
  };
  $("#search-form").onsubmit = (e) => {
    e.preventDefault();
    state.query = $("#query").value;
    draw();
  };
  $("#query").oninput = () => {
    state.query = $("#query").value;
    draw();
  };
  draw();
}
function addView() {
  $("#view").innerHTML =
    `<div class="heading"><div><h1>물건을 제자리에</h1><p class="muted">바코드나 사진으로 이름을 채우고, 위치를 확인해 주세요.</p></div></div><div class="grid"><section class="panel"><h2>물건 정보</h2><form id="item-form"><input type="hidden" name="product_id" value="">${field("물건 이름", "name", "", "text", 'required maxlength="150" list="product-names" autocomplete="off"')}<datalist id="product-names">${state.products.map((p) => `<option value="${esc(p.name)}">`).join("")}</datalist><label class="field">보관 위치<select name="location_id" required><option value="">위치 선택</option>${options(state.parent)}</select></label><div id="suggestions"></div><div class="form-grid">${field("수량", "quantity", 1, "number", 'required min="1" max="100000" step="1"')}${field("단위", "unit", "개", "text", 'required maxlength="20"')}${field("유통기한 · 선택", "expiry_date", "", "date")}${field("바코드 · 선택", "barcode", "", "text", 'inputmode="numeric" pattern="[0-9]{8,14}"')}</div><p class="guide">같은 상품·위치·유통기한이면 수량을 합칩니다. 바코드만으로 유통기한은 알 수 없으니 포장을 확인하세요.</p><button class="primary" type="submit" ${state.locations.length ? "" : "disabled"}>등록하기</button>${state.locations.length ? "" : '<p class="note">우리집 화면에서 보관할 공간을 먼저 만들어 주세요.</p>'}</form></section><aside><section class="panel section"><h2>바코드로 등록</h2><p class="muted">우리집에 등록한 상품을 먼저 찾습니다.</p><div class="row"><button id="camera-barcode">카메라 스캔</button><button id="manual-barcode">번호로 조회</button></div><p class="guide">처음 보는 식품은 Open Food Facts에서 조회합니다. 결과가 없으면 직접 이름을 입력할 수 있어요.</p></section><section class="panel"><h2>사진으로 등록</h2><p class="muted">바코드가 없는 물건도 사진으로 이름을 제안받을 수 있어요.</p><label class="field">물건 사진<input id="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label><p class="guide">선택한 사진은 연결된 인식 서버로 전송됩니다. 등록 전 결과를 확인하세요.</p><button id="recognize-photo" ${state.me.photo_enabled ? "" : "disabled"}>사진 인식</button>${state.me.photo_enabled ? "" : '<p class="note">사진 인식 서버가 아직 연결되지 않았어요. 지금은 이름을 직접 입력해 주세요.</p>'}<div id="recognition-result"></div></section></aside></div>`;
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
                `<button type="button" data-suggest="${r.location_id}">${esc(r.path)}<br><small>${esc(r.reason)}</small></button>`,
            )
            .join("") +
          "</div>"
        : "";
      document
        .querySelectorAll("[data-suggest]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              (form.elements.location_id.value = b.dataset.suggest)),
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
      navigate("home");
      toast("물건을 등록했어요");
    });
  };
  $("#manual-barcode").onclick = () => {
    modal(
      "바코드 번호 조회",
      `<form id="barcode-form">${field("바코드 번호", "code", form.elements.barcode.value, "text", 'required inputmode="numeric" pattern="[0-9]{8,14}"')}<button type="submit" class="primary">상품 찾기</button></form>`,
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
  $("#camera-barcode").onclick = scanBarcode;
  $("#recognize-photo").onclick = async () => {
    const file = $("#photo").files[0];
    if (!file) return toast("사진을 먼저 선택하세요");
    if (file.size > 5 * 1024 * 1024) return toast("5MB 이하 사진을 선택하세요");
    const b = $("#recognize-photo");
    b.disabled = true;
    $("#recognition-result").innerHTML =
      '<p class="loading">사진을 확인하고 있어요…</p>';
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
        `<p class="note">이름 제안: ${esc(r.name)}<br>${esc(r.note)}<br>이름과 날짜를 확인한 뒤 등록해 주세요.</p>`;
    } catch (e) {
      if ($("#recognition-result"))
        $("#recognition-result").innerHTML = errorHTML(e);
    } finally {
      b.disabled = false;
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
  if (!("BarcodeDetector" in window))
    return toast(
      "이 브라우저는 카메라 바코드 인식을 지원하지 않아요. 번호로 조회해 주세요.",
    );
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
function alertsView() {
  const { expiry, forecasts } = state.insights;
  const buys = forecasts.filter((f) => f.buy);
  $("#view").innerHTML =
    `<div class="heading"><div><h1>먼저 확인할 것들</h1><p class="muted">유통기한과 남은 재고로 다음 행동을 준비하세요.</p></div><button id="refresh-alerts">새로고침</button></div><div class="alert-grid"><section class="panel"><h2>유통기한 · ${state.me.expiry_days}일 이내</h2>${expiry.length ? expiry.map(itemHTML).join("") : empty("임박하거나 만료된 물건이 없어요.")}</section><section class="panel"><h2>구매를 확인해 주세요</h2><p class="guide">위치별 재고를 합산하고, 이미 만료된 재고는 제외합니다.</p>${buys.length ? buys.map((f) => `<article class="item"><div class="row spread"><strong>${esc(f.name)}</strong><span class="badge warn">사용 가능 ${f.usable}${esc(f.unit)}</span></div><small>${f.days_until_empty !== null ? `현재 속도라면 약 ${f.days_until_empty}일 후 소진 예상` : `설정한 최소 재고 ${f.minimum}${esc(f.unit)} 이하입니다`}</small><button class="small" data-policy="${f.product_id}">구매 기준 설정</button></article>`).join("") : empty("현재 기준으로 구매할 물건이 없어요.")}</section></div><section class="panel" style="margin-top:22px"><h2>소비 예측</h2><p class="guide">기록되지 않은 소비는 알 수 없어요. 실제 재고를 확인하고, 차이가 있으면 수량 정정으로 맞춰 주세요. 알림은 앱을 열거나 새로고침할 때 갱신됩니다.</p>${forecasts.length ? forecasts.map((f) => `<article class="item"><div class="row spread"><strong>${esc(f.name)}</strong><span class="badge">${f.method === "ridge" ? "ML 예측" : f.method === "moving_average" ? "평균 소비량" : "기록 수집 중"}</span></div><small>${esc(f.reason)} · 관측 ${f.days_observed}일${f.daily_rate !== null ? ` · 하루 ${f.daily_rate}${esc(f.unit)}` : ""}</small>${f.validation_mae ? `<small>최근 7일 예측 오차(MAE): ML ${f.validation_mae.ridge} / 평균 ${f.validation_mae.baseline}</small>` : ""}<button class="small quiet" data-policy="${f.product_id}">상품·구매 기준 수정</button></article>`).join("") : empty("상품을 등록하고 소비를 기록하면 예측을 준비합니다.")}</section>`;
  bindItems();
  $("#refresh-alerts").onclick = () =>
    reloadView().catch((e) => toast(e.message));
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
    `<form id="policy-form">${field("상품 이름", "name", p.name, "text", 'required maxlength="150"')}${field("이 수량 이하이면 구매 안내", "minimum", p.minimum, "number", 'required min="0" max="100000" step="1"')}${field("예상 소진 며칠 전 구매 안내", "lead_days", p.lead_days, "number", 'required min="0" max="90" step="1"')}<button type="submit" class="primary">저장</button></form>`,
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
    });
  };
}
function settingsView() {
  $("#view").innerHTML =
    `<div class="heading"><div><h1>함께 관리하는 우리집</h1><p class="muted">가족을 초대하고, 관리 기준과 기록을 확인하세요.</p></div></div><div class="grid"><section class="panel"><h2>우리집 설정</h2><form id="settings-form">${field("우리집 이름", "name", state.me.household_name, "text", 'required maxlength="100"')}${field("유통기한 임박 기준 (일)", "expiry_days", state.me.expiry_days, "number", 'required min="0" max="90" step="1"')}<button type="submit" class="primary">저장</button></form></section><section class="panel"><h2>가족 초대</h2><p class="code">${esc(state.me.invite_code)}</p><p class="guide">가족이 가입할 때 이 코드를 입력하면 같은 집을 함께 관리합니다. 가족 구성원은 동일한 편집 권한을 가집니다.</p><button id="rotate-code" class="small" style="margin-top:16px">초대 코드 새로 만들기</button></section></div><section class="panel" style="margin-top:22px"><div class="row spread"><h2>활동 기록</h2><button class="small" id="reload-activity">새로고침</button></div><div id="activities"></div><button class="small" id="more-activity">더 보기</button></section>`;
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
  $("#rotate-code").onclick = () => {
    modal(
      "초대 코드 변경",
      '<p>기존 코드로는 더 이상 가입할 수 없게 됩니다. 이미 가입한 가족은 그대로 유지됩니다.</p><button class="primary" id="confirm-rotate">새 코드 만들기</button>',
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
              `<article class="item"><div class="row"><span class="badge">${actionNames[r.action]}</span><strong>${esc(r.product_name)} · ${r.quantity}</strong></div><small>${esc(r.from_path)}${r.to_path ? " → " + esc(r.to_path) : ""}</small><small>${esc(r.note)} ${esc(r.actor)} · ${esc(r.created_at.replace("T", " ").slice(0, 16))} UTC</small></article>`,
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
