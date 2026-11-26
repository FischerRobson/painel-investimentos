// Campos de formulário do app inteiro, todos com o mesmo visual (classe .campo no global.css):
// - Entrada e Selecao: o <input> e o <select> do HTML, já estilizados (aceitam tudo o que os originais aceitam).
// - Campo: rótulo em cima (ou ao lado, com inline) e o campo embaixo; dica opcional.
// - Marcar: caixa de seleção com o texto ao lado.
// - CampoNum e CampoTexto: o valor vale quando o campo perde o foco (ou com Enter); número vazio vira null (a ferramenta
//   volta ao padrão). Com aoDigitar, o número vale a cada tecla, sem reescrever o que está sendo digitado.
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const cls = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ") || undefined;
// Tipos que não levam a caixa de texto (checkbox, rádio, arquivo e slider têm o visual próprio)
const SEM_CAIXA = new Set(["checkbox", "radio", "file", "range", "hidden"]);

export function Entrada({ className, type, ...resto }: InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return <input {...resto} type={type} className={cls(!SEM_CAIXA.has(type ?? "text") && "campo", className)} />;
}

export function Selecao({ className, ...resto }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...resto} className={cls("campo", className)} />;
}

export function AreaTexto({ className, ...resto }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...resto} className={cls("campo", className)} />;
}

export function Campo({ rotulo, dica, inline, className, children, style }:
  { rotulo: ReactNode; dica?: ReactNode; inline?: boolean; className?: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <label className={cls("campo-l", inline && "inline", className)} style={style}>
      <span className="campo-r">{rotulo}</span>
      {children}
      {dica && <small className="campo-d">{dica}</small>}
    </label>
  );
}

export function Marcar({ rotulo, className, style, ...resto }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { rotulo: ReactNode }) {
  return <label className={cls("marcar", className)} style={style}><input type="checkbox" {...resto} />{rotulo}</label>;
}

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

export function CampoNum({ valor, onValor, aoDigitar = false, className, ...resto }: PropsNum) {
  const texto = valor == null || !isFinite(valor) ? "" : String(valor);
  const { rascunho, setRascunho, focado } = useRascunho(texto);
  const valer = (t: string) => {
    const v = t === "" ? null : Number(t);
    onValor(v != null && isFinite(v) ? v : null);
  };
  return (
    <input {...resto} className={cls("campo", className)} type="number" value={rascunho}
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
export function CampoTexto({ valor, onValor, type = "text", className, ...resto }: PropsTexto) {
  const { rascunho, setRascunho, focado } = useRascunho(valor);
  return (
    <input {...resto} className={cls("campo", className)} type={type} value={rascunho}
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
