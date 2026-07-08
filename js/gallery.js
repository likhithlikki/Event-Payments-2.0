

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
  if (bride && groom) {
    document.getElementById('galleryTitle').textContent = `${bride} & ${groom}'s gallery`;
  }
}

async function refreshGallery() {
  const data = await api('getGallery', { eventCode: CURRENT_EVENT.eventCode });
  document.getElementById('galleryCount').textContent =
    `${data.count} photo${data.count === 1 ? '' : 's'}`;
  renderGalleryGrid(data.photos);
}

function renderGalleryGrid(photos) {
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  grid.innerHTML = '';

  if (!photos.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

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
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
}

function openLightbox(photo) {
  document.getElementById('lightboxImg').src = photo.imageUrl;
  document.getElementById('lightboxMeta').textContent =
    `Shared by ${photo.uploadedBy || 'a guest'} · ${timeAgo(photo.uploadTime)}`;
  document.getElementById('lightbox').classList.add('is-open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('is-open');
}

// ---------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------

let selectedFileDataUrl = null;

function bindUploadModal() {
  document.getElementById('openUploadBtn').addEventListener('click', openUploadModal);
  document.getElementById('cancelUploadBtn').addEventListener('click', closeUploadModal);
  document.getElementById('uploadModal').addEventListener('click', (e) => {
    if (e.target.id === 'uploadModal') closeUploadModal();
  });
  document.getElementById('photoFile').addEventListener('change', handleFileSelect);
  document.getElementById('uploadForm').addEventListener('submit', handleUploadSubmit);
}

function openUploadModal() {
  document.getElementById('uploadModal').classList.add('is-open');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('is-open');
  document.getElementById('uploadForm').reset();
  document.getElementById('uploadPreview').classList.remove('is-visible');
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
    preview.src = selectedFileDataUrl;
    preview.classList.add('is-visible');
  };
  reader.readAsDataURL(file);
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  const uploaderName = document.getElementById('uploaderName').value.trim();
  const fileInput = document.getElementById('photoFile');

  if (!selectedFileDataUrl) return toast('Choose a photo first.', 'warning');
  if (!uploaderName) return toast('Enter your name.', 'warning');

  setUploadLoading(true);
  try {
    await api('submitPhoto', {
      eventCode: CURRENT_EVENT.eventCode,
      imageBase64: selectedFileDataUrl,
      imageName: fileInput.files[0] ? fileInput.files[0].name : 'photo.jpg',
      uploadedBy: uploaderName
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
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Uploading…' : 'Submit for review';
}


/**
 * support.js
 * ------------------------------------------------------------------
 * One responsibility: render support.html purely from CURRENT_EVENT
 * (Support Phone / Support Email / Footer Text). No extra API call —
 * loadCurrentEvent() already fetched everything this page needs.
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', initSupportPage);

async function initSupportPage() {
  try {
    await loadCurrentEvent();
    document.title = `Support · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('support.html');
    renderSupport();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderSupport() {
  const settings = CURRENT_EVENT.settings || {};
  const phone = settings['Support Phone'];
  const email = settings['Support Email'];

  const intro = document.getElementById('supportIntro');
  const links = document.getElementById('supportLinks');
  links.innerHTML = '';

  if (!phone && !email) {
    intro.textContent = 'Ask your host directly for help with anything.';
  } else {
    intro.textContent = 'Reach the organizers directly:';
    if (phone) {
      const a = document.createElement('a');
      a.href = `tel:${phone}`;
      a.className = 'btn-secondary';
      a.textContent = `Call ${phone}`;
      links.appendChild(a);
    }
    if (email) {
      const a = document.createElement('a');
      a.href = `mailto:${email}`;
      a.className = 'btn-secondary';
      a.textContent = `Email ${email}`;
      links.appendChild(a);
    }
  }

  document.getElementById('footerText').textContent = settings['Footer Text'] || '';
}
