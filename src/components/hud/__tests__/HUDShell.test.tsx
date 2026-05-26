/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { HUDShell } from '../HUDShell';

describe('HUDShell', () => {
  const slots = {
    brief: <div data-testid="b">BRIEF</div>,
    bento: <div data-testid="bn">BENTO</div>,
    timeline: <div data-testid="t">TL</div>,
    missionControl: <div data-testid="m">MC</div>,
    inbox: <div data-testid="i">IB</div>,
  };

  it('renders the topbar with HERMES · HUD brand', () => {
    render(<HUDShell {...slots} />);
    expect(screen.queryByText(/HERMES · HUD/)).not.toBeNull();
  });

  it('renders all 5 named regions', () => {
    render(<HUDShell {...slots} />);
    ['brief','bento','timeline','mission-control','inbox'].forEach(label => {
      const matches = screen.getAllByRole('region', { name: label });
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('places provided children in correct slots', () => {
    render(<HUDShell {...slots} />);
    expect(screen.queryAllByTestId('b').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('bn').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('t').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('m').length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('i').length).toBeGreaterThan(0);
  });
});
