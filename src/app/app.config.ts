import { APP_INITIALIZER, ApplicationConfig, inject, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { AppConfigService } from './services/app-config.service';

function initConfig(cfg: AppConfigService) {
  return () => cfg.load(); // ensure config loads before Firebase init
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(),

    { provide: APP_INITIALIZER, multi: true, useFactory: () => initConfig(inject(AppConfigService)), deps: [AppConfigService] },

    provideFirebaseApp(() => {
      const config = inject(AppConfigService).config.firebase;
      return initializeApp(config);
    }),

    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
  ]
};
