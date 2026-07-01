import { useState } from "react";

import { useRelayAuth } from "../../cloud/useRelayAuth";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

type Mode = "sign-in" | "register";

export function RelayAuthDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { login, register } = useRelayAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setPassword("");
    setInviteCode("");
    setError(null);
    setIsSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === "sign-in") {
        await login({ email, password });
      } else {
        await register({
          email,
          password,
          ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
        });
      }
      handleOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup className="max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === "sign-in" ? "Sign in to Stofloos" : "Create an account"}</DialogTitle>
            <DialogDescription>
              {mode === "sign-in"
                ? "Connect this client to your Stofloos relay."
                : "Register a new account on your Stofloos relay."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Email</span>
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Password</span>
              <Input
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
              />
            </label>
            {mode === "register" ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">
                  Invite code <span className="text-muted-foreground">(if required)</span>
                </span>
                <Input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  disabled={isSubmitting}
                />
              </label>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                setMode(mode === "sign-in" ? "register" : "sign-in");
                setError(null);
              }}
              disabled={isSubmitting}
            >
              {mode === "sign-in"
                ? "Need an account? Create one"
                : "Already have an account? Sign in"}
            </button>
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !email || !password}>
              {isSubmitting
                ? mode === "sign-in"
                  ? "Signing in…"
                  : "Creating…"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
