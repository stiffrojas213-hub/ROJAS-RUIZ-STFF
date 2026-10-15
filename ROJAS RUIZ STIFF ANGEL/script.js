// Portafolio de Angel: carpetas y archivos guardados en IndexedDB del navegador.
const DB_NAME = "AngelPortfolioDB";
const DB_VERSION = 1;
let db;
let currentFolderId = null;
let allItemsMode = true;
let pendingRenameId = null;
let pendingDeleteId = null;

// ===== INICIO DE SESIÓN SIMPLE (sin servidores) =====
const ADMIN_USER = "STIFF";      // tu usuario
const ADMIN_PASS = "1234";       // tu contraseña
let isAdmin = sessionStorage.getItem("angelAdmin") === "1";

const $ = (id) => document.getElementById(id);
const grid = $("itemsGrid");
const emptyState = $("emptyState");
const notice = $("notice");
const fileInput = $("fileInput");
const searchInput = $("searchInput");

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("items")) {
        const store = database.createObjectStore("items", { keyPath: "id" });
        store.createIndex("parentId", "parentId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function store(mode = "readonly") {
  return db.transaction("items", mode).objectStore("items");
}
function getAllItems() {
  return new Promise((resolve, reject) => {
    const request = store().getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function saveItem(item) {
  return new Promise((resolve, reject) => {
    const request = store("readwrite").put(item);
    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
}
function deleteItem(id) {
  return new Promise((resolve, reject) => {
    const request = store("readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
function applyAccess() {
  $("loginOverlay").classList.toggle("hidden", isAdmin);
  $("loginToggleBtn").textContent = isAdmin ? "Cerrar sesión" : "Iniciar sesión";
  document.body.classList.toggle("guest-mode", !isAdmin);
  render();
}
function requireAdmin() {
  if (isAdmin) return true;
  showNotice("Solo el administrador puede modificar los archivos.");
  $("loginOverlay").classList.remove("hidden");
  return false;
}
function makeId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}
function safeText(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function showNotice(message) {
  notice.textContent = message;
  notice.classList.add("visible");
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => notice.classList.remove("visible"), 4500);
}
function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isInside(item, folderId, items) {
  let parent = item.parentId;
  while (parent) {
    if (parent === folderId) return true;
    const parentItem = items.find(entry => entry.id === parent);
    parent = parentItem ? parentItem.parentId : null;
  }
  return false;
}
function descendantsOf(folderId, items) {
  return items.filter(item => isInside(item, folderId, items));
}
async function render() {
  const items = await getAllItems();
  const query = searchInput.value.trim().toLowerCase();
  const folder = items.find(item => item.id === currentFolderId);
  $("currentFolderName").textContent = allItemsMode ? "Todos los elementos" : (folder?.name || "Carpeta");
  $("managerTitle").textContent = allItemsMode ? "Mis archivos" : (folder?.name || "Mis archivos");
  $("upBtn").disabled = allItemsMode || !folder;
  $("itemCount").textContent = `${items.length} elementos en total`;
  const canEdit = isAdmin && !query;
  $("newFolderBtn").style.display = canEdit ? "" : "none";
  document.querySelector(".upload-label").style.display = canEdit ? "" : "none";
  $("emptyCreateBtn").style.display = canEdit ? "" : "none";
  let visible;
  if (query) {
    visible = items.filter(item => item.name.toLowerCase().includes(query));
  } else if (allItemsMode) {
    visible = items.filter(item => !item.parentId);
  } else {
    visible = items.filter(item => item.parentId === currentFolderId);
  }
  visible.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, "es") : (a.type === "folder" ? -1 : 1));
  grid.innerHTML = "";
  for (const item of visible) {
    const card = document.createElement("article");
    card.className = "item-card";
    const folder = item.type === "folder";
    const icon = folder ? "▰" : (item.mimeType?.startsWith("image/") ? "▧" : "▤");
    const details = folder ? "Carpeta" : `${fileSize(item.size || 0)} · ${item.mimeType || "Archivo"}`;
    card.innerHTML = `
      <button class="item-open" data-open="${safeText(item.id)}" title="${folder ? "Abrir carpeta" : "Abrir archivo"}">
        <span class="item-icon ${folder ? "" : "file"}">${icon}</span>
        <span class="item-copy"><strong>${safeText(item.name)}</strong><small>${details}</small></span>
      </button>
      <div class="item-menu">
${folder ? `
${isAdmin ? `        <button data-rename="${safeText(item.id)}">Renombrar</button>
        <button class="delete-action" data-delete="${safeText(item.id)}">Eliminar</button>` : ``}` : `
  <button data-open="${safeText(item.id)}">Abrir</button>
  <button data-download="${safeText(item.id)}">Descargar</button>
${isAdmin ? `  <button data-rename="${safeText(item.id)}">Renombrar</button>
  <button class="delete-action" data-delete="${safeText(item.id)}">Eliminar</button>` : ``}`}
      </div>`;
    grid.appendChild(card);
  }
  emptyState.classList.toggle("visible", visible.length === 0);
  if (query) {
    emptyState.querySelector("h4").textContent = visible.length ? "" : "No encontramos resultados";
    emptyState.querySelector("p").textContent = visible.length ? "" : "Prueba con otro nombre de archivo o carpeta.";
    $("emptyCreateBtn").style.display = "none";
  } else {
    emptyState.querySelector("h4").textContent = "Tu espacio está listo";
    emptyState.querySelector("p").textContent = "Crea una carpeta para una asignatura o sube tu primer trabajo.";
    $("emptyCreateBtn").style.display = "inline-flex";
  }
}
async function createFolder() {
  if (!requireAdmin()) return;
  const name = prompt("Escribe el nombre de la carpeta o asignatura:");
  if (name === null) return;
  const clean = name.trim();
  if (!clean) return showNotice("Escribe un nombre antes de continuar.");
  const items = await getAllItems();
  if (items.some(item => item.parentId === (allItemsMode ? null : currentFolderId) && item.name.toLowerCase() === clean.toLowerCase())) {
    return showNotice("Ya existe un elemento con ese nombre en esta carpeta.");
  }
  await saveItem({ id: makeId(), name: clean, type: "folder", parentId: allItemsMode ? null : currentFolderId, createdAt: Date.now() });
  await render();
  showNotice(`Carpeta "${clean}" creada.`);
}
async function uploadFiles(files) {
  if (!requireAdmin()) return;
  if (!files.length) return;
  for (const file of files) {
    const items = await getAllItems();
    const parentId = allItemsMode ? null : currentFolderId;
    if (items.some(item => item.parentId === parentId && item.name.toLowerCase() === file.name.toLowerCase())) {
      showNotice(`Ya existe "${file.name}" en esta ubicación. Renombra el archivo e inténtalo de nuevo.`);
      continue;
    }
    await saveItem({ id: makeId(), name: file.name, type: "file", parentId, blob: file, size: file.size, mimeType: file.type || "application/octet-stream", createdAt: Date.now() });
  }
  fileInput.value = "";
  await render();
  showNotice("Carga terminada. Los archivos se guardan en este navegador.");
}
let viewerUrl = null;

async function openItem(id) {
  const items = await getAllItems();
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  if (item.type === "folder") {
    currentFolderId = item.id;
    allItemsMode = false;
    searchInput.value = "";
    await render();
    return;
  }
  if (!item.blob) return showNotice("No se encontró el contenido de este archivo.");
  openViewer(item);
}

// Muestra el archivo en una ventana emergente DENTRO de la misma página.
function openViewer(item) {
  const dialog = $("viewerDialog");
  const body = $("viewerBody");
  closeViewerUrl();
  viewerUrl = URL.createObjectURL(item.blob);

  $("viewerName").textContent = item.name;
  $("viewerDownloadBtn").href = viewerUrl;
  $("viewerDownloadBtn").download = item.name;

  body.innerHTML = "";
  if (item.mimeType?.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = viewerUrl;
    img.alt = item.name;
    body.appendChild(img);
  } else {
    const wrap = document.createElement("div");
    wrap.className = "viewer-file";
    wrap.innerHTML = `<span class="viewer-file-icon">▤</span>
      <span>${safeText(item.name)}</span>
      <span>${fileSize(item.size || 0)} · ${safeText(item.mimeType || "Archivo")}</span>
      <span>Este tipo de archivo no se puede previsualizar, pero puedes descargarlo.</span>`;
    body.appendChild(wrap);
  }
  dialog.showModal();
}

function closeViewerUrl() {
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null; }
}

function closeViewer() {
  $("viewerDialog").close();
  closeViewerUrl();
}
async function renameItem(id) {
  if (!requireAdmin()) return;
  const items = await getAllItems();
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  pendingRenameId = id;
  $("renameInput").value = item.name;
  $("renameDialog").showModal();
  $("renameInput").focus();
}
async function saveRename() {
  const name = $("renameInput").value.trim();
  if (!name) return showNotice("El nombre no puede quedar vacío.");
  const items = await getAllItems();
  const item = items.find(entry => entry.id === pendingRenameId);
  if (!item) return;
  if (items.some(other => other.id !== item.id && other.parentId === item.parentId && other.name.toLowerCase() === name.toLowerCase())) {
    return showNotice("Ya existe otro elemento con ese nombre en esta carpeta.");
  }
  item.name = name;
  await saveItem(item);
  $("renameDialog").close();
  await render();
  showNotice("Nombre actualizado.");
}
async function askDelete(id) {
  if (!requireAdmin()) return;
  const items = await getAllItems();
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  pendingDeleteId = id;
  $("deleteMessage").textContent = item.type === "folder"
    ? `Se eliminará "${item.name}" y todo lo que contiene. Esta acción no se puede deshacer.`
    : `Se eliminará "${item.name}". Esta acción no se puede deshacer.`;
  $("deleteDialog").showModal();
}
async function confirmDelete() {
  const items = await getAllItems();
  const item = items.find(entry => entry.id === pendingDeleteId);
  if (!item) return;
  const idsToDelete = item.type === "folder" ? [item.id, ...descendantsOf(item.id, items).map(child => child.id)] : [item.id];
  for (const id of idsToDelete) await deleteItem(id);
  $("deleteDialog").close();
  if (currentFolderId && idsToDelete.includes(currentFolderId)) {
    currentFolderId = item.parentId || null;
    allItemsMode = !currentFolderId;
  }
  await render();
  showNotice("Elemento eliminado.");
}

$("newFolderBtn").addEventListener("click", createFolder);
$("emptyCreateBtn").addEventListener("click", createFolder);
$("allItemsBtn").addEventListener("click", async () => { allItemsMode = true; currentFolderId = null; searchInput.value = ""; await render(); });
$("upBtn").addEventListener("click", async () => {
  const items = await getAllItems();
  const folder = items.find(item => item.id === currentFolderId);
  currentFolderId = folder?.parentId || null;
  allItemsMode = !currentFolderId;
  await render();
});
fileInput.addEventListener("change", () => uploadFiles([...fileInput.files]));
searchInput.addEventListener("input", render);
grid.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.open) await openItem(button.dataset.open);
  if (button.dataset.rename) await renameItem(button.dataset.rename);
  if (button.dataset.delete) await askDelete(button.dataset.delete);
if (button.dataset.download) await openItem(button.dataset.download);
});
$("renameForm").addEventListener("submit", event => {
  if (event.submitter?.value === "save") { event.preventDefault(); saveRename(); }
});
$("deleteForm").addEventListener("submit", event => {
  if (event.submitter?.value === "delete") { event.preventDefault(); confirmDelete(); }
});

$("loginForm").addEventListener("submit", event => {
  event.preventDefault();
  const user = $("loginUser").value.trim();
  const pass = $("loginPass").value;
  if (user.toLowerCase() === ADMIN_USER.toLowerCase() && pass === ADMIN_PASS) {
    sessionStorage.setItem("angelAdmin", "1");
    isAdmin = true;
    $("loginError").classList.remove("visible");
    $("loginForm").reset();
    applyAccess();
    showNotice("Sesión iniciada. Ya puedes gestionar tus archivos.");
  } else {
    $("loginError").textContent = "Usuario o contraseña incorrectos.";
    $("loginError").classList.add("visible");
  }
});
$("loginGuestBtn").addEventListener("click", () => {
  $("loginOverlay").classList.add("hidden");
});
$("loginToggleBtn").addEventListener("click", () => {
  if (isAdmin) {
    sessionStorage.removeItem("angelAdmin");
    isAdmin = false;
    currentFolderId = null;
    allItemsMode = true;
    applyAccess();
    showNotice("Sesión cerrada. Modo visitante.");
  } else {
    $("loginOverlay").classList.remove("hidden");
  }
});

$("viewerCloseBtn").addEventListener("click", closeViewer);
$("viewerCloseBtn2").addEventListener("click", closeViewer);
$("viewerDownloadBtn").addEventListener("click", () => $("viewerDialog").close());
$("viewerDialog").addEventListener("click", event => {
  if (event.target === $("viewerDialog")) closeViewer();
});
$("viewerDialog").addEventListener("close", closeViewerUrl);

(async function init() {
  try {
    db = await openDatabase();
    applyAccess();
  } catch (error) {
    console.error(error);
    showNotice("No se pudo iniciar el almacenamiento del navegador. Prueba con una versión actual de Chrome o Edge.");
  }
})();