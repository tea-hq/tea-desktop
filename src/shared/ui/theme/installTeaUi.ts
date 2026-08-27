import type { App } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

import { TeaPreset } from './teaPreset'

export function installTeaUi(app: App): void {
  app.use(PrimeVue, {
    ripple: false,
    theme: {
      preset: TeaPreset,
      options: {
        cssLayer: {
          name: 'primevue',
          order: 'theme, base, primevue, components, utilities',
        },
        darkModeSelector: false,
      },
    },
  })
  app.directive('tooltip', Tooltip)
}
