import "./globals.css";

export const metadata = {
  title: "JM Barberclub | Agendamento",
  description: "Chatbot interativo de agendamento online para a barbearia JM Barberclub.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JM Barber",
  },
  formatDetection: {
    telephone: false, // Previne que o Safari no iOS converta preços e códigos automaticamente em links azuis indesejados
  },
  icons: {
    icon: "/icons/logo-192.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "JM Barberclub | Agendamento",
    description: "Chatbot interativo de agendamento online para a barbearia JM Barberclub.",
  },
};

// viewportFit=cover + interactiveWidget: resizes-content respeitam o Notch e a Dynamic Island no iPhone
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#09090b",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}