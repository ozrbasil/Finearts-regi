/* User panel: registration and My Dashboard */
const session = requireRole("team");
const MAX_IND = 4;
let comps = [], classes = [], inds = [], grps = [];
let settings = { editingEnabled: false, registrationOpen: true };
let lastState = "", formKey = "", editingIndId = null, editingGrpId = null;

const classLabel = (cls, year) => year ? `${cls} - ${year}` : cls;

function showView(v) {
  $("vRegistration").classList.toggle("hidden", v !== "registration");
  $("vDashboard").classList.toggle("hidden", v !== "dashboard");
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  renderAll();
}

function renderAll() {
  renderRegState();
  renderTeamForms();
  refreshClassFields();
  applyGroupTaken();
  renderDash();
}

async function refresh() {
  try {
    const s = await api("GET", "/api/state");
    hideNote();
    const snap = JSON.stringify(s);
    if (snap === lastState) return;
    lastState = snap;
    comps = s.comps.sort(byOrder);
    classes = (s.classes || []).sort(byOrder);
    inds = s.inds;
    grps = s.grps;
    settings = s.settings;
    renderAll();
  } catch (err) {
    showNote("Connection problem: " + err.message);
  }
}

/* ----- Class and year dropdowns: only the classes the admin has added ----- */
function clsOptions(sel) {
  return `<option value="">Choose class</option>` +
    classes.map(c => `<option value="${esc(c.name)}"${c.name === sel ? " selected" : ""}>${esc(c.name)}</option>`).join("");
}

function yearOptions(clsName, sel) {
  const c = classes.find(x => x.name === clsName);
  return `<option value="">Choose year</option>` +
    (c ? c.years.map(y => `<option value="${esc(y)}"${y === sel ? " selected" : ""}>${esc(y)}</option>`).join("") : "");
}

// Rebuilds every class and year dropdown from the current list, keeping what is already picked.
function refreshClassFields() {
  document.querySelectorAll("select.clsSel").forEach(s => {
    const v = s.value;
    s.innerHTML = clsOptions(v);
    s.value = v;
  });
  document.querySelectorAll("select.yrSel").forEach(s => {
    const c = s.closest(".pair").querySelector("select.clsSel").value;
    const v = s.value;
    s.innerHTML = yearOptions(c, v);
    s.value = v;
  });
}

// When a class is picked, its years appear in the year dropdown next to it.
document.addEventListener("change", (e) => {
  if (!e.target.matches("select.clsSel")) return;
  e.target.closest(".pair").querySelector("select.yrSel").innerHTML = yearOptions(e.target.value, "");
});

function renderRegState() {
  const open = settings.registrationOpen;
  $("regClosed").classList.toggle("hidden", open);
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

// Group competitions this team has already registered are greyed out so they cannot be picked again.
function applyGroupTaken() {
  const taken = new Set(session ? grps.filter(g => g.team === session.team).flatMap(g => g.comps) : []);
  document.querySelectorAll('input[name="grp"]').forEach(cb => {
    const isTaken = taken.has(cb.value);
    cb.disabled = isTaken;
    if (isTaken) cb.checked = false;
    const label = cb.closest("label");
    label.classList.toggle("taken", isTaken);
    label.querySelector("span").textContent = isTaken ? cb.value + " (already registered)" : cb.value;
  });
}

function updateIndCount() {
  $("iCount").textContent = document.querySelectorAll('input[name="ind"]:checked').length + " / " + MAX_IND;
}

function addMemberRow() {
  const row = document.createElement("div");
  row.className = "mrow";
  row.innerHTML = `<input type="text" class="mem" placeholder="Member name">
    <span class="pair" style="display:contents">
      <select class="memCls clsSel" aria-label="Member class">${clsOptions("")}</select>
      <select class="memYr yrSel" aria-label="Member year">${yearOptions("", "")}</select>
    </span>
    <button type="button" class="btn ghost sm" aria-label="Remove member">✕</button>`;
  row.querySelector("button").addEventListener("click", () => {
    if ($("memberList").children.length > 1) row.remove();
  });
  $("memberList").appendChild(row);
}

function indTable(I, canEdit) {
  if (!I.length) return `<div class="empty">No individual participants yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Competitions</th>${canEdit ? "<th></th>" : ""}</tr></thead><tbody>
    ${I.map((p, i) => canEdit && editingIndId === p.id ? editRow(p, i) : `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(classLabel(p.cls, p.year))}</td>
    <td><div class="chips">${p.comps.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div></td>
    ${canEdit ? `<td><div class="acts"><button class="btn ghost sm" type="button" data-ind-act="edit" data-id="${p.id}">Edit</button><button class="btn ghost sm danger" type="button" data-ind-act="remove" data-id="${p.id}">Remove</button></div></td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
}

function editRow(p, i) {
  const indList = comps.filter(c => c.type === "individual").map(c => c.name);
  return `<tr>
    <td>${i + 1}</td>
    <td><input type="text" id="eName" value="${esc(p.name)}"></td>
    <td><span class="pair" style="display:flex;gap:6px">
      <select id="eCls" class="clsSel">${clsOptions(p.cls)}</select>
      <select id="eYr" class="yrSel">${yearOptions(p.cls, p.year)}</select></span></td>
    <td><div class="checks">${indList.map(n => `<label><input type="checkbox" name="eComp" value="${esc(n)}" ${p.comps.includes(n) ? "checked" : ""}><span>${esc(n)}</span></label>`).join("")}</div></td>
    <td><div class="acts"><button class="btn sm" type="button" data-ind-act="save" data-id="${p.id}">Save</button>
    <button class="btn ghost sm" type="button" data-ind-act="cancel">Cancel</button></div></td></tr>`;
}

function grpCards(G, canEdit) {
  if (!G.length) return `<div class="empty">No groups registered yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Team Leader</th><th>Class</th><th>Members</th><th>Competitions</th>${canEdit ? "<th></th>" : ""}</tr></thead><tbody>
    ${G.map(g => canEdit && editingGrpId === g.id ? grpEditRow(g) : `<tr><td>${esc(g.leader)}</td><td>${esc(classLabel(g.leaderCls, g.leaderYear))}</td>
    <td>${g.members.map(m => `<div>${esc(m.name)} <span class="hint">· ${esc(classLabel(m.cls, m.year))}</span></div>`).join("")}</td>
    <td><div class="chips">${g.comps.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div></td>
    ${canEdit ? `<td><div class="acts"><button class="btn ghost sm" type="button" data-grp-act="edit" data-id="${g.id}">Edit</button><button class="btn ghost sm danger" type="button" data-grp-act="remove" data-id="${g.id}">Remove</button></div></td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
}

// Names, classes and years can change. Competitions and the number of members are shown as plain text.
function grpEditRow(g) {
  return `<tr>
    <td><input type="text" id="geLeader" value="${esc(g.leader)}"></td>
    <td><span class="pair" style="display:flex;gap:6px">
      <select id="geLeaderCls" class="clsSel">${clsOptions(g.leaderCls)}</select>
      <select id="geLeaderYr" class="yrSel">${yearOptions(g.leaderCls, g.leaderYear)}</select></span></td>
    <td>${g.members.map(m => `<div class="gemRow" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      <input type="text" class="geMem" value="${esc(m.name)}">
      <span class="pair" style="display:flex;gap:6px">
        <select class="geMemCls clsSel">${clsOptions(m.cls)}</select>
        <select class="geMemYr yrSel">${yearOptions(m.cls, m.year)}</select></span></div>`).join("")}</td>
    <td><div class="chips">${g.comps.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div></td>
    <td><div class="acts"><button class="btn sm" type="button" data-grp-act="save" data-id="${g.id}">Save</button>
    <button class="btn ghost sm" type="button" data-grp-act="cancel">Cancel</button></div></td></tr>`;
}

function renderDash() {
  if (!session) return;
  const t = session.team;
  if (!settings.editingEnabled) { editingIndId = null; editingGrpId = null; }
  const I = inds.filter(x => x.team === t).sort(byOrder), G = grps.filter(x => x.team === t);
  $("dashLead").textContent = "Showing registrations for " + teamName(t) + " only.";
  $("sInd").textContent = I.length;
  $("sGrp").textContent = G.length;
  $("sReg").textContent = I.length + G.length;
  $("dashInd").innerHTML = indTable(I, settings.editingEnabled);
  $("dashGrp").innerHTML = grpCards(G, settings.editingEnabled);
}

/* ----- Events ----- */
document.querySelectorAll(".nav").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
$("logout").addEventListener("click", signOut);

document.querySelectorAll(".type-opt").forEach(btn => btn.addEventListener("click", () => {
  const g = btn.dataset.type === "group";
  document.querySelectorAll(".type-opt").forEach(b => b.classList.toggle("on", b === btn));
  $("indForm").classList.toggle("hidden", g);
  $("grpForm").classList.toggle("hidden", !g);
}));

$("indChecks").addEventListener("change", (e) => {
  if (e.target.name !== "ind") return;
  if (document.querySelectorAll('input[name="ind"]:checked').length > MAX_IND) {
    e.target.checked = false;
    toast("Maximum 4 items per participant");
  }
  updateIndCount();
});

$("indForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!settings.registrationOpen) return toast("Registration is stopped by the admin");
  const name = $("iName").value.trim(), cls = $("iClass").value, year = $("iYr").value;
  const chosen = [...document.querySelectorAll('input[name="ind"]:checked')].map(c => c.value);
  if (!name) return;
  if (!cls || !year) return toast("Choose a class and year");
  if (!chosen.length) return toast("Choose at least one competition");
  try {
    await api("POST", "/api/individuals", { name, cls, year, comps: chosen });
    $("indForm").reset();
    refreshClassFields();
    updateIndCount();
    $("indMsg").textContent = "Participant added.";
    setTimeout(() => $("indMsg").textContent = "", 2500);
    refresh();
  } catch (err) { toast(err.message); }
});

$("addMember").addEventListener("click", addMemberRow);

$("grpForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!settings.registrationOpen) return toast("Registration is stopped by the admin");
  const leader = $("gLeader").value.trim(), leaderCls = $("gLeaderCls").value, leaderYear = $("gLeaderYr").value;
  const members = [...document.querySelectorAll(".mrow")]
    .map(r => ({
      name: r.querySelector(".mem").value.trim(),
      cls: r.querySelector(".memCls").value,
      year: r.querySelector(".memYr").value,
    }))
    .filter(m => m.name || m.cls || m.year);
  const chosen = [...document.querySelectorAll('input[name="grp"]:checked')].map(c => c.value);
  if (!leader) return;
  if (!leaderCls || !leaderYear) return toast("Choose the leader's class and year");
  if (!members.length) return toast("Add at least one team member");
  if (members.some(m => !m.name || !m.cls || !m.year)) return toast("Each member needs a name, class and year");
  if (!chosen.length) return toast("Choose a group competition");
  try {
    await api("POST", "/api/groups", { leader, leaderCls, leaderYear, members, comps: chosen });
    $("grpForm").reset();
    $("memberList").innerHTML = "";
    addMemberRow();
    addMemberRow();
    refreshClassFields();
    $("grpMsg").textContent = "Group added.";
    setTimeout(() => $("grpMsg").textContent = "", 2500);
    refresh();
  } catch (err) { toast(err.message); }
});

$("dashInd").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-ind-act]");
  if (!b) return;
  const act = b.dataset.indAct, id = b.dataset.id;
  if (act === "edit") { editingIndId = id; renderDash(); return; }
  if (act === "cancel") { editingIndId = null; renderDash(); return; }
  if (act === "remove") {
    if (!confirm("Remove this participant and all their competitions? This cannot be undone.")) return;
    try {
      await api("DELETE", "/api/individuals/" + id);
      if (editingIndId === id) editingIndId = null;
      toast("Participant removed");
      await refresh();
    } catch (err) { toast(err.message); }
    renderDash();
    return;
  }
  if (act === "save") {
    const name = $("eName").value.trim(), cls = $("eCls").value, year = $("eYr").value;
    const chosen = [...document.querySelectorAll('input[name="eComp"]:checked')].map(c => c.value);
    if (!name) return toast("Name is required");
    if (!cls || !year) return toast("Choose a class and year");
    if (!chosen.length) return toast("Choose at least one competition");
    if (chosen.length > MAX_IND) return toast("Maximum 4 items per participant");
    try {
      await api("PATCH", "/api/individuals/" + id, { name, cls, year, comps: chosen });
      editingIndId = null;
      toast("Participant updated");
      await refresh();
    } catch (err) { toast(err.message); }
    renderDash();
  }
});

$("dashGrp").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-grp-act]");
  if (!b) return;
  const act = b.dataset.grpAct, id = b.dataset.id;
  if (act === "edit") { editingGrpId = id; renderDash(); return; }
  if (act === "cancel") { editingGrpId = null; renderDash(); return; }
  if (act === "remove") {
    if (!confirm("Remove this group? This cannot be undone.")) return;
    try {
      await api("DELETE", "/api/groups/" + id);
      if (editingGrpId === id) editingGrpId = null;
      toast("Group removed");
      await refresh();
    } catch (err) { toast(err.message); }
    renderDash();
    return;
  }
  if (act === "save") {
    const leader = $("geLeader").value.trim(), leaderCls = $("geLeaderCls").value, leaderYear = $("geLeaderYr").value;
    const members = [...document.querySelectorAll(".gemRow")].map(r => ({
      name: r.querySelector(".geMem").value.trim(),
      cls: r.querySelector(".geMemCls").value,
      year: r.querySelector(".geMemYr").value,
    }));
    if (!leader) return toast("Team leader name is required");
    if (!leaderCls || !leaderYear) return toast("Choose the leader's class and year");
    if (members.some(m => !m.name || !m.cls || !m.year)) return toast("Each member needs a name, class and year");
    try {
      await api("PATCH", "/api/groups/" + id, { leader, leaderCls, leaderYear, members });
      editingGrpId = null;
      toast("Group updated");
      await refresh();
    } catch (err) { toast(err.message); }
    renderDash();
  }
});

/* ----- Start ----- */
if (session) {
  $("roleLabel").textContent = teamName(session.team);
  $("who").textContent = "Signed in as " + session.username;
  startPolling(refresh);
}
