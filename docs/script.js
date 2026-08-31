"use strict";

if (window.lucide) {
  lucide.createIcons();
}

function hideLoader() {
  const loader = document.getElementById("loading");
  if (loader && !loader.classList.contains("hidden")) {
    loader.classList.add("hidden");
    document.body.classList.add("ready");
  }
}

setTimeout(hideLoader, 400);

/* Page Router (Home / Music) */
const VALID_PAGES = ["home", "music"];

function currentPageFromHash() {
  const raw = (location.hash || "").replace("#", "").trim();
  return VALID_PAGES.includes(raw) ? raw : "home";
}

function showPage(name, opts) {
  const options = opts || {};
  const target = VALID_PAGES.includes(name) ? name : "home";

  document.querySelectorAll(".page").forEach((sec) => {
    sec.classList.toggle("active", sec.dataset.page === target);
  });

  document.querySelectorAll("[data-page-link]").forEach((el) => {
    if (!el.classList.contains("nav-link")) return;
    el.classList.toggle("active", el.dataset.pageLink === target);
  });

  if (!options.skipScroll) {
    window.scrollTo({ top: 0, behavior: options.instant ? "auto" : "smooth" });
  }
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-page-link]");
  if (!link) return;
  const target = link.dataset.pageLink;
  if (!VALID_PAGES.includes(target)) return;
  e.preventDefault();
  if (location.hash !== "#" + target) {
    history.pushState(null, "", "#" + target);
  }
  showPage(target);
});

window.addEventListener("hashchange", () => showPage(currentPageFromHash()));
showPage(currentPageFromHash(), { skipScroll: true });

/* Lanyard Discord Integration */
const DISCORD_USER_ID = "978013818640822272";

const PRESENCE_COLORS = {
  online: "#3ba55d",
  dnd: "#ed4245",
  idle: "#faa61a",
  offline: "#747f8d",
};

const PRESENCE_TEXT = {
  online: "Online",
  dnd: "Do Not Disturb",
  idle: "Idle",
  offline: "Offline",
};

function applyPresence(d) {
  const dot = document.getElementById("presence-dot");
  if (!dot) return;

  const status = d.discord_status in PRESENCE_COLORS ? d.discord_status : "offline";

  dot.dataset.status = status;
  dot.style.background = PRESENCE_COLORS[status];
  dot.dataset.tip = PRESENCE_TEXT[status];

  const text = document.getElementById("presence-text");
  if (text) text.textContent = PRESENCE_TEXT[status];

  const user = d.discord_user;
  const avatar = document.querySelector(".avatar");
  if (user && user.avatar && avatar) {
    avatar.src = "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".png?size=128";
  }

  const decor = document.querySelector(".avatar-decor");
  if (user && user.avatar_decoration_data && user.avatar_decoration_data.asset && decor) {
    decor.src = "https://cdn.discordapp.com/avatar-decoration-presets/" + user.avatar_decoration_data.asset + ".png";
  }

  const desc = document.getElementById("kv-desc");
  if (desc && d.kv && d.kv.desc) {
    desc.textContent = d.kv.desc;
  }

  renderActivities(d);
}

function renderActivities(d) {
  const grid = document.getElementById("activity-grid");
  if (!grid) return;
  const activities = d.activities || [];
  grid.innerHTML = "";
  if (!activities.length) {
    grid.innerHTML = '<div class="activity-card"><span class="activity-art"><i class="fa-solid fa-moon"></i></span><div class="activity-body"><div class="activity-name">Nothing</div><div class="activity-details">No current activity</div></div></div>';
    return;
  }
  activities.forEach((act) => {
    const card = document.createElement("div");
    card.className = "activity-card";
    const art = document.createElement("span");
    art.className = "activity-art";
    
    let imgSrc = "";
    if (act.assets && act.assets.large_image) {
      const li = act.assets.large_image;
      if (li.startsWith("spotify:")) {
        imgSrc = d.spotify ? d.spotify.album_art_url : "";
      } else if (li.startsWith("mp:")) {
        imgSrc = "https://cdn.discordapp.com/app-assets/" + act.application_id + "/" + li.replace("mp:", "") + ".png";
      } else {
        imgSrc = "https://cdn.discordapp.com/app-assets/" + act.application_id + "/" + li + ".png";
      }
    }
    if (imgSrc) {
      const img = document.createElement("img");
      img.src = imgSrc;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.remove(); art.innerHTML = '<i class="fa-solid fa-gamepad"></i>'; };
      art.appendChild(img);
    } else {
      const typeIcon = act.type === 2 ? "fa-spotify" : act.type === 0 ? "fa-gamepad" : "fa-star";
      art.innerHTML = '<i class="fa-brands ' + typeIcon + '"></i>';
      if (typeIcon === "fa-gamepad") art.innerHTML = '<i class="fa-solid fa-gamepad"></i>';
    }
    
    const body = document.createElement("div");
    body.className = "activity-body";
    const name = document.createElement("div");
    name.className = "activity-name";
    name.textContent = act.name || "Unknown";
    const details = document.createElement("div");
    details.className = "activity-details";
    details.textContent = act.details || act.state || "";
    const state = document.createElement("div");
    state.className = "activity-state";
    state.textContent = act.state && act.details ? act.state : "";
    if (!act.details && act.state) { details.textContent = act.state; state.textContent = ""; }
    
    body.appendChild(name);
    if (details.textContent) body.appendChild(details);
    if (state.textContent) body.appendChild(state);
    
    const time = document.createElement("span");
    time.className = "activity-time";
    if (act.type === 0) time.textContent = "Playing";
    else if (act.type === 2) time.textContent = "Listening";
    else time.textContent = act.type === 3 ? "Watching" : "";
    
    card.appendChild(art);
    card.appendChild(body);
    if (time.textContent) card.appendChild(time);
    grid.appendChild(card);
  });
}

const localTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Etc/GMT-2",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

function updateLocalTime() {
  const el = document.getElementById("local-time-text");
  if (el) el.textContent = localTimeFormat.format(new Date());
}

updateLocalTime();
setInterval(updateLocalTime, 1000);

function setOffline() {
  applyPresence({ discord_status: "offline", activities: [] });
}

async function fetchPresence() {
  try {
    const res = await fetch("https://api.lanyard.rest/v1/users/" + DISCORD_USER_ID);
    if (!res.ok) throw new Error("lanyard request failed");
    const json = await res.json();
    if (json.success && json.data) applyPresence(json.data);
  } catch (err) {
    console.error(err);
    setOffline();
  }
}

fetchPresence();

let ws = null;
let heartbeatTimer = null;
let reconnectTimer = null;

function openSocket() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;

  ws = new WebSocket("wss://api.lanyard.rest/socket");

  ws.onopen = () => {
    ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: DISCORD_USER_ID } }));
  };

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (msg.op === 1 && msg.d && msg.d.heartbeat_interval) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify({ op: 3, d: null }));
      }, msg.d.heartbeat_interval);
    }

    if (msg.op === 0 && msg.d) {
      if (msg.t === "INIT_STATE") applyPresence(msg.d[DISCORD_USER_ID] || msg.d);
      else if (msg.t === "PRESENCE_UPDATE") applyPresence(msg.d);
    }
  };

  ws.onclose = () => {
    ws = null;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(openSocket, 5000);
  };

  ws.onerror = () => { try { ws.close(); } catch {} };
}

openSocket();

/* Web Audio API Sound Feedback */
let audioCtx = null;
document.addEventListener("click", () => {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1046.5, t);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  } catch (err) { console.error(err); }
});

/* Last.fm Integration */
const LASTFM_USER = "Ark9999";
const LFMCache = (() => {
  const key = (params) => `lfm:${params}`;
  const get = (params) => {
    try {
      const s = sessionStorage.getItem(key(params));
      if (s) {
        const { t, d } = JSON.parse(s);
        if (Date.now() - t < 300000) return d;
      }
    } catch {}
    return null;
  };
  const set = (params, data) => {
    try { sessionStorage.setItem(key(params), JSON.stringify({ t: Date.now(), d: data })); } catch {}
  };
  return { get, set };
})();

function lfmGet(params) {
  const url = "/lastfm?" + params;
  return fetch(url)
    .then((r) => {
      if (!r.ok) return r.json().then((j) => { throw new Error(j && j.error ? j.error : "last.fm request failed"); });
      return r.json();
    })
    .catch(async (err) => {
      if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:") throw err;
      try {
        const directUrl = "https://ws.audioscrobbler.com/2.0/?format=json&user=" + LASTFM_USER + "&api_key=fa9944254236dbe1caeb662e41d28196&" + params;
        const r2 = await fetch(directUrl);
        if (!r2.ok) throw err;
        return await r2.json();
      } catch (_) { throw err; }
    });
}

function normalizeTracks(tracks) {
  if (!tracks) return [];
  return Array.isArray(tracks) ? tracks : [tracks];
}

function lfmImage(track, size) {
  const imgs = (track && track.image) || [];
  for (let i = 0; i < imgs.length; i++) {
    if (imgs[i].size === size && imgs[i]["#text"]) return imgs[i]["#text"];
  }
  return "";
}

function lfmTimeAgo(uts) {
  const secs = Math.floor(Date.now() / 1000) - uts;
  if (secs < 60) return "just now";
  const m = Math.floor(secs / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

const RANK_COLORS = ["#e6a23c", "#67c23a", "#409eff", "#e57373", "#ba68c8", "#4db6ac"];

function rankColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return RANK_COLORS[hash % RANK_COLORS.length];
}

function renderTopArtists(res) {
  const list = document.getElementById("lfm-top-artists");
  if (!list) return;
  const artists = (res && res.topartists && res.topartists.artist) || [];

  if (!artists.length) {
    list.innerHTML = '<p class="media-note">No listening data for this period yet.</p>';
    return;
  }

  list.innerHTML = "";
  artists.slice(0, 6).forEach((artist, i) => {
    const plays = parseInt(artist.playcount, 10) || 0;
    const row = document.createElement("a");
    row.className = "lfm-rank-row";
    row.href = artist.url || "#";
    row.target = "_blank";
    row.rel = "noopener noreferrer";

    const num = document.createElement("span");
    num.className = "lfm-rank-num";
    num.textContent = "#" + (i + 1);

    const avatar = document.createElement("span");
    avatar.className = "lfm-rank-avatar";
    avatar.style.background = rankColor(artist.name || "?");
    avatar.textContent = (artist.name || "?").charAt(0).toUpperCase();

    const info = document.createElement("div");
    info.className = "lfm-rank-info";
    const name = document.createElement("span");
    name.className = "lfm-rank-name";
    name.textContent = artist.name || "Unknown artist";
    const playsEl = document.createElement("span");
    playsEl.className = "lfm-rank-plays";
    playsEl.textContent = plays + (plays === 1 ? " play" : " plays");
    
    info.appendChild(name);
    info.appendChild(playsEl);
    row.appendChild(num);
    row.appendChild(avatar);
    row.appendChild(info);
    list.appendChild(row);
  });
}

function renderTopAlbums(res) {
  const grid = document.getElementById("lfm-top-albums");
  if (!grid) return;
  const albums = (res && res.topalbums && res.topalbums.album) || [];

  if (!albums.length) {
    grid.innerHTML = '<p class="media-note">No listening data for this period yet.</p>';
    return;
  }

  grid.innerHTML = "";
  albums.slice(0, 6).forEach((album) => {
    const row = document.createElement("a");
    row.className = "lfm-row";
    row.href = album.url || "#";
    row.target = "_blank";
    row.rel = "noopener noreferrer";

    const art = document.createElement("img");
    art.className = "lfm-art";
    art.alt = "";
    art.loading = "lazy";
    const artSrc = lfmImage(album, "medium");
    if (artSrc) art.src = artSrc;

    const info = document.createElement("div");
    info.className = "lfm-info";
    const name = document.createElement("span");
    name.className = "lfm-track";
    name.textContent = album.name || "Untitled";
    const artist = document.createElement("span");
    artist.className = "lfm-artist";
    artist.textContent = album.artist ? album.artist.name : "";
    info.appendChild(name);
    info.appendChild(artist);

    const plays = document.createElement("span");
    plays.className = "lfm-time";
    const playcount = parseInt(album.playcount, 10) || 0;
    plays.textContent = playcount + (playcount === 1 ? " play" : " plays");

    row.appendChild(art);
    row.appendChild(info);
    row.appendChild(plays);
    grid.appendChild(row);
  });
}

function startOfMonthUts() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
}

function startOfYearUts() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getUTCFullYear(), 0, 1) / 1000);
}

async function fetchLastFm() {
  const box = document.getElementById("lfm-box");
  const gridEl = document.getElementById("lfm-tracks");
  if (!box || !gridEl) return;

  const safeGet = async (params) => {
    const cached = LFMCache.get(params);
    if (cached) return cached;
    try {
      const res = await lfmGet(params);
      await new Promise((r) => setTimeout(r, 150));
      LFMCache.set(params, res);
      return res;
    } catch (e) {
      return null;
    }
  };

  try {
    const tracksRes = await safeGet("method=user.getrecenttracks&limit=6");
    const infoRes = await safeGet("method=user.getinfo");
    const monthRes = await safeGet("method=user.getrecenttracks&from=" + startOfMonthUts() + "&limit=1");
    const yearRes = await safeGet("method=user.getrecenttracks&from=" + startOfYearUts() + "&limit=1");
    const artistsCountRes = await safeGet("method=library.getartists&limit=1");
    const topArtistsRes = await safeGet("method=user.gettopartists&period=7day&limit=6");
    const topAlbumsRes = await safeGet("method=user.gettopalbums&period=7day&limit=6");

    let tracks = tracksRes && tracksRes.recenttracks && tracksRes.recenttracks.track;
    tracks = normalizeTracks(tracks);
    const user = infoRes && infoRes.user;

    const setNum = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = n != null ? Number(n).toLocaleString() : "-";
    };

    setNum("lfm-total", user && user.playcount);
    setNum("lfm-artists", artistsCountRes?.artists?.["@attr"]?.total);
    setNum("lfm-month", monthRes?.recenttracks?.["@attr"]?.total);
    setNum("lfm-year", yearRes?.recenttracks?.["@attr"]?.total);

    renderTopArtists(topArtistsRes);
    renderTopAlbums(topAlbumsRes);

    const exploreMusicSub = document.getElementById("explore-music-sub");
    if (exploreMusicSub && user && user.playcount) {
      exploreMusicSub.textContent = Number(user.playcount).toLocaleString() + " scrobbles";
    }

    const grid = document.getElementById("lfm-tracks");
    if (!grid) return;

    if (!tracks.length) {
      grid.innerHTML = '<p class="media-note">No recent tracks.</p>';
    } else {
      const first = tracks[0];
      const nowPlaying = first["@attr"] && first["@attr"].nowplaying === "true";

      const player = box.querySelector(".lfm-player");
      if (player) {
        player.href = first.url || "#";
        const art = player.querySelector(".lfm-player-art");
        const statusEl = player.querySelector(".lfm-player-status");
        const trackEl = player.querySelector(".lfm-player-track");
        const artistEl = player.querySelector(".lfm-player-artist");
        const timeEl = player.querySelector(".lfm-player-time");

        const artSrc = lfmImage(first, "medium");
        if (artSrc) art.src = artSrc;

        trackEl.textContent = first.name || "Untitled";
        artistEl.textContent = first.artist ? first.artist["#text"] : "";

        if (nowPlaying) {
          statusEl.textContent = "Now playing";
          timeEl.textContent = "";
        } else {
          statusEl.textContent = "Last scrobble";
          timeEl.textContent = first.date ? lfmTimeAgo(parseInt(first.date.uts, 10)) : "";
        }
      }

      grid.innerHTML = "";
      (nowPlaying ? tracks.slice(1) : tracks).slice(0, 5).forEach((track) => {
        const row = document.createElement("a");
        row.className = "lfm-row";
        row.href = track.url || "#";
        row.target = "_blank";
        row.rel = "noopener noreferrer";

        const art = document.createElement("img");
        art.className = "lfm-art";
        art.alt = "";
        art.loading = "lazy";
        const artSrc = lfmImage(track, "small");
        if (artSrc) art.src = artSrc;

        const info = document.createElement("div");
        info.className = "lfm-info";
        const name = document.createElement("span");
        name.className = "lfm-track";
        name.textContent = track.name || "Untitled";
        const artist = document.createElement("span");
        artist.className = "lfm-artist";
        artist.textContent = track.artist ? track.artist["#text"] : "";
        info.appendChild(name);
        info.appendChild(artist);

        const time = document.createElement("span");
        time.className = "lfm-time";
        time.textContent = track.date ? lfmTimeAgo(parseInt(track.date.uts, 10)) : "";

        row.appendChild(art);
        row.appendChild(info);
        row.appendChild(time);
        grid.appendChild(row);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

fetchLastFm();
setInterval(fetchLastFm, 60000);
