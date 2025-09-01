import { html, LitElement, nothing } from 'da-lit';
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import getStyle from 'https://da.live/nx/public/utils/styles.js';
import { setContext, getLangsAndLocales, getPage, copyPage, publishPages } from './index.js';

// NX Base
const nx = `${new URL(import.meta.url).origin}/nx`;

// Styles
const sl = await getStyle('https://da.live/nx/public/sl/styles.css');
const styles = await getStyle(import.meta.url);

class NxLocales extends LitElement {
  static properties = {
    _langs: { state: true },
    _locales: { state: true },
    _message: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
    this.setup();
  }

  async setup() {
    const { message, langs, locales } = await getLangsAndLocales();
    if (message) {
      this._message = message;
      return;
    }
    this._langs = langs;
    this._locales = locales;
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


  async handleOpen(page) {
    const exists = await getPage(page.newFullPath);
    if (!exists) await copyPage(page.currentPath, page.newFullPath);
    this.actions.setHref(`https://da.live/edit#${page.newFullPath}`);
  }

  getPage(lang) {
    const found = this.findCurrentLang();
    if (!found) return;

    const copyFromLocation = found.globalLocation || found.location;
    const copyFromPath = this.path.replace(found.location, copyFromLocation);
    const newPath = this.path.replace(found.location, lang.location);
    const newSite = lang.site || `/${this.site}`;
    const newFullPath = `/${this.org}${newSite}${newPath}`;


    return { currentPath: copyFromPath, newFullPath, newPath };
    // const exists = await getPage(newFullPath);
    // if (!exists) await copyPage(`/${this.org}/${this.site}${copyFromPath}`, newFullPath);
    // this.actions.setHref(`https://da.live/edit#${newFullPath}`);
  }



  async handlePublish(items) {
    this._message = { text: 'Publishing banner' };
    const found = this.findCurrentLang();
    const publishLangs = items[0].langs ? this.flattenLocaleLangs(items) : items;
    const pageList = publishLangs.map((lang) => ({ path: `${this.path.replace(found.location, lang.location)}` }));
    await publishPages(pageList);
    this._message = undefined;
  }

  renderLocaleLangs(name,langs) {
    return html`
    <p>${name}</p>
    <div class="locale-lang-list-container">
      <ul class="locale-lang-group-list">
        ${langs.map((lang) => {
          const page = this.getPage(lang);
          return html`
          <li>
            <p class="${page.newPath === this.path && this.site === lang.site.substring(1) ? 'current' : ''}>${lang.name}</p>
            <button @click=${() => this.handleOpen(page)}>Edit</button>
          </li>`;
        })}
      </ul>
    </div>`;
  }

  renderGroupLang(name,lang) {
    const page = this.getPage(lang);
    return html`
    <p class="${page.newPath === this.path && this.site === lang.site.substring(1) ? 'current' : ''}">${name}</p>
    <div class="lang-button"><button @click=${() => this.handleOpen(page)}>Edit</button></div>`;
  }

  renderGroup(title, items) {
    return html`
      <div class="lang-group">
        <div class="lang-group-header">
          <p>${title}</p>
          <button @click=${() => this.handlePublish(items)}>Publish all</button>
        </div>
        <ul class="lang-group-list">${items.map((item) => html`
          <li class="lang-top-list-item">
            ${item.langs ? this.renderLocaleLangs(item.name,item.langs) : this.renderGroupLang(item.name,item)}
          </li>`)}
        </ul>
      </div>
    `;
  }

  renderMessage() {
    return html`<div class="message"><p>${this._message.text}</p></div>`;
  }

  renderAll() {
    return html`
      ${this.renderGroup('Global languages', this._langs)}
      ${this.renderGroup('Locales', this._locales)}
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
