import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./componentes/Layout";
import { EmMigracao } from "./paginas/EmMigracao";
import { PAGINAS } from "./rotas";
import type { Sessao } from "./lib/api";

export function App({ sessao }: { sessao: Sessao }) {
  return (
    <Routes>
      <Route element={<Layout sessao={sessao} />}>
        <Route index element={<Navigate to="/carteira" replace />} />
        {PAGINAS.map(p => (
          <Route key={p.id} path={p.caminho} element={<EmMigracao titulo={p.titulo} caminho={p.caminho} />} />
        ))}
        {/* /projecao virou a ferramenta "Projeção da renda fixa" dentro de /ferramentas */}
        <Route path="/projecao" element={<Navigate to="/ferramentas#renda-fixa" replace />} />
        <Route path="*" element={<Navigate to="/carteira" replace />} />
      </Route>
    </Routes>
  );
}
