import { selectBookableDays } from "@/core/conversation/selectors";
import { MONTHS_SHORT, WEEKDAYS_SHORT, formatDateLong, todayKey, weekdayOf } from "@/core/domain/time";

export default function DatesWidget({ ctx, act }) {
  const today = todayKey(ctx.now);
  return (
    <>
      <div className="date-carousel ios-scroll-momentum">
        {selectBookableDays(ctx).map((key) => {
          const [, month, day] = key.split("-").map(Number);
          return (
            <button
              key={key}
              type="button"
              onClick={() => act({ type: "PICK_DATE", date: key }, formatDateLong(key))}
              className={`date-card select-none touch-manipulation transition-transform active:scale-[0.95] ${
                ctx.draft.dateKey === key ? "selected" : ""
              }`}
            >
              <span>{key === today ? "HOJE" : WEEKDAYS_SHORT[weekdayOf(key)]}</span>
              <b>{day}</b>
              <small>{MONTHS_SHORT[month - 1]}</small>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Deslize para o lado — datas disponíveis nos próximos 6 meses.</p>
    </>
  );
}
