// ==================== MODAL HELPERS ====================
export const modalEl = document.getElementById('modal');
export const modalInner = document.getElementById('modal-inner');

export function openModal(html){ modalInner.innerHTML = html; modalEl.classList.add('show'); }
export function showModal(){ modalEl.classList.add('show'); }

// closeModal needs updateUI which creates a circular dep — so we use a callback
let _updateUICallback = null;
export function setUpdateUICallback(fn){ _updateUICallback = fn; }

export function closeModal(){
  modalEl.classList.remove('show');
  if (_updateUICallback) _updateUICallback();
}
