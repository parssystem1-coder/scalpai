import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LoginPage from "./pages/LoginPage.js";
import PatientsPage from "./pages/PatientsPage.js";
import "./i18n.js";

const queryClient = new QueryClient();

function App() {
  const [authed, setAuthed] = useState(false);
  return authed ? <PatientsPage onLoggedOut={() => setAuthed(false)} /> : <LoginPage onLoggedIn={() => setAuthed(true)} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
