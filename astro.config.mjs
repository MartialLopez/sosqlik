import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://sosbi.fr',
  output: 'static',
  adapter: cloudflare()
});