// Mobile menu toggle + footer year
(function () {
  var btn = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (btn && links) {
    btn.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  var yr = document.querySelector('.yr');
  if (yr) yr.textContent = new Date().getFullYear();
})();
