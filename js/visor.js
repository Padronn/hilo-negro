(function () {
  if (document.getElementById("visor")) return;

  var style = document.createElement("style");
  style.textContent = [
    "#visor[hidden]{display:none !important}",
    "#visor{position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;background:#050505;max-width:100%}",
    "#visor-bar{display:flex;flex-direction:column;gap:.55rem;padding:.7rem .8rem .75rem;background:#000;border-bottom:2px solid #dc2626}",
    "#visor-titulo{margin:0;font-size:1rem;line-height:1.35;font-weight:600}",
    "#visor-hint{margin:0;color:#a3a3a3;font-size:.82rem;line-height:1.35}",
    "#visor-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem}",
    "#visor-bar button{font-family:inherit;font-weight:600;font-size:.95rem;min-height:44px;min-width:44px;padding:.45rem .7rem;border:0;border-radius:999px;background:#fff;color:#000;cursor:pointer}",
    "#visor-bar button:disabled{opacity:.4;cursor:default}",
    "#visor-bar button:focus-visible{outline:2px solid #fff;outline-offset:2px}",
    "#visor-cerrar{background:#dc2626 !important;color:#fff !important}",
    "#visor-stage{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;max-width:100%}",
    "#visor-stage img{display:block;height:auto;max-width:none;margin:0 auto;background:#fff6e0;cursor:zoom-in}",
    "@media (min-width:720px){#visor-bar{flex-direction:row;align-items:center}#visor-copy{flex:1 1 auto}#visor-actions{display:flex;flex:0 0 auto}#visor-bar button{min-width:6.5rem}}"
  ].join("");
  document.head.appendChild(style);

  var visor = document.createElement("div");
  visor.id = "visor";
  visor.hidden = true;
  visor.setAttribute("role", "dialog");
  visor.setAttribute("aria-modal", "true");
  visor.setAttribute("aria-labelledby", "visor-titulo");
  visor.innerHTML =
    '<div id="visor-bar">' +
    '<div id="visor-copy"><p id="visor-titulo"></p><p id="visor-hint">Desliza para recorrer. Acercar agranda el texto. Esc cierra.</p></div>' +
    '<div id="visor-actions">' +
    '<button type="button" data-alejar>Alejar</button>' +
    '<button type="button" data-acercar>Acercar</button>' +
    '<button type="button" id="visor-cerrar" data-cerrar>Cerrar</button>' +
    "</div></div>" +
    '<div id="visor-stage"><img alt=""></div>';
  document.body.appendChild(visor);

  var img = visor.querySelector("img");
  var titulo = document.getElementById("visor-titulo");
  var stage = document.getElementById("visor-stage");
  var acercar = visor.querySelector("[data-acercar]");
  var alejar = visor.querySelector("[data-alejar]");
  var opener = null;
  var scrollY = 0;
  var natural = 0;
  var scales = [];
  var scaleIndex = 0;

  function fitWidth() {
    return Math.max(280, stage.clientWidth);
  }

  function buildScales() {
    var fit = Math.min(fitWidth(), natural);
    var phone = window.innerWidth < 800;
    var reading;
    if (!phone) {
      reading = Math.min(natural, Math.max(fit, 1700));
    } else if (natural > fit * 1.8) {
      reading = Math.min(natural, Math.round(fit * 3.15));
    } else {
      reading = natural;
    }
    var levels = [Math.round(fit)];
    if (reading > fit + 40) levels.push(Math.round(reading));
    var grande = Math.min(natural, phone ? Math.max(reading, 2000) : natural);
    if (grande > levels[levels.length - 1] + 40) levels.push(Math.round(grande));
    return levels;
  }

  function apply() {
    img.style.width = scales[scaleIndex] + "px";
    alejar.disabled = scaleIndex === 0;
    acercar.disabled = scaleIndex === scales.length - 1;
    img.style.cursor = scaleIndex === scales.length - 1 ? "zoom-out" : "zoom-in";
  }

  function layout() {
    natural = img.naturalWidth || natural;
    if (!natural) return;
    scales = buildScales();
    var wide = window.innerWidth >= 700;
    scaleIndex = !wide && scales.length > 1 ? 1 : 0;
    apply();
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
  }

  function open(button) {
    var source = button.querySelector("img");
    if (!source) return;
    opener = button;
    titulo.textContent = button.getAttribute("data-caption") || source.alt || "Menú";
    img.alt = source.alt || titulo.textContent;
    scrollY = window.scrollY || window.pageYOffset || 0;
    visor.hidden = false;
    document.body.classList.add("nav-lock");
    document.body.style.top = "";

    function ready() {
      requestAnimationFrame(layout);
    }
    img.addEventListener("load", ready, { once: true });
    img.src = source.currentSrc || source.src;
    if (img.complete && img.naturalWidth) ready();
    document.getElementById("visor-cerrar").focus();
  }

  function close() {
    if (visor.hidden) return;
    visor.hidden = true;
    if (!document.querySelector(".site-nav.is-open")) document.body.classList.remove("nav-lock");
    window.scrollTo(0, scrollY);
    if (opener) opener.focus();
  }

  document.addEventListener("click", function (event) {
    var ampliar = event.target.closest("[data-ampliar]");
    if (ampliar) {
      event.preventDefault();
      open(ampliar);
      return;
    }
    if (visor.hidden) return;
    if (event.target.closest("[data-cerrar]")) close();
    else if (event.target.closest("[data-acercar]") && scaleIndex < scales.length - 1) {
      scaleIndex += 1;
      apply();
    } else if (event.target.closest("[data-alejar]") && scaleIndex > 0) {
      scaleIndex -= 1;
      apply();
    }
  });

  img.addEventListener("click", function () {
    if (!scales.length) return;
    scaleIndex = scaleIndex < scales.length - 1 ? scaleIndex + 1 : 0;
    apply();
  });

  document.addEventListener("keydown", function (event) {
    if (visor.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if ((event.key === "+" || event.key === "=") && scaleIndex < scales.length - 1) {
      scaleIndex += 1;
      apply();
    } else if ((event.key === "-" || event.key === "_") && scaleIndex > 0) {
      scaleIndex -= 1;
      apply();
    }
  });

  window.addEventListener("resize", function () {
    if (visor.hidden || !natural) return;
    var current = scales[scaleIndex];
    scales = buildScales();
    var nearest = 0;
    for (var i = 1; i < scales.length; i += 1) {
      if (Math.abs(scales[i] - current) < Math.abs(scales[nearest] - current)) nearest = i;
    }
    scaleIndex = nearest;
    apply();
  });
})();
