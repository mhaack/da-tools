/* eslint-disable no-underscore-dangle */
/* eslint-disable import/no-unresolved */
import { html, LitElement } from 'da-lit';
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import getStyle from 'https://da.live/nx/public/utils/styles.js';
import {
  setContext,
  getLangsAndLocales,
  populatePageData,
  copyPage,
  publishPages,
} from './index.js';

// Styles
const sl = await getStyle('https://da.live/nx/public/sl/styles.css');
const styles = await getStyle(import.meta.url);

class NxLocales extends LitElement {
  static properties = {
    _langs: { state: true },
    _locales: { state: true },
    _message: { state: true },
    _loading: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
    this.setup();
  }

  async setup() {
    const { message, langs, locales } = await getLangsAndLocales(this.path);
    if (message) {
      this._message = message;
      return;
    }
    this._langs = langs;
    this._locales = locales;

    // Load page data asynchronously after initial render
    this._loading = true;
    this._locales = await populatePageData(locales);
    this._loading = false;
  }

  findInLang(langs) {
    return langs.find((item) => this.path.startsWith(`${item.location}/`));
  }

  flattenLocaleLangs() {
    return this._locales.reduce((acc, locale) => {
      acc.push(...locale.langs);
      return acc;
    }, []);
  }

  findCurrentLang() {
    let found = this.findInLang(this._langs);
    if (!found) {
      const flatLocaleLangs = this.flattenLocaleLangs();
      found = this.findInLang(flatLocaleLangs);
    }
    return found;
  }

  async handleCreate(page) {
    await copyPage(
      `/${this.org}/${this.site}${page.currentPath}`,
      page.newFullPath
    );
    this.actions.setHref(`https://da.live/edit#${page.newFullPath}`);
  }

  async handleOpen(page) {
    this.actions.setHref(`https://da.live/edit#${page.newFullPath}`);
  }

  getPage(lang) {
    const found = this.findCurrentLang();
    if (!found) return;

    const copyFromLocation = found.globalLocation || found.location;
    const copyFromPath = this.path.replace(found.location, copyFromLocation);
    const newPath = this.path.replace(found.location, lang.location);
    const newFullPath = `/${this.org}/${lang.site}${newPath}`;
    const newAEMFullPath = `/${this.org}/${lang.site}/main${newPath}`;

    // eslint-disable-next-line consistent-return
    return {
      ...lang,
      currentPath: copyFromPath,
      newFullPath,
      newPath,
      newAEMFullPath,
    };
  }

  async _copyToClipboard(publishedUrls) {
    const urls = publishedUrls.map((page) => page.resp.live.url);
    if (urls && urls.length > 0) {
      this._message = { text: `${urls.length} page(s) published - Urls copied to clipboard` };
      const type = 'text/plain';
      const clipboardItemData = { [type]: [urls.join('\n')] };
      const clipboardItem = new ClipboardItem(clipboardItemData);
      try {
        await navigator.clipboard.write([clipboardItem]);
      } catch (err) {
        this._message = {
          text: 'Failed to copy URLs to clipboard. Please copy manually.',
        };
      }
    } else {
      this._message = { text: 'No pages published' };
    }
  }

  async handlePublishAll(items) {
    this._message = { text: 'Publishing ...' };
    const publishLangs = items[0].langs
      ? this.flattenLocaleLangs(items)
      : items;
    const pageList = publishLangs
      .filter((lang) => lang.aemStatus)
      .map((lang) => ({ path: this.getPage(lang).newAEMFullPath }));
    const published = await publishPages(pageList);
    if (published) {
      await this._copyToClipboard(
        published.map((page) => page.resp.live.url).join("\n")
      );
    }
    setTimeout(() => {
      this._message = undefined;
    }, 2500);
  }

  async handlePublish(item) {
    this._message = { text: "Publishing ..." };
    const pageList = [{ path: item.newAEMFullPath }];
    const published = await publishPages(pageList);
    if (published) {
      await this._copyToClipboard(
        published.map((page) => page.resp.live.url).join("\n")
      );
    }
    setTimeout(() => {
      this._message = undefined;
    }, 2500);
  }

  renderActionButtons(page, isCurrent) {
    if (isCurrent || !page.status) return "";

    return html`
      ${page.exists
        ? html`<button
            class="publish-button"
            @click=${() => this.handlePublish(page)}
          >
            Publish
          </button>`
        : ""}
      ${page.exists
        ? html`<button
            class="edit-button"
            @click=${() => this.handleOpen(page)}
          >
            Edit
          </button>`
        : html`<button
            class="create-button"
            @click=${() => this.handleCreate(page)}
          >
            Create
          </button>`}
    `;
  }

  // eslint-disable-next-line class-methods-use-this
  renderAEMStatus(page) {
    if (!page.status || !page.exists || !page.aemStatus?.live) return "";
    const aemStatus = page.aemStatus.live;
    return html`
      <div
        title="${aemStatus.status === 200
          ? aemStatus.lastModified
          : "Not published"}"
        class="icon icon-aem ${aemStatus.status
          ? `status-${aemStatus.status}`
          : ""}"
      ></div>
    `;
  }

  renderLocaleLangs(name, langs) {
    return html` <p>${name}</p>
      <div class="locale-lang-list-container">
        <ul class="locale-lang-group-list">
          ${langs.map((lang) => {
            const page = this.getPage(lang);
            const isCurrent =
              page.newPath === this.path && this.site === lang.site;
            return html` <li>
              <p class="${isCurrent ? "current" : ""}">${lang.name}</p>
              <div class="locale-lang-buttons">
                ${this.renderActionButtons(page, isCurrent)}
              </div>
              <div class="locale-lang-aem-status">
                ${this.renderAEMStatus(page)}
              </div>
            </li>`;
          })}
        </ul>
      </div>`;
  }

  renderGroupLang(name, lang) {
    const page = this.getPage(lang);
    const isCurrent = page.newPath === this.path && this.site === lang.site;
    return html` <p class="${isCurrent ? "current" : ""}">${name}</p>
      ${!isCurrent
        ? html`<div class="lang-button">
            <button class="edit-button" @click=${() => this.handleOpen(page)}>
              Edit
            </button>
          </div>`
        : ""}`;
  }

  renderGroup(title, items) {
    return html`
      <div class="lang-group">
        <div class="lang-group-header">
          <p>${title}</p>
          <button @click=${() => this.handlePublishAll(items)}>
            Publish all
          </button>
        </div>
        <ul class="lang-group-list">
          ${items.map(
            (item) => html` <li class="lang-top-list-item">
              ${item.langs
                ? this.renderLocaleLangs(item.name, item.langs)
                : this.renderGroupLang(item.name, item)}
            </li>`
          )}
        </ul>
      </div>
    `;
  }

  renderMessage() {
    return html`<div class="message"><p>${this._message.text}</p></div>`;
  }

  renderAll() {
    return html`
      ${this.renderGroup("Global languages", this._langs)}
      ${this.renderGroup("Locales", this._locales)}
      ${this._message && this.renderMessage()}
    `;
  }

  render() {
    return html`${this._langs && this.renderAll()}`;
  }
}

customElements.define('nx-locales', NxLocales);

(async function init() {
  const { context, token, actions } = await DA_SDK;
  setContext({ ...context, token });

  const nxLocales = document.createElement('nx-locales');
  nxLocales.org = context.org;
  nxLocales.site = context.repo;
  nxLocales.path = context.path;
  nxLocales.actions = actions;

  document.body.append(nxLocales);
}());
