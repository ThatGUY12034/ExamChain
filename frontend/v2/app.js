/* ExamChain v2 dashboard - same smart contract logic as v1, redesigned interface */
const { ethers } = window;
let CFG = window.EXAMCHAIN; // set by deploy.js for a local node; built in the browser otherwise
const STATUS = ["Scheduled", "Uploaded", "Released", "Compromised", "Cancelled"];
const REQUIRED_APPROVALS = 2;

let provider; // read-only connection to the blockchain
let reader; // contract instance for reads
let contract; // contract instance bound to the current signer
let currentAddr;
let chainOffset = 0; // seconds the chain clock is ahead of the wall clock
let exams = [];
let auditEvents = [];
const blockTimes = {};

// ---------------------------------------------------------------- icons (Lucide paths)

const ICONS = {
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  building: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  tick: '<path d="M20 6 9 17l-5-5"/>',
  x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  forward: '<path d="m13 19 9-7-9-7z"/><path d="m2 19 9-7-9-7z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
function paintIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
    el.removeAttribute("data-icon");
  });
}

const PAGES = {
  dashboard: ["Dashboard", "Live overview of every exam paper secured on the blockchain."],
  admin: ["Admin", "Schedule exams, set the unlock time and manage roles."],
  setter: ["Paper Setter", "Encrypt the question paper and release its key at exam time."],
  authority: ["Authorities", "Two of three authorities must approve before a paper can be unlocked."],
  center: ["Exam Center", "Receive the locked paper early, then decrypt and verify it at exam time."],
  leak: ["Leak Check", "Prove on-chain that a circulating file is the real paper."],
  audit: ["Audit Log", "A permanent, tamper-proof record of every action."],
};

// ---------------------------------------------------------------- helpers

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const short = (h) => (h && h.length > 14 ? h.slice(0, 8) + "…" + h.slice(-6) : h);
const chainNow = () => Math.floor(Date.now() / 1000) + chainOffset;
const fmt = (ts) => new Date(Number(ts) * 1000).toLocaleString();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function label(addr) {
  if (!addr) return "–";
  const a = CFG.accounts.find((x) => x.address.toLowerCase() === addr.toLowerCase());
  return a ? a.label : short(addr);
}

function toast(msg, kind = "") {
  const t = $("#toast");
  t.innerHTML = icon(kind === "ok" ? "check" : kind === "err" ? "x" : "clock") + `<span>${esc(msg)}</span>`;
  t.className = "toast show " + kind;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = "toast " + kind), 4500);
}

function reason(e) {
  const msg = e?.info?.error?.message || e?.error?.message || e?.shortMessage || e?.message || String(e);
  return e?.reason || (msg.match(/reason string '([^']+)'/) || msg.match(/revert ([^"]+)/) || [])[1] || msg;
}

function countdown(unlock) {
  const s = Number(unlock) - chainNow();
  if (s <= 0) return "Exam started";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return "Unlocks in " + (h ? h + "h " : "") + m + "m " + sec + "s";
}

function toLocalInput(ts) {
  const d = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function sha256(bytes) {
  return ethers.hexlify(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function readFile(input) {
  const file = input.files[0];
  return { file, bytes: new Uint8Array(await file.arrayBuffer()) };
}

function blobLink(data, name, type, text) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  return `<a href="${url}" download="${esc(name)}">${icon("download")}${text}</a>`;
}

function result(el, kind, title, html = "") {
  const ico = kind === "ok" ? "check" : kind === "bad" ? "x" : "lock";
  $(el).innerHTML = `<div class="result ${kind}"><div class="result-title">${icon(ico)}${title}</div>${html}</div>`;
}

/** Sends a transaction; shows the smart contract's revert reason if it is rejected. */
async function send(fn, args, okMsg) {
  try {
    const tx = await contract[fn](...args);
    toast("Transaction sent, waiting for block…");
    const receipt = await tx.wait();
    toast(`${okMsg || "Confirmed"} (block #${receipt.blockNumber})`, "ok");
    await refresh();
    return receipt;
  } catch (e) {
    console.error(e);
    toast("Rejected by smart contract: " + reason(e), "err");
    return null;
  }
}

function examById(id) {
  return exams.find((e) => e.id === Number(id));
}

// ---------------------------------------------------------------- setup

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

/** Hosted demo: runs an Ethereum blockchain (Ganache) inside the browser and deploys ExamChain to it. */
async function startInBrowserChain() {
  $("#boot").hidden = false;
  await loadScript("../vendor/ganache.min.js");
  const chain = Ganache.provider({
    wallet: { deterministic: true, totalAccounts: 10 },
    chain: { chainId: 1337 },
    logging: { quiet: true },
  });
  provider = new ethers.BrowserProvider(chain);
  provider.pollingInterval = 500;

  const art = window.EXAMCHAIN_ARTIFACT;
  const addrs = await provider.send("eth_accounts", []);
  const admin = await provider.getSigner(addrs[0]);
  const deployed = await new ethers.ContractFactory(art.abi, art.bytecode, admin).deploy();
  await deployed.waitForDeployment();

  const accounts = art.roles.map((r) => ({ ...r, address: ethers.getAddress(addrs[r.index]) }));
  const grant = { SETTER: "addSetter", AUTHORITY: "addAuthority", CENTER: "addCenter" };
  for (const a of accounts) {
    if (grant[a.role]) await (await deployed[grant[a.role]](a.address)).wait();
  }
  CFG = { address: await deployed.getAddress(), abi: art.abi, accounts, inBrowser: true };

  $("#modeNote").hidden = false;
  $("#metamaskBtn").hidden = true;
}

async function init() {
  paintIcons();
  const forceWeb = new URLSearchParams(location.search).get("mode") === "web";
  try {
    if (CFG && !forceWeb) {
      provider = new ethers.JsonRpcProvider(CFG.rpcUrl);
      if ((await provider.getCode(CFG.address)) === "0x") throw new Error("no contract");
    } else {
      await startInBrowserChain();
    }
  } catch (e) {
    console.error(e);
    $("#boot").hidden = true;
    $("main").innerHTML = CFG?.rpcUrl && !forceWeb
      ? '<div class="panel"><h3>Cannot reach the ExamChain contract</h3><p class="hint">Make sure <code>npm run node</code> is running, then run <code>npm run deploy</code> again (the local chain resets every time the node restarts) and reload this page.</p></div>'
      : `<div class="panel"><h3>Could not start the in-browser blockchain</h3><p class="hint">${esc(e.message)}. Try reloading the page or using Chrome/Edge.</p></div>`;
    return;
  }
  reader = new ethers.Contract(CFG.address, CFG.abi, provider);
  $("#contractAddr").textContent = short(CFG.address);

  const options = CFG.accounts.map((a) => `<option value="${a.address}">${esc(a.label)}</option>`).join("");
  const sel = $("#accountSelect");
  sel.innerHTML = options;
  sel.onchange = () => setAccount(sel.value);
  const roleAccount = $("#roleAccount");
  roleAccount.innerHTML = '<option value="">– choose an account –</option>' + options;
  roleAccount.onchange = () => ($("#roleForm").addr.value = roleAccount.value);
  $("#setterSelect").innerHTML = CFG.accounts
    .filter((a) => a.role === "SETTER")
    .map((a) => `<option value="${a.address}">${esc(a.label)}</option>`)
    .join("");

  bindTabs();
  bindForms();
  await setAccount(CFG.accounts[0].address);
  await syncClock();
  setDefaultUnlock(2);
  await refresh();
  $("#boot").hidden = true;

  provider.on("block", async () => {
    await syncClock();
    await refresh();
  });
  setInterval(tick, 1000);
}

async function setAccount(addr) {
  const signer = await provider.getSigner(addr);
  contract = new ethers.Contract(CFG.address, CFG.abi, signer);
  currentAddr = addr;
  await updateBadge();
  renderApprovals();
}

async function useMetaMask() {
  if (!window.ethereum) return toast("MetaMask not detected in this browser", "err");
  try {
    const bp = new ethers.BrowserProvider(window.ethereum);
    await bp.send("eth_requestAccounts", []);
    const signer = await bp.getSigner();
    currentAddr = await signer.getAddress();
    contract = new ethers.Contract(CFG.address, CFG.abi, signer);
    const sel = $("#accountSelect");
    sel.insertAdjacentHTML("afterbegin", `<option value="mm">MetaMask ${short(currentAddr)}</option>`);
    sel.value = "mm";
    await updateBadge();
    toast("Connected MetaMask account " + short(currentAddr), "ok");
  } catch (e) {
    toast("MetaMask: " + reason(e), "err");
  }
}

async function updateBadge() {
  const roles = [];
  if ((await reader.admin()).toLowerCase() === currentAddr.toLowerCase()) roles.push("ADMIN");
  if (await reader.isSetter(currentAddr)) roles.push("SETTER");
  if (await reader.isAuthority(currentAddr)) roles.push("AUTHORITY");
  if (await reader.isCenter(currentAddr)) roles.push("CENTER");
  $("#roleBadge").textContent = roles.length ? roles.join(" + ") : "NO ROLE";
}

async function syncClock() {
  // Hardhat and Ganache return the total time offset when increasing time by 0.
  try {
    chainOffset = Number(await provider.send("evm_increaseTime", [0]));
  } catch {
    chainOffset = 0;
  }
  $("#blockNo").textContent = await provider.getBlockNumber();
}

function tick() {
  $("#chainTime").textContent = new Date(chainNow() * 1000).toLocaleTimeString();
  $$("[data-unlock]").forEach((el) => (el.textContent = countdown(el.dataset.unlock)));
}

function bindTabs() {
  $$("#tabs button").forEach((btn) => {
    btn.onclick = () => {
      $$("#tabs button").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
      const [title, sub] = PAGES[btn.dataset.tab];
      $("#pageTitle").textContent = title;
      $("#pageSub").textContent = sub;
    };
  });
}

function setDefaultUnlock(mins) {
  $("#scheduleForm").unlock.value = toLocalInput(chainNow() + mins * 60);
}

// ---------------------------------------------------------------- data

async function refresh() {
  const count = Number(await reader.examCount());
  const list = [];
  for (let id = 1; id <= count; id++) {
    const e = await reader.getExam(id);
    list.push({
      id,
      subject: e.subject,
      setter: e.setter,
      unlockTime: Number(e.unlockTime),
      paperHash: e.paperHash,
      encryptedHash: e.encryptedHash,
      keyCommitment: e.keyCommitment,
      revealedKey: e.revealedKey,
      fileName: e.fileName,
      approvals: Number(e.approvals),
      status: Number(e.status),
    });
  }
  exams = list;
  await loadAudit();
  renderSelects();
  renderDashboard();
  renderApprovals();
  renderAudit();
  tick();
}

async function loadAudit() {
  const logs = await reader.queryFilter("*", 0, "latest");
  for (const log of logs) {
    if (!blockTimes[log.blockNumber]) blockTimes[log.blockNumber] = (await provider.getBlock(log.blockNumber)).timestamp;
  }
  auditEvents = logs.filter((l) => l.eventName).reverse();
}

// ---------------------------------------------------------------- rendering

function renderSelects() {
  const options = exams
    .slice()
    .reverse()
    .map((e) => `<option value="${e.id}">#${e.id} – ${esc(e.subject)} (${STATUS[e.status]})</option>`)
    .join("");
  $$(".examSelect").forEach((sel) => {
    const prev = sel.value;
    sel.innerHTML = options || "<option value=''>No exams yet</option>";
    if (prev && examById(prev)) sel.value = prev;
  });
  prefillKey();
}

/** Lifecycle position: 0 scheduled, 1 encrypted, 2 approved, 3 released. */
function stage(e) {
  if (e.status === 2) return 3;
  if (e.status === 1) return e.approvals >= REQUIRED_APPROVALS ? 2 : 1;
  if (e.status === 3) return 1;
  return 0;
}

function stepper(e) {
  const steps = [["Scheduled", "calendar"], ["Encrypted", "lock"], ["Approved", "users"], ["Released", "unlock"]];
  const reached = stage(e);
  const failed = e.status === 3 || e.status === 4;
  return `<div class="stepper">${steps
    .map(([name, ico], i) => {
      const cls = i <= reached ? "done" : failed && i === reached + 1 ? "fail" : "";
      const glyph = cls === "done" ? "tick" : cls === "fail" ? "x" : ico;
      return `<div class="step ${cls}"><span class="node">${icon(glyph)}</span>${name}</div>`;
    })
    .join("")}</div>`;
}

function renderDashboard() {
  const downloads = auditEvents.filter((l) => l.eventName === "PaperDownloaded");
  const leaks = auditEvents.filter((l) => l.eventName === "LeakReported" && l.args.confirmed).length;
  const stats = [
    ["Exams scheduled", exams.length, ""],
    ["Papers locked on-chain", exams.filter((e) => e.status === 1).length, ""],
    ["Papers released", exams.filter((e) => e.status === 2).length, "accent"],
    ["Leaks proven", leaks, leaks ? "danger" : ""],
    ["Audit events", auditEvents.length, ""],
  ];
  $("#stats").innerHTML = stats.map(([k, v, c]) => `<div class="stat ${c}"><b>${v}</b><span>${k}</span></div>`).join("");

  if (!exams.length) {
    $("#examList").innerHTML = '<div class="empty">No exams yet. Open <b>Admin</b> and schedule one.</div>';
    return;
  }
  $("#examList").innerHTML = exams
    .slice()
    .reverse()
    .map((e) => {
      const dl = downloads.filter((l) => Number(l.args.examId) === e.id).length;
      const alert =
        e.status === 3
          ? `<div class="alert-row">${icon("alert")}Leak proven on-chain – exam compromised</div>`
          : e.status === 4
          ? `<div class="alert-row">${icon("x")}Exam cancelled by admin</div>`
          : "";
      return `<article class="exam-card">
        <div class="exam-card-head">
          <div><span class="exam-id">EXAM #${e.id}</span><h4>${esc(e.subject)}</h4></div>
          <span class="status s-${e.status}">${STATUS[e.status]}</span>
        </div>
        ${stepper(e)}
        <dl class="kv">
          <dt>Exam start</dt><dd>${fmt(e.unlockTime)}<br><span class="countdown" data-unlock="${e.unlockTime}"></span></dd>
          <dt>Setter</dt><dd>${esc(label(e.setter))}</dd>
          <dt>File</dt><dd>${e.fileName ? esc(e.fileName) : "Not uploaded yet"}</dd>
          <dt>Paper hash</dt><dd><code title="${e.paperHash}">${e.status ? short(e.paperHash) : "–"}</code></dd>
          <dt>Approvals</dt><dd>${e.approvals} of ${REQUIRED_APPROVALS} required</dd>
          <dt>Downloads</dt><dd>${dl} center(s)</dd>
        </dl>
        ${alert}
      </article>`;
    })
    .join("");
}

async function renderApprovals() {
  const box = $("#approvalList");
  if (!box || !reader) return;
  const pending = exams.filter((e) => e.status === 1);
  if (!pending.length) {
    box.innerHTML = '<div class="empty">No papers waiting for approval.</div>';
    return;
  }
  const rows = [];
  for (const e of pending) {
    const done = currentAddr && (await reader.hasApproved(e.id, currentAddr));
    const meter = Array.from({ length: REQUIRED_APPROVALS }, (_, i) => `<i class="${i < e.approvals ? "on" : ""}"></i>`).join("");
    rows.push(`<div class="approval-row">
      <div>
        <b>#${e.id} · ${esc(e.subject)}</b>
        <div class="approval-meta">${e.approvals} of ${REQUIRED_APPROVALS} approvals · <span data-unlock="${e.unlockTime}">${countdown(e.unlockTime)}</span></div>
        <div class="meter">${meter}</div>
      </div>
      <button class="btn ${done ? "ghost" : "primary"}" data-approve="${e.id}" ${done ? "disabled" : ""}>${done ? icon("tick") + "You approved" : "Approve release"}</button>
    </div>`);
  }
  box.innerHTML = rows.join("");
  box.querySelectorAll("[data-approve]").forEach((b) => {
    b.onclick = () => send("approveRelease", [b.dataset.approve], "Release approved");
  });
}

function describe(log) {
  const a = log.args;
  const admin = label(CFG.accounts[0].address);
  switch (log.eventName) {
    case "RoleGranted":
      return { by: admin, ico: "shield", text: `${a.role} role granted to ${esc(label(a.account))}` };
    case "ExamScheduled":
      return { by: admin, ico: "calendar", text: `"${esc(a.subject)}" unlocks ${fmt(a.unlockTime)}` };
    case "PaperUploaded":
      return { by: label(a.setter), ico: "lock", text: `${esc(a.fileName)} encrypted · hash <code>${short(a.paperHash)}</code>` };
    case "PaperDownloaded":
      return { by: label(a.center), ico: "download", text: "Encrypted paper received" };
    case "ReleaseApproved":
      return { by: label(a.authority), ico: "users", text: `Approval ${a.approvals} of ${REQUIRED_APPROVALS}` };
    case "KeyReleased":
      return { by: label(a.releasedBy), ico: "key", kind: "ok", text: "Decryption key published" };
    case "PaperVerified":
      return a.authentic
        ? { by: label(a.center), ico: "check", kind: "ok", text: "Paper authentic (hash match)" }
        : { by: label(a.center), ico: "x", kind: "bad", text: "Hash mismatch – paper tampered" };
    case "LeakReported":
      return a.confirmed
        ? { by: label(a.reporter), ico: "alert", kind: "bad", text: "LEAK PROVEN – exam compromised" }
        : { by: label(a.reporter), ico: "info", text: "Suspected file is not the real paper" };
    case "ExamCancelled":
      return { by: admin, ico: "x", kind: "bad", text: "Exam cancelled" };
    default:
      return { by: "–", ico: "info", text: "" };
  }
}

function renderAudit() {
  if (!auditEvents.length) {
    $("#auditList").innerHTML = '<li class="empty">No events yet.</li>';
    return;
  }
  $("#auditList").innerHTML = auditEvents
    .map((log) => {
      const d = describe(log);
      const examTag = log.args.examId !== undefined ? `<span class="tl-exam">#${log.args.examId}</span>` : "";
      return `<li class="tl-item ${d.kind ? "k-" + d.kind : ""}">
        <span class="tl-dot">${icon(d.ico)}</span>
        <div class="tl-body">
          <div class="tl-head"><b>${log.eventName}</b>${examTag}<time>${fmt(blockTimes[log.blockNumber])}</time></div>
          <div class="tl-text">${d.text}</div>
          <div class="tl-meta">by ${esc(d.by)} · block #${log.blockNumber}</div>
        </div>
      </li>`;
    })
    .join("");
}

function prefillKey() {
  const form = $("#releaseForm");
  const saved = localStorage.getItem("examchain-key-" + CFG.address + "-" + form.exam.value);
  if (saved && !form.key.value) form.key.value = saved;
}

// ---------------------------------------------------------------- actions

function bindForms() {
  $("#metamaskBtn").onclick = useMetaMask;

  $("#ffBtn").onclick = async () => {
    await provider.send("evm_increaseTime", [300]);
    await provider.send("evm_mine", []);
    await syncClock();
    await refresh();
    toast("Blockchain clock moved forward 5 minutes (demo only)");
  };

  // Admin
  $$("#scheduleForm [data-mins]").forEach((b) => (b.onclick = () => setDefaultUnlock(Number(b.dataset.mins))));
  $("#scheduleForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const unlock = Math.floor(new Date(f.unlock.value).getTime() / 1000);
    await send("scheduleExam", [f.subject.value, f.setter.value, unlock], "Exam scheduled");
  };
  $("#roleForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (!ethers.isAddress(f.addr.value)) return toast("Invalid wallet address", "err");
    if (await send(f.role.value, [f.addr.value], "Role granted")) await updateBadge();
  };
  $("#cancelBtn").onclick = () => send("cancelExam", [$("#roleForm").cancelExam.value], "Exam cancelled");

  // Setter: encrypt in the browser, commit hashes on-chain
  $("#uploadForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const id = f.exam.value;
    if (!id) return toast("Ask the admin to schedule an exam first", "err");
    const { file, bytes } = await readFile(f.file);

    const paperHash = await sha256(bytes);
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, bytes));
    const encrypted = new Uint8Array(iv.length + cipher.length);
    encrypted.set(iv);
    encrypted.set(cipher, iv.length);

    const encryptedHash = await sha256(encrypted);
    const keyHex = ethers.hexlify(keyBytes);
    const commitment = ethers.keccak256(keyBytes);

    const receipt = await send("uploadPaper", [id, paperHash, encryptedHash, commitment, file.name], "Paper locked on blockchain");
    if (!receipt) return;

    localStorage.setItem("examchain-key-" + CFG.address + "-" + id, keyHex);
    result(
      "#uploadResult",
      "ok",
      `Paper encrypted and committed in block #${receipt.blockNumber}`,
      `Paper SHA-256: <code>${paperHash}</code><br>
       Key commitment: <code>${commitment}</code><br><br>
       ${blobLink(encrypted, `exam-${id}-${file.name}.enc`, "application/octet-stream", "Download encrypted paper (.enc)")} – send this to exam centers.<br>
       ${blobLink(keyHex, `exam-${id}-SECRET-KEY.txt`, "text/plain", "Download secret key")} – keep this private until exam time.`
    );
  };

  $("#releaseForm").exam.onchange = () => {
    $("#releaseForm").key.value = "";
    prefillKey();
  };
  $("#keyFile").onchange = async (ev) => {
    $("#releaseForm").key.value = (await ev.target.files[0].text()).trim();
  };
  $("#releaseForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const key = f.key.value.trim();
    if (!ethers.isHexString(key, 32)) return toast("Key must be a 0x… 32-byte hex value", "err");
    await send("releaseKey", [f.exam.value, key], "Key released – exam unlocked");
  };

  // Center: verify encrypted file and log receipt
  $("#receiveForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const exam = examById(f.exam.value);
    if (!exam) return toast("No exam selected", "err");
    const { bytes } = await readFile(f.file);
    const hash = await sha256(bytes);
    if (hash !== exam.encryptedHash) {
      return result("#receiveResult", "bad", "This file does NOT match the encrypted paper on the blockchain", `File hash: <code>${hash}</code><br>Expected: <code>${exam.encryptedHash}</code>`);
    }
    const receipt = await send("logDownload", [exam.id], "Receipt logged on blockchain");
    if (receipt) {
      result("#receiveResult", "ok", "Genuine encrypted paper", `Receipt permanently logged in block #${receipt.blockNumber}.<br>It stays unreadable until the key is released at <b>${fmt(exam.unlockTime)}</b>.`);
    }
  };

  // Center: decrypt with on-chain key and prove authenticity
  $("#decryptForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const exam = examById(f.exam.value);
    if (!exam) return toast("No exam selected", "err");
    if (exam.status !== 2) {
      return result("#decryptResult", "info", "Key not released yet", `Status: ${STATUS[exam.status]} · ${countdown(exam.unlockTime)} · Approvals ${exam.approvals} of ${REQUIRED_APPROVALS}.`);
    }
    const { bytes } = await readFile(f.file);
    let plain;
    try {
      const aesKey = await crypto.subtle.importKey("raw", ethers.getBytes(exam.revealedKey), "AES-GCM", false, ["decrypt"]);
      plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, aesKey, bytes.slice(12)));
    } catch {
      return result("#decryptResult", "bad", "Decryption failed", "This is not the encrypted file for this exam, or it was modified.");
    }
    const hash = await sha256(plain);
    const authentic = hash === exam.paperHash;
    const receipt = await send("recordVerification", [exam.id, hash], "Verification recorded");
    if (!receipt) return;

    const isPdf = exam.fileName.toLowerCase().endsWith(".pdf");
    const type = isPdf ? "application/pdf" : "application/octet-stream";
    const preview = isPdf ? `<iframe class="preview" title="Decrypted question paper" src="${URL.createObjectURL(new Blob([plain], { type }))}"></iframe>` : "";
    result(
      "#decryptResult",
      authentic ? "ok" : "bad",
      authentic ? "AUTHENTIC – matches the original hash on the blockchain" : "TAMPERED – hash does not match",
      `SHA-256: <code>${hash}</code><br>${blobLink(plain, exam.fileName, type, "Download question paper")}${preview}`
    );
  };

  // Public: prove a leak
  $("#leakForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const exam = examById(f.exam.value);
    if (!exam) return toast("No exam selected", "err");
    const { bytes } = await readFile(f.file);
    const hash = await sha256(bytes);
    const receipt = await send("reportLeak", [exam.id, hash], "Report recorded on blockchain");
    if (!receipt) return;
    if (hash === exam.paperHash) {
      result("#leakResult", "bad", "LEAK PROVEN", `This file is exactly the committed question paper (hash match), found before the exam.<br>Exam #${exam.id} is now marked <b>Compromised</b>. Check the Audit Log to see who accessed it.`);
    } else {
      result("#leakResult", "ok", "Not the real paper", `The hash does not match the committed paper. The report is still logged.<br>Hash: <code>${hash}</code>`);
    }
  };
}

init();
