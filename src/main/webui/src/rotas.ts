// Páginas do app, na ordem do menu (as mesmas URLs da versão 1).
export type Pagina = {
  id: string;       // id do ícone (componentes/icones.tsx)
  caminho: string;  // relativo à base do app
  titulo: string;   // menu e <title>
};

export const PAGINAS: Pagina[] = [
  { id: "carteira", caminho: "/carteira", titulo: "Carteira" },
  { id: "operacoes", caminho: "/operacoes", titulo: "Operações" },
  { id: "saude", caminho: "/saude", titulo: "Saúde" },
  { id: "fechamento", caminho: "/fechamento", titulo: "Fechamento" },
  { id: "budget", caminho: "/orcamento", titulo: "Orçamento" },
  { id: "ferramentas", caminho: "/ferramentas", titulo: "Ferramentas" },
  { id: "ativos", caminho: "/ativos", titulo: "Ativos" },
  { id: "moedas", caminho: "/moedas", titulo: "Moedas" },
  { id: "bens", caminho: "/bens", titulo: "Bens" },
  { id: "custos", caminho: "/custos", titulo: "Custos" },
  { id: "glossario", caminho: "/glossario", titulo: "Glossário" },
];

export const tituloDaPagina = (titulo: string) => `${titulo} · Meus Investimentos`;
