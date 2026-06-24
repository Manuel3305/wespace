import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, firebaseAvailable } from "./firebase";
import "./App.css";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

const SPACE_ID = "ManuelNela";
const PULSE_LIMIT_PER_DAY = 5;
const PULSE_COOLDOWN_MINUTES = 30;

const EMPTY_PERSON = {
  hearts: 0,
  mood: "",
  status: "",
  proximity: "",
  sleep: "",
  moment: "",
  battery: "",
  updatedAt: "",
  location: null,
  pulseAt: "",
};

const EMPTY_CHALLENGE_ANSWER = {
  done: false,
  text: "",
};

const partnerOf = {
  Manuel: "Nela",
  Nela: "Manuel",
};

const moodOptions = ["😊 Gut", "😴 Müde", "❤️ Vermisse dich", "😔 Schwerer Tag"];

const activityOptions = [
  "🏠 Zuhause",
  "🚗 Unterwegs",
  "💼 Arbeit",
  "🍽 Essen",
  "🏐 Sport",
  "🎮 Zocken",
];

const proximityOptions = [
  "❤️ Denk an dich",
  "🫂 Brauche Nähe",
  "😔 Vermisse dich",
  "🌙 Gute Nacht",
  "☎️ Kurz reden?",
];

const dailyQuestions = [
  "Was war heute dein schönster Moment?",
  "Was vermisst du heute an mir?",
  "Was würdest du mir erzählen, wenn ich gerade neben dir wäre?",
  "Wofür bist du heute dankbar?",
  "Was war heute schwer?",
  "Was sollen wir machen, wenn wir uns wiedersehen?",
  "Was hat dich heute zum Lächeln gebracht?",
  "Welcher Song passt heute zu dir?",
  "Was geht dir heute im Herzen herum?",
  "Worauf freust du dich morgen?",
  "Welche Situation heute möchtest du behalten?",
  "Was ist heute anders als gestern?",
];

const photoChallenges = [
  "Mach ein Foto von etwas, das dich heute zum Lächeln gebracht hat.",
  "Zeig mir deinen Himmel.",
  "Mach ein Foto von etwas, das dich heute an mich erinnert.",
  "Zeig mir deinen aktuellen Ausblick.",
  "Mach ein Foto von deinem Getränk oder Essen.",
  "Zeig mir etwas Kleines aus deinem Tag.",
  "Mach ein Foto von etwas, das du schön findest.",
  "Zeig mir, wo du gerade kurz zur Ruhe kommst.",
  "Mach ein Foto von etwas, das deine Stimmung beschreibt.",
  "Zeig mir etwas, das ich heute nicht sehen konnte.",
];

try {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
    iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
    shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
  });
} catch {
  // ignore
}

function getLocalDateKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getIndexForDate(dayKey, length) {
  const parts = dayKey.split("-").map(Number);
  return (parts[0] * 10000 + parts[1] * 100 + parts[2]) % length;
}

function getQuestionForDate(dayKey) {
  return dailyQuestions[getIndexForDate(dayKey, dailyQuestions.length)];
}

function getPhotoChallengeForDate(dayKey) {
  return photoChallenges[getIndexForDate(dayKey, photoChallenges.length)];
}

function createDailyQuestion(dayKey) {
  return {
    day: dayKey,
    question: getQuestionForDate(dayKey),
    answers: {
      Manuel: "",
      Nela: "",
    },
  };
}

function createPhotoChallenge(dayKey) {
  return {
    day: dayKey,
    prompt: getPhotoChallengeForDate(dayKey),
    answers: {
      Manuel: { ...EMPTY_CHALLENGE_ANSWER },
      Nela: { ...EMPTY_CHALLENGE_ANSWER },
    },
  };
}

function createDefaultData() {
  const today = getLocalDateKey();

  return {
    currentDay: today,
    dailyQuestion: createDailyQuestion(today),
    photoChallenge: createPhotoChallenge(today),
    timeCapsules: [],
    signals: [],
    Manuel: { ...EMPTY_PERSON },
    Nela: { ...EMPTY_PERSON },
  };
}

function normalizePerson(person = {}) {
  return {
    ...EMPTY_PERSON,
    ...person,
    location: person.location || null,
  };
}

function normalizeChallengeAnswer(answer = {}) {
  return {
    ...EMPTY_CHALLENGE_ANSWER,
    ...answer,
  };
}

function normalizePhotoChallenge(rawChallenge, today) {
  if (!rawChallenge || rawChallenge.day !== today) {
    return createPhotoChallenge(today);
  }

  return {
    day: today,
    prompt: rawChallenge.prompt || getPhotoChallengeForDate(today),
    answers: {
      Manuel: normalizeChallengeAnswer(rawChallenge.answers?.Manuel),
      Nela: normalizeChallengeAnswer(rawChallenge.answers?.Nela),
    },
  };
}

function normalizeData(raw = {}) {
  const today = getLocalDateKey();
  const savedDay = raw.dailyQuestion?.day || raw.currentDay || today;
  const isNewDay = savedDay !== today;

  return {
    ...raw,
    currentDay: today,
    dailyQuestion: isNewDay
      ? createDailyQuestion(today)
      : raw.dailyQuestion || createDailyQuestion(today),
    photoChallenge: normalizePhotoChallenge(raw.photoChallenge, today),
    timeCapsules: raw.timeCapsules || [],
    signals: raw.signals || [],
    Manuel: {
      ...normalizePerson(raw.Manuel),
      ...(isNewDay
        ? {
            hearts: 0,
            mood: "",
            status: "",
            proximity: "",
            sleep: "",
            moment: "",
          }
        : {}),
    },
    Nela: {
      ...normalizePerson(raw.Nela),
      ...(isNewDay
        ? {
            hearts: 0,
            mood: "",
            status: "",
            proximity: "",
            sleep: "",
            moment: "",
          }
        : {}),
    },
  };
}

function minutesSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function statusText(iso) {
  const diff = minutesSince(iso);

  if (diff === null) return "noch nichts geteilt";
  if (diff < 1) return "gerade geändert";
  if (diff === 1) return "vor 1 Min.";
  if (diff < 60) return `vor ${diff} Min.`;

  const hours = Math.floor(diff / 60);
  if (hours === 1) return "vor 1 Std.";
  if (hours < 24) return `vor ${hours} Std.`;

  return "älter";
}

function statusDot(iso) {
  const diff = minutesSince(iso);
  if (diff === null) return "idle";
  if (diff < 60) return "fresh";
  if (diff < 24 * 60) return "old";
  return "idle";
}

function timeText(iso) {
  const diff = minutesSince(iso);

  if (diff === null) return "nicht geteilt";
  if (diff < 1) return "gerade eben";
  if (diff === 1) return "vor 1 Minute";
  if (diff < 60) return `vor ${diff} Minuten`;

  const hours = Math.floor(diff / 60);
  if (hours === 1) return "vor 1 Stunde";
  return `vor ${hours} Stunden`;
}

function clockText(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pulseCooldownLeftMinutes(iso) {
  const diff = minutesSince(iso);
  if (diff === null) return 0;
  return Math.max(0, PULSE_COOLDOWN_MINUTES - diff);
}

function haversineKm(a, b) {
  if (!a || !b) return null;

  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return Math.round(R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))));
}

function moodMessage(name, value) {
  const map = {
    "😊 Gut": `${name} fühlt sich gerade gut`,
    "😴 Müde": `${name} ist gerade müde`,
    "❤️ Vermisse dich": `${name} vermisst dich`,
    "😔 Schwerer Tag": `${name} hatte heute einen schweren Tag`,
  };

  return map[value] || `${name} hat die Stimmung aktualisiert`;
}

function activityMessage(name, value) {
  const map = {
    "🏠 Zuhause": `${name} ist gerade zuhause`,
    "🚗 Unterwegs": `${name} ist gerade unterwegs`,
    "💼 Arbeit": `${name} ist auf Arbeit`,
    "🍽 Essen": `${name} isst gerade`,
    "🏐 Sport": `${name} macht gerade Sport`,
    "🎮 Zocken": `${name} ist gerade am Zocken`,
  };

  return map[value] || `${name} hat den Alltag aktualisiert`;
}

function proximityMessage(name, value) {
  const map = {
    "❤️ Denk an dich": `${name} denkt an dich`,
    "🫂 Brauche Nähe": `${name} braucht gerade Nähe`,
    "😔 Vermisse dich": `${name} vermisst dich`,
    "🌙 Gute Nacht": `${name} geht jetzt schlafen`,
    "☎️ Kurz reden?": `${name} möchte kurz reden`,
  };

  return map[value] || `${name} hat ein Nähe-Signal geteilt`;
}

export default function App() {
  const [tab, setTab] = useState("home");
  const [homeSection, setHomeSection] = useState("near");
  const [user, setUser] = useState(localStorage.getItem("wespace_user") || "");
  const [data, setData] = useState(createDefaultData);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [challengeDraft, setChallengeDraft] = useState("");
  const [challengeDone, setChallengeDone] = useState(false);
  const [capsuleText, setCapsuleText] = useState("");
  const [capsuleDate, setCapsuleDate] = useState(getLocalDateKey());
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [lastRead, setLastRead] = useState(
    Number(localStorage.getItem("wespace_last_read")) || 0
  );
  const [notification, setNotification] = useState("");
  const [showAllSignals, setShowAllSignals] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const chatEndRef = useRef(null);
  const notificationTimer = useRef(null);
  const lastSignalRef = useRef("");

  const partner = partnerOf[user] || "Nela";
  const me = data[user] || EMPTY_PERSON;
  const other = data[partner] || EMPTY_PERSON;
  const todayKey = getLocalDateKey();

  const unread =
    tab === "chat"
      ? 0
      : Math.max(
          0,
          messages.filter((message) => message.name !== user).length - lastRead
        );

  const distanceKm = haversineKm(data.Manuel?.location, data.Nela?.location);
  const questionAnsweredByMe = Boolean(data.dailyQuestion?.answers?.[user]);
  const questionAnsweredByOther = Boolean(data.dailyQuestion?.answers?.[partner]);
  const challengeAnswerMe =
    data.photoChallenge?.answers?.[user] || EMPTY_CHALLENGE_ANSWER;
  const challengeAnswerOther =
    data.photoChallenge?.answers?.[partner] || EMPTY_CHALLENGE_ANSWER;

  const myCooldownLeft = pulseCooldownLeftMinutes(me.pulseAt);
  const myPulsesLeft = Math.max(0, PULSE_LIMIT_PER_DAY - (me.hearts || 0));
  const canSendPulse = myPulsesLeft > 0 && myCooldownLeft <= 0;

  const latestSignals = (data.signals || []).slice(0, showAllSignals ? 30 : 4);
  const hasMoreSignals = (data.signals || []).length > 4;

  useEffect(() => {
    const cached = localStorage.getItem("wespace_status");
    if (cached) {
      try {
        setData(normalizeData(JSON.parse(cached)));
      } catch {
        setData(createDefaultData());
      }
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!firebaseAvailable || !db) return;

    const statusRef = doc(db, "spaces", SPACE_ID, "data", "status");

    return onSnapshot(
      statusRef,
      async (snap) => {
        if (!snap.exists()) {
          const fresh = createDefaultData();
          setData(fresh);
          localStorage.setItem("wespace_status", JSON.stringify(fresh));
          await setDoc(statusRef, fresh, { merge: true });
          return;
        }

        const normalized = normalizeData(snap.data());
        setData(normalized);
        localStorage.setItem("wespace_status", JSON.stringify(normalized));

        if ((snap.data().dailyQuestion?.day || snap.data().currentDay) !== todayKey) {
          await setDoc(statusRef, normalized, { merge: true });
        }
      },
      () => {
        const cached = localStorage.getItem("wespace_status");
        if (cached) {
          try {
            setData(normalizeData(JSON.parse(cached)));
          } catch {
            // ignore
          }
        }
      }
    );
  }, [todayKey]);

  useEffect(() => {
    if (!firebaseAvailable || !db) return;

    const messagesRef = collection(db, "spaces", SPACE_ID, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    return onSnapshot(
      q,
      (snap) => {
        const nextMessages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMessages(nextMessages);
        localStorage.setItem("wespace_messages", JSON.stringify(nextMessages));
      },
      () => {
        const cached = localStorage.getItem("wespace_messages");
        if (cached) {
          try {
            setMessages(JSON.parse(cached));
          } catch {
            // ignore
          }
        }
      }
    );
  }, []);

  useEffect(() => {
    if (tab === "chat") {
      const count = messages.filter((message) => message.name !== user).length;
      setLastRead(count);
      localStorage.setItem("wespace_last_read", String(count));
    }

    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 80);
  }, [messages, tab, user]);

  useEffect(() => {
    setQuestionDraft(data.dailyQuestion?.answers?.[user] || "");
  }, [
    data.dailyQuestion?.day,
    data.dailyQuestion?.answers?.Manuel,
    data.dailyQuestion?.answers?.Nela,
    user,
  ]);

  useEffect(() => {
    const answer = data.photoChallenge?.answers?.[user] || EMPTY_CHALLENGE_ANSWER;
    setChallengeDraft(answer.text || "");
    setChallengeDone(Boolean(answer.done));
  }, [
    data.photoChallenge?.day,
    data.photoChallenge?.answers?.Manuel?.text,
    data.photoChallenge?.answers?.Manuel?.done,
    data.photoChallenge?.answers?.Nela?.text,
    data.photoChallenge?.answers?.Nela?.done,
    user,
  ]);

  useEffect(() => {
    const latestPartnerSignal = (data.signals || [])
      .filter((signal) => signal.from === partner)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

    if (!latestPartnerSignal) return;

    if (!lastSignalRef.current) {
      lastSignalRef.current = latestPartnerSignal.id;
      return;
    }

    if (latestPartnerSignal.id !== lastSignalRef.current) {
      flash(latestPartnerSignal.text);
      showBrowserNotification("WeSpace", latestPartnerSignal.text);
      lastSignalRef.current = latestPartnerSignal.id;
    }
  }, [data.signals, partner]);

  useEffect(() => {
    return () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    };
  }, []);

  function chooseUser(name) {
    localStorage.setItem("wespace_user", name);
    setUser(name);
  }

  function flash(text) {
    setNotification(text);
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = setTimeout(() => setNotification(""), 4000);
  }

  function showBrowserNotification(title, body) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    try {
      new Notification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
      });
    } catch {
      // ignore
    }
  }

  async function requestNotifications() {
    if (typeof Notification === "undefined") {
      flash("Benachrichtigungen werden hier nicht unterstützt");
      setNotificationPermission("unsupported");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      flash("Benachrichtigungen aktiviert");
      showBrowserNotification("WeSpace", "Benachrichtigungen sind aktiviert ❤️");
    } else {
      flash("Benachrichtigungen nicht erlaubt");
    }
  }

  function addSignal(baseData, type, text, meta = {}) {
    const signal = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      from: user,
      to: partner,
      text,
      createdAt: new Date().toISOString(),
      ...meta,
    };

    return {
      ...baseData,
      signals: [signal, ...(baseData.signals || [])].slice(0, 30),
    };
  }

  async function saveStatus(nextData, bannerText = "") {
    const normalized = normalizeData(nextData);
    setData(normalized);
    localStorage.setItem("wespace_status", JSON.stringify(normalized));

    if (bannerText) flash(bannerText);

    if (!firebaseAvailable || !db || !isOnline) return;

    try {
      const statusRef = doc(db, "spaces", SPACE_ID, "data", "status");
      await setDoc(statusRef, normalized, { merge: true });
    } catch {
      // local fallback already saved
    }
  }

  function updateMyData(partial, label = "Status aktualisiert", signalText = "") {
    if (!user) return;

    const nextPerson = {
      ...me,
      ...partial,
      sleep:
        partial.proximity !== undefined
          ? partial.proximity === "🌙 Gute Nacht"
            ? "Schlafend"
            : ""
          : me.sleep || "",
      updatedAt: new Date().toISOString(),
    };

    let nextData = {
      ...data,
      currentDay: todayKey,
      [user]: nextPerson,
    };

    if (signalText) {
      nextData = addSignal(nextData, "status", signalText);
    }

    saveStatus(nextData, label);
  }

  function sendPulse() {
    if (!user) return;

    if ((me.hearts || 0) >= PULSE_LIMIT_PER_DAY) {
      flash("Heute alle Pulse gesendet. Morgen wieder ❤️");
      return;
    }

    if (myCooldownLeft > 0) {
      flash(`Nächster Puls in ${myCooldownLeft} Min.`);
      return;
    }

    const text = `❤️ ${user} vermisst dich gerade`;

    const nextPerson = {
      ...me,
      hearts: (me.hearts || 0) + 1,
      pulseAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextData = addSignal(
      {
        ...data,
        currentDay: todayKey,
        [user]: nextPerson,
      },
      "pulse",
      text
    );

    saveStatus(nextData, `❤️ Puls an ${partner} gesendet`);
  }

  async function sendMessage() {
    const clean = messageText.trim();
    if (!clean || !user) return;

    setMessageText("");

    if (!firebaseAvailable || !db || !isOnline) {
      const localMessage = {
        id: `local-${Date.now()}`,
        name: user,
        text: clean,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, localMessage]);
      return;
    }

    try {
      const messagesRef = collection(db, "spaces", SPACE_ID, "messages");
      await addDoc(messagesRef, {
        name: user,
        text: clean,
        createdAt: serverTimestamp(),
      });
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          name: user,
          text: clean,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }

  function saveDailyAnswer() {
    const clean = questionDraft.trim();
    if (!clean) return;

    const dailyQuestion =
      data.dailyQuestion?.day === todayKey
        ? data.dailyQuestion
        : createDailyQuestion(todayKey);

    const nextData = addSignal(
      {
        ...data,
        currentDay: todayKey,
        dailyQuestion: {
          ...dailyQuestion,
          day: todayKey,
          question: getQuestionForDate(todayKey),
          answers: {
            ...dailyQuestion.answers,
            [user]: clean,
          },
        },
      },
      "question",
      `💭 ${user} hat die Frage des Tages beantwortet`
    );

    saveStatus(nextData, "Antwort gespeichert");
  }

  function saveMoment() {
    const nextData = addSignal(
      {
        ...data,
        currentDay: todayKey,
        [user]: {
          ...me,
          moment: me.moment || "",
          updatedAt: new Date().toISOString(),
        },
      },
      "moment",
      `📸 ${user} hat einen Tagesmoment geteilt`
    );

    saveStatus(nextData, "Moment gespeichert");
  }

  function saveChallengeAnswer() {
    const photoChallenge =
      data.photoChallenge?.day === todayKey
        ? data.photoChallenge
        : createPhotoChallenge(todayKey);

    const nextData = addSignal(
      {
        ...data,
        currentDay: todayKey,
        photoChallenge: {
          ...photoChallenge,
          day: todayKey,
          prompt: getPhotoChallengeForDate(todayKey),
          answers: {
            ...photoChallenge.answers,
            [user]: {
              done: challengeDone,
              text: challengeDraft.trim(),
            },
          },
        },
      },
      "challenge",
      challengeDone
        ? `📷 ${user} hat die heutige Foto-Aufgabe geschafft`
        : `📷 ${user} hat die Foto-Aufgabe aktualisiert`
    );

    saveStatus(nextData, "Foto-Aufgabe gespeichert");
  }

  function saveCapsule() {
    const clean = capsuleText.trim();
    if (!clean) return;

    const capsule = {
      id: `capsule-${Date.now()}`,
      owner: user,
      text: clean,
      targetDate: capsuleDate || todayKey,
      createdAt: new Date().toISOString(),
    };

    const nextData = addSignal(
      {
        ...data,
        currentDay: todayKey,
        timeCapsules: [capsule, ...(data.timeCapsules || [])],
      },
      "capsule",
      `🔒 ${user} hat eine Zeitkapsel versteckt – sichtbar am ${capsule.targetDate}`
    );

    saveStatus(nextData, "Zeitkapsel gespeichert");
    setCapsuleText("");
  }

  function shareLocation() {
    if (!navigator.geolocation) {
      alert("Standort wird auf diesem Gerät nicht unterstützt.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateMyData(
          {
            location: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: Math.round(position.coords.accuracy),
              updatedAt: new Date().toISOString(),
            },
          },
          "Standort geteilt"
        );
      },
      () => alert("Standort konnte nicht ermittelt werden."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  if (!user) {
    return (
      <main className="app">
        <section className="hero">
          <p className="tag">willkommen bei</p>
          <h1>WeSpace</h1>
          <p className="subtitle">Wer benutzt dieses Gerät?</p>
        </section>

        <section className="card choose-card">
          <button onClick={() => chooseUser("Manuel")}>Manuel</button>
          <button onClick={() => chooseUser("Nela")}>Nela</button>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      {notification && <div className="toast">{notification}</div>}

      <section className="hero compact-hero">
        <p className="tag">unser kleiner ort</p>
        <h1>WeSpace</h1>
        <p className="subtitle">Ein Ort für Nähe, auch wenn Entfernung dazwischen liegt.</p>
      </section>

      {!isOnline && (
        <div className="offline-banner">Offline – Live-Daten werden später aktualisiert</div>
      )}

      <section className="tabs three">
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
          Heute
        </button>

        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          Chat
          {unread > 0 && <span className="notify">{unread}</span>}
        </button>

        <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>
          Karte
        </button>
      </section>

      {tab === "home" && (
        <>
          <section className="top-status-grid">
            {["Manuel", "Nela"].map((name) => {
              const person = data[name] || EMPTY_PERSON;

              return (
                <article className="person-mini" key={name}>
                  <header>
                    <strong>{name}</strong>
                    <small>
                      <i className={`dot ${statusDot(person.updatedAt)}`} />
                      {statusText(person.updatedAt)}
                    </small>
                  </header>

                  <div className="mini-line">
                    <span>{person.mood || "keine Stimmung"}</span>
                    <b>{person.status || "—"}</b>
                  </div>

                  <p>{person.proximity || "noch kein Nähe-Signal"}</p>
                </article>
              );
            })}
          </section>

          <section className="pulse-card">
            <button className={!canSendPulse ? "disabled-pulse" : ""} onClick={sendPulse}>
              <span>❤️</span>
              <strong>
                {myPulsesLeft <= 0
                  ? "Heute alle Pulse gesendet"
                  : myCooldownLeft > 0
                  ? `Nächster Puls in ${myCooldownLeft} Min.`
                  : "Ich vermisse dich"}
              </strong>
              <small>
                {myPulsesLeft <= 0
                  ? "Morgen wieder"
                  : `${myPulsesLeft} von ${PULSE_LIMIT_PER_DAY} heute übrig`}
              </small>
            </button>

            <div className="pulse-stats">
              <p>
                <b>{data.Manuel?.hearts || 0}</b>
                <span>Manuel heute</span>
                <small>{data.Manuel?.pulseAt ? clockText(data.Manuel.pulseAt) : "—"}</small>
              </p>
              <p>
                <b>{distanceKm !== null ? `${distanceKm} km` : "—"}</b>
                <span>Entfernung</span>
                <small>Live</small>
              </p>
              <p>
                <b>{data.Nela?.hearts || 0}</b>
                <span>Nela heute</span>
                <small>{data.Nela?.pulseAt ? clockText(data.Nela.pulseAt) : "—"}</small>
              </p>
            </div>

            {notificationPermission !== "granted" && notificationPermission !== "unsupported" && (
              <button className="permission-button" onClick={requestNotifications}>
                🔔 Benachrichtigungen aktivieren
              </button>
            )}
          </section>

          <section className="signals-card">
            <div className="signals-head">
              <strong>Letzte Zeichen</strong>
              <small>was gerade passiert ist</small>
            </div>

            {latestSignals.length === 0 ? (
              <p className="empty-small">Noch keine Zeichen heute</p>
            ) : (
              <>
                <div className="signals-list">
                  {latestSignals.map((signal) => (
                    <div key={signal.id} className="signal-item">
                      <span>{signal.text}</span>
                      <small>{clockText(signal.createdAt)}</small>
                    </div>
                  ))}
                </div>

                {hasMoreSignals && (
                  <button
                    className="signals-more-button"
                    onClick={() => setShowAllSignals(!showAllSignals)}
                  >
                    {showAllSignals ? "Weniger anzeigen" : "Mehr anzeigen"}
                  </button>
                )}
              </>
            )}
          </section>

          <section className="home-subtabs">
            <button className={homeSection === "near" ? "active" : ""} onClick={() => setHomeSection("near")}>
              Nähe
            </button>
            <button className={homeSection === "question" ? "active" : ""} onClick={() => setHomeSection("question")}>
              Frage
              {questionAnsweredByOther && !questionAnsweredByMe && <i />}
            </button>
            <button className={homeSection === "moment" ? "active" : ""} onClick={() => setHomeSection("moment")}>
              Moment
            </button>
            <button className={homeSection === "challenge" ? "active" : ""} onClick={() => setHomeSection("challenge")}>
              Foto
              {challengeAnswerOther.done && !challengeAnswerMe.done && <i />}
            </button>
            <button className={homeSection === "capsule" ? "active" : ""} onClick={() => setHomeSection("capsule")}>
              Kapsel
            </button>
          </section>

          {homeSection === "near" && (
            <>
              <section className="card compact-card">
                <h3>Gefühl</h3>
                <div className="button-grid compact-buttons">
                  {moodOptions.map((item) => (
                    <button
                      key={item}
                      className={me.mood === item ? "active" : ""}
                      onClick={() =>
                        updateMyData({ mood: item }, "Stimmung geteilt", moodMessage(user, item))
                      }
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>

              <section className="card compact-card">
                <h3>Alltag</h3>
                <div className="button-grid compact-buttons">
                  {activityOptions.map((item) => (
                    <button
                      key={item}
                      className={me.status === item ? "active" : ""}
                      onClick={() =>
                        updateMyData({ status: item }, "Aktivität geteilt", activityMessage(user, item))
                      }
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </section>

              <section className="card compact-card">
                <h3>Nähe-Signal</h3>
                <div className="button-grid compact-buttons">
                  {proximityOptions.map((item) => (
                    <button
                      key={item}
                      className={me.proximity === item ? "active" : ""}
                      onClick={() =>
                        updateMyData({ proximity: item }, "Nähe-Signal geteilt", proximityMessage(user, item))
                      }
                    >
                      {item}
                    </button>
                  ))}
                </div>

                {data.Manuel?.sleep === "Schlafend" && data.Nela?.sleep === "Schlafend" && (
                  <p className="both-sleep">⭐ Ihr schlaft beide gerade</p>
                )}
              </section>
            </>
          )}

          {homeSection === "question" && (
            <section className="card feature-card">
              <div className="feature-head">
                <div>
                  <p className="tag">jeden tag neu</p>
                  <h3>Frage des Tages</h3>
                </div>
                <span>💭</span>
              </div>

              <p className="question-text">
                {data.dailyQuestion?.question || getQuestionForDate(todayKey)}
              </p>

              <textarea
                placeholder="Deine Antwort..."
                value={questionDraft}
                onChange={(e) => setQuestionDraft(e.target.value)}
              />

              <button className="save-button" onClick={saveDailyAnswer}>
                Antwort speichern
              </button>

              <div className="answer-grid">
                <div>
                  <strong>Manuel</strong>
                  <p>{data.dailyQuestion?.answers?.Manuel || "Noch offen"}</p>
                </div>
                <div>
                  <strong>Nela</strong>
                  <p>{data.dailyQuestion?.answers?.Nela || "Noch offen"}</p>
                </div>
              </div>
            </section>
          )}

          {homeSection === "moment" && (
            <section className="card feature-card">
              <div className="feature-head">
                <div>
                  <p className="tag">ein satz reicht</p>
                  <h3>Tagesmoment</h3>
                </div>
                <span>📸</span>
              </div>

              <textarea
                placeholder="Ein Satz aus deinem Tag..."
                value={me.moment || ""}
                onChange={(e) =>
                  setData((current) => ({
                    ...current,
                    [user]: {
                      ...(current[user] || EMPTY_PERSON),
                      moment: e.target.value,
                    },
                  }))
                }
              />

              <button className="save-button" onClick={saveMoment}>
                Moment speichern
              </button>

              <div className="answer-grid">
                <div>
                  <strong>Manuel</strong>
                  <p>{data.Manuel?.moment || "Noch nichts geteilt"}</p>
                </div>
                <div>
                  <strong>Nela</strong>
                  <p>{data.Nela?.moment || "Noch nichts geteilt"}</p>
                </div>
              </div>
            </section>
          )}

          {homeSection === "challenge" && (
            <section className="card feature-card">
              <div className="feature-head">
                <div>
                  <p className="tag">foto-aufgabe</p>
                  <h3>Heutige Challenge</h3>
                </div>
                <span>📷</span>
              </div>

              <div className="photo-task">
                <strong>{data.photoChallenge?.prompt || getPhotoChallengeForDate(todayKey)}</strong>
                <p>
                  Foto machst du erstmal normal mit der Kamera. Hier trägst du ein, was auf dem Bild ist.
                  Echter Upload kommt später.
                </p>
              </div>

              <label className="challenge-check">
                <input
                  type="checkbox"
                  checked={challengeDone}
                  onChange={(e) => setChallengeDone(e.target.checked)}
                />
                <span>Foto gemacht</span>
              </label>

              <textarea
                placeholder="Was zeigt dein Foto?"
                value={challengeDraft}
                onChange={(e) => setChallengeDraft(e.target.value)}
              />

              <button className="save-button" onClick={saveChallengeAnswer}>
                Foto-Aufgabe speichern
              </button>

              <div className="answer-grid">
                <div>
                  <strong>Manuel {data.photoChallenge?.answers?.Manuel?.done ? "✓" : ""}</strong>
                  <p>{data.photoChallenge?.answers?.Manuel?.text || "Noch offen"}</p>
                </div>
                <div>
                  <strong>Nela {data.photoChallenge?.answers?.Nela?.done ? "✓" : ""}</strong>
                  <p>{data.photoChallenge?.answers?.Nela?.text || "Noch offen"}</p>
                </div>
              </div>
            </section>
          )}

          {homeSection === "capsule" && (
            <section className="card feature-card">
              <div className="feature-head">
                <div>
                  <p className="tag">für später</p>
                  <h3>Zeitkapsel</h3>
                </div>
                <span>🔒</span>
              </div>

              <p className="muted capsule-explain">
                Schreib etwas, das erst an einem bestimmten Tag sichtbar wird. Eher für besondere Tage, nicht für Alltag.
              </p>

              <textarea
                placeholder="Nachricht für später..."
                value={capsuleText}
                onChange={(e) => setCapsuleText(e.target.value)}
              />

              <div className="capsule-row">
                <input type="date" value={capsuleDate} onChange={(e) => setCapsuleDate(e.target.value)} />
                <button onClick={saveCapsule}>Speichern</button>
              </div>

              <div className="capsule-list">
                {(data.timeCapsules || []).length === 0 && (
                  <p className="empty-small">Noch keine Zeitkapseln</p>
                )}

                {(data.timeCapsules || []).slice(0, 5).map((capsule) => (
                  <div className="capsule-item" key={capsule.id}>
                    <div>
                      <strong>{capsule.owner}</strong>
                      <small>{capsule.targetDate}</small>
                    </div>

                    {capsule.targetDate <= todayKey ? (
                      <p>{capsule.text}</p>
                    ) : (
                      <p className="locked">Noch verschlossen</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "chat" && (
        <section className="card chat-card">
          <div className="chat-title">
            <div>
              <p className="tag">kurz schreiben</p>
              <h3>Unser Chat</h3>
            </div>
            <small>{messages.length} Nachrichten</small>
          </div>

          <div className="chat-box">
            {messages.length === 0 && <p className="empty-small">Noch keine Nachrichten</p>}

            {messages.map((message) => (
              <div key={message.id} className={`message ${message.name === user ? "mine" : ""}`}>
                <strong>{message.name}</strong>
                <span>{message.text}</span>
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          <div className="send-row sticky-send">
            <input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Nachricht schreiben..."
            />
            <button onClick={sendMessage}>Senden</button>
          </div>
        </section>
      )}

      {tab === "map" && (
        <section className="card">
          <h3>Karte</h3>

          <div className="map-box">
            <MapContainer
              center={
                me.location
                  ? [me.location.lat, me.location.lng]
                  : other.location
                  ? [other.location.lat, other.location.lng]
                  : [48.1351, 11.582]
              }
              zoom={13}
              className="map"
            >
              <TileLayer
                attribution="&copy; OpenStreetMap"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {data.Manuel?.location && (
                <Marker position={[data.Manuel.location.lat, data.Manuel.location.lng]}>
                  <Popup>Manuel – {timeText(data.Manuel.location.updatedAt)}</Popup>
                </Marker>
              )}

              {data.Nela?.location && (
                <Marker position={[data.Nela.location.lat, data.Nela.location.lng]}>
                  <Popup>Nela – {timeText(data.Nela.location.updatedAt)}</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          <button className="save-button" onClick={shareLocation}>
            📍 Standort teilen
          </button>

          <p className="muted">
            Kein Background-Tracking. Standort wird nur geteilt, wenn du den Button drückst.
          </p>
        </section>
      )}
    </main>
  );
}