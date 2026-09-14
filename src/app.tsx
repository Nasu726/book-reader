import { useEffect } from "react";

import { interceptLinks, useRoute } from "./router";
import { HelpScreen } from "./screens/help";
import { LibraryScreen } from "./screens/library";
import { ReaderScreen } from "./screens/reader";

export function App() {
  const route = useRoute();
  useEffect(() => interceptLinks(), []);

  switch (route.screen) {
    case "read": return <ReaderScreen id={route.id} key={route.id} />;
    case "help": return <HelpScreen />;
    default: return <LibraryScreen />;
  }
}
