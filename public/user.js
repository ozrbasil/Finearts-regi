/* User panel: registration and My Dashboard */
const session = requireRole("team");
const MAX_IND = 4;
let comps = [], inds = [], grps = [];
let settings = { editingEnabled: false, registrationOpen: true };
let lastState = "", formKey = "", editingIndId = null, editingGrpId = null;

function showView(v) {
  $("vRegistration").classList.toggle("hidden", v !== "registration");
  $("vDashboard").classList.toggle("hidden", v !== "dashboard");
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  renderAll();
}

function renderAll() {
  renderRegState();
  renderTeamForms();
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
    inds = s.inds;
    grps = s.grps;
    settings = s.settings;
    renderAll();
  } catch (err) {
    showNote("Connection problem: " + err.message);
  }
}

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
    <input type="text" class="memCls" placeholder="Class e.g. 8CA 2">
    <button type="button" class="btn ghost sm" aria-label="Remove member">✕</button>`;
  row.querySelector("button").addEventListener("click", () => {
    if ($("memberList").children.length > 1) row.remove();
  });
  $("memberList").appendChild(row);
}

function indTable(I, canEdit) {
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

function grpCards(G, canEdit) {
  if (!G.length) return `<div class="empty">No groups registered yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Team Leader</th><th>Class</th><th>Members</th><th>Competitions</th>${canEdit ? "<th></th>" : ""}</tr></thead><tbody>
    ${G.map(g => canEdit && editingGrpId === g.id ? grpEditRow(g) : `<tr><td>${esc(g.leader)}</td><td>${esc(g.leaderCls)}</td>
    <td>${g.members.map(m => `<div>${esc(m.name)} <span class="hint">· ${esc(m.cls)}</span></div>`).join("")}</td>
    <td><div class="chips">${g.comps.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div></td>
    ${canEdit ? `<td><button class="btn ghost sm" type="button" data-grp-act="edit" data-id="${g.id}">Edit</button></td>` : ""}</tr>`).join("")}
    </tbody></table></div>`;
}

// Only names can change: the leader's class, member classes and competitions are shown as plain text.
function grpEditRow(g) {
  return `<tr>
    <td><input type="text" id="geLeader" value="${esc(g.leader)}"></td>
    <td>${esc(g.leaderCls)}</td>
    <td>${g.members.map(m => `<div style="margin-bottom:6px"><input type="text" class="geMem" value="${esc(m.name)}"> <span class="hint">· ${esc(m.cls)}</span></div>`).join("")}</td>
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
  const name = $("iName").value.trim(), cls = $("iClass").value.trim();
  const chosen = [...document.querySelectorAll('input[name="ind"]:checked')].map(c => c.value);
  if (!name || !cls) return;
  if (!chosen.length) return toast("Choose at least one competition");
  try {
    await api("POST", "/api/individuals", { name, cls, comps: chosen });
    $("indForm").reset();
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
    $("grpForm").reset();
    $("memberList").innerHTML = "";
    addMemberRow();
    addMemberRow();
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
  if (act === "save") {
    const name = $("eName").value.trim(), cls = $("eCls").value.trim();
    const chosen = [...document.querySelectorAll('input[name="eComp"]:checked')].map(c => c.value);
    if (!name || !cls) return toast("Name and class are required");
    if (!chosen.length) return toast("Choose at least one competition");
    if (chosen.length > MAX_IND) return toast("Maximum 4 items per participant");
    try {
      await api("PATCH", "/api/individuals/" + id, { name, cls, comps: chosen });
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
  if (act === "save") {
    const leader = $("geLeader").value.trim();
    const memberNames = [...document.querySelectorAll(".geMem")].map(i => i.value.trim());
    if (!leader) return toast("Team leader name is required");
    if (memberNames.some(n => !n)) return toast("Each member needs a name");
    try {
      await api("PATCH", "/api/groups/" + id, { leader, memberNames });
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
