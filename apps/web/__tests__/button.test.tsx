import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <Button loading>
        Save
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Please wait...' })).toBeInTheDocument();
  });
});
