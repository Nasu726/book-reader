import { useEffect } from "react";

import { interceptLinks, useRoute } from "./router";
import { startSync } from "./sync/sync";
import { HelpScreen } from "./screens/help";
import { LibraryScreen } from "./screens/library";
import { ReaderScreen } from "./screens/reader";

export function App() {
  const route = useRoute();
  useEffect(() => interceptLinks(), []);
  useEffect(() => startSync(), []);

  switch (route.screen) {
    case "read": return <ReaderScreen id={route.id} key={route.id} />;
    case "help": return <HelpScreen />;
    default: return <LibraryScreen />;
  }
}
