// Um <canvas> com um gráfico do Chart.js. A configuração é montada a cada render do gráfico (as cores vêm dos tokens CSS),
// e o gráfico é recriado quando `deps` muda ou quando o tema claro/escuro do sistema troca.
import { useEffect, useRef, useState } from "react";
import { Chart, type ChartConfiguration } from "chart.js";

type Config = ChartConfiguration<"line"> | ChartConfiguration<"bar"> | ChartConfiguration<"doughnut">;

export function Grafico({ config, deps, rotulo, aoCriar, onMouseLeave }: {
  config: (canvas: HTMLCanvasElement) => Config | null;
  deps: unknown[];
  rotulo?: string; // aria-label do canvas
  aoCriar?: (ch: Chart | null) => void; // o gráfico criado (null ao destruir), para a página mexer nele (ex.: destacar uma fatia)
  onMouseLeave?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tema = useTema();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cfg = config(canvas);
    if (!cfg) return;
    const ch = new Chart(canvas, cfg as ChartConfiguration);
    aoCriar?.(ch);
    return () => { aoCriar?.(null); ch.destroy(); };
    // recria só quando os dados (deps) ou o tema mudam; config é uma função nova a cada render
  }, [...deps, tema]);
  return <canvas ref={ref} aria-label={rotulo} onMouseLeave={onMouseLeave} />;
}

// Muda a cada troca de tema do sistema (prefers-color-scheme), para redesenhar com as cores novas
function useTema(): string {
  const [tema, setTema] = useState(() => escuro() ? "escuro" : "claro");
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const fn = () => setTema(mq.matches ? "escuro" : "claro");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return tema;
}
const escuro = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
