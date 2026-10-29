import { createContext, useContext } from 'react';
import type { Beat, Settings, Template } from '../types';
import { defaults } from '../db';
export const DataContext = createContext<{
  beats: Beat[];
  templates: Template[];
  settings: Settings;
  notify: (text: string) => void;
}>({ beats: [], templates: [], settings: defaults, notify: () => {} });
export const useData = () => useContext(DataContext);
