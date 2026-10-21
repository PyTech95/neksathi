export function mountExperience(root) {
  if (!root || typeof window === 'undefined') return () => {};

  // Motion is permanently enabled.
  let visible = true;
  let destroyed = false;
  let frame = 0;
  let last = 0;
  let elapsed = 0;
  let stepClock = 0;
  let active = 0;
  let startX = null;
  let demoTimer;

  const hero = root.querySelector('[data-story-slider]');
  const panels = hero
    ? [...hero.querySelectorAll('[data-story-panel]')]
    : [];

  const selectors = hero
    ? [...hero.querySelectorAll('[data-story-select]')]
    : [];

  const status = hero?.querySelector('[data-story-status]');
  const progress = hero?.querySelector('[data-story-progress]');

  const timers = [];
  const cleanups = [];

  const on = (el, name, fn, opts) => {
    if (el) {
      el.addEventListener(name, fn, opts);
      cleanups.push(() => el.removeEventListener(name, fn, opts));
    }
  };

  /*
   * Remove all motion pause controls.
   * Motion remains permanently active.
   */
  root
    .querySelectorAll('[data-motion-toggle], [data-story-pause]')
    .forEach((button) => button.remove());

  root.classList.remove('cx-paused');

  function show(index, manual = false) {
    if (!panels.length) return;

    active = (index + panels.length) % panels.length;
    elapsed = 0;

    panels.forEach((panel, i) => {
      panel.hidden = i !== active;
      panel.setAttribute('aria-hidden', String(i !== active));
    });

    selectors.forEach((btn, i) => {
      btn.setAttribute('aria-pressed', String(i === active));
    });

    const count = hero?.querySelector('[data-story-count]');

    if (count) {
      count.textContent = String(active + 1).padStart(2, '0');
    }

    if (progress) {
      progress.style.transform = 'scaleX(0)';
    }

    if (manual && status) {
      status.textContent =
        `Story ${active + 1} of ${panels.length}: ` +
        `${selectors[active]?.dataset.label || ''}`;
    }
  }

  /*
   * Story slider controls
   */
  selectors.forEach((button, i) =>
    on(button, 'click', () => {
      show(i, true);
    })
  );

  on(
    hero?.querySelector('[data-story-prev]'),
    'click',
    () => show(active - 1, true)
  );

  on(
    hero?.querySelector('[data-story-next]'),
    'click',
    () => show(active + 1, true)
  );

  /*
   * Keyboard slider navigation
   */
  on(hero, 'keydown', (e) => {
    if (!e.target.closest('[data-story-controls]')) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      show(active + 1, true);
      selectors[active]?.focus();
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      show(active - 1, true);
      selectors[active]?.focus();
    }
  });

  /*
   * Mobile swipe
   */
  on(
    hero,
    'touchstart',
    (e) => {
      if (e.target.closest('a,button')) return;

      startX = e.touches[0]?.clientX;
    },
    { passive: true }
  );

  on(
    hero,
    'touchend',
    (e) => {
      if (startX == null) return;

      const diff =
        (e.changedTouches[0]?.clientX || startX) - startX;

      if (Math.abs(diff) > 55) {
        show(active + (diff < 0 ? 1 : -1), true);
      }

      startX = null;
    },
    { passive: true }
  );

  /*
   * Story step animation
   */
  function setStep(group, index) {
    const buttons = group.querySelectorAll('[data-story-step]');

    buttons.forEach((button, i) => {
      button.setAttribute(
        'aria-pressed',
        String(i === index)
      );
    });

    const wrapper = group.closest('[data-scene-section]');

    if (wrapper) {
      wrapper.dataset.step = String(index);

      const text =
        wrapper.querySelector('[data-step-status]');

      if (text) {
        text.textContent =
          buttons[index]?.dataset.summary || '';
      }
    }
  }

  root
    .querySelectorAll('[data-story-steps]')
    .forEach((group) => {
      group
        .querySelectorAll('[data-story-step]')
        .forEach((button, i) =>
          on(button, 'click', () => {
            group.dataset.manual = 'true';
            setStep(group, i);
          })
        );
    });

  /*
   * App demo tabs
   */
  root
    .querySelectorAll('[data-app-demo]')
    .forEach((group) => {
      group
        .querySelectorAll('[data-app-tab]')
        .forEach((button) =>
          on(button, 'click', () => {
            const value = button.dataset.appTab;

            group
              .querySelectorAll('[data-app-tab]')
              .forEach((b) =>
                b.setAttribute(
                  'aria-pressed',
                  String(b === button)
                )
              );

            group
              .querySelectorAll('[data-app-panel]')
              .forEach((panel) => {
                panel.hidden =
                  panel.dataset.appPanel !== value;
              });
          })
        );
    });

  /*
   * SOS visual demo
   */
  root
    .querySelectorAll('[data-sos-demo]')
    .forEach((button) =>
      on(button, 'click', () => {
        const section =
          button.closest('[data-sos-section]');

        if (!section) return;

        clearTimeout(demoTimer);

        section.classList.add('cx-sos-active');

        const text =
          section.querySelector('[data-sos-status]');

        if (text) {
          text.textContent =
            'Demo only: your chosen contacts appear here. No alert has been sent.';
        }

        demoTimer = setTimeout(() => {
          section.classList.remove('cx-sos-active');
        }, 3500);
      })
    );

  /*
   * Help / FAQ filtering
   */
  const help = root.querySelector('[data-help]');

  function filterHelp() {
    if (!help) return;

    const q = (
      help.querySelector('input[type=search]')?.value || ''
    )
      .trim()
      .toLowerCase();

    const selected =
      help.querySelector(
        '[data-help-filter][aria-pressed=true]'
      )?.dataset.helpFilter || 'All questions';

    let n = 0;

    help.querySelectorAll('[data-faq]').forEach((item) => {
      const shouldShow =
        (
          selected === 'All questions' ||
          item.dataset.category === selected
        ) &&
        item.textContent
          .toLowerCase()
          .includes(q);

      item.hidden = !shouldShow;

      if (shouldShow) n++;
    });

    const msg =
      help.querySelector('[data-help-count]');

    if (msg) {
      msg.textContent = n
        ? `${n} answers to explore`
        : 'No matching answers. Try another word or choose another category.';
    }
  }

  if (help) {
    on(
      help.querySelector('input[type=search]'),
      'input',
      filterHelp
    );

    help
      .querySelectorAll('[data-help-filter]')
      .forEach((button) =>
        on(button, 'click', () => {
          help
            .querySelectorAll('[data-help-filter]')
            .forEach((b) =>
              b.setAttribute(
                'aria-pressed',
                String(b === button)
              )
            );

          filterHelp();
        })
      );
  }

  /*
   * Observe visible sections.
   * Motion stays enabled.
   */
  const observer =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((entry) => {
              if (entry.target === hero) {
                visible = entry.isIntersecting;
              } else if (entry.isIntersecting) {
                entry.target.classList.add(
                  'cx-in-view'
                );
              }
            }),
          { threshold: 0.06 }
        )
      : null;

  if (observer) {
    if (hero) {
      observer.observe(hero);
    }

    root
      .querySelectorAll(
        '[data-reveal], [data-motion-visual]'
      )
      .forEach((el) =>
        observer.observe(el)
      );
  } else {
    root
      .querySelectorAll('[data-reveal]')
      .forEach((el) =>
        el.classList.add('cx-in-view')
      );
  }

  /*
   * Permanent animation loop
   */
  let stepIndex = 0;

  function tick(t) {
    if (destroyed) return;

    const dt = Math.min(
      t - (last || t),
      100
    );

    last = t;

    /*
     * Hero changes automatically every 8.5 sec.
     */
    if (
      panels.length &&
      visible &&
      document.visibilityState !== 'hidden'
    ) {
      elapsed += dt;

      if (elapsed >= 8500) {
        show(active + 1);
      }

      if (progress) {
        progress.style.transform =
          `scaleX(${Math.min(
            elapsed / 8500,
            1
          )})`;
      }
    }

    /*
     * Feature story steps change every 4.2 sec.
     */
    if (document.visibilityState !== 'hidden') {
      stepClock += dt;

      if (stepClock > 4200) {
        stepClock = 0;

        stepIndex =
          (stepIndex + 1) % 3;

        root
          .querySelectorAll(
            '[data-story-steps]:not([data-manual=true])'
          )
          .forEach((group) =>
            setStep(group, stepIndex)
          );
      }
    }

    frame =
      requestAnimationFrame(tick);
  }

  /*
   * Start
   */
  root.classList.remove('cx-paused');

  if (hero) {
    show(0);
  }

  frame =
    requestAnimationFrame(tick);

  /*
   * Cleanup
   */
  return () => {
    destroyed = true;

    cancelAnimationFrame(frame);
    clearTimeout(demoTimer);

    timers.forEach(clearTimeout);
    cleanups.forEach((fn) => fn());

    observer?.disconnect();
  };
}