/* =========================================================
   ICE Card Maker: app.js
   Plain JavaScript, no frameworks. AI requests go through
   ai.js (window.AI).

    1. Settings and example data
    2. People (profiles) and saving
    3. Reading and filling the form
    4. What the card shows (including translations)
    5. QR code
    6. Card preview
    7. Lock-screen wallpaper
    8. AI: scan a prescription
    9. AI: notes for responders
   10. AI: translate the card
   11. Print, download, backup
   12. Events and startup
   ========================================================= */
'use strict';

/* ---------- 1. Settings and example data ---------- */

const STORE_KEY = 'ice-card:v2';
const OLD_STORE_KEY = 'ice-card:v1'; // version 1 saved a single person
const MAX_CONTACTS = 3;
const MAX_PEOPLE = 8;

// Simple text fields: form id is "f-" + key
const TEXT_FIELDS = ['name', 'dob', 'blood', 'country', 'allergies', 'conditions', 'medications', 'notes', 'doctorName', 'doctorPhone'];

// Emergency phone numbers by country
const COUNTRIES = {
  IN: { name: 'India', number: '112' },
  US: { name: 'United States / Canada', number: '911' },
  GB: { name: 'United Kingdom', number: '999' },
  EU: { name: 'European Union', number: '112' },
  AU: { name: 'Australia', number: '000' },
  NZ: { name: 'New Zealand', number: '111' },
  SG: { name: 'Singapore', number: '995' },
  AE: { name: 'United Arab Emirates', number: '998' },
};

// Languages offered for translation (left-to-right scripts only)
const LANGUAGES = {
  en: 'English', hi: 'Hindi', bn: 'Bengali', mr: 'Marathi', ta: 'Tamil', te: 'Telugu',
  kn: 'Kannada', ml: 'Malayalam', gu: 'Gujarati', pa: 'Punjabi',
  es: 'Spanish', fr: 'French', de: 'German', zh: 'Chinese (Simplified)', ja: 'Japanese',
};

// Every label printed on the card, in English
const LABELS_EN = {
  heading: 'Medical emergency information',
  allergies: 'Allergies',
  conditions: 'Conditions',
  medications: 'Medication',
  blood: 'Blood',
  bloodGroup: 'Blood group',
  born: 'Born',
  notes: 'Notes for responders',
  contacts: 'Emergency contacts',
  doctor: 'Doctor',
  donor: 'Organ donor',
  call: 'Call',
  scan: 'Scan for full details',
  ice: 'In case of emergency',
};

const WALLPAPER_SIZES = { iphone: [1170, 2532], android: [1080, 2400] };

function emptyData() {
  return {
    name: '', dob: '', blood: '', country: 'IN', organDonor: false,
    allergies: '', conditions: '', medications: '',
    notes: '', doctorName: '', doctorPhone: '',
    contacts: [{ name: '', relation: '', phone: '' }],
    cardLang: 'en',
  };
}

// Shown on first visit so the page never opens empty
function exampleData() {
  return {
    ...emptyData(),
    name: 'Riya Sharma',
    dob: '2004-03-12',
    blood: 'O+',
    organDonor: true,
    allergies: 'Penicillin, peanuts',
    conditions: 'Asthma (mild)',
    medications: 'Salbutamol inhaler as needed',
    notes: 'Inhaler is in the front pocket of my backpack\nSevere peanut allergy: check for an EpiPen in my bag',
    doctorName: 'Dr. Meera Iyer',
    doctorPhone: '+91 80 4123 4567',
    contacts: [
      { name: 'Anita Sharma', relation: 'Mother', phone: '+91 98765 43210' },
      { name: 'Dev Kapoor', relation: 'Friend', phone: '+91 91234 56789' },
    ],
  };
}

// Shortcut for document.getElementById
const $ = (id) => document.getElementById(id);

const contactsBox = $('contacts');
const contactTemplate = $('contact-template');
const wallpaperCanvas = $('wp-canvas');

/* ---------- 2. People (profiles) and saving ---------- */
// store = { activeId, isExample, people: [{ id, data, translation }] }
// Storage can be blocked (private mode), so every read and write is
// wrapped in try/catch and the app keeps working without it.

let store;

function newId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function newPerson(data) {
  return { id: newId(), data: normalizeData(data), translation: null };
}

/** Makes sure saved or imported data has every field, with safe types. */
function normalizeData(input) {
  const base = emptyData();
  const data = { ...base };
  if (!input || typeof input !== 'object') return data;

  TEXT_FIELDS.forEach((key) => {
    if (typeof input[key] === 'string') data[key] = input[key].slice(0, 400);
  });
  if (!COUNTRIES[data.country]) data.country = base.country;
  data.organDonor = input.organDonor === true;
  data.cardLang = LANGUAGES[input.cardLang] ? input.cardLang : 'en';

  if (Array.isArray(input.contacts) && input.contacts.length) {
    data.contacts = input.contacts.slice(0, MAX_CONTACTS).map((c) => ({
      name: String((c && c.name) || '').slice(0, 40),
      relation: String((c && c.relation) || '').slice(0, 24),
      phone: String((c && c.phone) || '').slice(0, 24),
    }));
  }
  return data;
}

function activePerson() {
  return store.people.find((p) => p.id === store.activeId) || store.people[0];
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.people) && saved.people.length) {
        const people = saved.people.slice(0, MAX_PEOPLE).map((p) => ({
          id: typeof p.id === 'string' ? p.id : newId(),
          data: normalizeData(p.data),
          translation: p.translation && typeof p.translation === 'object' ? p.translation : null,
        }));
        return { activeId: saved.activeId, isExample: false, people };
      }
    }
    // Bring over data from version 1 of the app
    const old = localStorage.getItem(OLD_STORE_KEY);
    if (old) {
      const person = newPerson(JSON.parse(old));
      return { activeId: person.id, isExample: false, people: [person] };
    }
  } catch (err) { /* fall through to the example */ }
  return null;
}

function exampleStore() {
  const person = newPerson(exampleData());
  return { activeId: person.id, isExample: true, people: [person] };
}

let saveTimer;
function scheduleSave() {
  if (store.isExample) return; // the example is never saved
  setStatus('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function saveNow() {
  try {
    const { activeId, people } = store;
    localStorage.setItem(STORE_KEY, JSON.stringify({ activeId, people }));
    setStatus('Saved on this device');
  } catch (err) {
    setStatus('Could not save. Your browser is blocking storage.', true);
  }
}

function setStatus(text, isError = false) {
  const el = $('save-status');
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

/** Draws one tab per person plus an "Add person" tab. */
function renderTabs() {
  const box = $('profile-tabs');
  box.innerHTML = '';
  store.people.forEach((person) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    const isActive = person.id === store.activeId;
    tab.setAttribute('aria-selected', String(isActive));
    tab.textContent = person.data.name.split(' ')[0] || 'New person';
    tab.addEventListener('click', () => switchPerson(person.id));
    box.appendChild(tab);
  });

  if (store.people.length < MAX_PEOPLE) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'tab tab-add';
    add.textContent = '+ Add person';
    add.addEventListener('click', addPerson);
    box.appendChild(add);
  }
}

function switchPerson(id) {
  store.activeId = id;
  fillForm(activePerson().data);
  renderTabs();
  resetDeleteButton();
  $('scan-result').hidden = true;
  $('notes-status').textContent = '';
  refresh();
  scheduleSave();
}

function addPerson() {
  leaveExample();
  const person = newPerson(emptyData());
  person.data.country = activePerson().data.country; // same country as the family
  store.people.push(person);
  switchPerson(person.id);
  $('f-name').focus();
}

// Deleting needs two clicks, because browsers inside Claude block confirm()
let deleteTimer;
function deletePerson() {
  const button = $('delete-profile');
  if (button.dataset.armed !== 'true') {
    button.dataset.armed = 'true';
    button.textContent = `Click again to delete ${activePerson().data.name || 'this person'}`;
    deleteTimer = setTimeout(resetDeleteButton, 4000);
    return;
  }
  resetDeleteButton();
  leaveExample();
  store.people = store.people.filter((p) => p.id !== store.activeId);
  if (!store.people.length) store.people.push(newPerson(emptyData()));
  switchPerson(store.people[0].id);
}

function resetDeleteButton() {
  clearTimeout(deleteTimer);
  const button = $('delete-profile');
  button.dataset.armed = 'false';
  button.textContent = 'Delete this person';
}

/** The first real edit turns the example into the user's own saved data. */
function leaveExample() {
  if (!store.isExample) return;
  store.isExample = false;
  $('example-banner').hidden = true;
}

/* ---------- 3. Reading and filling the form ---------- */

/** Copies the form into the active person's data. */
function readForm() {
  const data = activePerson().data;
  TEXT_FIELDS.forEach((key) => {
    data[key] = $('f-' + key).value.trim();
  });
  data.organDonor = $('f-donor').checked;
  data.contacts = [...contactsBox.querySelectorAll('.contact')].map((row) => ({
    name: row.querySelector('[data-field="name"]').value.trim(),
    relation: row.querySelector('[data-field="relation"]').value.trim(),
    phone: row.querySelector('[data-field="phone"]').value.trim(),
  }));
  return data;
}

/** Puts a person's data into the form fields. */
function fillForm(data) {
  TEXT_FIELDS.forEach((key) => {
    $('f-' + key).value = data[key] || '';
  });
  $('f-donor').checked = data.organDonor;
  $('card-lang').value = data.cardLang;
  renderContactRows(data.contacts.length ? data.contacts : emptyData().contacts);
}

/** Builds one form row per emergency contact from the <template>. */
function renderContactRows(contacts) {
  contactsBox.innerHTML = '';
  contacts.slice(0, MAX_CONTACTS).forEach((contact, i) => {
    const row = contactTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector('.contact-label').textContent = 'Contact ' + (i + 1);

    // Give every input a unique id so its <label> is linked to it
    row.querySelectorAll('.field').forEach((field) => {
      const input = field.querySelector('input');
      const id = `contact-${i}-${input.dataset.field}`;
      input.id = id;
      input.value = contact[input.dataset.field] || '';
      field.querySelector('label').htmlFor = id;
    });

    // The first contact cannot be removed, only cleared
    const remove = row.querySelector('.remove-contact');
    remove.hidden = contacts.length === 1;
    remove.dataset.index = i;
    contactsBox.appendChild(row);
  });
  $('add-contact').disabled = contacts.length >= MAX_CONTACTS;
}

/** Fills the select menus from the settings objects above. */
function buildSelects() {
  Object.entries(COUNTRIES).forEach(([code, c]) => {
    $('f-country').add(new Option(`${c.name} (${c.number})`, code));
  });
  Object.entries(LANGUAGES).forEach(([code, name]) => {
    $('card-lang').add(new Option(name, code));
  });
}

/* ---------- 4. What the card shows ---------- */

/** Turns "2004-03-12" into "12 Mar 2004". */
function formatDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate + 'T00:00:00');
  if (isNaN(date)) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function filledContacts(data) {
  return data.contacts.filter((c) => c.name || c.phone);
}

function noteLines(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** "Anita Sharma (Mother) +91 98765 43210" */
function contactLine(c) {
  return [c.name, c.relation && `(${c.relation})`, c.phone].filter(Boolean).join(' ');
}

/** The parts of the card that get translated, as one object. */
function translatableParts(data) {
  return {
    allergies: data.allergies,
    conditions: data.conditions,
    medications: data.medications,
    notes: noteLines(data.notes),
    relations: filledContacts(data).map((c) => c.relation),
  };
}

/** A fingerprint of the text, so we know when a translation is out of date. */
function translationKey(data) {
  return data.cardLang + '|' + JSON.stringify(translatableParts(data));
}

/**
 * Everything the card and wallpaper need, already in the right language.
 * Falls back to English while a translation is missing or out of date.
 */
function buildView(person) {
  const data = person.data;
  const parts = translatableParts(data);
  const t = person.translation;
  const wantsTranslation = data.cardLang !== 'en';
  const useTranslation = wantsTranslation && t && t.key === translationKey(data);

  const labels = useTranslation ? { ...LABELS_EN, ...t.labels } : LABELS_EN;
  const values = useTranslation ? { ...parts, ...t.values } : parts;
  const contacts = filledContacts(data).map((c, i) => ({
    ...c,
    relation: (values.relations && values.relations[i]) || c.relation,
  }));
  const country = COUNTRIES[data.country] || COUNTRIES.IN;

  return {
    data,
    labels,
    allergies: values.allergies,
    conditions: values.conditions,
    medications: values.medications,
    notes: values.notes || [],
    contacts,
    emergencyNumber: country.number,
    blood: data.blood === 'Unknown' ? '?' : (data.blood || '–'),
    born: data.dob ? `${labels.born} ${formatDate(data.dob)}` : '',
    doctor: [data.doctorName, data.doctorPhone].filter(Boolean).join(' · '),
    translationState: !wantsTranslation ? 'none' : useTranslation ? 'done' : 'needed',
  };
}

/* ---------- 5. QR code ---------- */
// The QR code holds plain English text, so any phone camera can read it
// without the internet or this website.

// Encode text as UTF-8 so names like "José" or "प्रिया" scan correctly
if (window.qrcode) {
  qrcode.stringToBytes = (text) => Array.from(new TextEncoder().encode(text));
}

function buildQrText(data) {
  const lines = ['EMERGENCY MEDICAL INFO'];
  const add = (label, value) => { if (value) lines.push(`${label}: ${value}`); };
  add('Name', data.name);
  add('Born', formatDate(data.dob));
  add('Blood group', data.blood);
  add('Allergies', data.allergies);
  add('Conditions', data.conditions);
  add('Medications', data.medications);
  add('Notes', noteLines(data.notes).join('; '));
  add('Doctor', [data.doctorName, data.doctorPhone].filter(Boolean).join(' '));
  if (data.organDonor) lines.push('Organ donor: yes');
  filledContacts(data).forEach((c, i) => lines.push(`ICE ${i + 1}: ${contactLine(c)}`));
  return lines.join('\n');
}

/** Makes a QR object, or null if the library failed to load. */
function makeQr(text) {
  if (!window.qrcode) return null;
  // Version 0 = pick the smallest size that fits.
  // Level M repairs about 15% damage (a scratched card still scans).
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr;
  } catch (err) {
    return null;
  }
}

/** Draws a QR code as black squares on a white square at (x, y). */
function drawQr(ctx, qr, x, y, size) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  if (!qr) return;

  const quiet = 2; // white border, in modules, that scanners need
  const count = qr.getModuleCount();
  const cell = size / (count + quiet * 2);

  ctx.fillStyle = '#000000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) {
        // Math.ceil avoids hairline gaps between neighbouring squares
        ctx.fillRect(
          Math.floor(x + (col + quiet) * cell),
          Math.floor(y + (row + quiet) * cell),
          Math.ceil(cell), Math.ceil(cell)
        );
      }
    }
  }
}

/* ---------- 6. Card preview ---------- */

function renderCard(view, qr) {
  const { data, labels } = view;

  // Every element with data-l="key" shows that label
  document.querySelectorAll('#card-frame [data-l]').forEach((el) => {
    el.textContent = labels[el.dataset.l];
  });

  // Front
  const nameEl = $('c-name');
  nameEl.textContent = data.name || 'Your name';
  nameEl.classList.toggle('is-empty', !data.name);
  $('c-dob').textContent = view.born;
  $('c-blood').textContent = view.blood;
  $('c-call').textContent = `${labels.call} ${view.emergencyNumber}`;

  ['allergies', 'conditions', 'medications'].forEach((key) => {
    $('c-' + key).textContent = view[key];
    $('row-' + key).hidden = !view[key];
  });

  // The front has room for two contacts; the back and the QR code hold all
  const box = $('c-contacts');
  box.innerHTML = '';
  if (!view.contacts.length) box.innerHTML = '<p><b>ICE</b>Add an emergency contact</p>';
  view.contacts.slice(0, 2).forEach((c) => {
    const p = document.createElement('p');
    const label = document.createElement('b');
    label.textContent = 'ICE';
    p.append(label, contactLine(c));
    box.appendChild(p);
  });

  const qrCanvas = $('c-qr');
  drawQr(qrCanvas.getContext('2d'), qr, 0, 0, qrCanvas.width);

  // Back
  const notes = $('b-notes');
  notes.innerHTML = '';
  (view.notes.length ? view.notes : ['Add notes for responders in the form.']).forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    notes.appendChild(li);
  });
  notes.classList.toggle('is-empty', !view.notes.length);

  const backContacts = $('b-contacts');
  backContacts.innerHTML = '';
  view.contacts.forEach((c) => {
    const p = document.createElement('p');
    const name = document.createElement('strong');
    name.textContent = [c.name, c.relation && `(${c.relation})`].filter(Boolean).join(' ');
    p.append(name, document.createElement('br'), c.phone);
    backContacts.appendChild(p);
  });

  $('b-doctor').textContent = view.doctor;
  $('b-doctor-row').hidden = !view.doctor;
  $('b-donor').hidden = !data.organDonor;

  // The emergency box above the card
  $('sos-number').textContent = view.emergencyNumber;
}

/* ---------- 7. Lock-screen wallpaper ---------- */

/** Splits text into lines that fit maxWidth; adds "…" if cut short. */
function wrapText(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last.trimEnd() + '…';
  }
  return lines;
}

/** Draws a rectangle with rounded corners (works in older browsers too). */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Paints the whole wallpaper onto a canvas of the given size. */
function renderWallpaper(canvas, view, qr, width, height) {
  const { data, labels } = view;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const u = width / 1170;          // scale unit: 1 at iPhone width
  const padX = 90 * u;
  const innerW = width - padX * 2;
  const maxY = height - 150 * u;   // keep clear of the home bar
  const display = (weight, size) => `${weight} ${size * u}px Archivo, "Helvetica Neue", Arial, sans-serif`;
  const body = (weight, size) => `${weight} ${size * u}px Inter, system-ui, Arial, sans-serif`;

  // Background: deep navy with a faint red glow at the bottom
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#0b1220');
  bg.addColorStop(0.7, '#111c30');
  bg.addColorStop(1, '#2a0f18');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Details start below the area where the lock-screen clock sits
  let y = height * 0.32;

  // Red pill: "IN CASE OF EMERGENCY · CALL 112"
  ctx.font = display(700, 30);
  const pillText = `${labels.ice} · ${labels.call} ${view.emergencyNumber}`.toUpperCase();
  const pillW = Math.min(ctx.measureText(pillText).width + 56 * u, innerW);
  roundRect(ctx, padX, y, pillW, 64 * u, 32 * u);
  ctx.fillStyle = '#c8102e';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, padX + 28 * u, y + 33 * u, innerW - 56 * u);
  ctx.textBaseline = 'alphabetic';
  y += 64 * u + 100 * u;

  // Name
  ctx.font = display(800, 92);
  ctx.fillStyle = '#ffffff';
  wrapText(ctx, data.name || 'Your name', innerW, 2).forEach((line) => {
    ctx.fillText(line, padX, y);
    y += 104 * u;
  });
  y += 10 * u;

  // Row: blood group box on the left, QR code on the right
  const rowH = 340 * u;
  const qrSize = rowH;
  const bloodW = innerW - qrSize - 40 * u;

  roundRect(ctx, padX, y, bloodW, rowH, 28 * u);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.lineWidth = 4 * u;
  ctx.strokeStyle = '#ff5468';
  ctx.stroke();

  ctx.fillStyle = '#ff8a97';
  ctx.font = display(700, 30);
  ctx.fillText(labels.bloodGroup.toUpperCase(), padX + 40 * u, y + 70 * u, bloodW - 80 * u);
  ctx.fillStyle = '#ffffff';
  ctx.font = display(800, 150);
  ctx.fillText(view.blood, padX + 36 * u, y + 220 * u);
  ctx.fillStyle = '#b5c0d2';
  ctx.font = body(500, 34);
  const subLine = [view.born, data.organDonor ? labels.donor : ''].filter(Boolean).join(' · ');
  if (subLine) ctx.fillText(subLine, padX + 40 * u, y + 290 * u, bloodW - 80 * u);

  const qrX = padX + innerW - qrSize;
  roundRect(ctx, qrX, y, qrSize, qrSize, 28 * u);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.save();
  ctx.clip(); // keep the QR inside the rounded white box
  drawQr(ctx, qr, qrX + 14 * u, y + 14 * u, qrSize - 28 * u);
  ctx.restore();

  y += rowH + 30 * u;
  ctx.fillStyle = '#8f9bb0';
  ctx.font = body(500, 28);
  ctx.textAlign = 'right';
  ctx.fillText(labels.scan, padX + innerW, y + 10 * u);
  ctx.textAlign = 'left';
  y += 76 * u;

  // Labelled sections. Each stops drawing if it would run off the bottom.
  const section = (label, lines) => {
    if (!lines.length || y + 100 * u > maxY) return;
    ctx.fillStyle = '#ff8a97';
    ctx.font = display(700, 30);
    ctx.fillText(label.toUpperCase(), padX, y);
    y += 54 * u;
    ctx.fillStyle = '#ffffff';
    ctx.font = body(500, 42);
    lines.forEach((line) => {
      if (y > maxY) return;
      ctx.fillText(line, padX, y);
      y += 54 * u;
    });
    y += 30 * u;
  };

  ctx.font = body(500, 42); // so wrapText measures with the right font
  if (view.allergies) section(labels.allergies, wrapText(ctx, view.allergies, innerW, 2));
  if (view.conditions) section(labels.conditions, wrapText(ctx, view.conditions, innerW, 2));
  if (view.medications) section(labels.medications, wrapText(ctx, view.medications, innerW, 2));
  if (view.notes.length) section(labels.notes, wrapText(ctx, view.notes[0], innerW, 2));

  const contacts = view.contacts.map((c) => wrapText(ctx, contactLine(c), innerW, 1)[0]);
  section(labels.contacts, contacts);
}

/* ---------- 8. AI: scan a prescription ---------- */

/** Shrinks a photo to at most 1600 px so it uploads quickly. */
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('resize failed'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

const SCAN_PROMPT = `You are helping someone fill in their emergency medical card.
The attached photo should be a prescription, discharge summary, medical report or medicine label.

Extract only what is clearly written. Do not guess or add anything that is not on the page.
- medications: each medicine with its strength and how often it is taken if written, e.g. "Metformin 500 mg twice daily"
- conditions: diagnoses or long-term conditions named on the document
- allergies: allergies the document states
- summary: one short sentence saying what the document is, or why nothing could be read

Reply with only JSON in this exact shape:
{"medications": ["..."], "conditions": ["..."], "allergies": ["..."], "summary": "..."}
Use empty arrays when nothing is found. If the photo is not a medical document, return empty arrays and say so in summary.`;

async function scanPrescription(file) {
  const box = $('scan-result');
  box.hidden = false;
  box.className = 'scan-result';
  box.textContent = 'Reading the photo… this can take up to a minute.';
  $('scan-label').classList.add('is-busy');

  try {
    const image = await prepareImage(file);
    const result = await AI.askJson(SCAN_PROMPT, { images: [image] });
    showScanResult(result);
  } catch (err) {
    box.classList.add('is-error');
    box.textContent = err && err.code ? AI.describeError(err) : 'That file could not be opened as an image.';
  } finally {
    $('scan-label').classList.remove('is-busy');
    $('scan-input').value = ''; // allow choosing the same photo again
  }
}

/** Shows the suggestions with tick boxes, so the user decides what to add. */
function showScanResult(result) {
  const box = $('scan-result');
  box.innerHTML = '';
  const list = (key) => (Array.isArray(result && result[key]) ? result[key].map(String).filter(Boolean).slice(0, 10) : []);
  const groups = [
    ['medications', 'Medications'],
    ['conditions', 'Medical conditions'],
    ['allergies', 'Allergies'],
  ];

  const summary = document.createElement('p');
  summary.className = 'scan-summary';
  summary.textContent = (result && typeof result.summary === 'string' && result.summary) || 'Here is what the AI found.';
  box.appendChild(summary);

  let total = 0;
  groups.forEach(([key, title]) => {
    const items = list(key);
    if (!items.length) return;
    const group = document.createElement('div');
    group.className = 'scan-group';
    const heading = document.createElement('p');
    heading.className = 'scan-heading';
    heading.textContent = title;
    group.appendChild(heading);
    items.forEach((item) => {
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.dataset.target = key;
      input.value = item;
      const text = document.createElement('span');
      text.textContent = item;
      label.append(input, text);
      group.appendChild(label);
      total++;
    });
    box.appendChild(group);
  });

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (total) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn-primary btn-small';
    add.textContent = 'Add ticked items';
    add.addEventListener('click', addScannedItems);
    actions.appendChild(add);
  }
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn btn-ghost btn-small';
  dismiss.textContent = total ? 'Discard' : 'Close';
  dismiss.addEventListener('click', () => { box.hidden = true; });
  actions.appendChild(dismiss);
  box.appendChild(actions);

  const warning = document.createElement('p');
  warning.className = 'hint';
  warning.textContent = 'Check each item against the document. AI can misread handwriting.';
  box.appendChild(warning);
}

/** Adds the ticked suggestions to the fields, skipping duplicates. */
function addScannedItems() {
  const ticked = [...$('scan-result').querySelectorAll('input:checked')];
  ticked.forEach((input) => {
    const field = $('f-' + input.dataset.target);
    const existing = field.value.split(',').map((s) => s.trim()).filter(Boolean);
    const already = existing.some((e) => e.toLowerCase() === input.value.toLowerCase());
    if (!already) existing.push(input.value);
    field.value = existing.join(', ').slice(0, 200);
  });
  $('scan-result').hidden = true;
  onUserEdit();
}

/* ---------- 9. AI: notes for responders ---------- */

async function writeNotes() {
  const data = readForm();
  const status = $('notes-status');
  if (!data.allergies && !data.conditions && !data.medications) {
    status.textContent = 'Add allergies, conditions or medications first, so the notes have something to go on.';
    return;
  }

  const button = $('notes-ai');
  button.disabled = true;
  status.textContent = 'Writing notes…';

  const prompt = `Write short notes for a paramedic or first-aider who finds this person unconscious or unable to speak.

Person's details:
- Allergies: ${data.allergies || 'none listed'}
- Medical conditions: ${data.conditions || 'none listed'}
- Medications: ${data.medications || 'none listed'}
- Existing notes from the person: ${data.notes || 'none'}

Rules:
- 2 to 4 notes, each under 90 characters, plain language, written as direct instructions or facts.
- Only state what follows directly from the details above, such as which drugs to avoid or which condition to suspect first.
- Do not diagnose, do not give doses, do not invent facts about the person.
- Keep any existing notes the person wrote, unchanged, at the top.

Reply with only JSON: {"notes": ["...", "..."]}`;

  try {
    const result = await AI.askJson(prompt);
    const notes = Array.isArray(result && result.notes) ? result.notes.map(String).filter(Boolean).slice(0, 5) : [];
    if (!notes.length) throw { code: 'invalid_json' };
    $('f-notes').value = notes.join('\n').slice(0, 320);
    status.textContent = 'Notes written. Read them and edit anything that is not right for you.';
    onUserEdit();
  } catch (err) {
    status.textContent = AI.describeError(err);
  } finally {
    button.disabled = false;
  }
}

/* ---------- 10. AI: translate the card ---------- */

async function translateCard() {
  const person = activePerson();
  const data = readForm();
  const status = $('translate-status');
  if (data.cardLang === 'en') {
    status.textContent = 'Choose a language first.';
    return;
  }

  const button = $('translate-btn');
  button.disabled = true;
  status.textContent = `Translating into ${LANGUAGES[data.cardLang]}…`;

  const source = { labels: LABELS_EN, values: translatableParts(data) };
  const prompt = `Translate this emergency medical card into ${LANGUAGES[data.cardLang]}.

Rules:
- Translate every string value. Keep every key and the array lengths exactly the same.
- Keep medicine names as written in English (doctors and pharmacists recognise them), but translate words like "twice daily".
- Use the everyday words a paramedic in that country would understand.
- If a value is an empty string, keep it empty.

Reply with only the translated JSON, in the same shape as this input:
${JSON.stringify(source, null, 2)}`;

  try {
    const result = await AI.askJson(prompt);
    if (!result || typeof result.labels !== 'object' || typeof result.values !== 'object') throw { code: 'invalid_json' };

    // Keep only known keys with string values, so a bad reply cannot break the page
    const labels = {};
    Object.keys(LABELS_EN).forEach((k) => {
      if (typeof result.labels[k] === 'string' && result.labels[k]) labels[k] = result.labels[k].slice(0, 60);
    });
    const values = {};
    ['allergies', 'conditions', 'medications'].forEach((k) => {
      if (typeof result.values[k] === 'string') values[k] = result.values[k].slice(0, 300);
    });
    ['notes', 'relations'].forEach((k) => {
      if (Array.isArray(result.values[k])) values[k] = result.values[k].map(String);
    });

    person.translation = { key: translationKey(data), labels, values };
    status.textContent = `Card translated into ${LANGUAGES[data.cardLang]}. The QR code stays in English.`;
    refresh();
    scheduleSave();
  } catch (err) {
    status.textContent = AI.describeError(err);
  } finally {
    button.disabled = false;
  }
}

/** Keeps the hint under the language menu in sync with the card. */
function updateTranslateStatus(view) {
  const status = $('translate-status');
  const button = $('translate-btn');
  button.disabled = view.data.cardLang === 'en';
  if (view.translationState === 'needed') {
    status.textContent = `Press Translate to show the card in ${LANGUAGES[view.data.cardLang]}. Until then it stays in English.`;
  } else if (view.translationState === 'none') {
    status.textContent = '';
  }
}

/** Shows which AI mode is active and whether the key box is needed. */
function updateAiUi() {
  const mode = AI.mode();
  const badge = $('ai-mode');
  const explain = $('ai-explain');
  badge.textContent = { claude: 'On', free: 'On, free', key: 'On', off: 'Off' }[mode];
  badge.dataset.mode = mode;

  if (mode === 'claude') {
    explain.textContent = 'AI features use your Claude account while this page is open in Claude. Nothing else to set up.';
    $('key-box').hidden = true;
  } else if (mode === 'free') {
    explain.textContent = 'AI features run on the free tier of Google Gemini, so they cost nothing. There is a daily limit, and Google may use what you send (including photos) to improve its products, so leave out anything you want to keep private.';
    $('key-box').hidden = true;
  } else {
    explain.textContent = mode === 'key'
      ? `AI features use your API key with the ${AI.model} model.`
      : 'AI is not set up on this site yet. The site owner can turn on free AI with a Gemini key (see the README), or you can add your own Anthropic API key here.';
    $('key-box').hidden = false;
    $('api-key').value = AI.getKey() ? '••••••••••••' : '';
  }

  // Hide the photo scanner if this view cannot send images
  const scanOk = mode === 'off' || AI.supportsImages();
  $('scan-label').classList.toggle('is-disabled', !scanOk);
}

/** If AI is off, opens the settings and says why, instead of failing. */
function requireAi(statusEl) {
  if (AI.mode() !== 'off') return true;
  statusEl.hidden = false;
  statusEl.textContent = AI.describeError({ code: 'off' });
  $('ai-settings').open = true;
  return false;
}

/* ---------- 11. Print, download, backup ---------- */

// Inside an embedded preview (an iframe) the browser may block printing
// and downloads, so we explain instead of failing silently.
let isEmbedded;
try { isEmbedded = window.self !== window.top; } catch (err) { isEmbedded = true; }

// Inside Claude, files are saved through the "downloads" capability
let claudeDownloads = null;
if (window.claude && typeof window.claude.use === 'function') {
  window.claude.use('downloads').then((d) => { claudeDownloads = d; }).catch(() => {});
}

/** Saves a Blob as a file, inside Claude or on a normal website. */
async function saveFile(blob, fileName) {
  if (claudeDownloads) {
    try {
      await claudeDownloads.save({ filename: fileName, data: blob });
      return true;
    } catch (err) {
      return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return !isEmbedded;
}

function slug(text) {
  return (text || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';
}

function printCard() {
  if (isEmbedded) {
    const note = $('print-note');
    note.textContent = 'Printing is turned off in this embedded preview. Open the site on its own page (for example on Netlify) and press Print card, or use Ctrl+P / Cmd+P there.';
    note.hidden = false;
    return;
  }
  window.print();
}

function downloadWallpaper() {
  const person = activePerson();
  const [w, h] = WALLPAPER_SIZES[$('wp-size').value];
  renderWallpaper(wallpaperCanvas, buildView(person), makeQr(buildQrText(person.data)), w, h);

  const dataUrl = wallpaperCanvas.toDataURL('image/png');
  wallpaperCanvas.toBlob((blob) => {
    if (blob) saveFile(blob, `ice-wallpaper-${slug(person.data.name)}.png`);
  }, 'image/png');

  // Always show the image too, so it can be saved by long-press
  $('save-img').src = dataUrl;
  $('save-modal').hidden = false;
  $('close-modal').focus();
}

function closeModal() {
  $('save-modal').hidden = true;
  $('download-btn').focus();
}

async function exportBackup() {
  const backup = { app: 'ice-card-maker', version: 2, exported: new Date().toISOString(), people: store.people };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const ok = await saveFile(blob, 'ice-card-backup.json');
  $('backup-status').textContent = ok
    ? `Backup of ${store.people.length} ${store.people.length === 1 ? 'person' : 'people'} downloaded.`
    : 'The download was blocked here. Try again from the site on its own page.';
}

function importBackup(file) {
  const status = $('backup-status');
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      if (!Array.isArray(backup.people) || !backup.people.length) throw new Error('no people');
      const people = backup.people.slice(0, MAX_PEOPLE).map((p) => ({
        id: newId(),
        data: normalizeData(p.data),
        translation: null, // translations are re-made on request
      }));
      store = { activeId: people[0].id, isExample: false, people };
      $('example-banner').hidden = true;
      switchPerson(people[0].id);
      status.textContent = `Restored ${people.length} ${people.length === 1 ? 'person' : 'people'}.`;
    } catch (err) {
      status.textContent = 'That file is not an ICE Card Maker backup.';
    }
  };
  reader.readAsText(file);
}

/* ---------- 12. Events and startup ---------- */

let wallpaperTimer;

/** Redraws every preview from the active person's data. */
function refresh() {
  const person = activePerson();
  const view = buildView(person);
  const qr = makeQr(buildQrText(person.data));
  renderCard(view, qr);
  updateTranslateStatus(view);

  // The wallpaper is a big image, so wait until typing pauses
  clearTimeout(wallpaperTimer);
  wallpaperTimer = setTimeout(() => {
    const [w, h] = WALLPAPER_SIZES[$('wp-size').value];
    renderWallpaper(wallpaperCanvas, view, qr, w, h);
  }, 200);
}

/** Runs after the user changes anything in the form. */
function onUserEdit() {
  leaveExample();
  readForm();
  renderTabs();
  refresh();
  scheduleSave();
}

function startBlank() {
  const person = newPerson(emptyData());
  store = { activeId: person.id, isExample: false, people: [person] };
  $('example-banner').hidden = true;
  switchPerson(person.id);
  setStatus('Saved on this device');
  $('f-name').focus();
}

function loadExample() {
  leaveExample();
  const person = newPerson(exampleData());
  if (store.people.length >= MAX_PEOPLE) store.people.pop();
  store.people.push(person);
  switchPerson(person.id);
}

// Any typing in the form updates the card and saves
$('info-form').addEventListener('input', onUserEdit);
$('card-lang').addEventListener('change', () => {
  leaveExample();
  activePerson().data.cardLang = $('card-lang').value;
  refresh();
  scheduleSave();
});

$('add-contact').addEventListener('click', () => {
  const data = readForm();
  data.contacts.push({ name: '', relation: '', phone: '' });
  renderContactRows(data.contacts);
  contactsBox.querySelector('.contact:last-child input').focus();
  onUserEdit();
});

// One listener handles every Remove button (event delegation)
contactsBox.addEventListener('click', (event) => {
  const button = event.target.closest('.remove-contact');
  if (!button) return;
  const data = readForm();
  data.contacts.splice(Number(button.dataset.index), 1);
  renderContactRows(data.contacts);
  onUserEdit();
});

// Front / Back switch for the card preview
document.querySelectorAll('.seg').forEach((button) => {
  button.addEventListener('click', () => {
    $('card-frame').dataset.side = button.dataset.side;
    document.querySelectorAll('.seg').forEach((b) => {
      const on = b === button;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
});

// AI buttons
$('scan-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) scanPrescription(file);
});
$('scan-label').addEventListener('click', (e) => {
  const box = $('scan-result');
  if (!requireAi(box)) {
    e.preventDefault();
  } else if (!AI.supportsImages()) {
    e.preventDefault();
    box.hidden = false;
    box.textContent = AI.describeError({ code: 'images_unavailable' });
  }
});
$('notes-ai').addEventListener('click', () => {
  if (requireAi($('notes-status'))) writeNotes();
});
$('translate-btn').addEventListener('click', () => {
  if (requireAi($('translate-status'))) translateCard();
});
$('save-key').addEventListener('click', () => {
  const key = $('api-key').value.trim();
  if (key && !key.startsWith('•')) AI.setKey(key);
});
$('remove-key').addEventListener('click', () => AI.setKey(''));
AI.onChange(updateAiUi);

// Other buttons
$('start-blank').addEventListener('click', startBlank);
$('load-example').addEventListener('click', loadExample);
$('delete-profile').addEventListener('click', deletePerson);
$('print-btn').addEventListener('click', printCard);
$('download-btn').addEventListener('click', downloadWallpaper);
$('export-btn').addEventListener('click', exportBackup);
$('import-input').addEventListener('change', (e) => {
  if (e.target.files[0]) importBackup(e.target.files[0]);
  e.target.value = '';
});
$('wp-size').addEventListener('change', refresh);
$('close-modal').addEventListener('click', closeModal);
$('save-modal').addEventListener('click', (e) => { if (e.target.id === 'save-modal') closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('save-modal').hidden) closeModal();
});

// Startup: saved people if there are any, otherwise the example
buildSelects();
store = loadStore() || exampleStore();
if (!store.people.some((p) => p.id === store.activeId)) store.activeId = store.people[0].id;
$('example-banner').hidden = !store.isExample;
setStatus(store.isExample ? 'Example only, not saved' : 'Saved on this device');
fillForm(activePerson().data);
renderTabs();
updateAiUi();
refresh();

// Redraw once the web fonts arrive, so the canvas uses them
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(refresh);
}
