import { Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

export function AuthScreen() {
  const { login, register } = useSession();
  const [tab, setTab] = useState("login");
  const [busy, setBusy] = useState(false);

  const [li, setLi] = useState({ username: "", password: "" });
  const [rg, setRg] = useState({ username: "", display_name: "", password: "" });

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(li.username.trim().toLowerCase(), li.password);
      toast.success("Welcome back. Private key unlocked.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rg.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await register(
        rg.username.trim().toLowerCase(),
        rg.display_name.trim() || rg.username,
        rg.password,
      );
      toast.success("Account created. Keys generated on this device.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            End-to-end encrypted
          </div>
          <h1 className="text-balance text-5xl font-bold leading-tight tracking-tight">
            Conversations only{" "}
            <span className="bg-gradient-to-r from-primary to-[oklch(0.82_0.18_170)] bg-clip-text text-transparent">
              you and them
            </span>{" "}
            can read.
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            Your messages are encrypted on your device with AES-GCM and RSA-OAEP. The server only
            ever sees ciphertext. Your private key never leaves your browser.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 text-primary" /> Keys generated locally on registration
            </li>
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 text-primary" /> Private key wrapped with your password
              (PBKDF2 + AES-GCM)
            </li>
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 text-primary" /> Real-time delivery via authenticated
              WebSocket
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border bg-card/80 p-6 backdrop-blur glow-primary">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="register">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={onLogin} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="li-username">Username</Label>
                  <Input
                    id="li-username"
                    autoComplete="username"
                    value={li.username}
                    onChange={(e) => setLi({ ...li, username: e.target.value })}
                    required
                    minLength={3}
                    maxLength={32}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="li-password">Password</Label>
                  <Input
                    id="li-password"
                    type="password"
                    autoComplete="current-password"
                    value={li.password}
                    onChange={(e) => setLi({ ...li, password: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Unlocking key…" : "Sign in"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={onRegister} className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rg-display">Display name</Label>
                  <Input
                    id="rg-display"
                    value={rg.display_name}
                    onChange={(e) => setRg({ ...rg, display_name: e.target.value })}
                    required
                    maxLength={64}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rg-username">Username</Label>
                  <Input
                    id="rg-username"
                    value={rg.username}
                    onChange={(e) => setRg({ ...rg, username: e.target.value })}
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[a-zA-Z0-9_\-]+"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rg-password">Password</Label>
                  <Input
                    id="rg-password"
                    type="password"
                    autoComplete="new-password"
                    value={rg.password}
                    onChange={(e) => setRg({ ...rg, password: e.target.value })}
                    required
                    minLength={8}
                    maxLength={128}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used to derive the wrapping key for your private key. We can&apos;t recover it.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Generating keys…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
}
