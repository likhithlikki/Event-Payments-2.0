/**
 * gallery.js
 * ------------------------------------------------------------------
 * One responsibility: render gallery.html from CURRENT_EVENT.
 * Handles image grid, lightbox, and upload modal.
 * ------------------------------------------------------------------
 */

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // must match Gallery.gs GALLERY_MAX_BYTES

document.addEventListener('DOMContentLoaded', initGalleryPage);

async function initGalleryPage() {
  try {
    await loadCurrentEvent();
    document.title = `Gallery · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('gallery.html');
    renderGalleryTitle();
    bindLightbox();
    bindUploadModal();
    await refreshGallery();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderGalleryTitle() {
  const settings = CURRENT_EVENT.settings || {};
  const bride = settings['Bride Name'];
  const groom = settings['Groom Name'];
  const el = document.getElementById('galleryTitle');
  if (el && bride && groom) {
    el.textContent = `${bride} & ${groom}'s gallery`;
  }
}

async function refreshGallery() {
  const data = await api('getGalleryImages', { eventCode: CURRENT_EVENT.eventCode });
  const countEl = document.getElementById('galleryCount');
  if (countEl) countEl.textContent = `${data.count} photo${data.count === 1 ? '' : 's'}`;
  renderGalleryGrid(data.photos);
}

function renderGalleryGrid(photos) {
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  if (!grid) return;
  grid.innerHTML = '';

  if (!photos || !photos.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  photos.forEach(photo => {
    const tile = document.createElement('div');
    tile.className = 'gallery-tile';
    tile.innerHTML = `<img src="${escapeHtml(photo.thumbnail)}" alt="${escapeHtml(photo.imageName || '')}" loading="lazy">`;
    tile.addEventListener('click', () => openLightbox(photo));
    grid.appendChild(tile);
  });
}

// ---------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------

function bindLightbox() {
  const lightboxClose = document.getElementById('lightboxClose');
  const lightbox = document.getElementById('lightbox');
  if (!lightboxClose || !lightbox) return;
  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
}

function openLightbox(photo) {
  const img = document.getElementById('lightboxImg');
  const meta = document.getElementById('lightboxMeta');
  const box = document.getElementById('lightbox');
  if (!img || !box) return;
  img.src = photo.imageUrl;
  if (meta) meta.textContent = `Shared by ${photo.uploadedBy || 'a guest'} · ${timeAgo(photo.uploadTime)}`;
  box.classList.add('is-open');
}

function closeLightbox() {
  const box = document.getElementById('lightbox');
  if (box) box.classList.remove('is-open');
}

// ---------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------

let selectedFileDataUrl = null;

function bindUploadModal() {
  const openBtn = document.getElementById('openUploadBtn');
  const cancelBtn = document.getElementById('cancelUploadBtn');
  const modal = document.getElementById('uploadModal');
  const fileInput = document.getElementById('photoFile');
  const form = document.getElementById('uploadForm');
  if (!openBtn || !modal || !form) return;

  openBtn.addEventListener('click', openUploadModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeUploadModal);
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'uploadModal') closeUploadModal();
  });
  if (fileInput) fileInput.addEventListener('change', handleFileSelect);
  form.addEventListener('submit', handleUploadSubmit);
}

function openUploadModal() {
  const modal = document.getElementById('uploadModal');
  if (modal) modal.classList.add('is-open');
}

function closeUploadModal() {
  const modal = document.getElementById('uploadModal');
  const form = document.getElementById('uploadForm');
  const preview = document.getElementById('uploadPreview');
  if (modal) modal.classList.remove('is-open');
  if (form) form.reset();
  if (preview) preview.classList.remove('is-visible');
  selectedFileDataUrl = null;
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > MAX_UPLOAD_BYTES) {
    toast('That photo is too large (max 8MB).', 'warning');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    selectedFileDataUrl = reader.result;
    const preview = document.getElementById('uploadPreview');
    if (preview) {
      preview.src = selectedFileDataUrl;
      preview.classList.add('is-visible');
    }
  };
  reader.readAsDataURL(file);
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  const uploaderName = (document.getElementById('uploaderName') || {}).value || '';
  const fileInput = document.getElementById('photoFile');

  if (!selectedFileDataUrl) return toast('Choose a photo first.', 'warning');
  if (!uploaderName.trim()) return toast('Enter your name.', 'warning');

  setUploadLoading(true);
  try {
    await api('submitPhoto', {
      eventCode: CURRENT_EVENT.eventCode,
      imageBase64: selectedFileDataUrl,
      imageName: fileInput && fileInput.files[0] ? fileInput.files[0].name : 'photo.jpg',
      uploadedBy: uploaderName.trim()
    }, 'POST');

    toast('Thanks! Your photo is awaiting approval.', 'success');
    closeUploadModal();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setUploadLoading(false);
  }
}

function setUploadLoading(isLoading) {
  const btn = document.getElementById('uploadBtn');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Uploading…' : 'Submit for review';
}
