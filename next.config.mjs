/** @type {import('next').NextOptions} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Aplica os headers de segurança a todas as rotas do projeto
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY', // Impede que o site seja embutido em iframes (Anti-Clickjacking)
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff', // Impede o navegador de adivinhar o tipo MIME (Anti-MIME-sniffing)
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block', // Proteção contra XSS para navegadores mais antigos
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin', // Controla o vazamento de URLs no referrer
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload', // HSTS: Força HTTPS por 2 anos
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;