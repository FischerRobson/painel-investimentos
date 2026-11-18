// Glossário: o conteúdo vem de /glossario.json (arquivo estático); aqui só buscamos, filtramos e mostramos.
// /glossario#selic (e os links "Veja também") rolam até o termo e o destacam; "/" leva para a busca.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTitulo } from "../lib/useTitulo";
import { store } from "../lib/store";

type Termo = {
  id: string; nome: string; sigla?: string; outrosNomes?: string[]; categoria: string;
  resumo: string; exemplo?: string; importa?: string; relacionados?: string[];
};
type Glossario = { aviso?: string; categorias: { id: string; nome: string }[]; termos: Termo[] };
type TermoIndexado = Termo & { chave: string; texto: string };

const semAcento = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const porNome = (a: Termo, b: Termo) => a.nome.localeCompare(b.nome, "pt-BR");

async function carregarGlossario(): Promise<{ g: Glossario; termos: TermoIndexado[] }> {
  const r = await fetch("/glossario.json");
  if (!r.ok) throw new Error("HTTP " + r.status);
  const g: Glossario = await r.json();
  const termos = g.termos.map(t => {
    const chave = semAcento([t.nome, t.sigla, ...(t.outrosNomes || [])].join(" "));
    return { ...t, chave, texto: chave + " " + semAcento([t.resumo, t.exemplo, t.importa].join(" ")) };
  });
  return { g, termos };
}

export function Glossario() {
  useTitulo("Glossário");
  const { data, isError } = useQuery({ queryKey: ["glossario"], queryFn: carregarGlossario, staleTime: Infinity });
  if (isError) return <div className="panel err">Não consegui carregar o glossário. Confira a conexão e recarregue a página.</div>;
  if (!data) return null;
  return <Conteudo g={data.g} termos={data.termos} />;
}

function Conteudo({ g, termos }: { g: Glossario; termos: TermoIndexado[] }) {
  const [cat, setCatState] = useState(() => {
    const c = store.get("gCat", "");
    return g.categorias.some(x => x.id === c) ? c : "";
  });
  const [busca, setBusca] = useState("");
  const [alvo, setAlvo] = useState<string | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const { hash } = useLocation();
  const navigate = useNavigate();
  const setCat = (c: string) => { setCatState(c); store.set("gCat", c); };

  const nomeCat = useMemo(() => Object.fromEntries(g.categorias.map(c => [c.id, c.nome])), [g]);
  const porId = useMemo(() => Object.fromEntries(termos.map(t => [t.id, t])), [termos]);
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  const achados = termos.filter(t => (!cat || t.categoria === cat) && palavras.every(p => t.texto.includes(p)));

  // Rola até o termo do #hash; se o filtro o esconde, limpa o filtro antes
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    if (!id || !porId[id]) return;
    if (!document.getElementById("g-" + id)) { setCatState(""); setBusca(""); }
    setAlvo(id);
    const t = setTimeout(() => setAlvo(null), 2500);
    return () => clearTimeout(t);
  }, [hash, porId]);
  useEffect(() => {
    if (!alvo) return;
    const reduzido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("g-" + alvo)?.scrollIntoView?.({ behavior: reduzido ? "auto" : "smooth", block: "start" });
  }, [alvo, cat, busca]);

  // "/" leva para a busca
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "")) return;
      e.preventDefault();
      buscaRef.current?.focus();
    };
    addEventListener("keydown", fn);
    return () => removeEventListener("keydown", fn);
  }, []);

  const comCategoria = palavras.length > 0 && !cat; // agrupado por categoria, a etiqueta seria repetida
  const card = (t: TermoIndexado) => {
    const rel = (t.relacionados || []).map(id => porId[id]).filter(Boolean);
    return (
      <article key={t.id} className={"g-termo" + (alvo === t.id ? " g-alvo" : "")} id={"g-" + t.id}>
        <div className="g-head"><h3>{t.nome}</h3>{comCategoria && <span className="badge">{nomeCat[t.categoria]}</span>}</div>
        {t.sigla && <div className="g-sigla">{t.sigla}</div>}
        <p>{t.resumo}</p>
        {t.exemplo && <div className="g-bloco"><b>Exemplo</b>{t.exemplo}</div>}
        {t.importa && <div className="g-bloco"><b>Por que importa</b>{t.importa}</div>}
        {rel.length > 0 && (
          <div className="g-rel">Veja também {rel.map(r => (
            // navega sem recarregar e guarda no histórico (o voltar funciona)
            <a key={r.id} href={"#" + r.id} onClick={e => { e.preventDefault(); navigate({ hash: r.id }); }}>{r.nome}</a>
          ))}</div>
        )}
      </article>
    );
  };

  let lista;
  if (!achados.length) {
    lista = (
      <div className="panel muted">
        Nenhum termo encontrado{busca.trim() ? ` para “${busca.trim()}”` : ""}.{cat ? " Experimente buscar em todas as categorias." : ""}
      </div>
    );
  } else if (palavras.length) {
    // na busca, quem bate no nome (ou sigla) vem antes de quem só cita a palavra no texto
    const noNome = (t: TermoIndexado) => palavras.every(p => t.chave.includes(p)) ? 0 : 1;
    const ordenados = [...achados].sort((a, b) => noNome(a) - noNome(b) || porNome(a, b));
    lista = <>
      <div className="status g-conta">{ordenados.length} {ordenados.length === 1 ? "termo encontrado" : "termos encontrados"}</div>
      <div className="g-grid">{ordenados.map(card)}</div>
    </>;
  } else {
    lista = g.categorias.filter(c => !cat || c.id === cat).map(c => {
      const ts = achados.filter(t => t.categoria === c.id).sort(porNome);
      return ts.length ? <Fragment key={c.id}><h2 className="g-grupo">{c.nome}</h2><div className="g-grid">{ts.map(card)}</div></Fragment> : null;
    });
  }

  return <>
    <div className="panel">
      <h2>Glossário</h2>
      <div className="hint">{termos.length} termos para consultar quando bater a dúvida. {g.aviso || ""}</div>
      <input ref={buscaRef} type="search" className="g-busca" placeholder="Buscar: CDI, DY, come-cotas…" autoComplete="off" spellCheck={false}
        aria-label="Buscar termo" value={busca} onChange={e => setBusca(e.target.value)} />
      <div className="seg g-cats" role="group" aria-label="Categorias">
        <button type="button" className={cat === "" ? "on" : undefined} onClick={() => setCat("")}>Todas</button>
        {g.categorias.map(c => (
          <button key={c.id} type="button" className={cat === c.id ? "on" : undefined} onClick={() => setCat(c.id)}>{c.nome}</button>
        ))}
      </div>
    </div>
    <div aria-live="polite">{lista}</div>
  </>;
}
