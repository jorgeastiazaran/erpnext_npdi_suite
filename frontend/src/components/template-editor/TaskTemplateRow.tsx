import React from 'react';

export const durationToDisplay = (days: number) => {
  return `${days} days`;
};

export const durationInputTodays = (input: number, unit: string) => {
  if (unit === 'weeks') return input * 7;
  if (unit === 'months') return input * 30;
  return input;
};

export default function TaskTemplateRow(props: any) {
  return <div>TaskTemplateRow</div>;
}
