import { PageSlugs, ValueSlugs } from '../../services/routing';
import { LogsListScene } from './LogsListScene';
import { testIds } from '../../services/testIds';
import { buildLabelValuesBreakdownActionScene, LabelBreakdownScene } from './Breakdowns/LabelBreakdownScene';
import { FieldsBreakdownScene } from './Breakdowns/FieldsBreakdownScene';
import { PatternsBreakdownScene } from './Breakdowns/Patterns/PatternsBreakdownScene';
import { SceneFlexItem, SceneFlexLayout, SceneObject } from '@grafana/scenes';
import { LogsVolumePanel } from './LogsVolumePanel';

interface ValueBreakdownViewDefinition {
  displayName: string;
  value: ValueSlugs;
  testId: string;
  getScene: (value: string) => SceneObject;
}

export interface BreakdownViewDefinition {
  displayName: string;
  value: PageSlugs;
  testId: string;
  getScene: (changeFields: (f: string[]) => void) => SceneObject;
}

export const breakdownViewsDefinitions: BreakdownViewDefinition[] = [
  {
    displayName: 'Logs',
    value: PageSlugs.logs,
    getScene: () => buildLogsListScene(),
    testId: testIds.exploreServiceDetails.tabLogs,
  },
  {
    displayName: 'Labels',
    value: PageSlugs.labels,
    getScene: () => buildLabelBreakdownActionScene(),
    testId: testIds.exploreServiceDetails.tabLabels,
  },
  {
    displayName: 'Fields',
    value: PageSlugs.fields,
    getScene: (f) => buildFieldsBreakdownActionScene(f),
    testId: testIds.exploreServiceDetails.tabFields,
  },
  {
    displayName: 'Patterns',
    value: PageSlugs.patterns,
    getScene: () => buildPatternsScene(),
    testId: testIds.exploreServiceDetails.tabPatterns,
  },
];
export const valueBreakdownViews: ValueBreakdownViewDefinition[] = [
  {
    displayName: 'Label',
    value: ValueSlugs.label,
    getScene: (value: string) => buildLabelValuesBreakdownActionScene(value),
    testId: testIds.exploreServiceDetails.tabLabels,
  },
  {
    displayName: 'Field',
    value: ValueSlugs.field,
    getScene: (value: string) => buildFieldValuesBreakdownActionScene(value),
    testId: testIds.exploreServiceDetails.tabFields,
  },
];

function buildPatternsScene() {
  return new SceneFlexLayout({
    children: [
      new SceneFlexItem({
        body: new PatternsBreakdownScene({}),
      }),
    ],
  });
}

function buildFieldsBreakdownActionScene(changeFieldNumber: (n: string[]) => void) {
  return new SceneFlexLayout({
    children: [
      new SceneFlexItem({
        body: new FieldsBreakdownScene({ changeFields: changeFieldNumber }),
      }),
    ],
  });
}

function buildFieldValuesBreakdownActionScene(value: string) {
  return new SceneFlexLayout({
    children: [
      new SceneFlexItem({
        body: new FieldsBreakdownScene({ value }),
      }),
    ],
  });
}

function buildLogsListScene() {
  return new SceneFlexLayout({
    direction: 'column',
    children: [
      new SceneFlexItem({
        minHeight: 200,
        body: new LogsVolumePanel({}),
      }),
      new SceneFlexItem({
        minHeight: '470px',
        height: 'calc(100vh - 500px)',
        body: new LogsListScene({}),
      }),
    ],
  });
}

function buildLabelBreakdownActionScene() {
  return new SceneFlexLayout({
    children: [
      new SceneFlexItem({
        body: new LabelBreakdownScene({}),
      }),
    ],
  });
}
