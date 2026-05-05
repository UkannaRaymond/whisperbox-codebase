import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useCrypto } from "@/contexts/CryptoContext";
import { apiFetch } from "@/lib/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectUser: (user: any) => void;
}

export function UserSearchModal({ open, onOpenChange, onSelectUser }: UserSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const { accessToken } = useCrypto();
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length > 2) {
      setLoading(true);
      try {
        const res = await apiFetch(`/users/search?q=${encodeURIComponent(val)}`, { token: accessToken! });
        setResults(res.users || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      setResults([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#161b22] border-[#2d333b] text-gray-100">
        <DialogHeader>
          <DialogTitle>New Chat</DialogTitle>
        </DialogHeader>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input 
            value={query}
            onChange={handleSearch}
            placeholder="Search username or display name..."
            className="pl-9 bg-[#0d1117] border-[#2d333b] focus-visible:ring-teal-500"
          />
        </div>
        <div className="mt-4 max-h-[300px] overflow-y-auto space-y-2">
          {loading && <p className="text-sm text-gray-400 text-center py-4">Searching...</p>}
          {!loading && results.length === 0 && query.length > 2 && (
            <p className="text-sm text-gray-400 text-center py-4">No users found.</p>
          )}
          {results.map((user) => (
            <div 
              key={user.id}
              onClick={() => {
                onSelectUser(user);
                onOpenChange(false);
                setQuery("");
                setResults([]);
              }}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-[#2d333b] cursor-pointer transition-colors"
            >
              <Avatar className="h-10 w-10 border border-[#2d333b]">
                <AvatarFallback className="bg-[#0d1117] text-teal-400">
                  {user.displayName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.displayName}</span>
                <span className="text-xs text-gray-400">@{user.username}</span>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
