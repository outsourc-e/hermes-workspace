/** @vitest-environment jsdom */
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { HUDShell } from '../HUDShell';

describe('HUDShell', () => {
  afterEach(() => cleanup());

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
      expect(screen.getByRole('region', { name: label })).toBeTruthy();
    });
  });

  it('places provided children in correct slots', () => {
    render(<HUDShell {...slots} />);
    expect(screen.getByTestId('b')).toBeTruthy();
    expect(screen.getByTestId('bn')).toBeTruthy();
    expect(screen.getByTestId('t')).toBeTruthy();
    expect(screen.getByTestId('m')).toBeTruthy();
    expect(screen.getByTestId('i')).toBeTruthy();
  });
});
