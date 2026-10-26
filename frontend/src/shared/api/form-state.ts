export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string | undefined>;
  success?: string;
}

export const initialFormState: FormState = {};
