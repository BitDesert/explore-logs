import { DetectedLabel } from './fields';
import { ALL_VARIABLE_VALUE, LEVEL_VARIABLE_VALUE } from './variables';
import { VariableValueOption } from '@grafana/scenes';

export enum FilterOp {
  Equal = '=',
  NotEqual = '!=',
}

// We want to show labels with cardinality 1 at the end of the list because they are less useful
// And then we want to sort by cardinality - from lowest to highest
export function sortLabelsByCardinality(a: DetectedLabel, b: DetectedLabel) {
  if (a.cardinality === 1) {
    return 1;
  }
  if (b.cardinality === 1) {
    return -1;
  }
  return a.cardinality - b.cardinality;
}

// Creates label options by taking all labels and if LEVEL_VARIABLE_VALUE is not in the list, it is added at the beginning.
// It also adds 'All' option at the beginning
export function getLabelOptions(labels: string[]) {
  const options = [...labels];
  if (!labels.includes(LEVEL_VARIABLE_VALUE)) {
    options.unshift(LEVEL_VARIABLE_VALUE);
  }
  const labelOptions: VariableValueOption[] = options.map((label) => ({
    label,
    value: String(label),
  }));

  return [{ label: 'All', value: ALL_VARIABLE_VALUE }, ...labelOptions];
}
