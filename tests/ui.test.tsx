import { afterEach, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DataContext } from '../src/app/context';
import { defaults, newBeat, starters } from '../src/db';
import Dashboard from '../src/features/Dashboard';
import Library from '../src/features/Library';
afterEach(cleanup);
it('shows a useful empty dashboard with actual zero metrics', () => {
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
  expect(screen.getByText('A clean slate, a new sound')).toBeInTheDocument();
  expect(screen.getAllByText('00').length).toBeGreaterThanOrEqual(4);
});
it('searches the rendered library and shows actual beat data', () => {
  const beat = { ...newBeat(), title: 'Midnight Protocol', genre: 'Drill' };
  render(
    <MemoryRouter>
      <DataContext.Provider
        value={{ beats: [beat], settings: defaults, templates: starters, notify: () => {} }}
      >
        <Library />
      </DataContext.Provider>
    </MemoryRouter>,
  );
  expect(screen.getByText('Midnight Protocol')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search beats'), { target: { value: 'other' } });
  expect(screen.queryByText('Midnight Protocol')).not.toBeInTheDocument();
  expect(screen.getByText('No matching beats')).toBeInTheDocument();
});
