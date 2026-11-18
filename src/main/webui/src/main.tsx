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

const raiz = createRoot(document.getElementById("root")!);

iniciarSessao()
  .then(sessao => raiz.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* import.meta.env.BASE_URL = "/novo/" enquanto convive com o app atual */}
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <App sessao={sessao} />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  ))
  .catch(e => raiz.render(
    <div className="wrap"><div className="panel err">Não consegui iniciar o login ({String(e?.message ?? e)}). Recarregue a página em instantes.</div></div>,
  ));
