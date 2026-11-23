// Campos dos formulários das ferramentas:
// o número vale quando o campo perde o foco (ou com Enter), e campo vazio vira null (a ferramenta volta ao padrão).
// Com aoDigitar, o valor vale a cada tecla (como no IPCA+ × Prefixado), sem reescrever o que está sendo digitado.
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

type BaseInput = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type">;

const blurNoEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
};

// Texto que o usuário está digitando; acompanha o valor de fora enquanto o campo não tem foco
function useRascunho(valor: string) {
  const [rascunho, setRascunho] = useState(valor);
  const focado = useRef(false);
  useEffect(() => { if (!focado.current) setRascunho(valor); }, [valor]);
  return { rascunho, setRascunho, focado };
}

export type PropsNum = BaseInput & { valor: number | null | undefined; onValor: (v: number | null) => void; aoDigitar?: boolean };

export function CampoNum({ valor, onValor, aoDigitar = false, ...resto }: PropsNum) {
  const texto = valor == null || !isFinite(valor) ? "" : String(valor);
  const { rascunho, setRascunho, focado } = useRascunho(texto);
  const valer = (t: string) => {
    const v = t === "" ? null : Number(t);
    onValor(v != null && isFinite(v) ? v : null);
  };
  return (
    <input {...resto} type="number" value={rascunho}
      onFocus={() => { focado.current = true; }}
      onChange={e => { setRascunho(e.target.value); if (aoDigitar) valer(e.target.value); }}
      onBlur={e => { focado.current = false; if (!aoDigitar) valer(e.target.value); else setRascunho(texto); }}
      onKeyDown={blurNoEnter} />
  );
}

export function Num({ rotulo, ...resto }: PropsNum & { rotulo: ReactNode }) {
  return <label>{rotulo}<CampoNum {...resto} /></label>;
}

export type PropsTexto = BaseInput & { valor: string; onValor: (v: string) => void; type?: "text" | "date" };

// Texto ou data: vale ao sair do campo (data: ao escolher no calendário também)
export function CampoTexto({ valor, onValor, type = "text", ...resto }: PropsTexto) {
  const { rascunho, setRascunho, focado } = useRascunho(valor);
  return (
    <input {...resto} type={type} value={rascunho}
      onFocus={() => { focado.current = true; }}
      onChange={e => { setRascunho(e.target.value); if (type === "date" && e.target.value) onValor(e.target.value); }}
      onBlur={e => { focado.current = false; if (e.target.value !== valor) onValor(e.target.value); }}
      onKeyDown={blurNoEnter} />
  );
}

export function Texto({ rotulo, ...resto }: PropsTexto & { rotulo: ReactNode }) {
  return <label>{rotulo}<CampoTexto {...resto} /></label>;
}

// Legenda dos gráficos: [nome, cor, tracejada?]
export function Legenda({ itens }: { itens: [string, string, boolean?][] }) {
  return (
    <div className="legend">
      {itens.map(([n, c, dash]) => (
        <span key={n}><i style={{ background: dash ? `repeating-linear-gradient(90deg, ${c} 0 4px, transparent 4px 7px)` : c }} />{n}</span>
      ))}
    </div>
  );
}
