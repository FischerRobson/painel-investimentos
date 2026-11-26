// Skeletons de carregamento: blocos cinza no formato do conteúdo, com o brilho passando (classes .sk no global.css).
// Sk é o bloco básico; os outros montam a cara de um painel, de cards com gráfico e de uma tabela.
// Todos ficam escondidos para leitores de tela, com um texto "Carregando…" no lugar (aria-busy no contêiner).
import type { CSSProperties } from "react";

type Forma = "line" | "title" | "big" | "block" | "circle" | "input";

export function Sk({ forma = "line", w, h, style }: { forma?: Forma; w?: number | string; h?: number | string; style?: CSSProperties }) {
  return <span className={`sk sk-${forma}`} style={{ width: w, height: h, ...style }} />;
}

// Gráfico fantasma: grade, área que pulsa e uma linha que se desenha em loop (CSS .skg no global.css).
// viewBox fixo esticado na largura (preserveAspectRatio none); a espessura da linha não estica (non-scaling-stroke).
const CAMINHO = "M0 78 C40 70 60 52 100 58 S170 30 210 40 S280 62 320 34 S370 14 400 20";
export function GraficoFantasma({ altura, compacto }: { altura?: number | string; compacto?: boolean }) {
  return (
    <svg className="skg" viewBox="0 0 400 100" preserveAspectRatio="none" style={{ height: altura ?? "100%" }} aria-hidden="true">
      {!compacto && [25, 50, 75].map(y => <line key={y} className="skg-grade" x1="0" x2="400" y1={y} y2={y} />)}
      <path className="skg-area" d={CAMINHO + " L400 100 L0 100 Z"} />
      <path className="skg-linha" d={CAMINHO} pathLength={100} />
    </svg>
  );
}

// Rosca fantasma: o arco gira em volta do anel
export function RoscaFantasma({ tamanho = 200 }: { tamanho?: number }) {
  return (
    <svg className="skg-rosca" width={tamanho} height={tamanho} viewBox="0 0 100 100" aria-hidden="true">
      <circle className="skg-anel" cx="50" cy="50" r="40" />
      <circle className="skg-arco" cx="50" cy="50" r="40" pathLength={100} />
    </svg>
  );
}

const Lido = ({ texto }: { texto: string }) => texto ? <span className="sr-only">{texto}</span> : null;

function Tiles({ n }: { n: number }) {
  return (
    <div className="tiles">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="tile"><Sk w="55%" /><Sk forma="big" w="70%" /><Sk w="45%" /></div>
      ))}
    </div>
  );
}

function Linhas({ n, colunas = 6 }: { n: number; colunas?: number }) {
  return <>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="sk-row" style={{ gridTemplateColumns: `2fr repeat(${colunas - 1}, 1fr)` }}>
        {Array.from({ length: colunas }, (_, j) => <Sk key={j} w={j === 0 ? "70%" : "60%"} />)}
      </div>
    ))}
  </>;
}

/** Painel com título, texto, uma linha de tiles e, opcionalmente, campos, um gráfico e uma tabela. */
export function EsqueletoPainel({ tiles = 3, campos = 0, grafico = false, linhas = 0, colunas, texto = "Carregando…" }:
  { tiles?: number; campos?: number; grafico?: boolean; linhas?: number; colunas?: number; texto?: string }) {
  return (
    <div className="panel skel" aria-busy="true">
      <Lido texto={texto} />
      <div aria-hidden="true">
        <Sk forma="title" />
        <Sk w="min(520px, 90%)" />
        {campos > 0 && (
          <div className="proj-form" style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {Array.from({ length: campos }, (_, i) => <div key={i}><Sk w="50%" /><Sk forma="input" /></div>)}
          </div>
        )}
        {tiles > 0 && <Tiles n={tiles} />}
        {grafico && <div style={{ height: 220, marginTop: 14 }}><GraficoFantasma /></div>}
        {linhas > 0 && <div style={{ marginTop: 14 }}><Linhas n={linhas} colunas={colunas} /></div>}
      </div>
    </div>
  );
}

/** Grade de cards com cabeçalho, número e mini gráfico (Moedas, Ativos). */
export function EsqueletoCards({ n = 4, texto = "Carregando…" }: { n?: number; texto?: string }) {
  return (
    <div className="grid skel" aria-busy="true">
      <Lido texto={texto} />
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card" aria-hidden="true">
          <div className="card-head"><div style={{ flex: 1 }}><Sk forma="title" w={70} /><Sk w="50%" /></div><div style={{ width: 120 }}><Sk forma="big" w="100%" /><Sk w="60%" style={{ marginLeft: "auto" }} /></div></div>
          <div style={{ height: 130, marginTop: 12 }}><GraficoFantasma compacto /></div>
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>{[0, 1, 2].map(j => <div key={j} style={{ flex: 1 }}><Sk w="60%" /><Sk w="80%" /></div>)}</div>
        </div>
      ))}
    </div>
  );
}

/** Página da Carteira: painel com tiles, divisão por classe (rosca) e a lista de ativos. */
export function EsqueletoCarteira() {
  return (
    <div className="panel skel" aria-busy="true">
      <Lido texto="Carregando sua carteira…" />
      <div aria-hidden="true">
        <div className="w-head"><div style={{ flex: 1 }}><Sk forma="title" /><Sk w="min(480px, 90%)" /></div>
          <div style={{ display: "flex", gap: 8 }}><Sk forma="input" w={120} /><Sk forma="input" w={120} /></div></div>
        <Tiles n={4} />
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
          <RoscaFantasma />
          <div style={{ flex: "1 1 260px" }}>{[0, 1, 2, 3].map(i => <div key={i} style={{ marginBottom: 12 }}><Sk w="40%" /><Sk h={8} w={`${90 - i * 18}%`} /></div>)}</div>
        </div>
        <div style={{ marginTop: 18 }}><Linhas n={5} /></div>
      </div>
    </div>
  );
}

/** Só um bloco no lugar de um gráfico. */
export function EsqueletoGrafico({ altura = 220, texto = "Carregando o gráfico…" }: { altura?: number; texto?: string }) {
  return <div className="skel" aria-busy="true" style={{ height: altura }}><Lido texto={texto} /><GraficoFantasma /></div>;
}

/** Só as linhas de uma tabela, para dentro de um painel que já está na tela. */
export function EsqueletoLinhas({ n = 4, colunas, texto = "Carregando…" }: { n?: number; colunas?: number; texto?: string }) {
  return <div className="skel" aria-busy="true" style={{ marginTop: 8 }}><Lido texto={texto} /><div aria-hidden="true"><Linhas n={n} colunas={colunas} /></div></div>;
}

/** Saúde da carteira: resumo com as notas, onde aportar e a tabela dos ativos. */
export function EsqueletoSaude() {
  return <>
    <EsqueletoPainel tiles={4} texto="Calculando a saúde da carteira…" />
    <EsqueletoPainel tiles={0} campos={1} linhas={4} colunas={5} texto="" />
    <EsqueletoPainel tiles={0} linhas={6} texto="" />
  </>;
}
