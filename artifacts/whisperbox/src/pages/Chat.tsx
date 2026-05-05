import { useState, useEffect } from "react";
import { useCrypto } from "@/contexts/CryptoContext";
import { WebSocketManager } from "@/lib/websocket";
import { ConversationList } from "@/components/ConversationList";
import { ChatWindow } from "@/components/ChatWindow";
import { UserSearchModal } from "@/components/UserSearchModal";
import { EncryptedBadge } from "@/components/EncryptedBadge";
import { Button } from "@/components/ui/button";
import { Shield, Plus, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLocation } from "wouter";

export default function Chat() {
  const { currentUser, accessToken, isAuthenticated, logout } = useCrypto();
  const [, setLocation] = useLocation();
  const [ws, setWs] = useState<WebSocketManager | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      // Check session
      const session = sessionStorage.getItem("whisperbox_session");
      if (session) {
        setLocation("/unlock");
      } else {
        setLocation("/login");
      }
      return;
    }

    if (accessToken && !ws) {
      const manager = new WebSocketManager(accessToken);
      
      manager.onUserOnline = (userId) => {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          next.add(userId);
          return next;
        });
      };
      
      manager.onUserOffline = (userId) => {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      };

      manager.onAuthError = () => {
        logout();
      };

      setWs(manager);
    }

    return () => {
      if (ws) {
        ws.disconnect();
        setWs(null);
      }
    };
  }, [accessToken, isAuthenticated, setLocation, logout]);

  if (!isAuthenticated || !currentUser) {
    return <div className="min-h-screen bg-[#0f1117]" />; // Blank while redirecting
  }

  const isSelectedOnline = selectedUser ? onlineUsers.has(selectedUser.id) : false;

  return (
    <div className="flex h-screen bg-[#0f1117] text-gray-100 overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-80 flex-shrink-0 bg-[#0f1117] border-r border-[#2d333b] flex flex-col h-full z-10">
        <div className="p-4 border-b border-[#2d333b] flex items-center justify-between">
          <div className="flex items-center gap-2 text-teal-400">
            <Shield className="w-5 h-5" />
            <span className="font-semibold text-white tracking-tight">WhisperBox</span>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="text-gray-400 hover:text-white" title="Log Out">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="p-4 pb-2">
          <Button 
            onClick={() => setSearchOpen(true)}
            className="w-full bg-teal-600/10 text-teal-400 hover:bg-teal-600/20 border border-teal-500/20 shadow-none justify-start gap-2"
          >
            <Plus className="w-4 h-4" />
            New Secure Chat
          </Button>
        </div>

        <ConversationList 
          onSelectConversation={setSelectedUser} 
          selectedUserId={selectedUser?.id}
          onlineUsers={onlineUsers}
        />

        <div className="p-4 border-t border-[#2d333b] bg-[#161b22] flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-[#2d333b]">
            <AvatarFallback className="bg-[#0d1117] text-teal-400 text-xs">
              {currentUser.displayName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">{currentUser.displayName}</span>
            <span className="text-xs text-gray-400 truncate">@{currentUser.username}</span>
          </div>
        </div>
      </div>

      {/* Right Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0f1117] relative">
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="h-16 flex-shrink-0 border-b border-[#2d333b] bg-[#161b22] px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-[#2d333b]">
                  <AvatarFallback className="bg-[#0d1117] text-teal-400 text-xs">
                    {selectedUser.displayName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{selectedUser.displayName}</span>
                    {isSelectedOnline && <div className="w-2 h-2 bg-teal-500 rounded-full" />}
                  </div>
                  <span className="text-xs text-gray-400">@{selectedUser.username}</span>
                </div>
              </div>
              <EncryptedBadge />
            </div>

            {/* Chat Window */}
            <div className="flex-1 min-h-0">
              <ChatWindow recipient={selectedUser} ws={ws} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#161b22] border border-[#2d333b] flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-teal-500/50" />
            </div>
            <h2 className="text-xl font-semibold text-gray-300 mb-2">WhisperBox</h2>
            <p className="max-w-md">
              Your messages are end-to-end encrypted. The server only sees encrypted blobs and cannot read your messages.
            </p>
            <Button 
              onClick={() => setSearchOpen(true)}
              className="mt-6 bg-teal-600 hover:bg-teal-500 text-white"
            >
              Start a Conversation
            </Button>
          </div>
        )}
      </div>

      <UserSearchModal 
        open={searchOpen} 
        onOpenChange={setSearchOpen} 
        onSelectUser={setSelectedUser} 
      />
    </div>
  );
}
