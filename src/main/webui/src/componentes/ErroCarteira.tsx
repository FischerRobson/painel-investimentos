// Mesma mensagem do app atual quando /api/carteira falha
export function ErroCarteira({ msg }: { msg: string }) {
  return <div className="panel err">Não consegui carregar seus dados do servidor ({msg}). Recarregue a página em instantes.</div>;
}
