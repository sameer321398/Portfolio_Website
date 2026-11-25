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
  const cursorDot = document.getElementById('cursorDot');
  const cursorRing = document.getElementById('cursorRing');
  const heroParticles = document.getElementById('heroParticles');
  const contactForm = document.getElementById('contactForm');
  const heroCharacterWrap = document.getElementById('heroCharacterWrap');
  const characterCanvas = document.getElementById('characterCanvas');
  const characterVideo = document.getElementById('characterVideo');

  /* =========================================
     1. ZERO-LAG INSTANT CURSOR TRACKING
     ========================================= */

  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    // Normalized coordinates from center: -1 to +1
    mouse.normX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.normY = (e.clientY / window.innerHeight - 0.5) * 2;

    // Instant zero-lag direct update on mousemove (no lerp delay)
    if (!isTouch) {
      if (cursorDot) cursorDot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      if (cursorRing) cursorRing.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
    }
  }

  function setupCursorHoverEffects() {
    if (isTouch) return;

    const interactives = document.querySelectorAll('a, button, .project-card, .btn');
    const textInputs = document.querySelectorAll('input, textarea');

    interactives.forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });

    textInputs.forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-text'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-text'));
    });
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

    // Resize canvas to cover container accurately with DPR and orientation support
    function resizeCanvas() {
      if (!characterCanvas || !ctx) return;
      const rect = characterCanvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      characterCanvas.width = Math.round(rect.width * dpr);
      characterCanvas.height = Math.round(rect.height * dpr);
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

    // Preload image frames for 0ms seek latency canvas playback
    function preloadFrames() {
      for (let i = 1; i <= headTracking.totalFrames; i++) {
        const img = new Image();
        const numStr = String(i).padStart(3, '0');
        img.src = `frames/frame_${numStr}.jpg`;
        img.onload = () => {
          headTracking.loadedImages++;
          if (headTracking.loadedImages >= 10 && !headTracking.useCanvas) {
            // As soon as first batch is ready, activate Canvas engine
            headTracking.useCanvas = true;
            if (characterVideo) characterVideo.style.display = 'none';
            if (characterCanvas) characterCanvas.style.opacity = '1';
            drawCurrentFrame();
          }
        };
        img.onerror = () => {
          // If frames folder is unavailable, gracefully fall back to video engine
          headTracking.useCanvas = false;
          if (characterVideo) {
            characterVideo.style.display = 'block';
            characterVideo.load();
          }
        };
        headTracking.images.push(img);
      }
    }

    preloadFrames();

    // Draw active frame to canvas with object-fit: cover logic
    function drawCurrentFrame() {
      if (!headTracking.useCanvas || !ctx || !characterCanvas) return;
      const fIdx = Math.round(headTracking.currentFrame) - 1;
      const img = headTracking.images[fIdx];
      if (!img || !img.complete || img.naturalWidth === 0) return;

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
    function updateHead() {
      // 1. Calculate Target Frame based on Cursor Position
      // mouse.normX ranges from -1 (extreme left) to +1 (extreme right)
      // Horizontal mouse motion maps smoothly across video sequence (frame 1 to frame 122)
      const clampedX = Math.max(-1, Math.min(1, mouse.normX));
      const normalizedPos = (clampedX + 1) / 2; // 0 (left) to 1 (right)
      headTracking.targetFrame = 1 + normalizedPos * (headTracking.totalFrames - 1);

      // Smooth interpolation for frame scrub (higher responsiveness)
      headTracking.currentFrame += (headTracking.targetFrame - headTracking.currentFrame) * 0.18;
      headTracking.currentFrame = Math.max(1, Math.min(headTracking.totalFrames, headTracking.currentFrame));

      // 2. 3D Perspective Rotation for Head & Upper Body
      // Add subtle real-time 3D tilt (rotateX, rotateY) and micro-translation
      const isCompact = window.innerWidth <= 900;
      const transScale = isCompact ? 0.55 : 1;
      const targetRotY = mouse.normX * (isCompact ? 8 : 12); // tilt left/right
      const targetRotX = -mouse.normY * (isCompact ? 6 : 9); // nod up/down
      const targetTransX = mouse.normX * 15 * transScale; // horizontal shift (px)
      const targetTransY = mouse.normY * 10 * transScale; // vertical shift (px)

      headTracking.currentRotY += (targetRotY - headTracking.currentRotY) * 0.12;
      headTracking.currentRotX += (targetRotX - headTracking.currentRotX) * 0.12;
      headTracking.currentTransX += (targetTransX - headTracking.currentTransX) * 0.12;
      headTracking.currentTransY += (targetTransY - headTracking.currentTransY) * 0.12;

      // Apply 3D matrix transform strictly to the character media elements (NOT the text)
      const mediaScale = isCompact ? 1.03 : 1.05;
      const transform3D = `scale(${mediaScale}) translate3d(${headTracking.currentTransX.toFixed(2)}px, ${headTracking.currentTransY.toFixed(2)}px, 0) rotateX(${headTracking.currentRotX.toFixed(2)}deg) rotateY(${headTracking.currentRotY.toFixed(2)}deg)`;

      if (characterCanvas) characterCanvas.style.transform = transform3D;
      if (characterVideo && !headTracking.useCanvas) characterVideo.style.transform = transform3D;

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
      const intensity = parseFloat(card.dataset.tiltIntensity) || 10;

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -intensity;
        const rotateY = ((x - centerX) / centerX) * intensity;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        card.style.transition = 'transform 0.1s ease-out';

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
            const delay = parseInt(entry.target.dataset.delay) || 0;
            setTimeout(() => {
              entry.target.classList.add('revealed');
            }, delay);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -50px 0px'
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
    const count = isTouch ? 15 : 25;

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

    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('button[type="submit"]');
      const span = btn ? btn.querySelector('span') : null;
      const originalText = span ? span.textContent : 'Submit';

      if (span) span.textContent = 'Sent! ✓';
      if (btn) {
        btn.style.background = '#34d399';
        btn.disabled = true;
      }

      setTimeout(() => {
        if (span) span.textContent = originalText;
        if (btn) {
          btn.style.background = '';
          btn.disabled = false;
        }
        contactForm.reset();
      }, 3000);
    });
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
    if (!isTouch) return;

    // Mobile touch tracking across the screen
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        mouse.normX = (touch.clientX / window.innerWidth - 0.5) * 2;
        mouse.normY = (touch.clientY / window.innerHeight - 0.5) * 2;
      }
    }, { passive: true });

    // Device gyroscope tilt support
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
        const gamma = e.gamma || 0; // left/right tilt (-90 to 90)
        const beta = e.beta || 0;   // front/back tilt (-180 to 180)

        mouse.normX = Math.max(-1, Math.min(1, gamma / 25));
        mouse.normY = Math.max(-1, Math.min(1, (beta - 40) / 25));
      }
    }
  }

  /* =========================================
     12. MAIN ANIMATION LOOP
     ========================================= */

  function init() {
    // Setup cursor tracking
    if (!isTouch) {
      document.addEventListener('mousemove', onMouseMove, { passive: true });
    }

    // Initialize character head tracking
    const updateCharacterHead = setupCharacterHeadTracking();

    // Setup interactive modules
    setupCursorHoverEffects();
    setupTiltCards();
    setupMagneticElements();
    setupScrollReveal();
    setupCounters();
    setupSmoothScrolling();
    createParticles();
    setupContactForm();
    setupMarqueeScroll();
    setupTouchInteraction();

    // Start 60fps RequestAnimationFrame loop
    function loop() {
      if (updateCharacterHead) {
        updateCharacterHead();
      }
      rafId = requestAnimationFrame(loop);
    }
    loop();

    // Trigger hero text reveals
    setTimeout(() => {
      document.querySelectorAll('.hero .reveal-text').forEach(el => {
        const delay = parseInt(el.dataset.delay) || 0;
        setTimeout(() => el.classList.add('revealed'), delay);
      });
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
