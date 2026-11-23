import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { iniciarSessao } from "./lib/api";
import "./global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// Abre sem internet com os últimos dados (public/sw.js); no npm run dev não, para não guardar o código de desenvolvimento
if (import.meta.env.PROD && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

const raiz = createRoot(document.getElementById("root")!);

iniciarSessao()
  .then(sessao => raiz.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App sessao={sessao} />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  ))
  .catch(e => raiz.render(
    <div className="wrap"><div className="panel err">Não consegui iniciar o login ({String(e?.message ?? e)}). Recarregue a página em instantes.</div></div>,
  ));
