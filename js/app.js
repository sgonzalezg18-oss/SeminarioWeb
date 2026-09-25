
const API_BASE = "https://back-semprivado-umg-h6fkf2bng2avgrgw.westus3-01.azurewebsites.net";

const CARNE_REGEX = /^\d{4}-\d{2}-\d{5}$/;
const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_REGEX = /^\d+$/;

let videoModalInst = null;
let videosCache = [];
let categoriaActual = "";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);


function esc(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function mostrarAlerta(mensaje, tipo = "danger") {
  const alerta = $("#authAlert");
  alerta.className = `alert alert-${tipo}`;
  alerta.textContent = mensaje;
  alerta.classList.remove("d-none");
}

function ocultarAlerta() {
  $("#authAlert").classList.add("d-none");
}

async function apiFetch(path, opciones = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opciones,
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 403) {
    throw new Error(datos.mensaje || datos.message || `Error ${res.status}`);
  }
  return { status: res.status, datos };
}

// Sesion
function guardarSesion(estudiante) {
  localStorage.setItem("sv_estudiante", JSON.stringify(estudiante));
}

function obtenerSesion() {
  try {
    return JSON.parse(localStorage.getItem("sv_estudiante") || "null");
  } catch {
    return null;
  }
}

function esVisitante() {
  return !obtenerSesion();
}

// Bloqueo visual de acciones interactivas para visitantes
function requiereLogin() {
  if (esVisitante()) {
    mostrarAlerta("Debes iniciar sesión para realizar esta acción. Regístrate o inicia sesión primero.", "warning");
    mostrarAuthView();
    return false;
  }
  return true;
}

// Cambios entre login y pantalla videos
function mostrarAuthView() {
  $("#authView").hidden = false;
  $("#appView").hidden = true;
  if (window.videoModal) window.videoModal.hide();
  ocultarModal();
}

function mostrarAppView() {
  $("#authView").hidden = true;
  $("#appView").hidden = false;
}

// Registro
async function registrar(e) {
  e.preventDefault();
  ocultarAlerta();

  const carne = $("#regCarne").value.trim().toUpperCase();
  const nombre = $("#regNombre").value.trim().toUpperCase();
  const correo = $("#regCorreo").value.trim().toLowerCase();
  const password = $("#regPassword").value.trim();

  const errores = [];
  if (!CARNE_REGEX.test(carne)) errores.push("#regCarne");
  if (nombre.length === 0) errores.push("#regNombre");
  if (!CORREO_REGEX.test(correo)) errores.push("#regCorreo");
  if (!PIN_REGEX.test(password)) errores.push("#regPassword");

  $$("#registerForm .is-invalid").forEach((el) => el.classList.remove("is-invalid"));
  errores.forEach((sel) => $(sel).classList.add("is-invalid"));
  if (errores.length) return;

  setLoading("#regSpinner", true);
  try {
    const { datos } = await apiFetch("/api/estudiantes/registrar", {
      method: "POST",
      body: JSON.stringify({ carne, estudiante: nombre, correo, password }),
    });
    $("#registerForm").reset();
    cambiarTab("login");
    mostrarAlerta(datos.mensaje || "Registro exitoso. Ahora inicia sesión.", "success");
  } catch (err) {
    mostrarAlerta(err.message);
  } finally {
    setLoading("#regSpinner", false);
  }
}

// Login
async function login(e) {
  e.preventDefault();
  ocultarAlerta();

  const usuario = $("#loginUsuario").value.trim();
  const password = $("#loginPassword").value.trim();

  let valido = true;
  $$("#loginForm .is-invalid").forEach((el) => el.classList.remove("is-invalid"));
  if (!usuario) { $("#loginUsuario").classList.add("is-invalid"); valido = false; }
  if (!password) { $("#loginPassword").classList.add("is-invalid"); valido = false; }
  if (!valido) return;

  setLoading("#loginSpinner", true);
  try {
    const { datos } = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ usuario, password }),
    });
    guardarSesion(datos.estudiante);
    $("#loginForm").reset();
    ocultarModal();
    initApp();
  } catch (err) {
    mostrarAlerta(err.message);
  } finally {
    setLoading("#loginSpinner", false);
  }
}

function cerrarSesion() {
  localStorage.removeItem("sv_estudiante");
  mostrarAuthView();
}

function setLoading(spinnerSel, activo) {
  $(spinnerSel).classList.toggle("d-none", !activo);
}

function cambiarTab(tab) {
  const esLogin = tab === "login";
  $("#tabLoginBtn").classList.toggle("active", esLogin);
  $("#tabRegisterBtn").classList.toggle("active", !esLogin);
  $("#loginForm").hidden = !esLogin;
  $("#registerForm").hidden = esLogin;
  ocultarAlerta();
}

// Vista principal
async function initApp() {
  const sesion = obtenerSesion();
  $("#navUserName").textContent = sesion.nombre;
  $("#navUserCarne").textContent = sesion.carne;
  $("#galeriaTitulo").textContent = "Catálogo de videos";
  $("#searchInput").value = "";
  categoriaActual = "";
  mostrarAppView();
  await cargarCategorias();
  await cargarVideos();
}

async function cargarCategorias() {
  try {
    const { datos } = await apiFetch("/api/videos/categorias");
    const pills = $("#categoriaPills");
    pills.innerHTML = "";

    const btnTodas = crearPillBtn("Todas", "", true);
    pills.appendChild(btnTodas);

    datos.forEach((cat) => pills.appendChild(crearPillBtn(cat, cat)));
  } catch (err) {
    console.error("No se pudieron cargar las categorías", err);
  }
}

function crearPillBtn(texto, valor, activo = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm btn-outline-primary" + (activo ? " active" : "");
  btn.textContent = texto;
  btn.addEventListener("click", () => {
    categoriaActual = valor;
    $("#searchInput").value = "";
    $$("#categoriaPills .btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    cargarVideos(valor);
  });
  return btn;
}

async function cargarVideos(categoria) {
  const sesion = obtenerSesion();
  try {
    let datos;
    if (categoria) {
      datos = (await apiFetch("/api/videos/categoria/" + encodeURIComponent(categoria))).datos;
    } else {
      datos = (await apiFetch("/api/videos")).datos;
    }
    videosCache = datos;
    renderVideos(datos, sesion);
  } catch (err) {
    console.error("Error cargando videos", err);
  }
}

function renderVideos(videos) {
  const sesion = obtenerSesion();
  const grid = $("#videosGrid");
  $("#videoCount").textContent = `${videos.length} video(s)`;

  if (!videos.length) {
    grid.innerHTML = "";
    $("#videosEmpty").classList.remove("d-none");
    return;
  }
  $("#videosEmpty").classList.add("d-none");

  grid.innerHTML = videos.map((v) => cardHTML(v, sesion)).join("");
}

function cardHTML(v, sesion) {
  const yaDioLike = sesion && v.usuariosLikes && v.usuariosLikes.includes(sesion.carne);
  const likeClase = yaDioLike ? "active" : "";
  return `
  <div class="col-sm-6 col-lg-4 col-xl-3">
    <div class="card video-card shadow-sm">
      <img src="${esc(v.poster)}" class="card-img-top" alt="${esc(v.titulo)}" onerror="this.src='https://placehold.co/600x400/6c757d/white?text=Sin+p%C3%B3ster'" />
      <div class="card-body d-flex flex-column">
        <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-1">
          <span class="badge bg-primary text-uppercase small">${esc(v.categoria)}</span>
          <span class="badge bg-light text-dark border"><i class="bi bi-clock me-1"></i>${esc(v.duracion)}</span>
        </div>
        <h6 class="card-title">${esc(v.titulo)}</h6>
        <p class="card-text">${esc(v.descripcion)}</p>
        <div class="d-flex align-items-center justify-content-between mt-auto pt-3">
          <button class="btn btn-sm like-btn btn-outline-danger ${likeClase}" data-like="${v.id}">
            <i class="bi ${yaDioLike ? "bi-heart-fill" : "bi-heart"}"></i>
            <span class="like-count">${v.likes ?? 0}</span>
          </button>
          <button class="btn btn-sm btn-primary" data-ver="${v.id}"><i class="bi bi-play-fill"></i> Ver video</button>
        </div>
      </div>
    </div>
  </div>`;
}

// Busqueda
function buscar() {
  const termino = $("#searchInput").value.trim().toLowerCase();
  const filtrados = videosCache.filter((v) => v.titulo.toLowerCase().includes(termino));
  renderVideos(filtrados);
}

// ================================================================
// Modal de video: reproducción, like y comentarios
// ================================================================
async function abrirVideo(id) {
  try {
    const { datos: v } = await apiFetch("/api/videos/" + id);
    $("#videoModalTitle").textContent = v.titulo;
    $("#videoModalBody").innerHTML = modalVideoHTML(v);
    videoModalInst = videoModalInst || new bootstrap.Modal("#videoModal");
    videoModalInst.show();
  } catch (err) {
    console.error("No se pudo abrir el video", err);
  }
}

function modalVideoHTML(v) {
  const sesion = obtenerSesion();
  const yaDioLike = sesion && v.usuariosLikes && v.usuariosLikes.includes(sesion.carne);
  const likeClase = yaDioLike ? "active" : "";
  const comentarios = (v.comentarios || []).map((c) => comentarioHTML(c, sesion)).join("");

  return `
    <video class="w-100" controls autoplay src="${esc(v.urlVideo)}"></video>

    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3">
      <div>
        <h5 class="mb-1 fw-bold">${esc(v.titulo)}</h5>
        <div>
          <span class="badge bg-primary text-uppercase">${esc(v.categoria)}</span>
          <span class="badge bg-light text-dark border mx-1"><i class="bi bi-clock"></i> ${esc(v.duracion)}</span>
          <span class="badge bg-light text-dark border"><i class="bi bi-view-list"></i> ${v.likes ?? 0} likes</span>
        </div>
        <p class="text-muted small mt-2 mb-0">${esc(v.descripcion)}</p>
      </div>
      <button class="btn like-btn btn-outline-danger ${likeClase} px-4" data-modal-like="${v.id}">
        <i class="bi ${yaDioLike ? "bi-heart-fill" : "bi-heart"}"></i>
        <span class="like-count">${v.likes ?? 0}</span> Me gusta
      </button>
    </div>

    <hr />
    <h6 class="fw-bold"><i class="bi bi-chat-left-text me-2"></i>Comentarios (${(v.comentarios || []).length})</h6>

    <div class="mb-3">
      <textarea class="form-control" id="nuevoComentario" rows="2" placeholder="${esVisitante() ? "Inicia sesión para comentar" : "Escribe un comentario..."}"></textarea>
      <button class="btn btn-primary btn-sm mt-2" data-comentar="${v.id}">Comentar</button>
    </div>

    <div id="areaComentarios">
      ${comentarios || '<p class="text-muted small">Aún no hay comentarios. ¡Sé el primero!</p>'}
    </div>
  `;
}

function comentarioHTML(c, sesion) {
  const esPropietario = sesion && c.carne === sesion.carne;
  const respuestas = (c.respuestas || []).map((r) => respuestaHTML(r, sesion)).join("");

  return `
    <div class="comment-box p-3 mb-3 comment-id-${c.id}">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="d-flex gap-2">
          <span class="rounded-circle bg-primary text-white d-inline-flex align-items-center justify-content-center flex-shrink-0" style="width:34px;height:34px;">
            <i class="bi bi-person"></i>
          </span>
          <div>
            <div class="comment-name">${esc(c.estudiante)} <span class="text-muted ms-1">· ${esc(c.carne)}</span></div>
            <div class="comment-fecha">${esc(c.fecha)}</div>
          </div>
        </div>
        ${esPropietario
          ? `<button class="btn btn-sm btn-outline-danger" data-eliminar="${c.id}" title="Eliminar comentario"><i class="bi bi-trash"></i></button>`
          : ""}
      </div>
      <p class="comment-texto mt-2">${esc(c.texto)}</p>

      <button class="btn btn-sm btn-link text-primary p-0" data-responder="${c.id}"><i class="bi bi-reply me-1"></i>Responder</button>

      <div class="respuesta-form d-none mt-2">
        <textarea class="form-control form-control-sm" rows="2" placeholder="Escribe tu respuesta..."></textarea>
        <button class="btn btn-primary btn-sm mt-1" data-enviar-respuesta="${c.id}">Responder</button>
      </div>

      <div class="mt-2 d-flex flex-column gap-2">
        ${respuestas}
      </div>
    </div>`;
}

function respuestaHTML(r, sesion) {
  const esPropietario = sesion && r.carne === sesion.carne;
  return `
    <div class="respuesta p-2 comment-id-${r.id}">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div>
          <div class="comment-name">${esc(r.estudiante)} <span class="text-muted ms-1">· ${esc(r.carne)}</span></div>
          <div class="comment-fecha">${esc(r.fecha)}</div>
        </div>
        ${esPropietario
          ? `<button class="btn btn-sm btn-outline-danger" data-eliminar="${r.id}" title="Eliminar respuesta"><i class="bi bi-trash"></i></button>`
          : ""}
      </div>
      <p class="comment-texto mt-1">${esc(r.texto)}</p>
    </div>`;
}


async function toggleLike(videoId) {
  if (!requiereLogin()) return;
  const sesion = obtenerSesion();
  try {
    const { datos } = await apiFetch(`/api/interaccionvideo/${videoId}/like`, {
      method: "POST",
      body: JSON.stringify({ carne: sesion.carne }),
    });
    datos.likesTotales = datos.likesTotales ?? datos.likes ?? 0;
    actualizarLikesEnUI(videoId, datos.likesTotales, datos.dioLike);
    // Refresca el video abierto en el modal para mantener los datos consistentes
    const modalAbierto = $("#videoModalBody").innerHTML.trim() !== "";
    if (modalAbierto && window.trackedVideoId === videoId) abrirVideo(videoId);
  } catch (err) {
    console.error("Error en like", err);
  }
}

function actualizarLikesEnUI(videoId, total, dioLike) {
  const video = videosCache.find((v) => v.id == videoId);
  if (video) {
    video.likes = total;
    if (video.usuariosLikes === undefined) video.usuariosLikes = [];
    const sesion = obtenerSesion();
    if (dioLike && !video.usuariosLikes.includes(sesion.carne)) video.usuariosLikes.push(sesion.carne);
    if (!dioLike) video.usuariosLikes = video.usuariosLikes.filter((c) => c !== sesion.carne);
  }

  $$(`#videosGrid [data-like="${videoId}"]`).forEach((btn) => {
    const icono = btn.querySelector("i");
    btn.classList.toggle("active", dioLike);
    if (icono) icono.className = `bi ${dioLike ? "bi-heart-fill" : "bi-heart"}`;
    const contador = btn.querySelector(".like-count");
    if (contador) contador.textContent = total;
  });
}

// Agregar comentarios
async function publicarComentario(videoId) {
  if (!requiereLogin()) return;
  const sesion = obtenerSesion();
  const texto = $("#nuevoComentario").value.trim();
  if (!texto) return;

  try {
    await apiFetch(`/api/interaccionvideo/${videoId}/comentario`, {
      method: "POST",
      body: JSON.stringify({ carne: sesion.carne, texto }),
    });
    $("#nuevoComentario").value = "";
    abrirVideo(videoId);
  } catch (err) {
    console.error("Error al comentar", err);
  }
}

async function responderComentario(comentarioId, videoId, form) {
  if (!requiereLogin()) return;
  const sesion = obtenerSesion();
  const texto = form.querySelector("textarea").value.trim();
  if (!texto) return;

  try {
    await apiFetch(`/api/interaccionvideo/comentario/${comentarioId}/responder`, {
      method: "POST",
      body: JSON.stringify({ carne: sesion.carne, texto }),
    });
    abrirVideo(videoId);
  } catch (err) {
    console.error("Error al responder", err);
  }
}

async function eliminarComentario(comentarioId, videoId) {
  if (!requiereLogin()) return;
  const sesion = obtenerSesion();
  if (!confirm("¿Seguro que deseas eliminar este comentario?")) return;

  try {
    const { status } = await apiFetch(
      `/api/interaccionvideo/comentario/${comentarioId}?carne=${encodeURIComponent(sesion.carne)}`,
      { method: "DELETE" }
    );
    if (status === 403) {
      alert("Acceso denegado: No puedes eliminar comentarios de otros estudiantes.");
      return;
    }
    abrirVideo(videoId);
  } catch (err) {
    console.error("Error al eliminar", err);
  }
}

// Cierre Modal
function ocultarModal() {
  try {
    if (videoModalInst) videoModalInst.hide();
  } catch {}
}


// Eventos

function initEventos() {
  $("#tabLoginBtn").addEventListener("click", () => cambiarTab("login"));
  $("#tabRegisterBtn").addEventListener("click", () => cambiarTab("register"));
  $("#loginForm").addEventListener("submit", login);
  $("#registerForm").addEventListener("submit", registrar);
  $("#logoutBtn").addEventListener("click", cerrarSesion);

  $("#searchInput").addEventListener("input", buscar);

  // Acciones en tarjetas y modal (delegación)
  document.addEventListener("click", async (e) => {
    const t = e.target;
    const likeBtn = t.closest("[data-like]");
    if (likeBtn) { e.preventDefault(); toggleLike(likeBtn.dataset.like); return; }

    const verBtn = t.closest("[data-ver]");
    if (verBtn) { e.preventDefault(); abrirVideo(verBtn.dataset.ver); return; }

    const modalLike = t.closest("[data-modal-like]");
    if (modalLike) { e.preventDefault(); toggleLike(modalLike.dataset.modalLike); return; }

    const comentarBtn = t.closest("[data-comentar]");
    if (comentarBtn) { publicarComentario(comentarBtn.dataset.comentar); return; }

    const responderBtn = t.closest("[data-responder]");
    if (responderBtn) {
      const form = responderBtn.parentElement.querySelector(".respuesta-form");
      form.classList.toggle("d-none");
      form.querySelector("textarea").focus();
      return;
    }

    const enviarResp = t.closest("[data-enviar-respuesta]");
    if (enviarResp) {
      responderComentario(enviarResp.dataset.enviarRespuesta, window.trackedVideoId, enviarResp.closest(".respuesta-form"));
      return;
    }

    const eliminarBtn = t.closest("[data-eliminar]");
    if (eliminarBtn) { eliminarComentario(eliminarBtn.dataset.eliminar, window.trackedVideoId); return; }
  });

  // Rastrea qué video está abierto en el modal
  $("#videoModal").addEventListener("show.bs.modal", () => {
    window.trackedVideoId = null;
  });
  document.addEventListener("click", (e) => {
    const verBtn = e.target.closest("[data-ver]");
    if (verBtn) window.trackedVideoId = verBtn.dataset.ver;
  });
}

// Inicio
initEventos();
if (obtenerSesion()) {
  initApp();
} else {
  mostrarAuthView();
}