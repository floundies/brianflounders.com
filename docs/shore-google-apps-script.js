/**
 * Shore House Request Backend
 *
 * Paste this file into Google Apps Script, run setupShoreRequestSystem(),
 * then deploy as a Web App that executes as you and is accessible to anyone.
 */

const CONFIG = {
  sheetIdProperty: 'SHORE_REQUEST_SHEET_ID',
  calendarIdProperty: 'SHORE_APPROVED_CALENDAR_ID',
  adminEmailProperty: 'SHORE_ADMIN_EMAIL',
  publicPageUrlProperty: 'SHORE_PUBLIC_PAGE_URL',
  requestsSheetName: 'Requests',
  settingsSheetName: 'Settings',
  timezone: 'America/New_York',
  status: {
    pending: 'pending',
    approved: 'approved',
    denied: 'denied',
  },
  units: {
    'one-bedroom': "Grammy's Flop House",
    'two-bedroom': "Papa's Upper Deck",
    cottage: 'Cottage',
  },
  eventColors: {
    pending: CalendarApp.EventColor.GRAY,
    'one-bedroom': CalendarApp.EventColor.CYAN,
    'two-bedroom': CalendarApp.EventColor.PALE_RED,
    cottage: CalendarApp.EventColor.YELLOW,
  },
};

const REQUEST_HEADERS = [
  'request_id',
  'token',
  'submitted_at',
  'status',
  'unit',
  'unit_name',
  'arrival',
  'departure',
  'exclusive',
  'name',
  'email',
  'phone',
  'adults',
  'kids',
  'dogs',
  'notes',
  'warnings',
  'calendar_event_id',
  'approved_at',
  'denied_at',
  'admin_notes',
];

function setupShoreRequestSystem() {
  const props = PropertiesService.getScriptProperties();
  let sheetId = props.getProperty(CONFIG.sheetIdProperty);

  if (!sheetId) {
    const spreadsheet = SpreadsheetApp.create('Shore House Requests');
    sheetId = spreadsheet.getId();
    props.setProperty(CONFIG.sheetIdProperty, sheetId);
  }

  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const requests = getOrCreateSheet_(spreadsheet, CONFIG.requestsSheetName);
  ensureHeaderRow_(requests, REQUEST_HEADERS);
  requests.setFrozenRows(1);
  requests.autoResizeColumns(1, REQUEST_HEADERS.length);

  const settings = getOrCreateSheet_(spreadsheet, CONFIG.settingsSheetName);
  settings.clear();
  settings.getRange(1, 1, 6, 2).setValues([
    ['Spreadsheet ID', sheetId],
    ['Calendar ID property', CONFIG.calendarIdProperty],
    ['Admin email property', CONFIG.adminEmailProperty],
    ['Public page URL property', CONFIG.publicPageUrlProperty],
    ['Web app URL', 'Deploy first, then paste URL here if desired'],
    ['Notes', 'Set script properties before using the public form'],
  ]);
  settings.autoResizeColumns(1, 2);

  return {
    ok: true,
    sheetId,
    spreadsheetUrl: spreadsheet.getUrl(),
    message: 'Set script properties, deploy as a web app, then connect VITE_SHORE_ENDPOINT.',
  };
}

function doPost(event) {
  try {
    const payload = parsePayload_(event);
    const request = normalizeRequest_(payload);
    const validation = validateRequest_(request);

    if (!validation.ok) {
      return json_({ ok: false, errors: validation.errors }, 400);
    }

    request.warnings = buildWarnings_(request).join(' | ');
    request.request_id = makeRequestId_();
    request.token = makeToken_();
    request.status = CONFIG.status.pending;
    request.submitted_at = new Date().toISOString();

    const eventId = createPendingCalendarEvent_(request);
    request.calendar_event_id = eventId;

    appendRequest_(request);
    emailAdmin_(request);
    emailRequester_(request, 'received');

    return json_({
      ok: true,
      requestId: request.request_id,
      message: 'Request received.',
      warnings: request.warnings,
    });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: String(error && error.message ? error.message : error) }, 500);
  }
}

function doGet(event) {
  try {
    const action = String(event.parameter.action || '').toLowerCase();
    if (action === 'approve') return handleDecision_(event.parameter, CONFIG.status.approved);
    if (action === 'deny') return handleDecision_(event.parameter, CONFIG.status.denied);
    if (action === 'events') return listEvents_(event.parameter);
    if (action === 'health') return json_({ ok: true, service: 'shore-request' }, 200, event.parameter.callback);
    return html_('Shore request backend is running.');
  } catch (error) {
    console.error(error);
    return html_('Something went wrong: ' + escapeHtml_(String(error && error.message ? error.message : error)));
  }
}

function handleDecision_(params, decision) {
  const requestId = String(params.id || '');
  const token = String(params.token || '');
  const adminNotes = String(params.notes || '');

  if (!requestId || !token) return html_('Missing request id or token.');

  const sheet = getRequestsSheet_();
  const rows = getRows_(sheet);
  const index = rows.findIndex((row) => row.request_id === requestId && row.token === token);
  if (index < 0) return html_('Request not found or approval link is invalid.');

  const request = rows[index];
  if (request.status !== CONFIG.status.pending) {
    if (decision === CONFIG.status.approved && request.status === CONFIG.status.approved) {
      const calendarEventId = approveCalendarEvent_(request);
      if (calendarEventId && calendarEventId !== request.calendar_event_id) {
        updateRow_(sheet, index + 2, { calendar_event_id: calendarEventId });
      }
      return html_('This request was already approved. Calendar event refreshed.');
    }
    return html_('This request is already ' + escapeHtml_(request.status) + '.');
  }

  const rowNumber = index + 2;
  const now = new Date().toISOString();
  const updates = {
    status: decision,
    admin_notes: adminNotes,
  };

  if (decision === CONFIG.status.approved) {
    updates.approved_at = now;
    updates.calendar_event_id = approveCalendarEvent_(request);
    updateRow_(sheet, rowNumber, updates);
    emailRequester_(Object.assign({}, request, updates), 'approved');
    return html_('Approved: ' + escapeHtml_(request.unit_name) + ' for ' + escapeHtml_(request.name) + '.');
  }

  updates.denied_at = now;
  denyCalendarEvent_(request);
  updateRow_(sheet, rowNumber, updates);
  emailRequester_(Object.assign({}, request, updates), 'denied');
  return html_('Denied: ' + escapeHtml_(request.unit_name) + ' for ' + escapeHtml_(request.name) + '.');
}

function listEvents_(params) {
  const start = isDateString_(params.start) ? params.start : formatDate_(new Date());
  const endFallback = new Date();
  endFallback.setMonth(endFallback.getMonth() + 3);
  const end = isDateString_(params.end) ? params.end : formatDate_(endFallback);
  const calendar = getCalendar_();
  const calendarEvents = calendar.getEvents(parseDate_(start), addDays_(parseDate_(end), 1));
  const calendarRows = calendarEvents
    .map(parseCalendarEvent_)
    .filter(Boolean)
    .filter((event) => rangesOverlap_(event.arrival, event.departure, start, end));
  const sheetRows = getRequestEventsFromSheet_(start, end);
  const events = mergeEventRows_(calendarRows.concat(sheetRows));

  return json_({
    ok: true,
    start,
    end,
    events,
    debug: {
      calendarEventCount: calendarEvents.length,
      parsedCalendarEventCount: calendarRows.length,
      sheetEventCount: sheetRows.length,
    },
  }, 200, params.callback);
}

function getRequestEventsFromSheet_(start, end) {
  const rows = getRows_(getRequestsSheet_());
  return rows
    .filter((row) => [CONFIG.status.pending, CONFIG.status.approved].includes(row.status))
    .filter((row) => isDateString_(row.arrival) && isDateString_(row.departure))
    .filter((row) => rangesOverlap_(row.arrival, row.departure, start, end))
    .map((row) => ({
      requestId: row.calendar_event_id || row.request_id,
      status: row.status,
      unit: row.unit,
      unitName: row.unit_name || CONFIG.units[row.unit] || row.unit,
      arrival: row.arrival,
      departure: row.departure,
      exclusive: row.exclusive || 'non-exclusive',
      name: row.name,
      displayName: getDisplayName_(row),
      people: countPeople_(row),
      dogs: Number(row.dogs || 0),
      notes: row.notes || '',
    }));
}

function mergeEventRows_(events) {
  const seen = {};
  return events.filter((event) => {
    const key = [
      event.unit,
      event.arrival,
      event.departure,
      String(event.name || '').toLowerCase(),
      event.status,
    ].join('|');
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function normalizeRequest_(payload) {
  const unit = String(payload.unit || '').trim();
  return {
    unit,
    unit_name: CONFIG.units[unit] || unit,
    arrival: String(payload.arrival || '').trim(),
    departure: String(payload.departure || '').trim(),
    exclusive: String(payload.exclusive || 'non-exclusive').trim(),
    name: String(payload.name || '').trim(),
    email: String(payload.email || '').trim(),
    phone: String(payload.phone || '').trim(),
    adults: numberString_(payload.adults),
    kids: numberString_(payload.kids),
    dogs: numberString_(payload.dogs),
    notes: String(payload.notes || '').trim(),
  };
}

function validateRequest_(request) {
  const errors = [];
  if (!request.name) errors.push('Name is required.');
  if (!request.email || !request.email.includes('@')) errors.push('Valid email is required.');
  if (!CONFIG.units[request.unit]) errors.push('Unknown unit.');
  if (!isDateString_(request.arrival)) errors.push('Arrival date is required.');
  if (!isDateString_(request.departure)) errors.push('Departure date is required.');
  if (isDateString_(request.arrival) && isDateString_(request.departure)) {
    if (parseDate_(request.departure).getTime() < parseDate_(request.arrival).getTime()) {
      errors.push('Departure cannot be before arrival.');
    }
  }
  if (request.unit !== 'cottage' && Number(request.dogs) > 0) {
    errors.push('Dogs are only allowed in the cottage.');
  }
  return { ok: errors.length === 0, errors };
}

function buildWarnings_(request) {
  const warnings = [];
  const overlaps = findOverlappingRows_(request);
  const exclusiveOverlaps = overlaps.filter((row) => row.unit === request.unit && (row.exclusive === 'exclusive' || request.exclusive === 'exclusive'));

  if (exclusiveOverlaps.length) {
    warnings.push('Exclusive-use overlap for this unit: ' + exclusiveOverlaps.map((row) => row.name + ' ' + row.arrival + '-' + row.departure).join('; '));
  }

  if (request.unit === 'cottage') {
    const dogsAlready = overlaps
      .filter((row) => row.unit === 'cottage')
      .reduce((sum, row) => sum + Number(row.dogs || 0), 0);
    const totalDogs = dogsAlready + Number(request.dogs || 0);
    if (totalDogs > 2) warnings.push('Cottage dog count overlaps above 2 dogs: total would be ' + totalDogs + '.');
  }

  return warnings;
}

function createPendingCalendarEvent_(request) {
  return createCalendarEvent_(request, CONFIG.status.pending);
}

function createCalendarEvent_(request, status) {
  const calendar = getCalendar_();
  const title = buildCalendarTitle_(request, status);
  const event = calendar.createAllDayEvent(title, parseDate_(request.arrival), addDays_(parseDate_(request.departure), 1), {
    description: buildCalendarDescription_(Object.assign({}, request, { status })),
    guests: request.email,
    sendInvites: false,
  });
  event.setColor(getCalendarColor_(request, status));
  return event.getId();
}

function approveCalendarEvent_(request) {
  const event = getCalendarEvent_(request.calendar_event_id, request);
  if (!event) return createCalendarEvent_(request, CONFIG.status.approved);
  event.setTitle(buildCalendarTitle_(request, CONFIG.status.approved));
  event.setDescription(buildCalendarDescription_(Object.assign({}, request, { status: CONFIG.status.approved })));
  event.setColor(getCalendarColor_(request, CONFIG.status.approved));
  return event.getId();
}

function denyCalendarEvent_(request) {
  const event = getCalendarEvent_(request.calendar_event_id, request);
  if (event) event.deleteEvent();
}

function buildCalendarDescription_(request) {
  return [
    'Status: ' + (request.status || CONFIG.status.pending),
    'Unit: ' + request.unit_name,
    'Exclusive: ' + request.exclusive,
    'Name: ' + request.name,
    'Email: ' + request.email,
    'Phone: ' + request.phone,
    'Adults: ' + request.adults,
    'Kids: ' + request.kids,
    'Dogs: ' + request.dogs,
    'Notes: ' + request.notes,
    'Warnings: ' + (request.warnings || ''),
    'Request ID: ' + request.request_id,
  ].join('\n');
}

function buildCalendarTitle_(request, status) {
  const unitName = request.unit_name || CONFIG.units[request.unit] || request.unit || 'Unit';
  const label = status === CONFIG.status.pending ? 'PENDING' : request.exclusive || 'non-exclusive';
  return '[' + unitName + ', ' + label + '] ' + request.name + ' (' + buildGuestSummary_(request) + ')';
}

function parseCalendarEvent_(event) {
  const title = event.getTitle();
  const parsedTitle = title.match(/^\[([^,\]]+),\s*([^\]]+)\]\s*(.*?)\s*(?:\(([^)]*)\))?$/);
  if (!parsedTitle) return null;

  const unitName = parsedTitle[1].trim();
  const label = parsedTitle[2].trim();
  const name = parsedTitle[3].trim();
  const guestSummary = parsedTitle[4] || '';
  const unit = getUnitIdFromName_(unitName);
  if (!unit) return null;

  const start = event.isAllDayEvent() ? event.getAllDayStartDate() : event.getStartTime();
  const rawEnd = event.isAllDayEvent() ? event.getAllDayEndDate() : event.getEndTime();
  const departure = event.isAllDayEvent() ? addDays_(rawEnd, -1) : rawEnd;
  const status = label.toUpperCase() === 'PENDING' ? CONFIG.status.pending : CONFIG.status.approved;
  const peopleMatch = guestSummary.match(/(\d+)\s*(?:people|person|guests?|guest)?/i);
  const dogsMatch = guestSummary.match(/(\d+)\s*dogs?/i);

  return {
    requestId: event.getId(),
    status,
    unit,
    unitName,
    arrival: formatDate_(start),
    departure: formatDate_(departure),
    exclusive: status === CONFIG.status.pending ? 'pending' : normalizeExclusiveLabel_(label),
    name,
    displayName: getDisplayName_({ name, notes: event.getDescription() }),
    people: peopleMatch ? Number(peopleMatch[1]) : 0,
    dogs: dogsMatch ? Number(dogsMatch[1]) : 0,
    notes: event.getDescription() || '',
  };
}

function getUnitIdFromName_(unitName) {
  const normalized = normalizeText_(unitName);
  const direct = Object.keys(CONFIG.units).find((unit) => normalizeText_(CONFIG.units[unit]) === normalized);
  if (direct) return direct;
  if (normalized.includes('grammy') || normalized.includes('granny') || normalized.includes('flop') || normalized.includes('1st floor') || normalized.includes('first floor')) return 'one-bedroom';
  if (normalized.includes('papa') || normalized.includes('upper') || normalized.includes('2nd floor') || normalized.includes('second floor')) return 'two-bedroom';
  if (normalized.includes('cottage')) return 'cottage';
  return '';
}

function normalizeExclusiveLabel_(label) {
  const normalized = String(label || '').toLowerCase();
  if (normalized === 'e') return 'exclusive';
  if (normalized === 'ne') return 'non-exclusive';
  return normalized.includes('non') ? 'non-exclusive' : 'exclusive';
}

function getCalendarColor_(request, status) {
  if (status === CONFIG.status.pending) return CONFIG.eventColors.pending;
  return CONFIG.eventColors[request.unit] || CalendarApp.EventColor.PALE_BLUE;
}

function countPeople_(request) {
  return Number(request.adults || 0) + Number(request.kids || 0);
}

function buildGuestSummary_(request) {
  const people = countPeople_(request);
  const dogs = Number(request.dogs || 0);
  const parts = [people + ' ' + (people === 1 ? 'person' : 'people')];
  if (dogs > 0) parts.push(dogs + ' ' + (dogs === 1 ? 'dog' : 'dogs'));
  return parts.join(', ');
}

function emailAdmin_(request) {
  const adminEmail = getRequiredProperty_(CONFIG.adminEmailProperty);
  const url = ScriptApp.getService().getUrl();
  const approveUrl = url + '?action=approve&id=' + encodeURIComponent(request.request_id) + '&token=' + encodeURIComponent(request.token);
  const denyUrl = url + '?action=deny&id=' + encodeURIComponent(request.request_id) + '&token=' + encodeURIComponent(request.token);
  const subject = 'Shore request: ' + request.unit_name + ' - ' + request.name + ' (' + request.arrival + ' to ' + request.departure + ')';
  const html = [
    '<h2>New Shore House Request</h2>',
    '<p><b>Unit:</b> ' + escapeHtml_(request.unit_name) + '</p>',
    '<p><b>Dates:</b> ' + escapeHtml_(request.arrival) + ' to ' + escapeHtml_(request.departure) + '</p>',
    '<p><b>Requester:</b> ' + escapeHtml_(request.name) + ' &lt;' + escapeHtml_(request.email) + '&gt;</p>',
    '<p><b>Phone:</b> ' + escapeHtml_(request.phone) + '</p>',
    '<p><b>Exclusive:</b> ' + escapeHtml_(request.exclusive) + '</p>',
    '<p><b>Guests:</b> Adults ' + escapeHtml_(request.adults) + ', kids ' + escapeHtml_(request.kids) + ', dogs ' + escapeHtml_(request.dogs) + '</p>',
    '<p><b>Notes:</b><br>' + escapeHtml_(request.notes).replace(/\n/g, '<br>') + '</p>',
    request.warnings ? '<p style="color:#b45309"><b>Warnings:</b> ' + escapeHtml_(request.warnings) + '</p>' : '',
    '<p><a href="' + approveUrl + '">Approve request</a> &nbsp; <a href="' + denyUrl + '">Deny request</a></p>',
  ].join('');

  MailApp.sendEmail({
    to: adminEmail,
    subject,
    htmlBody: html,
    replyTo: request.email,
  });
}

function emailRequester_(request, type) {
  if (!request.email) return;
  const publicUrl = PropertiesService.getScriptProperties().getProperty(CONFIG.publicPageUrlProperty) || '';
  const unitAndDates = request.unit_name + ' from ' + request.arrival + ' to ' + request.departure;
  const subjects = {
    received: 'Shore request received: ' + unitAndDates,
    approved: 'Shore request approved: ' + unitAndDates,
    denied: 'Shore request update: ' + unitAndDates,
  };
  const messages = {
    received: 'Your shore house request was received and is pending confirmation.',
    approved: 'Your shore house request was approved.',
    denied: 'Your shore house request was not approved. Check with Brian if you have questions.',
  };

  const html = [
    '<p>' + escapeHtml_(messages[type]) + '</p>',
    '<p><b>Unit:</b> ' + escapeHtml_(request.unit_name) + '</p>',
    '<p><b>Dates:</b> ' + escapeHtml_(request.arrival) + ' to ' + escapeHtml_(request.departure) + '</p>',
    '<p><b>Exclusive:</b> ' + escapeHtml_(request.exclusive) + '</p>',
    publicUrl ? '<p><a href="' + publicUrl + '">View the shore calendar</a></p>' : '',
  ].join('');

  MailApp.sendEmail({
    to: request.email,
    subject: subjects[type],
    htmlBody: html,
  });
}

function appendRequest_(request) {
  const sheet = getRequestsSheet_();
  const row = REQUEST_HEADERS.map((header) => request[header] || '');
  sheet.appendRow(row);
}

function findOverlappingRows_(request) {
  const rows = getRows_(getRequestsSheet_());
  return rows.filter((row) => {
    if (![CONFIG.status.pending, CONFIG.status.approved].includes(row.status)) return false;
    return rangesOverlap_(request.arrival, request.departure, row.arrival, row.departure);
  });
}

function getRows_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      const value = row[index];
      if (value == null) {
        item[header] = '';
      } else if (value instanceof Date) {
        item[header] = ['arrival', 'departure'].includes(header) ? formatDate_(value) : value.toISOString();
      } else {
        item[header] = String(value);
      }
    });
    return item;
  });
}

function updateRow_(sheet, rowNumber, updates) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  Object.keys(updates).forEach((key) => {
    const column = headers.indexOf(key) + 1;
    if (column > 0) sheet.getRange(rowNumber, column).setValue(updates[key]);
  });
}

function getRequestsSheet_() {
  const sheetId = getRequiredProperty_(CONFIG.sheetIdProperty);
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  return getOrCreateSheet_(spreadsheet, CONFIG.requestsSheetName);
}

function getCalendar_() {
  const calendarId = getRequiredProperty_(CONFIG.calendarIdProperty);
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw new Error('Calendar not found for id: ' + calendarId);
  return calendar;
}

function getCalendarEvent_(eventId, request) {
  const calendar = getCalendar_();
  if (eventId) {
    const event = calendar.getEventById(eventId);
    if (event) return event;
  }

  if (!request || !request.request_id || !request.arrival || !request.departure) return null;

  const searchStart = addDays_(parseDate_(request.arrival), -1);
  const searchEnd = addDays_(parseDate_(request.departure), 2);
  const needle = 'Request ID: ' + request.request_id;
  const matches = calendar.getEvents(searchStart, searchEnd).filter((event) => {
    return String(event.getDescription() || '').indexOf(needle) >= 0;
  });

  return matches.length ? matches[0] : null;
}

function getRequiredProperty_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value) throw new Error('Missing script property: ' + key);
  return value;
}

function parsePayload_(event) {
  if (!event || !event.postData || !event.postData.contents) throw new Error('Missing request body.');
  return JSON.parse(event.postData.contents);
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeaderRow_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = current.every((cell) => !cell);
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  const existing = current.map(String);
  const missing = headers.filter((header) => !existing.includes(header));
  if (missing.length) {
    sheet.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
}

function parseDate_(value) {
  const parts = String(value).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function addDays_(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate_(date) {
  return Utilities.formatDate(date, CONFIG.timezone, 'yyyy-MM-dd');
}

function isDateString_(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function rangesOverlap_(arrivalA, departureA, arrivalB, departureB) {
  const startA = parseDate_(arrivalA).getTime();
  const endA = addDays_(parseDate_(departureA), 1).getTime();
  const startB = parseDate_(arrivalB).getTime();
  const endB = addDays_(parseDate_(departureB), 1).getTime();
  return startA < endB && startB < endA;
}

function numberString_(value) {
  const number = Number(value || 0);
  return String(Number.isFinite(number) && number >= 0 ? number : 0);
}

function getDisplayName_(request) {
  const notes = String(request.notes || '').trim();
  const match = notes.match(/(?:display|family|last name|calendar)\s*[:=-]\s*([^\n,;]+)/i);
  if (match && match[1]) return match[1].trim();
  return String(request.name || '').trim();
}

function normalizeText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function makeRequestId_() {
  return 'shore_' + Utilities.formatDate(new Date(), CONFIG.timezone, 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 8);
}

function makeToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function json_(payload, statusCode, callback) {
  if (callback) {
    const safeCallback = String(callback).replace(/[^\w.$]/g, '');
    const output = ContentService.createTextOutput(safeCallback + '(' + JSON.stringify(Object.assign({ statusCode: statusCode || 200 }, payload)) + ');');
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  }

  const output = ContentService.createTextOutput(JSON.stringify(Object.assign({ statusCode: statusCode || 200 }, payload)));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function html_(body) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px">' +
      body +
      '</body>'
  );
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
