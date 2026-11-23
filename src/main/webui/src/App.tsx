import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./componentes/Layout";
import { EmMigracao } from "./paginas/EmMigracao";
import { Glossario } from "./paginas/Glossario";
import { Moedas } from "./paginas/Moedas";
import { Bens } from "./paginas/Bens";
import { Custos } from "./paginas/Custos";
import { Ferramentas } from "./paginas/ferramentas/Ferramentas";
import { Carteira } from "./paginas/carteira/Carteira";
import { PAGINAS } from "./rotas";
import type { ReactElement } from "react";
import type { Sessao } from "./lib/api";

// Páginas já migradas; as demais mostram o link para a versão atual
const MIGRADAS: Record<string, ReactElement> = {
  carteira: <Carteira />,
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
          <Route key={p.id} path={p.caminho} element={MIGRADAS[p.id] ?? <EmMigracao titulo={p.titulo} caminho={p.caminho} />} />
        ))}
        {/* /projecao virou a ferramenta "Projeção da renda fixa" dentro de /ferramentas */}
        <Route path="/projecao" element={<Navigate to="/ferramentas#renda-fixa" replace />} />
        <Route path="*" element={<Navigate to="/carteira" replace />} />
      </Route>
    </Routes>
  );
}
