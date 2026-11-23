// Abas da página Orçamento: o orçamento do mês e o VR (cartões de benefício, controlados como conta)
import { NavLink } from "react-router";

export function AbasOrcamento() {
  return (
    <nav className="seg abas" aria-label="Orçamento ou VR">
      <NavLink to="/orcamento" end className={({ isActive }) => isActive ? "on" : undefined}>Orçamento</NavLink>
      <NavLink to="/orcamento/vr" className={({ isActive }) => isActive ? "on" : undefined}>VR</NavLink>
    </nav>
  );
}
