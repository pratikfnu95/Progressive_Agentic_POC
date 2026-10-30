import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  History,
  Menu,
  Search,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react';

const logoPath = import.meta.env.VITE_PROGRESSIVE_LOGO_PATH || '/assets/progressive-fleet-logo.png';
const sidebarArtworkPath = import.meta.env.VITE_SIDEBAR_ARTWORK_PATH || '/assets/sidebar-illustration.png';
const welcomePrompts = [
  { heading: 'What’s on your mind?', placeholder: 'Message...' },
  { heading: 'Ready when you are.', placeholder: 'Ask anything...' },
  { heading: 'How can I help today?', placeholder: 'Type a message...' },
  { heading: 'Let’s figure it out.', placeholder: 'Start a conversation...' },
  { heading: 'Good to see you. What are we working on?', placeholder: 'Tell me what you have in mind...' },
  { heading: 'How’s your day going?', placeholder: 'What would you like to talk about?' },
];

function chooseWelcomePrompt(previousHeading) {
  const options = welcomePrompts.filter(({ heading }) => heading !== previousHeading);
  return options[Math.floor(Math.random() * options.length)];
}

function BrandLockup() {
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  return (
    <div className="brand-lockup">
      {!logoUnavailable ? (
        <img
          className="progressive-logo"
          src={logoPath}
          alt="Progressive Fleet"
          onError={() => setLogoUnavailable(true)}
        />
      ) : (
        <span className="brand-fallback">Progressive Fleet</span>
      )}
    </div>
  );
}

function SidebarArtwork() {
  const [available, setAvailable] = useState(true);

  return (
    <div className="sidebar-footer">
      {available && (
        <img
          className="sidebar-footer-image"
          src={sidebarArtworkPath}
          alt="Progressive insurance illustration"
          onError={() => setAvailable(false)}
        />
      )}
    </div>
  );
}

function Sidebar({ chats, activeChatId, setActiveChatId, onNewChat, mobileOpen }) {
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const visibleChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchText.toLowerCase()),
  );

  return (
    <aside id="app-sidebar" className={`sidebar${mobileOpen ? ' is-mobile-open' : ''}`}>
      <div className="sidebar-topline">
        <BrandLockup />
      </div>

      <nav className="sidebar-actions" aria-label="Main navigation">
        <button className="side-action side-action-primary" onClick={onNewChat}>
          <SquarePen size={23} strokeWidth={2} />
          <span>New chat</span>
        </button>
        {searching ? (
          <div className="side-search">
            <Search size={18} />
            <input
              ref={searchRef}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearching(false);
                  setSearchText('');
                }
              }}
            />
            <button className="tiny-icon" onClick={() => { setSearching(false); setSearchText(''); }} aria-label="Close search"><X size={15} /></button>
          </div>
        ) : (
          <button className="side-action" onClick={() => setSearching(true)}>
            <Search size={18} strokeWidth={1.8} />
            <span>Search chats</span>
          </button>
        )}
      </nav>

      <div className="chat-history">
        <div className="history-label"><History size={14} /> Recent conversations</div>
        {visibleChats.length > 0 ? (
          <div className="chat-list">
            {visibleChats.map((chat) => (
              <button
                className={`chat-history-item${activeChatId === chat.id ? ' selected' : ''}`}
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                title={chat.title}
              >
                <span>{chat.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-history">{searchText ? 'No conversations found' : 'Your conversations will appear here'}</div>
        )}
      </div>
      <SidebarArtwork />
    </aside>
  );
}

function Composer({ value, setValue, onSend, placeholder, compact = false }) {
  const textareaRef = useRef(null);
  const canSend = value.trim().length > 0;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const height = Math.max(34, Math.min(textarea.scrollHeight, 180));
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? 'auto' : 'hidden';
  }, [value]);

  function submit(event) {
    event.preventDefault();
    if (canSend) onSend();
  }

  return (
    <form className={`composer${compact ? ' composer-compact' : ''}`} onSubmit={submit}>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={placeholder}
        aria-label="Message"
      />
      <button type="submit" className={`send-button${canSend ? ' send-active' : ''}`} aria-label="Send question" disabled={!canSend}>
        <ArrowUp size={19} strokeWidth={2.4} />
      </button>
    </form>
  );
}

function App() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [draft, setDraft] = useState('');
  const [welcomePrompt, setWelcomePrompt] = useState(() => chooseWelcomePrompt());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const activeChat = chats.find((chat) => chat.id === activeChatId);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        startNewChat();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages.length]);

  function startNewChat() {
    setActiveChatId(null);
    setDraft('');
    setMobileSidebarOpen(false);
    setWelcomePrompt((current) => chooseWelcomePrompt(current.heading));
  }

  function selectChat(chatId) {
    setActiveChatId(chatId);
    setMobileSidebarOpen(false);
  }

  function sendMessage(value = draft) {
    const content = value.trim();
    if (!content) return;
    const id = activeChatId ?? crypto.randomUUID();
    const userMessage = { id: crypto.randomUUID(), role: 'user', content };

    setChats((current) => {
      const existing = current.find((chat) => chat.id === id);
      if (existing) {
        return current.map((chat) => chat.id === id
          ? { ...chat, messages: [...chat.messages, userMessage] }
          : chat);
      }
      return [{ id, title: content.length > 38 ? `${content.slice(0, 38).trimEnd()}…` : content, messages: [userMessage] }, ...current];
    });
    setActiveChatId(id);
    setDraft('');
  }

  return (
    <div className="app-shell">
      {mobileSidebarOpen && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Close navigation menu"
        />
      )}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={selectChat}
        onNewChat={startNewChat}
        mobileOpen={mobileSidebarOpen}
      />

      <main className="main-panel">
        <button
          className="mobile-sidebar-toggle"
          type="button"
          onClick={() => setMobileSidebarOpen((open) => !open)}
          aria-label={mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileSidebarOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={21} strokeWidth={1.8} />
        </button>
        {!activeChat ? (
          <section className="welcome-view">
            <div className="welcome-content">
              <h2 key={welcomePrompt.heading}>{welcomePrompt.heading}</h2>
              <div className="welcome-composer-wrap">
                <Composer
                  value={draft}
                  setValue={setDraft}
                  onSend={() => sendMessage()}
                  placeholder={welcomePrompt.placeholder}
                />
              </div>
            </div>
          </section>
        ) : (
          <section className="conversation-view">
            <div className="conversation-scroll">
              <div className="message-list">
                {activeChat.messages.map((message) => (
                  <article className={`message-row message-${message.role}`} key={message.id}>
                    {message.role === 'assistant' && <span className="assistant-avatar"><Sparkles size={14} /></span>}
                    <div className="message-content">{message.content}</div>
                  </article>
                ))}
                {activeChat.messages.at(-1)?.role === 'user' && (
                  <div className="not-connected-note">
                    <span>AI responses aren’t connected yet.</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            <div className="conversation-composer-area">
              <Composer value={draft} setValue={setDraft} onSend={() => sendMessage()} placeholder="Message..." compact />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
