// Um <canvas> com um gráfico do Chart.js. A configuração é montada a cada render do gráfico (as cores vêm dos tokens CSS),
// e o gráfico é recriado quando `deps` muda ou quando o tema claro/escuro do sistema troca.
import { useEffect, useRef, useState } from "react";
import { Chart, type ChartConfiguration } from "chart.js";

export function Grafico({ config, deps, rotulo }: {
  config: (canvas: HTMLCanvasElement) => ChartConfiguration<"line"> | ChartConfiguration<"bar"> | null;
  deps: unknown[];
  rotulo?: string; // aria-label do canvas
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tema = useTema();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cfg = config(canvas);
    if (!cfg) return;
    const ch = new Chart(canvas, cfg as ChartConfiguration);
    return () => ch.destroy();
    // recria só quando os dados (deps) ou o tema mudam; config é uma função nova a cada render
  }, [...deps, tema]);
  return <canvas ref={ref} aria-label={rotulo} />;
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
