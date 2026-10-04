import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app.component';
import { setLoggingEnabled } from './core/logger';

setLoggingEnabled(isDevMode());

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
