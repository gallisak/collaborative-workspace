export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string | undefined>;
  success?: string;
  limitReached?: boolean;
}

export const initialFormState: FormState = {};
