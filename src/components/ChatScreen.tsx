import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  getAccessToken,
  WS_BASE,
  type Conversation,
  type MessagePayload,
  type MessageResponse,
  type SearchResult,
} from "@/lib/api";
import { decryptMessage, encryptMessage, importPublicKey } from "@/lib/crypto";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Lock,
  LogOut,
  Search,
  SendHorizontal,
  ShieldCheck,
  WifiOff,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DecryptedMsg {
  id: string;
  fromMe: boolean;
  text: string | null; // null = decryption failed
  createdAt: string;
}

export function ChatScreen() {
  const { user, privateKey, publicKey, logout } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePeer, setActivePeer] = useState<{
    id: string;
    display_name: string;
    username: string;
  } | null>(null);
  const peerKeyCache = useRef<Map<string, CryptoKey>>(new Map());
  const [messages, setMessages] = useState<DecryptedMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [wsOnline, setWsOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activePeerRef = useRef<typeof activePeer>(null);
  activePeerRef.current = activePeer;

  // Load conversations
  const refreshConversations = async () => {
    try {
      const c = await api.conversations();
      setConversations(c);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void refreshConversations();
  }, []);

  // WebSocket
  useEffect(() => {
    if (!privateKey || !user) return;
    let closed = false;
    let ws: WebSocket | null = null;

    const connect = () => {
      const token = getAccessToken();
      if (!token) return;
      ws = new WebSocket(`${WS_BASE}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => setWsOnline(true);
      ws.onclose = (ev) => {
        setWsOnline(false);
        wsRef.current = null;
        if (closed) return;
        if (ev.code === 4003) {
          toast.error("Session invalid. Please sign in again.");
          void logout();
          return;
        }
        // 4001 = expired (auto-refresh handles it); reconnect after a delay
        setTimeout(() => {
          if (!closed) connect();
        }, 1500);
      };
      ws.onmessage = async (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.event === "message.receive") {
            await handleIncoming(data);
            void refreshConversations();
          }
        } catch (err) {
          console.error("ws frame", err);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privateKey, user]);

  const handleIncoming = async (msg: {
    id: string;
    from_user_id: string;
    to_user_id: string;
    payload: MessagePayload;
    created_at: string;
  }) => {
    if (!privateKey || !user) return;
    const fromMe = msg.from_user_id === user.id;
    const peer = fromMe ? msg.to_user_id : msg.from_user_id;
    if (activePeerRef.current?.id !== peer) return; // we'll fetch when the user opens it
    let text: string | null = null;
    try {
      text = await decryptMessage(msg.payload, privateKey, fromMe);
    } catch (e) {
      console.error("decrypt failed", e);
    }
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id)
        ? prev
        : [...prev, { id: msg.id, fromMe, text, createdAt: msg.created_at }],
    );
  };

  // Open a conversation
  const openPeer = async (peer: { id: string; display_name: string; username: string }) => {
    setActivePeer(peer);
    setMessages([]);
    setLoadingHistory(true);
    try {
      const history = await api.history(peer.id);
      const decrypted = await decryptHistory(history);
      setMessages(decrypted);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoadingHistory(false);
    }
  };

  const decryptHistory = async (history: MessageResponse[]): Promise<DecryptedMsg[]> => {
    if (!privateKey || !user) return [];
    // Server returns newest first; reverse for chronological display
    const ordered = [...history].reverse();
    const out: DecryptedMsg[] = [];
    for (const m of ordered) {
      const fromMe = m.from_user_id === user.id;
      let text: string | null = null;
      try {
        text = await decryptMessage(m.payload, privateKey, fromMe);
      } catch (e) {
        console.error("decrypt failed", m.id, e);
      }
      out.push({ id: m.id, fromMe, text, createdAt: m.created_at });
    }
    return out;
  };

  // Auto scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.search(q);
        setSearchResults(r);
      } catch (e) {
        console.error(e);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const sendDraft = async () => {
    const text = draft.trim();
    if (!text || !activePeer || !privateKey || !publicKey || !user) return;
    if (text.length > 4000) {
      toast.error("Message too long (max 4000 chars).");
      return;
    }
    setSending(true);
    try {
      let peerKey = peerKeyCache.current.get(activePeer.id);
      if (!peerKey) {
        const { public_key } = await api.publicKey(activePeer.id);
        peerKey = await importPublicKey(public_key);
        peerKeyCache.current.set(activePeer.id, peerKey);
      }
      const payload = await encryptMessage(text, peerKey, publicKey);
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "message.send", to: activePeer.id, payload }));
        // Optimistically render — we won't get our own send echoed back via WS
        const optimisticId = `local-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: optimisticId,
            fromMe: true,
            text,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        const sent = await api.sendMessage(activePeer.id, payload);
        setMessages((prev) => [
          ...prev,
          { id: sent.id, fromMe: true, text, createdAt: sent.created_at },
        ]);
      }
      setDraft("");
      void refreshConversations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const sidebarItems = useMemo(() => {
    if (searchQuery.trim()) {
      return searchResults.map((r) => ({
        id: r.id,
        display_name: r.display_name,
        username: r.username,
        last_message_at: null as string | null,
      }));
    }
    return conversations.map((c) => ({
      id: c.user_id,
      display_name: c.display_name,
      username: c.username,
      last_message_at: c.last_message_at,
    }));
  }, [searchQuery, searchResults, conversations]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-card/60 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">WhisperBox</div>
            <div className="text-xs text-muted-foreground">
              Signed in as {user?.display_name} (@{user?.username})
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              wsOnline
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {wsOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {wsOnline ? "Connected" : "Offline"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 flex-col border-r bg-card/40 md:w-80">
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <ul className="space-y-1 px-2 pb-3">
              {sidebarItems.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {searchQuery ? "No users found" : "No conversations yet — search to start one."}
                </li>
              )}
              {sidebarItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() =>
                      openPeer({
                        id: item.id,
                        display_name: item.display_name,
                        username: item.username,
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                      activePeer?.id === item.id && "bg-accent/70",
                    )}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-sm font-semibold">
                      {item.display_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.display_name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        @{item.username}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {activePeer ? (
            <>
              <div className="flex items-center gap-3 border-b bg-card/40 px-5 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 text-sm font-semibold">
                  {activePeer.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{activePeer.display_name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <Lock className="h-3 w-3" /> End-to-end encrypted
                  </div>
                </div>
              </div>
              <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-5 py-6">
                {loadingHistory && (
                  <div className="text-center text-xs text-muted-foreground">
                    Decrypting history…
                  </div>
                )}
                <div className="mx-auto flex max-w-2xl flex-col gap-2">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex w-full",
                        m.fromMe ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                          m.fromMe ? "bubble-mine rounded-br-md" : "bubble-theirs rounded-bl-md",
                        )}
                      >
                        {m.text === null ? (
                          <span className="italic opacity-70">[unable to decrypt]</span>
                        ) : (
                          m.text
                        )}
                        <div
                          className={cn(
                            "mt-1 text-[10px] opacity-70",
                            m.fromMe ? "text-right" : "text-left",
                          )}
                        >
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendDraft();
                }}
                className="border-t bg-card/40 px-4 py-3"
              >
                <div className="mx-auto flex max-w-2xl items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write an encrypted message…"
                    autoComplete="off"
                    maxLength={4000}
                  />
                  <Button type="submit" disabled={sending || !draft.trim()} size="icon">
                    <SendHorizontal className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mx-auto mt-1.5 flex max-w-2xl items-center justify-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="h-2.5 w-2.5" /> Encrypted on this device with AES-GCM + RSA-OAEP
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary glow-primary">
                <Lock className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">Select a conversation</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Search for a user to start a new private chat. Every message is encrypted on your
                device — only you and the recipient can read it.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
