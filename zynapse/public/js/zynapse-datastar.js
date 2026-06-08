import '/js/datastar.js';

const navSelector = '[data-zynapse-nav]';
const userRowSelector = '[data-zynapse-user-url]';
const draggableSelector = '[data-draggable-modal]';
const dragHandleSelector = '[data-drag-handle]';
let topModalZIndex = 60;

document.addEventListener('click', (event) => {
  const userRow = event.target.closest(userRowSelector);
  if (userRow) {
    event.preventDefault();
    patchFromEndpoint(`${userRow.dataset.zynapseUserUrl}${Date.now()}`);
    return;
  }

  const trigger = event.target.closest(navSelector);
  if (!trigger) return;

  const nextPath = trigger.dataset.zynapseNav;
  if (!nextPath || window.location.pathname === nextPath) return;

  window.history.pushState({}, '', nextPath);
});

document.addEventListener('keydown', (event) => {
  const userRow = event.target.closest(userRowSelector);
  if (!userRow || (event.key !== 'Enter' && event.key !== ' ')) return;

  event.preventDefault();
  patchFromEndpoint(`${userRow.dataset.zynapseUserUrl}${Date.now()}`);
});

document.addEventListener('pointerdown', (event) => {
  const clickedModal = event.target.closest(draggableSelector);
  if (clickedModal) bringModalToFront(clickedModal);

  const handle = event.target.closest(dragHandleSelector);
  if (!handle) return;

  const modal = handle.closest(draggableSelector);
  if (!modal) return;

  const rect = modal.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;

  modal.style.right = 'auto';
  modal.style.bottom = 'auto';
  modal.style.left = `${rect.left}px`;
  modal.style.top = `${rect.top}px`;
  modal.dataset.dragging = 'true';
  modal.setPointerCapture?.(event.pointerId);

  const moveModal = (moveEvent) => {
    const nextLeft = clamp(moveEvent.clientX - offsetX, 8, window.innerWidth - rect.width - 8);
    const nextTop = clamp(moveEvent.clientY - offsetY, 8, window.innerHeight - rect.height - 8);

    modal.style.left = `${nextLeft}px`;
    modal.style.top = `${nextTop}px`;
  };

  const stopDrag = () => {
    modal.dataset.dragging = 'false';
    modal.releasePointerCapture?.(event.pointerId);
    document.removeEventListener('pointermove', moveModal);
    document.removeEventListener('pointerup', stopDrag);
    document.removeEventListener('pointercancel', stopDrag);
  };

  document.addEventListener('pointermove', moveModal);
  document.addEventListener('pointerup', stopDrag);
  document.addEventListener('pointercancel', stopDrag);
});

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function bringModalToFront(modal) {
  topModalZIndex += 1;
  modal.style.zIndex = `${topModalZIndex}`;
}

async function patchFromEndpoint(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/event-stream, text/html, application/json',
      'Datastar-Request': 'true',
    },
  });

  if (!response.ok) return;

  const text = await response.text();
  const patch = parseDatastarPatch(text);
  if (!patch) return;

  applyPatch(patch);
}

function parseDatastarPatch(text) {
  const patch = { elements: '', mode: 'outer', selector: '' };

  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;

    const data = line.slice(6);
    const space = data.indexOf(' ');
    if (space === -1) continue;

    const field = data.slice(0, space);
    const value = data.slice(space + 1);

    if (field === 'elements') {
      patch.elements += `${value}\n`;
    } else if (field === 'mode') {
      patch.mode = value;
    } else if (field === 'selector') {
      patch.selector = value;
    }
  }

  return patch;
}

function applyPatch({ elements, mode, selector }) {
  if (mode === 'append') {
    document.querySelector(selector)?.insertAdjacentHTML('beforeend', elements);
    return;
  }

  if (mode === 'remove') {
    document.querySelector(selector)?.remove();
    return;
  }

  const template = document.createElement('template');
  template.innerHTML = elements.trim();
  for (const element of template.content.children) {
    const target = element.id ? document.getElementById(element.id) : null;
    target?.replaceWith(element);
  }
}
