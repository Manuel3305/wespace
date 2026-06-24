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

function getQuestionForDate(dayKey) {
  const parts = dayKey.split("-").map(Number);
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

function createDefaultData() {
  const today = getLocalDateKey();

  return {
    currentDay: today,
    dailyQuestion: createDailyQuestion(today),
    timeCapsules: [],
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
    timeCapsules: raw.timeCapsules || [],
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

export default function App() {
  const [tab, setTab] = useState("home");
  const [homeSection, setHomeSection] = useState("near");
  const [user, setUser] = useState(localStorage.getItem("wespace_user") || "");
  const [data, setData] = useState(createDefaultData);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [capsuleText, setCapsuleText] = useState("");
  const [capsuleDate, setCapsuleDate] = useState(getLocalDateKey());
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [lastRead, setLastRead] = useState(
    Number(localStorage.getItem("wespace_last_read")) || 0
  );
  const [notification, setNotification] = useState("");

  const chatEndRef = useRef(null);
  const notificationTimer = useRef(null);

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
    notificationTimer.current = setTimeout(() => setNotification(""), 3500);
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

  function updateMyData(partial, label = "Status aktualisiert") {
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

    saveStatus(
      {
        ...data,
        currentDay: todayKey,
        [user]: nextPerson,
      },
      label
    );
  }

  function sendPulse() {
    if (!user) return;

    updateMyData(
      {
        hearts: (me.hearts || 0) + 1,
        proximity: "❤️ Ich vermisse dich",
        pulseAt: new Date().toISOString(),
      },
      `❤️ Puls an ${partner} gesendet`
    );
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

    saveStatus(
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
      "Antwort gespeichert"
    );
  }

  function saveMoment() {
    updateMyData({ moment: me.moment || "" }, "Moment gespeichert");
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

    saveStatus(
      {
        ...data,
        currentDay: todayKey,
        timeCapsules: [capsule, ...(data.timeCapsules || [])],
      },
      "Zeitkapsel gespeichert"
    );

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
            <button onClick={sendPulse}>
              <span>❤️</span>
              <strong>Ich vermisse dich</strong>
              <small>Puls an {partner} senden</small>
            </button>

            <div className="pulse-stats">
              <p>
                <b>{data.Manuel?.hearts || 0}</b>
                <span>Manuel</span>
              </p>
              <p>
                <b>{distanceKm !== null ? `${distanceKm} km` : "—"}</b>
                <span>Entfernung</span>
              </p>
              <p>
                <b>{data.Nela?.hearts || 0}</b>
                <span>Nela</span>
              </p>
            </div>
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
                      onClick={() => updateMyData({ mood: item }, "Stimmung geteilt")}
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
                      onClick={() => updateMyData({ status: item }, "Aktivität geteilt")}
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
                      onClick={() => updateMyData({ proximity: item }, "Nähe-Signal geteilt")}
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