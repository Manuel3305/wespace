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

const partnerOf = {
  Manuel: "Nela",
  Nela: "Manuel",
};

const moodOptions = [
  "😊 Gut",
  "😴 Müde",
  "❤️ Vermisse dich",
  "😔 Schwerer Tag",
];

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
  "☎️ Können wir kurz reden?",
];

const dailyQuestions = [
  "Was war heute dein schönster Moment?",
  "Was vermisst du heute an mir?",
  "Was würdest du mir erzählen, wenn ich gerade neben dir wäre?",
  "Schick mir gedanklich ein Bild von deinem Tag.",
  "Wofür bist du heute dankbar?",
  "Was war heute schwer?",
  "Was sollen wir machen, wenn wir uns wiedersehen?",
  "Was hat dich heute zum Lächeln gebracht?",
  "Was möchtest du mir morgen erzählen?",
  "Welcher Song passt heute zu dir?",
  "Womit hast du dir heute eine Freude gemacht?",
  "Was hast du heute gelernt?",
  "Welche kleine Sache machte deinen Tag besser?",
  "Was geht dir heute im Herzen herum?",
  "Für wen oder was denkst du heute besonders oft an mich?",
  "Was würdest du heute mit mir teilen, wenn ich neben dir wäre?",
  "Welcher Wunsch begleitet dich heute?",
  "Worauf freust du dich morgen?",
  "Welche Situation heute möchtest du behalten?",
  "Was ist heute anders als gestern?",
];

function getQuestionForDate(dateKey) {
  const parts = dateKey.split("-").map(Number);
  const index = (parts[0] * 10000 + parts[1] * 100 + parts[2]) % dailyQuestions.length;
  return dailyQuestions[index];
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

function getLocalDateKey(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Fix Leaflet icon urls (Vite import)
try {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
    iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
    shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
  });
} catch (e) {
  // ignore in environments without leaflet installed
}

export default function App() {
  const [tab, setTab] = useState("home");
  const [user, setUser] = useState(localStorage.getItem("wespace_user") || "");
  const [segment, setSegment] = useState("feeling");
  const [data, setData] = useState({
    currentDay: getLocalDateKey(),
    dailyQuestion: createDailyQuestion(getLocalDateKey()),
    timeCapsules: [],
    Manuel: { hearts: 0, mood: "", moment: "", status: "", battery: "", proximity: "", sleep: "" },
    Nela: { hearts: 0, mood: "", moment: "", status: "", battery: "", proximity: "", sleep: "" },
  });
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [capsuleText, setCapsuleText] = useState("");
  const [capsuleDate, setCapsuleDate] = useState(getLocalDateKey());
  const [questionDraft, setQuestionDraft] = useState("");
  const [lastRead, setLastRead] = useState(Number(localStorage.getItem("wespace_last_read")) || 0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const chatEndRef = useRef(null);
  const partner = partnerOf[user];

  function timeText(iso) {
    if (!iso) return "Noch nicht aktualisiert";

    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

    if (diff < 1) return "gerade eben";
    if (diff === 1) return "vor 1 Minute";
    if (diff < 60) return `vor ${diff} Minuten`;

    const hours = Math.floor(diff / 60);
    if (hours === 1) return "vor 1 Stunde";
    return `vor ${hours} Stunden`;
  }

  function timeTextShort(iso) {
    if (!iso) return "nicht aktualisiert";
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "gerade";
    if (diff === 1) return "vor 1 Min.";
    if (diff < 60) return `vor ${diff} Min.`;
    const hours = Math.floor(diff / 60);
    if (hours === 1) return "vor 1 Std.";
    return `vor ${hours} Std.`;
  }

  // Helpers for local pending queues
  function getPendingUpdates() {
    try {
      return JSON.parse(localStorage.getItem("wespace_pending_updates") || "[]");
    } catch (e) {
      return [];
    }
  }

  function setPendingUpdates(list) {
    localStorage.setItem("wespace_pending_updates", JSON.stringify(list));
  }

  function getPendingMessages() {
    try {
      return JSON.parse(localStorage.getItem("wespace_pending_messages") || "[]");
    } catch (e) {
      return [];
    }
  }

  function setPendingMessages(list) {
    localStorage.setItem("wespace_pending_messages", JSON.stringify(list));
  }

  // Listen for online/offline
  useEffect(() => {
    function onOnline() {
      setIsOnline(true);
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Reset local daily fields on startup when currentDay is outdated
  useEffect(() => {
    const today = getLocalDateKey();
    const cached = localStorage.getItem("wespace_status");
    if (!cached) return;

    try {
      const stored = JSON.parse(cached);
      const storedDay = stored.dailyQuestion?.day || stored.currentDay;
      if (storedDay !== today) {
        const reset = {
          ...stored,
          currentDay: today,
          dailyQuestion: createDailyQuestion(today),
          timeCapsules: stored.timeCapsules || [],
          Manuel: {
            ...(stored.Manuel || {}),
            hearts: 0,
            mood: "",
            moment: "",
            status: "",
            battery: stored.Manuel?.battery || "",
            proximity: "",
            sleep: "",
            updatedAt: new Date().toISOString(),
          },
          Nela: {
            ...(stored.Nela || {}),
            hearts: 0,
            mood: "",
            moment: "",
            status: "",
            battery: stored.Nela?.battery || "",
            proximity: "",
            sleep: "",
            updatedAt: new Date().toISOString(),
          },
        };
        setData(reset);
        localStorage.setItem("wespace_status", JSON.stringify(reset));
      }
    } catch (e) {
      // ignore invalid cached data
    }
  }, []);

  // Flush pending when back online
  useEffect(() => {
    if (!isOnline) return;
    if (!firebaseAvailable || !db) return;

    async function flushPendingData() {
      const statusRef = doc(db, "spaces", SPACE_ID, "data", "status");
      const pending = getPendingUpdates();
      if (pending.length > 0) {
        const results = await Promise.all(
          pending.map(async (p) => {
            try {
              await setDoc(statusRef, p, { merge: true });
              return true;
            } catch (e) {
              return false;
            }
          })
        );
        if (results.every(Boolean)) {
          setPendingUpdates([]);
        }
      }

      const msgs = getPendingMessages();
      if (msgs.length > 0) {
        const messagesRef = collection(db, "spaces", SPACE_ID, "messages");
        const msgResults = await Promise.all(
          msgs.map(async (m) => {
            try {
              await addDoc(messagesRef, {
                name: m.name,
                text: m.text,
                createdAt: serverTimestamp(),
              });
              return true;
            } catch (e) {
              return false;
            }
          })
        );
        if (msgResults.every(Boolean)) {
          setPendingMessages([]);
        }
      }
    }

    flushPendingData();
  }, [isOnline]);

  // Subscribe to remote status (or load cached)
  useEffect(() => {
    if (!firebaseAvailable || !db) {
      const cached = localStorage.getItem("wespace_status");
      if (cached) setData(JSON.parse(cached));
      return;
    }

    const statusRef = doc(db, "spaces", SPACE_ID, "data", "status");
    return onSnapshot(
      statusRef,
      (snap) => {
        if (snap.exists()) {
          const remote = snap.data();
          const today = getLocalDateKey();

          // If the saved daily question is for a different day, reset the shared daily question for today.
          const remoteDay = remote.dailyQuestion?.day || remote.currentDay;
          if (remoteDay !== today) {
            const reset = {
              ...remote,
              currentDay: today,
              dailyQuestion: createDailyQuestion(today),
              timeCapsules: remote.timeCapsules || [],
              Manuel: {
                ...(remote.Manuel || {}),
                hearts: 0,
                mood: "",
                moment: "",
                status: "",
                battery: remote.Manuel?.battery || "",
                proximity: "",
                sleep: "",
                updatedAt: new Date().toISOString(),
              },
              Nela: {
                ...(remote.Nela || {}),
                hearts: 0,
                mood: "",
                moment: "",
                status: "",
                battery: remote.Nela?.battery || "",
                proximity: "",
                sleep: "",
                updatedAt: new Date().toISOString(),
              },
            };

            // try to persist reset; if it fails we'll keep local copy
            setDoc(statusRef, reset, { merge: true }).catch(() => {
              localStorage.setItem("wespace_status", JSON.stringify(reset));
            });

            setData({
              ...reset,
              currentDay: today,
              dailyQuestion: reset.dailyQuestion,
              timeCapsules: reset.timeCapsules || [],
              Manuel: { hearts: 0, mood: "", moment: "", status: "", battery: reset.Manuel?.battery || "", proximity: "", sleep: "" },
              Nela: { hearts: 0, mood: "", moment: "", status: "", battery: reset.Nela?.battery || "", proximity: "", sleep: "" },
            });
            localStorage.setItem("wespace_status", JSON.stringify(reset));
            return;
          }

          setData({
            ...remote,
            currentDay: remote.currentDay || today,
            dailyQuestion: remote.dailyQuestion?.day === today ? remote.dailyQuestion : createDailyQuestion(today),
            timeCapsules: remote.timeCapsules || [],
            Manuel: { hearts: 0, mood: "", moment: "", status: "", battery: remote.Manuel?.battery || "", proximity: remote.Manuel?.proximity || "", sleep: remote.Manuel?.sleep || "" },
            Nela: { hearts: 0, mood: "", moment: "", status: "", battery: remote.Nela?.battery || "", proximity: remote.Nela?.proximity || "", sleep: remote.Nela?.sleep || "" },
          });
          localStorage.setItem("wespace_status", JSON.stringify(remote));
        }
      },
      (err) => {
        // on error, fall back to cached data
        // eslint-disable-next-line no-console
        console.warn("status snapshot error", err);
        const cached = localStorage.getItem("wespace_status");
        if (cached) setData(JSON.parse(cached));
      }
    );
  }, []);

  // Subscribe to messages (or cached)
  useEffect(() => {
    if (!firebaseAvailable || !db) {
      const cached = localStorage.getItem("wespace_messages");
      if (cached) setMessages(JSON.parse(cached));
      return;
    }

    const messagesRef = collection(db, "spaces", SPACE_ID, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      localStorage.setItem("wespace_messages", JSON.stringify(msgs));
    }, (err) => {
      // fallback
      // eslint-disable-next-line no-console
      console.warn("messages snapshot error", err);
      const cached = localStorage.getItem("wespace_messages");
      if (cached) setMessages(JSON.parse(cached));
    });
  }, []);

  useEffect(() => {
    if (tab === "chat") {
      const count = messages.filter((m) => m.name !== user).length;
      setLastRead(count);
      localStorage.setItem("wespace_last_read", count);
    }

    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab, user]);

  const unread =
    tab === "chat"
      ? 0
      : Math.max(0, messages.filter((m) => m.name !== user).length - lastRead);

  function chooseUser(name) {
    localStorage.setItem("wespace_user", name);
    setUser(name);
  }

  async function updateMyData(newData) {
    const today = getLocalDateKey();
    const userData = {
      ...(data[user] || {}),
      ...newData,
      sleep:
        newData.proximity !== undefined
          ? newData.proximity === "🌙 Gute Nacht"
            ? "Schlafend"
            : ""
          : data[user]?.sleep || "",
      updatedAt: new Date().toISOString(),
    };

    const updated = {
      ...data,
      currentDay: today,
      [user]: userData,
    };

    setData(updated);
    localStorage.setItem("wespace_status", JSON.stringify(updated));

    if (!firebaseAvailable || !db || !isOnline) {
      // queue update
      const pending = getPendingUpdates();
      pending.push(updated);
      setPendingUpdates(pending);
      return;
    }

    try {
      const statusRef = doc(db, "spaces", SPACE_ID, "data", "status");
      await setDoc(statusRef, updated, { merge: true });
    } catch (e) {
      const pending = getPendingUpdates();
      pending.push(updated);
      setPendingUpdates(pending);
    }
  }

  async function saveCapsule() {
    if (!capsuleText.trim()) return;
    const today = getLocalDateKey();
    const capsule = {
      id: `capsule-${Date.now()}`,
      owner: user,
      text: capsuleText.trim(),
      targetDate: capsuleDate,
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...data,
      currentDay: today,
      timeCapsules: [...(data.timeCapsules || []), capsule],
    };
    setData(updated);
    localStorage.setItem("wespace_status", JSON.stringify(updated));
    setCapsuleText("");

    if (!firebaseAvailable || !db || !isOnline) {
      const pending = getPendingUpdates();
      pending.push(updated);
      setPendingUpdates(pending);
      return;
    }

    try {
      const statusRef = doc(db, "spaces", SPACE_ID, "data", "status");
      await setDoc(statusRef, updated, { merge: true });
    } catch (e) {
      const pending = getPendingUpdates();
      pending.push(updated);
      setPendingUpdates(pending);
    }
  }

  async function saveDailyAnswer(answer) {
    const today = getLocalDateKey();
    const dailyQuestion = data.dailyQuestion?.day === today ? data.dailyQuestion : createDailyQuestion(today);
    const updated = {
      ...data,
      currentDay: today,
      dailyQuestion: {
        ...dailyQuestion,
        day: today,
        question: getQuestionForDate(today),
        answers: {
          ...dailyQuestion.answers,
          [user]: answer,
        },
      },
    };

    setData(updated);
    localStorage.setItem("wespace_status", JSON.stringify(updated));

    if (!firebaseAvailable || !db || !isOnline) {
      const pending = getPendingUpdates();
      pending.push(updated);
      setPendingUpdates(pending);
      return;
    }

    try {
      const statusRef = doc(db, "spaces", SPACE_ID, "data", "status");
      await setDoc(statusRef, updated, { merge: true });
    } catch (e) {
      const pending = getPendingUpdates();
      pending.push(updated);
      setPendingUpdates(pending);
    }
  }

  async function sendMessage() {
    if (!text.trim()) return;

    const msg = { name: user, text: text.trim() };

    if (!firebaseAvailable || !db || !isOnline) {
      const pending = getPendingMessages();
      pending.push({ ...msg, createdAt: new Date().toISOString() });
      setPendingMessages(pending);
      setMessages((m) => [...m, { id: `local-${Date.now()}`, ...msg, createdAt: new Date().toISOString() }]);
      setText("");
      localStorage.setItem("wespace_messages", JSON.stringify(messages));
      return;
    }

    try {
      const messagesRef = collection(db, "spaces", SPACE_ID, "messages");
      await addDoc(messagesRef, { ...msg, createdAt: serverTimestamp() });
      setText("");
    } catch (e) {
      const pending = getPendingMessages();
      pending.push({ ...msg, createdAt: new Date().toISOString() });
      setPendingMessages(pending);
    }
  }

  // Location sharing
  function shareLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation wird nicht unterstützt.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: new Date().toISOString(),
        };
        updateMyData({ location: loc });
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn("location error", err);
        alert("Standort konnte nicht ermittelt werden.");
      },
      { enableHighAccuracy: true, maximumAge: 60000 }
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

  const me = data[user] || {};
  const other = data[partner] || {};
  const todayKey = getLocalDateKey();

  useEffect(() => {
    setQuestionDraft(data.dailyQuestion?.answers?.[user] || "");
  }, [user, data.dailyQuestion?.day, data.dailyQuestion?.answers]);

  return (
    <main className="app">
      <section className="hero">
        <p className="tag">unser kleiner ort</p>
        <h1>WeSpace</h1>
        <p className="subtitle">Ein Ort für uns, auch wenn uns das Leben mal trennt.</p>
      </section>

<section className="tabs three">
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>Heute</button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          Chat
          {unread > 0 && <span className="notify">{unread}</span>}
        </button>
        <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Karte</button>
      </section>

      {!isOnline && (
        <div className="offline-banner">Offline – Live-Daten werden später aktualisiert</div>
      )}

      {tab === "home" && (
        <>
          <section className="card pair-grid">
            {["Manuel", "Nela"].map((name) => {
              const person = data[name] || {};
              return (
                <div key={name} className="person-card">
                  <div className="person-head">
                    <strong>{name}</strong>
                    <small>geändert {timeTextShort(person.updatedAt)}</small>
                  </div>
                  <div className="status-list">
                    <div><span>Stimmung</span><strong>{person.mood || "—"}</strong></div>
                    <div><span>Aktivität</span><strong>{person.status || "—"}</strong></div>
                    <div><span>Bedürfnis</span><strong>{person.proximity || "—"}</strong></div>
                    <div><span>Schlaf</span><strong>{person.sleep || "—"}</strong></div>
                  </div>
                </div>
              );
            })}
          </section>

          <div className="segment-switch">
            <button className={segment === 'feeling' ? 'active' : ''} onClick={() => setSegment('feeling')}>Gefühl</button>
            <button className={segment === 'proximity' ? 'active' : ''} onClick={() => setSegment('proximity')}>Nähe</button>
            <button className={segment === 'question' ? 'active' : ''} onClick={() => setSegment('question')}>Frage</button>
            <button className={segment === 'moment' ? 'active' : ''} onClick={() => setSegment('moment')}>Moment</button>
          </div>

          {segment === 'question' && (
            <section className="card question-card">
              <h3>Frage des Tages</h3>
              <p className="question-text">{data.dailyQuestion?.question || getQuestionForDate(todayKey)}</p>
              <div className="question-grid">
                <div className="question-box">
                  <strong>Manuel</strong>
                  <p>{data.dailyQuestion?.answers?.Manuel || "Noch nichts geantwortet."}</p>
                </div>
                <div className="question-box">
                  <strong>Nela</strong>
                  <p>{data.dailyQuestion?.answers?.Nela || "Noch nichts geantwortet."}</p>
                </div>
              </div>
              <textarea
                className="question-input"
                placeholder="Deine Antwort hier"
                value={questionDraft}
                onChange={(e) => setQuestionDraft(e.target.value)}
              />
              <button className="question-save" onClick={() => saveDailyAnswer(questionDraft)}>Antwort speichern</button>
            </section>
          )}

          {segment === 'feeling' && (
            <>
              <section className="card action-group">
                <h3>Wie geht's dir?</h3>
                <div className="action-buttons">
                  {moodOptions.map((item) => (
                    <button key={item} className={me.mood === item ? "active" : ""} onClick={() => updateMyData({ mood: item })}>{item}</button>
                  ))}
                </div>
              </section>

              <section className="card action-group">
                <h3>Was machst du gerade?</h3>
                <div className="action-buttons">
                  {activityOptions.map((item) => (
                    <button key={item} className={me.status === item ? "active" : ""} onClick={() => updateMyData({ status: item })}>{item}</button>
                  ))}
                </div>
              </section>
            </>
          )}

          {segment === 'proximity' && (
            <>
              <section className="card action-group">
                <h3>Was brauchst du gerade?</h3>
                <div className="action-buttons proximity-buttons">
                  {proximityOptions.map((item) => (
                    <button key={item} className={me.proximity === item ? "active" : ""} onClick={() => updateMyData({ proximity: item })}>{item}</button>
                  ))}
                </div>
              </section>

              {me.proximity === "🌙 Gute Nacht" && other.proximity === "🌙 Gute Nacht" && (
                <section className="card night-card">
                  <p>⭐ Ihr schlaft beide gerade</p>
                </section>
              )}
            </>
          )}

          {segment === 'moment' && (
            <section className="card moment-card">
              <h3>Tagesmomente</h3>
              <textarea
                placeholder="Kurz deinen Moment für heute schreiben..."
                value={me.moment || ""}
                onChange={(e) => updateMyData({ moment: e.target.value })}
              />
              <div className="moment-grid">
                <div className="moment-box">
                  <strong>Manuel</strong>
                  <p>{data.Manuel?.moment || "Noch nichts."}</p>
                </div>
                <div className="moment-box">
                  <strong>Nela</strong>
                  <p>{data.Nela?.moment || "Noch nichts."}</p>
                </div>
              </div>
            </section>
          )}

          <section className="card capsule-card">
            <h3>Zeitkapsel</h3>
            <div className="capsule-form">
              <textarea
                placeholder="Nachricht für später"
                value={capsuleText}
                onChange={(e) => setCapsuleText(e.target.value)}
              />
              <div className="capsule-meta">
                <input type="date" value={capsuleDate} onChange={(e) => setCapsuleDate(e.target.value)} />
                <button className="capsule-save" onClick={saveCapsule}>Speichern</button>
              </div>
            </div>
            <div className="capsule-list">
              {(data.timeCapsules || []).length === 0 ? (
                <p className="empty">Noch keine Zeitkapseln</p>
              ) : (
                (data.timeCapsules || []).map((entry) => (
                  <div key={entry.id} className="capsule-entry">
                    <div className="capsule-row">
                      <strong>{entry.owner}</strong>
                      <small>{entry.targetDate}</small>
                    </div>
                    {entry.targetDate <= todayKey ? (
                      <p>{entry.text}</p>
                    ) : (
                      <p className="locked">Noch verschlossen</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {tab === "chat" && (
        <section className="card chat-card">
          <div className="chat-head">
            <div>
              <p className="tag small-tag">nur für euch</p>
              <h3>Unser Chat</h3>
            </div>
          </div>

          <div className="chat-box">
            {messages.length === 0 && <p className="empty">Noch keine Nachrichten</p>}

            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.name === user ? "mine" : ""}`}>
                <strong>{msg.name}</strong>
                <span>{msg.text}</span>
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          <div className="send-row">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Nachricht schreiben..." />
            <button onClick={sendMessage}>Senden</button>
          </div>
        </section>
      )}


      {tab === "map" && (
        <section className="card">
          <h3>Karte</h3>
          <div style={{ height: 300 }}>
            <MapContainer center={
              me.location ? [me.location.lat, me.location.lng] : other.location ? [other.location.lat, other.location.lng] : [51.505, -0.09]
            } zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {me.location && (
                <Marker position={[me.location.lat, me.location.lng]}>
                  <Popup>
                    Manuel<br />
                    Zuletzt: {timeText(me.location.updatedAt)}
                  </Popup>
                </Marker>
              )}

              {other.location && (
                <Marker position={[other.location.lat, other.location.lng]}>
                  <Popup>
                    Nela<br />
                    Zuletzt: {timeText(other.location.updatedAt)}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={shareLocation}>Standort teilen</button>
            <p className="muted">Kein Background-Tracking — nur wenn du teilst.</p>
          </div>
        </section>
      )}
    </main>
  );
}