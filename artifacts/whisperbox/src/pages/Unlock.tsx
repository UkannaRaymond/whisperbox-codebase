import { useState } from "react";
import { useLocation } from "wouter";
import { useCrypto } from "@/contexts/CryptoContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Lock } from "lucide-react";

export default function Unlock() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { unlock, logout } = useCrypto();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await unlock(password);
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "Invalid password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md bg-[#161b22] border-[#2d333b]">
        <CardHeader className="space-y-1 pb-4 flex flex-col items-center text-center">
          <div className="bg-teal-500/10 p-3 rounded-full mb-2">
            <Lock className="w-8 h-8 text-teal-500" />
          </div>
          <CardTitle className="text-xl">Unlock Session</CardTitle>
          <CardDescription className="text-gray-400">
            Enter your password to decrypt your keys and resume messaging.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Master Password</Label>
              <Input 
                id="password" 
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-[#0d1117] border-[#2d333b] focus-visible:ring-teal-500"
                required
                autoFocus
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button 
              type="submit" 
              className="w-full bg-teal-600 hover:bg-teal-500 text-white" 
              disabled={loading}
            >
              {loading ? "Decrypting..." : "Unlock"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t border-[#2d333b] pt-4">
          <Button variant="ghost" onClick={logout} className="text-gray-400 hover:text-white">
            Log out completely
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
