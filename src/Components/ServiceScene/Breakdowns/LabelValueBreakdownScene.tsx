import {
  PanelBuilders,
  SceneComponentProps,
  SceneCSSGridLayout,
  SceneDataProvider,
  SceneFlexItem,
  SceneFlexLayout,
  sceneGraph,
  SceneObjectBase,
  SceneObjectState,
  SceneReactObject,
} from '@grafana/scenes';
import { LayoutSwitcher } from './LayoutSwitcher';
import { getLabelValue } from './SortByScene';
import { DrawStyle, LoadingPlaceholder, StackingMode } from '@grafana/ui';
import { getQueryRunner, setLeverColorOverrides } from '../../../services/panel';
import { getSortByPreference } from '../../../services/store';
import { LoadingState, ReducerID } from '@grafana/data';
import { ByFrameRepeater } from './ByFrameRepeater';
import { getFilterBreakdownValueScene } from '../../../services/fields';
import {
  ALL_VARIABLE_VALUE,
  getLabelGroupByVariable,
  getLogsStreamSelector,
  LEVEL_VARIABLE_VALUE,
  VAR_LABEL_GROUP_BY_EXPR,
  VAR_LABELS,
} from '../../../services/variables';
import React from 'react';
import { LABEL_BREAKDOWN_GRID_TEMPLATE_COLUMNS, LabelBreakdownScene } from './LabelBreakdownScene';
import { buildDataQuery } from '../../../services/query';
import { navigateToDrilldownPage } from '../../../services/navigate';
import { PageSlugs } from '../../../services/routing';
import { ServiceScene } from '../ServiceScene';

export interface LabelValueBreakdownSceneState extends SceneObjectState {
  body?: LayoutSwitcher;
  $data?: SceneDataProvider;
}

export class LabelValueBreakdownScene extends SceneObjectBase<LabelValueBreakdownSceneState> {
  constructor(state: Partial<LabelValueBreakdownSceneState>) {
    super({
      ...state,
    });

    this.addActivationHandler(this.onActivate.bind(this));
  }

  onActivate() {
    this.setState({
      body: this.build(),
      $data: getQueryRunner([this.buildQuery()]),
    });

    const groupByVariable = getLabelGroupByVariable(this);
    this._subs.add(
      groupByVariable.subscribeToState((newState, prevState) => {
        if (newState.value === ALL_VARIABLE_VALUE) {
          this.setState({
            $data: undefined,
            body: undefined,
          });
        }
      })
    );

    // This is only triggered when the filters are updated, or the time range changes
    this.state.$data?.subscribeToState((newState, prevState) => {
      if (newState.data?.state === LoadingState.Done) {
        this.setState({
          body: this.build(),
        });
        // No panels for the user to select, presumably because everything has been excluded
        if (!newState.data.series.length) {
          navigateToDrilldownPage(PageSlugs.labels, sceneGraph.getAncestor(this, ServiceScene));
        }
      }
    });
  }

  private buildQuery() {
    const variable = getLabelGroupByVariable(this);
    let labelExpressionToAdd = '';
    let structuredMetadataToAdd = '';

    if (variable.state.value && variable.state.value !== LEVEL_VARIABLE_VALUE) {
      labelExpressionToAdd = ` ,${variable.state.value} != ""`;
    } else if (variable.state.value && variable.state.value === LEVEL_VARIABLE_VALUE) {
      structuredMetadataToAdd = ` | ${variable.state.value} != ""`;
    }

    return buildDataQuery(
      `sum(count_over_time(${getLogsStreamSelector({
        labelExpressionToAdd,
        structuredMetadataToAdd,
      })} [$__auto])) by (${VAR_LABEL_GROUP_BY_EXPR})`,
      { legendFormat: `{{${VAR_LABEL_GROUP_BY_EXPR}}}`, refId: 'LABEL_BREAKDOWN_VALUES' }
    );
  }

  private build(): LayoutSwitcher {
    const variable = getLabelGroupByVariable(this);
    const variableState = variable.state;
    const labelBreakdownScene = sceneGraph.getAncestor(this, LabelBreakdownScene);
    const tagKey = String(variableState?.value);

    let bodyOpts = PanelBuilders.timeseries();
    bodyOpts = bodyOpts
      .setCustomFieldConfig('stacking', { mode: StackingMode.Normal })
      .setCustomFieldConfig('fillOpacity', 100)
      .setCustomFieldConfig('lineWidth', 0)
      .setCustomFieldConfig('pointSize', 0)
      .setCustomFieldConfig('drawStyle', DrawStyle.Bars)
      .setOverrides(setLeverColorOverrides)
      .setTitle(tagKey);

    const body = bodyOpts.build();
    const { sortBy, direction } = getSortByPreference('labels', ReducerID.stdDev, 'desc');

    const getFilter = () => labelBreakdownScene.state.search.state.filter ?? '';

    return new LayoutSwitcher({
      options: [
        { value: 'single', label: 'Single' },
        { value: 'grid', label: 'Grid' },
        { value: 'rows', label: 'Rows' },
      ],
      active: 'grid',
      layouts: [
        new SceneFlexLayout({
          direction: 'column',
          children: [
            new SceneFlexItem({
              minHeight: 300,
              body,
            }),
          ],
        }),
        new ByFrameRepeater({
          body: new SceneCSSGridLayout({
            isLazy: true,
            templateColumns: LABEL_BREAKDOWN_GRID_TEMPLATE_COLUMNS,
            autoRows: '200px',
            children: [
              new SceneFlexItem({
                body: new SceneReactObject({
                  reactNode: <LoadingPlaceholder text="Loading..." />,
                }),
              }),
            ],
          }),
          getLayoutChild: getFilterBreakdownValueScene(getLabelValue, DrawStyle.Bars, VAR_LABELS),
          sortBy,
          direction,
          getFilter,
        }),
        new ByFrameRepeater({
          body: new SceneCSSGridLayout({
            templateColumns: '1fr',
            autoRows: '200px',
            children: [
              new SceneFlexItem({
                body: new SceneReactObject({
                  reactNode: <LoadingPlaceholder text="Loading..." />,
                }),
              }),
            ],
          }),
          getLayoutChild: getFilterBreakdownValueScene(getLabelValue, DrawStyle.Bars, VAR_LABELS),
          sortBy,
          direction,
          getFilter,
        }),
      ],
    });
  }

  public static Selector({ model }: SceneComponentProps<LabelValueBreakdownScene>) {
    const { body } = model.useState();
    return <>{body && <body.Selector model={body} />}</>;
  }

  public static Component = ({ model }: SceneComponentProps<LabelValueBreakdownScene>) => {
    const { body } = model.useState();
    if (body) {
      return <>{body && <body.Component model={body} />}</>;
    }

    return <LoadingPlaceholder text={'Loading...'} />;
  };
}
