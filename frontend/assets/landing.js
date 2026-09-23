(() => {
  'use strict';
  const tabs = [...document.querySelectorAll('.demo-stepper [role="tab"]')];
  if (!tabs.length) return;
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
  const previous = document.getElementById('demo-prev');
  const next = document.getElementById('demo-next');
  const progress = document.getElementById('demo-progress');
  let active = 0;

  function select(index, focus = false) {
    active = Math.max(0, Math.min(tabs.length - 1, index));
    tabs.forEach((tab, position) => {
      const selected = position === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[position].hidden = !selected;
    });
    previous.disabled = active === 0;
    next.disabled = active === tabs.length - 1;
    progress.textContent = `${active + 1} / ${tabs.length}`;
    if (focus) tabs[active].focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', event => {
      let destination;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') destination = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') destination = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') destination = 0;
      else if (event.key === 'End') destination = tabs.length - 1;
      else return;
      event.preventDefault();
      select(destination, true);
    });
  });
  previous.addEventListener('click', () => select(active - 1, true));
  next.addEventListener('click', () => select(active + 1, true));
  select(0);
})();
