import { useState, useEffect, useRef } from "react";
import { useCrypto } from "@/contexts/CryptoContext";
import { apiFetch } from "@/lib/api";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import { MessageBubble } from "./MessageBubble";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { WebSocketManager } from "@/lib/websocket";

interface ChatWindowProps {
  recipient: any;
  ws: WebSocketManager | null;
}

export function ChatWindow({ recipient, ws }: ChatWindowProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const { currentUser, accessToken, privateKey, publicKey, getPublicKey } = useCrypto();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      setLoading(true);
      try {
        const res = await apiFetch(`/messages?userId=${recipient.id}&limit=50`, { token: accessToken! });
        
        const decryptedMessages = await Promise.all(
          res.messages.reverse().map(async (msg: any) => {
            const isSentByMe = msg.fromUserId === currentUser!.id;
            try {
              const plain = await decryptMessage(msg.payload, privateKey!, isSentByMe);
              return { ...msg, text: plain, isSentByMe, failedToDecrypt: false };
            } catch (e) {
              return { ...msg, text: "", isSentByMe, failedToDecrypt: true };
            }
          })
        );
        
        if (mounted) {
          setMessages(decryptedMessages);
          setTimeout(scrollToBottom, 100);
        }
      } catch (err) {
        console.error("Failed to load messages", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadMessages();

    return () => { mounted = false; };
  }, [recipient.id, accessToken, currentUser, privateKey]);

  useEffect(() => {
    if (!ws) return;

    const handleNewMessage = async (payload: any) => {
      // payload structure matches what comes from the server
      const msg = payload;
      // Only process if it belongs to this conversation
      if (msg.fromUserId !== recipient.id && msg.toUserId !== recipient.id) return;
      
      const isSentByMe = msg.fromUserId === currentUser!.id;
      
      // Temporary state for the new message
      const tempMsg = { ...msg, text: "", isSentByMe, isDecrypting: true };
      setMessages(prev => [...prev, tempMsg]);
      setTimeout(scrollToBottom, 50);

      try {
        const plain = await decryptMessage(msg.payload, privateKey!, isSentByMe);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, text: plain, isDecrypting: false, failedToDecrypt: false } : m));
      } catch (e) {
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isDecrypting: false, failedToDecrypt: true } : m));
      }
    };

    ws.onMessage = handleNewMessage;

    return () => {
      ws.onMessage = null;
    };
  }, [ws, recipient.id, currentUser, privateKey]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const plaintext = text.trim();
    setText("");

    try {
      const recipientPubKey = await getPublicKey(recipient.id);
      const payload = await encryptMessage(plaintext, recipientPubKey, publicKey!);

      ws?.send({
        toUserId: recipient.id,
        payload
      });
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f1117]">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading secure messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            This is the start of your encrypted conversation with {recipient.displayName}.
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map((msg, idx) => (
              <MessageBubble key={msg.id || idx} message={msg} index={idx} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="p-4 bg-[#161b22] border-t border-[#2d333b]">
        <form onSubmit={handleSend} className="flex items-center gap-2 max-w-4xl mx-auto">
          <Input 
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a secure message..."
            className="flex-1 bg-[#0d1117] border-[#2d333b] focus-visible:ring-teal-500 rounded-full px-4"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!text.trim()} 
            className="rounded-full bg-teal-600 hover:bg-teal-500 text-white shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
