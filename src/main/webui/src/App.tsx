import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./componentes/Layout";
import { Glossario } from "./paginas/Glossario";
import { Moedas } from "./paginas/Moedas";
import { Bens } from "./paginas/Bens";
import { Custos } from "./paginas/Custos";
import { Ferramentas } from "./paginas/ferramentas/Ferramentas";
import { Carteira } from "./paginas/carteira/Carteira";
import { Ativos } from "./paginas/Ativos";
import { Operacoes } from "./paginas/operacoes/Operacoes";
import { Saude } from "./paginas/saude/Saude";
import { Orcamento } from "./paginas/orcamento/Orcamento";
import { VR } from "./paginas/orcamento/VR";
import { PAGINAS } from "./rotas";
import type { ReactElement } from "react";
import type { Sessao } from "./lib/api";

// Elemento de cada página do menu (rotas.ts)
const PAGINA: Record<string, ReactElement> = {
  carteira: <Carteira />,
  operacoes: <Operacoes />,
  ativos: <Ativos />,
  saude: <Saude />,
  budget: <Orcamento />,
  ferramentas: <Ferramentas />,
  moedas: <Moedas />,
  bens: <Bens />,
  custos: <Custos />,
  glossario: <Glossario />,
};

export function App({ sessao }: { sessao: Sessao }) {
  return (
    <Routes>
      <Route element={<Layout sessao={sessao} />}>
        <Route index element={<Navigate to="/carteira" replace />} />
        {PAGINAS.map(p => (
          <Route key={p.id} path={p.caminho} element={PAGINA[p.id]} />
        ))}
        {/* /projecao virou a ferramenta "Projeção da renda fixa" dentro de /ferramentas */}
        <Route path="/orcamento/vr" element={<VR />} />
        <Route path="/projecao" element={<Navigate to="/ferramentas#renda-fixa" replace />} />
        <Route path="*" element={<Navigate to="/carteira" replace />} />
      </Route>
    </Routes>
  );
}
