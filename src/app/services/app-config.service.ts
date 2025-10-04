import { Injectable } from '@angular/core';
import { AppConfig } from '../models/app-config.model';

@Injectable({
  providedIn: 'root'
})
export class AppConfigService {

  private cfg!: AppConfig;

  get config(): AppConfig {
    if (!this.cfg) throw new Error('Config not loaded yet!');
    return this.cfg;
  }

  async load(): Promise<void> {
    const res = await fetch('/config/app-config.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load /config/app-config.json');
    this.cfg = await res.json() as AppConfig;
  }
}
