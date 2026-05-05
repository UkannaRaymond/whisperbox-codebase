import { useState } from "react";
import { useLocation } from "wouter";
import { useCrypto } from "@/contexts/CryptoContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { EncryptedBadge } from "@/components/EncryptedBadge";
import { Shield } from "lucide-react";
import { Link } from "wouter";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useCrypto();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="bg-teal-500/10 p-3 rounded-2xl mb-4 border border-teal-500/20">
          <Shield className="w-8 h-8 text-teal-500" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">WhisperBox</h1>
        <p className="text-gray-400 mt-2">Secure, encrypted messaging.</p>
      </div>

      <Card className="w-full max-w-md bg-[#161b22] border-[#2d333b]">
        <CardHeader className="space-y-1 pb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl">Login</CardTitle>
            <EncryptedBadge />
          </div>
          <CardDescription className="text-gray-400">
            Enter your credentials to decrypt your keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input 
                id="username" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="bg-[#0d1117] border-[#2d333b] focus-visible:ring-teal-500"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Master Password</Label>
              <Input 
                id="password" 
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-[#0d1117] border-[#2d333b] focus-visible:ring-teal-500"
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button 
              type="submit" 
              className="w-full bg-teal-600 hover:bg-teal-500 text-white" 
              disabled={loading}
            >
              {loading ? "Decrypting Keys..." : "Login & Unlock"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center border-t border-[#2d333b] pt-4">
          <p className="text-sm text-gray-400">
            Don't have an account? <Link href="/register" className="text-teal-400 hover:text-teal-300">Create one</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
