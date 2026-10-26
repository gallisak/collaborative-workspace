import type { ComponentProps } from 'react';
import { Input } from './input';
import { Label } from './label';

interface FormFieldProps extends ComponentProps<typeof Input> {
  id: string;
  label: string;
  error?: string;
}

export function FormField({ id, label, error, ...input }: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
