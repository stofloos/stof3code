import { useState } from "react";

import { RelayAuthDialog } from "./RelayAuthDialog";

export function useT3ConnectAuthPrompt() {
  const [open, setOpen] = useState(false);
  const openAuthPrompt = () => setOpen(true);
  const authPrompt = <RelayAuthDialog open={open} onOpenChange={setOpen} />;
  return { authPrompt, openAuthPrompt };
}
