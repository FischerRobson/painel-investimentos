// Páginas do app, na ordem do menu. Mesmas URLs do app atual, com o prefixo /novo enquanto os dois convivem.
export type Pagina = {
  id: string;       // id do ícone (o mesmo data-page do app atual)
  caminho: string;  // relativo à base do app
  titulo: string;   // menu e <title>
};

export const PAGINAS: Pagina[] = [
  { id: "carteira", caminho: "/carteira", titulo: "Carteira" },
  { id: "budget", caminho: "/orcamento", titulo: "Orçamento" },
  { id: "ferramentas", caminho: "/ferramentas", titulo: "Ferramentas" },
  { id: "ativos", caminho: "/ativos", titulo: "Ativos" },
  { id: "moedas", caminho: "/moedas", titulo: "Moedas" },
  { id: "bens", caminho: "/bens", titulo: "Bens" },
  { id: "custos", caminho: "/custos", titulo: "Custos" },
  { id: "glossario", caminho: "/glossario", titulo: "Glossário" },
];

export const tituloDaPagina = (titulo: string) => `${titulo} · Meus Investimentos`;
