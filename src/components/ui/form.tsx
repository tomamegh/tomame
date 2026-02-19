'use client';

import React from 'react';
import { FieldValues, UseFormRegisterReturn } from 'react-hook-form';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  ...props
}) => (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-medium text-stone-700 mb-2">
        {label}
      </label>
    )}
    <input
      className={`w-full px-4 py-2.5 border rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-300 soft-input ${
        error
          ? 'border-red-300 focus:ring-red-400/30'
          : 'border-stone-200/60 hover:border-stone-300'
      } ${className}`}
      {...props}
    />
    {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
  </div>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className = '',
  ...props
}) => (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-medium text-stone-700 mb-2">
        {label}
      </label>
    )}
    <select
      className={`w-full px-4 py-2.5 border rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-300 soft-input ${
        error
          ? 'border-red-300 focus:ring-red-400/30'
          : 'border-stone-200/60 hover:border-stone-300'
      } ${className}`}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
  </div>
);

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  className = '',
  ...props
}) => (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-medium text-stone-700 mb-2">
        {label}
      </label>
    )}
    <textarea
      className={`w-full px-4 py-2.5 border rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rose-400/30 focus:border-rose-300 soft-input ${
        error
          ? 'border-red-300 focus:ring-red-400/30'
          : 'border-stone-200/60 hover:border-stone-300'
      } ${className}`}
      {...props}
    />
    {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
  </div>
);

interface FormFieldProps<T extends FieldValues> {
  label?: string;
  error?: string;
  [key: string]: any;
}

export const FormField: React.FC<FormFieldProps<any>> = ({
  label,
  error,
  ...props
}) => {
  return <Input label={label} error={error} {...props} />;
};
