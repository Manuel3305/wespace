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
import { db } from "./firebase";
import "./App.css";

const SPACE_ID = "ManuelNela";
const statusRef = doc(db, "spaces", SPACE_ID, "data", "status");
const messagesRef = collection(db, "spaces", SPACE_ID, "messages");

const partnerOf = {
  Manuel: "Nela",
  Nela: "Manuel",
};

export default function App() {
  const [tab, setTab] = useState("home");
  const [user, setUser] = useState(localStorage.getItem("wespace_user") || "");
  const [data, setData] = useState({
    Manuel: { hearts: 0, mood: "", moment: "" },
    Nela: { hearts: 0, mood: "", moment: "" },
  });
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [lastRead, setLastRead] = useState(
    Number(localStorage.getItem("wespace_last_read")) || 0
  );

  const chatEndRef = useRef(null);
  const partner = partnerOf[user];

  useEffect(() => {
    return onSnapshot(statusRef, (snap) => {
      if (snap.exists()) {
        setData({
          Manuel: { hearts: 0, mood: "", moment: "" },
          Nela: { hearts: 0, mood: "", moment: "" },
          ...snap.data(),
        });
      }
    });
  }, []);

  useEffect(() => {
    const q = query(messagesRef, orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    const updated = {
      ...data,
      [user]: {
        ...(data[user] || {}),
        ...newData,
      },
    };

    setData(updated);
    await setDoc(statusRef, updated, { merge: true });
  }

  async function sendMessage() {
    if (!text.trim()) return;

    await addDoc(messagesRef, {
      name: user,
      text: text.trim(),
      createdAt: serverTimestamp(),
    });

    setText("");
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

  return (
    <main className="app">
      <section className="hero">
        <p className="tag">unser kleiner ort</p>
        <h1>WeSpace</h1>
        <p className="subtitle">
          Ein Ort für uns, auch wenn uns das Leben mal trennt.
        </p>
      </section>

      <section className="tabs">
        <button
          className={tab === "home" ? "active" : ""}
          onClick={() => setTab("home")}
        >
          Home
        </button>

        <button
          className={tab === "chat" ? "active" : ""}
          onClick={() => setTab("chat")}
        >
          Chat
          {unread > 0 && <span className="notify">{unread}</span>}
        </button>
      </section>

      {tab === "home" && (
        <>
          <section className="card countdown compact">
            <p>Wiedersehen in</p>
            <h2>180 Tage</h2>
            <span>Jeder Tag bringt uns näher ❤️</span>
          </section>

          <section className="card">
            <h3>Ich denk an dich</h3>

            <button
              className="heart"
              onClick={() => updateMyData({ hearts: (me.hearts || 0) + 1 })}
            >
              ❤️
            </button>

            <div className="mini-stats">
              <div>
                <strong>Du</strong>
                <p>{me.hearts || 0}× an {partner} gedacht</p>
              </div>

              <div>
                <strong>{partner}</strong>
                <p>{other.hearts || 0}× an dich gedacht</p>
              </div>
            </div>
          </section>

          <section className="card">
            <h3>Wie geht's dir?</h3>

            <div className="moods">
              {["😊 Gut", "😐 Geht so", "😔 Schwer"].map((item) => (
                <button
                  key={item}
                  className={me.mood === item ? "active" : ""}
                  onClick={() => updateMyData({ mood: item })}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mini-stats">
              <div>
                <strong>Du</strong>
                <p>{me.mood || "Noch offen"}</p>
              </div>

              <div>
                <strong>{partner}</strong>
                <p>{other.mood || "Noch offen"}</p>
              </div>
            </div>
          </section>

          <section className="card">
            <h3>Tagesmoment</h3>

            <textarea
              placeholder="Ein Gedanke für heute..."
              value={me.moment || ""}
              onChange={(e) => updateMyData({ moment: e.target.value })}
            />

            <div className="moment-row">
              <div>
                <strong>Du</strong>
                <p>{me.moment || "Noch nichts geteilt."}</p>
              </div>

              <div>
                <strong>{partner}</strong>
                <p>{other.moment || "Noch nichts geteilt."}</p>
              </div>
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
            {messages.length === 0 && (
              <p className="empty">Noch keine Nachrichten</p>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${msg.name === user ? "mine" : ""}`}
              >
                <strong>{msg.name}</strong>
                <span>{msg.text}</span>
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          <div className="send-row">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Nachricht schreiben..."
            />
            <button onClick={sendMessage}>Senden</button>
          </div>
        </section>
      )}
    </main>
  );
}