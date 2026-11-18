// Moldura de todas as páginas: cabeçalho, aviso do modo demonstração, menu e aviso de offline. Mesma marcação (e classes CSS)
// do app atual.
import { useEffect, useState, useSyncExternalStore } from "react";
import { NavLink, Outlet } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PAGINAS } from "../rotas";
import { ICONES } from "./icones";
import { DEMO, alternarDemo, store } from "../lib/store";
import { logout, offlineStore, type Sessao } from "../lib/api";

const FONTES = "Cotação: brapi.dev · Indicadores: Fundamentus · Histórico e proventos: Yahoo Finance · Cripto: CoinGecko · Taxas: Banco Central";
const QUINZE_MIN = 15 * 60 * 1000;

export function Layout({ sessao }: { sessao: Sessao }) {
  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Meus Investimentos</h1>
          <div className="sub">{FONTES}</div>
        </div>
        <div className="head-r">
          {/* "Atualizado às" (cotações) e "Salvando…/Salvo ✓" (carteira) entram aqui quando as páginas forem migradas */}
          <div className="status" />
          <div className="status" aria-live="polite" />
          <Versao />
          {sessao.loginAtivo && !DEMO && ( // ao mostrar para alguém, o e-mail não aparece
            <div className="status">
              <span>{sessao.email}</span> · <a href="#" onClick={e => { e.preventDefault(); logout(); }}>Sair</a>
            </div>
          )}
          <button type="button" className="demo-btn" title="Mostra o app com dados fictícios, sem expor os seus" onClick={alternarDemo}>
            {DEMO ? "Sair da demonstração" : "Modo demonstração"}
          </button>
          <AtualizarAuto />
        </div>
      </header>
      {DEMO && (
        <div className="demo-bar" role="status">
          <span>Modo demonstração: todos os dados são fictícios e nada do que você fizer será salvo.</span>
          <button type="button" onClick={alternarDemo}>Sair da demonstração</button>
        </div>
      )}
      <nav className="nav" aria-label="Páginas">
        {PAGINAS.map(p => (
          <NavLink key={p.id} to={p.caminho} className={({ isActive }) => isActive ? "on" : undefined}>
            {ICONES[p.id]}{p.titulo}
          </NavLink>
        ))}
      </nav>
      <AvisoOffline />
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function Versao() {
  const { data } = useQuery({
    queryKey: ["versao"],
    queryFn: async () => (await (await fetch("/api/version")).json()) as { version?: string },
    staleTime: Infinity,
  });
  return data?.version ? <div className="status" title="Versão da API">v{data.version}</div> : null;
}

// "Atualizar a cada 15 min": recarrega todas as consultas abertas (cotações, taxas...) enquanto ligado.
function AtualizarAuto() {
  const [ligado, setLigado] = useState(() => store.get("auto", "0") === "1");
  const qc = useQueryClient();
  useEffect(() => {
    store.set("auto", ligado ? "1" : "0");
    if (!ligado) return;
    const t = setInterval(() => qc.invalidateQueries(), QUINZE_MIN);
    return () => clearInterval(t);
  }, [ligado, qc]);
  return (
    <label className="status">
      <input type="checkbox" checked={ligado} onChange={e => setLigado(e.target.checked)} /> atualizar a cada 15 min
    </label>
  );
}

function AvisoOffline() {
  const offline = useSyncExternalStore(offlineStore.subscribe, offlineStore.get);
  if (!offline) return null;
  const d = offline.salvoEm;
  const quando = d ? ` em ${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "";
  return <div className="offline" role="status">Sem internet: mostrando os dados salvos{quando}. Alterações não serão salvas.</div>;
}
