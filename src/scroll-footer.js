/* =========================================================
   SKEEP — Scroll-aware header & footer
   Header (nav.topnav): visible at top, hides while scrolling
   down, reappears while scrolling up.
   Footer: hidden at top, appears while scrolling down, hides
   while scrolling up (the opposite of the header).
   Shared by privacypolicy.html and termsconditions.html.
   ========================================================= */
(function () {
  const nav = document.querySelector('nav.topnav');
  const footer = document.querySelector('footer');
  if (!nav && !footer) return;

  if (footer) {
    footer.classList.add('scroll-footer');

    // Reserve space at the bottom of the page so the fixed-position
    // footer never overlaps the last section of real content.
    function reserveSpace() {
      document.body.style.paddingBottom = footer.offsetHeight + 'px';
    }
    reserveSpace();
    window.addEventListener('resize', reserveSpace);
  }

  let lastY = window.scrollY;
  let queued = false;

  function update() {
    const y = Math.max(window.scrollY, 0);
    const scrollingDown = y > lastY;
    const scrollingUp = y < lastY;

    if (y <= 0) {
      // Top of page: header visible, footer out of the way.
      if (nav) nav.classList.remove('nav-hidden');
      if (footer) footer.classList.add('footer-hidden');
    } else if (scrollingDown) {
      if (nav) nav.classList.add('nav-hidden');
      if (footer) footer.classList.remove('footer-hidden');
    } else if (scrollingUp) {
      if (nav) nav.classList.remove('nav-hidden');
      if (footer) footer.classList.add('footer-hidden');
    }

    lastY = y;
    queued = false;
  }

  window.addEventListener('scroll', function () {
    if (!queued) {
      window.requestAnimationFrame(update);
      queued = true;
    }
  }, { passive: true });
})();
