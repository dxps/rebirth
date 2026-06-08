import '/js/datastar.js';

const navSelector = '[data-zynapse-nav]';
const draggableSelector = '[data-draggable-modal]';
const dragHandleSelector = '[data-drag-handle]';

document.addEventListener('click', (event) => {
  const trigger = event.target.closest(navSelector);
  if (!trigger) return;

  const nextPath = trigger.dataset.zynapseNav;
  if (!nextPath || window.location.pathname === nextPath) return;

  window.history.pushState({}, '', nextPath);
});

document.addEventListener('pointerdown', (event) => {
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
