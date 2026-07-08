/**
 * invite.js
 * ------------------------------------------------------------------
 * One responsibility: render invite.html purely from CURRENT_EVENT.
 * No new backend action — loadCurrentEvent() (getSettings) already
 * carries everything this page needs.
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', initInvitePage);

async function initInvitePage() {
  try {
    await loadCurrentEvent();
    document.title = `Invitation · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('invite.html');
    renderInvitation();
    bindShareActions();
  } catch (err) {
    const loadingEl = document.getElementById('inviteLoading');
    if (loadingEl) loadingEl.textContent = err.message;
    toast(err.message, 'error');
  }
}

function renderInvitation() {
  const settings = CURRENT_EVENT.settings || {};
  const bride = settings['Bride Name'];
  const groom = settings['Groom Name'];
  const brideParents = settings['Bride Parents'];
  const groomParents = settings['Groom Parents'];
  const venue = settings['Venue'];
  const venueAddress = settings['Venue Address'];
  const mapLink = settings['Venue Map Link'] || settings['Google Maps Link'];
  const eventDate = settings['Event Date'];

  const eyebrow = document.getElementById('inviteEyebrow');
  if (eyebrow) eyebrow.textContent = settings['Event Type'] || CURRENT_EVENT.eventType || "You're invited";

  const names = document.getElementById('inviteNames');
  if (names) names.textContent = (bride && groom) ? `${bride} & ${groom}` : (CURRENT_EVENT.eventName || 'Join us');

  if (brideParents || groomParents) {
    const parentsEl = document.getElementById('inviteParents');
    if (parentsEl) {
      parentsEl.hidden = false;
      parentsEl.textContent = [brideParents, groomParents].filter(Boolean).join(' \u00b7 ');
    }
  }

  if (eventDate) {
    const dateEl = document.getElementById('inviteDate');
    if (dateEl) {
      dateEl.hidden = false;
      dateEl.textContent = fmtInviteDate(eventDate);
    }
  }

  if (venue || venueAddress) {
    const venueEl = document.getElementById('inviteVenue');
    if (venueEl) {
      venueEl.hidden = false;
      venueEl.textContent = [venue, venueAddress].filter(Boolean).join(', ');
    }
  }

  if (mapLink) {
    const mapBtn = document.getElementById('mapBtn');
    if (mapBtn) { mapBtn.hidden = false; mapBtn.href = mapLink; }

    const mapPanel = document.getElementById('mapPanel');
    const mapEmbed = document.getElementById('mapEmbed');
    if (mapPanel) mapPanel.hidden = false;
    if (mapEmbed) mapEmbed.src = toMapEmbedUrl(mapLink, venue || venueAddress);
  }

  if (eventDate) {
    const calBtn = document.getElementById('calendarBtn');
    if (calBtn) {
      calBtn.hidden = false;
      calBtn.addEventListener('click', () => downloadCalendarInvite(eventDate, venue || venueAddress));
    }
  }

  const shareUrl = eventShareUrl();
  const qrImage = document.getElementById('qrImage');
  if (qrImage) {
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`;
  }

  const loadingEl = document.getElementById('inviteLoading');
  const contentEl = document.getElementById('inviteContent');
  if (loadingEl) loadingEl.hidden = true;
  if (contentEl) contentEl.hidden = false;
}

function fmtInviteDate(value) {
  const date = new Date(value);
  if (isNaN(date)) return String(value);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  const opts = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
  let out = date.toLocaleDateString('en-IN', opts);
  if (hasTime) out += ` \u00b7 ${date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  return out;
}

function toMapEmbedUrl(mapLink, fallbackQuery) {
  if (mapLink.includes('/maps/embed')) return mapLink;
  const query = fallbackQuery || mapLink;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function eventShareUrl() {
  return `${window.location.origin}${window.location.pathname.replace('invite.html', 'home.html')}?event=${encodeURIComponent(CURRENT_EVENT.eventCode || '')}`;
}

function downloadCalendarInvite(eventDate, location) {
  const start = new Date(eventDate);
  if (isNaN(start)) return toast('No valid date to add.', 'warning');
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const toICSDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const namesEl = document.getElementById('inviteNames');
  const title = (namesEl && namesEl.textContent) || CURRENT_EVENT.eventName || 'Event';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : '',
    `URL:${eventShareUrl()}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${CURRENT_EVENT.eventCode || 'event'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function bindShareActions() {
  const shareUrl = eventShareUrl();
  const namesEl = document.getElementById('inviteNames');
  const title = (namesEl && namesEl.textContent) || CURRENT_EVENT.eventName || 'EventPay';

  const whatsappBtn = document.getElementById('shareWhatsappBtn');
  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', () => {
      const msg = `You're invited! ${title}\n${shareUrl}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    });
  }

  const copyBtn = document.getElementById('copyLinkBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast('Link copied.', 'success');
      } catch {
        toast('Could not copy the link.', 'error');
      }
    });
  }

  if (navigator.share) {
    const nativeBtn = document.getElementById('nativeShareBtn');
    if (nativeBtn) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener('click', () => {
        navigator.share({ title, url: shareUrl }).catch(() => {});
      });
    }
  }
}
