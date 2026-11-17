/* ===== Config ===== */
const MAX_IND = 4;
const POLL_MS = 4000;

/* ===== State ===== */
let role = null, token = null, pollT = null, lastState = "";
let comps = [], inds = [], grps = [], teamCreds = [];
let settings = { editingEnabled: false, registrationOpen: true };
let adminTeam = "", compTab = "individual", editingId = null, pendingDel = null, formKey = "";
let editingTeam = null, editingIndId = null, pendingReset = false;

/* ===== Helpers ===== */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const teamName = (n) => "Team " + String(n).padStart(2, "0");
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0);
let toastT;
function toast(t) {
  $("toast").textContent = t;
  $("toast").classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => $("toast").classList.remove("show"), 2200);
}
function showNote(t) { $("dbNote").textContent = t; $("dbNote").classList.remove("hidden"); }

/* Notice shown to teams when registration is stopped */
const closedNote = document.createElement("div");
closedNote.id = "regClosed";
closedNote.className = "empty hidden";
closedNote.style.marginBottom = "16px";
closedNote.textContent = "Registration is stopped by the admin. You cannot add new participants right now.";
document.querySelector("#vRegistration .types").before(closedNote);

/* ===== API ===== */
async function api(method, path, body) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { signOut(); throw new Error("Your session ended. Please sign in again."); }
  if (!res.ok) throw new Error(data.error || "Could not save. Please try again.");
  return data;
}

/* ===== Login ===== */
$("teamForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("lErr").textContent = "";
  try {
    const r = await api("POST", "/api/login", { username: $("lUser").value.trim(), password: $("lPass").value });
    token = r.token;
    role = r.role === "admin" ? { kind: "admin" } : { kind: "team", team: r.team, username: r.username };
    enterApp();
  } catch (err) {
    $("lErr").textContent = err.message;
    $("lPass").value = "";
  }
});

function signOut() {
  role = null; token = null; lastState = "";
  stopPolling();
  comps = []; inds = []; grps = []; teamCreds = [];
  editingIndId = null; editingTeam = null; pendingReset = false;
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("lPass").value = ""; $("lErr").textContent = "";
}
$("logout").addEventListener("click", signOut);

function enterApp() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  const isAdmin = role.kind === "admin";
  const items = isAdmin
    ? [["comps", "Competitions"], ["controls", "Controls"], ["adminRegs", "Registrations"], ["teams", "Teams"]]
    : [["registration", "Registration"], ["dashboard", "My Dashboard"]];
  $("nav").innerHTML = items.map(([v, l]) => `<button class="nav" type="button" data-view="${v}">${l}</button>`).join("");
  $("nav").querySelectorAll(".nav").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  $("roleLabel").textContent = isAdmin ? "Admin panel" : teamName(role.team);
  $("who").textContent = isAdmin ? "Signed in as Admin" : "Signed in as " + role.username;
  showView(isAdmin ? "comps" : "registration");
  startPolling();
}

function showView(v) {
  const map = { registration: "vRegistration", dashboard: "vDashboard", comps: "vComps", controls: "vControls", adminRegs: "vAdminRegs", teams: "vTeams" };
  Object.values(map).forEach(id => $(id).classList.toggle("hidden", id !== map[v]));
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  renderAll();
}

/* ===== Sync (polls the server; re-renders only when data changed) ===== */
function startPolling() { stopPolling(); refresh(); pollT = setInterval(refresh, POLL_MS); }
function stopPolling() { clearInterval(pollT); pollT = null; }

async function refresh() {
  if (!role) return;
  try {
    const s = await api("GET", "/api/state");
    $("dbNote").classList.add("hidden");
    const snapshot = JSON.stringify(s);
    if (snapshot === lastState) return;
    lastState = snapshot;
    comps = s.comps.sort(byOrder);
    inds = s.inds;
    grps = s.grps;
    teamCreds = s.teams;
    settings = s.settings;
    renderAll();
  } catch (err) {
    if (role) showNote("Connection problem: " + err.message);
  }
}

function renderAll() {
  if (!role) return;
  if (role.kind === "team") { renderRegState(); renderTeamForms(); renderDash(); }
  else { renderComps(); renderControls(); renderAdminRegs(); renderTeams(); }
}

/* ===== Team: registration forms ===== */
document.querySelectorAll(".type-opt").forEach(btn => btn.addEventListener("click", () => {
  const g = btn.dataset.type === "group";
  document.querySelectorAll(".type-opt").forEach(b => b.classList.toggle("on", b === btn));
  $("indForm").classList.toggle("hidden", g);
  $("grpForm").classList.toggle("hidden", !g);
}));

function renderRegState() {
  const open = settings.registrationOpen;
  closedNote.classList.toggle("hidden", open);
  document.querySelectorAll("#indForm button[type=submit], #grpForm button[type=submit]")
    .forEach(b => { b.disabled = !open; });
}

function renderTeamForms() {
  const indList = comps.filter(c => c.type === "individual").map(c => c.name);
  const grpList = comps.filter(c => c.type === "group").map(c => c.name);
  const key = indList.join("|") + "#" + grpList.join("|");
  if (key !== formKey) {
    formKey = key;
    $("indChecks").innerHTML = indList.map(n => `<label><input type="checkbox" name="ind" value="${esc(n)}"><span>${esc(n)}</span></label>`).join("") || `<span class="hint">No competitions yet.</span>`;
    $("grpChecks").innerHTML = grpList.map(n => `<label><input type="checkbox" name="grp" value="${esc(n)}"><span>${esc(n)}</span></label>`).join("") || `<span class="hint">No group competitions yet.</span>`;
    updateIndCount();
  }
  if (!$("memberList").children.length) { addMemberRow(); addMemberRow(); }
}
function updateIndCount() {
  $("iCount").textContent = document.querySelectorAll('input[name="ind"]:checked').length + " / " + MAX_IND;
}
$("indChecks").addEventListener("change", (e) => {
  if (e.target.name !== "ind") return;
  if (document.querySelectorAll('input[name="ind"]:checked').length > MAX_IND) { e.target.checked = false; toast("Maximum 4 items per participant"); }
  updateIndCount();
});

$("indForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!settings.registrationOpen) return toast("Registration is stopped by the admin");
  const name = $("iName").value.trim(), cls = $("iClass").value.trim();
  const chosen = [...document.querySelectorAll('input[name="ind"]:checked')].map(c => c.value);
  if (!name || !cls) return;
  if (!chosen.length) return toast("Choose at least one competition");
  try {
    await api("POST", "/api/individuals", { name, cls, comps: chosen });
    $("indForm").reset(); updateIndCount();
    $("indMsg").textContent = "Participant added."; setTimeout(() => $("indMsg").textContent = "", 2500);
    refresh();
  } catch (err) { toast(err.message); }
});

function addMemberRow() {
  const row = document.createElement("div");
  row.className = "mrow";
  row.innerHTML = `<input type="text" class="mem" placeholder="Member name">
    <input type="text" class="memCls" placeholder="Class e.g. 8CA 2">
    <button type="button" class="btn ghost sm" aria-label="Remove member">✕</button>`;
  row.querySelector("button").addEventListener("click", () => {
    if ($("memberList").children.length > 1) row.remove();
  });
  $("memberList").appendChild(row);
}
$("addMember").addEventListener("click", addMemberRow);

$("grpForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!settings.registrationOpen) return toast("Registration is stopped by the admin");
  const leader = $("gLeader").value.trim(), leaderCls = $("gLeaderCls").value.trim();
  const members = [...document.querySelectorAll(".mrow")]
    .map(r => ({ name: r.querySelector(".mem").value.trim(), cls: r.querySelector(".memCls").value.trim() }))
    .filter(m => m.name || m.cls);
  const chosen = [...document.querySelectorAll('input[name="grp"]:checked')].map(c => c.value);
  if (!leader || !leaderCls) return;
  if (!members.length) return toast("Add at least one team member");
  if (members.some(m => !m.name || !m.cls)) return toast("Each member needs a name and class");
  if (!chosen.length) return toast("Choose a group competition");
  try {
    await api("POST", "/api/groups", { leader, leaderCls, members, comps: chosen });
    $("grpForm").reset(); $("memberList").innerHTML = ""; addMemberRow(); addMemberRow();
    $("grpMsg").textContent = "Group added."; setTimeout(() => $("grpMsg").textContent = "", 2500);
    refresh();
  } catch (err) { toast(err.message); }
});

/* ===== Team: dashboard (server already limits this to the team's own rows) ===== */
function renderDash() {
  const t = role.team;
  if (!settings.editingEnabled) editingIndId = null;
  const I = inds.filter(x => x.team === t).sort(byOrder), G = grps.filter(x => x.team === t);
  $("dashLead").textContent = "Showing registrations for " + teamName(t) + " only.";
  $("sInd").textContent = I.length; $("sGrp").textContent = G.length; $("sReg").textContent = I.length + G.length;
  $("dashInd").innerHTML = indTable(I, settings.editingEnabled);
  $("dashGrp").innerHTML = grpCards(G);
}

function indTable(I, canEdit = false) {
  if (!I.length) return `<div class="empty">No individual participants yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Competitions</th>${canEdit ? "<th></th>" : ""}</tr></thead><tbody>
    ${I.map((p, i) => canEdit && editingIndId === p.id ? editRow(p, i) : `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.cls)}</td>
    <td><div class="chips">${p.comps.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div></td>
    ${canEdit ? `<td><button class="btn ghost sm" type="button" data-ind-act="edit" data-id="${p.id}">Edit</button></td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
}

function editRow(p, i) {
  const indList = comps.filter(c => c.type === "individual").map(c => c.name);
  return `<tr>
    <td>${i + 1}</td>
    <td><input type="text" id="eName" value="${esc(p.name)}"></td>
    <td><input type="text" id="eCls" value="${esc(p.cls)}"></td>
    <td><div class="checks">${indList.map(n => `<label><input type="checkbox" name="eComp" value="${esc(n)}" ${p.comps.includes(n) ? "checked" : ""}><span>${esc(n)}</span></label>`).join("")}</div></td>
    <td><div class="acts"><button class="btn sm" type="button" data-ind-act="save" data-id="${p.id}">Save</button>
    <button class="btn ghost sm" type="button" data-ind-act="cancel">Cancel</button></div></td></tr>`;
}

$("dashInd").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-ind-act]");
  if (!b) return;
  const act = b.dataset.indAct, id = b.dataset.id;
  if (act === "edit") { editingIndId = id; renderDash(); return; }
  if (act === "cancel") { editingIndId = null; renderDash(); return; }
  if (act === "save") {
    const name = $("eName").value.trim(), cls = $("eCls").value.trim();
    const chosen = [...document.querySelectorAll('input[name="eComp"]:checked')].map(c => c.value);
    if (!name || !cls) return toast("Name and class are required");
    if (!chosen.length) return toast("Choose at least one competition");
    if (chosen.length > MAX_IND) return toast("Maximum 4 items per participant");
    try {
      await api("PATCH", "/api/individuals/" + id, { name, cls, comps: chosen });
      editingIndId = null; toast("Participant updated");
      await refresh();
    } catch (err) { toast(err.message); }
    renderDash();
  }
});

function grpCards(G) {
  if (!G.length) return `<div class="empty">No groups registered yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Team Leader</th><th>Class</th><th>Members</th><th>Competitions</th></tr></thead><tbody>
    ${G.map(g => `<tr><td>${esc(g.leader)}</td><td>${esc(g.leaderCls)}</td>
    <td>${g.members.map(m => `<div>${esc(m.name)} <span class="hint">· ${esc(m.cls)}</span></div>`).join("")}</td>
    <td><div class="chips">${g.comps.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div></td></tr>`).join("")}
    </tbody></table></div>`;
}

/* ===== Admin: controls (Stop/Continue, Edit enable/disable, Reset) ===== */
function renderControls() {
  const stopped = !settings.registrationOpen;
  $("regStatus").textContent = stopped
    ? "Stopped: users cannot add new participants."
    : "Open: users can add new participants.";
  $("btnStop").classList.toggle("hidden", stopped);
  $("btnContinue").classList.toggle("hidden", !stopped);

  $("editStatus").textContent = settings.editingEnabled
    ? "Enabled: users can edit their participants."
    : "Disabled: users cannot edit their participants.";
  $("btnEdit").textContent = settings.editingEnabled ? "Disable" : "Enable";

  $("btnReset").textContent = pendingReset ? "Confirm reset" : "Reset";
}

$("controls").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-ctl]");
  if (!b) return;
  const act = b.dataset.ctl;
  if (act !== "reset") pendingReset = false;
  try {
    if (act === "stop") await api("PATCH", "/api/admin/settings", { registrationOpen: false });
    if (act === "continue") await api("PATCH", "/api/admin/settings", { registrationOpen: true });
    if (act === "edit") await api("PATCH", "/api/admin/settings", { editingEnabled: !settings.editingEnabled });
    if (act === "reset") {
      if (!pendingReset) { pendingReset = true; renderControls(); return; }
      const r = await api("POST", "/api/admin/reset");
      pendingReset = false;
      toast(`Removed ${r.removed} registrations`);
    }
    await refresh();
  } catch (err) { toast(err.message); }
  renderControls();
});

/* ===== Admin: competitions ===== */
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  compTab = t.dataset.tab; editingId = null; pendingDel = null; renderComps();
}));

function renderComps() {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === compTab));
  const list = comps.filter(c => c.type === compTab);
  $("compList").innerHTML = list.length ? list.map(c => {
    if (editingId === c.id) return `<div class="item"><input type="text" id="editIn" value="${esc(c.name)}">
      <div class="acts"><button class="btn sm" type="button" data-act="save" data-id="${c.id}">Save</button>
      <button class="btn ghost sm" type="button" data-act="cancel">Cancel</button></div></div>`;
    return `<div class="item"><span>${esc(c.name)}</span><div class="acts">
      <button class="btn ghost sm" type="button" data-act="edit" data-id="${c.id}">Edit</button>
      <button class="btn ghost sm danger" type="button" data-act="del" data-id="${c.id}">${pendingDel === c.id ? "Confirm remove" : "Remove"}</button>
      </div></div>`;
  }).join("") : `<div class="empty" style="border:0">No ${compTab} competitions yet.</div>`;
}
const dupe = (name, id) => comps.some(c => c.type === compTab && c.id !== id && c.name.toLowerCase() === name.toLowerCase());

$("compList").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;
  if (act === "edit") { editingId = id; pendingDel = null; renderComps(); $("editIn")?.focus(); return; }
  if (act === "cancel") { editingId = null; renderComps(); return; }
  try {
    if (act === "save") {
      const name = $("editIn").value.trim();
      if (!name) return toast("Name cannot be empty");
      if (dupe(name, id)) return toast("That competition already exists");
      await api("PATCH", "/api/competitions/" + id, { name });
      editingId = null; toast("Competition updated");
    }
    if (act === "del") {
      if (pendingDel !== id) { pendingDel = id; renderComps(); return; }
      await api("DELETE", "/api/competitions/" + id);
      pendingDel = null; toast("Competition removed");
    }
    await refresh();
  } catch (err) { toast(err.message); }
  renderComps();
});

$("addComp").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("newComp").value.trim();
  if (!name) return;
  if (dupe(name, null)) return toast("That competition already exists");
  try {
    await api("POST", "/api/competitions", { name, type: compTab });
    $("newComp").value = "";
    toast("Competition added");
    await refresh();
  } catch (err) { toast(err.message); }
});

/* ===== Admin: teams ===== */
function renderTeams() {
  const rows = [1, 2, 3, 4].map(n => {
    const t = teamCreds.find(x => x.team === n) || { team: n, username: "" };
    if (editingTeam === n) return `<tr><td>${teamName(n)}</td>
      <td><input type="text" id="tUser" value="${esc(t.username)}"></td>
      <td><input type="password" id="tPass" placeholder="New password (blank = keep)" autocomplete="new-password"></td>
      <td><div class="acts"><button class="btn sm" type="button" data-tact="save" data-id="${n}">Save</button>
      <button class="btn ghost sm" type="button" data-tact="cancel">Cancel</button></div></td></tr>`;
    return `<tr><td>${teamName(n)}</td><td>${esc(t.username)}</td><td><span class="hint">••••••••</span></td>
      <td><button class="btn ghost sm" type="button" data-tact="edit" data-id="${n}">Edit</button></td></tr>`;
  }).join("");
  $("teamTable").innerHTML = `<table><thead><tr><th>Team</th><th>Username</th><th>Password</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

$("teamTable").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-tact]");
  if (!b) return;
  const act = b.dataset.tact, n = Number(b.dataset.id);
  if (act === "edit") { editingTeam = n; renderTeams(); return; }
  if (act === "cancel") { editingTeam = null; renderTeams(); return; }
  if (act === "save") {
    const username = $("tUser").value.trim(), password = $("tPass").value;
    if (!/^[A-Za-z0-9_]{3,}$/.test(username)) return toast("Username: letters, numbers or _ (min 3)");
    if (password && password.length < 4) return toast("Password must be at least 4 characters");
    if (teamCreds.some(t => t.username === username && t.team !== n)) return toast("That username is already used");
    try {
      await api("PATCH", "/api/teams/" + n, { username, password });
      editingTeam = null; toast(teamName(n) + " updated");
      await refresh();
    } catch (err) { toast(err.message); }
    renderTeams();
  }
});

/* ===== Admin: registrations and exports ===== */
const xlsxReady = () => typeof XLSX !== "undefined";
function renderAdminRegs() {
  const sel = $("teamSel");
  if (!sel.options.length) {
    sel.innerHTML = `<option value="">Select Team</option>` + [1, 2, 3, 4].map(n => `<option value="${n}">${teamName(n)}</option>`).join("");
    sel.addEventListener("change", () => { adminTeam = sel.value; renderAdminRegs(); });
  }
  sel.value = adminTeam;
  if (!adminTeam) { $("adminOut").innerHTML = `<div class="empty">Select a team to see its registrations.</div>`; return; }
  const t = Number(adminTeam);
  const I = inds.filter(x => x.team === t).sort(byOrder), G = grps.filter(x => x.team === t);
  const dis = (n) => n ? "" : "disabled";
  $("adminOut").innerHTML = `
    <div class="sec"><span>Individual participants (${I.length})</span>
      <span class="acts"><button class="btn ghost sm" type="button" data-dl="ind-csv" ${dis(I.length)}>Download CSV</button>
      <button class="btn ghost sm" type="button" data-dl="ind-xlsx" ${dis(I.length && xlsxReady())}>Download Excel</button></span></div>
    ${indTable(I)}
    <div class="sec"><span>Groups (${G.length})</span>
      <span class="acts"><button class="btn ghost sm" type="button" data-dl="grp-csv" ${dis(G.length)}>Download CSV</button>
      <button class="btn ghost sm" type="button" data-dl="grp-xlsx" ${dis(G.length && xlsxReady())}>Download Excel</button></span></div>
    ${grpCards(G)}`;
}

function indRows(t) {
  const rows = [["Name", "Class", "Team", "Competition"]];
  inds.filter(x => x.team === t).sort(byOrder).forEach(p => p.comps.forEach(c => rows.push([p.name, p.cls, teamName(t), c])));
  return rows;
}
function grpRows(t) {
  const rows = [["Team Leader", "Leader Class", "Members", "Team Name", "Competition"]];
  grps.filter(x => x.team === t).forEach(g => g.comps.forEach(c =>
    rows.push([g.leader, g.leaderCls, g.members.map(m => `${m.name} (${m.cls})`).join("; "), teamName(t), c])));
  return rows;
}
const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

$("adminOut").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-dl]");
  if (!b) return;
  const t = Number(adminTeam);
  const [kind, fmt] = b.dataset.dl.split("-");
  const isInd = kind === "ind";
  const rows = isInd ? indRows(t) : grpRows(t);
  const base = `${teamName(t)} - ${isInd ? "Individual" : "Group"} Registrations`;
  let blob, filename;
  if (fmt === "xlsx") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), isInd ? "Individual" : "Group");
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    filename = base + ".xlsx";
  } else {
    const csv = "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
    blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    filename = base + ".csv";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("File saved");
});
