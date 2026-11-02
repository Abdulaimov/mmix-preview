// Админка: подтверждение опасных действий, печать, закрытие меню.
document.addEventListener('submit', (e) => {
  const form = /** @type {HTMLFormElement} */ (e.target);
  const msg = form.dataset.confirm;
  if (msg && !window.confirm(msg)) { e.preventDefault(); return; }
  // Защита от двойного нажатия: кнопка блокируется до ответа сервера
  const btn = /** @type {HTMLButtonElement|null} */ (form.querySelector('button[type=submit], button:not([type])'));
  if (btn && !form.matches('.ahdr__lang')) setTimeout(() => { btn.disabled = true; }, 0);
});
document.addEventListener('click', (e) => {
  const el = /** @type {HTMLElement} */ (e.target);
  const c = /** @type {HTMLElement|null} */ (el.closest('[data-confirm-click]'));
  if (c && !window.confirm(c.dataset.confirmClick || '')) e.preventDefault();
  if (el.closest('[data-print]')) window.print();
  document.querySelectorAll('details.ahdr__menu[open]').forEach((d) => { if (!d.contains(el)) d.removeAttribute('open'); });
});
