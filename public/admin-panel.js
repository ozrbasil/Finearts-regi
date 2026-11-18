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
  compTab = t.dataset.tab; editingId = null;
