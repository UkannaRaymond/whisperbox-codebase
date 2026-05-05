import { useState, useEffect } from "react";
import { useCrypto } from "@/contexts/CryptoContext";
import { apiFetch } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

interface Conversation {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  lastMessageAt: string;
  isOnline?: boolean;
}

interface ConversationListProps {
  onSelectConversation: (user: any) => void;
  selectedUserId?: string;
  onlineUsers: Set<string>;
}

export function ConversationList({ onSelectConversation, selectedUserId, onlineUsers }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const { accessToken } = useCrypto();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadConversations() {
      try {
        const res = await apiFetch("/conversations", { token: accessToken! });
        setConversations(res.conversations || []);
      } catch (err) {
        console.error("Failed to load conversations", err);
      } finally {
        setLoading(false);
      }
    }
    loadConversations();
  }, [accessToken]);

  if (loading) {
    return <div className="p-4 text-sm text-gray-400">Loading conversations...</div>;
  }

  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        No conversations yet. Start a new chat to begin.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => {
        const isSelected = selectedUserId === conv.userId;
        const isOnline = onlineUsers.has(conv.userId);

        return (
          <div
            key={conv.userId}
            onClick={() => onSelectConversation({ id: conv.userId, username: conv.username, displayName: conv.displayName })}
            className={`flex items-center gap-3 p-3 mx-2 my-1 rounded-lg cursor-pointer transition-colors ${
              isSelected ? "bg-[#2d333b]" : "hover:bg-[#161b22]"
            }`}
          >
            <div className="relative">
              <Avatar className="h-10 w-10 border border-[#2d333b]">
                <AvatarFallback className={`${isSelected ? "bg-teal-600 text-white" : "bg-[#0d1117] text-teal-400"}`}>
                  {conv.displayName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-teal-500 rounded-full border-2 border-[#0f1117]" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-sm font-medium text-gray-100 truncate pr-2">
                  {conv.displayName}
                </span>
                {conv.lastMessageAt && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 truncate">
                @{conv.username}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
