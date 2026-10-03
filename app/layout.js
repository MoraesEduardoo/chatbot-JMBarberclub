import "./globals.css";

export const metadata = {
  title: "JM Barberclub | Agendamento",
  description: "Agende seu horário no JM Barberclub.",
  manifest: "/manifest.json", // Adiciona a referência do PWA aqui de forma nativa
};

// viewportFit + interactiveWidget fazem o layout respeitar a área segura do
// celular (barra de gestos) e, principalmente, fazem o conteúdo ENCOLHER
// quando o teclado abre — em vez de o teclado só sobrepor a página. É isso
// que mantém a caixa de resposta grudada em cima do teclado, feito um chat.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}