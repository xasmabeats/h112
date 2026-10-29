import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import Metadata from '../src/features/Metadata';
import { DataContext } from '../src/app/context';
import { defaults, newBeat, starters } from '../src/db';
import type { Beat } from '../src/types';

afterEach(cleanup);

function setup(initialEntry = '/metadata') {
  const beat = { ...newBeat(), title: 'Midnight Protocol', artists: 'Chosen Artist' };
  const router = createMemoryRouter([{ path: '/metadata', element: <Metadata /> }], {
    initialEntries: [initialEntry.replace('BEAT_ID', beat.id)],
  });
  const view = (beats: Beat[]) => (
    <DataContext.Provider
      value={{ beats, templates: starters, settings: defaults, notify: vi.fn() }}
    >
      <RouterProvider router={router} />
    </DataContext.Provider>
  );
  const result = render(view([beat]));
  return { beat, refresh: (beats: Beat[]) => result.rerender(view(beats)) };
}

it('generates the selected beat title through an exact accessible textbox label', () => {
  const { beat } = setup();
  expect(screen.queryByLabelText('YouTube video title', { exact: true })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Beat', exact: true }), {
    target: { value: beat.id },
  });
  expect(screen.getByLabelText('YouTube video title', { exact: true })).toHaveValue(
    `Chosen Artist Type Beat — "Midnight Protocol" | Drill ${new Date().getFullYear()}`,
  );
  expect(screen.getByRole('textbox', { name: 'YouTube video title', exact: true })).toBeVisible();
});

it('initializes a beat from its metadata query link and preserves edits on live data refresh', () => {
  const { beat, refresh } = setup('/metadata?beat=BEAT_ID');
  const title = screen.getByRole('textbox', { name: 'YouTube video title', exact: true });
  expect(title).toHaveValue(
    `Chosen Artist Type Beat — "Midnight Protocol" | Drill ${new Date().getFullYear()}`,
  );
  fireEvent.change(title, { target: { value: 'My manual title' } });
  refresh([{ ...beat, status: 'Ready' }]);
  expect(title).toHaveValue('My manual title');
  expect(screen.getByRole('button', { name: 'Save to beat' })).toBeEnabled();
});
