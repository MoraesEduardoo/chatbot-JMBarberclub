"use client";

import DatesWidget from "./DatesWidget";

/**
 * TimesWidget:
 * Unificado diretamente com o componente de Datas para garantir
 * que o cliente sempre tenha a visão completa e contínua do dia e dos horários.
 * Se o usuário trocar de dia ou precisar selecionar outro horário, o carrossel
 * e a grade respondem juntos sem etapas desconexas.
 */
export default function TimesWidget(props) {
  return <DatesWidget {...props} />;
}
