"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Check,
  ChevronLeft,
  Clock3,
  Image as ImageIcon,
  Scissors,
  Send,
  X,
} from "lucide-react";
import { BARBERS, SERVICES, SHOP_NAME } from "@/lib/data";
import {
  buildDays,
  formatDate,
  formatPrice,
  generateSlots,
  toDateKey,
} from "@/lib/schedule";
import {
  getBookedTimes,
  getCatalog,
  saveAppointment,
} from "@/lib/appointments";
import { supabase } from "@/lib/supabase";

const emptyDraft = {
  name: "",
  phone: "",
  services: [],
  barber: null,
  date: null,
  time: null,
};

const isSelected = (services, service) =>
  services.some((item) => item.id === service.id);

function Picture({ name, image, className = "" }) {
  return image ? (
    <img src={image} alt={name} className={`object-cover ${className}`} />
  ) : (
    <div
      className={`grid place-items-center border border-zinc-700 bg-zinc-800 text-red-500 ${className}`}
    >
      <ImageIcon size={24} />
    </div>
  );
}

export default function ChatbotShell() {
  const [step, setStep] = useState("name");
  const [draft, setDraft] = useState(emptyDraft);
  const [input, setInput] = useState("");
  const [isReturningUser, setIsReturningUser] = useState(false);

  // Estados para gerenciar o modal de "Meus Cortes"
  const [showAppointmentsModal, setShowAppointmentsModal] = useState(false);
  const [clientAppointments, setClientAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [modalNotice, setModalNotice] = useState("");

  const [catalog, setCatalog] = useState(
    supabase
      ? { services: [], barbers: [], links: [] }
      : { services: SERVICES, barbers: BARBERS, links: [] },
  );
  const [booked, setBooked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const days = buildDays(0, 180);

  const update = (values) =>
    setDraft((previous) => ({ ...previous, ...values }));

  useEffect(() => {
    const savedName = localStorage.getItem("jm_client_name");
    const savedPhone = localStorage.getItem("jm_client_phone");

    if (savedName && savedPhone) {
      setDraft((prev) => ({
        ...prev,
        name: savedName,
        phone: savedPhone,
      }));
      setIsReturningUser(true);
      setStep("service");
    }
  }, []);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch((exception) => setError(exception.message));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [step, error]);

  const eligibleBarbers = catalog.barbers.filter(
    (barber) =>
      draft.services.length > 0 &&
      draft.services.every((service) => {
        if (!catalog.links.length)
          return (
            !service.williamOnly || barber.name.toLowerCase() === "william"
          );
        return catalog.links.some(
          (link) =>
            link.service_id === service.id && link.barber_id === barber.id,
        );
      }),
  );

  const toggleService = (service) =>
    update({
      services: isSelected(draft.services, service)
        ? draft.services.filter((item) => item.id !== service.id)
        : [...draft.services, service],
      barber: null,
      date: null,
      time: null,
    });

  const advance = async () => {
    setError("");

    if (step === "name") {
      if (!input.trim()) return setError("Digite seu nome para continuar.");
      const trimmedName = input.trim();
      update({ name: trimmedName });
      localStorage.setItem("jm_client_name", trimmedName);
      setInput("");
      return setStep("phone");
    }

    if (step === "phone") {
      if (input.replace(/\D/g, "").length < 10)
        return setError("Informe um WhatsApp válido, com DDD.");
      const trimmedPhone = input.trim();
      update({ phone: trimmedPhone });
      localStorage.setItem("jm_client_phone", trimmedPhone);
      setInput("");
      return setStep("service");
    }

    if (step === "service") {
      if (!draft.services.length)
        return setError("Selecione pelo menos um serviço.");
      return setStep("barber");
    }

    if (step === "barber") {
      if (!draft.barber) return setError("Selecione um barbeiro.");
      return setStep("date");
    }

    if (step === "date") {
      if (!draft.date) return setError("Selecione uma data.");
      setBusy(true);
      try {
        setBooked(await getBookedTimes(draft.barber.id, draft.date));
        setStep("time");
      } catch (exception) {
        setError(exception.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step === "time") {
      if (!draft.time) return setError("Selecione um horário.");
      return setStep("summary");
    }

    if (step === "summary") {
      setBusy(true);
      try {
        await saveAppointment(draft);
        setStep("success");
      } catch (exception) {
        setError(`Não foi possível concluir: ${exception.message}`);
      } finally {
        setBusy(false);
      }
    }
  };

  const goBack = () => {
    const previous = {
      phone: "name",
      service: "phone",
      barber: "service",
      date: "barber",
      time: "date",
      summary: "time",
    };
    if (previous[step]) {
      setError("");
      setStep(previous[step]);
    }
  };

  const allSlotsBooked =
    step === "time" &&
    generateSlots(draft.date).length > 0 &&
    generateSlots(draft.date).every((time) => booked.has(time));

  const serviceNames = draft.services
    .map((service) => service.name)
    .join(" + ");

  const handleOpenMyAppointments = async () => {
    const phone = localStorage.getItem("jm_client_phone") || draft.phone;
    const name = localStorage.getItem("jm_client_name") || draft.name;

    setShowAppointmentsModal(true);
    setModalNotice("");
    setClientAppointments([]);

    if (!phone) {
      setModalNotice(
        "Você ainda não concluiu nenhum agendamento neste dispositivo para termos seu histórico registrado.",
      );
      return;
    }

    setLoadingAppointments(true);
    try {
      if (supabase) {
        const cleanPhone = phone.replace(/\D/g, "");

        const { data, error: sbError } = await supabase
          .from("appointments")
          .select(
            `
            *,
            services (name)
          `,
          )
          .or(`client_phone.eq.${phone},client_phone.eq.${cleanPhone}`)
          .order("appointment_date", { ascending: false });

        if (sbError) throw sbError;

        setClientAppointments(data || []);
        if (!data || data.length === 0) {
          setModalNotice(
            `Olá ${name || ""}, não encontramos agendamentos para o WhatsApp ${phone}.`,
          );
        }
      } else {
        setModalNotice("Cliente do Supabase não configurado.");
      }
    } catch (err) {
      console.error("Erro detalhado do Supabase:", err);
      setModalNotice("Erro ao buscar seus agendamentos. Tente novamente.");
    } finally {
      setLoadingAppointments(false);
    }
  };

  return (
    <section className="w-full max-w-md h-dvh flex flex-col bg-zinc-950 text-white shadow-2xl overflow-hidden relative">
      <header className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-red-600 grid place-items-center shadow-lg shadow-red-600/30">
            <Scissors size={19} />
          </div>
          <div>
            <h1 className="font-semibold text-sm">{SHOP_NAME}</h1>
            <p className="text-xs text-zinc-400">Assistente Vitual · online</p>
          </div>
        </div>

        <button
          onClick={handleOpenMyAppointments}
          title="Ver meus agendamentos"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white text-xs font-semibold shadow-lg shadow-red-600/30 hover:brightness-110 active:scale-95 transition-all border border-red-500/40 animate-pulse"
        >
          <Calendar size={15} />
          <span>Meus cortes</span>
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
      >
        {isReturningUser ? (
          <Bot>
            Olá, bem-vindo de volta! Quais serviços você deseja agendar hoje,{" "}
            <b>{draft.name}</b>?
          </Bot>
        ) : (
          <>
            <Bot>
              Olá! 👋 Bem-vindo ao <b>JM Barberclub</b>. Vamos encontrar o
              melhor horário para você.
            </Bot>

            <Bot>Como podemos te chamar?</Bot>
            {draft.name && step !== "name" && (
              <>
                <UserBubble>{draft.name}</UserBubble>
                <Bot>
                  Prazer, <b>{draft.name}</b>! Qual é seu WhatsApp com DDD?
                </Bot>
              </>
            )}

            {draft.phone && step !== "name" && step !== "phone" && (
              <>
                <UserBubble>{draft.phone}</UserBubble>
                <Bot>
                  Quais serviços você deseja? Você pode marcar mais de um.
                </Bot>
              </>
            )}
          </>
        )}

        {step === "service" && (
          <Bot>
            {catalog.services.length ? (
              <div className="service-list">
                {catalog.services.map((service) => {
                  const selected = isSelected(draft.services, service);
                  return (
                    <button
                      key={service.id}
                      onClick={() => toggleService(service)}
                      className={`service-card ${selected ? "selected" : ""}`}
                    >
                      <Picture
                        name={service.name}
                        image={service.image}
                        className="service-photo"
                      />
                      <span>
                        <b>{service.name}</b>
                        <small>
                          {formatPrice(service.price)} · {service.duration} min
                        </small>
                      </span>
                      <span className="selection-dot" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-amber-200">
                Nenhum serviço foi encontrado no Supabase. Cadastre os serviços
                e libere a leitura (RLS) para a chave anônima.
              </p>
            )}
          </Bot>
        )}

        {draft.services.length > 0 &&
          !["name", "phone", "service"].includes(step) && (
            <>
              <UserBubble>{serviceNames}</UserBubble>
              <Bot>Com qual barbeiro você prefere agendar?</Bot>
            </>
          )}

        {step === "barber" && (
          <Bot>
            <div className="grid grid-cols-2 gap-3">
              {catalog.barbers.map((barber) => {
                const unavailable = !eligibleBarbers.some(
                  (item) => item.id === barber.id,
                );
                const selected = draft.barber?.id === barber.id;
                return (
                  <button
                    key={barber.id}
                    disabled={unavailable}
                    onClick={() => update({ barber })}
                    className={`barber-card ${selected ? "selected" : ""}`}
                  >
                    <Picture
                      name={barber.name}
                      image={barber.image}
                      className="barber-photo"
                    />
                    <b>{barber.name}</b>
                  </button>
                );
              })}
            </div>
          </Bot>
        )}

        {draft.barber &&
          !["name", "phone", "service", "barber"].includes(step) && (
            <>
              <UserBubble>{draft.barber.name}</UserBubble>
              <Bot>SELECIONE O DIA E HORÁRIO:</Bot>
            </>
          )}

        {step === "date" && (
          <Bot>
            <div className="date-carousel">
              {days.map((date, index) => {
                const selected =
                  draft.date && toDateKey(draft.date) === toDateKey(date);
                return (
                  <button
                    key={toDateKey(date)}
                    onClick={() => update({ date, time: null })}
                    className={`date-card ${selected ? "selected" : ""}`}
                  >
                    <span>
                      {index === 0
                        ? "HOJE"
                        : ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][
                            date.getDay()
                          ]}
                    </span>
                    <b>{date.getDate()}</b>
                    <small>
                      {
                        [
                          "JAN",
                          "FEV",
                          "MAR",
                          "ABR",
                          "MAI",
                          "JUN",
                          "JUL",
                          "AGO",
                          "SET",
                          "OUT",
                          "NOV",
                          "DEZ",
                        ][date.getMonth()]
                      }
                    </small>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Deslize para o lado: há datas disponíveis para os próximos 180
              dias.
            </p>
          </Bot>
        )}

        {draft.date &&
          !["name", "phone", "service", "barber", "date"].includes(step) && (
            <UserBubble>{formatDate(draft.date)}</UserBubble>
          )}

        {step === "time" && (
          <Bot>
            <p className="mb-3 flex items-center gap-1.5 text-xs text-zinc-400">
              <Clock3 size={15} /> Horários para {formatDate(draft.date)}
            </p>
            {busy ? (
              <p className="text-zinc-400">Consultando disponibilidade...</p>
            ) : allSlotsBooked ? (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
                Todos os horários deste dia já estão reservados. Volte e escolha
                outra data.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {generateSlots(draft.date).map((time) => {
                  const isBooked = booked.has(time);
                  const selected = draft.time === time;
                  return (
                    <button
                      key={time}
                      disabled={isBooked}
                      onClick={() => update({ time })}
                      className={`time-button ${selected ? "selected" : ""}`}
                    >
                      {isBooked ? "Ocupado" : time}
                    </button>
                  );
                })}
              </div>
            )}
          </Bot>
        )}

        {draft.time &&
          !["name", "phone", "service", "barber", "date", "time"].includes(
            step,
          ) && <UserBubble>{draft.time}</UserBubble>}

        {step === "summary" && (
          <Bot>
            <p className="font-semibold mb-3">Confira seu agendamento</p>
            <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-3 space-y-2 text-sm">
              <p>
                <b>Serviços:</b> {serviceNames}
              </p>
              <p>
                <b>Barbeiro:</b> {draft.barber.name}
              </p>
              <p>
                <b>Data:</b> {formatDate(draft.date)} às {draft.time}
              </p>
            </div>
          </Bot>
        )}

        {step === "success" && (
          <Bot>
            <div className="text-center py-2">
              <span className="mx-auto mb-3 h-12 w-12 rounded-full bg-green-500/15 text-green-400 grid place-items-center">
                <Check />
              </span>
              <h2 className="font-semibold">Agendamento confirmado!</h2>
              <p className="mt-1 text-sm text-zinc-300">
                {serviceNames} com {draft.barber.name}
                <br />
                {formatDate(draft.date)} às {draft.time}
              </p>
              <button
                onClick={() => {
                  setDraft({
                    ...emptyDraft,
                    name: localStorage.getItem("jm_client_name") || "",
                    phone: localStorage.getItem("jm_client_phone") || "",
                  });
                  setIsReturningUser(true);
                  setInput("");
                  setStep("service");
                }}
                className="action-button mt-4"
              >
                Novo agendamento
              </button>
            </div>
          </Bot>
        )}

        {error && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}
      </div>

      {step !== "success" && (
        <footer className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {["name", "phone"].includes(step) ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && advance()}
                placeholder={
                  step === "name" ? "Digite seu nome" : "(00) 00000-0000"
                }
                className="flex-1 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-blue-500 text-white"
              />
              <button onClick={advance} className="send-button">
                <Send size={17} />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={goBack} className="back-button">
                <ChevronLeft size={17} /> Voltar
              </button>
              <button
                disabled={busy || allSlotsBooked}
                onClick={advance}
                className="action-button"
              >
                {busy
                  ? "Enviando..."
                  : step === "summary"
                    ? "Confirmar"
                    : "Enviar"}{" "}
                <Send size={15} />
              </button>
            </div>
          )}
        </footer>
      )}

      {/* MODAL PROFISSIONAL PARA "MEUS CORTES" */}
      {showAppointmentsModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/50">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-red-600/20 text-red-500 grid place-items-center">
                  <Calendar size={18} />
                </div>
                <h3 className="font-semibold text-sm">Meus Agendamentos</h3>
              </div>
              <button
                onClick={() => setShowAppointmentsModal(false)}
                className="h-8 w-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white grid place-items-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {loadingAppointments ? (
                <div className="py-12 text-center text-zinc-400 text-xs animate-pulse">
                  Buscando seus agendamentos...
                </div>
              ) : modalNotice ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-center text-zinc-400 text-xs leading-relaxed">
                  {modalNotice}
                </div>
              ) : clientAppointments.length === 0 ? (
                <div className="py-10 text-center text-zinc-500 text-xs">
                  Nenhum agendamento encontrado.
                </div>
              ) : (
                clientAppointments.map((item, idx) => {
                  const resolvedBarberName =
                    item.barber_name ||
                    catalog.barbers.find((b) => b.id === item.barber_id)
                      ?.name ||
                    "Profissional";

                  return (
                    <div
                      key={idx}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-2 text-xs"
                    >
                      <div className="flex justify-between items-center text-zinc-400">
                        <span>
                          Data:{" "}
                          {new Date(item.appointment_date).toLocaleDateString(
                            "pt-BR",
                          )}
                        </span>
                        <span className="text-red-400 font-semibold">
                          {new Date(item.appointment_date).toLocaleTimeString(
                            "pt-BR",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </span>
                      </div>
                      <p className="font-medium text-white">
                        {item.services?.name || "Serviço de barbearia"}
                      </p>
                      <p className="text-zinc-400">
                        Barbeiro: {resolvedBarberName}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-950/50">
              <button
                onClick={() => setShowAppointmentsModal(false)}
                className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Bot({ children }) {
  return (
    <div className="flex items-start gap-2">
      <div className="h-8 w-8 shrink-0 rounded-full bg-red-600 grid place-items-center">
        <Scissors size={14} />
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-zinc-800 bg-zinc-900 p-3 text-sm leading-relaxed text-zinc-200">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm font-medium text-white">
        {children}
      </div>
    </div>
  );
}
