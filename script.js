/* =============================================
   SAMEER PORTFOLIO — 3D CURSOR TRACKING
   ============================================= */

(() => {
  'use strict';

  // ── Detect touch device ──
  const isTouchDevice = () =>
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    matchMedia('(hover: none)').matches;

  // ── State ──
  const mouse = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    normX: 0, // -1 (left) to +1 (right)
    normY: 0  // -1 (top) to +1 (bottom)
  };

  const cursorPos = {
    dot: { x: mouse.x, y: mouse.y },
    ring: { x: mouse.x, y: mouse.y },
    glow: { x: mouse.x, y: mouse.y }
  };

  let isTouch = isTouchDevice();
  let rafId = null;

  // ── DOM Elements ──
  const heroParticles = document.getElementById('heroParticles');
  const contactForm = document.getElementById('contactForm');
  const heroCharacterWrap = document.getElementById('heroCharacterWrap');
  const characterCanvas = document.getElementById('characterCanvas');
  const characterVideo = document.getElementById('characterVideo');

  /* =========================================
     1. POINTER COORDINATE TRACKING (FOR HERO CHARACTER)
     ========================================= */

  let hasUserInteracted = false;
  const characterTouchHint = document.getElementById('characterTouchHint');

  function markUserInteracted() {
    if (!hasUserInteracted) {
      hasUserInteracted = true;
      if (characterTouchHint) {
        characterTouchHint.classList.add('hidden');
      }
    }
  }

  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    // Normalized coordinates from center: -1 to +1
    mouse.normX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.normY = (e.clientY / window.innerHeight - 0.5) * 2;
    markUserInteracted();
  }

  /* ===================================================
     2. CHARACTER HEAD 3D CURSOR TRACKING (DUAL ENGINE)
     =================================================== */

  // State for head tracking
  const headTracking = {
    currentFrame: 60, // starts at neutral center
    targetFrame: 60,
    totalFrames: 122,
    images: [],
    loadedImages: 0,
    useCanvas: false,
    currentRotX: 0,
    currentRotY: 0,
    currentTransX: 0,
    currentTransY: 0
  };

  function setupCharacterHeadTracking() {
    if (!characterCanvas && !characterVideo) return;

    const ctx = characterCanvas ? characterCanvas.getContext('2d') : null;

    let lastDrawnFrame = -1;
    let lastTransform = '';

    // Resize canvas to cover container accurately with DPR and orientation support
    function resizeCanvas() {
      if (!characterCanvas || !ctx) return;
      const rect = characterCanvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      characterCanvas.width = Math.round(rect.width * dpr);
      characterCanvas.height = Math.round(rect.height * dpr);
      lastDrawnFrame = -1;
      drawCurrentFrame();
    }

    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('orientationchange', () => {
      setTimeout(resizeCanvas, 100);
      setTimeout(resizeCanvas, 300);
    }, { passive: true });

    // Use ResizeObserver if supported for container resizing across foldables/tabs
    if (window.ResizeObserver && characterCanvas) {
      const ro = new ResizeObserver(() => {
        resizeCanvas();
      });
      ro.observe(characterCanvas);
    }

    resizeCanvas();

    // Preload image frames in 2 phases so hero renders fast without saturating mobile bandwidth
    function loadFrameIndex(i, onReady) {
      if (headTracking.images[i - 1]) return;
      const img = new Image();
      img.decoding = 'async';
      const numStr = String(i).padStart(3, '0');
      img.src = `frames/frame_${numStr}.jpg`;
      img.onload = () => {
        headTracking.loadedImages++;
        if (!headTracking.useCanvas && (i === 61 || headTracking.loadedImages >= 4)) {
          headTracking.useCanvas = true;
          if (characterVideo) characterVideo.style.display = 'none';
          if (characterCanvas) characterCanvas.style.opacity = '1';
          lastDrawnFrame = -1;
          drawCurrentFrame();
        }
        if (onReady) onReady();
      };
      img.onerror = () => {
        if (headTracking.loadedImages === 0 && i === 61) {
          headTracking.useCanvas = false;
          if (characterVideo) {
            characterVideo.style.display = 'block';
            characterVideo.load();
          }
        }
        if (onReady) onReady();
      };
      headTracking.images[i - 1] = img;
    }

    function preloadFrames() {
      headTracking.images = new Array(headTracking.totalFrames);

      // Phase 1: center neutral frame + key keyframes across the full arc
      const priorityIndices = [61];
      for (let i = 1; i <= headTracking.totalFrames; i += 8) {
        if (i !== 61) priorityIndices.push(i);
      }

      let phase1Pending = priorityIndices.length;
      const remainingIndices = [];
      const prioritySet = new Set(priorityIndices);
      for (let i = 1; i <= headTracking.totalFrames; i++) {
        if (!prioritySet.has(i)) remainingIndices.push(i);
      }

      // Phase 2: load remaining frames in small batches after priority frames settle
      let phase2Started = false;
      function startPhase2() {
        if (phase2Started) return;
        phase2Started = true;
        let cursor = 0;
        const batchSize = 6;

        function nextBatch() {
          const end = Math.min(cursor + batchSize, remainingIndices.length);
          let batchPending = end - cursor;
          if (batchPending <= 0) return;

          for (let j = cursor; j < end; j++) {
            loadFrameIndex(remainingIndices[j], () => {
              batchPending--;
              if (batchPending === 0 && end < remainingIndices.length) {
                const schedule = window.requestIdleCallback || ((fn) => setTimeout(fn, 24));
                schedule(nextBatch);
              }
            });
          }
          cursor = end;
        }

        nextBatch();
      }

      priorityIndices.forEach(idx => {
        loadFrameIndex(idx, () => {
          phase1Pending--;
          if (phase1Pending <= 4) {
            startPhase2();
          }
        });
      });

      setTimeout(startPhase2, 1200);
    }

    preloadFrames();

    // Find exact frame or nearest loaded frame so scrubbing never blanks
    function getBestLoadedFrame(targetIdx) {
      const exact = headTracking.images[targetIdx];
      if (exact && exact.complete && exact.naturalWidth > 0) return exact;

      for (let offset = 1; offset < headTracking.totalFrames; offset++) {
        const right = targetIdx + offset;
        if (right < headTracking.totalFrames) {
          const imgR = headTracking.images[right];
          if (imgR && imgR.complete && imgR.naturalWidth > 0) return imgR;
        }
        const left = targetIdx - offset;
        if (left >= 0) {
          const imgL = headTracking.images[left];
          if (imgL && imgL.complete && imgL.naturalWidth > 0) return imgL;
        }
      }
      return null;
    }

    // Draw active frame to canvas with object-fit: cover logic
    function drawCurrentFrame() {
      if (!headTracking.useCanvas || !ctx || !characterCanvas) return;
      const fIdx = Math.max(0, Math.min(headTracking.totalFrames - 1, Math.round(headTracking.currentFrame) - 1));
      if (fIdx === lastDrawnFrame) return;

      const img = getBestLoadedFrame(fIdx);
      if (!img) return;
      lastDrawnFrame = fIdx;

      const cw = characterCanvas.width;
      const ch = characterCanvas.height;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;

      // Cover calculations with top-biased framing so head/hair never crop
      const scale = Math.max(cw / iw, ch / ih);
      const nw = iw * scale;
      const nh = ih * scale;
      const ox = (cw - nw) / 2;
      const oy = (ch - nh) * 0.15;

      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, ox, oy, nw, nh);
    }

    // Video fallback seeking helper
    let isSeeking = false;
    function updateVideoFallback(time) {
      if (!characterVideo || headTracking.useCanvas) return;
      if (!isSeeking && characterVideo.readyState >= 2) {
        isSeeking = true;
        characterVideo.currentTime = time;
        setTimeout(() => { isSeeking = false; }, 30);
      }
    }

    // Per-frame physics loop for character head tracking
    const introStart = performance.now();

    function updateHead() {
      const isCompact = window.innerWidth <= 900 || isTouch;

      // Mobile intro glance + gentle idle sway until the user touches or tilts
      let activeNormX = mouse.normX;
      let activeNormY = mouse.normY;
      if (isCompact && !hasUserInteracted && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const elapsed = (performance.now() - introStart) / 1000;
        if (elapsed < 2.4) {
          const progress = elapsed / 2.4;
          activeNormX = Math.sin(progress * Math.PI * 2) * 0.55;
          activeNormY = Math.sin(progress * Math.PI) * -0.15;
        } else {
          const idleTime = elapsed - 2.4;
          activeNormX = Math.sin(idleTime * 1.1) * 0.18;
          activeNormY = Math.cos(idleTime * 0.8) * 0.08;
        }
      }

      // 1. Calculate Target Frame based on Cursor / Touch / Idle Position
      // activeNormX ranges from -1 (extreme left) to +1 (extreme right)
      // Horizontal motion maps smoothly across video sequence (frame 1 to frame 122)
      const clampedX = Math.max(-1, Math.min(1, activeNormX));
      const normalizedPos = (clampedX + 1) / 2; // 0 (left) to 1 (right)
      headTracking.targetFrame = 1 + normalizedPos * (headTracking.totalFrames - 1);

      const frameEase = isCompact ? 0.38 : 0.18;
      const tiltEase = isCompact ? 0.28 : 0.12;

      // Smooth interpolation for frame scrub (higher responsiveness on mobile)
      headTracking.currentFrame += (headTracking.targetFrame - headTracking.currentFrame) * frameEase;
      headTracking.currentFrame = Math.max(1, Math.min(headTracking.totalFrames, headTracking.currentFrame));

      // 2. 3D Perspective Rotation for Head & Upper Body
      // Add subtle real-time 3D tilt (rotateX, rotateY) and micro-translation
      const transScale = isCompact ? 0.85 : 1;
      const targetRotY = activeNormX * 12; // tilt left/right
      const targetRotX = -activeNormY * 9; // nod up/down
      const targetTransX = activeNormX * 15 * transScale; // horizontal shift (px)
      const targetTransY = activeNormY * 10 * transScale; // vertical shift (px)

      headTracking.currentRotY += (targetRotY - headTracking.currentRotY) * tiltEase;
      headTracking.currentRotX += (targetRotX - headTracking.currentRotX) * tiltEase;
      headTracking.currentTransX += (targetTransX - headTracking.currentTransX) * tiltEase;
      headTracking.currentTransY += (targetTransY - headTracking.currentTransY) * tiltEase;

      // Apply 3D matrix transform strictly to the character media elements (NOT the text)
      const mediaScale = isCompact ? 1.03 : 1.05;
      const transform3D = `scale(${mediaScale}) translate3d(${headTracking.currentTransX.toFixed(2)}px, ${headTracking.currentTransY.toFixed(2)}px, 0) rotateX(${headTracking.currentRotX.toFixed(2)}deg) rotateY(${headTracking.currentRotY.toFixed(2)}deg)`;

      if (transform3D !== lastTransform) {
        lastTransform = transform3D;
        if (characterCanvas) characterCanvas.style.transform = transform3D;
        if (characterVideo && !headTracking.useCanvas) characterVideo.style.transform = transform3D;
      }

      // Render image or scrub video
      if (headTracking.useCanvas) {
        drawCurrentFrame();
      } else if (characterVideo && characterVideo.duration) {
        const targetTime = ((headTracking.currentFrame - 1) / (headTracking.totalFrames - 1)) * characterVideo.duration;
        updateVideoFallback(targetTime);
      }
    }

    return updateHead;
  }

  /* =========================================
     3. 3D TILT CARDS (Projects & About)
     ========================================= */

  function setupTiltCards() {
    if (isTouch) return;

    const tiltCards = document.querySelectorAll('.tilt-card');

    tiltCards.forEach(card => {
      const rawIntensity = parseFloat(card.dataset.tiltIntensity) || 10;
      const intensity = Math.min(rawIntensity * 0.15, 2.5);

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -intensity;
        const rotateY = ((x - centerX) / centerX) * intensity;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        card.style.transition = 'transform 0.15s ease-out';

        // Update shine position
        const shine = card.querySelector('.about-card-shine, .project-card-shine, .skill-card-shine');
        if (shine) {
          const percentX = (x / rect.width) * 100;
          const percentY = (y / rect.height) * 100;
          shine.style.setProperty('--shine-x', percentX + '%');
          shine.style.setProperty('--shine-y', percentY + '%');
        }
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
        card.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      });
    });
  }

  /* =========================================
     4. MAGNETIC ELEMENTS
     ========================================= */

  function setupMagneticElements() {
    if (isTouch) return;

    const magnetics = document.querySelectorAll('.magnetic');

    magnetics.forEach(el => {
      const strength = parseFloat(el.dataset.strength) || 20;

      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        el.style.transform = `translate3d(${x / (100 / strength)}px, ${y / (100 / strength)}px, 0)`;
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'translate3d(0, 0, 0)';
      });
    });
  }

  /* =========================================
     5. SCROLL REVEAL ANIMATIONS
     ========================================= */

  function setupScrollReveal() {
    const reveals = document.querySelectorAll('.reveal-text');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const rawDelay = parseInt(entry.target.dataset.delay) || 0;
            const delay = Math.min(Math.round(rawDelay * 0.2), 100);
            if (delay === 0) {
              entry.target.classList.add('revealed');
            } else {
              setTimeout(() => {
                entry.target.classList.add('revealed');
              }, delay);
            }
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.02,
        rootMargin: '0px 0px 80px 0px'
      }
    );

    reveals.forEach(el => observer.observe(el));
  }

  /* =========================================
     6. COUNTING ANIMATION
     ========================================= */

  function setupCounters() {
    const counters = document.querySelectorAll('.stat-number[data-count]');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const target = parseInt(el.dataset.count);
            animateCounter(el, 0, target, 1500);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach(el => observer.observe(el));
  }

  function animateCounter(el, start, end, duration) {
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = Math.round(start + (end - start) * eased);

      el.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  /* =========================================
     7. NAVIGATION
     ========================================= */

  /* =========================================
     7. SMOOTH SCROLLING (FOR #ANCHORS)
     ========================================= */

  function setupSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const id = anchor.getAttribute('href');
        if (id === '#') return;
        e.preventDefault();
        const target = document.querySelector(id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  /* =========================================
     8. HERO PARTICLES
     ========================================= */

  function createParticles() {
    if (!heroParticles) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const count = isTouch ? 8 : 18;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.classList.add('particle');

      const size = Math.random() * 3.5 + 1;
      const left = Math.random() * 100;
      const duration = Math.random() * 15 + 10;
      const delay = Math.random() * 12;
      const opacity = Math.random() * 0.4 + 0.15;

      particle.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${left}%;
        bottom: -10px;
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
        opacity: ${opacity};
      `;

      heroParticles.appendChild(particle);
    }
  }

  /* =========================================
     9. CONTACT FORM
     ========================================= */

  function setupContactForm() {
    if (!contactForm) return;
    const statusEl = document.getElementById('formStatus');
    const nextInput = document.getElementById('formNextUrl');

    if (nextInput && window.location.protocol.startsWith('http')) {
      nextInput.value = window.location.href.split('#')[0] + '#contact';
    }

    function openMailtoFallback(name, email, message) {
      const subject = encodeURIComponent(`Portfolio Message from ${name || 'Visitor'}`);
      const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
      window.location.href = `mailto:sameer48960@gmail.com?subject=${subject}&body=${body}`;
    }

    contactForm.addEventListener('submit', (e) => {
      const btn = contactForm.querySelector('button[type="submit"]');
      const span = btn ? btn.querySelector('span') : null;
      const originalText = span ? span.textContent : 'Send Message';

      const name = document.getElementById('name')?.value.trim() || '';
      const email = document.getElementById('email')?.value.trim() || '';
      const message = document.getElementById('message')?.value.trim() || '';

      if (!name || !email || !message) return;

      // When opened directly from disk (file://), FormSubmit blocks Origin: null -> use mailto
      if (window.location.protocol === 'file:') {
        e.preventDefault();
        openMailtoFallback(name, email, message);
        if (span) span.textContent = 'Opening Email App...';
        if (statusEl) {
          statusEl.textContent = 'Local file mode: opened your email app to send to sameer48960@gmail.com.';
          statusEl.className = 'form-status success';
        }
        setTimeout(() => {
          if (span) span.textContent = originalText;
        }, 3000);
        return;
      }

      // On http/https (e.g. Vercel / localhost), let the browser submit the native HTML POST
      // so FormSubmit activation, reCAPTCHA (if any), and email delivery work reliably without CORS blocks.
      if (span) span.textContent = 'Sending...';
      if (btn) {
        setTimeout(() => { btn.disabled = true; }, 0);
      }
    });
  }

  function setupProjectCardLinks() {
    const mobileTabletQuery = window.matchMedia('(max-width: 1024px)');
    document.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (mobileTabletQuery.matches && !e.target.closest('.project-visit-btn')) {
          e.preventDefault();
        }
      });
    });
  }

  function setupMobileNav() {
    const mobileNav = document.getElementById('mobileNav');
    const toggleBtn = document.getElementById('mobileNavToggle');
    if (!mobileNav || !toggleBtn) return;

    function closeMenu() {
      mobileNav.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileNav.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    mobileNav.querySelectorAll('.mobile-nav-link, .mobile-nav-brand').forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (e) => {
      if (mobileNav.classList.contains('open') && !mobileNav.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('open')) {
        closeMenu();
      }
    });

    // Smoothly hide navbar when scrolling down, show when scrolling up
    let lastScrollY = Math.max(0, window.scrollY || window.pageYOffset);
    let scrollTicking = false;

    window.addEventListener('scroll', () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        const currentScrollY = Math.max(0, window.scrollY || window.pageYOffset);
        const delta = currentScrollY - lastScrollY;

        if (currentScrollY <= 40 || mobileNav.classList.contains('open')) {
          mobileNav.classList.remove('nav-hidden');
        } else if (delta > 6 && currentScrollY > 60) {
          mobileNav.classList.add('nav-hidden');
        } else if (delta < -6) {
          mobileNav.classList.remove('nav-hidden');
        }

        lastScrollY = currentScrollY;
        scrollTicking = false;
      });
    }, { passive: true });
  }

  /* =========================================
     10. MARQUEE
     ========================================= */

  function setupMarqueeScroll() {
    const marqueeInner = document.querySelector('.marquee-inner');
    if (!marqueeInner) return;

    window.addEventListener('scroll', () => {
      const scrollSpeed = 1 + Math.abs(window.scrollY) * 0.001;
      marqueeInner.style.animationDuration = Math.max(5, 20 / scrollSpeed) + 's';
    }, { passive: true });
  }

  /* =========================================
     11. TOUCH DEVICE SUPPORT
     ========================================= */

  function setupTouchInteraction() {
    if (!isTouch && window.innerWidth > 900) return;

    let lastTouchTime = 0;

    function updateFromClientPoint(clientX, clientY) {
      lastTouchTime = Date.now();
      markUserInteracted();
      mouse.x = clientX;
      mouse.y = clientY;
      mouse.normX = Math.max(-1, Math.min(1, (clientX / window.innerWidth - 0.5) * 2));
      mouse.normY = Math.max(-1, Math.min(1, (clientY / window.innerHeight - 0.5) * 2));
    }

    // Immediate response on tap and drag across mobile viewports
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        updateFromClientPoint(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updateFromClientPoint(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') {
        updateFromClientPoint(e.clientX, e.clientY);
      }
    }, { passive: true });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') {
        updateFromClientPoint(e.clientX, e.clientY);
      }
    }, { passive: true });

    // Device gyroscope tilt support (yields to active touch)
    if (window.DeviceOrientationEvent) {
      let permitted = false;

      const requestPermission = () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          DeviceOrientationEvent.requestPermission().then(state => {
            if (state === 'granted') {
              permitted = true;
              window.addEventListener('deviceorientation', handleOrientation, true);
            }
          }).catch(() => {});
        } else {
          permitted = true;
          window.addEventListener('deviceorientation', handleOrientation, true);
        }
      };

      document.addEventListener('touchstart', function once() {
        if (!permitted) requestPermission();
        document.removeEventListener('touchstart', once);
      }, { once: true });

      function handleOrientation(e) {
        if (Date.now() - lastTouchTime < 1200) return;
        if (e.gamma === null && e.beta === null) return;
        const gamma = e.gamma || 0; // left/right tilt (-90 to 90)
        const beta = e.beta || 0;   // front/back tilt (-180 to 180)

        mouse.normX = Math.max(-1, Math.min(1, gamma / 20));
        mouse.normY = Math.max(-1, Math.min(1, (beta - 40) / 20));
      }
    }
  }

  /* =========================================
     12. MAIN ANIMATION LOOP
     ========================================= */

  function init() {
    // Setup pointer tracking (works for mouse and mobile/hybrid viewports)
    document.addEventListener('mousemove', onMouseMove, { passive: true });

    // Initialize character head tracking
    const updateCharacterHead = setupCharacterHeadTracking();

    // Setup interactive modules
    setupTiltCards();
    setupMagneticElements();
    setupScrollReveal();
    setupCounters();
    setupSmoothScrolling();
    createParticles();
    setupContactForm();
    setupProjectCardLinks();
    setupMobileNav();
    setupMarqueeScroll();
    setupTouchInteraction();

    // Start 60fps RequestAnimationFrame loop only while hero is visible and tab is active
    let heroVisible = true;
    const heroEl = document.getElementById('hero');

    function loop() {
      if (!heroVisible || document.hidden) {
        rafId = null;
        return;
      }
      if (updateCharacterHead) {
        updateCharacterHead();
      }
      rafId = requestAnimationFrame(loop);
    }

    function startLoop() {
      if (!rafId && heroVisible && !document.hidden) {
        rafId = requestAnimationFrame(loop);
      }
    }

    if (heroEl && 'IntersectionObserver' in window) {
      const heroObserver = new IntersectionObserver((entries) => {
        heroVisible = entries[0].isIntersecting;
        if (heroVisible) startLoop();
      }, { threshold: 0.01 });
      heroObserver.observe(heroEl);
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) startLoop();
    });

    startLoop();

    // Trigger hero text reveals immediately
    requestAnimationFrame(() => {
      document.querySelectorAll('.hero .reveal-text').forEach(el => {
        const rawDelay = parseInt(el.dataset.delay) || 0;
        const delay = Math.min(Math.round(rawDelay * 0.2), 80);
        if (delay === 0) {
          el.classList.add('revealed');
        } else {
          setTimeout(() => el.classList.add('revealed'), delay);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
