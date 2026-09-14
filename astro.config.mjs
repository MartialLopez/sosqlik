import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://sosqlik.fr',
  output: 'static',
  adapter: cloudflare()
});