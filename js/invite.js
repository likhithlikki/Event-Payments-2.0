/**
 * invite.js
 * ------------------------------------------------------------------
 * One responsibility: render invite.html purely from CURRENT_EVENT.
 * No new backend action — loadCurrentEvent() (getSettings) already
 * carries everything this page needs: Bride/Groom/Parents names,
 * Event Date, Venue, and an optional Venue Map Link. Nothing here is
 * uploaded or hardcoded; the invitation is generated from Settings
 * the same way home.js builds the hero.
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
    document.getElementById('inviteLoading').textContent = err.message;
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
  const mapLink = settings['Venue Map Link'];
  const eventDate = settings['Event Date'];

  document.getElementById('inviteEyebrow').textContent =
    settings['Event Type'] || CURRENT_EVENT.eventType || "You're invited";

  document.getElementById('inviteNames').textContent =
    (bride && groom) ? `${bride} & ${groom}` : (CURRENT_EVENT.eventName || 'Join us');

  if (brideParents || groomParents) {
    const parentsEl = document.getElementById('inviteParents');
    parentsEl.hidden = false;
    parentsEl.textContent = [brideParents, groomParents].filter(Boolean).join(' \u00b7 ');
  }

  if (eventDate) {
    const dateEl = document.getElementById('inviteDate');
    dateEl.hidden = false;
    dateEl.textContent = fmtInviteDate(eventDate);
  }

  if (venue || venueAddress) {
    const venueEl = document.getElementById('inviteVenue');
    venueEl.hidden = false;
    venueEl.textContent = [venue, venueAddress].filter(Boolean).join(', ');
  }

  if (mapLink) {
    const mapBtn = document.getElementById('mapBtn');
    mapBtn.hidden = false;
    mapBtn.href = mapLink;

    const mapPanel = document.getElementById('mapPanel');
    mapPanel.hidden = false;
    document.getElementById('mapEmbed').src = toMapEmbedUrl(mapLink, venue || venueAddress);
  }

  if (eventDate) {
    const calBtn = document.getElementById('calendarBtn');
    calBtn.hidden = false;
    calBtn.addEventListener('click', () => downloadCalendarInvite(eventDate, venue || venueAddress));
  }

  const shareUrl = eventShareUrl();
  document.getElementById('qrImage').src =
    `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`;

  document.getElementById('inviteLoading').hidden = true;
  document.getElementById('inviteContent').hidden = false;
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

/**
 * Best-effort conversion of a shared Google Maps link into an
 * embeddable URL. Falls back to a text-search embed built from the
 * venue name/address when the link isn't already an /embed URL.
 */
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
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // default 3-hour block
  const toICSDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const title = document.getElementById('inviteNames').textContent || CURRENT_EVENT.eventName || 'Event';
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
  const title = document.getElementById('inviteNames').textContent || CURRENT_EVENT.eventName || 'EventPay';

  document.getElementById('shareWhatsappBtn').addEventListener('click', () => {
    const msg = `You're invited! ${title}\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  });

  document.getElementById('copyLinkBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied.', 'success');
    } catch {
      toast('Could not copy the link.', 'error');
    }
  });

  if (navigator.share) {
    const nativeBtn = document.getElementById('nativeShareBtn');
    nativeBtn.hidden = false;
    nativeBtn.addEventListener('click', () => {
      navigator.share({ title, url: shareUrl }).catch(() => {});
    });
  }
}
