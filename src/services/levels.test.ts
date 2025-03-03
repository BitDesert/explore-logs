import { SeriesVisibilityChangeMode } from '@grafana/ui';
import { getLabelsFromSeries, getVisibleLevels, toggleLevelFromFilter, toggleLevelVisibility } from './levels';
import { AdHocVariableFilter, FieldType, toDataFrame } from '@grafana/data';
import { getLevelsVariable, VAR_LEVELS } from './variables';
import { AdHocFiltersVariable, SceneObject } from '@grafana/scenes';
import { FilterOp } from './filters';
import { addToFilters, replaceFilter } from 'Components/ServiceScene/Breakdowns/AddToFiltersButton';

jest.mock('./variables');
jest.mock('Components/ServiceScene/Breakdowns/AddToFiltersButton');

const ALL_LEVELS = ['logs', 'debug', 'info', 'warn', 'error', 'crit'];

describe('toggleLevelVisibility', () => {
  describe('Visibility mode toggle selection', () => {
    it('adds the level', () => {
      expect(toggleLevelVisibility('error', [], SeriesVisibilityChangeMode.ToggleSelection, ALL_LEVELS)).toEqual([
        'error',
      ]);
      expect(toggleLevelVisibility('error', undefined, SeriesVisibilityChangeMode.ToggleSelection, ALL_LEVELS)).toEqual(
        ['error']
      );
    });
    it('adds the level if the filter was not empty', () => {
      expect(
        toggleLevelVisibility('error', ['info', 'debug'], SeriesVisibilityChangeMode.ToggleSelection, ALL_LEVELS)
      ).toEqual(['error']);
    });
    it('removes the level if the filter contained only the same level', () => {
      expect(toggleLevelVisibility('error', ['error'], SeriesVisibilityChangeMode.ToggleSelection, ALL_LEVELS)).toEqual(
        []
      );
    });
  });
  describe('Visibility mode append to selection', () => {
    it('appends the label to other levels', () => {
      expect(
        toggleLevelVisibility('error', ['info'], SeriesVisibilityChangeMode.AppendToSelection, ALL_LEVELS)
      ).toEqual(['info', 'error']);
    });
    it('removes the label if already present', () => {
      expect(
        toggleLevelVisibility('error', ['info', 'error'], SeriesVisibilityChangeMode.AppendToSelection, ALL_LEVELS)
      ).toEqual(['info']);
    });
    it('appends all levels except the provided level if the filter was previously empty', () => {
      const allButError = ALL_LEVELS.filter((level) => level !== 'error');
      expect(toggleLevelVisibility('error', [], SeriesVisibilityChangeMode.AppendToSelection, ALL_LEVELS)).toEqual(
        allButError
      );
      expect(
        toggleLevelVisibility('error', undefined, SeriesVisibilityChangeMode.AppendToSelection, ALL_LEVELS)
      ).toEqual(allButError);
    });
  });
});

describe('getLabelsFromSeries', () => {
  const series = [
    toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [0] },
        {
          name: 'Value',
          type: FieldType.number,
          values: [1],
          labels: {
            detected_level: 'error',
          },
        },
      ],
    }),
    toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [0] },
        {
          name: 'Value',
          type: FieldType.number,
          values: [1],
          labels: {
            detected_level: 'warn',
          },
        },
      ],
    }),
    toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [0] },
        {
          name: 'Value',
          type: FieldType.number,
          values: [1],
          labels: {},
        },
      ],
    }),
  ];
  it('returns the label value from time series', () => {
    expect(getLabelsFromSeries(series)).toEqual(['error', 'warn', 'logs']);
  });
});

describe('getVisibleLevels', () => {
  const scene = {} as SceneObject;
  function setup(filters: AdHocVariableFilter[]) {
    const levelsVariable = new AdHocFiltersVariable({
      name: VAR_LEVELS,
      filters,
    });
    jest.mocked(getLevelsVariable).mockReturnValue(levelsVariable);
  }

  it('Returns an empty array when everything is empty', () => {
    setup([]);
    expect(getVisibleLevels([], scene)).toEqual([]);
  });

  it('Returns all levels when there are no filters', () => {
    setup([]);
    expect(getVisibleLevels(['error', 'info'], scene)).toEqual(['error', 'info']);
  });

  it('Removes negatively filtered levels', () => {
    setup([
      {
        key: 'detected_level',
        operator: FilterOp.NotEqual,
        value: 'error',
      },
    ]);
    expect(getVisibleLevels(['error', 'info'], scene)).toEqual(['info']);
  });

  it('Returns the positive levels from the filters', () => {
    setup([
      {
        key: 'detected_level',
        operator: FilterOp.NotEqual,
        value: 'error',
      },
      {
        key: 'detected_level',
        operator: FilterOp.NotEqual,
        value: 'warn',
      },
      {
        key: 'detected_level',
        operator: FilterOp.Equal,
        value: 'info',
      },
    ]);
    expect(getVisibleLevels(['info'], scene)).toEqual(['info']);
  });

  it('Filters the levels by the current filters', () => {
    setup([
      {
        key: 'detected_level',
        operator: FilterOp.NotEqual,
        value: 'error',
      },
      {
        key: 'detected_level',
        operator: FilterOp.NotEqual,
        value: 'warn',
      },
      {
        key: 'detected_level',
        operator: FilterOp.Equal,
        value: 'info',
      },
    ]);
    expect(getVisibleLevels(['error', 'warn', 'info', 'debug'], scene)).toEqual(['info']);
  });
});

describe('toggleLevelFromFilter', () => {
  const scene = {} as SceneObject;
  function setup(filters: AdHocVariableFilter[]) {
    const levelsVariable = new AdHocFiltersVariable({
      name: VAR_LEVELS,
      filters,
    });
    jest.mocked(getLevelsVariable).mockReturnValue(levelsVariable);
  }

  beforeEach(() => {
    jest.mocked(replaceFilter).mockClear();
    jest.mocked(addToFilters).mockClear();
  });

  it('Sets the filter when it is empty', () => {
    setup([]);

    expect(toggleLevelFromFilter('info', scene)).toBe('add');
    expect(replaceFilter).toHaveBeenCalledTimes(1);
  });

  it('Overwrites the filter if exists with a different value', () => {
    setup([{ key: 'detected_level', operator: FilterOp.Equal, value: 'error' }]);

    expect(toggleLevelFromFilter('info', scene)).toBe('add');
    expect(replaceFilter).toHaveBeenCalledTimes(1);
  });

  it('Toggles it off if the filter with the same value exists', () => {
    setup([{ key: 'detected_level', operator: FilterOp.Equal, value: 'info' }]);

    expect(toggleLevelFromFilter('info', scene)).toBe('remove');
    expect(addToFilters).toHaveBeenCalledTimes(1);
  });
});
