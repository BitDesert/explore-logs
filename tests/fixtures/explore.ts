import type { Page, Locator } from '@playwright/test';
import pluginJson from '../../src/plugin.json';
import { testIds } from '../../src/services/testIds';
import {expect} from "@grafana/plugin-e2e";

export class ExplorePage {
  private readonly firstServicePageSelect: Locator;
  logVolumeGraph: Locator;
  servicesSearch: Locator;
  serviceBreakdownSearch: Locator;
  serviceBreakdownOpenExplore: Locator;
  refreshPicker: Locator;

  constructor(public readonly page: Page) {
    this.firstServicePageSelect = this.page.getByText('Select').first();
    this.logVolumeGraph = this.page.getByText('Log volume');
    this.servicesSearch = this.page.getByTestId(testIds.exploreServiceSearch.search);
    this.serviceBreakdownSearch = this.page.getByTestId(testIds.exploreServiceDetails.searchLogs);
    this.serviceBreakdownOpenExplore = this.page.getByTestId(testIds.exploreServiceDetails.openExplore);
    this.refreshPicker = this.page.getByTestId(testIds.header.refreshPicker)
  }

  async gotoServices() {
    await this.page.goto(`/a/${pluginJson.id}/explore`);
  }

  async addServiceName() {
    await this.firstServicePageSelect.click();
  }

  async scrollToBottom() {
    const main = this.page.locator('main#pageContent')

    // Scroll the page container to the bottom
    await main.evaluate((main) => main.scrollTo(0, main.scrollHeight));
  }

  async assertFieldsIndex() {
    // Assert the fields tab is active
    expect(await this.page.getByTestId('data-testid tab-fields').getAttribute('aria-selected')).toEqual('true')
    // Assert the all option is selected
    await expect(this.page.getByText('FieldAll')).toBeVisible()
  }

  //@todo pull service from url if not in params
  async gotoServicesBreakdown() {
    await this.page.goto(
      `/a/${pluginJson.id}/explore/service/tempo-distributor/logs?mode=service_details&patterns=[]&var-filters=service_name|=|tempo-distributor&var-logsFormat= | logfmt`
    );
  }
}
