import ServicesWidget from "./ServicesWidget";
import BarbersWidget from "./BarbersWidget";
import DatesWidget from "./DatesWidget";
import TimesWidget from "./TimesWidget";
import SummaryWidget from "./SummaryWidget";
import ReceiptWidget from "./ReceiptWidget";
import AppointmentsWidget from "./AppointmentsWidget";
import { CatalogWidget, HoursWidget } from "./InfoWidgets";
import { INTERACTIVE_WIDGETS } from "@/core/conversation/states";

/** O widget da mensagem deve aparecer? Interativos só na mensagem ativa; estáticos sempre. */
export function isWidgetLive(message, ctx) {
  if (!message.widget) return false;
  return !INTERACTIVE_WIDGETS.has(message.widget.type) || message.id === ctx.activeWidgetId;
}

/**
 * Despachante de widgets.
 * - Interativos (services/barbers/dates/times/summary/appointments) dependem do estado vivo e
 *   só aparecem na mensagem "ativa" (ctx.activeWidgetId). Mensagens antigas ficam sem o widget,
 *   então é impossível clicar em um cartão obsoleto.
 * - Estáticos (catalogView/hours/receipt) carregam os próprios dados na mensagem.
 */
export default function Widget({ message, ctx, act }) {
  if (!isWidgetLive(message, ctx)) return null;
  const { widget } = message;

  switch (widget.type) {
    case "services": return <ServicesWidget ctx={ctx} act={act} />;
    case "barbers": return <BarbersWidget ctx={ctx} act={act} />;
    case "dates": return <DatesWidget ctx={ctx} act={act} />;
    case "times": return <TimesWidget ctx={ctx} act={act} />;
    case "summary": return <SummaryWidget ctx={ctx} act={act} />;
    case "appointments": return <AppointmentsWidget ctx={ctx} act={act} />;
    case "receipt": return <ReceiptWidget summary={widget.summary} client={ctx.client} />;
    case "catalogView": return <CatalogWidget services={widget.services} />;
    case "hours": return <HoursWidget rows={widget.rows} />;
    default: return null;
  }
}
