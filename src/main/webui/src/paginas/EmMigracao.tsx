// Página que ainda não foi migrada: mostra o título e leva para a mesma página no app atual.
import { useLocation } from "react-router";
import { useTitulo } from "../lib/useTitulo";

export function EmMigracao({ titulo, caminho }: { titulo: string; caminho: string }) {
  useTitulo(titulo);
  const { hash } = useLocation();
  return (
    <div className="panel">
      <h2>{titulo}</h2>
      <div className="hint" style={{ margin: 0 }}>
        Esta página ainda não foi migrada para a versão nova.{" "}
        <a href={caminho + hash}>Abrir {titulo} na versão atual</a>
      </div>
    </div>
  );
}
