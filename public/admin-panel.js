/* Admin panel: competitions, classes, controls, registrations, teams */
const session = requireRole("admin");
let comps = [], classes = [], inds = [], grps = [], teamCreds = [];
let settings = { editingEnabled: false, registrationOpen: true };
let lastState = "";
let adminTeam = "", compTab = "individual", editingId = null, pendingDel = null;
let editingClassId = null;
let editingTeam = null, pendingReset = false;

const VIEWS = { comps: "vComps", classes: "vClasses", controls: "vControls", adminRegs: "vAdminRegs", teams: "vTeams" };

// On-screen class label: "Bcom finance - 1st". Older records without a year show just the class.
const classLabel = (cls, year) => year ? `${cls} - ${year}` : cls;

// Export class cell: "3rd Year, Bcom Finance". Older records without a year show just the class.
const exportClass = (cls, year) => year ? `${year} Year, ${cls}` : cls;

function showView(v) {
  Object.entries(VIEWS).forEach(([k, id]) => $(id).classList.toggle("hidden", k !== v));
  document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  renderAll();
}

function renderAll() {
  renderComps();
  renderClasses();
  renderControls();
  renderAdminRegs();
  renderTeams();
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
    teamCreds = s.teams;
    settings = s.settings;
    renderAll();
  } catch (err) {
    showNote("Connection problem: " + err.message);
  }
}

/* ----- Competitions ----- */
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

/* ----- Classes and years ----- */
const classTaken = (name, id) => classes.some(c => c.id !== id && c.name.toLowerCase() === name.toLowerCase());

// "1st, 2nd, 3rd" becomes ["1st", "2nd", "3rd"]. Blanks and repeats are removed.
function parseYears(text) {
  return [...new Set(text.split(",").map(s => s.trim()).filter(Boolean))];
}

function renderClasses() {
  $("classList").innerHTML = classes.length ? classes.map(c => {
    if (editingClassId === c.id) return `<div class="item" style="flex-wrap:wrap;gap:8px">
      <input type="text" id="clsEditName" value="${esc(c.name)}" placeholder="Class name">
      <input type="text" id="clsEditYears" value="${esc(c.years.join(", "))}" placeholder="Years e.g. 1st, 2nd, 3rd">
      <div class="acts"><button class="btn sm" type="button" data-cact="save" data-id="${c.id}">Save</button>
      <button class="btn ghost sm" type="button" data-cact="cancel">Cancel</button></div></div>`;
    return `<div class="item"><span><strong>${esc(c.name)}</strong> <span class="hint">· ${esc(c.years.join(", "))}</span></span>
      <div class="acts"><button class="btn ghost sm" type="button" data-cact="edit" data-id="${c.id}">Edit</button></div></div>`;
  }).join("") : `<div class="empty" style="border:0">No classes yet. Add one below.</div>`;
}

/* ----- Controls ----- */
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

/* ----- Teams ----- */
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

/* ----- Registrations ----- */
const xlsxReady = () => typeof XLSX !== "undefined";

function indListTable(I) {
  if (!I.length) return `<div class="empty">No individual participants yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Class</th><th>Competitions</th></tr></thead><tbody>
    ${I.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(classLabel(p.cls, p.year))}</td>
    <td><div class="chips">${p.comps.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div></td></tr>`).join("")}
    </tbody></table></div>`;
}

function grpListCards(G) {
  if (!G.length) return `<div class="empty">No groups registered yet.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Team Leader</th><th>Class</th><th>Members</th><th>Competitions</th></tr></thead><tbody>
    ${G.map(g => `<tr><td>${esc(g.leader)}</td><td>${esc(classLabel(g.leaderCls, g.leaderYear))}</td>
    <td>${g.members.map(m => `<div>${esc(m.name)} <span class="hint">· ${esc(classLabel(m.cls, m.year))}</span></div>`).join("")}</td>
    <td><div class="chips">${g.comps.map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div></td></tr>`).join("")}
    </tbody></table></div>`;
}

function renderAdminRegs() {
  const sel = $("teamSel");
  if (!sel.options.length) {
    sel.innerHTML = `<option value="">Select Team</option>` + [1, 2, 3, 4].map(n => `<option value="${n}">${teamName(n)}</option>`).join("");
  }
  sel.value = adminTeam;
  if (!adminTeam) { $("adminOut").innerHTML = `<div class="empty">Select a team to see its registrations.</div>`; return; }
  const t = Number(adminTeam);
  const I = inds.filter(x => x.team === t).sort(byOrder), G = grps.filter(x => x.team === t);
  const dis = (ok) => ok ? "" : "disabled";
  $("adminOut").innerHTML = `
    <div class="sec"><span>Individual participants (${I.length})</span>
      <span class="acts"><button class="btn ghost sm" type="button" data-dl="ind-csv" ${dis(I.length)}>Download CSV</button>
      <button class="btn ghost sm" type="button" data-dl="ind-xlsx" ${dis(I.length && xlsxReady())}>Download Excel</button></span></div>
    ${indListTable(I)}
    <div class="sec"><span>Groups (${G.length})</span>
      <span class="acts"><button class="btn ghost sm" type="button" data-dl="grp-csv" ${dis(G.length)}>Download CSV</button>
      <button class="btn ghost sm" type="button" data-dl="grp-xlsx" ${dis(G.length && xlsxReady())}>Download Excel</button></span></div>
    ${grpListCards(G)}`;
}

// Export: only the Class cell changes, to "Year, Class" (e.g. "3rd Year, Bcom Finance").
// Column layout and the Members format are unchanged.
function indRows(t) {
  const rows = [["Name", "Class", "Team", "Competition"]];
  inds.filter(x => x.team === t).sort(byOrder).forEach(p =>
    rows.push([p.name, exportClass(p.cls, p.year), teamName(t), p.comps.join(", ")]));
  return rows;
}

function grpRows(t) {
  const rows = [["Team Leader", "Leader Class", "Members", "Team Name", "Competition"]];
  grps.filter(x => x.team === t).forEach(g =>
    rows.push([
      g.leader,
      exportClass(g.leaderCls, g.leaderYear),
      g.members.map(m => `${m.name} (${m.cls})`).join("; "),
      teamName(t),
      g.comps.join(", ")
    ]));
  return rows;
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

/* ----- Events ----- */
document.querySelectorAll(".nav").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
$("logout").addEventListener("click", signOut);

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  compTab = t.dataset.tab; editingId = null; pendingDel = null; renderComps();
}));

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
      editingId = null;
      toast("Competition updated");
    }
    if (act === "del") {
      if (pendingDel !== id) { pendingDel = id; renderComps(); return; }
      await api("DELETE", "/api/competitions/" + id);
      pendingDel = null;
      toast("Competition removed");
    }
    await refresh();
  } catch (err) { toast(err.message); }
  renderComps();
});

// Adds one competition per line. Blank lines, spaces and repeated names are ignored.
// Names that already exist for this tab are skipped and left in the box so they can be fixed.
$("addComp").addEventListener("submit", async (e) => {
  e.preventDefault();
  const lines = $("newComps").value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return toast("Enter at least one competition name");

  const seen = new Set();
  const names = lines.filter(n => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const added = [], skipped = [];
  for (const name of names) {
    if (dupe(name, null)) { skipped.push(name); continue; }
    try {
      await api("POST", "/api/competitions", { name, type: compTab });
      added.push(name);
    } catch (err) {
      skipped.push(name);
    }
  }

  $("newComps").value = skipped.join("\n");
  const dupCount = lines.length - names.length;
  let msg = added.length
    ? `Added ${added.length} competition${added.length === 1 ? "" : "s"}`
    : "No competitions added";
  if (skipped.length) msg += `. Skipped ${skipped.length} (already exists or failed)`;
  if (dupCount) msg += `. Ignored ${dupCount} repeated name${dupCount === 1 ? "" : "s"}`;
  toast(msg);

  await refresh();
});

$("classList").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-cact]");
  if (!b) return;
  const act = b.dataset.cact, id = b.dataset.id;
  if (act === "edit") { editingClassId = id; renderClasses(); $("clsEditName")?.focus(); return; }
  if (act === "cancel") { editingClassId = null; renderClasses(); return; }
  if (act === "save") {
    const name = $("clsEditName").value.trim();
    const years = parseYears($("clsEditYears").value);
    if (!name) return toast("Class name cannot be empty");
    if (!years.length) return toast("Enter at least one year");
    if (classTaken(name, id)) return toast("That class already exists");
    try {
      await api("PATCH", "/api/classes/" + id, { name, years });
      editingClassId = null;
      toast("Class updated");
      await refresh();
    } catch (err) { toast(err.message); }
    renderClasses();
  }
});

$("addClass").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("newClassName").value.trim();
  const years = parseYears($("newClassYears").value);
  if (!name) return;
  if (!years.length) return toast("Enter at least one year");
  if (classTaken(name, null)) return toast("That class already exists");
  try {
    await api("POST", "/api/classes", { name, years });
    $("newClassName").value = "";
    $("newClassYears").value = "";
    toast("Class added");
    await refresh();
  } catch (err) { toast(err.message); }
});

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
      editingTeam = null;
      toast(teamName(n) + " updated");
      await refresh();
    } catch (err) { toast(err.message); }
    renderTeams();
  }
});

$("teamSel").addEventListener("change", () => { adminTeam = $("teamSel").value; renderAdminRegs(); });

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
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("File saved");
});

/* ----- Start ----- */
if (session) {
  showView("comps");
  startPolling(refresh);
}
