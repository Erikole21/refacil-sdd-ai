(function () {
  const els = {
    connDot: document.getElementById('conn-dot'),
    connLabel: document.getElementById('conn-label'),
    port: document.getElementById('port'),
    roomsList: document.getElementById('rooms-list'),
    roomsCount: document.getElementById('rooms-count'),
    msgCount: document.getElementById('msg-count'),
    pairCount: document.getElementById('pair-count'),
    pendingCount: document.getElementById('pending-count'),
    feedTitle: document.getElementById('feed-title'),
    feedBody: document.getElementById('feed-body'),
    feedEmpty: document.getElementById('feed-empty'),
    clearBtn: document.getElementById('clear-btn'),
    filters: {
      ask: document.getElementById('filter-ask'),
      reply: document.getElementById('filter-reply'),
      say: document.getElementById('filter-say'),
      system: document.getElementById('filter-system'),
    },
  };

  const state = {
    ws: null,
    port: location.port || '7821',
    messages: [],
    messageIds: new Set(),
    rooms: {},
    knownRooms: new Set(),
    selectedRoom: '*',
    answeredByResponder: new Set(),
    msgCount: 0,
  };

  function cssEsc(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function isAskAnswered(m) {
    if (m.kind !== 'ask' || !m.correlationId) return false;
    if (m.to) return state.answeredByResponder.has(`${m.correlationId}\t${m.to}`);
    return state.messages.some(
      (r) => r.kind === 'reply' && r.correlationId === m.correlationId,
    );
  }

  els.port.textContent = 'puerto ' + state.port;

  function setConn(kind, label) {
    els.connDot.className = 'dot ' + (kind || '');
    els.connLabel.textContent = label;
  }

  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('es', { hour12: false });
    } catch (_) {
      return ts || '';
    }
  }

  function kindLabel(m) {
    if (m.kind === 'ask') return 'ask';
    if (m.kind === 'reply') return 'reply';
    if (m.kind === 'broadcast') return 'say';
    return m.kind || 'msg';
  }

  function filterAllows(m) {
    if (m.kind === 'ask') return els.filters.ask.checked;
    if (m.kind === 'reply') return els.filters.reply.checked;
    if (m.kind === 'broadcast') return els.filters.say.checked;
    if (m.kind === 'system') return els.filters.system.checked;
    return true;
  }

  function roomMatches(m) {
    return state.selectedRoom === '*' || m.room === state.selectedRoom;
  }

  function renderMsg(m) {
    if (!roomMatches(m)) return null;
    if (!filterAllows(m)) return null;
    const div = document.createElement('div');
    const classes = ['msg', m.kind || 'msg'];
    // mention: lo marcamos si `to` coincide con alguien conocido de la sala
    // (simple: si hay `to` lo consideramos mention visual).
    if (m.to) classes.push('mention');
    div.className = classes.join(' ');
    div.dataset.corr = m.correlationId || '';
    div.dataset.kind = m.kind || '';
    if (m.kind === 'ask' && m.correlationId && m.to) {
      div.dataset.askTo = m.to;
    }

    const head = document.createElement('div');
    head.className = 'msg-head';
    const left = document.createElement('div');
    left.innerHTML =
      `<span class="msg-from">${escape(m.from || '?')}</span>` +
      (m.to ? ` <span class="msg-to">${escape(m.to)}</span>` : '') +
      ` <span class="msg-kind ${m.kind || ''}">${kindLabel(m)}</span>`;
    const right = document.createElement('div');
    right.innerHTML =
      `<span class="msg-room">${escape(m.room || '')}</span> ` +
      `<span class="msg-ts">${formatTime(m.ts)}</span>`;
    head.appendChild(left);
    head.appendChild(right);

    const body = document.createElement('div');
    body.className = 'msg-text';
    body.textContent = m.text || '';

    div.appendChild(head);
    div.appendChild(body);

    if (m.correlationId) {
      const corr = document.createElement('div');
      const isAnswered = m.kind === 'ask' ? isAskAnswered(m) : false;
      corr.className = 'msg-corr ' + (m.kind === 'ask' ? (isAnswered ? 'answered' : 'pending') : '');
      corr.textContent = m.correlationId.slice(0, 8);
      div.appendChild(corr);
    }
    return div;
  }

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function removeEmptyPlaceholder() {
    const emp = els.feedBody.querySelector('.empty');
    if (emp) emp.remove();
  }

  function isNearBottom(el, slack = 150) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < slack;
  }

  function scrollToBottom(el) {
    el.scrollTop = el.scrollHeight;
  }

  function ingestMsg(m) {
    if (!m || !m.id) return false;
    if (state.messageIds.has(m.id)) return false;
    state.messageIds.add(m.id);
    state.messages.push(m);
    state.msgCount++;
    if (m.kind === 'reply' && m.correlationId && m.from) {
      state.answeredByResponder.add(`${m.correlationId}\t${m.from}`);
    }
    return true;
  }

  function appendMsg(m) {
    if (!ingestMsg(m)) return; // dedup
    if (m.kind === 'reply' && m.correlationId && m.from) {
      const sel = `.msg.ask[data-corr="${cssEsc(m.correlationId)}"][data-ask-to="${cssEsc(m.from)}"] .msg-corr`;
      const prev = els.feedBody.querySelector(sel);
      if (prev) {
        prev.className = 'msg-corr answered';
        prev.textContent = m.correlationId.slice(0, 8);
      }
    }
    const node = renderMsg(m);
    if (node) {
      const pinnedBottom = isNearBottom(els.feedBody);
      removeEmptyPlaceholder();
      els.feedBody.appendChild(node);
      if (pinnedBottom) scrollToBottom(els.feedBody);
    }
    updateStats();
  }

  function ingestHistory(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return;
    let added = 0;
    for (const m of messages) {
      if (ingestMsg(m)) added++;
    }
    if (!added) return;
    // Re-ordenar por ts (los históricos pueden llegar mezclados con el live).
    state.messages.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
    rerenderFeed();
    updateStats();
  }

  function updateStats() {
    els.msgCount.textContent = state.msgCount;
    els.pairCount.textContent = state.messages.filter((x) => x.kind === 'reply').length;
    let pending = 0;
    for (const m of state.messages) {
      if (m.kind === 'ask' && !isAskAnswered(m)) pending++;
    }
    els.pendingCount.textContent = pending;
  }

  function renderRooms() {
    const names = Object.keys(state.rooms);
    els.roomsCount.textContent = names.length;
    els.roomsList.innerHTML = '';

    const liAll = document.createElement('li');
    liAll.className = 'all' + (state.selectedRoom === '*' ? ' active' : '');
    liAll.innerHTML = `<div class="room-name">★ todas las salas</div><div class="members">${state.msgCount} mensajes totales</div>`;
    liAll.addEventListener('click', () => selectRoom('*'));
    els.roomsList.appendChild(liAll);

    for (const name of names.sort()) {
      const members = state.rooms[name] || [];
      const li = document.createElement('li');
      li.className = state.selectedRoom === name ? 'active' : '';
      li.innerHTML = `<div class="room-name">${escape(name)}</div>` +
        `<div class="members">${members.map((m) => `<span class="member">${escape(m)}</span>`).join('')}</div>`;
      li.addEventListener('click', () => selectRoom(name));
      els.roomsList.appendChild(li);
    }
  }

  function selectRoom(room) {
    state.selectedRoom = room;
    els.feedTitle.textContent = room === '*' ? 'Todas las salas' : `Sala: ${room}`;
    renderRooms();
    rerenderFeed();
  }

  function rerenderFeed() {
    els.feedBody.innerHTML = '';
    let any = false;
    for (const m of state.messages) {
      const node = renderMsg(m);
      if (node) { els.feedBody.appendChild(node); any = true; }
    }
    if (!any) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = state.selectedRoom === '*'
        ? 'Esperando mensajes...'
        : `Sin mensajes en la sala "${state.selectedRoom}".`;
      els.feedBody.appendChild(e);
    }
    // Tras un rerender (cambio de sala o ingest de history) siempre al último.
    scrollToBottom(els.feedBody);
  }

  function wireFilters() {
    Object.values(els.filters).forEach((el) => {
      el.addEventListener('change', rerenderFeed);
    });
    els.clearBtn.addEventListener('click', () => {
      state.messages = [];
      state.messageIds.clear();
      state.answeredByResponder.clear();
      state.msgCount = 0;
      rerenderFeed();
      updateStats();
    });
  }

  async function pollStatus() {
    if (!state.ws || state.ws.readyState !== 1) return;
    state.ws.send(JSON.stringify({ op: 'status' }));
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    setConn('', 'conectando...');
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.addEventListener('open', () => {
      setConn('ok', 'en vivo');
      // Suscribirse a todas las salas
      ws.send(JSON.stringify({ op: 'watch', room: null }));
      ws.send(JSON.stringify({ op: 'status' }));
    });

    ws.addEventListener('message', (ev) => {
      let data;
      try { data = JSON.parse(ev.data); } catch (_) { return; }
      if (data.type === 'msg') {
        appendMsg(data);
      } else if (data.type === 'system' && data.event === 'status') {
        const detail = data.detail || {};
        state.rooms = detail.rooms || {};
        renderRooms();
        // Pedir history de cada sala nueva detectada
        for (const room of Object.keys(state.rooms)) {
          if (!state.knownRooms.has(room)) {
            state.knownRooms.add(room);
            ws.send(JSON.stringify({ op: 'history', room, n: 100 }));
          }
        }
      } else if (data.type === 'history') {
        ingestHistory(data.messages || []);
      }
    });

    ws.addEventListener('close', () => {
      setConn('err', 'desconectado · reintentando...');
      setTimeout(connect, 1500);
    });

    ws.addEventListener('error', () => {
      setConn('err', 'error de conexión');
    });
  }

  wireFilters();
  connect();
  setInterval(pollStatus, 3000);
})();
