import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { TimelyApp } from '../components/timely-app';
import { configureStateStorage } from '../hooks/use-local-storage-state';
import { createQueuedStorage } from '../lib/repository/queued-storage';
import '../app/globals.css';
import './mobile.css';

if (Capacitor.isNativePlatform()) {
  configureStateStorage(createQueuedStorage({
    getItem: async key => (await Preferences.get({ key })).value,
    setItem: async (key, value) => Preferences.set({ key, value })
  }));
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><TimelyApp /></React.StrictMode>);
