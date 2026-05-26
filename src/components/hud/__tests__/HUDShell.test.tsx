/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HUDShell } from '../HUDShell';

describe('HUDShell', () => {
  it('renders the topbar with HERMES · HUD brand', () => {
    render(<HUDShell>{null}</HUDShell>);
    expect(screen.getByText(/HERMES · HUD/)).not.toBeNull();
  });

  it('renders 5 region containers by role landmark', () => {
    render(<HUDShell>{null}</HUDShell>);
    const regions = screen.getAllByRole('region');
    expect(regions.length).toBeGreaterThanOrEqual(5);
  });
});
