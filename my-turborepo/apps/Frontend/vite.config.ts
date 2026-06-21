import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function siteSeoPlugin(): Plugin {
  const siteUrl = process.env.VITE_SITE_URL?.replace(/\/$/, '') ?? ''

  return {
    name: 'site-seo',
    transformIndexHtml(html) {
      if (!siteUrl) {
        return html
          .replace(/<link rel="canonical" href="__SITE_URL__\/" \/>\n?/, '')
          .replace(/<meta property="og:url" content="__SITE_URL__\/" \/>\n?/, '')
          .replace(/<meta property="og:image" content="__SITE_URL__\/logo_icon.png" \/>\n?/, '')
          .replace(/<meta name="twitter:image" content="__SITE_URL__\/logo_icon.png" \/>\n?/, '')
          .replace(/,\s*"url": "__SITE_URL__\/"/, '')
      }
      return html.replaceAll('__SITE_URL__', siteUrl)
    },
    generateBundle() {
      if (!siteUrl) return

      const robots = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`

      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  appType: 'spa',
  plugins: [react(), tailwindcss(), siteSeoPlugin()],
  /** Avoid stale pre-bundles after adding deps (504 "Outdated Optimize Dep" until restart). */
  optimizeDeps: {
    include: ['react-markdown'],
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        ws: true,
      },
    },
  },
})
