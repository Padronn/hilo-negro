(function () {
  var root = document.querySelector(".site-nav");
  var toggle = document.querySelector("[data-nav-toggle]");
  var panel = document.getElementById("nav-panel");
  if (!root || !toggle || !panel) return;

  var label = toggle.querySelector(".sr-only");

  function syncNavHeight() {
    document.documentElement.style.setProperty("--nav-h", root.offsetHeight + "px");
  }

  syncNavHeight();
  window.addEventListener("resize", syncNavHeight);

  function setOpen(open) {
    panel.hidden = !open;
    root.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("nav-lock", open);
    if (label) label.textContent = open ? "Cerrar menú" : "Abrir menú";
  }

  toggle.addEventListener("click", function () {
    setOpen(panel.hidden);
  });

  panel.addEventListener("click", function (event) {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 1180 && !panel.hidden) setOpen(false);
  });
})();
